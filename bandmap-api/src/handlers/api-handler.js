/*

/handlers/api-handler.js

Main Band Map API entry point, request pre-processing, and initial routing to
appropriate target handler.

*/

(function () {
'use strict';

const debug = require('debug')('band-map-api'),

  oldCollectionHandler = require('./old-collection-handler.js'),
  oldCollectionItemHandler = require('./old-collection-item-handler.js'),
  errorHandler = new (require('./error-handler.js'))(),
  tloNames = require('../utils/top-level-object-names.js'),
  schemaParser = require('../utils/schema-parser.js'),
  parameterParser = require('../utils/parameter-parser.js'),
  db = require('../utils/database.js'),
  utils = require('../utils/utils.js'),

  Request = require('../modules/request.js'),


  /**
    Stub Handler: Return an example response based on the swagger spec.
  */
  stubHandler = {
    handle: (req, res) => {
      res.statusCode = 501;
      return Promise.resolve(schemaParser.makeStubResponse(req));
    }
  };

class ApiHandler {

  get handleErrors() { return errorHandler.handleErrors; }

  /**
   * Route and handle all Band Map API requests.
   * Returns a response object to be serialized as JSON,
   * or throws an error via next(err) to be handled by handleErrors().
   **/
  handle(req, res, next) {

    // Initialize Band-Map-specific request features.
    req.bandMap = new Request(req);

    // /docs requests: Forward to swagger-ui,js via index.js
    if (req.bandMap.pathName.startsWith('/docs')) {
      debug('Forwarding /docs request to swagger-ui.');
      return next();
    }

    let startTime = new Date().getTime();
    debug(`Processing request: ${req.bandMap.pathName}`);

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
    let rootCollection,
      swagger = req.swagger || {},
      swaggerPaths = Array.from(Object.keys(
        swagger.swaggerObject ? swagger.swaggerObject.paths : {}
      )),
      swaggerParams = swagger.params || {},
      isSwaggerPath = req.swagger ? req.swagger.isSwaggerPath : false,
      lastPartWasACollection = false,
      partsLeft = req.bandMap.pathNameParts.slice(),
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
      req.bandMap.endPoint = part;
      if (part.length === 0) {
        continue;
      } else if (!lastPartWasACollection &&
        tloNames.byNameForm.urlPlural.hasOwnProperty(req.bandMap.endPoint.toLowerCase())) {
        req.bandMap.resourceType = tagCollections.includes(part) ?
          'tagCollection' : 'collection';
        rootCollection = part;
        lastPartWasACollection = true;
      } else if (lastPartWasACollection) {
        req.bandMap.resourceType = tagCollections.includes(rootCollection) ?
          'tagCollectionItem' : 'collectionItem';
        containerChain.push(makeContainerChainEntry(rootCollection, part));
        lastPartWasACollection = false;
      } else if (directoryEndpoints.includes(part) &&
        req.bandMap.pathNameParts.length <= 4 ) {
        req.bandMap.resourceType = 'directory';
      } else {
        req.bandMap.resourceType = 'unknown';
      }
    }

    if (!isSwaggerPath || req.bandMap.resourceType === 'unknown') {
      // No resource by that name.  Try to suggest a better URL.
      let lcEndPoint = req.bandMap.endPoint.toLowerCase().trim(),
        suggestion;
      if (req.bandMap.pathName === '/') {
        suggestion = `${req.bandMap.serverUrl}/api`;

      } else if (req.bandMap.endPoint.length > 0 && swaggerPaths.length > 0) {
        for (let i = 0; i < swaggerPaths.length; ++i) {
          let p = swaggerPaths[i],
            lcp = p.toLowerCase();

          // Check for a matching endpoint at a different URL location.
          if (lcp.endsWith(lcEndPoint)) {
            let sUrl = `${req.bandMap.serverUrl}/api${p}`;
            if (suggestion === undefined || sUrl.length < suggestion.length) {
              suggestion = sUrl;
            }

          // Check for a collection item URL with a matching root collection.
          } else if (req.bandMap.resourceType === 'collectionItem' && rootCollection) {
            let pparts = lcp.split('/'),
              ppLen = pparts.length,
              pCollection = ppLen > 1 ? pparts[ppLen-2] : '';
            if (rootCollection.toLowerCase() === pCollection.toLowerCase()) {
              let pCollectionURLParts = pparts.slice(0, ppLen - 1),
                pcPath = pCollectionURLParts.join('/'),
                pcUrl = `${req.bandMap.serverUrl}/api${pcPath}/${req.bandMap.endPoint}`;
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
        `No resource found for URL '${req.bandMap.serverUrl}${req.bandMap.pathName}'.${suggestion}`
      );
    }
    if (rootCollection !== undefined) {
      rootCollection =
        tloNames.convert(rootCollection, 'urlPlural', 'camelCasePlural');
    }
    let apiPrefix = req.bandMap.resourceType === 'collection' ? `${rootCollection}.` : '';
    // The DB prefix is the fully qualified collection name of the root
    // collection.
    let dbPrefix = '';
    if (containerChain.length > 0) {
      let lastContainer = containerChain[containerChain.length-1];
      dbPrefix = lastContainer.objectPath;
    }
    if (req.bandMap.resourceType === 'collection') {
      dbPrefix += dbPrefix.length > 0 ? '.' : '';
      dbPrefix += rootCollection;
    }
    dbPrefix += dbPrefix.length > 0 ? '.' : '';

    Object.assign(req.bandMap, {
      containerChain: containerChain,
      rootCollection: rootCollection,
      apiPrefix: apiPrefix,
      dbPrefix: dbPrefix,
    });
    let rootTLO = tloNames.byNameForm.camelCasePlural[rootCollection];

    // Do extra parameter parsing and preparation needed for collections and
    // collection items.
    if (['collection', 'collectionItem'].includes(req.bandMap.resourceType)) {

      // Prepare Fields.
      // Parse available fields from the JSON schema.
      let {
        fieldList
      } = schemaParser.parseSchema(req);
      // Special case: attach internal composite id field parts
      // (band_1_id/band_2_id) for connections so we can sort on them.
      if (rootTLO.singular === 'connection') {
        Object.assign(fieldList, {
          'connections.band_1_id': 'integer',
          'connections.band_2_id': 'integer'
        });
      }

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
        defaultSort = [`${apiPrefix}${rootTLO.primaryId}`.toLowerCase()],
        alreadyIncluded = false;
      // Special case for connection default sort:
      if (rootTLO.singular === 'connection') {
        defaultSort = [`${apiPrefix}band_1_id`, `${apiPrefix}band_2_id`];
      }
      params.sort.forEach(p => {
        if (defaultSort.includes(p.split(':')[0].toLowerCase())) {
          alreadyIncluded = true;
        }
      });
      if (!alreadyIncluded) {
        params.sort = params.sort.concat(defaultSort.map(s => `${s}:asc`));
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
        let fullTypesMap = {};
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
        collection: oldCollectionHandler,
        collectionItem: oldCollectionItemHandler,
        tagCollection: stubHandler,
        tagCollectionItem: stubHandler

      }[req.bandMap.resourceType] || stubHandler; // Default to stub handler.

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
      let elapsedTime = new Date().getTime() - startTime;
      debug(`Wrote response.  Elapsed time: ${elapsedTime} ms.`);
    })

    .catch(err => {
      let elapsedTime = new Date().getTime() - startTime;
      debug(`Writing error response.  Elapsed time: ${elapsedTime} ms.`);
      next(err);
    });
  }
}

module.exports = ApiHandler;

})();