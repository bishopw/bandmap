FROM node:7.7-alpine

# Copy bandmap-api project source to the container and change to its directory.
ADD ./ /bandmap-api/
WORKDIR /bandmap-api/

# Listen on port.
EXPOSE 3000

# Start server via package.json script.
ENTRYPOINT ["npm", "start"]
