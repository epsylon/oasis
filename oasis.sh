#!/bin/sh

CURRENT_DIR=$(pwd)
MODE=$1
MODEL_PATH="$CURRENT_DIR/src/AI/oasis-42-1-chat.Q4_K_M.gguf"
CONFIG_FILE="$CURRENT_DIR/src/configs/oasis-config.json"

case " $* " in *" --debug "*) export OASIS_DEBUG=1 ;; esac

show_help() {
  cat <<'EOF'

OASIS is a libre, open-source, encrypted, peer-to-peer, distributed & federated
social network: your data lives on your own device, replicates directly with the
inhabitants you support and keeps working offline.

Usage: sh oasis.sh [mode] [-- <option>=<value> ...]

Modes:
  gui             Launch the web GUI (default).
  server          Launch the PUB: sbot + read-only web HUB on /c (headless, VPS).
  test            Run the test suite.
  help, -h        Show this help message.

PUB admin commands (require the sbot to be running: sh oasis.sh server):
  whoami                   Print this PUB id
  invite [N]               Create an invite code (default uses=1)
  name <text>              Set this PUB display name
  announce <host> [port]   Publish a PUB address (default port=8008)
  follow <feedId>          Follow another PUB / feed
  status                   Show peer / replication status
  gossip                   List known gossip peers

GUI options (forwarded to the backend):
  --host=<ip>           Hostname / IP to listen on (default: localhost; 0.0.0.0 on a VPS).
  --port=<n>            Port for the web UI (default: 3000).
  --allow-host=<host>   Extra hostname allowed when behind a reverse proxy.
  --public              Public-hosting mode: read-only, shows only opted-in content.
  --offline             Don't try to connect to peers / PUBs.
  --no-open             Don't auto-open a browser tab on launch (useful on a VPS).
  --debug               Verbose logging.

TEST commands (runs against an ISOLATED ~/.ssb):
  sh oasis.sh test                 Run every suite (your real ~/.ssb is backed up first).
  sh oasis.sh test -y              Same, skipping the confirmation prompt.
  sh oasis.sh test --restore       Restore your original ~/.ssb when done (drops test data).
  sh oasis.sh test --seed          After the tests, fill the test ~/.ssb with dummy content.
  sh oasis.sh test dummy           Publish dummy content into the running instance (no tests).
  sh oasis.sh test clean-all       Delete test reports and the test ~/.ssb, restore the backup.

Examples:
  sh oasis.sh
  sh oasis.sh server --port=3000
  sh oasis.sh test -y
  sh oasis.sh invite 100
  sh oasis.sh name "My PUB"
  sh oasis.sh announce mypub.example.com
  sh oasis.sh --host=0.0.0.0 --port=8080 --no-open
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
    if [ -f "$CONFIG_FILE" ]; then
      sed -i.bak 's/"aiMod": *"on"/"aiMod": "off"/' "$CONFIG_FILE"
      sed -i.bak 's/"aiNavMod": *"on"/"aiNavMod": "off"/' "$CONFIG_FILE"
      rm -f "$CONFIG_FILE.bak"
    fi
    shift
    cd "$CURRENT_DIR/src/server" || exit 1
    node SSB_server.js start &
    SSB_PID=$!
    trap 'kill $SSB_PID 2>/dev/null' EXIT INT TERM
    sleep 10
    cd "$CURRENT_DIR/src/backend" || exit 1
    exec node backend.js --public --no-open --host=0.0.0.0 "$@"
    ;;
  whoami|invite|name|announce|follow|status|gossip)
    exec node "$CURRENT_DIR/scripts/oasis-pub.js" "$@"
    ;;
  test|tests)
    shift
    exec bash "$CURRENT_DIR/test/run.sh" "$@"
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
