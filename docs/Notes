Bandmap Notes

Some notes on Band Map dev stuff.


Linux

Find a command you ran a while ago:   history | grep <command>
Find a process:                       ps aux | grep <name>
Check a port:                         netstat | grep <port number>


Postgres

Become postgres user:   sudo -i -u postgres
Get postgres prompt:    psql
Shut down postgres:     send SIGTERM (smart, or SIGINT/SIGQUIT if urgent)
                        ps aux | grep postgres
                        sudo kill <pid>
                        pg_ctl should be a better method, but environment
                        variables are messed up on my postgres installation
                        so it doesn't work:
                        pg_ctl stop // (smart mode)
Mac OS install at:      /Library/PostgreSQL/9.6
Mac OS stop service:    sudo su
                        sudo -u postgres /Library/PostgreSQL/9.6/bin/pg_ctl -D /Library/PostgreSQL/9.6/data stop

Docker

Image: A filesystem and parameters.  Stateless and never changes.  Usually built from a different, base image.  Built with a Dockerfile script, like a makefile, optionally in a context where other input files can be referenced.  Composed of "layers".  Each line in a Dockerfile corresponds to a layer in the built image.

Layer: A discrete parameter or property of an image, applied in sequence when the image is built and corresponding to a single line in the Dockerfile build script.

Container: A running or ready-to-run instance of an image.

Service: A bit of executable code for accomplishing a specific task.  Can run in one or more containers.  Defined in YAML in a stack file.  Usually part of an app.

Stack: A set of services that make up an app.  Defined in YAML in a stack file.

Docker Engine: The program that runs Docker containers.  A client-server app where the server is the Docker daemon that provides a REST API, and the client is a CLI (Command Line Interface) that talks to the daemon through that API.

Machine: A remote or local machine, usually virtual, running Docker Engine, often provisioned/communicated with using Docker Machine.

Node: Another name for a machine.  Sometimes further classified as a manager or worker node.

Swarm: A set of nodes conceptually grouped together using docker commands to run the services of an app.  Nodes in the swarm know about each other and communicate over the network.

Manager Node: A node in a swarm that manages worker nodes.

Worker Node: A node in a swarm that is managed by manager nodes.

Docker Machine (docker-machine): A tool for provisioning remote or local virtual machines hosting Docker Engines.

Docker Compose (docker-compose): A higher-level tool for defining and running multi-container docker apps.  Creates and configures a set of containers from a docker-compose.yml file.

Compose Project: A Compose concept that groups a multi-container environment under a single name.

Data Volume: A special directory in a container for persistent or shared data.  Persists even if its container is deleted.  Created with a VOLUME instruction in a Dockerfile, or with -v /<dirname> flag to the docker run command.


Build image from ./Dockerfile & name: docker build -t whalesay-plus .
Tag image for upload to docker hub:   docker tag 35 <github-username>/whalesay-plus:latest
Start ubuntu container & enter shell: docker run --name ubuntu00 -it ubuntu bash
See all images:                       docker images
Remove an image:                      docker rmi 35 -f
See all containers, not just running: docker ps -as
Initialize a swarm:                   docker swarm init --advertise-addr 192.168.99.101
Get swarm join token for a worker:    docker swarm join-token worker
Join a worker to a swarm:             docker swarm join --token SWMTKN-1-525uqkghtybetqarqnqmuzij0qbqpj17ldha2zcxfptunm7vbk-1cu5cxqkm4t8obl86yebkiyco 192.168.99.101:2377
List nodes in a swarm:                docker node ls
Deploy an app from a stack file:      docker stack deploy --compose-file docker-stack.yml vote
See all services running for an app:  docker stack services vote
Remove an app:                        docker stack rm vote
Force remove all containers:          docker rm -f $(docker ps -a -q)

Create a new machine:                 docker-machine create --driver virtualbox default
List machines with ip addresses:      docker-machine ls
SSH into a machine:                   docker-machine ssh manager
Copy a file from host to machine:     docker-machine scp docker-stack.yml manager:/home/docker/

Build and run an app with Compose:    docker-compose up -d --build
Stop and remove whole app w/ volumes: docker-compose down --volumes

Run a postgres container w/ persistent volume mounted at local dir /var/lib/postgresql/data/bandmapdata:

