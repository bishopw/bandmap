(function () {
'use strict';

const debug = require('debug')('band-map-api');

/**
  In-memory asynchronous, Promise-based cache
  for avoiding Band Map database queries.
*/

let cache = new Map([
    ['bandsTotal', undefined]
  ]);

module.exports = {
  /**
    Looks up the specified key in the cache.  If the key's value is defined,
    returns a fulfilled Promise whose value is the defined cached value.  If
    the key's value is undefined, executes lookupFn -- a function which should
    return a Promise whose fulfilled value will be the desired key's value --
    caches that Promise's value at the key once it is fulfilled, and returns
    a Promise that is also resolved to the looked-up value.
  */
  get: (key, lookupFn) => {
    let value = cache.get(key);
    if (value !== undefined) {
      debug(`${new Date().getTime()}: Got cached ${key}: ${value}.`);
      return Promise.resolve(value);
    }
    return (
      lookupFn()
      .then(result => {
        cache.set(key, result);
        debug(`${new Date().getTime()}: Set cached ${key}: ${result}.`);
        return result;
      })
    );
  },

  set: (key, value) => cache.set(key, value),

  expire: key => cache.set(key, undefined)
};

})();
