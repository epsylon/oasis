#!/bin/bash
# scripts/build-deb2.sh
# Genera Oasis .deb con Node.js embebido y el wrapper oasis.

set -e

# ============================================
# DETECT ARCHITECTURE
# ============================================
ARCH=$(dpkg --print-architecture)
echo "=== Detected architecture: ${ARCH} ==="

PKG_NAME="oasis"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${OASIS_BUILD_DIR:-/tmp/oasis-deb-build}"
INSTALL_DIR="/opt/oasis"
NODE_VERSION="22.20.0"

case "$ARCH" in
    amd64) NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz" ;;
    arm64) NODE_TARBALL="node-v${NODE_VERSION}-linux-arm64.tar.xz" ;;
    *) echo "ERROR: Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"

# ============================================
# NODE.JS ESTÁTICO PARA EL BUILD
# ============================================
# Descarga el tarball de Node si no está ya en /tmp, lo extrae a un
# directorio temporal y lo añade al PATH. Así todas las invocaciones
# de `node` dentro del script (por ejemplo, para leer la versión de
# package.json) usan este binario estático, sin depender de que Node
# esté instalado en el host.

NODE_BUILD_DIR="/tmp/oasis-node-build"

if [ ! -x "${NODE_BUILD_DIR}/bin/node" ]; then
    if [ ! -f "/tmp/${NODE_TARBALL}" ]; then
        echo "Downloading Node.js ${NODE_VERSION}..."
        wget -q --show-progress "${NODE_URL}" -O "/tmp/${NODE_TARBALL}"
    fi
    rm -rf "${NODE_BUILD_DIR}"
    mkdir -p "${NODE_BUILD_DIR}"
    tar -xf "/tmp/${NODE_TARBALL}" -C "${NODE_BUILD_DIR}" --strip-components=1
fi

export PATH="${NODE_BUILD_DIR}/bin:${PATH}"

# ============================================
# HOST TOOLS REQUIRED
# ============================================
for tool in wget tar ar xz zstd jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "ERROR: '$tool' is required but not installed." >&2
        echo "Install it with: apt install $tool" >&2
        exit 1
    fi
done

# ============================================
# VERSION
# ============================================
VERSION="$(node -p "require('${SRC_DIR}/src/server/package.json').version" 2>/dev/null || true)"
if [ -z "$VERSION" ]; then
    echo "ERROR: could not determine Oasis version from ${SRC_DIR}/src/server/package.json" >&2
    echo "       (node was resolved to: $(command -v node || echo 'not found'))" >&2
    exit 1
fi

DEB_ROOT="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}"

echo "=== Building Oasis ${VERSION} .deb (${ARCH}) ==="

rm -rf "${DEB_ROOT}"
mkdir -p "${DEB_ROOT}/DEBIAN"
mkdir -p "${DEB_ROOT}/etc/oasis"
mkdir -p "${DEB_ROOT}/etc/sudoers.d"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/server"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/backend"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/views"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/models"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/client"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/configs"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/games"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/maps"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/scripts"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/docs"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/node"
mkdir -p "${DEB_ROOT}/usr/bin"
mkdir -p "${DEB_ROOT}/usr/share/doc/${PKG_NAME}"
mkdir -p "${DEB_ROOT}/lib/systemd/system"

echo "Copying application files..."

# ============================================
# NODE.JS EMBEBIDO
# ============================================
tar -xf "/tmp/${NODE_TARBALL}" -C "${DEB_ROOT}${INSTALL_DIR}/node" --strip-components=1
echo "  ✓ Node.js ${NODE_VERSION} embedded"

# ============================================
# BASE
# ============================================
if [ -d "${SRC_DIR}/src/base" ]; then
    cp -r "${SRC_DIR}/src/base" "${DEB_ROOT}${INSTALL_DIR}/src/"
    echo "  ✓ src/base (con node_modules)"
fi

# ============================================
# SERVER
# ============================================
cp "${SRC_DIR}/src/server/package.json" "${DEB_ROOT}${INSTALL_DIR}/src/server/"
cp "${SRC_DIR}/src/server/package-lock.json" "${DEB_ROOT}${INSTALL_DIR}/src/server/" 2>/dev/null || true
cp "${SRC_DIR}/src/server/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/server/" 2>/dev/null || true
cp "${SRC_DIR}/src/server/nodemon.json" "${DEB_ROOT}${INSTALL_DIR}/src/server/" 2>/dev/null || true

