Band Map API

This is a design doc and spec for the Seattle Band Map REST API web service.


CONTENTS

Design Goals
Access
Versioning
Authentication And Authorization
How To GET Stuff
Collections
How To Modify Stuff (POST, PATCH, PUT, DELETE)
Filtering, Sorting, Paging, and Other API Features
Errors and Warnings
Documentation
Caching
Tag Collections
Annotations
Example
URL Reference


DESIGN GOALS

The purpose of the API is to provide developers easy, helpful, standards-based programmatic access to Seattle Band Map data over the web for making apps for exploring bands and music scenes in Seattle and beyond.

The API should be:

 - Easy to Use: Connecting from any kind of app is simple and standards-based so devs can integrate with as little hassle as possible.  Interfaces are provided where devs would naturally expect and they function consistently and intuitively enough to be understood or guessed at without docs.  But there are extensive docs anyway, provided within the service itself where they can be easily checked so devs don't have to consult outside reference material.

 - Useful: The interfaces thoroughly cover everything devs actually need to make cool band mappy stuff.  All the Seattle Band Map data are easily available in whatever form is needed.

 - Efficient: The service responds fast and is conscientious of bandwidth.  Transactions can easily be tailored to be as lean or as thorough as needed for any given request for any given app.

 - Secure: Standards-based encryption ensures transactions are private so apps don't expose their communications to the rest of the web.  Standards-based authorization ensures the app and the API can trust each other to be who they say they are.


ACCESS

The Band Map API provides access to all URLs from the API root at:

https://www.seattlebandmap.com/api/

The API at this root is always the most recent version.


VERSIONING

To request a specific API version, use:

https://www.seattlebandmap.com/api-<version>/

Where <version> is the version number, for example 1.0:

https://www.seattlebandmap.com/api-1.0/

For a list of available API versions, use:

https://www.seattlebandmap.com/api/versions


AUTHENTICATION AND AUTHORIZATION

The API serves URLs over HTTPS, encrypted using the Transport Layer Security (TLS) protocol.

The API currently supports three authentication schemes:

  No Auth: Anonymous API users can make calls to URLs, including the API documentation URLs, with no credentials or authorization header.  If the resource is public (most of Band Map outside the users and sessions resources is public), the API will return it as normal.

  Basic Auth: Registered users can authenticate with HTTP basic auth (https://en.wikipedia.org/wiki/Basic_access_authentication).  The API will check their username/password against the Band Map DB users table.  If unrecognized, the API will return a 401 Unauthorized response (even if the resource is public) with an explanatory error message in the JSON body.

  Cross Origin Resource Sharing (CORS): The API also supports CORS so that domains outside seattlebandmap.com can access Band Map API resources (see https://en.wikipedia.org/wiki/Cross-origin_resource_sharing, https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md#8-cors, https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS, and https://www.w3.org/TR/cors/).  Cross-origin responses will include additional CORS headers like so:

    Request:

      GET /api/resource HTTP/1.1
      Origin: remote-service.com

    Response:

      HTTP/1.1 200 OK
      Access-Control-Allow-Origin: *

  Preflight transactions will likewise be conducted appropriately (this example also includes HTTP basic auth across the CORS transaction):

    Request:

      OPTIONS /api/resource HTTP/1.1
      Origin: remote-service.com
      Access-Control-Request-Method: PATCH
      Access-Control-Request-Headers: Authorization, Content-Type

    Response:

      HTTP/1.1 200 OK
      Access-Control-Allow-Origin: *
      Access-Control-Allow-Methods: OPTIONS, HEAD, GET, POST, PATCH, PUT, DELETE
      Access-Control-Allow-Headers: Authorization, Content-Type
      Access-Control-Max-Age: 120

    Request:

      PATCH /api/resource HTTP/1.1
      Origin: remote-service.com
      Content-Type: text/json; charset=UTF-8
      Access-Control-Request-Method: PATCH
      Access-Control-Request-Headers: Content-Type
      Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l

    Response:

      HTTP/1.1 200 OK
      Access-Control-Allow-Origin: *

  OAuth 2: OAuth 2 authentication via client ID, client secret, auth code, and token exchange isn't immediately needed for the Band Map API since we are just using (basic) auth for identifying individual users to record edit histories or allow admin access.  We will probably want to implement it in the future for authorizing third party apps though.

  JSONP is currently unsupported, not sure if we need to support it in the future.


HOW TO GET STUFF

The API is a standard RESTful web service (https://en.wikipedia.org/wiki/Representational_state_transfer).

Devs or other users make calls ("requests") to the API's URLs ("resources" or "interfaces") over HTTPS using a browser, HTTP client, or programming language of their choice.  A typical transaction looks something like:

Request:

GET /api/bands HTTP/1.1
Host: www.seattlebandmap.com

Response:

HTTP/1.1 200 OK
Content-type: application/json
Content-length: 200

[Data in JSON format.]

Users get data using the HTTP GET method.

Response bodies, and request bodies wherever they are needed, are in JSON.


COLLECTIONS

Most of the interfaces are organized and presented in the form of "collections" of objects.  For example there is a "collection" of bands at:

https://www.seattlebandmap.com/api/bands

A user makes a GET request to this URL to get a list of multiple bands, presented in a consistent, easily navigable format (see URL Reference section for details).

Individual objects in a collection are GETable using unique object IDs or object names at a sub-URL of the collection URL, for example:

https://www.seattlebandmap.com/api/bands/The Intelligence

or

https://www.seattlebandmap.com/api/bands/957

By default, a collection URL returns the first 10000 objects in its collection.  This can be changed with the "limit" query argument (see "Paging" section below).

Most objects also include one or more "subcollections" or arrays of related objects within them.  For example, bands include arrays of band members.  Editors include arrays of edits they made.  These subcollections also return just the first 10000 matching objects if there are more than 10000, and this number cannot be modified, unlike for the top-level collections.

Subcollections

  POSTing an existing item to a subcollection is only for adding the relevant association with the parent item.  It will throw an error if you try to modify any existing field value on the child item.

  POSTing a new item to a subcollection will both create the new item in its own top level collection and add the relevant association to the parent item.  Since the child item is new, its initial field values can be set without error.

  PATCH/PUTting an existing item in a subcollection will modify any specified field values as with a PATCH/PUT to the item's own top level collection.

  DELETEing an item in a subcollection will only delete its association with the parent item, not delete the child item itself from its own top level collection.


HOW TO MODIFY STUFF (POST, PATCH, PUT, DELETE)

Users can add, modify, replace, and delete information from Band Map with the respective HTTP methods POST, PATCH, PUT, and DELETE.

The resource objects listed below in the URL Reference section are generally shown as they are formatted from a GET response.  But fields on the resource objects available for modification are generally more limited than what is returned for a GET request.

For POSTs:

- New objects are submitted to collection URL in a JSON array in the request body, according to the format described in the URL Reference section.

- "id" and "link" fields are not allowed.  The new resource's new id and link will be assigned automatically and then specified in the response body.

- The API returns a "Location" HTTP header containing the location of the created resource, as well as a copy of the full created resource in the response body.  Location header example:

Location: https://www.seattlebandmap.com/api/people/666

For PATCHes and PUTs:

- Users can modify or replace one or more objects at a collection URL by submitting a JSON array containing one or more modification objects.  These specify target objects in the collection by "id" or "name" fields.

For DELETEs:

- Users can delete one or more objects at a collection URL by submitting a JSON array of just the bare "id" integers and/or "name" strings (mixed together is okay) specifying the target objects to delete.

- To better comply with REST conventions, multiple DELETE targets can alternately be specified in the query string with a query argument of the form "?targets=x,y,z..." where x, y, and z are either object ids or names of the objects to delete.  For example "?targets=123,Other Band Name,456".

- PATCH, PUT, and DELETE can also target individual collection objects one at a time using the object-sepecific sub-URL.  In these cases, "id" and "link" fields in the request body are unnecessary.  If the user specifies them anyway for some reason they must be consistent with whatever resource they are acting on, or the API will return an error.  The URL is the authority on what is being addressed.

Collection/Subcollection Technicalities:

This section contains some further technical clarification about collections and subcollections.  This level of detail may not be necessary for regular Band Map API usage, but I'll provide it here for clarity.  Technically, there are three types of collections in band map:

  1) Top Level Collections (like /bands)
  2) URL Subcollections (like /bands/{band}/people)
  3) Internal Subcollections (like the value of the "people" field at /bands/{band})