docker run -d --name pg-test -p 5432:5432 -v /var/lib/postgresql/data/bandmapdata:/var/lib/postgresql/data/bandmapdata -e POSTGRES_PASSWORD=a -e PGDATA=/var/lib/postgresql/data/bandmapdata postgres:9.6-alpine


Git

git status -uno
git checkout -B bandmap-feature-name
git fetch --all

define an upstream repo:
<from local working dir>
git remote add upstream <upstream-repo>

see all checkout-able branches on all remotes and tracking branches for local branches:
git branch -avv

create a branch:
git branch <branch-name>

refresh a fork from its upstream repo:
<from local working dir>
git checkout master

git fetch <source-remote>
git merge <source-remote> <branch>
or?
git pull <source-remote> <branch>

git push <target-remote> <branch>

refresh a local branch from another local branch:
git checkout <local-branch>
git merge --no-ff <another-local-branch>
git push origin <local-branch>

cherrypick a commit from a different branch to current branch:
git cherry-pick 62ecb3

undo a bad pushed commit:
git reset --hard 7d0a08e7cac6cde83bebec973fe391f18e9c643c
git push --force <target-remote> +master

rebase some commits:
git checkout <feature-branch>
git rebase <master>

squash commits:
git checkout <master>
git rebase -i <branch-name>~[2 or whatever number of commits to go back]
alter file that pops up

amend a commit message:

git commit --amend

Commit message example (see http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html):

Capitalized, short (50 chars or less) summary-----

More detailed explanatory text, if necessary.  Wrap it to about 72------
characters or so.  In some contexts, the first line is treated as the
subject of an email and the rest of the text as the body.  The blank
line separating the summary from the body is critical (unless you omit
the body entirely); tools like rebase can get confused if you run the
two together.

Write your commit message in the imperative: "Fix bug" and not "Fixed bug"
or "Fixes bug."  This convention matches up with commit messages generated
by commands like git merge and git revert.

Further paragraphs come after blank lines.

- Bullet points are okay, too

- Typically a hyphen or asterisk is used for the bullet, followed by a
  single space, with blank lines in between, but conventions vary here

- Use a hanging indent

If you use an issue tracker, put references to them at the bottom,
like this:

Resolves: #123
See also: #456, #789

------------------------------------------------------------------------

Diff between branches and repos and stuff:
git diff --full-index > ~/diff-name.diff
git diff --full-index <target-remote>/<branch> <source-remote>/<branch> > ~/diff-name.diff
git diff --full-index <earlier-commit> <later-commit>
git diff --full-index 90fa55db7690a308e1f57d3ec0e2bd69305a3f41 c3de7fc81f4e751e6cc09b37d08fb6ad6025fb0c > ~/diff-name.diff


Swagger Codegen

(swagger-codegen)

Notes on swagger-codegen autogeneration modules:

  servers:

  nodejs-server:
    Probably will use for API and API docs server.  Seems mostly equivalent to the original test one.

  go-server:
    Had to fix imports as described at https://stackoverflow.com/questions/39665379/golang-fully-qualified-import-path-in-auto-generated-code
    Very barebones API response stubs (no response bodies) and no docs.

  python-flask:
    Does not run out of box.  Import statements are messed up - a bunch of missing underscores around numbers in filenames.  Unknown time to fix.

  clients:

  html:
    Simply formatted, badly presented, badly ordered static HTML API server docs in one html file.

  html2:
    Nicely formated (with sidebar TOC), badly ordered, slow static HTML single-file API client docs with nice code examples in many languages.


OAuth 2

Notes on http://www.bubblecode.net/en/2016/01/22/understanding-oauth2/ and https://aaronparecki.com/oauth-2-simplified/.

Definitions:
  "user" / "resource owner" = user
  "client" = bandmap-api or bandmap-web
  "API" / "resource server" = bandmap-api or bandmap-web
  "authorization server" / "service" = bandmap-auth

OAuth 2 API Password Login Flow

(See "oauth 2 password authentication.png".)

