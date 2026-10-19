#!/bin/bash

set -euo pipefail

PKG_NAME="oasis"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="/opt/oasis"
NODE_VERSION="${OASIS_NODE_VERSION:-22.23.3}"
OUT_DIR="${OASIS_DEB_OUT:-/tmp/oasis-deb-build}"
CACHE_DIR="${OASIS_DEB_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/oasis-deb}"
ARCH="$(dpkg --print-architecture)"

for arg in "$@"; do
    case "$arg" in
        --arm64) ARCH="arm64" ;;
        --amd64) ARCH="amd64" ;;
        --arch=*) ARCH="${arg#--arch=}" ;;
        *) echo "Unknown option: $arg (use --amd64, --arm64 or --arch=<arch>)" >&2; exit 2 ;;
    esac
done

case "$ARCH" in
    amd64) NODE_ARCH="x64" ;;
    arm64) NODE_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH (amd64 or arm64)" >&2; exit 1 ;;
esac

for tool in dpkg-deb tar xz curl sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { echo "Missing build tool: $tool" >&2; exit 1; }
done

VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "${SRC_DIR}/src/server/package.json" | head -1)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || { echo "Cannot read the version from src/server/package.json" >&2; exit 1; }

echo "=== Building Oasis ${VERSION} .deb (${ARCH}, Node.js ${NODE_VERSION}) ==="

NODE_TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
mkdir -p "$CACHE_DIR"
chmod 700 "$CACHE_DIR"
curl -fsSL "${NODE_URL}/SHASUMS256.txt" -o "${CACHE_DIR}/SHASUMS256-v${NODE_VERSION}.txt"
if [ ! -f "${CACHE_DIR}/${NODE_TARBALL}" ]; then
    echo "Downloading ${NODE_TARBALL}..."
    curl -fL --progress-bar "${NODE_URL}/${NODE_TARBALL}" -o "${CACHE_DIR}/${NODE_TARBALL}.part"
    mv "${CACHE_DIR}/${NODE_TARBALL}.part" "${CACHE_DIR}/${NODE_TARBALL}"
fi
if ! (cd "$CACHE_DIR" && grep " ${NODE_TARBALL}\$" "SHASUMS256-v${NODE_VERSION}.txt" | sha256sum -c --status -); then
    rm -f "${CACHE_DIR}/${NODE_TARBALL}"
    echo "The Node.js tarball does not match the official checksum; removed it, run again." >&2
    exit 1
fi
echo "  ✓ Node.js ${NODE_VERSION} verified against SHASUMS256.txt"

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
DEB_ROOT="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}"
APP="${DEB_ROOT}${INSTALL_DIR}"
mkdir -p "${DEB_ROOT}/DEBIAN" "${APP}/node" "${DEB_ROOT}/usr/bin" "${DEB_ROOT}/usr/share/applications" \
    "${DEB_ROOT}/usr/share/doc/${PKG_NAME}" "${DEB_ROOT}/lib/systemd/system" "${DEB_ROOT}/etc/oasis"

echo "Copying application files..."
tar -C "$SRC_DIR" --anchored \
    --exclude='src/server/node_modules' --exclude='src/server/node_modules.full' \
    --exclude='src/AI/node_modules' --exclude='src/AI/embeddings' --exclude='src/AI/.cache' \
    --exclude='src/configs' --exclude='*.gguf' --exclude='*.onnx' --exclude='*/.update_required' \
    -cf - src scripts docs oasis.sh LICENSE README.md | tar -C "$APP" -xf -
mkdir -p "${APP}/src/configs"
for f in config-manager.js shared-state.js state-manager.js server-config.json invite-codes.json; do
    cp "${SRC_DIR}/src/configs/${f}" "${APP}/src/configs/"
done
ln -s ../base/node_modules "${APP}/src/server/node_modules"
chmod 755 "${APP}/oasis.sh"
[ -d "${APP}/src/base/node_modules" ] || { echo "src/base/node_modules is missing" >&2; exit 1; }
echo "  ✓ Oasis ${VERSION} (with src/base)"

tar -C "${APP}/node" --strip-components=1 -xJf "${CACHE_DIR}/${NODE_TARBALL}" \
    --exclude='*/include' --exclude='*/share' \
    --exclude='*/lib/node_modules/npm' --exclude='*/lib/node_modules/corepack' \
    --exclude='*/bin/npm' --exclude='*/bin/npx' --exclude='*/bin/corepack'
echo "  ✓ Node.js ${NODE_VERSION} embedded"

cat > "${DEB_ROOT}/usr/bin/oasis" << 'WRAPPER'
#!/bin/sh
set -e
OASIS_HOME=/opt/oasis
if [ "$(id -u)" -eq 0 ]; then
    echo "Do not run Oasis as root. Run it as your own user; to manage the PUB service: sudo -u oasis oasis <command>" >&2
    exit 1
fi
HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
export HOME
PATH="$OASIS_HOME/node/bin:$PATH"
export PATH
uid="$(id -u)"
slot=0
if [ "$uid" -gt 1000 ] && [ "$uid" -lt 2000 ]; then
    slot=$((uid - 1000))
