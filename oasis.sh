#!/bin/sh

CURRENT_DIR=$(pwd)
MODE=$1

if [ "$MODE" = "server" ]; then
  cd "$CURRENT_DIR/src/server" || { echo "Directory not found: $CURRENT_DIR/src/server"; exit 1; }
  exec node SSB_server.js start
else
  cd "$CURRENT_DIR/src/backend" || { echo "Directory not found: $CURRENT_DIR/src/backend"; exit 1; }
  exec node backend.js
fi