On a PATCH or PUT, if you specify an internal subcollection, it will be completely replaced with the array of existing or new items you specify for it.  To instead modify or replace the items in the internal subcollection themselves, use PATCH or PUT at the relevant URL subcollection.

Similarly, on a PATCH or PUT, to remove items from an internal subcollection you must re-specify the entire array minus those items.  If you would prefer, you can instead remove individual items by using DELETE at the relevant URL subcollection.


FILTERING, SORTING, PAGING, AND OTHER API FEATURES

- All field selection, filtering, and sorting arguments are case-insensitive.

- Filter fields by inclusion with ?fields=<field>,<field>,... or by exclusion with ?no-fields=<field>,<field>,...  Nested object fields are addressable for filtering with, for example, ?no-fields=people.name,people.bands.roles at the /people collection URL (see below). Filtering fields should improve server response time whenever possible. (See http://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api#limiting-fields).  For any given request, either ?fields or ?no-fields can be specified.  Specifying both in the same request will result in the ?no-fields argument being ignored with a warning.

- Filter collection results with ?filter=<filter-expression>, where <filter-expression> is as described at https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md#97-filtering.  In addition to the operators described there, 'ct' ('contains') and 'not ct' ('does not contain') can be used to filter on string field values.  Multiple comma-delimited filter expressions can be submitted (?filter=<filter-expression>,<filter-expression>,...), which is equivalent to submitting them as parenthesized clauses in a single filter joined by the 'and' operator (?filter=(<filter-expression>) and (<filter-expression>) and ...).

- Filter by addressing subcollections with the URL itself, for example:

  Bands with a specific member: /api/people/{person}/bands

  Cities in a specific state: /api/locations/countries/{country}/states/{state}/cities

  Cities where a specific person is based: /api/people/{person}/cities

- Sort collection results alphabetically (for strings) or numerically (for integers and ids) with ?sort=<field>,<field>,... Where the first specified <field> will be the primary sort field, the next will be the secondary, etc.  Nested collections are addressable and sortable as described for ?field above.  Use <field>:asc or <field>:desc to explicitly specify ascending or descending sort for each field, ascending is default.

- Specify the number of objects to retrieve from a collection resource at once using ?limit=<int>.  Use ?offset=<int> to start retrieving at the given position in the collection.  The default limit on returned objects in collections is 10000.  Pagination fields ("offset", "limit", "first", "prev", "next", and "last") are returned if (and only if) pagination is needed (because there are more total objects in the collection than the limit).  Link headers are also sent for these responses (see http://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api#pagination).

- <date> and <datetime> values are strings following ISO 8601.  For dates, these are simple "full-date" strings like "YYYY-MM-DD".  For datetimes, they include an offset, like "2017-03-07T20:46:31-07:00", with the offset chosen to helpfully display the requester's detected local time while still representing a distinct point in time.

- In addition to the methods listed in the URL Reference section below, each URL allows HEAD and OPTIONS verbs:

  - HEAD: Get HTTP header data about the resource, like doing a GET but with no response body.

  - OPTIONS: See which HTTP methods are available for this resource (in the "Allow" HTTP header).

- The API pretty-prints the JSON (linebreaks and indentation levels) in its responses by default.  To remove the pretty-printing whitespace use ?pretty=false.

- The API specifies rate limits to clients with "X-Rate-Limit-Limit", "X-Rate-Limit-Remaining", "X-Rate-Limit-Reset" HTTP headers as described at http://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api#rate-limiting.  Rate limits are different for different types of users:

                      Total Calls/Min    Row Edits/Min
  Anonymous User      100                10
  Registered User     1000               100
  Band Map Bot/Admin  no limit?          no limit?


ERRORS AND WARNINGS

An error is any response with a code other than 2xx.

For errors, instead of the regular response format, an errors object is returned of the form:

{
  "errors": [
    {
      "code": <string>,
      "message": <string>
    },
    ...
  ],
  "warnings": [
    {
      "code": <string>,
      "message": <string>
    }
  ]
}

The "code" value is not the HTTP response code (which is returned in the HTTP response header), but a more specific, API-defined code.  A full list of the codes can be found in the API reference docs.

The "warnings" array will be present if there were any additional warnings generated while processing the request that by themselves would not have caused an error response, but that may be related to the errors.

If warnings are generated processing otherwise successful responses, a "warnings" array as above may also appear on the root JSON object returned by the successful response.  You may want to check for warnings arrays to correct your requests in case they have some kind of incorrectly formatted or invalid parameter that is being ignored or worked around by the API.

Warnings have their own set of "code" identifier strings that can be found in the API reference docs along with the error code strings.


DOCUMENTATION

The API provides two main access points to documentation:

1) Use ?help or ?doc query arguments at any URL to retrieve a human-readable, HTML formatted description of the resource, including all the HTTP methods provided there and how to use them.  Use ?schema at any URL to retrieve a machine-readable JSON schema.

2) Browse the full API-synched online reference documentation provided at:

  https://www.seattlebandmap.com/api-docs


