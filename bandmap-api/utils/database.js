(function () {
'use strict';

const debug = require('debug')('band-map-api'),

  tloNames =
    require('../utils/top-level-object-names.js').byNameForm.camelCasePlural,
  utils = require('../utils/utils.js'),
  nameFromPath = utils.nameFromPath,

  Sequelize = require('sequelize');

let sequelize = new Sequelize('bandmap', 'postgres', 'a', {
    host: 'localhost',
    port: 5432,
    dialect: 'postgres',
    operatorsAliases: false,
    pool: {
      max: 16,
      min: 0,
      idle: 1000
    },
    logging: message => debug(message) //false
  });

// Object field index constants:
const
  COLUMN_NAME = 0,
  DATA_TYPE = 1,
  ALTERNATE_TABLE_ALIAS = 2,

  objects = {
    bands: Object.assign({
      aliasPart: 'b',
      table: 'bands',
      fields: {
        // Lower case API field name to tuple of form:
        // [<column name>, <data type>, <has lower case index>].
        id: ['id', 'integer'],
        name: ['name', 'string'],
        clickCount: ['click_count', 'integer']
      },
      joins: {
        // TODO
      },
      counts: {
        'root': {
          select: `SELECT count(*) AS count FROM {{alias}}`,
          join: `LEFT JOIN b_count ON TRUE`
        }
      }
    }, tloNames.bands),

    people: Object.assign({
      aliasPart: 'p',
      table: 'people',
      fields: {
        id: ['id', 'integer'],
        name: ['name', 'string'],
        clickCount: ['click_count', 'integer']
      },
      joins: {
        'bands':
          `JOIN band_person_roles AS bpr
           ON b_p.id = bpr.person_id
           {{joinType}} JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bpr.band_id`
      },
      counts: {
        'bands': {
          select:
            `SELECT
             {{alias}}.bands__id AS bands__id,
             COUNT(*) AS count
             FROM  {{alias}}
             WHERE {{alias}}.bands_people__id IS NOT NULL
             GROUP BY {{alias}}.bands__id
             UNION SELECT
             {{alias}}.bands__id AS bands__id,
             0 AS count
             FROM {{alias}}
             WHERE {{alias}}.bands_people__id IS NULL
             GROUP BY {{alias}}.bands__id`,
          join: `LEFT JOIN b_p_count ON b_p_count.bands__id = b_p.bands__id`
        }
      }
    }, tloNames.people),

    roles: Object.assign({
      aliasPart: 'r',
      table: 'roles',
      fields: {
        id: ['id', 'integer'],
        name: ['name', 'string']
      },
      joins: {
        'bands.people':
          `JOIN band_person_roles AS bpr
           ON b_p_r.id = bpr.role_id
           {{joinType}} JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bpr.band_id AND {{prevAlias}}.bands_people__id = bpr.person_id`
      },
      counts: {
        'bands.people': {
          select:
            `SELECT
             {{alias}}.bands__id AS bands__id,
             {{alias}}.bands_people__id AS bands_people__id,
             COUNT(*) AS count
             FROM {{alias}}
             WHERE {{alias}}.bands_people_roles__id IS NOT NULL
             GROUP BY {{alias}}.bands__id,
             {{alias}}.bands_people__id
             UNION SELECT
             {{alias}}.bands__id AS bands__id,
             {{alias}}.bands_people__id AS bands_people__id,
             0 AS count
             FROM {{alias}}
             WHERE {{alias}}.bands_people_roles__id IS NULL
             GROUP BY {{alias}}.bands__id,
             {{alias}}.bands_people__id`,
          join:
            `LEFT JOIN b_p_r_count
             ON b_p_r_count.bands__id = b_p_r.bands__id
             AND b_p_r_count.bands_people__id = b_p_r.bands_people__id`
        }
      }
    }, tloNames.roles),

    activeDates: Object.assign({
      aliasPart: 'ad',
      table: 'active_dates',
      fields: {
        id: ['id', 'integer'],
        from: ['from', 'date'],
        until: ['until', 'date']
      },
      joins: {
        'bands':
          `JOIN band_active_dates AS bad
           ON b_ad.id = bad.active_dates_id
           RIGHT JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bad.band_id`,
        // TODO: There is no band_person_active_dates table and the following
        // 'bands.people' join will currently just dump all the
        // band_person_roles_active_dates spans into one query.  Instead make
        // a custom SELECT that fuses the earliest and latest bpr active dates
        // spans:
        'bands.people':
          `JOIN band_person_role_active_dates AS bprad
           ON b_p_ad.id = bprad.active_dates_id
           RIGHT JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bprad.band_id
           AND {{prevAlias}}.bands_people__id = bprad.person_id`,
        'bands.people.roles': 
          `JOIN band_person_role_active_dates AS bprad
           ON b_p_r_ad.id = bprad.active_dates_id
           RIGHT JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bprad.band_id
           AND {{prevAlias}}.bands_people__id = bprad.person_id
           AND {{prevAlias}}.bands_people_roles__id = bprad.role_id`,
        'bands.cities':
          `JOIN band_city_active_dates AS bcad
           ON b_c_ad.id = bcad.active_dates_id
           RIGHT JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bcad.band_id`,
        'bands.cityStateCountries':
          `JOIN band_city_active_dates AS bcad
           ON b_csc_ad.id = bcad.active_dates_id
           RIGHT JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bcad.band_id`
      }
    }, tloNames.activeDates),

    cityStateCountries: Object.assign({
      aliasPart: 'csc',
      fields: {
        id: ['id', 'integer'],
        name: ['name', 'string']
      },
      withClause:
       `SELECT
        {{fields}}
        FROM (
          SELECT
          c.id AS id,
          c.name || ', ' || s.name || ', ' || co.name AS name
          FROM cities AS c
          JOIN states AS s
          ON c.state_id = s.id
          JOIN countries AS co
          ON s.country_id = co.id
        ) AS {{alias}}
        {{wheres}}`,
      joins: {
        'bands':
          `JOIN band_cities AS bc
           ON b_csc.id = bc.city_id
           {{joinType}} JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bc.band_id`
      },
      counts: {
        'bands': {
          select:
            `SELECT
            {{alias}}.bands__id AS bands__id,
            COUNT(*) AS count
            FROM {{alias}}
            WHERE {{alias}}.bands_citystatecountries__id IS NOT NULL
            GROUP BY {{alias}}.bands__id
            UNION SELECT
            {{alias}}.bands__id AS bands__id,
            0 AS count
            FROM {{alias}}
            WHERE {{alias}}.bands_citystatecountries__id IS NULL
            GROUP BY {{alias}}.bands__id`,
          join: `LEFT JOIN b_csc_count ON b_csc_count.bands__id = b_csc.bands__id`
        }
      }
    }, tloNames.cityStateCountries),

    cities: Object.assign({
    }, tloNames.cities),

    connectedBands: Object.assign({
      aliasPart: 'cb',
      table: 'bands',
      fields: {
        id: ['id', 'integer'],
        name: ['name', 'string'],
        description: ['description', 'string', 'cx']
      },
      joins: {
        'bands':
          `JOIN connections AS cx
           ON (b_cb.id = cx.band_1_id OR b_cb.id = cx.band_2_id)
           {{joinType}} JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id != b_cb.id
           AND ({{prevAlias}}.bands__id = cx.band_1_id OR {{prevAlias}}.bands__id = cx.band_2_id)`
      },
      counts: {
        'bands': {
          select:
            `SELECT
            {{alias}}.bands__id AS bands__id,
            COUNT(*) AS count
            FROM {{alias}}
            WHERE {{alias}}.bands_connectedbands__id IS NOT NULL
            GROUP BY {{alias}}.bands__id
            UNION SELECT
            {{alias}}.bands__id AS bands__id,
            0 AS count
            FROM {{alias}}
            WHERE {{alias}}.bands_connectedbands__id IS NULL
            GROUP BY {{alias}}.bands__id`,
          join: `LEFT JOIN b_cb_count ON b_cb_count.bands__id = b_cb.bands__id`
        }
      }

    }, tloNames.connectedBands),

    infoSources: Object.assign({
      aliasPart: 'i',
      table: 'info_sources',
      fields: {
        id: ['id', 'integer'],
        url: ['url', 'string'],
        description: ['description', 'string']
      },
      joins: {
        'bands':
          `JOIN band_info_sources AS bis
           ON b_i.id = bis.info_source_id
           {{joinType}} JOIN {{prevAlias}}
           ON {{prevAlias}}.bands__id = bis.band_id`
      },
      counts: {
        'bands': {
          select:
            `SELECT
             {{alias}}.bands__id AS bands__id,
             COUNT(*) AS count
             FROM {{alias}}
             WHERE {{alias}}.bands_infosources__id IS NOT NULL
             GROUP BY {{alias}}.bands__id
             UNION SELECT
             {{alias}}.bands__id AS bands__id,
             0 AS count
             FROM {{alias}}
             WHERE {{alias}}.bands_infosources__id IS NULL
             GROUP BY {{alias}}.bands__id`,
          join: `LEFT JOIN b_i_count ON b_i_count.bands__id = b_i.bands__id`
        }
      }
    }, tloNames.infoSources)

  };

const specialCaseFieldNames = {
    'bands.cities': 'bands.cityStateCountries',
    'bands.webLinks': 'bands.infoSources'
  };

let getSpecialCaseFieldName = dbFieldName => {
    Object.entries(specialCaseFieldNames).forEach(
      ([k, v]) => dbFieldName = dbFieldName.replace(k, v));
    return dbFieldName;
  },

  /** 
  Return true if the specified field name is a *Count field 
  ("<object>sCount").
  */
  isCountField = fieldName => {
    // Is a count field if it ends with 'Count' and the part before 'Count'
    // spells out the camel case plural name of a top level Band Map object.
    if (fieldName.endsWith('Count')) {
      let objName = fieldName.substr(0, fieldName.length - 5);
      return utils.isObject(tloNames[objName]);
    }
    return false;
  },

  buildAlias = objectPathParts =>
    objectPathParts.map(p => objects[p].aliasPart).join('_'),

  /** 
  Convert a fully qualified DB field name to the output field name
  returned by db.get():
    path.toObject.fieldName => path_to_object__fieldname
  */
  getOutputFieldName = fullInputFieldName => {
    let parts = fullInputFieldName.split('.'),
      firstParts = parts.slice(0, parts.length-1),
      lastPart = parts[parts.length-1];

    // Special case: for *Count fields the output field is one level deeper
    // in the object nestings: bands.peopleCount => bands_people__count
    // and the root object field name count is just called 'total' in the API
    // layer (but still "*__count" in the DB layer).
    if (lastPart === 'total') {
      lastPart = 'count';
    } else if (isCountField(lastPart)) {
      let objName = lastPart.substr(0, lastPart.length - 5);
      firstParts.push(objName);
      lastPart = 'count';
    }

    return (firstParts.join('_') + '__' + lastPart).toLowerCase();
  },

  inputToOutputFields =
    inputFields => inputFields.map(i => getOutputFieldName(i)),

  addPrefixes = (prefix, strings) => {
    let prefixed = [];
    for (let i = 0; i < strings.length; i++) {
      prefixed.push(`${prefix}${strings[i]}`);
    }
    return prefixed;
  },

  /** Return array of strings of form 'b.name AS bands_name'. */
  makeFieldClauses = (fields, finalFields) => {
    let fClauses = [];
    for (let i = 0; i < fields.length; i++) {
      fClauses.push(`${fields[i]} AS ${finalFields[i]}`);
    }
    return fClauses;
  },

  makeCountJoin = pObjPathParts => {
    let pObj = objects[pObjPathParts[pObjPathParts.length-1]],
      ppObjPathParts = pObjPathParts.slice(0, pObjPathParts.length - 1),
      ppObjPath = ppObjPathParts.join('.'),
      pCountRequester = ppObjPath.length > 0 ? ppObjPath : 'root';
    return (
      pObj.counts ?
        pObj.counts[pCountRequester] ?
          pObj.counts[pCountRequester].join || undefined :
          undefined :
        undefined
    );
  },

  joinClause = (cObjPath, obj, prevAlias, joinType = 'INNER') =>
    obj.joins[cObjPath]
    .replace(/{{joinType}}/g, joinType)
    .replace(/{{prevAlias}}/g, prevAlias) + '\n',

  // Return a 'with' clause based on the specified parameters.
  withClause = (
    alias,
    pAlias,
    cObjPath,
    obj,
    fieldClauses,
    filterClauses,
    sortClauses,
    countJoin,
    countSelect,
    isCountFiltered,
    limit = undefined,
    offset = undefined,
    postfix = '') => {

    let outerSql = `
      ${alias}${postfix} AS (
        {{innerSql}}
      )`,
      innerSql = obj.withClause ||
       `SELECT
        {{fields}}
        FROM ${obj.table} AS {{alias}}
        {{wheres}}`,
      fieldsStr = addPrefixes('        ', fieldClauses).join(',\n').trim(),
      wheresStr = addPrefixes('        ', filterClauses).join(' AND\n').trim(),
      joinStr = '';

    // Replace any {{alias}} tokens in the with clause template with actual
    // SELECT alias.
    innerSql = innerSql.replace(/{{alias}}/g, alias);

    // Join to containing object table at beginning of {{wheres}}.
    if (cObjPath !== undefined) {
      joinStr = joinClause(cObjPath, obj, pAlias, 'RIGHT');
    }

    // Join to the previous object's count result set if there was one.
    if (countJoin !== undefined) {
      joinStr += `\n        ${countJoin}\n`;
    }

    // Add filters.
    if (wheresStr.length > 0) {
      wheresStr = '        WHERE ' + wheresStr;
    }

    // Add sorting.
    if (sortClauses && sortClauses.length > 0) {
      let sortStr = addPrefixes('        ', sortClauses).join(',\n').trim();
      wheresStr += `\n        ORDER BY ${sortStr}`;
    }

    // Add limit and offset.
    if (limit !== undefined) {
      wheresStr += `\n        LIMIT $limit`;
    }
    if (offset !== undefined) {
      wheresStr += `\n        OFFSET $offset`;
    }

    let mainSql =
      innerSql
      .replace('{{fields}}', fieldsStr)
      .replace('{{wheres}}', `${joinStr}${wheresStr}`.trim()),

      sql = outerSql.replace('{{innerSql}}', mainSql);

    // Add count tables if needed.
    if (countSelect) {

      let countTarget = alias;

      // If there was a limit or offset or filters when we want to count
      // unfiltered objects, we need to make a new SELECT with no limit/offset/
      // filters to be sure to get the full number of objects we need.
      if (limit || offset || (wheresStr.length > 0 && !isCountFiltered)) {
        sql += ', ' +
        withClause( // Nested 'with' to get the unlimited collection to count.
          alias,
          pAlias,
          cObjPath,
          obj,
          fieldClauses,
          isCountFiltered ? filterClauses : [],
          undefined,
          undefined,
          undefined,
          false,
          undefined,
          undefined,
          '_all'
        );
        countTarget = `${alias}_all`;
      }

      countSelect = countSelect.replace(/{{alias}}/g, countTarget);

      sql += `,
      ${alias}_count AS (
        ${countSelect}
      )`;
    }

    return sql;
  },

  // Return a 'with' clause for filtering previous results based on the
  // specified parameters.
  withFilteredClause = (
    alias,
    fieldClauses,
    countJoin) => {

    let sql = `
      filtered AS (
        SELECT
        {{fields}}
        FROM ${alias}
        {{join}}
      )`,
      fieldsStr = addPrefixes('        ', fieldClauses).join(',\n').trim(),
      joinStr = '';

    // Join to the previous object's count result set if there was one.
    if (countJoin !== undefined) {
      joinStr += `\n        ${countJoin}\n`;
    }

    sql =
      sql
      .replace('{{fields}}', fieldsStr)
      .replace('{{join}}', joinStr.trim());

    return sql;
  },

  // Return a 'with' clause for grouping previous results based on the
  // specified parameters.
  withGroupedClause = (
    pAlias,
    fieldClauses,
    groupByField) => {

    let sql = `
      grouped AS (
        SELECT
        {{fields}}
        FROM ${pAlias}
        GROUP BY ${groupByField}
      )`,
      fieldsStr = addPrefixes('        ', fieldClauses).join(',\n').trim();

    sql = sql.replace('{{fields}}', fieldsStr);

    return sql;
  },

  // Return a 'with' clause for ordering previous results.
  withOrderedClause = (
    pAlias,
    fieldClauses,
    sortClauses,
    limit,
    offset) => {

    let sql = `
      ordered AS (
        SELECT
        {{fields}}
        FROM ${pAlias}
        ORDER BY {{sorts}}
      )`,

      fieldsStr = addPrefixes('        ', fieldClauses).join(',\n').trim(),

      sortStr = '';

    // Add sorting.
    if (sortClauses && sortClauses.length > 0) {
      sortStr = addPrefixes('        ', sortClauses).join(',\n').trim();
    }

    // Add limit and offset.
    if (limit !== undefined) {
      sortStr += `\n        LIMIT $limit`;
    }
    if (offset !== undefined) {
      sortStr += `\n        OFFSET $offset`;
    }

    sql =
      sql
      .replace('{{fields}}', fieldsStr)
      .replace('{{sorts}}', sortStr.trim());

    return sql;
  },

  /**
  Insert the specified entry into the specified array before the first
  element found with the specified prefix.
  */
  insertBefore = (entry, prefix, array) => {
    for (let i = 0, len = array.length; i < len; i++) {
      if (array[i].startsWith(prefix)) {
        array.splice(i, 0, entry);
        return;
      }
    }
    array.splice(array.length, 0, entry); // Default: insert at end.
  },

  /**
  Returns a promise whose fulfilled value will be the results of the database
  query for the object or series of nested objects specified in objectChain.

  objectChain is an array of form:
  [<object-config>, <object-config>, ...]

  Where each <object-config> is:
  {
    objectPath: Fully qualified, camel case plural form of object being queried.
    fields:  Optional array of DB field names to retrieve for this object.
             If not present, just the primary id of the object will be
             retrieved.  For each field specified, a field will be returned in
             the result rows of format 'path_to_object__fieldname' in all lower
             case.  For example, specifying 'name' and 'clickCount' fields on a
             'bands.people' object query will result in 'band_person__name' and
             'band_person__clickcount' fields being returned in the result set
             rows.
    count:   undefined | 'unfiltered' | 'filtered' (default undefined)
             If 'filtered', two additional SELECTs will be appended for this
             object, one to select the total number of these objects (no limit
             argument) grouped by each of their containing object(s), as
             filtered by 'filters'.
             If 'unfiltered', the SELECT for objects to count will not have the
             filters in 'filters' applied.
             If undefined, no object count will be attempted.
             Only needs to be specified for the root object -- nested count
             queries will be automatically invoked (as 'unfiltered') when
             *Count fields are found on containing objects.
    filters: Optional array of filters to apply to the object via WHERE clauses,
             each of form (for example):
             {filter: 'fieldName = $b1', bind: {b1: 'target value'}}
    sort:    Optional sort order for fields on this object.  Format is:
             {field_name: 'asc'|'desc', field_name: 'asc'|'desc', ...}
             Field names in filters and sort order should be either a DB field
             name of a field on the current object, or a fully qualified DB
             field path for a field on an earlier object in the object chain.
    limit:   Optional limit to apply to initial object count in chain.
    offset:  Optional offset to apply to initial object set in chain.
             Limit and offset should only appear on at most one of the objects
             in the objectChain.
    groupBy: Optional DB field path to use to group returned results for
             filter/sort/limit queries.  Should be a primary id of the root
             collection object and should only appear on the last object in
             the object chain, along with optional filters, sort, limit, and
             offset arguments.  Including an object config with a groupBy
             argument will trigger additional filter, group by, and order by
             SELECTs at the end of the query.
  }
  */
  get = objectChain => {
    // Build a chain of 'with' clauses building up the requested fields for
    // each object in the nested object chain.
debug('get() objectChain:',utils.toYaml(objectChain));
    let sql = `
      WITH
      {{withs}}
      {{finalSelect}}
      `,

      withs = '',
      nextBindNumber = 1,
      bind = {},
      allFinalFields = [],
      finalSortFields = [],
      limitedObjectPath,

      objectConfig,
      objectPath,
      objectPathParts,
      objName,
      obj,
      alias,
      tlo,
      primaryId,
      filters,
      lookupFields,
      finalAlias,
      fieldClauses,

      prevObjectConfig,
      pObj,
      pObjPath,
      pObjPathParts,
      pObjName,
      pAlias,
      pObjFinalFieldPrefix,

      cObj,
      cObjPath,
      cObjPathParts,
      cObjName;

    for (let i = 0; i < objectChain.length; i++) {
      objectConfig = objectChain[i];

      objectPath = objectConfig.objectPath;
      if (objectPath !== undefined) {
        objectPathParts = objectPath.split('.');
        objName = objectPathParts[objectPathParts.length-1];
        alias = buildAlias(objectPathParts);
        tlo = tloNames[objName];
        primaryId = tlo.primaryId;
        filters = objectConfig.filters || [];
        lookupFields = objectConfig.fields || [];
        obj = objects[objName];
      }

      // Look up parent info if there is a parent.
      if (i > 0) {
        prevObjectConfig = objectChain[i-1];
        pObjPath = prevObjectConfig.objectPath;
        pObjPathParts = pObjPath.split('.');
        pObjName = pObjPathParts[pObjPathParts.length-1];
        pObj = objects[pObjName];
        pAlias = buildAlias(pObjPathParts);
      }

      // Look up containing object info if there is a containing object.
      if (objectPath && objectPathParts.length > 1) {
        cObjPathParts = objectPathParts.slice(0, objectPathParts.length - 1);
        cObjPath = cObjPathParts.join('.');
        cObjName = cObjPathParts.slice().pop();
        cObj = objects[cObjName];
      }

      if (objectConfig.hasOwnProperty('groupBy')) {
        break;
      }

      // Always include the primary ID since it might be used in joins.
      // Always include it first since it is used by the object fetcher to know
      // when to descend to the next subobject level while scanning row results
      // linearly.
      if (lookupFields.indexOf(primaryId) !== 0) {
        utils.removeAll(lookupFields, primaryId);
        lookupFields.unshift(primaryId);
      }

      // Fields:
      // Only look up the API field names that have a corresponding database
      // column (the data fields).  Convert API field name to database column
      // name for easier lookup later.
      let lookupColumns = [],
        screenedLookupFields = [];
      for (let j = 0, jlen = lookupFields.length; j < jlen; j++) {
        let f = lookupFields[j];
        if (obj.fields.hasOwnProperty(f)) {
          screenedLookupFields.push(f);
          let fAlias = obj.fields[f][ALTERNATE_TABLE_ALIAS] || alias;
          lookupColumns.push(`${fAlias}.${obj.fields[f][COLUMN_NAME]}`);
        }
        // If this is a Count field for the count of an upcoming node in the
        // object chain, add a 'count' flag to the appropriate node.
        if (isCountField(f) && i < objectChain.length - 1) {
          let countObj = f.substr(0, f.length - 5);
          for (let j = i+1, jlen = objectChain.length; j < jlen; j++) {
            let nextObjPath = objectChain[j].objectPath,
              nextObjPathParts = nextObjPath.split('.'),
              nextObjName = nextObjPathParts[nextObjPathParts.length-1];
            if (countObj === nextObjName) {
              objectChain[j].count = 'unfiltered';
              break;
            }
          }
        }
      }
      lookupFields = screenedLookupFields;
      finalAlias = alias;

      let finalFieldPrefix =
        objectPath.replace(/\./g, '_').toLowerCase() + '__',
        finalFields = addPrefixes(
          finalFieldPrefix, utils.elementsToLowerCase(lookupFields));
      fieldClauses = makeFieldClauses(lookupColumns, finalFields);

      // Pass on all fields of interest from parent to child output table.
      if (pObj) {
        let pFieldClauses =
            makeFieldClauses(
              addPrefixes(`${pAlias}.`, allFinalFields),
              allFinalFields);
        fieldClauses = pFieldClauses.concat(fieldClauses);
      }
      allFinalFields = allFinalFields.concat(finalFields);

      // If we looked up the previous object count, insert that field into our
      // accumulating allFinalFields list and as the first thing in our current
      // table request.
      if (pObj && prevObjectConfig.count) {
        pObjFinalFieldPrefix =
          pObjPath.replace(/\./g, '_').toLowerCase() + '__';
        let pObjAliasPlusFFP = `${pAlias}.${pObjFinalFieldPrefix}`,
          pCountField = `${pObjFinalFieldPrefix}count`,
          pCountFieldClause = `${pAlias}_count.count AS ${pCountField}`;
        insertBefore(pCountField, pObjFinalFieldPrefix, allFinalFields);
        insertBefore(pCountFieldClause, pObjAliasPlusFFP, fieldClauses);
      }

      // Filters:
      // Renumber and aggregate filter bindings because we have to send all the
      // bindings at once.
      let filterClauses = [];
      for (let j = 0, jlen = filters.length; j < jlen; j++) {
        let f = filters[j],
          filter = f.filter,
          fBind = f.bind || {},
          filterParts = filter.trim().split(' '),
          fField = filterParts[0],
          simpleForm = fField.indexOf('__' === -1) ?
            fField : fField.split('__')[1],
          isString = obj.fields[simpleForm][DATA_TYPE] === 'string';
        // Prepend column names in filters with table alias.
        // Lowercase columns in filters that have lower case indices.
        fField =
          fField.indexOf('__' === -1) ?
            // Immediate field format.  Prepend current object alias
            // and convert to lower case if it's a string.
            isString ?
              `LOWER(${alias}.${obj.fields[fField][COLUMN_NAME]})` :
              `${alias}.${obj.fields[fField][COLUMN_NAME]}` :
            // Output field format.  Prepend previous object alias.
            `${pAlias}.${fField}`;
        filter = [fField].concat(filterParts.slice(1)).join(' ');

        for (let jj = 0, jjkeys = Array.from(Object.keys(fBind)),
          jjlen = jjkeys.length; jj < jjlen; jj++) {

          let bKey = jjkeys[jj],
            newBKey = `b${nextBindNumber}`;
          nextBindNumber++;
          filter = filter.replace(`$${bKey}`, `$${newBKey}`);
          bind[newBKey] = isString ? fBind[bKey].toLowerCase() : fBind[bKey];
        }

        filterClauses.push(filter);
      }

      // Sort:
      // Format sort fields.
      let sortClauses = [],
        sort = objectConfig.sort;
      if (sort) {
        let sFields = Array.from(Object.keys(sort));
        for (let j = 0, jlen = sFields.length; j < jlen; j++) {
          let sField = sFields[j],
            formattedSField, finalSortField;

          // For immediate field, prepend current object alias.
          if (sField.indexOf('.') === -1) {
            // Include sort fields in the fields lists if they are not already
            // there.  (This should only happen for immediate fields.)
            if (isCountField(sField)) {
              finalSortField = `${pObjFinalFieldPrefix}count`;
              let pCountFieldClause =
                `${pAlias}_count.count AS ${finalSortField}`,
                pObjAliasPlusFFP = `${pAlias}.${pObjFinalFieldPrefix}`;
              if (!fieldClauses.includes(pCountFieldClause)) {
                insertBefore(
                  finalSortField, pObjFinalFieldPrefix, allFinalFields);
                insertBefore(pCountFieldClause, pObjAliasPlusFFP, fieldClauses);
              }
            } else {
              let sortColumn = `${alias}.${obj.fields[sField][COLUMN_NAME]}`;
              finalSortField = `${finalFieldPrefix}${sField.toLowerCase()}`;
              let sortFieldClause =
                makeFieldClauses([sortColumn], [finalSortField])[0];
              if (!fieldClauses.includes(sortFieldClause)) {
                fieldClauses.push(sortFieldClause);
                allFinalFields.push(finalSortField);
              }
            }
            formattedSField =
              `${alias}.${obj.fields[nameFromPath(sField)][COLUMN_NAME]}`;

          // Fully qualified field.  Translate it to output field format
          // and prepend previous object alias (.
          } else {
            finalSortField = getOutputFieldName(sField);
            formattedSField = `${pAlias ? pAlias + '.' : ''}${finalSortField}`;
          }

          let order =
              objectConfig.sort[sField].toLowerCase() === 'asc' ?
              'ASC' :
              'DESC';
          sortClauses.push(`${formattedSField} ${order} NULLS LAST`);

          // Accumulate these sort fields for the sort on the final SELECT.
          // finalSortFields
          let finalSortFieldEntry = `${finalSortField} ${order} NULLS LAST`;
          if (!finalSortFields.includes(finalSortFieldEntry)) {
            finalSortFields.push(finalSortFieldEntry);
          }
        }
      }

      // Handle limit/offset.
      let limit = objectConfig.limit,
        offset = objectConfig.offset;
      if (limit !== undefined || offset !== undefined) {
        if (limitedObjectPath !== undefined) {
          throw new Error(
            `Unexpected limit/offset found while fetching object ` +
            `'${objectPath}' when there was already a limit/offset set on ` +
            `object '${limitedObjectPath}'.`);
        }
        limitedObjectPath = objectPath;
        if (limit !== undefined) {
          bind.limit = limit;
        }
        if (offset !== undefined) {
          bind.offset = offset;
        }
      }

      // Handle object count fields.
      // If we looked up previous object counts, join to the count table to get
      // those now.
      let countJoin;
      if (pObj && prevObjectConfig.count) {
        countJoin = makeCountJoin(pObjPathParts);
      }

      // If the previous object needs a count of this object, add the extra
      // SELECT for it.
      let isCountFiltered = objectConfig.count === 'filtered',
        countSelect;
      if (objectConfig.count) {
        let countRequester = cObjPath || 'root';
        countSelect =
          obj.counts ?
            obj.counts[countRequester] ?
              obj.counts[countRequester].select || undefined :
              undefined :
            undefined;

        // Unflag the count if the select wasn't defined so subsequent node
        // leaves know not to look for our count.
        if (countSelect === undefined) {
          objectConfig.count = undefined;
        }
      }

      withs +=
        withClause(
          alias, pAlias, cObjPath, obj, fieldClauses, filterClauses,
          sortClauses, countJoin, countSelect, isCountFiltered, limit, offset);

      if (i < (objectChain.length - 1)) {
        withs += ',';
      }
    }

    if (objectConfig.hasOwnProperty('groupBy')) {
      // Filter/Sort/Limit query.
      // Append additional 'filtered', 'grouped', and 'ordered' SELECTs.

      // TODO: Append 'filtered' SELECT.
      // (For now the object fetcher is just adding root collection filters
      // to the root collection in the object chain and we are returning
      // 501 Not Implemented for more complex filters that need multiple
      // fields in different objects.  So here for now we can assume results
      // were already filtered earlier. And we'll just collect all the final
      // fields including any final object count.)
      fieldClauses = allFinalFields.map(f => `${alias}.${f} AS ${f}`);

      // If we looked up the previous object count, insert that field into our
      // accumulating allFinalFields list and as the first thing in our current
      // table request.
      if (pObj && prevObjectConfig.count) {
        pObjFinalFieldPrefix =
          pObjPath.replace(/\./g, '_').toLowerCase() + '__';
        let pObjAliasPlusFFP = `${pAlias}.${pObjFinalFieldPrefix}`,
          pCountField = `${pObjFinalFieldPrefix}count`,
          pCountFieldClause = `${pAlias}_count.count AS ${pCountField}`;
        insertBefore(pCountField, pObjFinalFieldPrefix, allFinalFields);
        insertBefore(pCountFieldClause, pObjAliasPlusFFP, fieldClauses);
      }

      withs +=
        withFilteredClause(
          alias,
          fieldClauses,
          makeCountJoin(objectPathParts)
        ) + ',';

      // Append 'grouped' SELECT.
      let pId = objectConfig.groupBy,
        pIdField = getOutputFieldName(pId);
      // Add primary id field to group by.
      alias = 'filtered';
      fieldClauses = [];
      // For each other field, aggregate using min(), unless it is specifically
      // sorted in DESC order, in which case aggregate using max().
      let sortOrderByOutputFieldName = {};
      if (objectConfig.hasOwnProperty('sort')) {
        Object.keys(objectConfig.sort).forEach(p => {
          let outputFieldName = getOutputFieldName(p),
            order = objectConfig.sort[p];
          sortOrderByOutputFieldName[outputFieldName] = order;
        });
      }
      allFinalFields.forEach(f => {
        if (f === pIdField) {
          // Include plain, un-aggregated primary id of root collection.
          fieldClauses.push(`${alias}.${f} AS ${f}`);
        } else {
          // Include values of other fields aggregated by max() or min()
          // depending on if we want them sorted ascending or descending.
          if (sortOrderByOutputFieldName.hasOwnProperty(f) &&
            sortOrderByOutputFieldName[f].toLowerCase() === 'desc') {
            fieldClauses.push(`MAX(${alias}.${f}) AS ${f}`); // desc, use max()
          } else {
            fieldClauses.push(`MIN(${alias}.${f}) AS ${f}`); // asc, use min()
          }
        }
      });
      withs += withGroupedClause(alias, fieldClauses, pIdField) + ',';

      // Append 'ordered' SELECT.
      alias = 'grouped';
      fieldClauses = allFinalFields.map(f => `${alias}.${f} AS ${f}`);
      let sort = objectConfig.sort,
        sortClauses;
      if (sort !== undefined) {
        sortClauses = Array.from(Object.keys(sort)).map(
          p => `${getOutputFieldName(p)} ` +
            `${sort[p].toLowerCase() === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`);
      }
      withs +=
        withOrderedClause(
          alias,
          fieldClauses,
          sortClauses,
          objectConfig.limit,
          objectConfig.offset
        );
      if (objectConfig.limit !== undefined) {
        bind.limit = objectConfig.limit;
      }
      if (objectConfig.offset !== undefined) {
        bind.offset = objectConfig.offset;
      }

      sql = sql.replace('{{withs}}', withs.trim());
      sql = sql.replace('{{finalSelect}}', 'SELECT * FROM ordered;');

    } else {
      // Regular data query.
      // Construct and append the final select, collecting the final object's
      // counts if needed.
      let finalSelect =
        `SELECT
         {{finalFieldClauses}}
         FROM ${finalAlias}{{finalCountJoin}}{{finalOrderBy}};
        `,
        finalFieldClauses = '*',
        finalCountJoin = '',
        finalOrderBy = '';

      // Pass on all fields of interest from parent to child output table.
      let pObjConfig = objectChain[objectChain.length - 1],
        pObjPath = pObjConfig.objectPath,
        pObjPathParts = pObjPath.split('.'),
        pObjName = pObjPathParts[pObjPathParts.length - 1],
        pObj = objects[pObjName],
        fieldClauses =
          makeFieldClauses(
            addPrefixes(`${finalAlias}.`, allFinalFields),
            allFinalFields);

      // If we looked up the previous object count, insert that field into our
      // accumulating allFinalFields list and as the first thing in our current
      // table request.
      if (pObjConfig.count) {
        let pObjFinalFieldPrefix =
          pObjPath.replace(/\./g, '_').toLowerCase() + '__',
          pObjAliasPlusFFP = `${finalAlias}.${pObjFinalFieldPrefix}`,
          pCountField = `${pObjFinalFieldPrefix}count`,
          pCountFieldClause = `${finalAlias}_count.count AS ${pCountField}`;
        insertBefore(pCountFieldClause, pObjAliasPlusFFP, fieldClauses);

        let ppObjPathParts = pObjPathParts.slice(0, pObjPathParts.length - 1),
          ppObjPath = ppObjPathParts.join('.'),
          pCountRequester = ppObjPath.length > 0 ? ppObjPath : 'root';
        finalCountJoin =
          pObj.counts ?
            pObj.counts[pCountRequester] ?
              pObj.counts[pCountRequester].join || '' :
              '' :
            '';
        finalCountJoin =
          finalCountJoin.length > 0 ?
            `\n       ${finalCountJoin}` :
            '';
      }
      finalFieldClauses = fieldClauses.join(',\n       ');

/*
      TODO: START HERE:
      replace `{{finalWithAlias}}.{{outputName(rootCollectionPath)}}__count AS {{outputName(rootCollectionPath)}}__count`
      with `{{rootObjectPathAlias}}_count.count AS {{outputName(rootCollectionPath)}}__count`
      in finalFieldClauses

      add to finalCountJoin:
      RIGHT JOIN {{rootObjectPathAlias}}_count ON {{finalWithAlias}}.{{parentOfRootOutputPath}}__{{parentOfRootPrimaryId}} = {{rootObjectPathAlias}}_count.{{parentOfRootOutputPath}}__{{parentOfRootPrimaryId}}
      OR {{finalWithAlias}}.{{parentOfRootOutputPath}}__{{parentOfRootPrimaryId}} = NULL

       b_p_r_ad.bands__id AS bands__id,
++     b_p_count.count AS bands_people__count,
--     --b_p_r_ad.bands_people__count AS bands_people__count,
       b_p_r_ad.bands_people__id AS bands_people__id,
       b_p_r_ad.bands_people__name AS bands_people__name,
       b_p_r_ad.bands_people_roles__count AS bands_people_roles__count,
       b_p_r_ad.bands_people_roles__id AS bands_people_roles__id,
       b_p_r_ad.bands_people_roles__name AS bands_people_roles__name,
       b_p_r_ad.bands_people_roles_activedates__id AS bands_people_roles_activedates__id,
       b_p_r_ad.bands_people_roles_activedates__from AS bands_people_roles_activedates__from,
       b_p_r_ad.bands_people_roles_activedates__until AS bands_people_roles_activedates__until
         FROM b_p_r_ad
++     RIGHT JOIN b_p_count ON b_p_r_ad.bands__id = b_p_count.band_id
++     OR b_p_r_ad.bands__id = NULL
       ORDER BY
       bands_people__id ASC NULLS LAST;
*/

      // Add final sort order.
      if (finalSortFields.length > 0) {
        finalOrderBy =
          '\n       ORDER BY\n       ' +
          finalSortFields.join(',\n       ');
      }

      // Assemble final select.
      finalSelect =
        finalSelect.replace('{{finalFieldClauses}}', finalFieldClauses);
      finalSelect = finalSelect.replace('{{finalCountJoin}}', finalCountJoin);
      finalSelect = finalSelect.replace('{{finalOrderBy}}', finalOrderBy);

      // Return the sequelize query promise.
      sql = sql.replace('{{withs}}', withs.trim());
      sql = sql.replace('{{finalSelect}}', finalSelect.trim());
    }

    return sequelize.query(
      sql,
      {
        bind: bind,
        type: sequelize.QueryTypes.SELECT
      }
    );
  };

module.exports = {
  getSpecialCaseFieldName: getSpecialCaseFieldName,
  isCountField: isCountField,
  getOutputFieldName: getOutputFieldName,
  inputToOutputFields: inputToOutputFields,

  get: get
};

})();
