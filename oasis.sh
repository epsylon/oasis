#!/bin/bash

CURRENT_DIR=$(pwd)

cd "$CURRENT_DIR/src/server" || { echo "Directory not found: $CURRENT_DIR/src/server"; exit 1; }
node SSB_server.js start &

check_server_ready() {
  local host="127.0.0.1"
  local port="8008"

  node -e "
  const net = require('net');
  const client = new net.Socket();
  client.setTimeout(5000);  // Set a timeout of 5 seconds
  client.connect($port, '$host', function() {
    client.end();  // Successfully connected, close the socket
    process.exit(0);  // Exit with a success code
  });
  client.on('error', function(err) {
    process.exit(1);  // Exit with error code if connection fails
  });
  " 
}

until check_server_ready; do
  sleep 1
done

cd "$CURRENT_DIR/src/backend" || { echo "Directory not found: $CURRENT_DIR/src/backend"; exit 1; }
node backend.js

