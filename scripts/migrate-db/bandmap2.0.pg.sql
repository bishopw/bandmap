/*

Seattle Bandmap DB 2.0

This schema is a data normalization and redesign of the original Bandmap data
model.  I've tried to:

1) Deduplicate and decouple discrete entities (members and cities in bands
   mostly) so each person or city or whatever only appears in the database once
   under one specific id.

2) Add more flexibility so we can easily add new types of band connections and
   new types of info about bands in the future.

3) Add support for seeing band members' roles and for seeing changes in band
   locations and members and their roles over time.

4) Add support for optional user records, role based access control, wiki-style
   edit histories, and citations for facts about bands so potential new data
   collector robots (and humans too) can justify their edits.

5) Remove the concept of "pending" stuff and manually verifying it in the admin
   page in favor of an auditable edit trail associated with editors (both
   registered and anonymous).

Tables in the new model can be organized into the following groups:

PEOPLE
LOCATIONS
BANDS
ACTIVE DATES
ADMIN
EDIT HISTORY
TAGS
CITATIONS
WEB

I included commentary on some of my design thoughts in inline comments and
expansion ideas for the future in ((double parens)).

*/

-- create database bandmap encoding utf8;
-- connect to bandmap

-- PEOPLE

create table if not exists people (
  id serial not null,
  name varchar(255) unique not null,
  -- ((web_links))?  Kinda wanna resist going in the direction of personal data
  -- collection on individuals though... although the below would definitely
  -- be interesting for aggregate music community surveys/specialized maps:
  -- ((gender, ethnicity, nationality, birthday))?
  -- Maybe we could eventually add some of that via tags for people and bands?
  primary key (id)
);
create index on people(name);
create unique index on people(lower(name));
create index on people(click_count);

-- For "also known as"/"formerly known as" person names.
create table if not exists person_aliases (
  alias varchar(255) not null,
  primary key (alias)
);

create table if not exists person_person_aliases (
  person_id int not null,
  person_alias varchar(255) not null,
  primary key (person_id, person_alias),
  foreign key (person_id)
    references people(id)
    on delete cascade, -- Deleting a person deletes their alias links.
  foreign key (person_alias)
    references person_aliases(alias)
    on delete cascade -- Deleting an alias deletes its person links.
);
create index on person_person_aliases(person_alias);
create unique index on person_person_aliases(lower(person_alias));

-- LOCATIONS

create table if not exists countries (
  id serial not null,
  name varchar(255) unique not null,
  primary key (id)
);
create index on countries(name);
create unique index on countries(lower(name));

create table if not exists states ( -- Or province/prefecture/what-have-you.
  id serial not null,
  name varchar(255) not null,
  country_id int,
  primary key (id),
  foreign key (country_id)
    references countries(id)
    on delete set null -- Deleting a country orphans all its states.
);
create index on states(name);
create unique index on states(lower(name));
create index on states(country_id);

create table if not exists cities (
  id serial not null,
  name varchar(255) not null,
  state_id int,
  primary key (id),
  foreign key (state_id)
    references states(id)
    on delete set null -- Deleting a state orphans all its cities.
);
create index on cities(name);
create index on cities(lower(name));
create index on cities(state_id);

create table if not exists regions ( -- Like "Pacific Northwest".
  id serial not null,
  name varchar(255) unique not null,
  primary key (id)
);
create index on regions(name);
create unique index on regions(lower(name));

create table if not exists region_cities (
  region_id int not null,
  city_id int not null,
  primary key (region_id, city_id),
  foreign key (region_id)
    references regions(id)
    on delete cascade, -- Deleting a region deletes its region-city definitions.
  foreign key (city_id)
    references cities(id)
    on delete cascade -- Deleting a city deletes its region-city definitions.
);
create index on region_cities(city_id);

create table if not exists region_states (
  region_id int not null,
  state_id int not null,
  primary key (region_id, state_id),
  foreign key (region_id)
    references regions(id)
    on delete cascade, -- Deleting a region deletes its region-state definitions.
  foreign key (state_id)
    references states(id)
    on delete cascade -- Deleting a state deletes its region-state definitions
);
create index on region_states(state_id);

create table if not exists region_countries (
  region_id int not null,
  country_id int not null,
  primary key (region_id, country_id),
  foreign key (region_id)
    references regions(id)
    on delete cascade, -- Deleting a region deletes region-country definitions.
  foreign key (country_id)
    references countries(id)
    on delete cascade -- Deleting a country deletes region-country definitions.
);
create index on region_countries(country_id);

