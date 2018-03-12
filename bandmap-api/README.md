# Band Map API Server

## Overview
Welcome to the Seattle Band Map API server!  This server serves a [RESTful web API](https://en.wikipedia.org/wiki/Representational_state_transfer) for accessing info about Seattle bands and how they are connected, as well as documentation for the API.

The base server code in this repo was generated by [swagger-codegen](https://github.com/swagger-api/swagger-codegen) and [swagger-tools](https://github.com/apigee-127/swagger-tools) using an [OpenAPI specification](https://github.com/OAI/OpenAPI-Specification) file.

### Running the server
To run the server, use:

```
npm start
```

The API will now be exposed at:

```
http://localhost:3000/api
```

And the docs, created with [Swagger UI](https://github.com/swagger-api/swagger-ui), will be served from:

```
http://localhost:3000/docs
```