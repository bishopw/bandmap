(function () {
'use strict';

/**
Module for parsing Band Map query arguments and other parameters.
*/

const debug = require('debug')('band-map-api'),
  moment = require('moment'),

  utils = require('../utils/utils.js'),

  defaults = {
    'limit': 10000,
    'offset': 0,
    'sort': [],
    'filter': '',
    'fields': [],
    'no-fields': [],
    'pretty': true,
    'help': false,
    'schema': false,
    'annotations': false
  };

/**
  Parse and return the request parameter keys and values as they arrived
  from request req.
*/
let getRawParams = req => {
    // Get our own copy of nested objects - swagger tools might be doing weird
    // caching stuff on their end.
    let rawParams = {};
    Object.keys(req.swagger.params).forEach(key => {
      rawParams[key] = utils.deepCopy(req.swagger.params[key].value);
    });
    return rawParams;
  },

  /**
    Return params list with defaults applied where nothing was supplied
    by the user, plus some validation:
  */
  getPreparedParams = rawParams => {

    // Preserve original copies of nested objects in raw params and defaults.
    rawParams = utils.deepCopy(rawParams);
    let defaultsCopy = utils.deepCopy(defaults),

      pParams = {};
      
    Object.keys(defaults).forEach(key => {
      pParams[key] =
        rawParams[key] === undefined ?
        defaultsCopy[key] :
        rawParams[key];
    });

    // Include any raw params that do not have defaults
    // (like path parameters like {band}).
    Object.keys(rawParams).forEach(key => {
      let val = rawParams[key];
      if (!defaultsCopy.hasOwnProperty(key) && val !== undefined) {
        pParams[key] = val;
      }
    });

    // Split comma-delimited query args into arrays.
    ['sort', 'fields', 'no-fields'].forEach(fieldName => {
      if (typeof(pParams[fieldName]) === 'string') {
        pParams[fieldName] =
          utils.removeEmptyStrings(pParams[fieldName].split(','));
      }
    });

    // Special case: 'sort' should be an array of 'field:asc|desc' strings.
    if (toString.call(pParams.sort) === '[object String]') {
      if (pParams.sort.trim().length > 0) {
        pParams.sort = [pParams.sort.trim()];
      } else {
        pParams.sort = [];
      }
    }

    // Special case: in query args, 'doc' is an alias for 'help':
    pParams.help = (rawParams.hasOwnProperty('help') &&
      rawParams.help.toLowerCase() !== 'false') ||
      (rawParams.hasOwnProperty('doc') &&
      rawParams.doc.toLowerCase() !== 'false') ||
      defaultsCopy.help;

    // Some validation.
    pParams.limit = Math.max(parseInt(pParams.limit), 0);
    pParams.offset = Math.max(parseInt(pParams.offset), 0);

    return pParams;
  },

  /**
  Field Filtering from ?fields and ?no-fields args:
  */

  getFieldAndAllContainingCollections = field => {
    let fieldParts = field.split('.'),
      paths = [];
    for (let i = 1; i <= fieldParts.length; ++i) {
      paths.push(fieldParts.slice(0, i).join('.'));
    }
    return paths;
  },

  getSubfields = (f, fieldListKeys) => {
    let fParts = f.split('.'),
      fPLen = fParts.length,
      fEndIdx = fPLen-1,
      fEnd = fParts[fEndIdx],
      fields = [];
    fieldListKeys.forEach(ff => {
      let ffParts = ff.split('.');
      if (ff.startsWith(f) &&
        ffParts.length > fParts.length &&
        ffParts[fEndIdx] === fEnd) {
        fields.push(ff);
      }
    });
    return fields;
  },

  filterByWhitelist =
    (fieldList, fieldListKeys, whitelist, ignoreCase = true) => {
    let filtered = [],
      icWhitelist = [];

    whitelist.forEach(
      f => icWhitelist.push(ignoreCase ? f.trim().toLowerCase() : f.trim()));
    whitelist = icWhitelist;

    fieldListKeys.forEach(f => {
      let icf = ignoreCase ? f.trim().toLowerCase() : f.trim();
      if (whitelist.includes(icf)) {

        // Add the whitelisted field and any parent collections needed to
        // reach it to the field list.
        getFieldAndAllContainingCollections(f.trim()).forEach(path => {
          if (!filtered.includes(path)) {
            filtered.push(path);
          }
        });

        // If the whitelisted field itself is a container object with subfields,
        // AND no other more specific subfields below it are whitelisted,
        // assume the user wants all the subfields and recursively include them.
        if (['array', 'object'].includes(fieldList[f])) {
          let subfields = getSubfields(f, fieldListKeys),
            areSubfieldsWhitelisted = false;
          for (let i = 0, sfLen = subfields.length; i < sfLen; i++) {
            let sf = subfields[i],
              icsf = ignoreCase ? sf.toLowerCase() : sf;
            if (whitelist.includes(icsf)) {
              areSubfieldsWhitelisted = true;
              break;
            }
          }
          if (!areSubfieldsWhitelisted) {
            subfields.forEach(sf => {
              if (!filtered.includes(sf)) {
                filtered.push(sf);
              }
            });
          }
        }
      }
    });

    return filtered;
  },
  
  filterByBlacklist = (fieldListKeys, blacklist, ignoreCase = true) => {
    let filtered = fieldListKeys.slice(),
      icBlacklist = [];

    blacklist.forEach(
      f => icBlacklist.push(ignoreCase ? f.trim().toLowerCase() : f.trim()));
    blacklist = icBlacklist;

    // Remove blacklisted objects and their subobjects.
    icBlacklist.forEach(path => {
      let i = 0,
        icPath = ignoreCase ? path.trim().toLowerCase() : path.trim();
      while (i < filtered.length) {
        let icf =
          ignoreCase ? filtered[i].trim().toLowerCase() : filtered[i].trim();
        if (icf.startsWith(icPath)) {
          filtered.splice(i, 1);
        } else {
          ++i;
        }
      }
    });

    return filtered;
  },

  filterFields = (fieldList, fieldListKeys, whitelist, blacklist) =>
    (whitelist ?
      filterByWhitelist(fieldList, fieldListKeys, whitelist) :
      filterByBlacklist(fieldListKeys, blacklist)
    ),

  suggestAlternate = (icField, altList, icAltList) => {
    let suggestion = '',

    // Try adding prefixes.
      minimalPrefixFound = Number.MAX_SAFE_INTEGER,
      icFieldSplit = icField.split('.');
    // For each alternate...
    for (let i = 0; i < altList.length; ++i) {
      let a = altList[i],
        altSplit = a.split('.');
      // For each potential prefix size in the alternate:
      for (let j = 1; j <= a.length; ++j) {
        let candidate = altSplit.slice(0, j).concat(icFieldSplit).join('.'),
          icCandidate = candidate.toLowerCase().trim();
        // Check 'prefix.field' for a match.
        for (let k = 0; k < icAltList.length; ++k) {
          if (icAltList[k] === icCandidate && j < minimalPrefixFound) {
            minimalPrefixFound = j;
            suggestion = ` (did you mean '${altList[k]}'?)`;
            break;
          }
        }
      }
    }

    // Try removing prefixes.
    if (suggestion.length === 0) {
      let minimalPrefixesRemoved = icFieldSplit.length;
      // For each prefix removed from the field...
      for (let i = 1; i < icFieldSplit.length; ++i) {
        let candidate = icFieldSplit.slice(i).join('.');
        // For each alternate, check for a match.
        for (let j = 0; j < altList.length; ++j) {
          if (icAltList[j] === candidate && i < minimalPrefixesRemoved) {
            minimalPrefixesRemoved = i;
            suggestion = ` (did you mean '${altList[j]}'?)`;
            break;
          }
        }
      }
    }

    return suggestion;
  },

  queueUnrecognizedWarning =
    (req, fieldList, reqList, argName, ignoreCase = true) => {

    let unrecognized = [],
      warnings = [],
      icFieldList = [];

    fieldList.forEach(
      f => icFieldList.push(ignoreCase ? f.trim().toLowerCase() : f.trim()));

    reqList.forEach(f => {
      let icf = ignoreCase ? f.trim().toLowerCase() : f.trim();
      if (!icFieldList.includes(icf) && !unrecognized.includes(icf)) {
        // Try to be helpful and suggest correction if the user maybe forgot
        // the root collection prefix.
        let suggestion = suggestAlternate(icf, fieldList, icFieldList);
        unrecognized.push(icf);
        warnings.push(`'${f}'${suggestion}`);
      }
    });

    if (warnings.length > 0) {
      req.queueAPIWarning(400, 'unrecognized-fields',
        `Ignoring ${warnings.length} unrecognized field(s) in ` +
        `'${argName}' argument: ${warnings.join(', ')}`
      );
    }
  },

  queueDuplicatesWarning = (req, reqList, argName, ignoreCase = true) => {
    let icReqList = [],
      duplicates = [],
      warnings = [];

    reqList.forEach(
      f => icReqList.push(ignoreCase ? f.trim().toLowerCase() : f.trim()));

    for (let i = 0; i < reqList.length; ++i) {
      for (let j = i + 1; j < reqList.length; ++j) {
        if (icReqList[i] === icReqList[j] &&
          (!duplicates.includes(reqList[i]))) {
          duplicates.push(icReqList[i]);
          warnings.push(reqList[i]);
        }
      }
    }
    if (warnings.length > 0) {
      req.queueAPIWarning(400, 'duplicate-arguments',
        `Found ${warnings.length} field(s) specified multiple times in ` +
        `'${argName}' argument.  Ignoring duplicates: ${warnings}`
      );
    }
  },

  /**
  parseParameters() - Parses parameters in the request URL and query args.

  Queues warnings if unrecognized parameters or fields were encountered and
  ignored, and/or if there were duplicate field specifiers.

  Returns an object of the form:

  {
    rawParams: <object>       Parameters as parsed by the swagger tools
                              middleware.
    params: <object>          Full params list with defaults applied where
                              nothing was supplied by the user, plus validation.
    requestedFields: <object> Mapping of of fully qualified field names
                              requested by the user to data type.
  }
  */
  parseParameters = (req, fieldList, fieldListKeys) => {

    let resourceType = req.bandMap.resourceType;

    // Parameter parsing is only necessary for collection and collection item
    // requests.
    if (!(['collection', 'collectionItem'].includes(resourceType))) {
      return {};
    }

    let rawParams = getRawParams(req),
      params = getPreparedParams(rawParams);

    // Add a warning if both ?fields and ?noFields were specified.
    if (rawParams.fields !== undefined &&
      rawParams['no-fields'] !== undefined) {
      req.queueAPIWarning(400, 'incompatible-arguments',
        `Both 'fields' and 'no-fields' arguments were specified.  ` +
        `Either one or the other should be used.  Ignoring 'no-fields'.`
      );
    }

    // Determine which fields are requested for this object/collection.
    let reqFieldListKeys = fieldListKeys.slice();

    if (rawParams.fields || rawParams['no-fields']) {
      let fieldsParam, noFieldsParam, reqList, argName;

      if (rawParams.fields !== undefined) {
        reqList = fieldsParam = params.fields;
        argName = 'fields';
      } else if (rawParams['no-fields'] !== undefined) {
        reqList = noFieldsParam = params['no-fields'];
        argName = 'no-fields';
      }

      reqFieldListKeys =
        filterFields(fieldList, fieldListKeys, fieldsParam, noFieldsParam);

      // Warn about any unrecognized or duplicate fields.
      queueUnrecognizedWarning(req, fieldListKeys, reqList, argName);
      queueDuplicatesWarning(req, reqList, argName);
    }

    return ({
      rawParams: rawParams,
      params: params,
      requestedFields: reqFieldListKeys
    });

  },

  /**
    parseSort() - Validates the fields requested in the supplied sort param (as
    passed in by the swagger tools) against the supplied full field list.

    Queues warnings if unrecognized sort fields were encountered and ignored,
    or if there were duplicate field specifiers.

    Returns an object of the form: { field: order, field: order, ... }
  */
  parseSort = (req, fieldList, fieldListKeys, icFieldListKeys, sortParam) => {
    let sort = {},
      sortFieldKeys = [],
      reqFieldKeys = [],
      wrongFormatWarnings = [],
      wrongTypeWarnings = [];

    sortParam.forEach(f => {
      let parts = f.split(':'),
        field = parts[0],
        icField = field.toLowerCase().trim(),
        order = parts.length === 2 ? parts[1].toLowerCase().trim() : 'asc';
      reqFieldKeys.push(field);

      // Warn about ignored wrongly formatted sort arguments (multiple colons).
      if (parts.length > 2 || (!['asc','desc'].includes(order))) {
        wrongFormatWarnings.push(`'${f}'`);

      } else {
        for (let i = 0; i < fieldListKeys.length; ++i) {
          if (icField === icFieldListKeys[i] &&
            (!sortFieldKeys.includes(icField))) {
            // Warn about ignored sorts due to no sorting on subcollections.
            if (['array', 'object'].includes(fieldList[fieldListKeys[i]])) {
              let suggestion = '',
                candidateIdx = icFieldListKeys.indexOf(`${icField}.id`);
              if (candidateIdx !== -1) {
                suggestion = ` (did you mean '${fieldListKeys[i]}.id'?)`;
              }
              wrongTypeWarnings.push(`'${fieldListKeys[i]}'${suggestion}`);

            // Found a valid sort.
            } else {
              sortFieldKeys.push(icField);
              sort[fieldListKeys[i]] = order;
              break;
            }
          }
        }
      }
    });

    // Warn about stuff.
    if (wrongFormatWarnings.length > 0) {
      req.queueAPIWarning(400, 'invalid-arguments',
        `Ignoring ${wrongFormatWarnings.length} 'sort' argument(s) ` +
        `with invalid formatting.  Sort argument format is ` +
        `'<field-name>:[asc|desc]': ${wrongFormatWarnings.join(', ')}`
      );
    }
    if (wrongTypeWarnings.length > 0) {
      req.queueAPIWarning(400, 'invalid-arguments',
        `Ignoring ${wrongTypeWarnings.length} 'sort' argument(s) ` +
        `because sorts cannot be performed directly on objects or ` +
        `arrays -- specify ids or specific fields: ` +
        `${wrongTypeWarnings.join(', ')}`
      );
    }
    queueUnrecognizedWarning(req, fieldListKeys, reqFieldKeys, 'sort');
    queueDuplicatesWarning(req, reqFieldKeys, 'sort');

    return sort;
  },

  /**
    parseFilters() - Validates the filter argument and parses it into a
    "filter parse tree" that can be used to more easily construct a db query
    based on the filter.

    For now, we won't do any reorganizing of filter clauses, just parse the
    filter argument, make sure it is logically valid and has valid field names,
    translate its clauses to their one-to-one SQL operator and binding
    equivalents, and assemble them into a 'filter parse tree'.  Output the root
    node of this tree, as described below:
    Filter parse tree nodes can have the following fields:
      {
        type: 'logicOp' | 'objects' | 'clause'
        text: 'bands.clickCount > $b1' for 'clause' nodes
              'and'/'or'/'not' for 'logicOp' nodes
        bind: { b1: 10 } for 'clause' nodes
        objects: [object.name, object.name, ...], objects needed below this node
        fields: [field.name, field.name], fully qualified db fields below node
        parent: <node>
        children: [<node>, <node>, ...]
      }
    Example:
    The filter query arg:
      /bands?filter=
        bands.cities.name=portland and bands.peopleCount gt 2 or 
        bands.clickCount gt 10 or bands.people.roles.activeDates.from gt 2015
        &sort=bands.clickCount:desc&limit=3
    Returns the filter parse tree:
      {objects,[bands,bands.cities,bands.people.roles.activeDates]}
        {logicOp,'or'}
          {objects,[bands,bands.cities]}
            {logicOp,'and'}
              {objects,[bands.cities]}
                {clause,'bands.cities.name=portland'}
              {objects,[bands]}
                {clause,'bands.peopleCount > 2'}
          {objects,[bands,bands.people.roles.activeDates]}
            {logicOp,'or'}
              {objects,[bands]}
                {clause}
              {objects,[bands.people.roles.activeDates]}
                {clause,'bands.people.roles.activeDates.from > 2015'}
  */
  parseFilters = (
    req, res,
    fieldList,
    fieldListKeys,
    icFieldListKeys
  ) => {

    let dbPrefix = req.bandMap.dbPrefix,

      rawFilterParam = req.bandMap.params.filter,
      filterParam = [],

      tokenDelimiters = 
        [
          ' ', '\t', '\n', "'", '"', '(', ')',
          '=', '!', '>', '<'
        ],
      singleCharacterTokens = ["'", '"', '(', ')'],
      comparisonOperators = {
        '=': '=',
        '!=': '!=',
        '>': '>',
        '>=': '>=',
        '<': '<',
        '<=': '<=',
        'like': 'like',
        'not like': 'not like',

        'eq': '=',
        'ne': '!=',
        'gt': '>',
        'ge': '>=',
        'lt': '<',
        'le': '<=',
        'ct': 'like',
        'not ct': 'not like'
      },
      comparisonOperatorsArr = Array.from(Object.keys(comparisonOperators)),
      logicalOperators = ['and', 'or'],
      reservedWords =
        singleCharacterTokens.concat(
          comparisonOperatorsArr).concat(logicalOperators),

      /** Convert filter string into a linear array of tokens. */
      tokenizeFilterStr = filterStr => {
        let tokens = [],
          i = 0,
          c = '',
          token = '',
          openParens = 0,
          inEscapeChar = false,
          inQuote = false,
          inDoubleQuote = false,
          // The last token clause part can be one of: 
          // none | unaryNot | field | not | cmpOperator | operand | logicalOperator
          // Where each, if appearing, has to follow the other in order, there can
          // be any number of unaryNots strung together, but "not" is only valid as
          // part of a "not ct" operator.
          lastTokenClausePart = 'none',
          lastField = '',
          lastCmpOperator = '',

          // Validate the field, operator, and operand of the clause, and
          // return a tuple (3-element array) of sanitized, formatted
          // field, operator, and operand.
          validateClause = (icField, cmpOperator, operand) => {
            let field = fieldListKeys[icFieldListKeys.indexOf(icField)],
              fieldType = fieldList[field];
            if (['ct', 'not ct', 'like', 'not like'].includes(cmpOperator)) {
              if (fieldType !== 'string') {
                req.throwAPIError(400, 'invalid-filter',
                  `The '${cmpOperator}' operator only works with string ` +
                  `values but it was used with ${fieldType} field '${field}' ` +
                  `in filter at index ${i}: '${filterStr.substring(0, i+1)}...'`
                );
              }
              // "Contains" implies anywhere in the string, so lets put %%
              // tokens around the search substring for SQL.
              if (['ct', 'not ct'].includes(cmpOperator)) {
                operand = `%${operand}%`;
              }
            }
            if (['number', 'integer'].includes(fieldType)) {
              if (!utils.isNumeric(operand)) {
                req.throwAPIError(400, 'invalid-filter',
                  `Numeric field '${field}' can only be compared against ` +
                  `numeric types, but it was compared to '${operand}' ` +
                  `in filter at index ${i}: '${filterStr.substring(0, i+1)}...'`
                );
              }
            } else if (['date', 'dateTime'].includes(fieldType)) {
              // Attempt to parse time very forgivingly.
              let momentFormatOptions =
                [moment.ISO_8601, 'YYYY-MM-DD', 'YYYY', 'HH:mm:ss'],
                m = moment(operand, momentFormatOptions);
              if (!m.isValid()) {
                req.throwAPIError(400, 'invalid-filter',
                  `Could not parse a date or date-time value from ` +
                  `'${operand}' for field '${field}' in filter ` +
                  `at index ${i}: '${filterStr.substring(0, i+1)}...'`
                );
              }
              // Output ISO 8601.
              operand = m.format();
            } else if (reservedWords.includes(operand)) {
              // Quote operand just to avoid mistaking it for an operator
              // if it's 'and' or 'or' or something for some reason.
              operand = `'${operand}'`;
            }
            return [field, comparisonOperators[cmpOperator], operand];
          },

          finishClause = operand => {
            let validClause =
              validateClause(lastField, lastCmpOperator, operand);
            // Pop the last field and last comparison operator off the stack,
            // replace them with the validated clause triple.
            tokens.pop();
            tokens.pop();
            tokens = tokens.concat(validClause);
            lastTokenClausePart = 'operand';
          },

          processToken = () => {
            token = token.trim();
            if ((inQuote && c === "'") || (inDoubleQuote && c === '"')) {
                // Parse string literal.
                // String literals can only appear as operands.
                if (lastTokenClausePart === 'cmpOperator') {
                  inQuote = inDoubleQuote = false;
                  finishClause(token);
                } else {
                  req.throwAPIError(400, 'invalid-filter',
                    `Unexpected string literal '${token}' in filter at ` +
                    `index ${i}: '${filterStr.substring(0, i+1)}...'`
                  );
                }

            } else if (token.length !== 0) { // Ignore extra whitespace.

              if (token === "'") {
                // Begin single-quoted string literal.
                inQuote = true;

              } else if (token === '"') {
                // Begin double-quoted string literal.
                inDoubleQuote = true;

              } else if (token === '(') {
                if (['none', 'unaryNot', 'logicalOperator'].includes(
                    lastTokenClausePart)) {
                  // Open parens.
                  openParens++;
                  tokens.push('(');
                } else {
                  // Reject unexpected open parens.  No parens allowed in clauses.
                  req.throwAPIError(400, 'invalid-filter',
                    `Unexpected open parenthesis in filter at index ${i}: ` +
                    `'${filterStr.substring(0, i+1)}...'`
                  );
                }

              } else if (token === ')') {
                if (['operand'].includes(lastTokenClausePart) && openParens >= 1) {
                  // Close parens.
                  openParens--;
                  tokens.push(')');
                } else {
                  // Reject unexpected close parens.  No parens allowed in clauses.
                  req.throwAPIError(400, 'invalid-filter',
                    `Unexpected close parenthesis at index ${i}: ` +
                    `'${filterStr.substring(0, i+1)}...'`
                  );
                }

              } else if (token === 'not') {
                if (lastTokenClausePart === 'field') {
                  // Continue processing 'not ct' operator.
                  lastTokenClausePart = 'not';

                // Unary not operators can only appear at the beginning of clauses.
                } else if (['none', 'logicalOperator', 'unaryNot'].includes(
                  lastTokenClausePart)) {
                  tokens.push('not');
                  lastTokenClausePart = 'unaryNot';

                } else {
                  // Reject unexpected unary negation operator.
                  req.throwAPIError(400, 'invalid-filter',
                    `Unexpected 'not' operator in filter at index ${i}: ` +
                    `'${filterStr.substring(0, i+1)}...'`
                  );
                }

              } else if (comparisonOperatorsArr.includes(token)) {
                if (lastTokenClausePart === 'not') {
                  // Parse 'not ct' operator.
                  if (['ct', 'like'].includes(token)) {
                    token = `not ${token}`;
                    tokens.push(token);
                    lastCmpOperator = token;
                    lastTokenClausePart = 'cmpOperator';
                  } else {
                    // Unexpected comparison operator.
                    req.throwAPIError(400, 'invalid-filter',
                      `Unexpected '${token}' operator in filter at index ${i}: ` +
                      `'${filterStr.substring(0, i+1)}...'`
                    );
                  }

                } else if (lastTokenClausePart === 'field') {
                  // Parse comparison operator.
                  tokens.push(token);
                  lastCmpOperator = token;
                  lastTokenClausePart = 'cmpOperator';

                } else {
                  // Unexpected comparison operator.
                  req.throwAPIError(400, 'invalid-filter',
                    `Unexpected '${token}' operator in filter at index ${i}: ` +
                    `'${filterStr.substring(0, i+1)}...'`
                  );
                }

              } else if (logicalOperators.includes(token)) {
                if (lastTokenClausePart === 'operand') {
                  // Parse logical operator.
                  tokens.push(token);
                  lastTokenClausePart = 'logicalOperator';

                } else {
                  // Unexpected logical operator.
                  req.throwAPIError(400, 'invalid-filter',
                    `Unexpected '${token}' operator in filter at index ${i}: ` +
                    `'${filterStr.substring(0, i+1)}...'`
                  );
                }

              } else if (['none', 'unaryNot', 'logicalOperator'].includes(
                lastTokenClausePart)) {
                if (icFieldListKeys.includes(token)) {
                  // Parse field.
                  tokens.push(
                    fieldListKeys[icFieldListKeys.indexOf(token)]);
                  lastField = token;
                  lastTokenClausePart = 'field';

                } else {
                  // Unrecognized field name.
                  let suggestion =
                    suggestAlternate(token, fieldListKeys, icFieldListKeys);
                  req.throwAPIError(400, 'invalid-filter',
                    `Unrecognized field '${token}' in filter at index ${i}` +
                    `${suggestion}: '${filterStr.substring(0, i+1)}...'`
                  );
                }

             } else if (lastTokenClausePart === 'cmpOperator') {
                // Parse operand.
                finishClause(token);

              } else {
                // Unexpected token.
                req.throwAPIError(400, 'invalid-filter',
                  `Unexpected token '${token}' in filter at index ${i}: ` +
                  `'${filterStr.substring(0, i+1)}...'`
                );
              }
            }

            // We consumed the last token.  Start a new one.
            token = '';
          };

        while (i < filterStr.length) {
          c = filterStr[i];

          if (inEscapeChar) {
            if (c === 'n') {
              token += '\n';
            } else if (c === 't') {
              token += '\t';
            } else {
              token += c;
            }
            inEscapeChar = false;

          } else if (c === '\\') {
            if (inQuote || inDoubleQuote) {
              // Start escape sequence in string literal.
              inEscapeChar = true;
            } else {
              // Reject unexpected escape character.
              req.throwAPIError(400, 'invalid-filter',
                `Unexpected escape character in filter at index ${i}: ` +
                `'${filterStr.substring(0, i+1)}...'`
              );
            }

          } else if (inQuote) {
            if (c === "'") {
              // End single-quoted string literal token.
              processToken();
            } else {
              // Continue single-quoted string literal token.
              token += c;
            }

          } else if (inDoubleQuote) {
            if (c === '"') {
              // End double-quoted string literal token.
              processToken();
            } else {
              // Continue double-quoted string literal token.
              token += c;
            }

          } else if (tokenDelimiters.includes(c)) {
            // End token at delimiter.
            processToken();
            token = c;
            // If our delimiter was also a single character token ' " ( ),
            // process it now to prevent accumulating more stuff on the next cycle.
            if (singleCharacterTokens.includes(c)) {
              processToken();
            } else {
              // Peek ahead for some special operator cases:
              // If we're moving from one of =, !=, <, <=, >, >= into a space
              // or alphanumeric, process the one or two characters as an
              // (operator) token.
              let candidate = c;
              if (['!', '<', '>'].includes(candidate)) {
                let twoChars = `${c}${filterStr[i+1]}`;
                if (['!=', '<=', '>='].includes(twoChars)) {
                  candidate = twoChars;
                  ++i;
                }
              }
              if (['=', '!=', '<', '<=', '>', '>='].includes(candidate)) {
                token = candidate;
                processToken();
              }
            }

          } else {
            // Continue token.
            token += c;
          }

          ++i;
        }

        // End final token at end of string delimiter.
        processToken();

        // Final validation.
        if (filterStr.length > 0 && lastTokenClausePart !== 'operand') {
          req.throwAPIError(400, 'invalid-filter',
            `Filter argument is missing a final operand: ${filterStr}`
          );
        }
        if (openParens !== 0) {
          req.throwAPIError(400, 'invalid-filter',
            `Filter argument is missing a close parenthesis ')': ${filterStr}'`
          );
        }

        return tokens;
      },

      // Return the index of the close paren matching the open paren at index
      // 'start' in array 'arr', or -1 if there is no matching close paren.
      indexOfCloseParen = (start, arr) => {
        let openParens = 1,
          end = start + 1,
          arrLen = arr.length,
          t;
        for (; end < arrLen; end++) {
          t = arr[end];
          if (t === '(') {
            openParens++;
          } else if (t === ')') {
            openParens--;
            if (openParens === 0) {
              return end;
            }
          }
        }
        return -1;
      },

      // Group tokens enclosed by paren strings in 'arr' into subarrays.
      // [() and () or ()] => [[] and [] or []]
      groupParens = arr => {
        let output = arr.slice(),
          start = output.indexOf('(');
        while (start !== -1) {
          let end = indexOfCloseParen(start, output);
          if (end === -1) {
            throw new Error(
              'Unexpected end of tokens array while parsing filter.');
          }
          let before = output.slice(0, start),
            group = output.slice(start+1, end),
            after = output.slice(end+1);
          output = before.concat([group]).concat(after);
          start = output.indexOf('(');
        }
        return output;
      },

      // Recursively group tokens preceded by the specified unary operator into
      // subarrays with the unary operator as the first element.
      // [not ... and not not ...] => [[not ...] and [not [not ...]]]
      groupUnary = (unaryOp, arr) => {
        let input = arr.slice(),
          output = [];
        while (input.length > 0) {
          let nextToken = input.shift();
          if (nextToken === unaryOp) {
            let unaryGroup = [];
            // End negation group at subsequent logic op or end of tokens.
            while (input.length > 0) {
              nextToken = input.shift();
              if (logicalOperators.includes(nextToken)) {
                break;
              } else {
                unaryGroup.push(nextToken);
              }
            }
            output.push([
              unaryOp,
              // If the subgroup was already grouped, don't double-wrap it.
              unaryGroup.length === 1 ? unaryGroup[0] : unaryGroup
            ]);
            if (input.length > 0) {
              // Don't forget to push the subsequent logic op token if we're
              // still going.
              output.push(nextToken);
            }
          } else {
            output.push(nextToken);
          }
        }
        // Might as well unwrap it if there was only one grouping.
        return output.length === 1 ? output[0] : output;
      },

      // Group tokens preceded by the specified logic operator into subarrays
      // with the unary operator as the first element.
      // [() and () or () and ()] => [[[] and []] or [[] and []]]
      // [() and () and ()] => [[[] and [] and []]]
      groupLogicOps = (logicOp, arr) => {
        let input = arr.slice(),
          subgroup = [],
          group = [],
          output = [];

        while (input.length > 0) {
          let nextToken = input.shift();
          if (logicalOperators.includes(nextToken)) {
            if (nextToken === logicOp) {
              // If the subgroup was already grouped, don't double-wrap it.
              group.push(subgroup.length === 1 ? subgroup[0] : subgroup);
              group.push(logicOp);
              subgroup = []; // New subgroup for next clause.

            } else { // It's the other logic op.
              // Complete the preceding logicOp grouping if there was one.
              if (group.length > 0) {
                group.push(subgroup.length === 1 ? subgroup[0] : subgroup);
                output.push(group);

              // Otherwise add the accumulated tokens inline to the output.
              } else {
                output = output.concat(subgroup);
              }

              output.push(nextToken);
              subgroup = [];
              group = [];
            }

          } else {
            subgroup.push(nextToken);
          }
        }

        // If we have an unclosed group, finish it and dump it to output.
        if (group.length > 0) {
          group.push(subgroup.length === 1 ? subgroup[0] : subgroup);
          output.push(group);
        // Otherwise just flush the remaining tokens inline.
        } else {
          output = output.concat(subgroup);
        }

        // Might as well unwrap it if there was only one grouping.
        return output.length === 1 ? output[0] : output;
      },

      // Add any elements from array 'set2' to array 'set' that do not already
      // exist there.  Return a reference to 'set'.
      unionOfSet = (set, set2) => {
        set2.forEach(e => {
          if (!set.includes(e)) {
            set.push(e);
          }
        });
        return set;
      },

      getObjectsFromFields = fields => {
        let objects = [];
        fields.forEach(dbFieldName => {
          let fieldParts = dbFieldName.split('.'),
            obj = fieldParts.slice(0, fieldParts.length - 1).join('.');
          if (!objects.includes(obj)) {
            objects.push(obj);
          }
        });
        return objects;
      },

      bindingCount = 0,

      // Recursively build the filter parse tree,
      // turning filter substrings into nodes.
      parseNode = (node, nodeTokens) => {
        let objectsNeeded = [],
          fieldsNeeded = [],
          logicOp = 'none', // none | parens | not | and | or
          i;

        // Logical operator precedence: parens => not => and => or

        // If there are parentheses:
        i = nodeTokens.indexOf('(');
        if (i !== -1) {
          // Group all parenthesized subexpressions at this level.
          // [not () and () or not not () and not () or not ()]
          // => [not [] and [] or not not [] and not [] or not []]
          nodeTokens = groupParens(nodeTokens);
          logicOp = 'parens';
        }

        // If there are 'not' operators:
        i = nodeTokens.indexOf('not');
        if (i !== -1) {
          // Group all negated subexpressions at this level.
          // [not [] and [] or not not [] and not [] or not []]
          // => [[not []] and [] or [not not []] and [not []] or [not []]]
          // => [[] and [] or [] and [] or []]
          nodeTokens = groupUnary('not', nodeTokens);
          logicOp = 'not';
        }

        // If there are 'and' operators:
        i = nodeTokens.indexOf('and');
        if (i !== -1) {
          // Group all and'ed subexpressions at this level.
          // [[] and [] or [] and [] or []]
          // => [[[] and []] or [[] and []] or []]
          // => [[] or [] or []]
          nodeTokens = groupLogicOps('and', nodeTokens);
          logicOp = 'and';
        }

        // If there are 'or' operators:
        i = nodeTokens.indexOf('or');
        if (i !== -1) {
          // Group all or'd subexpressions at this level.
          // [[[] and []] or [[] and []] or []]
          // => [[] or [] or []]
          nodeTokens = groupLogicOps('or', nodeTokens);
          logicOp = 'or';
        }

        // Keep track of any child nodes that get generated with their objects
        // needed ([<child node>, <objects needed>] tuples).
        let children = [];

        // If there were 'and' or 'or' operators:
        if (logicalOperators.includes(logicOp)) {
          // Make 'and' or 'or' node: [[] or [] or []] / [[] and [] and []].
          node.type = 'logicOp';
          node.text = logicOp;
          nodeTokens.forEach(t => {
            if (Array.isArray(t)) {
              let childNode = {parent: node},
                childFieldsNeeded = parseNode(childNode, t),
                childObjectsNeeded = getObjectsFromFields(childFieldsNeeded);
              fieldsNeeded = unionOfSet(fieldsNeeded, childFieldsNeeded);
              objectsNeeded = unionOfSet(objectsNeeded, childObjectsNeeded);
              children.push([childNode, childObjectsNeeded, childFieldsNeeded]);
            }
          });

        // Else if there were 'not' operators:
        } else if (logicOp === 'not') {
          // Make 'not' node with [not []].
          node.type = 'logicOp';
          node.text = 'not';
          let childTokens = nodeTokens[1];
          let childNode = {parent: node},
            childFieldsNeeded = parseNode(childNode, childTokens),
            childObjectsNeeded = getObjectsFromFields(childFieldsNeeded);
          fieldsNeeded = childFieldsNeeded.slice();
          objectsNeeded = childObjectsNeeded.slice();
          children.push([childNode, childObjectsNeeded, childFieldsNeeded]);

        // Else if there were parentheses:
        } else if (logicOp === 'parens') {
          // They must have been around the entire expression at this level.
          // Remove them and iterate again without creating a new node.
          if (nodeTokens.length === 0) {
            throw new Error(
              `Unexpected empty parentheses grouping while parsing filter.`);
          } else if (nodeTokens.length > 1) {
            throw new Error(
              `Unexpected multiple parentheses groupings without other ` +
              `logic operators while parsing filter.`);
          }
          return parseNode(node, nodeTokens[0]);

        // Else base case: make leaf clause node.
        } else {
          if (nodeTokens.length !== 3) {
            throw new Error(
              `Unexpected extra tokens in clause '${nodeTokens.join(' ')}' ` +
              `while parsing filter.`);
          }
          let removeApiPrefix = req.bandMap.apiPrefix.length > 0,
            field =
              nodeTokens[0].split('.').slice(removeApiPrefix ? 1 : 0).join('.'),
            operator = nodeTokens[1],
            operand = nodeTokens[2],
            dbFieldName = `${dbPrefix}${field}`;

          node.type = 'clause';
          bindingCount++;
          let bindingName = `$b${bindingCount}`;
          node.text = `${dbFieldName} ${operator} ${bindingName}`;
          node.bind = {};
          node.bind[bindingName] = operand;
          fieldsNeeded = [dbFieldName];
          objectsNeeded = getObjectsFromFields(fieldsNeeded);
        }

        // If a child node requires a different set (subset) of objects
        // from the parent, insert an 'objects' node between them.
        // Also add the child nodes to a list on this node.
        if (children.length > 0) {
          node.children = [];
          children.forEach(child => {
            let childNode = child[0],
               childObjectsNeeded= child[1],
               childFieldsNeeded = child[2];
            if (objectsNeeded.length > childObjectsNeeded.length) {
              let objsNode = {
                parent: node,
                type: 'objects',
                objects: childObjectsNeeded,
                fields: childFieldsNeeded,
                children: [childNode]
              };
              childNode.parent = objsNode;
              node.children.push(objsNode);
            } else {
              node.children.push(childNode);
            }
          });
        }

        return fieldsNeeded;
      };

    // Concatenate multiple filter arguments into one,
    if (toString.call(rawFilterParam) === '[object Array]') {
      rawFilterParam = rawFilterParam.join(',');
    }

    // Interpret ',' in the filter arguments as 'and'.
    rawFilterParam = rawFilterParam.split(',');
    rawFilterParam.forEach(f => {
      filterParam.push(f.trim());
    });
    if (filterParam.length > 1) {
      filterParam = `(${filterParam.join(') and (')})`;
    } else {
      filterParam = filterParam[0];
    }
    filterParam = filterParam.trim();
    if (filterParam.length === 0) {
      return undefined; // No filter string, no filter tree.
    }
    let icFilterParam = filterParam.toLowerCase(),

      // Tokenize the filter string.
      tokens = tokenizeFilterStr(icFilterParam),

      rootNode = {},
      allFieldsNeeded = parseNode(rootNode, tokens),
      allObjectsNeeded = getObjectsFromFields(allFieldsNeeded),

      // Insert root objects node with all needed objects.
      objsNode = {
        type: 'objects',
        objects: allObjectsNeeded,
        fields: allFieldsNeeded,
        children: [rootNode]
      };

    rootNode.parent = objsNode;
    rootNode = objsNode;

    return rootNode;
  },

  // Recursively return a JSON/YAML dump-frendly version of
  // a filter parse tree.
  printableFilterTree = node => {
    if (node === undefined) {
      return 'undefined';

    } else if (node.type === 'objects') {
      return [
        `${node.objects.join(' ')}`,
        printableFilterTree(node.children[0])
      ];

    } else if (node.type === 'logicOp') {
      let children = [];
      node.children.forEach(c => {
        children.push(printableFilterTree(c));
      });
      if (children.length > 0) {
        return [node.text, children];
      }

    } else if (node.type === 'clause') {
      return [`${node.text} {bind: ${Array.from(Object.values(node.bind))}}`];
    }

  };

module.exports = {
  parseParameters: parseParameters,
  parseSort: parseSort,
  parseFilters: parseFilters,
  printableFilterTree: printableFilterTree
};


})();