CACHING

The API allows clients to take advantage of response caching by sending a "Last-Modified" header with each response and honoring "If-Modified-Since" headers passed in requests (returning a 304 Not Modified status if there was no change to the requested resource).


TAG COLLECTIONS

Tag collections are simplified collection resources where the objects are all trimmed strings -- the "tags" -- and the string functions as the object id.

GETs to tag collections return a simple JSON array of the tag strings, sorted alphabetically.

GETs to individual tag sub-URLs return a 200 status code and a copy of the tag string as the response body if the tag exists, or a 404 with appropriate error message if the tag doesn't exist.

Tags are added to the collection by POSTing a single string or array of strings to the collection URL.

Tags are deleted from the collection by sending a DELETE request to the collection with a JSON array of target tags, or by sending an empty DELETE request to the individual tag sub-URL.

Tag collections don't support PATCH or PUT since changing a tag is the same as deleting it and adding a new one.

Tag collections don't support custom paging, filtering, or sorting.

Tag Format:

  Tag lookups are case-insensitive and differently-cased versions of a string count as the same tag.
  
  There is just one "canonical" string for each tag stored in the collection.

  The API attempts to use a "lower-case-dashed-format" for all tags and will make conversions on new submitted tags like these:

    TitleCase         -> titlecase
    camelCase         -> camelcase
    three word tag    -> three-word-tag
    underscored_tag   -> underscored-tag
    lowercaseword     -> lowercaseword // (Oops, probably not what you want.)

  So users should try to choose their tag strings deliberately when submitting new tags.

  I picked this canonical format since it seems like the easiest/quickest to read and type without using spaces or capital letters (Title-Case-Format looks too formal to me), and we might want to use spaces in lists of tags.  Compare:

  soundcloud-band-page
  SoundCloud Band Page
  SoundCloud-Band-Page
  SoundCloud_Band_Page
  SoundCloudBandPage

  Once a canonical string is stored for a tag, subsequent lookups are done by removing all dashes, underscores, and spaces, and converting to lower case, then using an internal mapping from the lower case to canonical string, so for example the following mappings apply:

    soundcloudbandpage        -> soundcloud-band-page
    soundcloud band page      -> soundcloud-band-page
    SoundCloudBandPage        -> soundcloud-band-page
    so-und-clo_ud-b_andp-age  -> soundcloud-band-page


ANNOTATIONS

Facts in the Band Map database come with zero or more "annotations": additional relevant info or notes about the fact.  Most annotations are "citations": a reference to a webpage or other source supporting the truth of the fact.

