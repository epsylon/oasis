#!/bin/sh

CURRENT_DIR=$(pwd)
MODE=$1
MODEL_PATH="$CURRENT_DIR/src/AI/oasis-42-1-chat.Q4_K_M.gguf"
CONFIG_FILE="$CURRENT_DIR/src/configs/oasis-config.json"

show_help() {
  cat <<'EOF'
Usage: sh oasis.sh [mode] [-- <option>=<value> ...]

Modes:
  gui             Launch the Oasis web GUI (default).
  server          Launch only the Oasis backend in headless / pub mode.
  help, -h        Show this help message.

GUI options (forwarded to the backend):
  --host=<ip>           Hostname / IP the web UI listens on (default: localhost).
                        Use 0.0.0.0 to expose on a VPS.
  --port=<n>            Port for the web UI (default: 3000).
  --allow-host=<host>   Extra hostname allowed when behind a reverse proxy.
  --public              Public-hosting mode: disables POST and redacts content
                        from people who haven't opted in to public hosting.
  --offline             Don't try to connect to Oasis peers / pubs.
  --no-open             Don't auto-open a browser tab on launch (useful on a VPS).
  --debug               Verbose logging.

Examples:
  sh oasis.sh
  sh oasis.sh server
  sh oasis.sh --host=0.0.0.0 --port=8080 --no-open
  sh oasis.sh --public --no-open --host=0.0.0.0 --port=8080
  sh oasis.sh --allow-host=oasis.example.com --no-open
EOF
}

if [ -f "$CONFIG_FILE" ]; then
  if [ -f "$MODEL_PATH" ]; then
    sed -i.bak 's/"aiMod": *"off"/"aiMod": "on"/' "$CONFIG_FILE"
  else
    sed -i.bak 's/"aiMod": *"on"/"aiMod": "off"/' "$CONFIG_FILE"
  fi
  rm -f "$CONFIG_FILE.bak"
fi

case "$MODE" in
  help|-h|--help)
    show_help
    exit 0
    ;;
  server|pub)
    cd "$CURRENT_DIR/src/server" || exit 1
    exec node SSB_server.js start
    ;;
  gui)
    shift
    cd "$CURRENT_DIR/src/backend" || exit 1
    exec node backend.js "$@"
    ;;
  *)
    cd "$CURRENT_DIR/src/backend" || exit 1
    exec node backend.js "$@"
    ;;
esac