-- Let's allow regions composed of other regions, just be sure to check for
-- and reject circularly defined regions in the app.
create table if not exists region_regions (
  region1_id int not null,
  region2_id int not null,
  primary key (region1_id, region2_id),
  foreign key (region1_id)
    references regions(id)
    on delete cascade, -- Deleting a region deletes its parent regions.
  foreign key (region2_id)
    references regions(id)
    on delete cascade -- Deleting a region deletes its parent regions.
);
create index on region_regions(region2_id);

-- ((google_maps_info/geophysical_info))?


-- BANDS

create table if not exists bands (
  id serial not null,
  -- For solo artists, either a duplicate of the 
  -- person name field or their performing name:
  name varchar(255) unique not null, 
  click_count int not null,
  primary key (id)
);
create index on bands(name);
create unique index on bands(lower(name));
create index on bands(click_count);

-- For "also known as"/"formerly known as" band names.
create table if not exists band_aliases (
  alias varchar(255) not null,
  primary key (alias)
);
create unique index on band_aliases(lower(alias));

create table if not exists band_band_aliases (
  band_id int not null,
  band_alias varchar(255) not null,
  primary key (band_id, band_alias),
  foreign key (band_id)
    references bands(id)
    on delete cascade, -- Deleting a band deletes their alias links.
  foreign key (band_alias)
    references band_aliases(alias)
    on delete cascade -- Deleting an alias deletes its band links.
);
create index on band_band_aliases(band_alias);

create table if not exists roles ( -- 0="Member", "Vocalist", "Bassist", ...
  id serial not null,
  -- Person-role relations should be kept as minimal as possible: a "Vocalist"
  -- doesn't also need a "Member" entry.
  name varchar(255) unique not null,
  primary key (id)
);
create index on roles(name);
create unique index on roles(lower(name));

create table if not exists band_person_roles (
  band_id int not null,
  person_id int not null,
  role_id int not null,
  primary key (band_id, person_id, role_id),
  foreign key (band_id)
    references bands(id)
    -- Deleting a band deletes their associated band person roles.
    on delete cascade,
  foreign key (person_id)
    references people(id)
    -- Deleting a person deletes their associated band person roles.
    on delete cascade,
  foreign key (role_id)
    references roles(id)
    on delete restrict -- No deleting a role if a person has it in a band.
);
create index on band_person_roles(person_id);
create index on band_person_roles(role_id);

create table if not exists band_cities (
  band_id int not null,
  city_id int not null,
  primary key (band_id, city_id),
  foreign key (band_id)
    references bands(id)
    on delete cascade, -- Deleting a band deletes their relations to cities.
  foreign key (city_id)
    references cities(id)
    on delete restrict -- No deleting cities with bands in them.
);
create index on band_cities(city_id);

/*
If "connections" are just shared members, the new database design allows easy
lookup of that by joining the bands and people tables.  But bandmap.com says
bands are also connected if "b) two artists have collaborated on a project",
which I'm not clear on the exact meaning of that.  I'm also not sure after
looking through some of the pending connection rows whether people ever submit
connections besides shared members connections.
Although there seem to be least a few connections in the DB that are not shared
members connections, like Bikini Kill<->Sleater-Kinney.  And these connections
are not annotated, so we have to guess what they are.
In any case, about 2/3 of bands in the DB currently have no listed members,
just unannotated connections.  So we need to preserve these connections until
we can classify them better (hopefully with bots and not by hand).
*/
create table if not exists connections (
  band_1_id int not null,
  band_2_id int not null,
  description text not null,
  primary key (band_1_id, band_2_id),
  foreign key (band_1_id)
    references bands(id)
    -- Deleting a band deletes their connections to other bands.
    on delete cascade,
  foreign key (band_2_id)
    references bands(id)
    -- Deleting a band deletes their connections to other bands.
    on delete cascade
);
create index on connections(band_2_id);


-- ACTIVE DATES

/*
Active date ranges for bands, band_cities, and band_person_roles.
They get their own table because there can potentially be many-to-one relations
of any of the three types.
These can potentially get orphaned if bands/band_cities/band_person_roles are
deleted without their corresponding active_dates being cleaned up, so the app
will either have to be smart about that, or we have to periodically sweep
through this table pruning orphaned active_dates.
*/
create table if not exists active_dates (
  id serial not null,
  "from" date,
  until date,
  primary key (id)
);