Since annotation functionality cuts across most of the different types of info and objects in Band Map, annotation fields are built in to the majority of the object types at each nested subcollection or sub-object level.

When POSTing a new band, for example, annotations can be submitted at the outer level, about the band, for any of the band members in the "people" subcollection, for any of the cities in the "cities" subcollection, and so forth.

All those annotation fields would clutter up response objects if they were always returned in GET responses, and annotations are only needed for use cases where users are looking specifically for more detail about certain facts, so annotation fields are supressed in responses by default.

To include them, use the ?annotations query arg.

The URL Reference section below likewise does not show all the annotations fields, but to give you an idea of what an ?annotations enabled GET response would look like, here is a <band> object with annotations included:

{
  "id": <id>,
  "link": <url>,
  "name": <string>,
  "clickCount": <int>,
  // Each <active-dates> object in this array now also includes "annotations
  // about those specific active dates:
  "active-dates": [<active-dates>, ...],
  "cities": [
    {
      "id": <id>,
      "link": <url>,
      "name": <string>,
      "active-dates": [<active-dates>, ...], // With relevant annotations.
      "annotations": [<annotation>, ...] // About the band being in this city.
    },
    ...
  ],
  "citiesCount": <int>,
  "people": [
    {
      "id": <id>,
      "link": <url>,
      "name" <string>,
      "active-dates": [<active-dates>, ...], // With relevant annotations.
      "roles": [ // in this specific band
        {
          "id": <id>,
          "link": <url>,
          "name": <string>,
          "active-dates": [<active-dates>, ...], // With relevant annotations.
          "annotations": [<annotation>, ...] // About this person band role.
        },
        ...
      ]
      "rolesCount": <int>,
      "annotations": [<annotation>, ...], // About this person in this band.
    },
    ...
  ],
  "peopleCount": <int>,
  "connectedBands": [
    {
      "id": <band-id>,
      "link": "https://www.seattlebandmap.com/api/bands/<band-id>",
      "name": <string>, // Other band name.
      "description" <string>, // plain sentence describing the connection
      "annotations": [<annotation>, ...] // About this connection.
    },
    ...
  ],
  "connectedBandsCount": <int>,
  "webLinks": [
    {
      "url": <web-link-url>,
      "description": <string>, // if one exists
      "annotations": [<annotation>, ...] // About this weblink (e.g. where seen).
    },
    ...
  ],
  "webLinksCount": <int>,
  "annotations": [<annotation>, ...] // About the existence of the band.
}

See the /annotations collection reference below for the form of an annotation object.

The "annotations" field name is overloaded in some of the /edit-history resource group collections: there are objects like editors and revisions that include an "annotations" field by default (without using the ?annotations query arg), listing the annotations associated with those editors and revisions.  This shouldn't cause any kind of functional conflict because the edit history objects can't be annotated themselves (annotating Band Map editors and edits and revisions would be pointlessly meta).  And I feel like this is still easier to read and understand in context than making up some other field name just to avoid overloading "annotations".


EXAMPLE

An example tailored GET request to get just the data necessary to construct the current band map SVG:

GET https://www.seattlebandmap.com/api/bands?fields=bands.id,bands.name

Response body:

{
  "bands": [
    {
      "id": 1,
      "name": "141"
    },
    {
      "id": 3,
      "name": "1st Black Prez"
    },
    ...
  ],
}

GET https://www.seattlebandmap.com/api/connections?fields=connections.band1.id,connections.band2.id,connections.description

Response body:

{
  "connections": [
    {
      "band1": {
        "id": <band1-id>
      },
      "band2": {
        "id": <band2-id>
      },
      "description": <string>
    },
    ...
  ]
}


URL REFERENCE

The API can be organized into the following high-level resource categories and their associated URLs:

API Root
  https://www.seattlebandmap.com/api
  https://www.seattlebandmap.com/api/version
Bands
  https://www.seattlebandmap.com/api/bands
Connections
  https://www.seattlebandmap.com/api/connections
People
  https://www.seattlebandmap.com/api/people
Roles
  https://www.seattlebandmap.com/api/roles
Locations
  https://www.seattlebandmap.com/api/locations
  https://www.seattlebandmap.com/api/locations/cities
  https://www.seattlebandmap.com/api/locations/states
  https://www.seattlebandmap.com/api/locations/countries
  https://www.seattlebandmap.com/api/locations/regions
Edit History
  https://www.seattlebandmap.com/api/edit-history
  https://www.seattlebandmap.com/api/edit-history/edits
  https://www.seattlebandmap.com/api/edit-history/editors
  https://www.seattlebandmap.com/api/edit-history/revisions
  https://www.seattlebandmap.com/api/edit-history/annotations
  https://www.seattlebandmap.com/api/edit-history/info-sources
  https://www.seattlebandmap.com/api/edit-history/info-source-tags
Users and Sessions
  https://www.seattlebandmap.com/api/users
  https://www.seattlebandmap.com/api/sessions

I tried to provide the right level of detail and depth for the objects at each resource such that:

1) A human can quickly scan for the info they want without being overwhelmed by details and metadata cruft, and devs can write clean code for handling the objects without dealing with too much burdensome addressing of nested sub-objects.

