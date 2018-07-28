(function () {
'use strict';

/**
  Static name lookups for the top level object collections in Band Map.

  Usage:

    tloNames = require('./top-level-object-names.js');
    let capPlural = tloNames.convert(urlSingular, 'urlSingular', 'capPlural');
*/

const

  nameForms = [
    "singular",
    "plural",
    "capSingular",
    "capPlural",
    "urlSingular",
    "urlPlural",
    "codeSingular",
    "codePlural",
    "camelCaseSingular",
    "camelCasePlural",
    "resourcePath"
  ],

  topLevelObjects = {
    // As output by swagger-generator.py:
    "Band": {
      "singular": "band",
      "plural": "bands",
      "capSingular": "Band",
      "capPlural": "Bands",
      "urlSingular": "band",
      "urlPlural": "bands",
      "codeSingular": "Band",
      "codePlural": "Bands",
      "camelCaseSingular": "band",
      "camelCasePlural": "bands",
      "swaggerDefinition": "Band",
      "resourcePath": "/api/bands",
      "primaryId": "id",
      "secondaryId": "name" // For querying by a URL-submitted name.
    },
    "ConnectedBand": {
      "singular": "connected band",
      "plural": "connected bands",
      "capSingular": "Connected band",
      "capPlural": "Connected bands",
      "urlSingular": "connected-band",
      "urlPlural": "connected-bands",
      "codeSingular": "ConnectedBand",
      "codePlural": "ConnectedBands",
      "camelCaseSingular": "connectedBand",
      "camelCasePlural": "connectedBands",
      "swaggerDefinition": "BandConnectedBand",
      "resourcePath": "/api/bands",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "Connection": {
      "singular": "connection",
      "plural": "connections",
      "capSingular": "Connection",
      "capPlural": "Connections",
      "urlSingular": "connection",
      "urlPlural": "connections",
      "codeSingular": "Connection",
      "codePlural": "Connections",
      "camelCaseSingular": "connection",
      "camelCasePlural": "connections",
      "swaggerDefinition": "Connection",
      "resourcePath": "/api/connections",
      // primaryId means primary *api field* id.  The connections returned from
      // the api have an "id" field, but the primary key in the database is
      // actually the composite key (band_1_id, band_2_id).
      "primaryId": "id"
    },
    "Person": {
      "singular": "person",
      "plural": "people",
      "capSingular": "Person",
      "capPlural": "People",
      "urlSingular": "person",
      "urlPlural": "people",
      "codeSingular": "Person",
      "codePlural": "People",
      "camelCaseSingular": "person",
      "camelCasePlural": "people",
      "swaggerDefinition": "Person",
      "resourcePath": "/api/people",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "Role": {
      "singular": "role",
      "plural": "roles",
      "capSingular": "Role",
      "capPlural": "Roles",
      "urlSingular": "role",
      "urlPlural": "roles",
      "codeSingular": "Role",
      "codePlural": "Roles",
      "camelCaseSingular": "role",
      "camelCasePlural": "roles",
      "swaggerDefinition": "Role",
      "resourcePath": "/api/roles",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "ActiveDates": {
      "singular": "active dates", // A single "active dates" record.
      "plural": "active dates",
      "capSingular": "Active dates",
      "capPlural": "Active dates",
      "urlSingular": "active-dates",
      "urlPlural": "active-dates",
      "codeSingular": "ActiveDates",
      "codePlural": "ActiveDates",
      "camelCaseSingular": "activeDates",
      "camelCasePlural": "activeDates",
      "swaggerDefinition": "ActiveDates",
      "resourcePath": undefined,
      "primaryId": "id",
      "secondaryId": undefined
    },
    // City id + fully qualified city name ("Seattle, WA, USA"):
    "CityStateCountry": {
      "singular": "city",
      "plural": "cities",
      "capSingular": "City",
      "capPlural": "Cities",
      "urlSingular": "city",
      "urlPlural": "cities",
      "codeSingular": "CityStateCountry",
      "codePlural": "CitiyStateCountries",
      "camelCaseSingular": "cityStateCountry",
      "camelCasePlural": "cityStateCountries",
      "swaggerDefinition": "City",
      "resourcePath": "/api/locations/cities",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "City": {
      "singular": "city",
      "plural": "cities",
      "capSingular": "City",
      "capPlural": "Cities",
      "urlSingular": "city",
      "urlPlural": "cities",
      "codeSingular": "City",
      "codePlural": "Cities",
      "camelCaseSingular": "city",
      "camelCasePlural": "cities",
      "swaggerDefinition": "City",
      "resourcePath": "/api/locations/cities",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "State": {
      "singular": "state",
      "plural": "states",
      "capSingular": "State",
      "capPlural": "States",
      "urlSingular": "state",
      "urlPlural": "states",
      "codeSingular": "State",
      "codePlural": "States",
      "camelCaseSingular": "state",
      "camelCasePlural": "states",
      "swaggerDefinition": "State",
      "resourcePath": "/api/locations/states",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "Country": {
      "singular": "country",
      "plural": "countries",
      "capSingular": "Country",
      "capPlural": "Countries",
      "urlSingular": "country",
      "urlPlural": "countries",
      "codeSingular": "Country",
      "codePlural": "Countries",
      "camelCaseSingular": "country",
      "camelCasePlural": "countries",
      "swaggerDefinition": "Country",
      "resourcePath": "/api/locations/countries",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "Region": {
      "singular": "region",
      "plural": "regions",
      "capSingular": "Region",
      "capPlural": "Regions",
      "urlSingular": "region",
      "urlPlural": "regions",
      "codeSingular": "Region",
      "codePlural": "Regions",
      "camelCaseSingular": "region",
      "camelCasePlural": "regions",
      "swaggerDefinition": "Region",
      "resourcePath": "/api/locations/regions",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "Edit": {
      "singular": "edit",
      "plural": "edits",
      "capSingular": "Edit",
      "capPlural": "Edits",
      "urlSingular": "edit",
      "urlPlural": "edits",
      "codeSingular": "Edit",
      "codePlural": "Edits",
      "camelCaseSingular": "edit",
      "camelCasePlural": "edits",
      "swaggerDefinition": "Edit",
      "resourcePath": "/api/edit-history/edits",
      "primaryId": "id",
      "secondaryId": undefined
    },
    "Editor": {
      "singular": "editor",
      "plural": "editors",
      "capSingular": "Editor",
      "capPlural": "Editors",
      "urlSingular": "editor",
      "urlPlural": "editors",
      "codeSingular": "Editor",
      "codePlural": "Editors",
      "camelCaseSingular": "editor",
      "camelCasePlural": "editors",
      "swaggerDefinition": "Editor",
      "resourcePath": "/api/edit-history/editors",
      "primaryId": "id",
      "secondaryId": "name"
    },
    "Revision": {
      "singular": "revision",
      "plural": "revisions",
      "capSingular": "Revision",
      "capPlural": "Revisions",
      "urlSingular": "revision",
      "urlPlural": "revisions",
      "codeSingular": "Revision",
      "codePlural": "Revisions",
      "camelCaseSingular": "revision",
      "camelCasePlural": "revisions",
      "swaggerDefinition": "Revision",
      "resourcePath": "/api/edit-history/revisions",
      "primaryId": "id",
      "secondaryId": undefined
    },
    "Annotation": {
      "singular": "annotation",
      "plural": "annotations",
      "capSingular": "Annotation",
      "capPlural": "Annotations",
      "urlSingular": "annotation",
      "urlPlural": "annotations",
      "codeSingular": "Annotation",
      "codePlural": "Annotations",
      "camelCaseSingular": "annotation",
      "camelCasePlural": "annotations",
      "swaggerDefinition": "Annotation",
      "resourcePath": "/api/edit-history/annotations",
      "primaryId": "id",
      "secondaryId": undefined
    },
    "InfoSource": {
      "singular": "info source",
      "plural": "info sources",
      "capSingular": "Info source",
      "capPlural": "Info sources",
      "urlSingular": "info-source",
      "urlPlural": "info-sources",
      "codeSingular": "InfoSource",
      "codePlural": "InfoSources",
      "camelCaseSingular": "infoSource",
      "camelCasePlural": "infoSources",
      "swaggerDefinition": "InfoSource",
      "resourcePath": "/api/edit-history/info-sources",
      "primaryId": "id",
      "secondaryId": "url"
    },
    "WebLink": { // Info source alias.
      "singular": "web link",
      "plural": "web links",
      "capSingular": "Web link",
      "capPlural": "Web links",
      "urlSingular": "web-link",
      "urlPlural": "web-links",
      "codeSingular": "WebLink",
      "codePlural": "WebLinks",
      "camelCaseSingular": "webLink",
      "camelCasePlural": "webLinks",
      "swaggerDefinition": "InfoSource",
      "resourcePath": "/api/edit-history/info-sources",
      "primaryId": "id",
      "secondaryId": "url"
    },
    "InfoSourceTag": {
      "singular": "info source tag",
      "plural": "info source tags",
      "capSingular": "Info source tag",
      "capPlural": "Info source tags",
      "urlSingular": "info-source-tag",
      "urlPlural": "info-source-tags",
      "codeSingular": "InfoSourceTag",
      "codePlural": "InfoSourcesTags",
      "camelCaseSingular": "infoSourceTag",
      "camelCasePlural": "infoSourceTags",
      "swaggerDefinition": "InfoSourceTag",
      "resourcePath": "/api/edit-history/info-source-tags",
      "primaryId": "tag",
      "secondaryId": undefined
    },
    "User": {
      "singular": "user",
      "plural": "users",
      "capSingular": "User",
      "capPlural": "Users",
      "urlSingular": "user",
      "urlPlural": "users",
      "codeSingular": "User",
      "codePlural": "Users",
      "camelCaseSingular": "user",
      "camelCasePlural": "users",
      "swaggerDefinition": "User",
      "resourcePath": "/api/users",
      "primaryId": "id",
      "secondaryId": "username"
    },
    "Session": {
      "singular": "session",
      "plural": "sessions",
      "capSingular": "Session",
      "capPlural": "Sessions",
      "urlSingular": "session",
      "urlPlural": "sessions",
      "codeSingular": "Session",
      "codePlural": "Sessions",
      "camelCaseSingular": "session",
      "camelCasePlural": "sessions",
      "swaggerDefinition": "Session",
      "resourcePath": "/api/sessions",
      "primaryId": "id",
      "secondaryId": undefined
    }
  },

  byNameForm = (() => {
    /**
      So we can do stuff like:
        TLONames.byNameForm.urlPlural[objName].codeSingular.
    */

    let byNameForm = {};

    nameForms.forEach(nameForm => {
      let nameFormObjs = byNameForm[nameForm] = {};
      Object.keys(topLevelObjects).forEach(tloKey => {
        let tlo = topLevelObjects[tloKey];
        nameFormObjs[tlo[nameForm]] = tlo;
      });
    });

    return byNameForm;

  })(),

  convert = (name, fromForm, toForm) => {
    return byNameForm[fromForm][name][toForm];
  };

module.exports = {
  'byNameForm': byNameForm,
  'convert': convert
};

})();