if [ -L "${SRC_DIR}/src/server/node_modules" ]; then
    ln -sf "../base/node_modules" "${DEB_ROOT}${INSTALL_DIR}/src/server/node_modules"
    echo "  ✓ src/server/node_modules (symlink)"
fi

if [ -d "${SRC_DIR}/src/server/packages" ]; then
    cp -r "${SRC_DIR}/src/server/packages" "${DEB_ROOT}${INSTALL_DIR}/src/server/"
    find "${DEB_ROOT}${INSTALL_DIR}/src/server/packages" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
fi

# ============================================
# BACKEND / VIEWS / MODELS / CLIENT
# ============================================
cp "${SRC_DIR}/src/backend/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/backend/" 2>/dev/null || true
cp -r "${SRC_DIR}/src/views/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/views/" 2>/dev/null || true
cp -r "${SRC_DIR}/src/models/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/models/" 2>/dev/null || true
cp -r "${SRC_DIR}/src/client" "${DEB_ROOT}${INSTALL_DIR}/src/"
find "${DEB_ROOT}${INSTALL_DIR}/src/client" -name "*.py" -delete 2>/dev/null || true
find "${DEB_ROOT}${INSTALL_DIR}/src/client" -name ".ruff_cache" -type d -exec rm -rf {} + 2>/dev/null || true

# ============================================
# CONFIGS
# ============================================
for f in oasis-config.json server-config.json snh-invite-code.json config-manager.js shared-state.js state-manager.js; do
    [ -f "${SRC_DIR}/src/configs/${f}" ] && cp "${SRC_DIR}/src/configs/${f}" "${DEB_ROOT}${INSTALL_DIR}/src/configs/"
done

# ============================================
# GAMES / MAPS
# ============================================
cp -r "${SRC_DIR}/src/games/." "${DEB_ROOT}${INSTALL_DIR}/src/games/" 2>/dev/null || true
cp -r "${SRC_DIR}/src/maps/." "${DEB_ROOT}${INSTALL_DIR}/src/maps/" 2>/dev/null || true

# ============================================
# SCRIPTS / DOCS / ROOT
# ============================================
cp -r "${SRC_DIR}/scripts" "${DEB_ROOT}${INSTALL_DIR}/"
cp -r "${SRC_DIR}/docs" "${DEB_ROOT}${INSTALL_DIR}/"
cp "${SRC_DIR}/oasis.sh" "${DEB_ROOT}${INSTALL_DIR}/oasis.sh"
chmod 755 "${DEB_ROOT}${INSTALL_DIR}/oasis.sh"
cp "${SRC_DIR}/LICENSE" "${DEB_ROOT}${INSTALL_DIR}/"
cp "${SRC_DIR}/README.md" "${DEB_ROOT}${INSTALL_DIR}/" 2>/dev/null || true

# ============================================
# /etc/oasis/oasis.conf (conffile)
# ============================================
cat > "${DEB_ROOT}/etc/oasis/oasis.conf" << 'EOF'
# Oasis configuration (system service)
#
# This file is sourced by the `oasis` wrapper (which runs under bash).
# Bash syntax is allowed and expected here.
#
# Used by the systemd service (user "oasis").
# For personal instances, run `oasis` as your normal user:
#   the wrapper creates ~/.config/oasis/oasis.conf on first run
#
# Listen address. Any of:
#   "any"           -> 0.0.0.0 (all interfaces)
#   "localhost"     -> resolved by /etc/hosts (127.0.0.1)
#   "eth0","wlan0"  -> resolved to that interface's IP at runtime
#   "192.168.1.50"  -> literal IP
OASIS_HOST="any"

# PUB mode: uncomment to enable administrative commands
# (whoami, invite, name, announce, follow, status, gossip)
# and to allow re-exec through sudo for members of the 'oasis' group.
#OASIS_PUB="1"

# Public domain (only used in PUB mode; written into the PUB
# override config at ~/.ssb/oasis/oasis-server-config.json
# on first start of the service)
OASIS_DOMAIN=""

# Listen port for the web UI
OASIS_PORT="3000"

# Don't auto-open browser (1 = yes, 0 = no)
OASIS_NO_OPEN="1"

# Debug logging (1 = yes, 0 = no)
OASIS_DEBUG="0"
EOF