2) But enough detail and id/link metadata are provided to satisfy anything you would intuitively/reasonably want to know if you're looking up a band in an API.  You can do what you are probably trying to do.  If you need more details/related info the links are there to follow.

An example tradeoff is <band> at /bands.  I could imagine an alternate, more concise schema than the one I went with (see the actual <band> object listing below) that would look like this:

<simple-band> =
{
  "name": <string>,
  "clickCount": <int>,
  "location": <string>, // most recent, of form "<city>, <state>, <country>" ("Seattle, WA, USA")
  "people": [
    <string>, // current member name, current role name
    <string>,
    ...
  ],
  "connected-bands": [
    <string>, // band names
    <string>,
    ...
  ]
  "webLinks": [
    <string>, // web links
    <string>,
    ...
  ]
}

<simple-band> is way easier to read, easier to code against, and takes up less bandwidth than <band> below, but we lose:
- previous locations
- previous members
- full info on all the members' roles
- timespan info for people and their roles in the band, locations, and the band in general
- web link annotations
- stable ids and links to follow for details and related info

Depending on what you're doing with the API, I could imagine needing some of that stuff.  And with field filtering as described above, users can pare down the output until it is almost as lean as <simple-band> (but still with nested, single-field objects in the arrays instead of just the strings).  Still, it might be worth implementing a ?simple query arg for the main collection and object URLs to also provide simple versions of objects.


API ROOT

URL: https://www.seattlebandmap.com/api

Methods: GET only.

A GET request to the API root returns a listing of all sub-URLs, enabling intuitive discovery and traversal of the rest of the API:

{
  "version": <string>,
  "description": "Welcome to the Seattle Band Map API!  This is an interface for accessing..."
  "urls": { // listing of all resource URLs
    "https://www.seattlebandmap.com/api": "This listing of Band Map API info and URLs.",
    "https://www.seattlebandmap.com/api/version": "The Band Map API version string.",
    "https://www.seattlebandmap.com/api/bands": "The collection of bands with band info."
    ...
  }
}

URL: https://www.seattlebandmap.com/api/version

Methods: GET

Response: <version> (For example, "1.0".)


BANDS

URL: https://www.seattlebandmap.com/api/bands

Methods:
    GET Retrieve a list of bands and their band info.
   POST Add a new band.
  PATCH Modify specified bands.
    PUT Replace or add specified bands.
 DELETE Remove specified bands.

Response:

<bands-collection>

Where <bands-collection> is, for example:
{
  "link": "https://www.seattlebandmap.com/api/bands?limit=100&offset=500",
  "offset": 500,
  "limit": 100,
  "total": 1000, // Total in the collection (total in the database).
  "bands": [
    <band>,
    <band>,
    ...
  ],
  "bandsCount": 100, // Bands actually returned (=== bands.length)
  "first": {
    "link": "https://www.seattlebandmap.com/api/bands?limit=100"
  },
  "prev": {
    "link": "https://www.seattlebandmap.com/api/bands?limit=100&offset=400"
  },
  "next": {
    "link": "https://www.seattlebandmap.com/api/bands?limit=100&offset=600"
  },
  "last": {
    "link": "https://www.seattlebandmap.com/api/bands?limit=100&offset=900"
  }
}

Where <band> is:
{
  "id": <this-band-id>,
  "link": "https://www.seattlebandmap.com/api/bands/<this-band-id>",
  "name": <string>,
  "aliases": [<alias>, ...], // If any exist.
  "clickCount": <int>,
  "active-dates": [{active-dates}, ...], // When was band active.
  "cities": [ // ordered by most recent to oldest
    {
      "id": <city-id>,
      "link": "https://www.seattlebandmap.com/api/cities/<city-id>",
      "name": <string>, // of form "<city>, <state>, <country>" ("Seattle, WA, USA")
      "active-dates": [{active-dates}, ...] // When was band based in city.
    },
    ...
  ],
  "citiesCount": <int>, // I'm thinking it may be useful to include count fields for the nested
    // collections even though users can just check the array lengths for the same info because,
    // for example, if they only want the city count, not the city details, they could filter with
    // ?field=cityCount.
  "people": [
    {
      "id": <person-id>,
      "link": "https://www.seattlebandmap.com/api/people/<person-id>",
      "name" <string>,
      "active-dates": [{active-dates}, ...], // When was this person a member.
      "roles": [ // in this specific band
        {
          "id": <role-id>,
          "link": "https://www.seattlebandmap.com/api/roles/<role-id>",
          "name": <string>,
          "active-dates": [{active-dates}, ...] // When did this person have this role.
        },
        ...
      ]
      "rolesCount": <int>,
    },
    ...
  ],
  "peopleCount": <int>,
  "connectedBands": [
    {
      "id": <band-id>,
      "link": "https://www.seattlebandmap.com/api/bands/<band-id>",
      "name": <string>, // Other band name.
      "description" <string>, // plain sentence describing the connection
    },
    ...
  ],
  "connectedBandsCount": <int>,
  "webLinks": [
    {
      "url": <web-link-url>,
      "description": <string>, // if one exists
    },
    ...
  ],
  "webLinksCount": <int>,
}

Where <active-dates> objects are:
{
  "from": <date>,   // (Only appears if from date is known.)
  "until": <date>   // (Only appears if until date is known.)
}

Arrays of active dates are only returned on objects and sub-objects where at least one active date range date is known about the entity in question.

