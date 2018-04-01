(function () {
'use strict';

const debug = require('debug')('band-map-api'),
  jsyaml = require('js-yaml');

/**
  Band Map API Server Utility Functions
*/

/**
  Error and Warning Handling
*/

let

  /**
    Queued warnings may be sent attached to completed responses in a "warnings"
    field, depending on the response type.
  */
  queueAPIWarning = (
    req,
    statusCode = 500, // API Warning status codes will be returned only if a
                      // warning gets elevated to an error.
    code = 'server-warning',
    msg = 'Unknown server warning.'
    ) => {
    let warnings = req.bandMap ? req.bandMap.warnings || [] : [];
    warnings.push({
      statusCode: statusCode,
      code: code,
      message: msg
    });
  },

  /**
    Errors can be queued before being thrown.  This can be useful in situations
    like input validation where we might want to collect errors until the end
    and wait to inform the user of multiple potential problems with the input.
    at once.
    The errors will appear in order, first queued at the top, and the HTTP
    status code returned will be that of the first error. 
    We also include a 'code' field on errors, separate and more specific than
    the status code, but easier to parse than the full message.
  */
  queueAPIError = (
    req,
    statusCode = 500,
    code = 'server-error',
    msg = 'Unknown server error.'
  ) => {
    let errors = req.bandMap ? req.bandMap.errors || [] : [],
      err = new Error(msg);
    err.code = code;
    err.statusCode = statusCode;
    errors.push(err);
  },

  /**
  Throw queued API errors if there are any, otherwise do nothing.
  We throw the first one, but the error handler will check the queue and return
  them all if there are more, along with warnings.
  */
  throwQueuedAPIErrors = req => {
    let errors = req.bandMap ? req.bandMap.errors || [] : [];
    if (errors.length > 0) {
      throw errors[0];
    }
  },

  throwAPIError = (
    req,
    statusCode = 500,
    code = 'server-error',
    msg = 'Unknown server error.') => {
    queueAPIError(req, statusCode, code, msg);
    throwQueuedAPIErrors(req);
  },

  initAPIErrorHandling = req => {
    req.bandMap = req.bandMap || {};
    req.bandMap.errors = [];
    req.bandMap.warnings = [];
    req.queueAPIWarning = (statusCode, code, msg) =>
      queueAPIWarning(req, statusCode, code, msg);
    req.queueAPIError = (statusCode, code, msg) =>
      queueAPIError(req, statusCode, code, msg);
    req.throwQueuedAPIErrors = () =>
      throwQueuedAPIErrors(req);
    req.throwAPIError = (statusCode, code, msg) =>
      throwAPIError(req, statusCode, code, msg);
  },

  /**
    General Purpose Utilities
  */

  /**
  Type checking.
  */
  isNumeric = val => !isNaN(parseFloat(val)) && isFinite(val),

  isObject = val => toString.call(val) === '[object Object]',

  isMap = val => toString.call(val) === '[object Map]',

  /** Return the last element of the specified array. */
  lastElement = array => array[array.length - 1],

  /**
  Given a dot-delimited pathname like 'bands.people.roles.id',
  return just the name, like 'id'.
  */
  nameFromPath = path => lastElement(path.split('.')),

  /**
  Given an array of dot-delimited pathnames like 'bands.people.roles.id',
  return an array of just the endpoint names, like 'id'.
  */
  namesFromPaths = paths => paths.map(p => nameFromPath(p)),

  /**
  Return a copy of the string array with all elements trimmed and converted
  to lower case.
  */
  elementsToLowerCase = arr => {
    let icArr = [];
    arr.forEach(e => icArr.push(e.toLowerCase().trim()));
    return icArr;
  },

  /**
  Return a shallow copy of the object with all keys converted to lower case.
  */
  keysToLowerCase = obj => {
    let icObj = {},
      objKeys = Object.keys(obj),
      objKeysLen = objKeys.length;
    for (let i = 0; i < objKeysLen; ++i) {
      icObj[objKeys[i].toLowerCase()] = obj[objKeys[i]];
    }
    return icObj;
  },

  /**
  Return an object tree from a list of field:data-type pairs.
  Used to build trees of DB objects and subobjects needed to serve requests.
  For example:
  The field list:
    a.b: integer
    a.c: array
    a.c.d: string
    a.c.e: object
  Returns the tree:
    a:
      c:
        e:
  */
  getObjectTreeFromFieldList = fieldList => {
    let tree = {};
    Object.keys(fieldList).forEach(k => {
      let parts = k.split('.'),
        node = tree;
      parts = parts.slice(0, parts.length-1);
      parts.forEach(part => {
        if (!node.hasOwnProperty(part)) {
          node[part] = {};
        }
        node = node[part];
      });
    });
    return tree;
  },

  getFieldMapFromFieldList = fieldList => {
    let map = {};
    Object.keys(fieldList).forEach(k => {
      let parts = k.split('.'),
        parent = parts.slice(0, parts.length-1).join('.');
      if (parent.length === 0) {
        parent = 'root';
      }
      if (!map.hasOwnProperty(parent)) {
        map[parent] = {};
      }
      map[parent][k] = fieldList[k];
    });
    return map;
  },

  /**
    Given an object tree, return an array of arrays where each inner array
    represents a leaf of the tree.
    This is useful for planning a minimal set of database queries needed to
    fetch just the needed data for each nested object branch without processing
    too many redundant rows.
    For example:
    The tree:
      a:
        b:
          c:
        d:
    Returns the leaves:
      [['a', 'b', 'c'], ['a', 'd']]
  */
  getLeavesFromTree = (node, leaves = [], leaf = []) => {
    let keys = Object.keys(node);
    // Base case: leaf node.  Add to leaves array.
    if (keys.length === 0) {
      leaves.push(leaf.slice());

    // Recursive case: walk the child nodes.
    } else {
      keys.forEach(key => {
        let subPath = leaf.slice();
        subPath.push(key);
        getLeavesFromTree(node[key], leaves, subPath);
      });
    }
    return leaves;
  },

  // Assigns key:val pairs from source object to target object, as long as
  // their key appears in the fieldFilter array.
  assignFieldsWithFilter = (target, source, fieldFilter) => {
    fieldFilter.forEach(f => {
      if (source.hasOwnProperty(f)) {
        target[f] = source[f];
      }
    });
    return target;
  },

  // Assigns key:val pairs from source map to target map, as long as
  // their key appears in the fieldFilter array.
  assignFieldsWithFilterMap = (target, source, fieldFilter) => {
    fieldFilter.forEach(f => {
      if (source.has(f)) {
        target.set(f, source.get(f));
      }
    });
    return target;
  },

  removeEmptyStrings = arr => {
    arr = arr.slice();
    arr.sort();
    let i = arr.indexOf('');
    if (i > -1) {
      arr = arr.slice(arr.indexOf(''), arr.lastIndexOf(''));
    }
    return arr;
  },

  removeAll = (arr, element) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === element) {
        arr.splice(i, 1);
      }
    }
    return arr;
  },

  copyToDepth = (obj, depth) => {
    if (depth === 0) { return 'too deep'; }
    if (Array.isArray(obj)) {
      let cpy = [];
      obj.forEach(function(val) {
        cpy.push(copyToDepth(val, depth-1));
      });
      return cpy;
    } else if (isObject(obj)) {
      let cpy = {};
      Object.keys(obj).forEach(function(key) {
        cpy[key] = copyToDepth(obj[key], depth-1);
      });
      return cpy;
    }
    return obj; // Return primitives as-is.
  },

  deepCopy = obj => {
    if (Array.isArray(obj)) {
      let cpy = [];
      obj.forEach(val => {
        cpy.push(deepCopy(val));
      });
      return cpy;
    } else if (isMap(obj)) {
      let cpy = new Map();
      obj.forEach((v, k) => {
        // Note: Assumes Map keys are "scalar"
        // (strings/ints/non-reference types.)
        cpy.set(k, deepCopy(v));
      });
      return cpy;
    } else if (isObject(obj)) {
      let cpy = {};
      Object.keys(obj).forEach(key => {
        cpy[key] = deepCopy(obj[key]);
      });
      return cpy;
    }
    return obj; // Return primitives as-is.
  },

  /**
    Replace all Maps in Map, array, or object o with objects, recursively.
  */
  mapToObject = value => {
    if (isMap(value)) {
      let o = {};
      value.forEach((v, k) => {
        o[k] = mapToObject(v);
      });
      return o;

    } else if (isObject(value)) {
      let o = {};
      Object.keys(value).forEach(k => {
        o[k] = mapToObject(value[k]);
      });
      return o;

    } else if (Array.isArray(value)) {
      let a = [];
      value.forEach(v => {
        a.push(mapToObject(v));
      });
      return a;
    }

    return value;
  },

  /**
    Replace all undefined values in Map, array, or object with the string
    'undefined' (for debug printing).
  */
  undefinedToString = value => {
    if (isMap(value)) {
      let m = new Map();
      value.forEach((v, k) => {
        m.set(k, undefinedToString(v));
      });
      return m;

    } else if (isObject(value)) {
      let o = {};
      Object.keys(value).forEach(k => {
        o[k] = undefinedToString(value[k]);
      });
      return o;

    } else if (Array.isArray(value)) {
      let a = [];
      value.forEach(v => {
        a.push(undefinedToString(v));
      });
      return a;
    }

    return value === undefined ? 'undefined' : value;
  },

  toYaml = obj =>
    jsyaml.safeDump(
      JSON.parse(JSON.stringify(
        undefinedToString(mapToObject(obj))))),

/**
  Response Writing
*/

  writeJson = (res, payload) => {
    if (isMap(payload) || typeof payload === 'object') {

      payload = JSON.stringify(mapToObject(payload), null, 2);
    }

    res.writeHead(
      res.statusCode,
      {'Content-Type': 'application/json; charset=UTF-8'}
    );
    res.end(payload, 'utf8');
  };

module.exports = {
  initAPIErrorHandling,

  isNumeric,
  isObject,
  isMap,

  lastElement,
  nameFromPath,
  namesFromPaths,
  elementsToLowerCase,
  keysToLowerCase,
  getObjectTreeFromFieldList,
  getFieldMapFromFieldList,
  getLeavesFromTree,
  assignFieldsWithFilter,
  assignFieldsWithFilterMap,
  removeEmptyStrings,
  removeAll,
  copyToDepth,
  deepCopy,
  mapToObject,
  undefinedToString,
  toYaml,
  writeJson
};

})();