- This flow must only be used by apps "created by the [auth] service itself" (bandmap-api, bandmap-web, maybe bandmap-mobile).
- bandmap-api wants to access a Band Map users' profile.
- bandmap-api registers with bandmap-auth, giving bandmap-auth its app name ("Band Map API"), redirect URLs ("https://www.seattlebandmap.com/api[*?]"), grant types ("password"), and Javascript origin ("www.seattlebandmap.com").
- bandmap-auth gives bandmap-api a public client ID and a private client secret, both are unique random strings.
- User wants to log in to the API or request a restricted resource.
- User browses to seattlebandmap.com/api/restricted-thing.
- bandmap-api returns a login form with embedded parameter destination=seattlebandmap.com/api/restricted-thing.
- User submits username and hashed salted password to bandmap-api through form.
- bandmap-api packages username, hashed salted password, client ID, client secret, grant_type=password, and scope=user-info (meaning a request for access to the user's basic profile/representation as the user, the only Band Camp authorization scope for now).
- bandmap-auth checks hashed, salted password against accounts database.
- If password is wrong, bandmap-auth returns error to bandmap-api, bandmap-api returns "forgot my password" prompt to user.  Don't forget to keep passing along the original desired destination URL through the whole password recovery process.
- Once password is right, bandmap-auth sends an access token, expiration time, and a refresh token to bandmap-api.
- bandmap-api associates the access token with a session id.
- bandmap-api returns the session id to the user.
- User makes a series of requests to bandmap-api with the session id.  bandmap-api grants access to its restricted resources based on the session id's association with a valid access token.
- As long as the user keeps making regular requests, bandmap-api eventually uses the refresh token to get a new access token, expiration time, and refresh token from bandmap-auth.

"stay logged in"?


Swagger Generator

Full URL List
API Root
  /api
  /api/version
Bands
  /api/bands
  /api/bands/{band}
  /api/bands/{band}/aliases
  /api/bands/{band}/aliases/{alias}
  /api/bands/{band}/cities
  /api/bands/{band}/cities/{city}
  /api/bands/{band}/people
  /api/bands/{band}/people/{person}
  /api/bands/{band}/people/{person}/roles
  /api/bands/{band}/people/{person}/roles/{role}
  /api/bands/{band}/connected-bands
  /api/bands/{band}/connected-bands/{connected-band}
  /api/bands/{band}/web-links
  /api/bands/{band}/web-links/{web-link}
Connections
  /api/connections
  /api/connections/{connection}
People
  /api/people
  /api/people/{person}
  /api/people/{person}/aliases
  /api/people/{person}/aliases/{alias}
  /api/people/{person}/bands
  /api/people/{person}/bands/{band}
  /api/people/{person}/bands/{band}/roles
  /api/people/{person}/bands/{band}/roles/{role}
  /api/people/{person}/roles
  /api/people/{person}/roles/{role}
  /api/people/{person}/cities
  /api/people/{person}/cities/{city}
Roles
  /api/roles
  /api/roles/{role}
Locations
  /api/locations
  /api/locations/cities
  /api/locations/cities/{city}
  /api/locations/states
  /api/locations/states/{state}
  /api/locations/states/{state}/cities
  /api/locations/states/{state}/cities/{city}
  /api/locations/countries
  /api/locations/countries/{country}
  /api/locations/countries/{country}/states
  /api/locations/countries/{country}/states/{state}
  /api/locations/countries/{country}/states/{state}/cities
  /api/locations/countries/{country}/states/{state}/cities/{city}
  /api/locations/regions
  /api/locations/regions/{region}
  /api/locations/regions/{region}/cities...
  /api/locations/regions/{region}/states...
  /api/locations/regions/{region}/countries...
  /api/locations/regions/{region}/regions...
Edit History
  /api/edit-history
  /api/edit-history/edits
  /api/edit-history/edits/{edit}
  /api/edit-history/edits/{edit}/revisions
  /api/edit-history/edits/{edit}/revisions/{revision}
  /api/edit-history/edits/{edit}/annotations
  /api/edit-history/edits/{edit}/annotations/{annotation}
  /api/edit-history/editors
  /api/edit-history/editors/{editor}
  /api/edit-history/editors/{editor}/edits
  /api/edit-history/editors/{editor}/edits/{edit}
  /api/edit-history/editors/{editor}/revisions
  /api/edit-history/editors/{editor}/revisions/{revision}
  /api/edit-history/editors/{editor}/annotations
  /api/edit-history/editors/{editor}/annotations/{annotation}
  /api/edit-history/editors/{editor}/sessions
  /api/edit-history/editors/{editor}/sessions/{session}
  /api/edit-history/revisions
  /api/edit-history/revisions/{revision}
  /api/edit-history/revisions/{revision}/annotations
  /api/edit-history/revisions/{revision}/annotations/{annotation}
  /api/edit-history/annotations
  /api/edit-history/annotations/{annotation}
  /api/edit-history/info-sources
  /api/edit-history/info-sources/{info-source}
  /api/edit-history/info-sources/{info-source}/tags
  /api/edit-history/info-sources/{info-source}/tags/{tag}
  /api/edit-history/info-sources/{info-source}/children
  /api/edit-history/info-sources/{info-source}/children/{child}
  /api/edit-history/info-source-tags
  /api/edit-history/info-source-tags/{tag}
Accounts and Sessions
  /api/accounts
  /api/accounts/{account}
  /api/accounts/{account}/edits
  /api/accounts/{account}/edits/{edit}
  /api/accounts/{account}/revisions
  /api/accounts/{account}/revisions/{revision}
  /api/accounts/{account}/annotations
  /api/accounts/{account}/annotations/{annotation}
  /api/accounts/{account}/sessions
  /api/accounts/{account}/sessions/{session}
  /api/sessions
  /api/sessions/{session}
  /api/sessions/{session}/edits
  /api/sessions/{session}/edits/{edit}
  /api/sessions/{session}/revisions
  /api/sessions/{session}/revisions/{revision}
  /api/sessions/{session}/annotations
  /api/sessions/{session}/annotations/{annotation}

The eight schema as they are used at the different collection nestings for
the different methods:

Top Level Collections (like Band at /api/bands or /api/bands/{band}):
  GET         Object                    Get.
  POST        ObjectPost                Create.
  PATCH, PUT  ObjectModify              Modify, replace or create.
  DELETE      ObjectSelectDelete        Select.
    Specify by id or name.

URL Subcollection (like BandPerson at /api/bands/{band}/people/):
  GET         Object                    Get.
  POST        ObjectSelectOrPost        Select or create.
  PATCH, PUT  ObjectSelectOrModify      Select, modify, replace or create.
  DELETE      ObjectSelectRemove        Select.

Internal Subcollections (like person in the people array at /api/bands):
  GET         ObjectBasics              To limit response size.  Get.
  POST        $ref: ObjectSelectOrPost  Select or create.
  PATCH, PUT  $ref: ObjectSelectOrPost  Select or create.
  DELETE      n/a

Collection => Subcollection Mappings:

Object                => {{ObjectBasics}}
ObjectPost            => $ref: '#/definitions/ObjectSelectOrPost'
ObjectModify          => $ref: '#/definitions/ObjectSelectOrPost'
ObjectSelectOrPost    => $ref: '#/definitions/ObjectSelectOrPost'
ObjectSelectOrModify  => $ref: '#/definitions/ObjectSelectOrPost'


Global Query Args

General
  ?expand=<field>,...           Expand sub-objects at specified fields.
  ?fields=<field>,...           Filter - include only specified fields.
  ?no-fields=<field>,...        Filter - exclude specified fields.
  ?filter=<expression>          Filter collection results with an expression.
  ?sort=<field>:[asc|desc],...  Sort collection results.
  ?limit=<int>                  Return only the specified number of objects.
  ?offset=<int>                 Start at the given offset from collection start.
  ?pretty=false                 Don't include whitespace in response JSON.
  ?help                         Get human-readable doc for current URI.
  ?doc                          Get human-readable doc for current URI.
  ?schema                       Get machine-readable JSON schema for current URI.
  ?annotations                  Show annotations.
DELETE
  ?ids                          Comma-separated IDs of objects to delete.
  ?names                        Comma-separated names of objects to delete.
  ?filter=<expression>          Filter delete targets with an expression.


Band Map API Server Implementation:

I initially generated the API server codebase with [swagger-codegen](https://github.com/swagger-api/swagger-codegen).  Codegen creates a [connect](https://nodejs.org/) and [swagger-tools](https://github.com/apigee-127/swagger-tools)-based NodeJS server in which HTTP requests are routed via swagger-router.js to 
"controller" and "service" functions that are generated based on [mustache](https://mustache.github.io/) templates you can find in [my fork of the codegen project](https://github.com/bishopw/bandmap-swagger-codegen) in the "bandmap-templates" folder.  I use these controller and service functions as a thin layer to wire into the main collection CRUD functionality of the API Server (creating, reading, updating, deleting bands, people, roles, locations, etc.), which is currently implemented in the files under the "utils" directory.

The typical flow of a request through the code is:

index.js
swagger-router.js
controller
service
collection.js
database.js


Band Map 2.0 New Feature Implementation:

HTTPS (TLS) Encryption

  TLS is handled by an Nginx web server in its own container that sits in front of the rest of the containers, configured mostly as described at https://www.digitalocean.com/community/tutorials/how-to-set-up-nginx-load-balancing-with-ssl-termination.

Authentication and Authorization

  Authentication and authorization use cases are slightly different between the Band Map API and Website.  See "Band Map API.txt" (Authentication And Authorization section) and "Band Map Website 2.0.txt" (Authentication And Authorization section) for an overview of the auth implementation for either service.

  Currently the API and web services are both served from within the same cluster, behind the same Nginx server.  The two could be easily split up and served from separate clusters or separate hosts in the future.

Band Connection Types and Descriptions

  Descriptions of band connections are of two types: "shared members" or "other".

  Shared members connections are implicit in the relations between bands and people tables.  They do not have corresponding connections in the connections tables and curator scripts attempt to remove any shared members connections that do get added to the connections table for some reason.  Descriptions for shared member connections are generated automatically and are of the form:

    "Shared members: <person-name>[, <person-name>, ...]"

  The DB maintains a view to quickly respond to queries about shared member connections.

  "Other" connections are kept in the connections table, currently just legacy or manually-entered.  Automation will flag or attempt to delete "other" connections without a description that it can't figure out a description for itself.


Active Date Ranges

  Zero to many active date ranges at the calendar date granularity (YYYY-MM-DD) are kept for the following objects and relations:

    band
    band_city
    band_person_role


Wiki-Style Tracked Edit Histories And Rollbacks

  To support tracked edit histories and rollbacks as cleanly and efficiently as I could figure out how, the API service keeps a record of every edit (POST, PATCH, PUT, DELETE) ever made, the original request as well as the table changes, in a set of "edit history" themed tables:

    "edit_request_text": The full text of the original HTTP request from edit requests, including method, headers, and body.

    "anonymous_editors": Information about anonymous editors.  For registered editors, a reference to their accounts table row is used instead.  For anons, we'll use their IP address as their name.  Anon user agent strings are also saved and maybe also shown as identifiers in some admin contexts.  Anonymous edits from the same IP will be considered the same editor and reuse their editor entry if it already exists in the database.

    "edits": Metadata about the edit, including references to the editor and request text.

    "cell_revisions: A full copy of each cell's data (cast to text) at each revision.

    "edit_cell_revisions": References to each cell revision made in a given edit (a single API edit reques typically changes multiple cells, rows, even tables).

  I considered using "data diffs", as described at paulfitz.github.io/daff/ and github.com/paulfitz/daff.  At first keeping data diffs for all edits seemed like a cleaner solution than the "heavier" solution of keeping the full row text.  But Francis Avila is convincing here: http://stackoverflow.com/questions/9217241/whats-the-most-compact-way-to-store-diffs-in-a-database, and Wikimedia likewise stores the entire text of every revision in its text table(!): https://www.mediawiki.org/wiki/Manual:Text_table.  If it's good enough for Wikipedia's pages, it should work for Band Map's band info.

  I also decided against keeping shadow history tables for all the normal tables as described at http://stackoverflow.com/questions/17075577/database-design-with-change-history and http://stackoverflow.com/questions/323065/how-to-version-control-a-record-in-a-database.  Sounded like the data would be harder to marshal for the "see recent edits" and rollback use cases, and we can get the per-table histories with the centralized edits table anyway just by including an index on table name.


Facts With Citations and Sources

  A submodule can translate each cell in the database tables into a "fact" about bands.

  A "fact" is a simple, human-readable sentence, as atomic as possible, some examples:

    "There is a band called The Cute Lepers." (bands name cell)
    "A connection exists between The Cute Lepers and Green Apple Quickstep." (connections cells)
    "The Cute Lepers have a Wikipedia page at https://en.wikipedia.org/wiki/The_Cute_Lepers." (band_web_links id cells)
    "The Cute Lepers started being active in 2007." (band_city_dates cell)
    "The Cute Lepers are still active at present." (band_city_dates cell)
    "The Cute Lepers are based in Seattle." (band_cities id cells)
    "There is a city called Seattle." (cities name cell)
    "There is a person called Steve E. Nix." (people name cell)
    "Steve E. Nix is a guitarist in The Cute Lepers." (band_person_roles id cells)
    "Steve E. Nix is a vocalist in The Cute Lepers." (band_person_roles id cells)

  Every edit in the edits table has one or more associated facts (added, updated, or deleted) depending on how many cells the edit affects.

  These are the types of facts the data collector automation attempts to find and extract from the web and encode in Band Map table data.

  Each fact has zero or more citations.  Usually a reference to the web page or database or API the data collector automation (or human) found it on or in, with retrieval date and relevant text snippet.

  Each citation has one source, which has its own entries in a sources table, and other Band Map automation might eventually try to do various reliability rankings for sources, as well as develop custom parsing and scanning algorithms for specific sources (like how to scrape a Facebook band page, for example).

  When presenting band info in fact form in some user interfaces (for example in a dashboard list of recently added facts), submodules can combine certain facts into compound facts for brevity and more natural reading.  In these cases, the compound facts are cited with all of the citations making up their atomic facts, for example:

    "The Cute Lepers started being active in 2007." and
    "The Cute Lepers are still active at present." can be combined into:
    "The Cute Lepers have been active from 2007 to the present."

    "Steve E. Nix is a guitarist in The Cute Lepers." and
    "Steve E. Nix is a vocalist in The Cute Lepers." can be combined into:
    "Steve E. Nix is a vocalist and guitarist in The Cute Lepers."

  All table operations on the database including backend business logic scripts should go through the API to preserve the logic that is encapsulated there, especially the edit and fact/citation history logic.


Misc.

  Band names starting with 'The' or 'Thee' are alphabetized starting with their second name word, but other than that their full band name including the The is displayed normally.  This is accomplished with an extra index in the DB.

  A person whose role in a band is unknown will still have a band_person_role entry with the default role (0 = member).

  Request throttling is different between anon/registered/bot/admin users (anons get less, admins are unthrottled).


Tech/Design Decisions

Went with Postgres instead of MySQL, following general internet musings:
  https://www.quora.com/What-are-pros-and-cons-of-PostgreSQL-and-MySQL
  http://nghenglim.github.io/PostgreSQL-9.5.0-vs-MariaDB-10.1.11-vs-MySQL-5.7.0-year-2016/?time=1
  http://insights.dice.com/2015/03/19/why-i-choose-postgresql-over-mysqlmariadb/

Using just Postgres for storage now, with possible future Redis use cases:
  Caching Most Recently Updated list, recent edits, sessions, and activity.
  Background workers maintain Most Connections/Most Popular lists w/ sorted sets.
  Monitor usage for stats and anti-spam (block abusive ip addresses).
  Count unique views for bands, people, venues.
  See:
    http://oldblog.antirez.com/post/take-advantage-of-redis-adding-it-to-your-stack.html
    http://highscalability.com/blog/2011/7/6/11-common-web-use-cases-solved-in-redis.html
    http://www.paperplanes.de/2010/2/16/a_collection_of_redis_use_cases.html

Decided to use Alpine Linux-based container images wherever possible (like postgres:9.6.2-alpine instead of postgres:9.6-alpine) after this: https://thenewstack.io/alpine-linux-heart-docker/ and this: https://www.brianchristner.io/docker-is-moving-to-alpine-linux/

Leaning toward Google Container Engine (GKE) instead of Amazon Elastic Container Service (Amazon ECS) after this: https://medium.com/@betz.mark/comparing-amazon-elastic-container-service-and-google-kubernetes-1c63fbf19ccd