# ============================================
# /etc/sudoers.d/oasis-admin
# ============================================
cat > "${DEB_ROOT}/etc/sudoers.d/oasis-admin" << 'EOF'
# Allow members of the 'oasis' group to run the Oasis launcher
# as the 'oasis' user, so administrative PUB commands operate in
# the correct environment (own $HOME, own SSB socket, correct
# file ownership).
#
# This does NOT grant root or any other privilege escalation.
%oasis ALL=(oasis) NOPASSWD: /usr/bin/oasis
EOF

# ============================================
# /usr/bin/oasis (wrapper delegado)
# ============================================
cat > "${DEB_ROOT}/usr/bin/oasis" << 'WRAPPER'
#!/bin/bash
# /usr/bin/oasis - Wrapper delegado para Oasis
#
# Traduce la configuración del usuario a argumentos para oasis.sh.
# Los comandos administrativos se delegan tal cual a oasis.sh,
# que a su vez llama a scripts/oasis-pub.js.

set -e

OASIS_HOME="/opt/oasis"
SELF_PATH="/usr/bin/oasis"

if [ ! -d "$OASIS_HOME" ]; then
    echo "Error: Oasis installation not found at $OASIS_HOME" >&2
    exit 1
fi

# root → re-ejecutar como 'oasis'
if [ "$(id -un)" = "root" ]; then
    exec sudo -u oasis "$SELF_PATH" "$@"
fi

# Selección de config
USER_SVC_DIR="$HOME/.config/oasis"
USER_SVC_CFG="$USER_SVC_DIR/oasis.conf"
GLOBAL_CONFIG="/etc/oasis/oasis.conf"

mkdir -p "$USER_SVC_DIR" 2>/dev/null || true

if [ -n "$OASISCONF" ] && [ -f "$OASISCONF" ]; then
    . "$OASISCONF"
elif [ "$(id -un)" = "oasis" ] && [ -f "$GLOBAL_CONFIG" ]; then
    . "$GLOBAL_CONFIG"
elif [ -f "$USER_SVC_CFG" ]; then
    . "$USER_SVC_CFG"
else
    cat > "$USER_SVC_CFG" << 'EOF'
OASIS_NO_OPEN="1"
OASIS_PORT="$((3000 + UID))"
OASIS_DEBUG="0"
EOF
    chmod 600 "$USER_SVC_CFG"
    echo "Generated personal config: $USER_SVC_CFG"
    echo ""
    . "$USER_SVC_CFG"
fi

# resolve_host()
resolve_host() {
    local host="$1"
    case "$host" in
        ""|any)     echo "0.0.0.0"; return ;;
        localhost)  echo "127.0.0.1"; return ;;
    esac
    if echo "$host" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        echo "$host"; return
    fi
    if ip link show "$host" >/dev/null 2>&1; then
        local ip
        ip=$(ip -4 addr show "$host" 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
        echo "${ip:-0.0.0.0}"
        return
    fi
    echo "$host"
}

OASIS_HOST="${OASIS_HOST:-any}"
OASIS_PORT="${OASIS_PORT:-3000}"
OASIS_NO_OPEN="${OASIS_NO_OPEN:-1}"
OASIS_DEBUG="${OASIS_DEBUG:-0}"

# Caso 'oasis': servicio o comandos admin
if [ "$(id -un)" = "oasis" ]; then
    if [ -z "$OASIS_PUB" ]; then
        echo "Error: this node is not configured as a PUB." >&2
        echo "See $OASIS_HOME/docs/PUB/deploy.md for setup instructions." >&2
        exit 1
    fi

    cd "$OASIS_HOME"

    if [ "$#" -eq 0 ]; then
        exec /bin/sh "$OASIS_HOME/oasis.sh" server
    fi

    exec /bin/sh "$OASIS_HOME/oasis.sh" "$@"
fi

# Caso usuario normal: GUI, ignora argumentos
OASIS_HOST_RESOLVED=$(resolve_host "$OASIS_HOST")

MODE="gui"
ARGS="--host=$OASIS_HOST_RESOLVED --port=$OASIS_PORT"

case "$OASIS_NO_OPEN" in
    0|no|false|NO|FALSE) ;;
    *) ARGS="$ARGS --no-open" ;;
esac

case "$OASIS_DEBUG" in
    1|yes|true|YES|TRUE) ARGS="$ARGS --debug" ;;
esac