/*
When was a band active.
The app should probably deduplicate (delete) active date relations in this 
table in preference of the more specific active date relations in band_cities
or band_person_roles when they overlap.
*/
create table if not exists band_active_dates (
    band_id int not null,
    active_dates_id int not null,
    primary key (band_id, active_dates_id),
    foreign key (band_id)
      references bands(id)
      -- Deleting a band deletes its active dates relations.
      on delete cascade,
    foreign key (active_dates_id)
      references active_dates(id)
      -- Deleting an active dates range deletes its relation to a band.
      on delete cascade
);
create index on band_active_dates(active_dates_id);

-- When was a band based in a specific city.
create table if not exists band_city_active_dates (
    band_id int not null,
    city_id int not null,
    active_dates_id int not null,
    primary key (band_id, city_id, active_dates_id),
    foreign key (band_id, city_id)
      references band_cities(band_id, city_id)
      -- Deleting a band city deletes its active dates relations.
      on delete cascade,
    foreign key (active_dates_id)
      references active_dates(id)
      -- Deleting an active dates range deletes its relation to a band city.
      on delete cascade
);
create index on band_city_active_dates(city_id);
create index on band_city_active_dates(active_dates_id);

-- When did a person have a specific role in a specific band.
create table if not exists band_person_role_active_dates (
    band_id int not null,
    person_id int not null,
    role_id int not null,
    active_dates_id int not null,
    primary key (band_id, person_id, role_id, active_dates_id),
    foreign key (band_id, person_id, role_id)
      references band_person_roles(band_id, person_id, role_id)
      -- Deleting a band person role deletes its active dates relations.
      on delete cascade,
    foreign key (active_dates_id)
      references active_dates(id)
      -- Deleting an active dates range deletes its relation to a bpr.
      on delete cascade
);
create index on band_person_role_active_dates(person_id);
create index on band_person_role_active_dates(role_id);
create index on band_person_role_active_dates(active_dates_id);


-- ADMIN

-- Types of user identity used by Band Map - just "bandmap" for now, possibly
-- "google" or "facebook" or whatever in future so you could log in with your
-- username from those sites.
-- To clarify, I still want to allow anonymous users to edit/submit bands and
-- info, but I think we should also implement users and identity to support
-- potential features like administrator-only functionality in the web app and
-- users browsing or taking credit for their own editing histories.

create table if not exists identity_types (
  id serial not null,
  name varchar(255) unique not null,
  primary key (id)
);

create table if not exists app_roles ( -- "user", "bot", "admin"
  id serial not null,
  name varchar(255) unique not null,
  primary key (id)
);

create table if not exists users (
  id serial not null,

  identity_type_id int not null,
  app_role_id int not null,

  person_id int, -- In case a user wants to also identify as a band person(!)

  -- Edits and session logs will appear under this username, rather than the
  -- associated person name.  Email/password fields below could be null for
  -- future non-"bandmap" identities.
  username varchar(255) unique not null,
  email_address text,
  password_hash text, -- salted, hashed password
  -- For doing that 'click the link in your email to verify' thing for new users:
  is_verified boolean not null default false,
  -- Allow deleting users without invalidating session/edit records:
  is_deleted boolean not null default false,

  primary key (id),

  foreign key (identity_type_id)
  references identity_types(id)
    on delete restrict, -- No deleting an identity type belonging to a user.
  foreign key (app_role_id)
  references app_roles(id)
    on delete restrict, -- No deleting an app role belonging to a user.
  foreign key (person_id)
  references people(id)
    on delete set null -- Deleting a person orphans their associated user.
);
create index on users(identity_type_id);
create index on users(app_role_id);
create index on users(person_id);

create table if not exists sessions (
  id serial not null,
  user_id int, -- Null for anonymous sessions.
  ip_address text,
  -- Value of "Set-Cookie" sessionToken last sent to client maybe.  Actually,
  -- haven't looked enough into how OAuth2 or whatever we want to use works yet.
  cookie text,
  last_request timestamp with time zone,
  start timestamp with time zone not null,
  "end" timestamp with time zone,
  primary key (id),
  foreign key (user_id)
  references users(id)
    on delete set null -- Deleting a user orphans their session records.
);
create index on sessions(user_id);


