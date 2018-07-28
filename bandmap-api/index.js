(function () {
'use strict';

const fs = require('fs'),
  path = require('path'),
  http = require('http'),
  app = require('connect')(),
  compression = require('compression'),

  swaggerTools = require('swagger-tools'),
  jsyaml = require('js-yaml'),

  bandMapAPIHandler = require(
    path.join(__dirname, './src/handlers/band-map-api-handler')),

  swaggerPath =
    'node_modules/swagger-tools/middleware/swagger-ui/bandmap-api.yaml',

  serverPort = 3000;

// swaggerUi configuration
  let swaggerUiOptions = {
    //swaggerUiDir: path.join(__dirname, '../bandmap-swagger-ui/dist'),
    apiDocs: '/api-docs',
    swaggerUi: '/docs'
  },

  // The Swagger document (require it, build it programmatically, fetch it
  // from a URL, ...)
  spec = fs.readFileSync(path.join(__dirname, swaggerPath), 'utf8'),
  swaggerDoc = jsyaml.safeLoad(spec);

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(swaggerDoc, function (middleware) {

  app.use(compression());

  // Interpret Swagger resources and attach metadata to request -
  // must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  // Validate Swagger requests
  app.use(middleware.swaggerValidator());

  // Route validated requests to appropriate handler
  app.use(bandMapAPIHandler.handle);

  // Serve the Swagger documents and Swagger UI
  app.use(middleware.swaggerUi(swaggerUiOptions));

  // Return error JSON according to our schema if there were errors.
  app.use(bandMapAPIHandler.handleErrors);

  // Start the server
  http.createServer(app).listen(serverPort, function () {
    console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
    console.log('Swagger-ui is available on http://localhost:%d/docs', serverPort);
  });

});

})();