cd "$OASIS_HOME"
exec /bin/sh "$OASIS_HOME/oasis.sh" "$MODE" $ARGS
WRAPPER
chmod 755 "${DEB_ROOT}/usr/bin/oasis"

# ============================================
# DEBIAN/control
# ============================================
cat > "${DEB_ROOT}/DEBIAN/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: SolarNET.HuB <solarnethub@riseup.net>
Depends: bash, jq, iproute2, sudo
Installed-Size: $(du -sk "${DEB_ROOT}${INSTALL_DIR}" | cut -f1)
Section: net
Priority: optional
Homepage: https://solarnethub.com
Description: Oasis P2P Social Network
 Oasis is a P2P encrypted social network built on Secure Scuttlebutt (SSB).
 Zero browser JavaScript — all rendering is server-side HTML+CSS.
 Includes embedded Node.js ${NODE_VERSION}.
 Part of the SolarNET.HuB ecosystem.
EOF

# ============================================
# DEBIAN/conffiles
# ============================================
cat > "${DEB_ROOT}/DEBIAN/conffiles" << 'CONFFILES'
/etc/oasis/oasis.conf
CONFFILES

# ============================================
# DEBIAN/postinst
# ============================================
cat > "${DEB_ROOT}/DEBIAN/postinst" << 'POSTINST'
#!/bin/bash
set -e

INSTALL_DIR="/opt/oasis"
OASIS_HOME="/var/lib/oasis"
GLOBAL_CONFIG="/etc/oasis/oasis.conf"
SUDOERS_FILE="/etc/sudoers.d/oasis-admin"

groupadd -f oasis

if ! id -u oasis >/dev/null 2>&1; then
    useradd --system --gid oasis --create-home --home-dir "$OASIS_HOME" --shell /usr/sbin/nologin oasis
fi

OASIS_HOME=$(getent passwd oasis 2>/dev/null | cut -d: -f6)
if [ -z "$OASIS_HOME" ]; then
    echo "Warning: could not determine home for user 'oasis', using /var/lib/oasis" >&2
    OASIS_HOME="/var/lib/oasis"
fi

mkdir -p "$OASIS_HOME/shared"
chown oasis:oasis "$OASIS_HOME/shared"
chmod 755 "$OASIS_HOME/shared"

chown -R oasis:oasis "$INSTALL_DIR"

if [ ! -e "${INSTALL_DIR}/src/server/node_modules" ]; then
    ln -s ../base/node_modules "${INSTALL_DIR}/src/server/node_modules"
fi

if [ -f "$SUDOERS_FILE" ]; then
    chmod 440 "$SUDOERS_FILE"
    chown root:root "$SUDOERS_FILE"
    if ! visudo -c -f "$SUDOERS_FILE" >/dev/null 2>&1; then
        echo "ERROR: invalid sudoers rule at $SUDOERS_FILE" >&2
        rm -f "$SUDOERS_FILE"
        exit 1
    fi
fi