-- EDIT HISTORY

/*
To support tracked edit histories and rollbacks as cleanly and efficiently as I
could figure out how, the API service keeps a record of every edit (POST, PATCH,
PUT, DELETE) ever made, the original request as well as the table changes, in a
set of "edit history" themed tables:
*/

-- The full text of the original HTTP request from edit requests, including
-- method, headers, and body.
create table if not exists edit_request_text (
  id bigserial not null,
  body text not null,
  primary key (id)
);

/*
Information about anonymous editors.  For registered editors, a reference to
their users table row is used instead.  For anons, we'll use their IP
address as their name.  Anon user agent strings are also saved and maybe also
shown as identifiers in some admin contexts.  Anonymous edits from the same IP
will be considered the same editor and reuse their editor entry if it already
exists in the database.
*/
create table if not exists anonymous_editors (
  id serial not null,
  ip_address varchar(255) not null,
  user_agent text not null,
  primary key (id)
);
create index on anonymous_editors(ip_address);
create index on anonymous_editors(user_agent);

-- Create a generic "editors" list as an extra layer of abstraction to smooth
-- over the wrinkle that "some editors are anons, some are registered" for
-- tables that just want to refer to editors of either type.
create table if not exists editors (
  id serial not null,
  -- Either user_id or anonymous_editor_id should be null, not both.
  user_id int,
  anonymous_editor_id int,
  primary key (id),
  foreign key (user_id)
    references users(id)
    -- Deleting a user deletes its editor record (although users should
    -- not be deleted, only flagged is_deleted).
    on delete cascade,
  foreign key (anonymous_editor_id)
    references anonymous_editors(id)
    -- Deleting an anonymous_editor deletes its editor record.
    on delete cascade
);
create index on editors(user_id);
create index on editors(anonymous_editor_id);

-- Metadata about the edit, including references to the editor and request text.
create table if not exists edits (
  id bigserial not null,
  datetime timestamp with time zone not null,
  editor_id int,
  edit_request_text_id bigint,
  session_id int,
  primary key (id),
  foreign key (editor_id)
    references editors(id)
    on delete set null, -- Deleting an editor orphans their edit references.
  foreign key (edit_request_text_id)
    references edit_request_text(id)
    on delete set null, -- Deleting a request record orphans its edit reference.
  foreign key (session_id)
    references sessions(id)
    on delete set null -- Deleting a session orphans its edit reference.
);
create index on edits(datetime);
create index on edits(editor_id);
create index on edits(session_id);

-- A full copy of each cell's data (cast to text) at each revision.
create table if not exists cell_revision_text (
  id bigserial not null,
  "text" text not null,
  primary key (id)
);

-- Enforce one single set of column names when we are refering to our database
-- columns in our cell revisions table.  We do this by making the
-- (table, column) pair here a unique index.  Then whenever we want to refer
-- to a column in our cell revisions table we'll refer to it as an entry in
-- this table.
create table if not exists table_columns (
  id serial not null,
  "table" varchar(255) not null,
  "column" varchar(255) not null,
  primary key (id)
);
create unique index on table_columns("table", "column");

create table if not exists cell_revision_types (
  id serial not null,
  name varchar(255), -- "insert", "update", or "delete".
  primary key (id)
);

create table if not exists cell_revisions (
  id bigserial not null,
  cell_revision_type_id int not null,  -- "insert", "update", or "delete".
  table_column_id int not null,
  -- Composite row IDs will be saved as comma-delimited strings, like:
  -- "id_1,id_2,id_3,..."
  row_id varchar(255) not null,
  -- Contents of the cell before the edit, null for inserts.
  before_cell_revision_text_id bigint,
  -- Contents of the cell after the edit, null for deletes.
  after_cell_revision_text_id bigint,
  primary key (id),
  foreign key (cell_revision_type_id)
    references cell_revision_types(id)
    on delete restrict, -- No deleting cell revision types.
  foreign key (table_column_id)
    references table_columns(id)
    on delete set null, -- Deleting a table column orphans its cell revision links.
  foreign key (before_cell_revision_text_id)
    references cell_revision_text(id)
    on delete set null, -- Deleting a cell revision orphans its edit references.
  foreign key (after_cell_revision_text_id)
    references cell_revision_text(id)
    on delete set null -- Deleting a cell revision orphans its edit references.
);
create index on cell_revisions(cell_revision_type_id);
create index on cell_revisions(table_column_id);
create index on cell_revisions(row_id);

