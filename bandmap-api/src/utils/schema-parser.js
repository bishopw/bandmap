(function () {
'use strict';

const debug = require('debug')('band-map-api'),
  utils = require('../utils/utils.js');

/**
  Band Map API Schema Parser

  Takes a request object and returns an object of form:
  {
    fieldMap: <object>,
    fieldList: <object>
  }
  fieldMap is a mapping of fully qualified collection name from the objectTree
  to a map of fully qualified field names that can be returned for that
  collection/subcollection to their "type" or "format" from
  the JSON schema, one of [integer, string, date, array, or object],
  for example in YAML:
    root:
      link: string
      offset: integer
      limit: integer
      total: integer
      bands: array
      bandsCount: integer
      first: string
      prev: string
      next: string
      last: string
    bands:
      bands.id: integer
      bands.link: string
      bands.name: string
      bands.roles: array
      bands.rolesCount: integer
      bands.activeDates: array
    bands.people:
      bands.people.id: integer
      bands.people.link: string
      ...etc...
    ...etc...
  And fieldList is a flattened version of fieldMap, a map of all the
  fully qualified field names that can be returned for this response to their
  "type" or "format", for example again for /bands:
  {
    link: string
    offset: integer
    limit: integer
    ...etc...
    bands.id: integer
    bands.link: string
    bands.name: string
    ...etc...
    bands.people.id: integer
    bands.people.link: string
    ...etc...
    ...etc...
  }

  TODO: These are static structures that can be pre-built for each URL
  from the JSON schema rather than built at runtime while the user is waiting
  for their HTTP response... probably premature optimization for now, but
  something to consider for the future.
*/

  let

  /**
    Return the appropriate success response schema for this request in the
    swagger object and return it.
  */
  getResponseSchema = req => {
    // schema = req['swagger']['operation']['responses']['200']['schema'];
    let swagger = req.swagger || {},
      operationPath = swagger.operationPath || [],
      operationName = operationPath[operationPath.length - 1] || 'default',
      operation = swagger.operation || {},
      responses = operation.responses || {},
      resCodes = {
        'get': ['200'],
        'post': ['201'],
        'patch': ['200', '201'],
        'put': ['200', '201'],
        'delete': ['204'],
        'default': ['200', '201', '204']
      },
      resCodeOrder = resCodes[operationName] || resCodes['default'],
      response = responses[resCodeOrder[0]] ||
        responses[resCodeOrder[1]] ||
        responses[resCodeOrder[2]] ||
        responses[Object.keys(responses)[0]] ||
        {};

    return response.schema || {};
  },

  /**
    Recursively assemble the fields and objects maps from the schema, as
    described at the top of this file.
  */
  parseSchemaLevel = (
    req,
    schema,
    fieldMapRoot,
    fieldMapNode,
    fieldMapNodePrefix,
    path) => {

    Object.keys(schema).forEach(key => {

      // Special case 'warnings' field for delivering http response warnings -
      // it's documented in swagger but it's not subject to normal Band Map
      // object processing.
      if (key === 'warnings') {
        return;
      }

      let val = schema[key],
        fullFieldName = path.length > 0 ? `${path}.${key}` : key,
        type = val.hasOwnProperty('type') ? val.type : undefined;

      if (type === 'string' && val.hasOwnProperty('format')) {
        type = {
          'date': 'date',
          'dateTime': 'dateTime'
        }[val.format] || 'string';
      }

      if (type === undefined) {
        if (val.hasOwnProperty('properties')) {
          // Must be a singular subobject, like city.state.
          type = 'object';
        } else {
          req.throwAPIError(
            500, 'server-error',
            `Schema parser encountered an unknown field type at ` +
            `'${fullFieldName}'.`
          );
        }
      }

      // Only allow one of our recognized types.
      type = {
        'integer': 'integer',
        'number': 'number',
        'string': 'string',
        'date': 'date',
        'dateTime': 'dateTime',
        'array': 'array',
        'object': 'object'
      }[type] || 'string';

      // Recursive case: descend to next nested object level.
      if (['array', 'object'].includes(type) &&
        (val.hasOwnProperty('properties') || 
          (val.hasOwnProperty('items') &&
            val.items.hasOwnProperty('properties')))) {
        let subFieldMapNode = {},
          subSchema =
            val.properties ? val.properties : val.items.properties;

        fieldMapRoot[`${fieldMapNodePrefix}${fullFieldName}`] = subFieldMapNode;
        fieldMapNode[fullFieldName] = type;

        parseSchemaLevel(
          req,
          subSchema,
          fieldMapRoot,
          subFieldMapNode,
          fieldMapNodePrefix,
          fullFieldName);

      // Base case: parse individual field at this object level.
      } else {
        fieldMapNode[fullFieldName] = type;
      }
    });
  },

  parseSchema = (req) => {

    let resourceType = req.bandMap.resourceType;

    // Schema parsing is only necessary for collection and collection item
    // requests.
    if (!(['collection', 'collectionItem'].includes(resourceType))) {
      return {};
    }

    let fieldMapRoot = {},
      fieldMapNode = {},
      fieldList = {},

      rootCollection = req.bandMap.rootCollection,
      fieldMapNodePrefix =
        resourceType === 'collectionItem' ? `${rootCollection}.` : '',
      schema = getResponseSchema(req).properties;

    if (!['collection', 'collectionItem'].includes(resourceType)) {
      req.throwAPIError(
        500, 'server-error',
        `Schema parser does not recognize the resource type '${resourceType}'.`
      );
    }

    // For collections, list the root level fields under 'root'.
    // These fields have no prefix, but fields under the next level (root
    // collection fields) should be prefixed with the collection name.
    if (resourceType === 'collection') {
      fieldMapRoot.root = fieldMapNode;

    // For collection items, list root level fields under root collection name.
    // Root collection fields have no prefix.
    } else {
      fieldMapRoot[rootCollection] = fieldMapNode;
    }

    parseSchemaLevel(
      req,
      schema,
      fieldMapRoot,
      fieldMapNode,
      fieldMapNodePrefix,
      '');

    // Create flat field list from field map.
    Object.keys(fieldMapRoot).forEach(levelKey => {
      let level = fieldMapRoot[levelKey];
      Object.keys(level).forEach(key => {
        fieldList[key] = level[key];
      });
    });

    return ({
      fieldMap: fieldMapRoot,
      fieldList: fieldList
    });
  },

  /**
    Recursively assemble an example response based on the provided swagger
    schema.
  */
  makeExampleFromSchema = schema => {

    // Recursively handle nested objects.
    if (schema.hasOwnProperty('properties')) {
      let example = {};
      schema = schema.properties;
      Object.keys(schema).forEach(function(key) {
        let val = makeExampleFromSchema(schema[key]);
        if (val !== undefined) {
          example[key] = val;
        }
      });
      return example;
    }

    // Recursively handle arrays.
    if (schema.hasOwnProperty('items')) {
      let example = [];
      schema = schema.items;
      if (schema.hasOwnProperty('properties')) {
        let val = makeExampleFromSchema(schema);
        if (val !== undefined) {
          example.push(val);
        }
      }
      return example;
    }

    // Base case: handle "leaf-nodes".

    // If there is an example provided, use it.
    if (schema.hasOwnProperty('example')) {
      return schema.example;
    }

    // Otherwise estimate a reasonable example based on the field type.
    if (schema.hasOwnProperty('type')) {
      let type = schema.type;
      if (type === 'string') {
        if (schema.hasOwnProperty('format')) {
          let format = schema.format;
          if (format === 'date') {
            return '1980-04-20';
          } else if (format.toLowerCase() === 'datetime' ||
            format.toLowerCase() === 'date-time') {
            return '1980-04-20T06:09:00-08:00';
          }
        }
        return 'string';
      } else if (type === 'integer' || type === 'number') {
        return 123;
      } else if (type === 'boolean') {
        return true;
      }
    }

    // Or last resort, if no reasonable example can be inferred,
    // return undefined.
    return undefined;
  },

  /**
    Return an example response for this request based on the swagger schema.
  */
  makeStubResponse = req => {
    let schema = getResponseSchema(req);
    schema = makeExampleFromSchema(schema);
    schema = Object.assign(
      { 
        'note': 'This resource has not been implemented yet.  This is ' +
        'an example response, based on the planned JSON schema for the ' +
        'resource.  It represents what an actual response should eventually ' +
        'look like, but with fake data.'
      },
      schema
    );
    return schema;
  };

module.exports = {
  parseSchema: parseSchema,
  makeStubResponse: makeStubResponse
};

})();
