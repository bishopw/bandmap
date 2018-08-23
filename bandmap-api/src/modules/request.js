/*

/modules/request.js

Band Map Request instances hang off of Connect/Express request objects and
encapsulate Band-Map-specific request functionality, especially Swagger field
parsing, validation, and mappings.

*/

(function () {
'use strict';

const  ErrorHandler = require('../handlers/error-handler.js');

class Request {

  /**
  Creates a new Band Map Request object, and enhances the specified Connect
  request with its functionality.
  Properties:
    errors:        [] or [Error, Error, ...]
    warnings:      [] or ['warning message...', 'warning message...', ...]
    serverUrl:     https://localhost:3000
    pathName:      /api/bands
    pathNameParts: ['', 'api', 'bands']
    endPoint:      'api' | 'bands' | '{band}' | etc...
    resourceType:  collection | collectionItem | tagCollection |
                   tagCollectionItem | directory | unknown
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
  constructor(req, config) {

    // Define Band Map request properties.
    Object.assign(this, {
      errors:           [],
      warnings:         [],
      serverUrl:        req.headers.host || 'hostname',
      pathName:         req._parsedUrl.pathname,
      pathNameParts:    undefined,
      endPoint:         undefined,
      resourceType:     'unknown',
      rawParams:        {},
      params:           {},
      containerChain:   undefined,
      rootCollection:   undefined,
      apiPrefix:        undefined,
      dbPrefix:         undefined,
      fields: {
        apiToDB:        undefined,
        dbToApi:        undefined,
        types:          undefined,
        map:            undefined,
        requested:      undefined,
        requestedDB:    undefined,
        needed:         undefined
      },
      filterTree:       undefined,
      sort:             []
    }, config);

    // Initialize Band Map request properties.

    // Initialize error/warning handling.
    ErrorHandler.initAPIErrorHandling(req);

    // TODO: autodetect http/https protocol:
    this.serverUrl = `https://${this.serverUrl}`;

    this.pathNameParts = req._parsedUrl.pathname.split('/');
    this.endPoint = this.pathNameParts[this.pathNameParts.length - 1];

  }

}

module.exports = Request;

})();
