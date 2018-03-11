(function () {
'use strict';

const debug = require('debug')('band-map-api'),
  cache = require('../utils/cache'),
  tloNames = require('../utils/top-level-object-names.js'),
  objectFetcher = require('../utils/object-fetcher.js'),
  utils = require('../utils/utils.js');

/**
Collection Item Handler: Retrieve and assemble a single collection item
from urls like /bands/{band}, /people/{person}.

Respond like:
{
  ...object contents...
}

*/
let handle = (req, res, next) => {

    let params = req.bandMap.params,

      rootCollection = req.bandMap.rootCollection,
      rootTLONames = tloNames.byNameForm.camelCasePlural[rootCollection];

    return (
      objectFetcher.fetchObjects(req, res)
      .then(results => {
        let { total, objects } = results;

        if (objects.length === 0) {
          let itemName = req.bandMap.params[rootTLONames.urlSingular],
            quotedItemName = itemName ? ` '${itemName}'` : '';
          req.throwAPIError(
            404, 'not-found',
            `Requested ${rootTLONames.singular}${quotedItemName} not found.`
          );
        }

        return objects[0];
      })
    );
  };

module.exports = {
  handle: handle
};

})();