-- A single API edit request could change multiple tables, rows, and cells,
-- and since we want to track every cell revision for every edit (to link them
-- to facts and annotations/citations), we need a one-to-many edits-to-cells
-- relation.
-- This table contains the references to each cell revision made in
-- a given edit.
create table if not exists edit_cell_revisions (
  edit_id bigint not null,
  cell_revision_id bigint not null,
  primary key (edit_id, cell_revision_id),
  foreign key (edit_id)
    references edits(id)
    -- Deleting an edit deletes its associated cell revision links.
    on delete cascade,
  foreign key (cell_revision_id)
    references cell_revisions(id)
    -- Deleting a cell revision deletes its link to an edit.
    on delete cascade
);
create index on edit_cell_revisions(cell_revision_id);


-- TAGS

-- Tag lookup table for all tags from lookup form ("lowercasewithnospaces")
-- to canonical form ("lowercase-with-no-spaces").
create table if not exists tags (
  tag varchar(255),
  canonical_form varchar(255),
  primary key (tag)
);


-- CITATIONS

-- Tags for categorizing info sources, like "bandcamp band page" or
-- "facebook event page".
create table if not exists info_source_tags (
  tag varchar(255),
  primary key (tag),
  foreign key (tag)
    references tags(tag)
    -- Deleting a tag from the lookup table deletes it in all tag collections.
    on delete cascade
);

/*
A rows in the info sources table is a source of info, typically for band fact
citations, usually a website, like Bandcamp; a database, like freedb; or
an API, like Songkick's API.

Data collector bots find, register, and use these as they collect band info.
Custom bot modules could be made for certain source categories, so that bots
could be taught, for example, how to effectively scrape a Bandcamp band page.
To this end I included the concept of "info source tags", to more easily mark
info source categories.

Human Band Map users can also create, cite, and edit sources.

Eventually different metrics for reliability and weight could also be tied
to info sources, so the bots could prioritize which sources to scrape.
Entities like Songkick could have multiple sources ("Songkick API" and
"Songkick Website"), but sources should generally be pretty monolithic.
Because for example I think it would be less useful to keep track of lots
of subsections and subpages of sites as separate sources with their own
reliability ratings and everything.
*/
create table if not exists info_sources (
  id serial not null,
  url text unique not null,
  description text,
  primary key (id)
);
create index on info_sources(url);
create index on info_sources(lower(url));

-- One-to-many info-source-to-tags relations.
create table if not exists info_source_info_source_tags (
  info_source_id int not null,
  info_source_tag varchar(255) not null,
  primary key (info_source_id, info_source_tag),
  foreign key (info_source_id)
    references info_sources(id)
    on delete cascade, -- Deleting an info source deletes its tag links.
  foreign key (info_source_tag)
    references info_source_tags(tag)
    on delete cascade -- Deleting a tag deletes its info source links.
);
create index on info_source_info_source_tags(info_source_tag);

-- We can also make info sources heirarchical, to represent the ownership
-- relationships like how all Bandcamp band page info sources belong to the
-- umbrella "Bandcamp website" info source.
create table if not exists info_source_children (
  parent_id int not null,
  child_id int not null,
  primary key (parent_id, child_id),
  foreign key (parent_id)
    references info_sources(id)
    on delete cascade, -- Deleting a parent info source deletes its child links.
  foreign key (child_id)
    references info_sources(id)
    on delete cascade -- Deleting a child info source deletes its parent links.
);
create index on info_source_children(child_id);

