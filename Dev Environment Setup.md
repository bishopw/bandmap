Dev Environment Setup

This is for new developers who want to contribute to Band Map.  It contains suggestions for setting up your dev environment and explains how the Band Map dev/test/deploy cycle works, including repo and DB access and hosting details of the staging and production environments.

I've mostly been using Ubuntu 16.04 and a little Mac OS, so most of the steps are written with those in mind, but similar steps should maybe work on Windows.


Initial Dependencies:
- Install node, npm, git, brew if on mac, probably some other stuff I'm forgetting.


Docker:

- Install Docker for Ubuntu (https://www.docker.com/docker-ubuntu).
- Set up docker to run without sudo (http://askubuntu.com/questions/477551/how-can-i-use-docker-without-sudo).
- On mac you might also have to do 'sudo mkdir /var/lib/postgresql' and add that directory to 
- If you haven't used Docker before, it's probably worth running through the two first getting started tutorials so you understand the image, layer, container, service, stack, node, swarm, engine, and machine Docker concepts (https://docs.docker.com/learn/).
- Install VirtualBox and the extension pack for simulating remote machine provisioning with local virtual machines (http://askubuntu.com/questions/367248/how-to-install-virtualbox-from-command-line):
- sudo apt install virtualbox virtualbox-ext-pack
- Install Docker Machine for remote machine provisioning (https://docs.docker.com/machine/install-machine/).
- Install Docker Compose (https://docs.docker.com/compose/).
- Run through the Getting Started tutorial for Compose as well, if it is new to you.


Python:

- For script and bot development, install Python3 and package dependencies:
Install a recent Python 3 version ("python3" already works for me on Ubuntu 16.04).
- Install pip3: sudo apt-get -y install python3-pip
- Install ruamel.yaml: sudo pip3 install ruamel.yaml


Clone Repositories:

- Install git.
- Create a bandmap-repos root directory to clone the repositories in at <repos> for example at ~/Documents/bandmap-repos.  There are currently at least 2, maybe 3 repos you will want.
- cd <bandmap-repos>
- git clone https://github.com/bishopw/bandmap.git
- git clone https://github.com/bishopw/bandmap-swagger-ui.git
- If you need to regenerate the stub API server from scratch for some reason (you probably don't need to anymore): git clone https://github.com/bishopw/bandmap-swagger-codegen.git


PostgreSQL:

- You may not need to do this part if you are just gonna use the docker postgres container.  But you will need a postgres instance, dockerized or otherwise, with a bandmap schema listening on port 5432 before the bandmap-api service will work, so either get and run a postgres:9.6-alpine docker container, or do a local environment install, as described below.
- Install PostgreSQL (https://www.digitalocean.com/community/tutorials/how-to-install-and-use-postgresql-on-ubuntu-16-04).
- Create new postgre superuser 'admin'.
- Run DB creation script on your Postgres instance to create your local dev sandbox DB.
- Note that DbVisualizer can be used to make DB Diagrams (http://www.dbvis.com/download/).
- I had to do some custom path exporting to get the pg_ctl db controller command to be executable from the command line (http://askubuntu.com/questions/385416/pg-ctl-command-not-found-what-package-has-this-command):
- Edit ~/.profile and modify the PATH definition lines:
- PATH="$HOME/bin:$HOME/.local/bin:/usr/lib/postgresql/{version (mine is 9.5)}/bin:$PATH"
- export PATH
- On mac os, if you're going to be switching to your docker container for postgres, you'll want to turn off automatic start of your existing local postgres service to free up port 5432 and it's a huge ridiculous pain.  Do this: https://superuser.com/questions/244589/prevent-postgresql-from-running-at-startup


Database Migration:

- If you want to migrate a legacy Band Map 1.0 database snapshot to a 2.0 database (this is currently the only way to set up a local DB at the time of this writing since I haven't put a full 2.0 DB dump anywhere to clone):
- Install MySQL locally or in a Docker container.
- Log in to the 1.0 DB server at https://phpmyadmin.dreamhost.com/?hostname=db.seattlebandmap.com
- Click Export => Quick => Go
- Save the returned SQL script somewhere (or use the existing script in /scripts/migrate-db/bandmap1.0.mysql.sql).
- A newly exported script will mostly be the wordpress DB, which you don't need, so you can edit it and cut out everything below "-- Database: `bandmap_wordpress`"
- Use MySQL Workbench or command line or whatever to run the script.
- Adjust the <repo>/scripts/migrate-db/migrate-db.py database connection profiles at the top of the file to your local settings.
- YOUR 2.0 DB WILL BE DROPPED IF IT EXISTS ALREADY AND REBUILT FROM SCRATCH BY THE FOLLOWING SCRIPT.
- Run migrate-db.py


Swagger Codegen:

- You probably don't need to do this part anymore, but it was how I originally created the stub code under <bandmap-repos>/bandmap/bandmap-api, so I will include it here just FYI:
- install Java 7 or 8
- brew update
- brew cask install java
- brew install maven
- Clone bandmap swagger-codegen at <bandmap-repos> root: git clone https://github.com/bishopw/bandmap-swagger-codegen
- Follow install instructions: https://github.com/swagger-api/swagger-codegen#swagger-code-generator
- Autogenerate Node server for the API and API Docs server:
- (Instructions at https://github.com/swagger-api/swagger-codegen/wiki/Server-stub-generator-HOWTO)
- cd bandmap-swagger-codegen
- mvn clean package
- java -jar modules/swagger-codegen-cli/target/swagger-codegen-cli.jar help generate
- java -jar modules/swagger-codegen-cli/target/swagger-codegen-cli.jar config-help -l nodejs-server
- ./generate-bandmap-api-server.sh
- cd ../bandmap-api-server
- npm start
- Maybe take some time to read the swagger-tools quick start guide, noticing how swagger-codegen sets up the server with the swagger-tools middleware in index.js, just like in the quick start example code: https://github.com/apigee-127/swagger-tools/blob/master/docs/QuickStart.md


Legacy Band Map:

- If you want to set up and serve a local instance of the legacy Band Map website:
- Install LAMP stack for referencing legacy Band Map (https://www.digitalocean.com/community/tutorials/how-to-install-linux-apache-mysql-php-lamp-stack-on-ubuntu-16-04).
- Get legacy Band Map serving locally from localhost:80.
- DB: https://phpmyadmin.dreamhost.com/?hostname=db.seattlebandmap.com
- Code: https://github.com/rvratner/seattlebandmap


Deploy:

- Use <bandmap-repos>/bandmap/scripts/deploy.sh to deploy and run.
- You may need to change the paths at the top of the script to correspond to your local dev environment.
- On mac you may need to go into <bandmap-repos>/bandmap/docker-compose.yaml and change /var/lib/postgresql/data/bandmapdata => /private/var/lib/postgresql/data/bandmapdata (I'm looking for a better workaround for this.)
- I also struggled with permissions on the postgresql/data volume on mac.  "sudo chmod 777 /private/var/lib/postgresql/data/" seemed to fix it.
- Note that the first time you deploy, you'll need to populate/have populated your DB before navigating to localhost:3000 actually works (see "Database Migration" above).
