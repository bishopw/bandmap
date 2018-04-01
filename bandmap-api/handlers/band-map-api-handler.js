(function () {
'use strict';

const debug = require('debug')('band-map-api'),

  db = require('../utils/database.js'),
  tloNames = require('../utils/top-level-object-names.js'),
  utils = require('../utils/utils.js'),

  schemaParser = require('../utils/schema-parser.js'),
  parameterParser = require('../utils/parameter-parser.js'),

  collectionHandler = require('./collection-handler.js'),
  collectionItemHandler = require('./collection-item-handler.js');

let

  /**
    Stub Handler: Return an example response based on the swagger spec.
  */
  stubHandler = {
    handle: (req, res) => {
      res.statusCode = 501;
      return Promise.resolve(schemaParser.makeStubResponse(req));
    }
  },

  /**
    This handler is wired in to the top-level app router in index.js.
    It synchronously (no Promises involved) formats errors from earlier
    handlers, including swagger validation stuff, writes out a JSON error
    object, and closes out the response.
  */
  handleErrors = (err, req, res, next) => { // Have to put the unused fourth arg
                                            // here or connect/express barfs.
    let errors = req.bandMap ? req.bandMap.errors || [] : [],
      warnings = req.bandMap ? req.bandMap.warnings || [] : [];

    if (errors.length > 0) {
      err = errors[0];
    } else {
      errors.push(err);
    }

    let statusCode = err.statusCode || 500;
    res.statusCode = statusCode;

    if (!err.hasOwnProperty('code') || Number.isInteger(err.code)) {
      err.code = 'server-error';
    }

    // Format codes returned by swagger-validator.js into Band Map style.
    err.code = err.code.toLowerCase().replace(/'_'/g, '-');

    let response = {
      errors: []
    };

    errors.forEach(e => {
      response.errors.push({
        code: e.code || 'server-error',
        message: e.message || 'Unknown server error.'
      });
    });

    if (warnings.length > 0) {
      response.warnings = [];
      warnings.forEach(w => {
        response.warnings.push({
          code: w.code || 'server-warning',
          message: w.message || 'Unknown warning.'
        });
      });
    }

    debug(err);
    utils.writeJson(res, response);

  },

  /**
   * Route and handle all Band Map API requests.
   * Returns a response object to be serialized as JSON,
   * or throws an error via next(err) to be handled by handleErrors().
   **/
  handle = (req, res, next) => {

    // Initialize error/warning handling.
    req.bandMap = {};
    utils.initAPIErrorHandling(req);

    let serverUrl = req.headers.host || 'hostname';
    serverUrl = `https://${serverUrl}`; // TODO: autodetect http/https protocol

    let pathName = req._parsedUrl.pathname,
      pathNameParts = pathName.split('/'),
      resourceType = 'unknown',
      endPoint = pathNameParts[pathNameParts.length - 1],
      rootCollection;

    // /docs request: Forward to swagger-ui,js via index.js
    if (pathNameParts.length > 1 && pathNameParts[1] === 'docs') {
      debug('Forwarding /docs request to swagger-ui.');
      return next();
    }

    let startTime = new Date().getTime();
    debug(`${startTime}: Processing request: ${req._parsedUrl.pathname}`);

    /*
    Parse from URL nodes:
    - resourceType:
      'directory' | 'collection' | 'collectionItem' |
      'tagCollection' | 'tagCollectionItem' |
      'unknown'
    - endPoint: 'api' | 'bands' | '{band}' | etc...
    For 'collection and 'collectionItem' requests:
    - rootCollection: 'bands' | 'people' | etc...
    */
    let swagger = req.swagger || {},
      swaggerPaths = Array.from(Object.keys(
        swagger.swaggerObject ? swagger.swaggerObject.paths : {}
      )),
      swaggerParams = swagger.params || {},
      isSwaggerPath = req.swagger ? req.swagger.isSwaggerPath : false,
      lastPartWasACollection = false,
      partsLeft = pathNameParts.slice(),
      directoryEndpoints = ['api', 'locations', 'edit-history'],
      tagCollections = ['info-source-tags'],
      containerChainPath = [],
      containerChain = [], // sequence of container object queries to execute

      /** For a URL like /bands/{band}/..., attempt to create an appropriate
      filter for bands objects based on the {band} value.  Container chain
      entries are of form:
      {
        object: 'bands',
        targetItem: 'band name' || 123
      }
      */
      makeContainerChainEntry = (collectionName, pathPart) => {
        let tlo = tloNames.byNameForm.urlPlural[collectionName],
          swaggerParam = swaggerParams[tlo.urlSingular] || {},
          targetItem = swaggerParam.value || pathPart;
        containerChainPath.push(tlo.camelCasePlural);
        return {
          objectPath:
            db.getSpecialCaseFieldName((containerChainPath.join('.'))),
          targetItem: targetItem
        };
      };

    // Scan across the URL nodes, left to right.
    while (partsLeft.length > 0) {
      let part = partsLeft.shift().trim();
      endPoint = part;
      if (part.length === 0) {
        continue;
      } else if (!lastPartWasACollection &&
        tloNames.byNameForm.urlPlural.hasOwnProperty(endPoint.toLowerCase())) {
        resourceType = tagCollections.includes(part) ?
          'tagCollection' : 'collection';
        rootCollection = part;
        lastPartWasACollection = true;
      } else if (lastPartWasACollection) {
        resourceType = tagCollections.includes(rootCollection) ?
          'tagCollectionItem' : 'collectionItem';
        containerChain.push(makeContainerChainEntry(rootCollection, part));
        lastPartWasACollection = false;
      } else if (directoryEndpoints.includes(part) &&
        pathNameParts.length <= 4 ) {
        resourceType = 'directory';
      } else {
        resourceType = 'unknown';
      }
    }

    if (!isSwaggerPath || resourceType === 'unknown') {
      // No resource by that name.  Try to suggest a better URL.
      let lcEndPoint = endPoint.toLowerCase().trim(),
        suggestion;
      if (pathName === '/') {
        suggestion = `${serverUrl}/api`;

      } else if (endPoint.length > 0 && swaggerPaths.length > 0) {
        for (let i = 0; i < swaggerPaths.length; ++i) {
          let p = swaggerPaths[i],
            lcp = p.toLowerCase();

          // Check for a matching endpoint at a different URL location.
          if (lcp.endsWith(lcEndPoint)) {
            let sUrl = `${serverUrl}/api${p}`;
            if (suggestion === undefined || sUrl.length < suggestion.length) {
              suggestion = sUrl;
            }

          // Check for a collection item URL with a matching root collection.
          } else if (resourceType === 'collectionItem' && rootCollection) {
            let pparts = lcp.split('/'),
              ppLen = pparts.length,
              pCollection = ppLen > 1 ? pparts[ppLen-2] : '';
            if (rootCollection.toLowerCase() === pCollection.toLowerCase()) {
              let pCollectionURLParts = pparts.slice(0, ppLen - 1),
                pcPath = pCollectionURLParts.join('/'),
                pcUrl = `${serverUrl}/api${pcPath}/${endPoint}`;
              if (suggestion === undefined ||
                pcUrl.length < suggestion.length) {
                suggestion = pcUrl;
              }
            }
          }
        }
      }
      suggestion =
        suggestion ?
          `  Did you mean '${suggestion}'?` :
          '';
      req.throwAPIError(404, 'not-found',
        `No resource found for URL '${serverUrl}${pathName}'.${suggestion}`
      );
    }
    if (rootCollection !== undefined) {
      rootCollection =
        tloNames.convert(rootCollection, 'urlPlural', 'camelCasePlural');
    }
    let apiPrefix = resourceType === 'collection' ? `${rootCollection}.` : '';
    // The DB prefix is the fully qualified collection name of the root
    // collection.
    let dbPrefix = '';
    if (containerChain.length > 0) {
      let lastContainer = containerChain[containerChain.length-1];
      dbPrefix = lastContainer.objectPath;
    }
    if (resourceType === 'collection') {
      dbPrefix += dbPrefix.length > 0 ? '.' : '';
      dbPrefix += rootCollection;
    }
    dbPrefix += dbPrefix.length > 0 ? '.' : '';

    /*
    Add a Band Map-specific request attributes object to the request so
    subsequent handlers don't have to keep looking up runtime info about
    the server and request that we've already looked up.
    After preparation, the format should look like, for example:
      errors:        [] or [Error, Error, ...]
      warnings:      [] or ['warning message...', 'warning message...', ...]
      serverUrl:     https://localhost:3000
      pathName:      /api/bands
      pathNameParts: ['', 'api', 'bands']
      endPoint:      'bands'
      resourceType:  collection | collectionItem | ...
      rawParams:     Params as parsed by swagger tools.
      params:        key:value mappings of all parameters, validated and with
                     defaults applied where nothing was specified.  Includes
                     url parameters, like {band} in /bands/{band}
      containerChain: Ordered sequence of containing collections to reach the
                      root collection, with filters for each level, of form:
                      [
                        {object: 'bands', value: <id>, filters: [<filter>...]},
                        ...
                      ]
      rootCollection: 'bands' (camelCasePlural)
      apiPrefix:      Like 'bands.' for collections, '' for collection items
      dbPrefix:       Fully qualified root collection name, plus '.'
      fields:
        apiToDB:     Mapping of all fully qualified field names as they appear
                     in the API layer (request/response) to fully qualified
                     field names as they appear in the DB layer.
        dbToApi:     Reverse of apiToDB.
        types:       DB field names to expected data types.
        map:         Like types but with fields nested under parent object.
        requested:   Array of API field names, subset of all fields requested by
                     the user.
        requestedDB: Like requested, but the DB field name version of fields.
      filterTree:    Filter parse tree for building SQL calls
                     (see parameter-parser.js for structure).
      sort:          Ordered map of fully qualified DB field names to sort
                     order ('asc'|'desc') for sorting.
    */
    Object.assign(req.bandMap, {
      serverUrl: serverUrl,
      pathName: pathName,
      pathNameParts: pathNameParts,
      endPoint: endPoint,
      resourceType: resourceType,
      rawParams: {},
      params: {},
      containerChain: containerChain,
      rootCollection: rootCollection,
      apiPrefix: apiPrefix,
      dbPrefix: dbPrefix,
      fields: {
        apiToDB: undefined,
        dbToApi: undefined,
        types:   undefined,
        map: undefined,
        requested: undefined,
        requestedDB: undefined,
        needed: undefined
      },
      filterTree: undefined,
      sort: []
    });

    // Do extra parameter parsing and preparation needed for collections and
    // collection items.
    if (['collection', 'collectionItem'].includes(resourceType)) {

      // Prepare Fields.
      // Parse available fields from the JSON schema.
      let {
        fieldList
      } = schemaParser.parseSchema(req);

      // Parse parameters and requested fields and validate against JSON schema.
      let fieldListKeys = Array.from(Object.keys(fieldList)),
        icFieldListKeys = utils.elementsToLowerCase(fieldListKeys),
        {rawParams, params, requestedFields} =
          parameterParser.parseParameters(req, fieldList, fieldListKeys);
      Object.assign(req.bandMap, {
        rawParams: rawParams,
        params: params
      });

      // Rebuild a field map and field list with just the requested fields.
      let reqFieldList =
          utils.assignFieldsWithFilter({}, fieldList, requestedFields),
        reqFieldListKeys = Array.from(Object.keys(reqFieldList));

      // Return error if nothing was requested.
      if (reqFieldListKeys.length === 0) {
        let suggestion = '';
        if (rawParams.fields !== undefined ||
          rawParams['no-fields'] !== undefined) {
          suggestion = 
            `  Check your 'fields' or 'no-fields' arguments to make sure ` +
            `you request at least one field.`;
        }
        req.throwAPIError(400, 'nothing-requested',
          `No valid fields were requested.${suggestion}`
        );
      }

      // Specify a default sort for collections and collectionItems if none
      // was given.
      let sort = [],
        rootTLO = tloNames.byNameForm.camelCasePlural[rootCollection],
        defaultSort = `${apiPrefix}${rootTLO.primaryId}:asc`.toLowerCase(),
        alreadyIncluded = false;
      params.sort.forEach(p => {
        if (p.split(':')[0].toLowerCase() === defaultSort) {
          alreadyIncluded = true;
        }
      });
      if (!alreadyIncluded) {
        params.sort.push(defaultSort);
      }

      // Prepare Sorting.
      // Parse and validate the "sort" query argument if one was given.
      sort = params.sort =
        parameterParser.parseSort(
          req,
          fieldList,
          fieldListKeys,
          icFieldListKeys,
          params.sort
        );

      // Prepare Filtering.
      // Parse and validate the "filter" query argument if one was given.
      let filterTree =
        parameterParser.parseFilters(
          req,
          res,
          fieldList,
          fieldListKeys,
          icFieldListKeys
        );

      // Fully qualified API field to fully qualified DB field crossreference.
      let apiToDB = {};
      fieldListKeys.forEach(apiFieldName => {
        let pathParts = apiFieldName.split('.'),
          isRootField = apiPrefix.length > 0 && pathParts.length === 1,
          postRootPathParts = apiPrefix.length === 0 ?
            pathParts : // path is already the post-root collection path.
            isRootField ?
            pathParts : // path is a root collection field.
            pathParts.slice(1), // path is a collection sub-object field.
          dbPrefixParts = dbPrefix.split('.'),
          dbParentOfRoot =
            dbPrefixParts.slice(0, dbPrefixParts.length - 2).join('.'),
          dbParentOfRootPrefix =
            dbParentOfRoot.length > 0 ? `${dbParentOfRoot}.` : '',
          prefix = isRootField ? dbParentOfRootPrefix : dbPrefix,
          dbFieldName = `${prefix}${postRootPathParts.join('.')}`;

        // Take into account special case DB lookups, like
        // bands.cities is actually bands.cityStateCountries:
        // TODO: need to do this for field names in sorts and filters too.
        dbFieldName = db.getSpecialCaseFieldName(dbFieldName);

        apiToDB[apiFieldName] = dbFieldName;
      });

      // Fully qualified DB field to fully qualified API field crossreference.
      let dbToApi = {};
      fieldListKeys.forEach(apiFieldName => {
        dbToApi[apiToDB[apiFieldName]] = apiFieldName;
      });

      // Field types by DB field name.
      let types = {};
      fieldListKeys.forEach(apiFieldName => {
        let dataType = fieldList[apiFieldName],
          dbFieldName = apiToDB[apiFieldName];
        types[dbFieldName] = dataType;
      });
      // Add id field types that exist only in the DB layer, like webLinks.id.
      let addDBOnlyIdTypes = typesMap => {
        let fullTypesMap = [];
        Object.keys(typesMap).forEach(p => {
          let fieldName = p.split('.').pop(),
            tlo = tloNames.byNameForm.camelCasePlural[fieldName];
          if (tlo !== undefined) {
            let pid = tlo.primaryId,
              sid = tlo.secondaryId,
              pidPath = `${p}.${pid}`,
              secondaryIdPath = sid ? `${p}.${sid}` : undefined;
            if (!typesMap.hasOwnProperty(pidPath)) {
              // TODO: this hueristic type assignment is sketchy.
              // Better keep actual types somewhere and look them up here.
              let pidPathType = pid === 'id' ? 'integer' : 'string';
              fullTypesMap[pidPath] = pidPathType;
            }
            if (sid && !typesMap.hasOwnProperty(secondaryIdPath)) {
              // TODO: this hueristic type assignment is sketchy.
              // Better keep actual types somewhere and look them up here.
              let sIdPathType = sid === 'id' ? 'integer' : 'string';
              fullTypesMap[secondaryIdPath] = sIdPathType;
            }
          }
          fullTypesMap[p] = typesMap[p];
        });
        return fullTypesMap;
      };
      types = addDBOnlyIdTypes(types);

      // API field names requested by the user in output order.
      let requested = [];
      Object.keys(apiToDB).forEach(f => {
        if (reqFieldListKeys.includes(f)) {
          requested.push(f);
        }
      });

      // Convert sort keys from API field name to DB field name.
      let sortDB = {};
      Array.from(Object.keys(sort)).forEach(apiFieldName => {
        let dbFieldName = apiToDB[apiFieldName];
        sortDB[dbFieldName] = sort[apiFieldName];
      });
      sort = sortDB;

      // Add completed parse results to req.bandMap for reference.
      Object.assign(req.bandMap, {
        fields: Object.assign(req.bandMap.fields, {
          apiToDB: apiToDB,
          dbToApi: dbToApi,
          types: types,
          map: utils.getFieldMapFromFieldList(types),
          requested: requested,
          requestedDB: requested.map(f => apiToDB[f]),
        }),
        filterTree: filterTree,
        sort: sort
      });

      // TODO: Return immediately if we don't need anything from the DB.
      // (for example if only "no-op" fields were requested.)
      let noOpFields = ['link', 'offset', 'limit', 'warnings', 'errors'];

    }
    // Route to the appropriate sub-handler.
    // TODO: Handle special requests for static namespace directory data:
    // /
    // /locations
    // /edit-history
    let handler = {
        directory: stubHandler,
        collection: collectionHandler,
        collectionItem: collectionItemHandler,
        tagCollection: stubHandler,
        tagCollectionItem: stubHandler

      }[resourceType] || stubHandler; // Default to stub handler.

    handler.handle(req, res, next)

    .then(response => {

      // Attach warnings if there were any.
      let warnings = req.bandMap.warnings || [];
      if (warnings.length > 0) {
        response.warnings =
          warnings.map(w => ({code: w.code, message: w.message}));
      }

      // Write out the response.
      utils.writeJson(res, response);
      let endTime = new Date().getTime(),
        elapsedTime = endTime - startTime;
      debug(
        `${new Date().getTime()}: Wrote response.  ` +
        `Elapsed time: ${elapsedTime} ms.`);
    })

    .catch(err => {
      let endTime = new Date().getTime(),
        elapsedTime = endTime - startTime;
      debug(
        `${new Date().getTime()}: Writing error response.  ` +
        `Elapsed time: ${elapsedTime} ms.`);
      next(err);
    });

  };

module.exports = {
  handleErrors: handleErrors,
  handle: handle
};

/*
TODO:
  Generalize Collection Container Response:
  {
    "link": "https://www.seattlebandmap.com/api/<collection>?limit=100&offset=200",
    "offset": 200,
    "limit": 100,
    "total": 1000,
    <collection>: [],
    <collection>"Count": 100,
    "first": "https://www.seattlebandmap.com/api/<collection>?limit=100",
    "prev": "https://www.seattlebandmap.com/api/<collection>?limit=100&offset=100",
    "next": "https://www.seattlebandmap.com/api/<collection>?limit=100&offset=300",
    "last": "https://www.seattlebandmap.com/api/<collection>?limit=100&offset=900"
  }
  Params:
    fields
    no-fields
    sort
    filter
  Generalize Adding *Count fields to Bands Response.
  Generalize getBands() and related functions a bit more.
  Websites.
  CollectionItem Response
  CollectionItems by name/secondary id
  Connections
  URL Subcollections:
    Bands
    Connections
  Add case insensitive/trimmed name constraints:
    https://www.postgresql.org/message-id/c57a8ecec259afdc4f4caafc5d0e92eb@mitre.org
    https://stackoverflow.com/questions/7005302/postgresql-how-to-make-case-insensitive-query
  Document pretty, help, doc, schema, annotations params.
  Containerize
  Legacy Site Reimplement

  Eventual Request Processing Steps:
    Validate input using JSON schema.
    Sanitize input?
    Route to sub-handler: Collection, CollectionItem, Special (like API root), Stub.
    Build and execute minimal queries in parallel (consider paging, sorting, filters, etc):
      - Build and execute minimal queries for edit history facts and revisions.
      - Build and execute minimal queries for output data.
    Do any post-query filtering necessary (should be minimal).
    Process query results, augment with annotations, counts, links, maybe other.
    Return processed json.


Firefox JSON Viewer Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1252016
  JSON.parse: expected double-quoted property name at line 29681


Possible Query Strategies:
  - One Big Select - linearly scan rows, ignoring totally redundant rows.
  - 6 Selects: Bands, People, Cities, Connected Bands, Info Sources, Active Dates

6 Selects:
Timing:
    0 Got request.
   53 Got bands results.
   60 Got band cities results.
   66 Got band people results.
  113 Got band connected bands results.
  113 Got db results.
  116 Converted db results to array.
  184 Converted maps to objects.
  187 Wrote response.  Done.
*/

})();
