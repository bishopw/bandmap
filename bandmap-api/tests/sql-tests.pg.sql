/*
4 Test Smoke
http://localhost:3000/api/bands/?limit=4&offset=98
http://localhost:3000/api/bands/?limit=4&offset=98&fields=bands.name,bands.peopleCount,bands.connectedBandsCount,bands.citiesCount,bands.clickCount&sort=bands.clickCount:desc
http://localhost:3000/api/bands/wimps
http://localhost:3000/api/bands/wimps/people
http://localhost:3000/api/connections

Band Map 2.0: 00/16:
  07.22 (01/16): Plan Refactoring.
  07.29 (02/16): Refactoring.  14  api & docs running, debuggable.  15  git in order.  35  think about new code and class layout, read through design doc again.  14  mess with swagger-ui config /docs vs. /api-docs URI.  12  move files to new directory layout.  25  implement new codepaths piecemeal, one test at a time for the endpoints under test.  25    api-handler, error-handler.        request.        http://localhost:3000/api/bands/?limit=4&offset=988.
  08.04 (03/16): Get Connections.get all connections: http://localhost:3000/api/connections.25  get all connections: http://localhost:3000/api/connections.  25  split off new codepath through collection-handler for /api/connections.  25  what parts of Request should be preserved and what should be made vestigial?  25  it kind of looks ok...database.js is the mess...      maybe splitting off a new codepath is not the right answer.  25  maybe try to get connections to work there and refactor it later?  25  augment db "objects" lookup with aliased objects like band1 band2 (=>bands).  25  tlo lookup fails for e.g. 'band1'... just make it alias the band tlo?      sophisticate the object.fields member just enough to allow composite ids.  50  or use withClause member?
  08.05        : Get Connections.  25  get all connections.  25  using withClause member for connections object.  12  add database.js internal-use only db fields for band_1_id, band_2_id.  15  fix can't find primary id for nonexistent tloName 'band2'/'band1' - make alias tlos.  25  fix band1 and band2 are empty -  150  assembleResultObject() not adding 'id', 'link', 'name' fields...      default order by (band_1_id,band_2_id).
  08.06 (04/16): Get Connections.  75  fix assembleResultObject() not adding 'id', 'link', 'name' fields.      fix band1.link and band2.link fucked up.  50  default order by (band_1_id,band_2_id).
  08.19 (05/16): Get Connections.  25  sort by band1id, band2id.  25  connections_band1__id does not exist.  25  the sort parent path should actually always be the last leaf node.  25  because that is where you'll find the ids?.  25  column b_p.bands_people__id does not exist.  40  hardcoded band_1_id/band_2_id don't error, but aren't applied.

      sort by band1id, band2id.
      fix parseSort is trimming the special case connections fields.

what happens on band1/band2 leaves?

finalFieldPrefix: bands_people__
db.get(): lookup fully qualified field: b_p.bands_people__id
...b_p_ad.bands_people__id AS bands_people__id...
SequelizeDatabaseError: column b_p.bands_people__id does not exist

finalFieldPrefix: bands_people__
                  connections_band1__

fetchData 656-993
fetchDataLeaf 517-628
db.get 715-1203

                 Some jasmine node smoke tests - at least for 200 status.
                 GET tests work with new code org and refactored codepath.
                 wiki-style CRUD ops on bands/connections w/ history and rollback.
                 New DB migration script that goes through API.
                 New admin UI interface - approve/revert edits individually or by session/user batch.
                 Internet Staging Site
           8/16: 1.0 parity
          12/16:
          16/16
  Due eod 11.24:
              Weekend Days till 11.25:      37 (19*2)-1
                   Minus Known Events: -10: 27 (incl. babysit 07.21)
  Minus 1C Time Tracker To v.1.0 Days:  -2: 25
     Minus Typical Event Distribution:  -2: 23
         Minus 2 Lenity/Games Days/Mo:  -7: 16

sort: { 'connections.id': 'asc' } => { id: 'asc' }
vs special case sort: { 'connections.band1.id': 'asc', 'connections.band2.id': 'asc' }
  => { id: 'asc' }
{
  "link": "https://localhost:3000/api/connections?limit=1",
  "offset": 0,
  "limit": 1,
  "total": 5384,
  "connections": [
    {
      "id": "1-214",
      "link": "https://localhost:3000/api/connections/1-214",
      "band1": {
        "id": 1,
        "link": "https://localhost:3000/api/bands/1",
        "name": "141"
      },
      "band2": {
        "id": 214,
        "link": "https://localhost:3000/api/bands/214",
        "name": "D-Sane"
      },
      "description": ""
    }
  ],
  "connectionsCount": 1,
  "first": "https://localhost:3000/api/connections?limit=1",
  "next": "https://localhost:3000/api/connections?limit=1&offset=1",
  "last": "https://localhost:3000/api/connections?limit=1&offset=5383"
}

Instead of the problematic, brittle concept of ranges of active dates, shouldn't we just store band events like shows, album/song releases, and posts?  Isn't band activity more like a heat map of past events than a set of specific ranges?  What about band person role active dates and band city active dates?
Consider dated events: Show, Album, Song, Post/Article/Interview
How do we model the joining/leaving of people from bands over time?
Does each band event have to have an associated band lineup?  Seems too burdensome.
What about the location of bands and possible changes over time (La Luz moves from Seattle to L.A.)?
Is/are a band's city(ies) just the city(ies) with the most or the most recent band events?

Future: switch to actually using sequelize orm

Future bandmap-api module organization:

bandmap-api
  index.js
  tests
  node_modules
  src
    utils
    modules             - cross-cutting api functionality, used by all the handlers
      auth              - authentication and authorization provision, tracking tokens
      cache
      database          - db connection provision, all db queries should go through here
      request           - wrapper around connect request for band-map-specific request functionality, especially swagger field parsing, validation, and mapping
      response          - band-map-specific response functionality: mostly a helper for collection handlers to map db output back to response fields, validation with swagger
      filter
      sort
      collection        - base class for all collection handlers in collections dir
      collection-item   - base class for all collection item handlers in collections dir
    handlers
      api-handler       - entry point, request pre-processing, and initial routing to appropriate target handler
      error-handler
      directory-handler
      collection-handler
      collection-item-handler
    collections         - collection and collection-item handlers: contain collection-specific swagger<->db field mappings, SQL queries (could later be stored procs),
      bands               and any other logic or data specific to each collection.
      people
      roles
      connections

bugs:
  Just getting bandsCount should do a count *:
    http://localhost:3000/api/bands?fields=bandsCount&limit=5&offset=20
  These should be understood as no-ops and return immediately, echoing the input arg (with warning):
    http://localhost:3000/api/bands?fields=link&limit=5&offset=20
    http://localhost:3000/api/bands?fields=LiMiT&limit=5&offset=20
    http://localhost:3000/api/bands?fields=offset&limit=5&offset=20
    http://localhost:3000/api/bands?fields=warnings&limit=5&offset=20
    http://localhost:3000/api/bands?fields=errors&limit=5&offset=20
    http://localhost:3000/api/bands?fields=link,limit,offset,warnings,errors&limit=5&offset=20
  wrong 'total':
    http://localhost:3000/api/bands/wimps/people?limit=0
    http://localhost:3000/api/bands/wimps/people?limit=1

resolved bugs:
  parsing error: http://localhost:3000/api/bands?fields=total&limit=5
  wrong error: http://localhost:3000/api/bands/wimps/people?limit=4&offset=98
  should give empty collection: http://localhost:3000/api/bands/141/people
  last link beyond end of collection: http://localhost:3000/api/bands/?limit=10
  server-error: http://localhost:3000/api/bands/?limit=10&fields=total,bands.name,bands.people.name,bands.peopleCount,bands.connectedBandsCount,bands.connectedBands.name
  no default subsort by id: http://localhost:3000/api/bands/?limit=400&sort=bands.connectedBandsCount:asc&fields=bands.id,bands.name,bands.people.name,bands.peopleCount,bands.connectedBandsCount,bands.connectedBands.name

1.0 Parity Test/Specs (duplicated from main list below):
Backend:
  ✔ get all bands: http://localhost:3000/api/bands/?no-fields=bands.link,bands.connectedBands
  ✔ get all connections: http://localhost:3000/api/connections
In App:
    submit a connection (band1, band2, reason) => 
    submit a band (name, city, state, website, members, connected bands) => 
  ✔ click band node => get band info (connections (links and highlighted points on svg), location, website, members): 
    edit band (location, website, members) => click edit from band info:
    top 6 most recently updated:
  ✔ top 6 most connections:
  ✔ top 6 most popular:

Test/Specs For Common Use Cases (manual for now... should automate these):

http://localhost:3000/api/bands/
http://localhost:3000/api/bands/?limit=4&offset=988
http://localhost:3000/api/bands/?limit=4&offset=1098&sort=bands.clickCount
http://localhost:3000/api/bands/?limit=4&offset=98&sort=bands.clickCount:desc&fields=bands.name,bands.clickCount

http://localhost:3000/api/bands/?limit=10&sort=bands.peopleCount:desc
http://localhost:3000/api/bands/?limit=10&sort=bands.clickCount:desc
http://localhost:3000/api/bands/?limit=4&offset=98&sort=bands.peopleCount
http://localhost:3000/api/bands/?limit=4&offset=98&sort=bands.peopleCount,bands.connectedBandsCount,bands.citiesCount
http://localhost:3000/api/bands/?limit=4&offset=98&fields=bands.name,bands.peopleCount,bands.connectedBandsCount,bands.citiesCount
http://localhost:3000/api/bands/102/people?sort=people.rolesCount,people.activeDates.from
http://localhost:3000/api/bands/?limit=4&sort=bands.peopleCount:desc&fields=bands.name,bands.people.name,bands.peopleCount,bands.connectedBandsCount,bands.connectedBands.name
http://localhost:3000/api/bands/?limit=10&fields=bands.name,bands.people.name,bands.peopleCount,bands.connectedBandsCount,bands.webLinksCount
http://localhost:3000/api/bands/wimps/people?limit=2&sort=people.rolesCount
http://localhost:3000/api/bands?limit=10&offset=100
http://localhost:3000/api/bands/?limit=10&offset=100
http://localhost:3000/api/bands/wimps
http://localhost:3000/api/bands/wimps/people
http://localhost:3000/api/bands/wimps/people/rachel ratner
http://localhost:3000/api/bands/wimps/people/rachel ratner/roles
http://localhost:3000/api/bands/wimps/people/rachel ratner/roles/member
http://localhost:3000/api/bands?filter=bands.name eq "wimps"
http://localhost:3000/api/bands/Criambique
http://localhost:3000/api/bands/Criambique/people
http://localhost:3000/api/bands/Criambique/cities
http://localhost:3000/api/bands/Criambique/web-links
http://localhost:3000/api/bands
http://localhost:3000/api/bands/
http://localhost:3000/api/bands/102/connected-bands
http://localhost:3000/api/bands/102/connectedbands [expected: 404]
http://localhost:3000/api/locations/cities/Portland
http://localhost:3000/api/locations/cities

http://localhost:3000/api/bands?filter=bands.cities.name eq portland and bands.peopleCount gt 2 or bands.clickCount gt 10 or bands.people.roles.activeDates.from gt 2015&sort=bands.clickCount:desc,bands.people.name&limit=3

http://localhost:3000/api/bands?filter=(bands.cities.name eq 'oakland' or (bands.peopleCount gt 5 and (bands.clickCount gt 10 or bands.people.name gt m)))

http://localhost:3000/api/bands?filter=not not not not (not bands.cities.name eq 'oakland' or not (not bands.peopleCount gt 5 and not (not bands.clickCount gt 10 or not not bands.people.name gt m)))

http://localhost:3000/api/bands?filter=(bands.cities.name eq 'portland' or bands.peopleCount gt 2) and (bands.clickCount gt 10 or bands.people.roles.activeDates.from gt 2015)&sort=bands.clickCount:desc&limit=3

http://localhost:3000/api/bands?filter=name=wimps

http://localhost:3000/api/bands?filter=bands.cities.name eq 'oakland' or (bands.peopleCount gt 5 and (bands.clickCount gt 10 or bands.people.name gt m))

http://localhost:3000/api/bands?filter=bands.cities.name eq 'and' and bands.peopleCount gt 2 or bands.clickCount gt 10 or bands.people.roles.activeDates.from gt 2015 &sort=bands.clickCount:desc,bands.people.name&limit=3

() and ()

() and () not

http://localhost:3000/api/bands?filter=(bands.cities.name eq 'oakland' or (bands.peopleCount gt 5 and (bands.clickCount gt 10 or not bands.people.name gt m)))

http://localhost:3000/api/bands?filter=
(bands.peopleCount gt 5 and (bands.clickCount gt 10 or bands.people.name gt m))

http://localhost:3000/api/bands?filter=bands.cities.name eq 'and' and bands.peopleCount gt 2 or bands.clickCount gt 10 or bands.people.roles.activeDates.from gt 2015&sort=bands.clickCount:desc,bands.people.name&limit=3
*/

