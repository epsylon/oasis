#!/bin/sh

CURRENT_DIR=$(pwd)
MODE=$1
MODEL_PATH="$CURRENT_DIR/src/AI/oasis-42-1-chat.Q4_K_M.gguf"
CONFIG_FILE="$CURRENT_DIR/src/configs/oasis-config.json"

if [ -f "$CONFIG_FILE" ]; then
  if [ -f "$MODEL_PATH" ]; then
    sed -i.bak 's/"aiMod": *"off"/"aiMod": "on"/' "$CONFIG_FILE"
  else
    sed -i.bak 's/"aiMod": *"on"/"aiMod": "off"/' "$CONFIG_FILE"
  fi
  rm -f "$CONFIG_FILE.bak"
fi

if [ "$MODE" = "server" ]; then
  cd "$CURRENT_DIR/src/server" || exit 1
  exec node SSB_server.js start
else
  cd "$CURRENT_DIR/src/backend" || exit 1
  exec node backend.js
fi
