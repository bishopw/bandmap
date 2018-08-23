(function () {
'use strict';

/**
The object fetcher module decomposes a Band Map request into a series of
queries -- with the help of the field lists, sort config, and filter tree
prepared by band-map-api-handler -- to be performed by the database module.
In a bit more detail, it:

 1) Takes a Band Map request, like /bands/{band}/people/{person}.
 2) Executes "pre-endpoint" queries to ensure the existence of the object
    being addressed (the {person} in the given {band} in the above example).
 3) If the endpoint object or collection exists, prepares the set of database
    queries needed to retrieve the requested information about the objects and
    nested objects, based on the specific fields requested in the ?fields or
    ?no-fields query args, and the supplied filters and sort order.
 4) Executes the queries in parallel with Promise.all().
 5) Returns a Promise whose fulfilled value will be the completed collection
    array or collection item object.
*/

const debug = require('debug')('band-map-api'),

  db = require('../utils/database.js'),
  getOutputFieldName = db.getOutputFieldName,
  cache = require('../utils/cache'),
  tloNames =
    require('../utils/top-level-object-names.js').byNameForm.camelCasePlural,
  utils = require('../utils/utils.js');


let
  getDBRootCollection = req => {
    // Remove trailing '.'
    let dbPrefix = req.bandMap.dbPrefix;
    return db.getSpecialCaseFieldName(
      dbPrefix.substring(0, dbPrefix.length - 1));
  },

  fieldNameFromPath = fieldPath => fieldPath.split('.').pop(),

  getParentObject = dbFieldPath => {
    let pathParts = dbFieldPath.split('.');
    if (db.isCountField(pathParts[pathParts.length - 1])) {
      return dbFieldPath.substr(0, dbFieldPath.length - 5);
    }
    return pathParts.slice(0, pathParts.length-1).join('.');
  },

  getFilterObjects = req => {
    if (req.bandMap.filterTree && req.bandMap.filterTree.objects) {
      return req.bandMap.filterTree.objects;
    }
    return [];
  },

  getSortObjects = req => {
    let sortObjects = [];
    Array.from(Object.keys(req.bandMap.sort)).forEach(sortKey => {
      let sortObjParts = sortKey.split('.'),
        sortObj = sortObjParts.slice(0, sortObjParts.length - 1).join('.');

      // Special case: *Count fields actually need the subobject they count.
      if (db.isCountField(fieldNameFromPath(sortKey))) {
        sortObj = sortKey.substr(0, sortKey.length - 5);
      }

      if (!sortObjects.includes(sortObj)) {
        sortObjects.push(sortObj);
      }
    });
    return sortObjects;
  },

  /**
  Given a list of fully qualified DB field paths, return a copy of the
  list with primary id fields added for any subobject whose *Count field
  was listed on its parent but whose primary id field was not already listed.
  This includes adding a primary id for the root object if 'total' appears
  in the list.
  */
  addAllCountedSubobjectIds = (fieldList, rootCollection) => {
    let allFieldsList = utils.deepCopy(fieldList);
    fieldList.forEach(f => {
      let pObj = getParentObject(f) || (f === 'total') ? rootCollection : '',
        tlo = tloNames[fieldNameFromPath(pObj)];
      if (tlo !== undefined) {
        let pObjId = tlo.primaryId,
          pObjPidPath = `${pObj}.${pObjId}`;
        if (!allFieldsList.includes(pObjPidPath)) {
          allFieldsList.push(pObjPidPath);
        }
      }
    });
    return allFieldsList;
  },

  throwNotFoundError = (req, objectName, objectValue) =>
    req.throwAPIError(
      404, 'not-found',
      `Requested ${objectName} '${objectValue}' not found.`
    ),

  /**
  Recursively collect filter string clauses and bindings for parseFilterTree().
  Note binding values in bindings object and return filter string parts.
  */
  parseFilterNode =
    (node,
    fieldFormat = 'immediate',
    bindings = {}) => {

    let {type, text, bind, children} = node;

    // 'objects' node: skip and proceed to child node.
    if (type === 'objects') {
      return parseFilterNode(children[0], fieldFormat, bindings);

    // 'logicOp' node:
    } else if (type === 'logicOp') {

      // 'not' operator: Negate clauses below this node.
      if (text === 'not') {
        let operand = parseFilterNode(children[0], fieldFormat, bindings);
        return `NOT (${operand})`;

      // 'and' or 'or' operator: Join clauses below this node with operator.
      } else {
        let joinOperator = `) ${text.toUpperCase()} (`, // ') AND ('
          clauses = [];
        for (let i = 0; i < children.length; i++) {
          clauses.push(parseFilterNode(children[i], fieldFormat, bindings));
        }
        return `(${clauses.join(joinOperator)})`;
      }
    }

    // Else 'clause' leaf node:
    // Format field, collect binding value, and return clause.
    let parts = text.split(' '),
      field = parts[0];
    if (fieldFormat === 'immediate') {
      field = fieldNameFromPath(field);
    } else {
      field = getOutputFieldName(field);
    }
    Array.from(Object.keys(bind)).forEach(k => {
      bindings[k] = bind[k];
    });
    return `${field} ${parts.slice(1).join(' ')}`;
  },

  /**
  Reconstructs a filter string and its bindings based on a filter
  tree (see parameter-parser.js for filter tree structure).
  The 'fieldFormat' argument can be either 'immediate' (fields will be named
  like 'id' or 'name') or 'full' (fields will be named 'bands_people__id' or
  'bands_people__name').  Use full for complex query filters.
  Return format:
  {filter: <string>, bind: {b1: <value>, b2: <value>, ...}}
  */
  parseFilterTree = (filterTree, fieldFormat = 'immediate') => {
    let bindings = {},
      filterStr = parseFilterNode(filterTree, fieldFormat, bindings);
    return {filter: filterStr, bind: bindings};
  },

  fetchPreEndpointObject = (req, res, fetched, toFetch) => {
    // Look up the next pre-endpoint object in the 'toFetch' list based on
    // the first filter provided for it.
    let container = toFetch.shift(),
      objectPath = container.objectPath,
      objectPathParts = objectPath.split('.'),
      object = objectPathParts[objectPathParts.length-1],
      targetItem = container.targetItem,
      tlo = tloNames[object],
      primaryId = tlo.primaryId.toLowerCase(),
      primaryIdOutputFieldName =
        db.getOutputFieldName(`${objectPath}.${primaryId}`),
      secondaryId = tlo.secondaryId.toLowerCase(),
      targetItemIsNumeric = utils.isNumeric(targetItem),

      // Get just the primary ID for pre-endpoint queries.
      fields = [primaryId],

      // Heuristic: try the primary id first if the path part looks like a
      // number, then try the secondary id (usually 'name') next.  If the path
      // part is alphanumeric, try in the opposite order.
      idOrder = targetItemIsNumeric ?
        [primaryId, secondaryId] :
        [secondaryId, primaryId];

    return (
      db.get(fetched.concat([{
          objectPath: objectPath,
          fields: fields,
          filters: [{
            filter: `${idOrder[0]} = $b1`,
            bind: { b1: targetItem }
          }],
          limit: 1
        }]))
      )

      // Our heuristic above might be wrong and we try to bind a string value
      // where Sequelize expects an integer.  Sequelize will throw an error,
      // but treat these cases the same as just not getting the sought result.
      .catch(err => {
        return [];
      })

      // Try the backup filter if the first one didn't return anything.
      .then(results => {
        if (results.length === 0) {
          if (idOrder[1] !== undefined) {
            return (
              db.get(fetched.concat([{
                objectPath: objectPath,
                fields: fields,
                filters: [{
                  filter: `${idOrder[1]} = $b1`,
                  bind: { b1: targetItem }
                }],
                limit: 1
              }]))
            )

            .catch(err => {
              return [];
            })

            // Throw a 404 if the backup filter didn't work either.
            .then(results => {
              if (results.length === 0) {
                throwNotFoundError(req, tlo.singular, targetItem);
              }

              // Fetch next nested item/collection using the primary id of the
              // successfully retrieved (by second filter) pre-endpoint object.
              fetched.push({
                objectPath: objectPath,
                fields: fields,
                filters: [{
                  filter: `${primaryId} = $b1`,
                  bind: { b1: results[0][primaryIdOutputFieldName] }
                }],
                results: results
              });
              return fetchNextThing(req, res, fetched, toFetch);
            });

          // Throw a 404 if no such pre-endpoint object was found and there was
          // no backup filter to try.
          } else {
            throwNotFoundError(req, tlo.singular, targetItem);
          }
        }

        // Fetch next nested item/collection using the primary id of the
        // successfully retrieved (by first filter) pre-endpoint object.
        fetched.push({
          objectPath: objectPath,
          fields: fields,
          filters: [{
            filter: `${primaryId} = $b1`,
            bind: { b1: results[0][primaryIdOutputFieldName] }
          }],
          results: results
        });
        return fetchNextThing(req, res, fetched, toFetch);

      });
  },

  /**
  Fetch a filtered, sorted, limited, and offset set of primary ids to use
  for a data query.  Then execute the data fetch with the primary ids.
  */
  fetchFSLIDs = (req, res, fetched, sortObjects, filterObjects) => {

    // Construct a list of needed sort objects with needed sort fields, and
    // the tree of objects from those.
    let sort = req.bandMap.sort,
      neededFields = addAllCountedSubobjectIds(
        Array.from(Object.keys(sort)), req.bandMap.rootCollection),
      types = req.bandMap.fields.types,
      neededTypes = utils.assignFieldsWithFilter({}, types, neededFields),
      neededTypesMap = utils.getFieldMapFromFieldList(neededTypes),
      objectTree = utils.getObjectTreeFromFieldList(neededTypes),
      objectChain = [];

    // Scan down to root collection object in the tree.
    let node = objectTree,
      dbRootCollection = getDBRootCollection(req),
      dbRootCollectionParts = dbRootCollection.split('.'),
      dbRootObjectName = dbRootCollectionParts[dbRootCollectionParts.length-1],
      dbRootObject = tloNames[dbRootObjectName],
      primaryId = dbRootObject.primaryId,
      primaryIdPath = `${dbRootCollection}.${primaryId}`,
      primaryIdPathOutput = db.getOutputFieldName(primaryIdPath);
    dbRootCollectionParts.forEach(p => {
      if (node.hasOwnProperty(p)) {
              node = node[p];
      } else {
        throw new Error(
          'Missing expected root object path while making sort query.');
      }
    });

    // Walk the tree, constructing the chain of object queries node by node.
    // Unlike in fetchData, we will try just appending every node of the tree
    // in one long "leaf" since we need to collect all the fields to sort on in
    // a single query so we're concerned with thoroughness rather than
    // performance/brevity.
    let constructChainFromTree = (node, pathParts) => {
      // Append object chain link for this node, including any requested
      // sort fields.
      let path = pathParts.join('.'),
        fields = [];
      if (neededTypesMap.hasOwnProperty(path)) {
        Object.keys(neededTypesMap[path]).forEach(p => {
          fields.push(fieldNameFromPath(p));
        });
      }
      objectChain.push({
        objectPath: path,
        fields: fields
      });

      // Walk any child nodes.
      let keys = Object.keys(node);
      if (keys.length > 0) {
        keys.forEach(key => {
          constructChainFromTree(node[key], pathParts.concat([key]));
        });
      }
    };
    constructChainFromTree(node, dbRootCollectionParts);

    // For now just add any filters for the root collection node.  We are
    // currently returning 501 Not Implemented for queries with complex object
    // filters and we'll implement complex object filtering later.
    objectChain[0].filters =
      filterObjects.length > 0 ?
      [parseFilterTree(req.bandMap.filterTree, 'immediate')] :
      undefined;

    // Append the final group-by config to apply sorting, grouping, limiting,
    // and offsetting to the final result set.
    objectChain.push({
      groupBy: primaryIdPath,
      sort: sort,
      limit: req.bandMap.params.limit,
      offset: req.bandMap.params.offset
    });

    // Concatenate already-fetched object chain and to-fetch chain.
    objectChain  = fetched.concat(objectChain);

    // Execute FSL query.
    return (
      db.get(objectChain)
      .then(results => {

        // For each result row in order, collect the primary id of the
        // root object.
        let pidOrder = [];
        results.forEach(row => {
          Object.entries(row).forEach(([outputField, value]) => {
            if (outputField === primaryIdPathOutput &&
              !pidOrder.includes(value)) {
              pidOrder.push(value);
            }
          });
        });

        // Append the filtered, sorted, limited root object ids to the object
        // chain then do the data query.
        fetched.push({
          objectPath: getDBRootCollection(req),
          filters: [{
            filter: `${primaryId} = ANY($b1)`,
            bind: { b1: pidOrder }
          }],
          rootObjectOrder: pidOrder,
          results: results
        });

        return fetchData(req, res, fetched);
      })
    );

  },

  excludeIfEmpty = [
    'activeDates'
  ],

  /**
  Convert a DB result tree to a final API collection or subcollection array.
  */
  assembleResult = (
    req, res,
    requestedMap,
    rootPathParts,
    rootResultArray
  ) => {
    let dbToApi = req.bandMap.fields.dbToApi;

    // The DB result tree has two types of nested nodes to walk:
    // arrays (collections/subcollections) and objects (subobjects).

    /** Recursively convert a DB result tree node to a final API subobject. */
    let assembleResultObject = (pathParts, resultObj) => {
        let outObj = {},

          path = pathParts.join('.'),
          nodeMap = requestedMap[path];

        if (nodeMap === undefined) {
          // This path corresponds to an object the user did not request.
          // (Can happen when the user requests 'total' on a root object but
          // no fields on the object itself.)
          return undefined;
        }

        // For each field requested for this object type...
        Object.entries(nodeMap).forEach(([fieldPath, fieldType]) => {
          let fieldName = fieldNameFromPath(fieldPath),
            resultValue = resultObj.get(fieldName),
            outFieldPath = dbToApi[fieldPath],
            outFieldName = fieldNameFromPath(outFieldPath);

          // If this is an array, process the subcollection under it.
          if (fieldType === 'array') {
            // We build collections and subcollections as id:value mappings
            // in the data layer, but return them as arrays, so make sure we
            // have a mapping object here.
            if (utils.isMap(resultValue)) {
              outObj[outFieldName] =
                assembleResultCollection(
                  pathParts.concat([fieldName]),
                  resultValue);

            // If we have no subcollection data...
            // If this is an optional subfield like activeDates, return nothing.
            // Otherwise return an empty array.
            } else if (excludeIfEmpty.indexOf(fieldName) === -1) {
              outObj[outFieldName] = [];
            }

          // If this is an object, and we have the data for it, process the
          // subobject under it.
          } else if (fieldType === 'object') {
            if (utils.isMap(resultValue)) {
              let subObj =
                assembleResultObject(
                  pathParts.concat([fieldName]),
                  resultValue);
              if (subObj !== undefined) {
                outObj[outFieldName] = subObj;
              }
            } // Else if we have no data for this subobject, don't return even
              // the field name.

          // Special base case: If it is a 'link' field,
          // create a link from the id.
          } else if (fieldType === 'string' && fieldName === 'link') {
            let parent = pathParts[pathParts.length-1],
              tlo = tloNames[parent],
              primaryIdName = tlo.primaryId,
              primaryIdValue = resultObj.get(primaryIdName);
            if (primaryIdValue !== undefined) {
              let serverUrl = req.bandMap.serverUrl,
                linkUrl = `${serverUrl}${tlo.resourcePath}/${primaryIdValue}`;
              outObj[outFieldName] = linkUrl;
            }

          // Else base case: it is a normal scalar field.
          // Copy the value retrieved from the database.
          // For Count fields, Postgres or maybe Sequelizer is returning the
          // numbers as strings for whatever reason, so parseInts.
          } else if (resultValue !== undefined) {
            if (fieldType === 'number' || fieldType === 'integer') {
              outObj[outFieldName] = Number.parseInt(resultValue);
            } else {
              outObj[outFieldName] = resultValue;
            }
          }
        });

        return outObj;
      },

      /** Recursively convert a DB result tree node to a final API collection or
      subcollection array. */
      assembleResultCollection = (pathParts, resultCollection) => {
        let outArray = [];

        // Walk the result objects at this result tree node, appending a
        // response object to the output array for each one.
        resultCollection.forEach(resultObj => {
          let outObj = assembleResultObject(pathParts, resultObj);
          if (utils.isObject(outObj)) {
            outArray.push(outObj);
          } // Else if there was no data for this object, don't add an output
            // object for it.
        });

        return outArray;
      };

    // The root output at this layer is always an array.
    return assembleResultCollection(rootPathParts, rootResultArray);
  },

  fetchDataLeaf = (
    req,
    outputToInputFieldParts,
    leafObjectChain,
    resultObjects,
    resultTree,
    useOrder,
    rootObjectOrder
  ) => {

    return (
      db.get(leafObjectChain)
      .then(results => {
        let fieldTypes = req.bandMap.fields.types,
          dbRootObjName = fieldNameFromPath(getDBRootCollection(req));

        // For each result row, accumulate the fetched data onto the relevant
        // object in resultTree.
        // We assume here that columns in result rows are returned in careful
        // order: from outermost container object first to innermost last, with
        // an object id marking each descent to a deeper nested container.
        results.forEach(row => {
          let parent = resultTree,
            lastParentPath;

          Object.entries(row).forEach(([outputField, value]) => {

            // Ignore null data cells.
            if (value === null || value === undefined) {
              return;
            }

            let parts = outputToInputFieldParts[outputField],
              parentPathParts = parts.slice(0, parts.length-1),
              parentPath = parentPathParts.join('.'),
              parentType = fieldTypes[parentPath],
              parentName = parentPathParts[parentPathParts.length-1],
              parentPrimaryId =
                parentName ? tloNames[parentName].primaryId : undefined,
              name = parts[parts.length-1];

            // Special case: add total of the root collection for a top level
            // object at the resultTree root.  Ignore any other root level
            // field.
            if (parentName === undefined) {
              if (name === 'total') {
                resultTree.set(name, value);
              }
              return;
            }

            // If this field has a different path, (for example
            // 'bands_people__id' or 'connections_band1__id')...
            if (parentPath !== lastParentPath) {
              lastParentPath = parentPath;

              // We've moved on to the next subobject's results ('people' or
              // 'band1'). Create a new result entry for the subobject if one
              // does not exist already and descend down to it.

              // If the subobject is part of a collection array ('people'),
              // first descend through the collection array level.
              if ([undefined, 'array'].includes(parentType)) {
                parent.set(parentName, parent.get(parentName) || new Map());
                parent = parent.get(parentName);
                if (name !== parentPrimaryId) {
                  req.throwAPIError(
                    500, 'server-error',
                    `Expected primary id ` +
                    `'${parentPath}.${parentPrimaryId}' but found ` +
                    `'${parts.join('.')}' while ` +
                    `scanning rows returned from database.`
                  );
                }
              }

              // Descend to the subobject itself.
              let subObjectKey =
                parentType === 'object' ?
                  parentName : // The static field name of a single subobject
                               // (like 'band1' in a connection).
                  value; // The primary key of an object in a subcollection.
              if (!parent.has(subObjectKey) ||
                  parent.get(subObjectKey) === undefined) {
                let emptyObj =
                  resultObjects.hasOwnProperty(parentPath) ?
                  utils.deepCopy(resultObjects[parentPath]) :
                  new Map();
                parent.set(subObjectKey, emptyObj);
              }

              parent = parent.get(subObjectKey);
            }

            // If this is the root object and we are using this leaf's results
            // as the final object order, remember the order.
            if (useOrder &&
                parentName === dbRootObjName &&
                name === parentPrimaryId &&
                !rootObjectOrder.includes(value)) {
              rootObjectOrder.push(value);
            }

            // Add the field to the result object only if it was requested.
            if (parent.has(name)) {
              parent.set(name, value);
            }
          });
        });
      })
    );
  },

  extractCountFields = fields => {
    let countFields = {},
      fieldKeys = Array.from(Object.keys(fields));
    fieldKeys.forEach(f => {
      if (db.isCountField(fieldNameFromPath(f))) {
        countFields[f] = fields[f];
        delete fields[f];
      }
    });
    return countFields;
  },

  /**
    Prepares a chain of object configs to send to db.get() in order to retrieve
    all data necessary to fulfill the Band Map request 'req'.
    rootObjectChain is an array of object configs prepared so far (usually for
    pre-endpoint and root collection queries.)
    In addition to the object-config described in database.js, the configs in
    the chain can have the field:

    rootObjectOrder:  Optional ordered array of primary ids of the root objects
                      in a collection if we got one from an FSL query.  The
                      final root objects of the data query will be returned only
                      if they appear in this list and in the order their ids
                      appear in this list.
  */
  fetchData = (req, res, rootObjectChain) => {
    let isCollection =
        ['collection', 'tagCollection'].includes(req.bandMap.resourceType),
      dbRootCollection = getDBRootCollection(req),
      dbRootCollectionParts = dbRootCollection.split('.'),
      dbRootCollectionName = fieldNameFromPath(dbRootCollection),
      dbRootObj = tloNames[dbRootCollectionName],
      dbParentPath =
        dbRootCollectionParts.slice(0,dbRootCollectionParts.length-1).join('.'),
      dbRootTotalField = 'total',
      dbRootTotalPath =
        dbParentPath.length > 0 ?
        `${dbParentPath}.${dbRootTotalField}` :
        dbRootTotalField,
      dbRootCountPath = `${dbRootCollection}Count`,
      dbRootCountField = fieldNameFromPath(dbRootCountPath),
      types = Object.assign({}, req.bandMap.fields.types),
      requestedDB = req.bandMap.fields.requestedDB,
      fetchTypesOutputOrder =
        utils.assignFieldsWithFilter({}, types, requestedDB),
      fetchMapOutputOrder =
        utils.getFieldMapFromFieldList(fetchTypesOutputOrder);

    // Prepare a final list of data fields.  Make sure to include primary
    // IDs on all objects even if they are not requested, including the pre-
    // endpoint query objects, so that we can use them to connect up the
    // result relationships.
    let fetchList = requestedDB.slice(),
      rootPathParts = dbRootCollection.split('.'),
      preEndpointPrimaryFields = [];
    for (let i = 0, len = rootPathParts.length - 1; i < len; i++) {
      let pParts = rootPathParts.slice(0, i+1),
        p = pParts.join('.'),
        pEnd = pParts.pop(),
        tlo = tloNames[pEnd],
        pid = tlo.primaryId,
        fullPID = `${p}.${pid}`;
      types[fullPID] = 'integer'; // TODO: <== Sketchy. Find actual type.
      preEndpointPrimaryFields.push(fullPID);
    }
    fetchList = addAllCountedSubobjectIds(
        preEndpointPrimaryFields.concat(fetchList), req.bandMap.rootCollection);
    let fetchTypes = utils.assignFieldsWithFilter({}, types, fetchList),
      fetchMap = utils.getFieldMapFromFieldList(fetchTypes);

    // Include primary ids as first field for each object, followed by
    // subobject counts, followed by regular data fields.
    let fetchMapKeys = Array.from(Object.keys(fetchMap));
    for (let i = 0, len = fetchMapKeys.length; i < len; i++) {
      let objPath = fetchMapKeys[i],
        objFields = fetchMap[objPath],
        objPathParts = objPath.split('.'),
        objName = objPathParts[objPathParts.length-1],
        tlo = tloNames[objName],
        primaryId = tlo ? tlo.primaryId : undefined,
        fullPrimaryId = primaryId ? `${objPath}.${primaryId}` : undefined,
        pidType =
          fullPrimaryId ?
          objFields[fullPrimaryId] || 'integer' :
          undefined;
      delete objFields[fullPrimaryId];
      let initial = {};
      if (fullPrimaryId) {
        initial[fullPrimaryId] = pidType;
      }
      initial = Object.assign(initial, extractCountFields(fetchTypes));
      fetchMap[objPath] = Object.assign(initial, objFields);
    }

    let 
      objectTree = utils.getObjectTreeFromFieldList(fetchTypes),
      objectLeaves = utils.getLeavesFromTree(objectTree),

      // Construct map from database output field names to input field names.
      outputToInputFieldParts = {};

    for (let i = 0, len = fetchMapKeys.length; i < len; i++) {
      let objPath = fetchMapKeys[i],
        objFields = fetchMap[objPath],
        objFieldKeys = Array.from(Object.keys(objFields)),
        isRootObjInCollection =
          objPath === 'root' ||
          (isCollection && objPath === dbParentPath);

      for (let j = 0, jlen = objFieldKeys.length; j < jlen; j++) {
        let objFieldKey = objFieldKeys[j];
        // Special case: for the root in collections, the root object total
        // is called 'total':
        //                        URL           API Field   DB Field
        // Top level collections: /bands        root.total  bands__count
        // URL subcollections:    /bands/people bands.total bands_people__count
        if (isRootObjInCollection &&
          ([dbRootCountField, dbRootTotalField].includes(objFieldKey))) {
          outputToInputFieldParts[db.getOutputFieldName(dbRootCountField)] =
            dbRootTotalPath.split('.');

        } else {
          outputToInputFieldParts[db.getOutputFieldName(objFieldKey)] =
            objFieldKey.split('.');
        }
      }
    }

    // Result objects will be prepared before the results come back and will
    // hold empty templates for each object type with the fields in the right
    // schema order.  We will use these when creating new return objects
    // because we are not necessarily getting and filling in results in
    // schema order but do want to return properly ordered fields.
    let buildResultObjects = fetchMap => {
      let resultObjects = {};
      Object.keys(fetchMap).forEach(obPath => {
        let resultObjTemplate = resultObjects[obPath] = new Map();
        Object.keys(fetchMap[obPath]).forEach(fieldPath => {
          let f = fieldNameFromPath(fieldPath);
          if (requestedDB.includes(fieldPath)) {
            resultObjTemplate.set(f, undefined);
          }
        });
      });
      return resultObjects;
    };

    let parallelDataFetches = [],

      resultObjects = buildResultObjects(fetchMapOutputOrder),

      // Result tree will be just like the final result collection or
      // collection item except with id:subobject maps for each subcollection
      // field instead of plain arrays.  This is for easier lookup as we fill
      // out the data fields.  We need to use Maps instead of objects because
      // node reorders number type keys (like our object ids) but Maps preserve
      // keys in insertion order.
      resultTree = new Map();

    // For each leaf, prepare an objectChain to query the objects along its
    // path.
    let fieldsQueue = utils.deepCopy(fetchMap),
      // In collection resource requests, get the total object count for the
      // root objects.
      needRootCount = isCollection && requestedDB.includes(dbRootTotalPath),

      needOrdering = true,
      rootObjectOrder = [];

    objectLeaves.forEach(leaf => {

      let leafObjectChain = utils.deepCopy(rootObjectChain),
        objectPath = dbRootCollection.split('.');
      objectPath = objectPath.slice(0, objectPath.length - 1).join('.');

      // Add database query configs for each nested object in this leaf.
      let rootCollectionIndex = leaf.indexOf(dbRootCollectionName);
      for (let i = rootCollectionIndex; i < leaf.length; i++) {

        let currentObject = leaf[i];
        objectPath +=
          objectPath.length > 0 ?
          `.${currentObject}` :
          currentObject;
        objectPath = db.getSpecialCaseFieldName(objectPath);

        let currentObjectChainLink =
          leafObjectChain[leafObjectChain.length - 1];

        // If we already got the root object order from an FSL query, use it
        // as the final ordering.
        if (needOrdering &&
          objectPath === dbRootCollection &&
          currentObjectChainLink.hasOwnProperty('rootObjectOrder')) {
          rootObjectOrder = currentObjectChainLink.rootObjectOrder;
          needOrdering = false;
        }

        // If the root object count was requested:
        if (needRootCount && objectPath === dbRootCollection) {

          // If the root object has a parent container (is a subcollection),
          // add a result object template to its parent to collect the root
          // object total.
          if (rootCollectionIndex > 0) {
            let pObjPath = objectPath.split('.');
            pObjPath = pObjPath.slice(0, pObjPath.length - 1).join('.');
            if (requestedDB.includes(dbRootTotalPath)) {
              resultObjects[pObjPath] = new Map();
              resultObjects[pObjPath].set(dbRootTotalField, undefined);
            }
          }

          // Also be sure to trigger the count on the root collection
          // whether or not it has a parent container.
          currentObjectChainLink.count =
            currentObjectChainLink.filters ? 'filtered' : 'unfiltered';
          needRootCount = false;
        }

        // If we are past the root collection:
        if (objectPath !== dbRootCollection) {

          // Add this object to the object chain.
          currentObjectChainLink = {
            objectPath: objectPath
          };
          leafObjectChain.push(currentObjectChainLink);
        }

        // If there are fields requested for this object:
        if (fieldsQueue.hasOwnProperty(objectPath)) {
          let fqObj = fieldsQueue[objectPath],
            fPaths = Array.from(Object.keys(fqObj));

          currentObjectChainLink.fields = [];

          // For each field on this object:
          for (let j = 0, jlen = fPaths.length; j < jlen; j++) {
            let p = fPaths[j],
              f = fieldNameFromPath(p);

            // Drain all requested data fields onto the earliest object in the
            // earliest objectChain they appear in.
            // Drain relevant Count fields onto the parent object in the
            // objectChain that includes the child object being counted.
            if (db.isCountField(f)) {
              if (i < leaf.length-1) {
                let countObj = f.substr(0, f.length - 5),
                  nextObjPath = db.getSpecialCaseFieldName(
                    objectPath + `.${leaf[i+1]}`),
                  nextObjName = fieldNameFromPath(nextObjPath);
                if (countObj === nextObjName) {
                  currentObjectChainLink.fields.push(f);
                  delete fqObj[p];
                }
              }
            } else {
              currentObjectChainLink.fields.push(f);
              delete fqObj[p];
            }
          }

          if (Object.keys(fqObj).length === 0) {
            delete fieldsQueue[objectPath];
          }
        }
      }

      // If we still need a root object order, append it to the end of the
      // first leaf in the data query.
      let useOrder = false;
      if (needOrdering) {
        let lastChainLink = leafObjectChain[leafObjectChain.length-1];
        lastChainLink.sort = req.bandMap.sort;
        useOrder = true;
        needOrdering = false;
      }

      // Execute chains in parallel with Promise.all(), aggregating result rows
      // into the return structure (collection or collection item) as they come
      // in.
      parallelDataFetches.push(
        fetchDataLeaf(
          req,
          outputToInputFieldParts,
          leafObjectChain,
          resultObjects,
          resultTree,
          useOrder,
          rootObjectOrder
        )
      );
    });

    // After the Promise.all() completes, convert the fully built result
    // structure's primary id maps to simple arrays and return the completed
    // structure.
    return (
      Promise.all(parallelDataFetches)
      .then(() => {

        let total = 0,
          objects = [];
        if (resultTree.size === 0) {

          // Unexpected empty result set.
          if (req.bandMap.params.limit !== 0) {
            let suggestion = '';
            if (req.bandMap.params.offset > 0) {
              suggestion =
                `  An offset of ${req.bandMap.params.offset} was specified.  ` +
                `There may be no more ${dbRootObj.plural} at this offset and a ` +
                `smaller offset may still work.`;
            }
            req.throwAPIError(
              404, 'not-found',
              `No ${dbRootObj.plural} found.${suggestion}`
            );
          }

        // Assemble root collection or collection item from built result
        // objects.
        } else {
          let requested = utils.assignFieldsWithFilter({}, types, requestedDB),
            requestedMap = utils.getFieldMapFromFieldList(requested);

          // Seek through pre-endpoint query objects to the root collection.
          let rootResultNode = resultTree;
          for (let i = 0, len = rootPathParts.length - 1; i < len; i++) {
            let p = rootPathParts[i];
            // Next collection.
            rootResultNode = rootResultNode.get(p);
            // First (should be only) item in collection.
            rootResultNode = Array.from(rootResultNode.values())[0];
          }
          // Collect the root object total if it's here.
          if (rootResultNode.has(dbRootTotalField)) {
            total = Number.parseInt(rootResultNode.get(dbRootTotalField));
          } 
          // Last collection.
          rootResultNode =
            rootResultNode.get(rootPathParts[rootPathParts.length - 1]);

          // Reorder results according to rootObjectOrder.
          rootResultNode =
            utils.assignFieldsWithFilterMap(
              new Map(), rootResultNode, rootObjectOrder);

          objects =
            rootResultNode === undefined ?
              [] :
              assembleResult(
                req, res,
                requestedMap,
                rootPathParts,
                rootResultNode);
          total = total || objects.length;
        }
        return ({total: total, objects: objects});
      })
    );
  },

  fetchCollectionItem = (req, res, fetched) => {
    return fetchData(req, res, fetched);
  },

  fetchCollection = (req, res, fetched) => {
    let dbRootCollection = getDBRootCollection(req),
      sortObjects = getSortObjects(req),
      filterObjects = getFilterObjects(req);

    // If the collection request is 'complex' (if it has filters or sorts on
    // anything other than just the root object), first fetch the filtered,
    // sorted, limited ids of the root objects ('FSL fetch').
    if (filterObjects.length > 1 ||
      (filterObjects.length === 1 && filterObjects[0] !== dbRootCollection)) {
      req.throwAPIError(501, 'not-implemented',
        `Sorry, filtering collections by fields in their subcollections is` +
        `not implemented yet.`
      );
    }

    // TODO: complex filter/sort/limit queries
    // if (sortObjects.length > 1 ||
    //   (sortObjects.length === 1 && sortObjects[0] !== dbRootCollection)) {
    //   return fetchFSLIDs(req, res, fetched, sortObjects, filterObjects);
    // }

    // TODO: remove this commented block once confirmed special case sorting
    // of connections works
    // Convert fully qualified sort field names to immediate field names.
    // let sort = {};
    // Array.from(Object.keys(req.bandMap.sort)).forEach(sKey => {
    //   sort[fieldNameFromPath(sKey)] = req.bandMap.sort[sKey];
    // });

    // Append root collection object config to the object chain using root
    // filter, sort, and limits then proceed with data query for sub-objects.
    fetched.push({
      objectPath: dbRootCollection,
      filters:
        filterObjects.length > 0 ?
        [parseFilterTree(req.bandMap.filterTree, 'immediate')] :
        undefined,
      sort: req.bandMap.sort,
      limit: req.bandMap.params.limit,
      offset: req.bandMap.params.offset
    });

    return fetchData(req, res, fetched);
  },

  fetchNextThing = (req, res, fetched, toFetch) => {
    if (toFetch.length > 0) {
      return fetchPreEndpointObject(req, res, fetched, toFetch);

    } else if (req.bandMap.resourceType === 'collectionItem') {
      return fetchCollectionItem(req, res, fetched);
    } 

    // Else req.bandMap.resourceType === 'collection'.
    return fetchCollection(req, res, fetched);
  },

  fetchObjects = (req, res) => {
    return fetchNextThing(
      req,
      res,
      [],
      utils.deepCopy(req.bandMap.containerChain)
    );
  };

module.exports = {
  fetchObjects: fetchObjects
};

})();