if [ "$1" = "configure" ] && [ -z "$2" ]; then
    OASIS_PUB="no"
    OASIS_DOMAIN=""
    OASIS_AUTOFOLLOW="no"
    OASIS_HOPS="2"
    OASIS_LOGLEVEL="notice"
    OASIS_PRIVATE_PUB="no"
    OASIS_HOST="any"
    START_NOW="no"

    if [ -t 0 ]; then
        echo ""
        echo "========================================="
        echo "  Oasis - Setup"
        echo "========================================="
        echo ""

        printf "Configure as PUB (public server)? [y/N]: "
        read -r ANSWER
        case "$ANSWER" in
            [yY]|[yY][eE][sS]) OASIS_PUB="yes" ;;
        esac

        if [ "$OASIS_PUB" = "yes" ]; then
            printf "Is this a PRIVATE pub (no federation with the outside)? [y/N]: "
            read -r ANSWER
            case "$ANSWER" in
                [yY]|[yY][eE][sS]) OASIS_PRIVATE_PUB="yes" ;;
            esac

            printf "Public domain (leave empty to configure later): "
            read -r OASIS_DOMAIN

            printf "Follow back automatically? [y/N]: "
            read -r ANSWER
            case "$ANSWER" in
                [yY]|[yY][eE][sS]) OASIS_AUTOFOLLOW="yes" ;;
            esac

            if [ "$OASIS_PRIVATE_PUB" = "yes" ]; then
                OASIS_HOPS="0"
            else
                printf "Replication hops [2]: "
                read -r ANSWER
                [ -n "$ANSWER" ] && OASIS_HOPS="$ANSWER"
            fi

            printf "Logging level [notice]: "
            read -r ANSWER
            [ -n "$ANSWER" ] && OASIS_LOGLEVEL="$ANSWER"
        fi

        echo ""
        echo "Listen address:"
        echo ""

        INDEX=1
        IFACES=("localhost")
        echo "  [$INDEX] localhost         (localhost only)"
        INDEX=$((INDEX+1))

        while IFS= read -r iface; do
            [ -z "$iface" ] && continue
            [ "$iface" = "lo" ] && continue
            IP=$(ip -4 addr show "$iface" 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
            [ -z "$IP" ] && continue
            IFACES+=("$iface")
            printf "  [%d] %s\n" "$INDEX" "$iface"
            INDEX=$((INDEX+1))
        done < <(ip -o link show 2>/dev/null | awk -F': ' '{print $2}' | cut -d'@' -f1)

        ANY_INDEX=$INDEX
        echo "  [$ANY_INDEX] any              (all interfaces - 0.0.0.0)"
        INDEX=$((INDEX+1))

        CUSTOM_INDEX=""
        if [ "$OASIS_PUB" != "yes" ]; then
            CUSTOM_INDEX=$INDEX
            echo "  [$CUSTOM_INDEX] custom           (hostname)"
        fi

        echo ""
        printf "Choose listen address (default $ANY_INDEX): "
        read -r HOST_CHOICE
        HOST_CHOICE="${HOST_CHOICE:-$ANY_INDEX}"

        if [ "$HOST_CHOICE" = "$ANY_INDEX" ]; then
            OASIS_HOST="any"
        elif [ -n "$CUSTOM_INDEX" ] && [ "$HOST_CHOICE" = "$CUSTOM_INDEX" ]; then
            printf "Enter hostname: "
            read -r OASIS_HOST
            [ -z "$OASIS_HOST" ] && OASIS_HOST="any"
        elif [ "$HOST_CHOICE" -ge 1 ] 2>/dev/null && [ "$HOST_CHOICE" -le "${#IFACES[@]}" ]; then
            OASIS_HOST="${IFACES[$((HOST_CHOICE-1))]}"
        else
            OASIS_HOST="any"
        fi

        if [ "$OASIS_PUB" = "yes" ]; then
            printf "Start the service now? [Y/n]: "
            read -r START_ANSWER
            case "$START_ANSWER" in
                [nN]|[nN][oO]) START_NOW="no" ;;
                *)             START_NOW="yes" ;;
            esac
        fi
    fi

    # ------------------------------------------------------------
    # Si es PUB: preparar ~/.ssb/oasis/oasis-server-config.json
    # ------------------------------------------------------------
    if [ "$OASIS_PUB" = "yes" ]; then
        OASIS_HOME_DIR="$(getent passwd oasis | cut -d: -f6)"
        SERVER_CFG_DIR="${OASIS_HOME_DIR}/.ssb/oasis"
        SERVER_CFG="${SERVER_CFG_DIR}/oasis-server-config.json"
        TEMPLATE_CFG="${INSTALL_DIR}/src/configs/server-config.json"

        if [ ! -f "$SERVER_CFG" ]; then
            mkdir -p "$SERVER_CFG_DIR"
            chown -R oasis:oasis "${OASIS_HOME_DIR}/.ssb"
            chmod 700 "$SERVER_CFG_DIR"

            AUTOF_JSON="false"
            [ "$OASIS_AUTOFOLLOW" = "yes" ] && AUTOF_JSON="true"

            if [ "$OASIS_PRIVATE_PUB" = "yes" ]; then
                # Pub privado: sin conexiones salientes, firewall abierto a invitaciones
                if [ -n "$OASIS_DOMAIN" ]; then
                    jq \
                        --argjson pub true \
                        --argjson autof "$AUTOF_JSON" \
                        --argjson hops "$OASIS_HOPS" \
                        --arg log "$OASIS_LOGLEVEL" \
                        --arg ext "$OASIS_DOMAIN" \
                        '.pub = $pub
                         | .logging.level = $log
                         | .friends.hops = $hops
                         | .autofollow.enabled = $autof
                         | .connections.outgoing = {net: [], tunnel: [], onion: [], ws: []}
                         | .conn = {firewall: {rejectUnknown: false, rejectBlocked: true}}
                         | .connections.incoming.net[0].external = $ext' \
                        "$TEMPLATE_CFG" > "$SERVER_CFG"
                else
                    jq \
                        --argjson pub true \
                        --argjson autof "$AUTOF_JSON" \
                        --argjson hops "$OASIS_HOPS" \
                        --arg log "$OASIS_LOGLEVEL" \
                        '.pub = $pub
                         | .logging.level = $log
                         | .friends.hops = $hops
                         | .autofollow.enabled = $autof
                         | .connections.outgoing = {net: [], tunnel: [], onion: [], ws: []}
                         | .conn = {firewall: {rejectUnknown: false, rejectBlocked: true}}' \
                        "$TEMPLATE_CFG" > "$SERVER_CFG"
                fi
            else
                # Pub normal
                if [ -n "$OASIS_DOMAIN" ]; then
                    jq \
                        --argjson pub true \
                        --argjson autof "$AUTOF_JSON" \
                        --argjson hops "$OASIS_HOPS" \
                        --arg log "$OASIS_LOGLEVEL" \
                        --arg ext "$OASIS_DOMAIN" \
                        '.pub = $pub
                         | .logging.level = $log
                         | .friends.hops = $hops
                         | .autofollow.enabled = $autof
                         | .connections.incoming.net[0].external = $ext' \
                        "$TEMPLATE_CFG" > "$SERVER_CFG"
                else
                    jq \
                        --argjson pub true \
                        --argjson autof "$AUTOF_JSON" \
                        --argjson hops "$OASIS_HOPS" \
                        --arg log "$OASIS_LOGLEVEL" \
                        '.pub = $pub
                         | .logging.level = $log
                         | .friends.hops = $hops
                         | .autofollow.enabled = $autof' \
                        "$TEMPLATE_CFG" > "$SERVER_CFG"
                fi
            fi

            chown oasis:oasis "$SERVER_CFG"
            chmod 600 "$SERVER_CFG"
        fi
    fi

    if [ "$OASIS_PUB" = "yes" ]; then
        sed -i 's|^#\?OASIS_PUB=.*|OASIS_PUB="1"|' "$GLOBAL_CONFIG"
        if [ -n "$OASIS_DOMAIN" ]; then
            sed -i "s|^OASIS_DOMAIN=.*|OASIS_DOMAIN=\"$OASIS_DOMAIN\"|" "$GLOBAL_CONFIG"
        fi
    fi
    sed -i "s|^OASIS_HOST=.*|OASIS_HOST=\"$OASIS_HOST\"|" "$GLOBAL_CONFIG"

    systemctl daemon-reload 2>/dev/null || true

    if [ "$OASIS_PUB" = "yes" ]; then
        systemctl enable oasis 2>/dev/null || true
        if [ "$START_NOW" = "yes" ]; then
            systemctl start oasis 2>/dev/null || true
        fi
    fi

    echo ""
    echo "========================================="
    echo "  Oasis installed"
    echo "========================================="
    echo ""

    if [ "$OASIS_PUB" = "yes" ]; then
        echo "Mode: PUB"
        if [ "$OASIS_PRIVATE_PUB" = "yes" ]; then
            echo "Type: PRIVATE (no federation with the outside)"
        else
            echo "Type: PUBLIC"
        fi
        echo "Domain: ${OASIS_DOMAIN:-(not set)}"
        echo "Listen: $OASIS_HOST"
        echo "Replication hops: $OASIS_HOPS"
        echo "Autofollow: $OASIS_AUTOFOLLOW"
        echo "Logging: $OASIS_LOGLEVEL"
        echo ""
        echo "PUB configuration saved to:"
        echo "  /var/lib/oasis/.ssb/oasis/oasis-server-config.json"
        echo ""
        echo "To change PUB settings:"
        echo "  - Edit /etc/oasis/oasis.conf for listen address or domain."
        echo "  - Edit /var/lib/oasis/.ssb/oasis/oasis-server-config.json"
        echo "    for pub, hops, autofollow or logging."
        echo ""
        echo "IMPORTANT: review ${INSTALL_DIR}/docs/PUB/deploy.md"
        echo "           for full PUB deployment instructions."
        echo ""
        if [ "$START_NOW" = "yes" ]; then
            echo "Service is running."
            echo "Status: sudo systemctl status oasis"
            echo "Logs:   journalctl -u oasis -f"
        else
            echo "Service is enabled but not started."
            echo "Start with: sudo systemctl start oasis"
        fi
        echo ""
        echo "Optional: once the service is running, announce the PUB:"
        echo "  sudo -u oasis /usr/bin/oasis announce ${OASIS_DOMAIN:-<your-domain>} 8008"
    else
        echo "Mode: Client (personal use)"
        echo "Listen default: $OASIS_HOST"
        echo ""
        echo "Run as a normal user:"
        echo ""
        echo "  oasis"
        echo ""
        echo "If you later want a system service (PUB):"
        echo "  1. Edit $GLOBAL_CONFIG"
        echo "  2. Uncomment OASIS_PUB=\"1\" and set OASIS_DOMAIN"
        echo "  3. sudo systemctl enable --now oasis"
    fi

    echo ""
    echo "========================================="
