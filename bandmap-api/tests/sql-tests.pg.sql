/*
7.28 GET tests work with new code org and refactored codepath

  14  api & docs running, debuggable.
  15  git in order
  35  think about new code and class layout, read through design doc again
  14  mess with swagger-ui config /docs vs. /api-docs URI
      move files to new directory layout
      implement new codepaths piecemeal, one test at a time for the endpoints under test
        http://localhost:3000/api/bands/?limit=4&offset=988

GET tests to work with new code org and refactored codepath
                 wiki-style CRUD ops on bands/connections w/ history and rollback
                 new admin page

Finish GET functionality for needed endpoints - test/specs first.
Finish POST/PATCH/PUT/DELETE for needed endpoints.
Wiki style auditable/revertable edit history - sessions, edits, sources, citations.
New DB migration script that goes through API.
New admin UI interface - approve/revert edits individually or by session/user batch.

Instead of the problematic, brittle concept of ranges of active dates, shouldn't we just store band events like shows, album/song releases, and posts?  Isn't band activity more like a heat map of past events than a set of specific ranges?  What about band person role active dates and band city active dates?
Consider dated events: Show, Album, Song, Post/Article/Interview
How do we model the joining/leaving of people from bands over time?
Does each band event have to have an associated band lineup?  Seems too burdensome.
What about the location of bands and possible changes over time (La Luz moves from Seattle to L.A.)?
Is/are a band's city(ies) just the city(ies) with the most or the most recent band events?

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
    handlers
      api               - entry point, request pre-processing, and initial routing to appropriate target handler
      error
      directory
      collection        - base class for all collection handlers in collections dir
      collection-item   - base class for all collection item handlers in collections dir
    collections         - collection and collection-item handlers: contain collection-specific swagger<->db field mappings, SQL queries (could later be stored procs) specific to retrieving each collection.
      bands
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
    get all connections: http://localhost:3000/api/connections
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