-- Leaf node data query example:
WITH
b AS (
  SELECT
  b.id AS band_id,
  b.name AS band_name,
  b.click_count AS band_click_count
  FROM bands AS b
  ORDER BY band_id
  LIMIT 1000 OFFSET 1000
),
b_count AS (
  SELECT count(*) AS band_count from b
),
p AS (
  SELECT
  b_count.band_count AS band_count,
  b.band_id AS band_id,
  b.band_name AS band_name,
  b.band_click_count AS band_click_count,
  p.id AS person_id,
  p.name AS person_name,
  p.click_count AS person_click_count,
  bpr.role_id AS role_id
  FROM people AS p
  INNER JOIN band_person_roles AS bpr
  ON p.id = bpr.person_id
  RIGHT JOIN b
  ON bpr.band_id = b.band_id
  LEFT JOIN b_count
  ON TRUE
),
p_count AS ( -- left join to this on band_id
  SELECT
  p.band_id AS band_id,
  COUNT(*) AS person_count
  FROM p
  WHERE NOT p.person_id IS NULL
  GROUP BY p.band_id
  UNION
  SELECT
  p.band_id AS band_id,
  0 AS person_count
  FROM p
  WHERE p.person_id IS NULL
),
r AS (
  SELECT
  p.band_count AS band_count,
  p.band_id AS band_id,
  p.band_name AS band_name,
  p.band_click_count AS band_click_count,
  p_count.person_count AS person_count,
  p.person_id AS person_id,
  p.person_name AS person_name,
  p.person_click_count AS person_click_count,
  p.role_id AS role_id,
  r.name AS role_name
  FROM roles AS r
  RIGHT JOIN p
  ON r.id = p.role_id
  LEFT JOIN p_count
  ON p_count.band_id = p.band_id
),
r_count AS (
  SELECT
  r.band_id AS band_id,
  r.person_id AS person_id,
  COUNT(*) AS role_count
  FROM r
  WHERE NOT r.role_id IS NULL
  GROUP BY r.band_id, r.person_id
  UNION
  SELECT
  r.band_id AS band_id,
  r.person_id AS person_id,
  0 AS role_count
  FROM r
  WHERE r.role_id IS NULL
  GROUP BY r.band_id, r.person_id
),
ad AS (
SELECT
  r.band_count AS band_count,
  r.band_id AS band_id,
  r.band_name AS band_name,
  r.band_click_count AS band_click_count,
  r.person_count AS person_count,
  r.person_id AS person_id,
  r.person_name AS person_name,
  r.person_click_count AS person_click_count,
  r_count.role_count AS role_count,
  r.role_id AS role_id,
  r.role_name AS role_name,
  ad.id AS active_dates_id,
  ad.from AS active_dates_from,
  ad.until AS active_dates_until
  FROM active_dates AS ad
  INNER JOIN band_person_role_active_dates AS bprad
  ON ad.id = bprad.active_dates_id
  RIGHT JOIN r
  ON r.role_id = bprad.role_id
  LEFT JOIN r_count
  ON r_count.band_id = r.band_id
  AND r_count.person_id = r.person_id
),
ad_count AS (
  SELECT
  ad.band_id AS band_id,
  ad.person_id AS person_id,
  ad.role_id AS role_id,
  COUNT(*) AS active_dates_count
  FROM ad
  WHERE NOT ad.active_dates_id IS NULL
  GROUP BY ad.band_id, ad.person_id, ad.role_id
  UNION
  SELECT
  ad.band_id AS band_id,
  ad.person_id AS person_id,
  ad.role_id AS role_id,
  0 AS active_dates_count
  FROM ad
  WHERE ad.active_dates_id IS NULL
  GROUP BY ad.band_id, ad.person_id, ad.role_id
)
SELECT
ad.band_count AS band_count,
ad.band_id AS band_id,
ad.band_name AS band_name,
ad.band_click_count AS band_click_count,
ad.person_count AS person_count,
ad.person_id AS person_id,
ad.person_name AS person_name,
ad.person_click_count AS person_click_count,
ad.role_count AS role_count,
ad.role_id AS role_id,
ad.role_name AS role_name,
ad_count.active_dates_count AS active_dates_count,
ad.active_dates_id AS active_dates_id,
ad.active_dates_from AS active_dates_from,
ad.active_dates_until AS active_dates_until
FROM ad
LEFT JOIN ad_count
ON ad_count.band_id = ad.band_id
AND ad_count.person_id = ad.person_id
AND ad_count.role_id = ad.role_id
ORDER BY band_id, person_id, role_id, active_dates_from;