else
    systemctl daemon-reload 2>/dev/null || true
fi

exit 0
POSTINST
chmod 755 "${DEB_ROOT}/DEBIAN/postinst"

# ============================================
# DEBIAN/prerm
# ============================================
cat > "${DEB_ROOT}/DEBIAN/prerm" << 'PRERM'
#!/bin/bash
set -e
systemctl stop oasis 2>/dev/null || true
systemctl disable oasis 2>/dev/null || true
PRERM
chmod 755 "${DEB_ROOT}/DEBIAN/prerm"

# ============================================
# DEBIAN/postrm
# ============================================
cat > "${DEB_ROOT}/DEBIAN/postrm" << 'POSTRM'
#!/bin/bash
set -e
if [ "$1" = "purge" ]; then
    cd /opt && rm -rf oasis/ 2>/dev/null
    rm -f /etc/sudoers.d/oasis-admin
    userdel oasis 2>/dev/null || true
fi
systemctl daemon-reload 2>/dev/null || true
POSTRM
chmod 755 "${DEB_ROOT}/DEBIAN/postrm"

# ============================================
# SYSTEMD SERVICE
# ============================================
cat > "${DEB_ROOT}/lib/systemd/system/oasis.service" << EOF
[Unit]
Description=Oasis P2P Social Network
After=network.target