Active dates objects also include their "annotations" array if the ?annotations query arg is present.



URL: https://www.seattlebandmap.com/api/bands/<name-with-dash-or-underscore-spaces|band-id>

Methods:
    GET Retrieve this band's info.
  PATCH Modify this band's info.
    PUT Replace this band, or add it if it doesn't already exist.
 DELETE Remove this band.

Response:

<band>

Where <band> is as described above in /bands.


CONNECTIONS

URL: https://www.seattlebandmap.com/api/connections
Methods: GET, POST, PATCH, DELETE
Response: <connection-collection>

Where <connection> is:
{
  "id": "<band1-id>-<band2-id>",
  "link": "https://www.seattlebandmap.com/api/connections/<band1-id>-<band2-id>",
  "band1": {
    "id": <band1-id>,
    "link": <band1-link>,
    "name": <band1-name>
  },
  "band2": {
    "id": <band2-id>,
    "link": <band2-link>,
    "name": <band2-name>
  },
  "description": <string>
}

And where the "connections" collection array entries are unique (no symmetric a-b, b-a connections) and are ordered by default from connections involving the band with the most connections to connections involving the band with the least connections.

URL: https://www.seattlebandmap.com/api/connections/<band1-id>-<band2-id>|<band1-name>-<band2-name>
Methods: GET, PATCH, DELETE
Response: <connection>

Only connection descriptions can be modified.  The bands involved (and therefore the connection object itself) can't be modified or replaced - only added or deleted.  Deletes will fail if the bands concerned still share members in the database according to the people/bands tables.  Connections can be addressed by the "canonical" ordering of band1-band2 (whatever is in the database or what the API ordering algorithm decides is the right order), or the opposite ordering.  That is, if connection "b-a" is requested when "a-b" is what actually exists in the collection, connection "a-b" is still returned.


PEOPLE

URL: https://www.seattlebandmap.com/api/people

Methods:
    GET Retrieve a list of people and their info.
   POST Add a new person.
  PATCH Modify specified people.
    PUT Replace or add specified people.
 DELETE Remove specified people.

Response:

<people-collection>

Where <people-collection> is similar to <band-collection> above, and <person> is:
{
  "id": <this-person-id>,
  "link": "https://www.seattlebandmap.com/api/people/<this-person-id>",
  "name" <string>,
  "aliases": [<alias>, ...], // If any exist.
  "active-dates": [{active-dates}, ...], // For this person's band activity.
  "bands": [
    {
      "id": <band-id>,
      "link": "https://www.seattlebandmap.com/api/bands/<band-id>",
      "name": <string>,
      "active-dates": [{active-dates}, ...], // When was this person a member.
      "roles": [ // specific to this person in this band
        {
          "id": <role-id>,
          "link": "https://www.seattlebandmap.com/api/roles/<role-id>",
          "name": <string>,
          "active-dates": [{active-dates}, ...], // When did this person have this role.
        },
        ...
      ]
    },
    ...
  ],
  "bandsCount": <int>,
  "roles": [  // (across all bands)
    {
      "id": <role-id>,
      "link": "https://www.seattlebandmap.com/api/roles/<role-id>",
      "name": <string>,
      "active-dates": [{active-dates}, ...]
    },
    ...
  ],
  "rolesCount": <int>,
  "cities": [  // (across all bands)
    {
      "id": <city-id>,
      "link": "https://www.seattlebandmap.com/api/cities/<city-id>",
      "name": <string>, // of form "<city>, <state>, <country>" ("Seattle, WA, USA")
      "active-dates": [{active-dates}, ...]
    },
    ...
  ],
  "citiesCount": <int>
}

URL: https://www.seattlebandmap.com/api/people/<name-with-dash-or-underscore-spaces>|<person-id>

Methods:
    GET Retrieve this person's info.
  PATCH Modify this person's info.
    PUT Replace this person, or add them if they don't already exist.
 DELETE Remove this person.

Response:

<person>


ROLES

For data related to specific band roles (vocalists, guitarists, etc.).

Might be useful to include some aggregate statistics on them, like I've added below.

URL: https://www.seattlebandmap.com/api/roles

Methods: GET, POST, PATCH, PUT, DELETE

Response:

<roles-collection>

Where <role> is:
{
  "id": <role-id>,
  "link": "https://www.seattlebandmap.com/api/roles/<role-id>",
  "name": <string>,
  "people": [ // List all people in the DB with this role.  Useful?  Overkill?
    {
      "id": <person-id>,
      "link": "https://www.seattlebandmap.com/api/people/<person-id>",
      "name" <string>,
      "active-dates": [{active-dates}, ...] // When has this person had this role.
    },
    ...
  ],
  "peopleCount": <int>,
  "bands": [ // List all bands in the DB with someone with this role.  Useful?  Overkill?
    {
      "id": <band-id>,
      "link": "https://www.seattlebandmap.com/api/bands/<band-id>",
      "name": <string>,
      "active-dates": [{active-dates}, ...], // When this band had someone in this role.
    },
    ...
  ],
  "bandsCount": <int>
}

URL: https://www.seattlebandmap.com/api/roles/<name-with-dash-or-underscore-spaces|role-id>

Methods: GET, PATCH, PUT, DELETE

Response:

<role>


LOCATIONS

URL: https://www.seattlebandmap.com/api/locations

