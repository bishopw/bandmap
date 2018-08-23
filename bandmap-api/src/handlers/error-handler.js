/*

/handlers/error-handler.js

Band Map API error and warning handling.

*/

(function () {
'use strict';

const debug = require('debug')('band-map-api'),
  utils = require('../utils/utils.js');

class ErrorHandler {

  /**
    Queued warnings may be sent attached to completed responses in a "warnings"
    field, depending on the response type.
  */
  static queueAPIWarning (
    req,
    statusCode = 500, // API Warning status codes will be returned only if a
                      // warning gets elevated to an error.
    code = 'server-warning',
    msg = 'Unknown server warning.'
  ) {

    let warnings = req.bandMap ? req.bandMap.warnings || [] : [];
    warnings.push({
      statusCode: statusCode,
      code: code,
      message: msg
    });
  }

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
  static queueAPIError(
    req,
    statusCode = 500,
    code = 'server-error',
    msg = 'Unknown server error.'
  ) {

    let errors = req.bandMap ? req.bandMap.errors || [] : [],
      err = new Error(msg);
    err.code = code;
    err.statusCode = statusCode;
    errors.push(err);
  }

  /**
  Throw queued API errors if there are any, otherwise do nothing.
  We throw the first one, but the error handler will check the queue and return
  them all if there are more, along with warnings.
  */
  static throwQueuedAPIErrors(req) {
    let errors = req.bandMap ? req.bandMap.errors || [] : [];
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  static throwAPIError(
    req,
    statusCode = 500,
    code = 'server-error',
    msg = 'Unknown server error.') {
    ErrorHandler.queueAPIError(req, statusCode, code, msg);
    ErrorHandler.throwQueuedAPIErrors(req);
  }

  static initAPIErrorHandling(req) {
    req.bandMap = req.bandMap || {};
    req.bandMap.errors = [];
    req.bandMap.warnings = [];
    req.queueAPIWarning = (statusCode, code, msg) =>
      ErrorHandler.queueAPIWarning(req, statusCode, code, msg);
    req.queueAPIError = (statusCode, code, msg) =>
      ErrorHandler.queueAPIError(req, statusCode, code, msg);
    req.throwQueuedAPIErrors = () =>
      ErrorHandler.throwQueuedAPIErrors(req);
    req.throwAPIError = (statusCode, code, msg) =>
      ErrorHandler.throwAPIError(req, statusCode, code, msg);
  }

  /**
    This method is wired in to the top-level app router in index.js.
    It synchronously (no Promises involved) formats errors from earlier
    handlers, including swagger validation stuff, writes out a JSON error
    object, and closes out the response.
  */
  handleErrors(err, req, res, next) { // Have to put the unused fourth arg
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
  }
}

module.exports = ErrorHandler;

})();