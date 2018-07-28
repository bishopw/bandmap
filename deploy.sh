#!/usr/bin/env bash

# Build and run the Band Map API server at localhost:3000.

# Do the prerequisites in "Dev Environment Setup.txt" before running.

export BANDMAP_ROOT=/media/bishop/Data00/data/bandmap-repos
export BANDMAP_CODEGEN_ROOT=$BANDMAP_ROOT/bandmap-swagger-codegen
export SWAGGER_CONFIG=$BANDMAP_ROOT/bandmap/scripts/swagger-generator/swagger.yaml
export SWAGGER_CONFIG_OUT=$BANDMAP_ROOT/bandmap-swagger-ui/dist/bandmap-api.yaml
export BANDMAP_API_ROOT=$BANDMAP_ROOT/bandmap/bandmap-api

# # # Generate initial bandmap-api server stub.
# # # (This step is no longer necessary, and should no longer be performed, as
# # # the bandmap-api server now has its own repo, but swagger-codegen was
# # # originally used to generate the first version of that code, and I'll
# # # preserve the command for that step in the process here for posterity).
# # By default we want codegen to overwrite everything except our .git history
# # and refs/objects/tags data.
# # Manually remove files that codegen neglects to overwrite until
# # https://github.com/swagger-api/swagger-codegen/issues/3100 is fixed.
# # cd $BANDMAP_CODEGEN_ROOT
# # rm -rf $BANDMAP_API_ROOT/controllers
# # rm -rf $BANDMAP_API_ROOT/api
# # mvn -DskipTests compile package
# # java -jar modules/swagger-codegen-cli/target/swagger-codegen-cli.jar \
# #   generate \
# #   --input-spec $SWAGGER_CONFIG \
# #   --lang nodejs-server \
# #   --output $BANDMAP_API_ROOT \
# #   --api-package bandmap \
# #   --template-dir $BANDMAP_ROOT/bandmap-swagger-codegen/bandmap-templates

# Build swagger-ui.
# I had a bunch of webpack troubles getting this to work, tried doing
# 'sudo npm link webpack' and 'sudo npm install' and then running a bunch of
# the "predev" and "dev" commands listed in swagger-ui's package.json before
# npm run build  or build-core would work.
cd $BANDMAP_ROOT/bandmap-swagger-ui
npm install
npm run build

# Install bandmap-api dependencies.
cd $BANDMAP_API_ROOT
npm install

# Generate swagger config.
cd $BANDMAP_ROOT/bandmap/scripts/swagger-generator
python3 swagger-generator.py

# Replace the swagger-ui in the swagger-tools directory with our custom
# swagger-ui.
rm -rf $BANDMAP_API_ROOT/node_modules/swagger-tools/middleware/swagger-ui
cp $SWAGGER_CONFIG $SWAGGER_CONFIG_OUT
cp -R $BANDMAP_ROOT/bandmap-swagger-ui/dist \
  $BANDMAP_API_ROOT/node_modules/swagger-tools/middleware/swagger-ui/
cp -R $BANDMAP_API_ROOT/node_module_replacements/swagger-metadata.js $BANDMAP_API_ROOT/node_modules/swagger-tools/middleware/swagger-metadata.js

# Until I have time to actually submit fixes to the relevant github projects,
# wait for a release cycle, and update the node modules, manually hardwire in
# custom versions to fix bugs in swagger-tools dependencies:
# path-to-regexp: fix the url regex to correctly parse hyphens
cp -R $BANDMAP_API_ROOT/node_module_replacements/path-to-regexp $BANDMAP_API_ROOT/node_modules/swagger-tools/node_modules/

# Start DB and API servers in docker.
cd $BANDMAP_ROOT/bandmap
docker container rm -f bandmap_api_1
docker-compose up -d --build

# # Or start the API server without docker:
# sleep 3s
# docker container rm -f bandmap_api_1
# cd $BANDMAP_API_ROOT
# export BANDMAP_ROOT=/media/bishop/Data00/data/bandmap-repos; export BANDMAP_CODEGEN_ROOT=$BANDMAP_ROOT/bandmap-swagger-codegen; export SWAGGER_CONFIG=$BANDMAP_ROOT/bandmap/scripts/swagger-generator/swagger.yaml; export SWAGGER_CONFIG_OUT=$BANDMAP_ROOT/bandmap-swagger-ui/dist/bandmap-api.yaml; export BANDMAP_API_ROOT=$BANDMAP_ROOT/bandmap/bandmap-api;
# export DEBUG=band-map-api,swagger-tools:middleware:metadata,swagger-tools:middleware:security,swagger-tools:middleware:validator,swagger-tools:middleware:router,swagger-tools:middleware:ui,sql:pg
# export DEBUG=band-map-api,swagger-tools:middleware:security,swagger-tools:middleware:validator,swagger-tools:middleware:ui,sql:pg
# npm start

