(function () {
'use strict';

const debug = require('debug')('band-map-api'),
  cache = require('../utils/cache'),
  tloNames = require('../utils/top-level-object-names.js'),
  objectFetcher = require('../utils/object-fetcher.js'),
  utils = require('../utils/utils.js');

/**
Collection Handler: Retrieve and assemble collections like /bands, /people.

Respond like:

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
*/
let handle = (req, res, next) => {

    let params = req.bandMap.params,

      serverUrl = req.bandMap.serverUrl,
      pathName = req.bandMap.pathName,
      url = `${serverUrl}${pathName}`,
      rootCollection = req.bandMap.rootCollection,
      rootTLONames = tloNames.byNameForm.camelCasePlural[rootCollection],
      rootCCPlural = rootTLONames.camelCasePlural,
      limit = params.limit,
      offset = params.offset;

    // If any of last, previous, or next link fields were requested, we need
    // to look up the collection total to construct the links.  Make sure
    // it's in the requested fields list.
    let needTotal = ['total', 'last', 'previous', 'next'],
      requested = req.bandMap.fields.requested;
    if (requested.filter(f => needTotal.includes(f)).length > 0) {
      let apiToDB = req.bandMap.fields.apiToDB,
        requestedDB = req.bandMap.fields.requestedDB;
      requestedDB.push(apiToDB.total);
    }

    // Set response field order.
    let response = {
      link: undefined,
      offset: offset,
      limit: limit,
      total: undefined
    };
    response[rootCCPlural] = undefined;
    response[`${rootCCPlural}Count`] = undefined;
    Object.assign(response, {
      first: undefined,
      prev: undefined,
      next: undefined,
      last: undefined
    });

    return (
      objectFetcher.fetchObjects(req, res)
      .then(results => {
        let { total, objects } = results;
        /*
        Compose navigation links based on total and returned row counts.
        TODO:
          Make paging links with the minimum possible number of query args
          (arguments with default values removed) to reproduce the desired
          requests.
          https://www.seattlebandmap.com/api/bands?limit=100&offset=200
          &sort=id:asc&filter=name eq 'Love Battery'&fields=id,name,people
          &no-fields=link&expand=people&pretty=false&annotations
        */
        response.total = total;
        response.link = `${serverUrl}${req._parsedUrl.path}`;
        // If limit is actually 0, don't divide by it when constructing links.
        let nzLimit = Math.max(limit, 1),
          lastPageRemainder = total % nzLimit;
        lastPageRemainder =
          lastPageRemainder === 0 ? nzLimit : lastPageRemainder;
        let lastOffset = Math.max(total - lastPageRemainder, 0);
        let prevOffset = Math.max(Math.min(lastOffset, offset - limit), 0),
          nextOffset = Math.min(offset + limit, lastOffset);
        if (limit < total) {
          response.first = `${url}?limit=${limit}`;
        }
        if (offset > 0 && prevOffset >= 0) {
          response.prev = `${url}?limit=${limit}&offset=${prevOffset}`;
        }
        if (offset < nextOffset && nextOffset < total) {
          response.next = `${url}?limit=${limit}&offset=${nextOffset}`;
        }
        if (limit < total) {
          response.last = `${url}?limit=${limit}&offset=${lastOffset}`;
        }

        response[rootCCPlural] = objects;
        response[`${rootCCPlural}Count`] = objects.length;

        // Filter out any unrequested root fields and return.
        response = utils.assignFieldsWithFilter({}, response, requested);

        return response;
      })
    );
  };

module.exports = {
  handle: handle
};

})();