Methods: GET

Response:

{
  "version": <string>,
  "description": "This resource group includes various resources related to band locations.  See the 'resources' field for available URLs."
  "resources": {
    "cities": {
      "link": "https://www.seattlebandmap.com/api/locations/cities",
      "description": "A collection of cities where bands are based."
    },
    "states": {
      "link": "https://www.seattlebandmap.com/api/locations/states",
      "description": "A collection of states where bands are based."
    },
    ...
  }
}

URL: https://www.seattlebandmap.com/api/locations/cities
Methods: GET, POST, PATCH, PUT, DELETE
Response: <cities-collection>

Where <city> = {
  "id": <city-id>,
  "link": <city-url>,
  "name": <string>,
  "state": <state-basics>,
  "country": <country-basics>
  // Plus bands?, people??, roles???  Nah probably going too far.  But maybe some stats about them.
}

Where <state-basics> and <country-basics> (and <*-basics> in general from now on in this document) means a version of the object as described above or below with just "link" and "id" fields, and "name" if it exists, no nested collections or extra stuff.

URL: https://www.seattlebandmap.com/api/locations/cities/<name-with-dash-etc-blah-blah|city-id>
Methods: GET, PATCH, PUT, DELETE
Response: <city>

URL: https://www.seattlebandmap.com/api/locations/states
Methods: GET, POST, PATCH, PUT, DELETE
Response: <states-collection>

Where <state> = {
  "id": <state-id>,
  "link": <state-url>,
  "name": <string>, // Like "WA", or province/prefecture/whatever abbreviation.
  "country": <country>,
  "cities": [
    <city-basics>,
    <city-basics>,
    ...
  ],
  "citiesCount": <int>
}

URL: https://www.seattlebandmap.com/api/locations/states/<name|id>
Methods: GET, PATCH, PUT, DELETE
Response: <state>

URL: https://www.seattlebandmap.com/api/locations/countries
Methods: GET, POST, PATCH, PUT, DELETE
Response: <countries-collection>

Where <country> = {
  "id": <country-id>,
  "link": <country-url>,
  "name": <string>,
  "states": [
    <state-basics>,
    <state-basics>,
    ...
  ],
  "statesCount": <int>
}

URL: https://www.seattlebandmap.com/api/locations/countries/<name|id>
Methods: GET, PATCH, PUT, DELETE
Response: <country>

URL: https://www.seattlebandmap.com/api/locations/regions
Methods: GET, POST, PATCH, PUT, DELETE
Response: <regions-collection>

Where <region> = {
  "id": <int>,
  "link": <region-url>,
  "name": <string>,
  "subRegions": [
    <region-basics>,
    ...
  ]
  "subRegionsCount": <int>,
  "countries": [
    <country-basics>,
    ...
  ],
  "countriesCount" <int>,
  "states": [
    <state-basics>,
    ...
  ],
  "statesCount": <int>,
  "cities": [
    <city-basics>,
    <city-basics>,
    ...
  ],
  "citiesCount": <int>
}

URL: https://www.seattlebandmap.com/api/locations/regions/<name|id>
Methods: GET, PATCH, PUT, DELETE
Response: <region>

As well as being available at their top level collections, regions, countries, states, and cities can also be addressed under any containing regions, countries, or states they belong to, as usual with collection/subcollection relations.  Examples:

  /api/locations/states/{state}/cities
  /api/locations/countries/{country}/states/{state}/cities
  /api/locations/regions/{region}/cities


EDIT HISTORY

The edits, revisions, annotations, and info-sources collections in the edit-history resource group are meant to be managed mostly by internal API logic that handles edit tracking on the other band map collections.  Users, including admins, should not usually need to POST, PATCH, or PUT objects in these collections.  They are provided mostly for looking up information using GETs.  Some editing support is still provided for possible edge cases, however.

URL: https://www.seattlebandmap.com/api/edit-history/edits
Methods: GET, DELETE
Response: <edit-collection>

URL: https://www.seattlebandmap.com/api/edit-history/edits/{edit}
Methods: GET, DELETE
Response: <edit>

Where <edit> is:
{
  "id": <id>,
  "link": <url>,
  "datetime": <datetime>,
  "editor": <editor-basics>,
  "revisions": [<revision-basics>, ...],
  "annotations": [<annotation-basics>, ...],

  // For Admins Only:
  "request": <string>,
  "session": <session-basics>,
}

Edits are typically registered in the DB as part of the serverside app logic, not POSTed to this resource, so no POST method is provided here.

URL: https://www.seattlebandmap.com/api/edit-history/edits/<edit-id>
Methods: GET, PATCH, PUT, DELETE
Response: <edit>

Not sure if we should actually provide POST/PATCH/PUT/DELETEing through the API here, even to admins.

URL: https://www.seattlebandmap.com/api/edit-history/editors
Methods: GET, DELETE
Response: <edit-collection>

URL: https://www.seattlebandmap.com/api/edit-history/editors/{editor}
Methods: GET, DELETE
Response: <edit>

Where <editor> is:
{
  "id": <id>,
  "link": <url>,
  "name": <string>, // Username or ip address for anons.
  "edits": [<edit-basics>, ...],
  "revisions": [<revision-basics>, ...],
  "annotations": [<annotation-basics>, ...],

  // For Admins Only:
  "user": <user-basics>, // If editor is registered.
  "ipAddress": <string>,
  "userAgent": <string>,
  "sessions": [<session-basics>, ...]
}