[Service]
Type=simple
User=oasis
Group=oasis
WorkingDirectory=${INSTALL_DIR}
Environment="PATH=${INSTALL_DIR}/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="OASISCONF=/etc/oasis/oasis.conf"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/oasis
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# ============================================
# COPYRIGHT
# ============================================
cat > "${DEB_ROOT}/usr/share/doc/${PKG_NAME}/copyright" << EOF
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: Oasis
Source: https://code.03c8.net/KrakensLab/snh-oasis

Files: *
Copyright: 2022-2026 SolarNET.HuB / psy <epsylon@riseup.net>
License: AGPL-3.0

Files: opt/oasis/node/*
Copyright: Node.js contributors
License: MIT
EOF

# ============================================
# BUILD
# ============================================
echo "Building .deb package..."
DEB_FILE="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "${DEB_ROOT}" "${DEB_FILE}"

# ============================================
# FIX: Remove the /opt/ directory entry from data.tar
# ============================================
echo "Applying /opt fix to the package..."

FIX_DIR="${BUILD_DIR}/deb-fix-$$"
mkdir -p "$FIX_DIR"
cd "$FIX_DIR"

ar x "${DEB_FILE}"

DATA_FILE=$(ls data.tar.* 2>/dev/null | head -1)
if [ -n "$DATA_FILE" ]; then
    case "$DATA_FILE" in
        *.xz)  unxz "$DATA_FILE" ;;
        *.gz)  gunzip "$DATA_FILE" ;;
        *.zst) zstd -d "$DATA_FILE" ;;
    esac

    tar --delete --occurrence -f data.tar ./opt/ 2>/dev/null || true

    case "$DATA_FILE" in
        *.xz)  xz -f data.tar ;;
        *.gz)  gzip -f data.tar ;;
        *.zst) zstd -f data.tar ;;
    esac

    ar r "${DEB_FILE}" "$DATA_FILE"
    echo "  ✓ /opt directory entry removed"
fi

cd "${BUILD_DIR}"
rm -rf "$FIX_DIR"

echo ""
echo "=== Package built: ${DEB_FILE} ==="
echo "Size: $(du -h "${DEB_FILE}" | cut -f1)"
echo ""
echo "Install: sudo dpkg -i ${DEB_FILE}"
echo "         sudo apt-get install -f"
