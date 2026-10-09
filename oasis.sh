#!/bin/sh

CURRENT_DIR=$(pwd)
MODE=$1
if [ ! -e "$CURRENT_DIR/src/server/node_modules" ] && [ -d "$CURRENT_DIR/src/base/node_modules" ]; then
  rm -f "$CURRENT_DIR/src/server/node_modules"
  ln -s ../base/node_modules "$CURRENT_DIR/src/server/node_modules"
fi
MODEL_PATH="$CURRENT_DIR/src/AI/oasis-42-1-chat.Q4_K_M.gguf"
CONFIG_FILE="${OASIS_STATE_DIR:-${ssb_path:-$HOME/.ssb}}/oasis/oasis-config.json"
[ -f "$CONFIG_FILE" ] || node -e "require('$CURRENT_DIR/src/configs/config-manager.js')" >/dev/null 2>&1

case " $* " in *" --debug "*) export OASIS_DEBUG=1 ;; esac

show_help() {
  cat <<'EOF'

OASIS is a libre, open-source, encrypted, peer-to-peer, distributed & federated
social network: your data lives on your own device, replicates directly with the
inhabitants you support and keeps working offline.

Usage: ./oasis.sh [mode] [-- <option>=<value> ...]

Modes:
  gui             Launch the web GUI (default).
  server          Launch the PUB: sbot + read-only web HUB on /c (headless, VPS).
                  Pub defaults: 2 hops, unlimited media, snapshot for newcomers over SSB.
  test            Run the test suite.
  help, -h        Show this help message.

PUB admin commands (require the sbot to be running: ./oasis.sh server):
  whoami                   Print this PUB id
  invite [N]               Create an invite code (default uses=1)
  name <text>              Set this PUB display name
  announce <host> [port]   Publish a PUB address (default port=8008)
  follow <feedId>          Follow another PUB / feed
  status                   Show peer / replication status
  gossip                   List known gossip peers

GUI options (forwarded to the backend):
  --host=<ip>           Hostname / IP to listen on (default: localhost; 0.0.0.0 on a VPS).
                        The web interface has no login: anyone who can reach that address
                        acts as you (settings, wallet and backups stay local-only). Use another
                        address only on a network you trust, or with --public for a PUB.
  --port=<n>            Port for the web UI (default: 3000).
  --allow-host=<host>   Extra hostname allowed when behind a reverse proxy. Local-only pages
                        then also need the admin link printed when Oasis starts.
  --public              Public-hosting mode: read-only, shows only opted-in content.
  --offline             Don't try to connect to peers / PUBs.
  --no-open             Don't auto-open a browser tab on launch (useful on a VPS).
  --debug               Verbose logging.

TEST commands (never touch your ~/.ssb; they use ~/.ssb-oasis-test or $OASIS_TEST_SSB):
  ./oasis.sh test                 Run every suite in the test directory.
  ./oasis.sh test --seed          After the tests, fill the test directory with dummy content.
  ./oasis.sh test dummy           Only fill a fresh test directory with dummy content (no tests).
  ./oasis.sh test clean-all       Delete the test reports and the test directory.
  OASIS_NETWORK_PAUSED=1 ssb_path=~/.ssb-oasis-test ./oasis.sh   Open the test data offline.

Examples:
  ./oasis.sh
  ./oasis.sh server --port=3000
  ./oasis.sh test
  ./oasis.sh invite 100
  ./oasis.sh name "My PUB"
  ./oasis.sh announce mypub.example.com
  ./oasis.sh --host=0.0.0.0 --port=8080 --no-open
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
    SERVER_CONFIG_FILE="${OASIS_STATE_DIR:-${ssb_path:-$HOME/.ssb}}/oasis/oasis-server-config.json"
    if ! grep -q '"pub": *true' "$SERVER_CONFIG_FILE" "$CURRENT_DIR/src/configs/server-config.json" 2>/dev/null; then
      echo "Note: this node uses the desktop server config (pub: false, hops 2)."
      echo "      For a PUB copy docs/PUB/server-config.json.example to $SERVER_CONFIG_FILE first (pub: true). See docs/PUB/deploy.md, step 4."
    fi
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