URL: https://www.seattlebandmap.com/api/edit-history/revisions
Methods: GET, DELETE
Response: <revision-collection>

URL: https://www.seattlebandmap.com/api/edit-history/revisions/{revision}
Methods: GET, DELETE
Response: <revision>

Where <revision> is:
{
  "id": <id>,
  "link": <url>,
  "edit": <edit-basics>,
  "editor": <editor-basics>,
  "type": "insert"|"update"|"delete",
  // The "facts" this edit concerns, for example "There is a band called Love
  // Battery."  In their previous (before the edit) and present form, if applicable.
  "oldFact": <string>, // For updates and deletes.
  "newFact": <string>, // For inserts and updates.
  "annotations": [<annotation-basics>, ...],

  // For Admins Only:
  "table": <string>,
  "column": <string>
  "row": <int>,
  "oldValue": <string>,
  "newValue": <string>
}

URL: https://www.seattlebandmap.com/api/edit-history/annotations
Methods: GET, POST, PATCH, PUT, DELETE
Response: <annotation-collection>

URL: https://www.seattlebandmap.com/api/edit-history/annotations/{annotation}
Methods: GET, PATCH, PUT, DELETE
Response: <annotation>

Where <annotation> is:
{
  "id": <id>,
  "link": <url>,
  "edit": <edit-basics>,
  "editor": <editor-basics>,
  "fact": <string>,
  "revision": <revision-basics>,
  "infoSource": <info-source-basics>,
  "url": <string>,
  "fullRequest": <string>, // If it exists.
  // Datetime the URL was retrieved and/or the annotation was made:
  "datetime": <datetime>,
  "description": <string>
}

POSTed annotations require a revision to be tied to.

Only the "description" field is mutable after an initial POST.


URL: https://www.seattlebandmap.com/api/edit-history/info-sources
Methods: GET, POST, PATCH, PUT, DELETE
Response: <info-source-collection>

URL: https://www.seattlebandmap.com/api/edit-history/info-sources/{info-source}
Methods: GET, PATCH, PUT, DELETE
Response: <info-source>

Where <info-source> is:
{
  "id": <id>,
  "link": <url>,
  "url": <url>,
  "description": <string>,
  "parent": <info-source-basics>,
  "children": [<info-source-basics>, ...],
  "tags": [<tag>, ...],
}

URL: https://www.seattlebandmap.com/api/edit-history/info-source-tags
Methods: GET, POST, DELETE
Response: See "Tag Collections" section above.

URL: https://www.seattlebandmap.com/api/edit-history/info-source-tags/{tag}
Methods: GET, DELETE
Response: See "Tag Collections" section above.


USERS AND SESSIONS

URL: https://www.seattlebandmap.com/api/users
Methods: GET, POST, PATCH, PUT, DELETE
Response: <user-collection>

URL: https://www.seattlebandmap.com/api/users/{user}
Methods: GET, PATCH, PUT, DELETE
Response: <user-collection>

Where <user> is:
{
  "id": <id>,
  "link": <url>,
  "username": <string>,
  "appRole": "user"|"bot"|"admin",
  "identityType": "bandmap",
  "email": <string>,
  // Input-only field for initial signup, users can POST a new user object 
  // with a hashed and salted password key using a nonce in the "password" field.
  // This will be re-hashed and stored serverside.
  // (See http://stackoverflow.com/questions/3391242/
  // should-i-hash-the-password-before-sending-it-to-the-server-side).
  // The "oldPassword" field is required for PATCHing password changes (with
  // identical security precautions).  GETs do not return either password field.
  "password": <string>,
  "oldPassword": <string>,
  "isVerified": <boolean>,
  "person": <person-basics>, // If this user has an associated person resource.
  "edits": [<edit-basics>, ...], // One year's worth, max 10000.
  "editsCount": <int>,
  "revisions": [<revision-basics>, ...],
  "revisionsCount" <int>,
  "annotations": [<annotation-basics>, ...],
  "annotationsCount" <int>,
  "sessions": [<session-basics>, ...], // One year's worth, max 100.
  "sessionsCount": <int>,

  // For Admins Only:
  // Deleted users only visible and returned to admin requests.
  "isDeleted": <boolean>
}

Non-admin users will see only their own registered user at the /users collection, if they have one.

Non-admin users will only be able to POST one object here (their new user record, when initially registering at Band Map).

A successful DELETE call just sets the user's is_deleted flag in the database.

URL: https://www.seattlebandmap.com/api/sessions
Methods: GET, DELETE
Response: <session-collection>

URL: https://www.seattlebandmap.com/api/sessions/{session}
Methods: GET, DELETE
Response: <session>

Where <session> is:
{
  "id": <id>,
  "link": <url>,
  "username": <string>, // User's username or ip address for anons.
  "start": <datetime>,
  "end": <datetime>,
  "edits": [<edit-basics>, ...],
  "revisions": [<revision-basics>, ...],
  "annotations": [<annotation-basics>, ...],

  // For Admins Only:
  "user": <user-basics>, // If user is registered.
  "ipAddress": <string>,
  "userAgent": <string>,
  "cookie" <string> // If one is stored.
}

Non-admin users will see only their own user sessions at the /sessions collection, mostly in read-only form.