-- Custom with clause: cityStateCountries:
WITH csc AS (
  SELECT
  {{fields}}
  FROM (
    SELECT
    c.id AS id,
    c.name || ', ' || s.name || ', ' || co.name AS name
    FROM cities AS c
    JOIN states AS s
    ON c.state_id = s.id
    JOIN countries AS co
    ON s.country_id = co.id;
  ) AS csc
  {{wheres}}
)

-- Custom with clause: connectedBands:
WITH b AS (
SELECT
b.id AS bands__id,
b.name AS bands__name
FROM bands AS b
),
cb AS (
SELECT
b.bands__id AS bands__id,
b.bands__name AS bands__name,
cb.id AS bands_connectedbands__id,
cb.name AS bands_connectedbands__name,
cb.description AS bands_connectedbands__description
FROM (
SELECT
  cx.band_1_id AS band_1_id,
  cx.band_2_id AS band_2_id,
  b.id AS id,
  b.name AS name,
  cx.description AS description
  FROM bands AS b
  JOIN connections AS cx
  ON b.id = cx.band_1_id OR b.id = cx.band_2_id
) AS cb
RIGHT JOIN b
ON b.bands__id != cb.id
AND (b.bands__id = cb.band_1_id OR b.bands__id = cb.band_2_id)
)
SELECT * FROM cb