fi
if [ "$slot" -gt 0 ]; then
    ssb_port="${ssb_port:-$((8008 + slot))}"
    OASIS_AI_PORT="${OASIS_AI_PORT:-$((4001 + slot))}"
    export ssb_port OASIS_AI_PORT
    case "${1:-}" in
        ""|gui|-*)
            case " $* " in
                *" --port="*) ;;
                *) set -- "$@" "--port=$((3000 + slot))" ;;
            esac
            ;;
    esac
fi
cd "$OASIS_HOME"
exec /bin/sh "$OASIS_HOME/oasis.sh" "$@"
WRAPPER
chmod 755 "${DEB_ROOT}/usr/bin/oasis"

cat > "${DEB_ROOT}/etc/oasis/oasis.conf" << 'CONF'
OASIS_ARGS=""
CONF

cat > "${DEB_ROOT}/lib/systemd/system/oasis.service" << EOF
[Unit]
Description=Oasis PUB
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=oasis
Group=oasis
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-/etc/oasis/oasis.conf
Environment=NODE_ENV=production
ExecStart=/usr/bin/oasis server \$OASIS_ARGS
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

cat > "${DEB_ROOT}/usr/share/applications/oasis.desktop" << EOF
[Desktop Entry]
Name=Oasis
GenericName=P2P Social Network
Exec=oasis
Icon=${INSTALL_DIR}/src/client/assets/images/favicon.svg
Terminal=true
Type=Application
Categories=Network;Chat;InstantMessaging;
EOF

cat > "${DEB_ROOT}/DEBIAN/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: SolarNET.HuB <solarnethub@riseup.net>
Depends: libc6 (>= 2.28)
Recommends: ffmpeg
Suggests: pulseaudio-utils | pipewire-bin | alsa-utils, gstreamer1.0-tools, tor
Installed-Size: $(du -sk "${DEB_ROOT}" | cut -f1)
Section: net
Priority: optional
Homepage: https://solarnethub.com
Description: Oasis P2P Social Network
 Oasis is a P2P encrypted social network built on Secure Scuttlebutt (SSB).
 Zero browser JavaScript — all rendering is server-side HTML+CSS.
 Ships its own Node.js ${NODE_VERSION}; no npm or registry needed.
 Part of the SolarNET.HuB ecosystem.
EOF

cat > "${DEB_ROOT}/DEBIAN/conffiles" << 'EOF'
/etc/oasis/oasis.conf
EOF

cat > "${DEB_ROOT}/DEBIAN/postinst" << 'POSTINST'
#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    if ! id -u oasis >/dev/null 2>&1; then
        if getent group oasis >/dev/null 2>&1; then group="--gid oasis"; else group="--user-group"; fi
        useradd --system $group --home-dir /var/lib/oasis --create-home --shell /usr/sbin/nologin oasis
    fi
    install -d -o oasis -g oasis -m 700 /var/lib/oasis/.ssb
    systemctl daemon-reload >/dev/null 2>&1 || true
    if [ -n "$2" ]; then
        systemctl try-restart oasis >/dev/null 2>&1 || true
    else
        echo ""
        echo "=== Oasis installed ==="
        echo "Desktop: run 'oasis' as your own user (http://localhost:3000)."
        echo "PUB: follow /opt/oasis/docs/PUB/deploy.md with these paths:"
        echo "  sudo -u oasis mkdir -p /var/lib/oasis/.ssb/oasis"
        echo "  sudo -u oasis cp /opt/oasis/docs/PUB/server-config.json.example /var/lib/oasis/.ssb/oasis/oasis-server-config.json"
        echo "  (edit it), then: sudo systemctl enable --now oasis"
        echo "  admin commands: sudo -u oasis oasis whoami | invite | announce ..."
        echo ""
    fi
fi
exit 0
POSTINST
chmod 755 "${DEB_ROOT}/DEBIAN/postinst"

cat > "${DEB_ROOT}/DEBIAN/prerm" << 'PRERM'
#!/bin/sh
set -e
if [ "$1" = "remove" ]; then
    systemctl stop oasis >/dev/null 2>&1 || true
    systemctl disable oasis >/dev/null 2>&1 || true
fi
exit 0
PRERM
chmod 755 "${DEB_ROOT}/DEBIAN/prerm"

cat > "${DEB_ROOT}/DEBIAN/postrm" << 'POSTRM'
#!/bin/sh
set -e
if [ "$1" = "purge" ]; then
    rm -rf /etc/oasis
    echo "Kept /var/lib/oasis (the PUB identity and data) and the 'oasis' user; remove them by hand if you no longer need them."
fi
systemctl daemon-reload >/dev/null 2>&1 || true
exit 0
POSTRM
chmod 755 "${DEB_ROOT}/DEBIAN/postrm"

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

mkdir -p "$OUT_DIR"
DEB_FILE="${OUT_DIR}/${PKG_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --root-owner-group --build "${DEB_ROOT}" "${DEB_FILE}" >/dev/null

echo ""
echo "=== Package built: ${DEB_FILE} ==="
echo "Install: sudo apt install ${DEB_FILE}"
echo ""