/*
An annotation is usually a citation about where a band fact came from.  Or it
could also just be extra miscellaneous info about a band, person, connection,
or other cell/fact in the database.

Zero or more annotations can be tied to any cell revision in the database, and
therefore to any "fact" about the bands (see "Facts With Citations and Sources"
in "Band Map for Devs.txt").

Annotations are typically tied to their cell revision when it is first made (on
the original insert, update, or delete), but new ones can also be added any
time afterward by later editors/bots going back and adding additional
annotations/citations for existing cells/facts.

So each annotation gets its own editor and datetime entries even though
they are often redundant with the editor/datetime in the original edit.
*/
create table if not exists annotations (
  id bigserial not null,
  editor_id int,
  info_source_id int,
  -- Datetime the URL was retrieved and/or the annotation was made:
  datetime timestamp with time zone,
  -- Note this URL is usually more specific (a specific page or API request
  -- link or whatever) than the related info source url:
  url text,
  -- If the info retrieval request required a POST or some kind of more
  -- complicated lookup, provide for recording the whole HTTP request text
  -- needed to reproduce it.  This should hopefully be unnecessary and left
  -- null usually though.
  full_request text,
  description text,
  -- We could eventually add fields like "is_wrong" or "is_gone_now" as signals
  -- for rating info sources (like by how correct and how long-lived are the
  -- annotations associated with them).
  -- is_wrong boolean default false,
  -- is_gone_now boolean default false,
  primary key (id),
  foreign key (editor_id)
    references editors(id)
    on delete set null, -- Deleting an editor orphans their annotations.
  foreign key (info_source_id)
    references info_sources(id)
    on delete set null -- Deleting an info source orphans its annotations.
);
create index on annotations(editor_id);
create index on annotations(datetime);
create index on annotations(info_source_id);

/*
The cell revision annotations table contains the one-to-many relations of
cell revisions to their annotations.

A single annotation can be shared by multiple cells/facts, although this is not
ideal for citations, which would ideally have a one cell/fact to 1+ citation
ratio.

But especially for human-entered citations, it is a pain to associate them
specifically with a single cell - we don't want to bother our editors to know
the specific table structures of our database but we do want to provide them
some way of entering annotations through the API.  So the API accepts optional
"annotations" lists for most object collections and sub-collections.

Every annotation submitted in one of these lists is automatically tied to
*every* cell_revision related to the object at that sub-collection level.  For
example if a user submits two annotations about a band person's role as part of
a new band POST to /api/bands, both annotations will be related via this table
to the band_person_role cell revision.

Bots entering citations use a description format that the API will use to
attempt to more specifically associate each citation with just one specific
cell/fact.  In the annotation's description field, they write:

- <fact sentence> (<table name>/<row name>): <reason>

Where <reason> is how they inferred the fact from the specified url.  This
could be a full text quote scraped off the page, or a scraped from a field on the page

For example, the following two annotations would be entered by a bot through
the API after it picks up a new fact about the Cute Lepers' active dates:

url: https://en.wikipedia.org/wiki/The_Cute_Lepers
description: - The Cute Lepers started being active in 2007. (active_dates / from): "The band was formed in 2007 during the current Briefs hiatus."

url: https://en.wikipedia.org/wiki/The_Cute_Lepers
description: - The Cute Lepers started being active in 2007. (band_active_dates / band_id,active_dates_id): "The band was formed in 2007 during the current Briefs hiatus."

The API will parse these specially and enter a single annotation with
both cell revisions  ([active_dates / from] and [band_active_dates /
band_id,active_dates_id]) linking to it:

url: https://en.wikipedia.org/wiki/The_Cute_Lepers
description: The Cute Lepers started being active in 2007: "The band was formed in 2007 during the current Briefs hiatus."
*/
create table if not exists cell_revision_annotations (
  cell_revision_id bigint,
  annotation_id bigint,
  primary key (cell_revision_id, annotation_id),
  foreign key (cell_revision_id)
    references cell_revisions(id)
    -- Deleting a cell_revision (shouldn't happen) deletes its annotation links.
    on delete cascade,
  foreign key (annotation_id)
    references annotations(id)
    -- Deleting an annotation deletes its cell revision links.
    on delete cascade
);
create index on cell_revision_annotations(annotation_id);


-- WEB

-- A band web link is actually just a link to an info source that gets special
-- presentation in the UI.
create table if not exists band_info_sources (
  band_id int not null,
  info_source_id int not null,
  primary key (band_id, info_source_id),
  foreign key (band_id)
    references bands(id)
    on delete cascade, -- Deleting a band deletes their relations to web links.
  foreign key (info_source_id)
    references info_sources(id)
    on delete cascade -- Deleting a source deletes its associations with bands.
);
create index on band_info_sources(info_source_id);


-- ((Future ideas:))

-- VENUES

-- SHOWS

-- ALBUMS

-- TAGS (for bands, people, venues: basically shorter, deduplicated annotations)

-- RECORD LABELS

-- GENRES

-- BIOGRAPHIES (could already be done with annotations though...)

-- IMAGES

-- AUDIO

-- VIDEO