-- FSL query example:
with b as (
select
b.id as band_id,
lower(b.name) as band_name,
b.click_count as band_clickcount
from bands as b
), p as (
select
b.band_id as band_id,
b.band_name as band_name,
b.band_clickcount as band_clickcount,
p.id as person_id,
lower(p.name) as person_name,
p.click_count as person_clickcount
from people as p
inner join band_person_roles as bpr
on p.id = bpr.person_id
right join b
on b.band_id = bpr.band_id
), c as (
select
p.band_id as band_id,
p.band_name as band_name,
p.band_clickcount as band_clickcount,
p.person_id as person_id,
p.person_name as person_name,
p.person_clickcount as person_clickcount,
c.id as city_id,
lower(c.name) as city_name
from cities as c
inner join band_cities as bc
on c.id = bc.city_id
right join p
on p.band_id = bc.band_id
), filtered as (
select
c.band_id as band_id,
c.band_name as band_name,
c.band_clickcount as band_clickcount,
c.person_id as person_id,
c.person_name as person_name,
c.person_clickcount as person_clickcount,
c.city_id as city_id,
c.city_name as city_name
from c
where (c.band_id > 1000 or c.person_name like lower('a%')) or (c.city_name = 'seattle')
), grouped as (
select
filtered.band_id as band_id,
min(filtered.band_name) as band_name,
min(filtered.band_clickcount) as band_clickcount,
min(filtered.person_id) as person_id,
min(filtered.person_name) as person_name,
min(filtered.person_clickcount) as person_clickcount,
min(filtered.city_id) as city_id,
min(filtered.city_name) as city_name
from filtered
group by band_id
), ordered as (
select
grouped.band_id as band_id,
grouped.band_name as band_name,
grouped.band_clickcount as band_clickcount,
grouped.person_id as person_id,
grouped.person_name as person_name,
grouped.person_clickcount as person_clickcount,
grouped.city_id as city_id,
grouped.city_name as city_name
from grouped
order by person_name desc nulls last, band_id desc nulls last
)
select * from ordered;


-- container query chain test
-- /bands/{band}/people/{person} example for /bands/wimps/people/rachel ratner
with b as (
select
b.id as band_id,
b.name as band_name,
b.click_count as band_clickCount
from bands as b
where lower(b.name) = 'wimps'
), bp as (
select
bpr.band_id as band_id,
bpr.person_id as person_id
from band_person_roles as bpr
join b
on b.band_id = bpr.band_id
group by bpr.band_id, bpr.person_id
), p as (
select
b.band_id as band_id,
b.band_name as band_name,
b.band_clickCount as band_clickCount,
p.id as person_id,
p.name as person_name,
p.click_count as person_clickCount
from people as p
join bp
on bp.person_id = p.id
join b
on b.band_id = bp.band_id
where lower(p.name) = 'rachel ratner'
)
select * from p
