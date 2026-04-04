#!/bin/bash

set -e

VERSION="0.6.9"
PKG_NAME="oasis"
ARCH=$(dpkg --print-architecture)
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="/tmp/oasis-deb-build"
DEB_ROOT="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}"
INSTALL_DIR="/opt/oasis"

if [ "$1" = "--arm64" ]; then
    ARCH="arm64"
    DEB_ROOT="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}"
fi

echo "=== Building Oasis ${VERSION} .deb (${ARCH}) ==="

rm -rf "${DEB_ROOT}"
mkdir -p "${DEB_ROOT}/DEBIAN"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/server"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/backend"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/views"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/models"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/client"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/src/configs"
mkdir -p "${DEB_ROOT}${INSTALL_DIR}/scripts"
mkdir -p "${DEB_ROOT}/usr/bin"
mkdir -p "${DEB_ROOT}/usr/share/applications"
mkdir -p "${DEB_ROOT}/usr/share/doc/${PKG_NAME}"
mkdir -p "${DEB_ROOT}/lib/systemd/system"

echo "Copying application files..."

cp -r "${SRC_DIR}/src/server/package.json" "${DEB_ROOT}${INSTALL_DIR}/src/server/"
cp -r "${SRC_DIR}/src/server/package-lock.json" "${DEB_ROOT}${INSTALL_DIR}/src/server/" 2>/dev/null || true
cp "${SRC_DIR}/src/server/ssb_config.js" "${DEB_ROOT}${INSTALL_DIR}/src/server/"
cp "${SRC_DIR}/src/server/ssb_metadata.js" "${DEB_ROOT}${INSTALL_DIR}/src/server/"
cp "${SRC_DIR}/src/server/SSB_server.js" "${DEB_ROOT}${INSTALL_DIR}/src/server/"

if [ -d "${SRC_DIR}/src/server/packages" ]; then
    cp -r "${SRC_DIR}/src/server/packages" "${DEB_ROOT}${INSTALL_DIR}/src/server/"
    find "${DEB_ROOT}${INSTALL_DIR}/src/server/packages" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
fi

cp "${SRC_DIR}/src/backend/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/backend/"
cp -r "${SRC_DIR}/src/views/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/views/"
cp -r "${SRC_DIR}/src/models/"*.js "${DEB_ROOT}${INSTALL_DIR}/src/models/"
cp -r "${SRC_DIR}/src/client" "${DEB_ROOT}${INSTALL_DIR}/src/"
find "${DEB_ROOT}${INSTALL_DIR}/src/client" -name "*.py" -delete 2>/dev/null
find "${DEB_ROOT}${INSTALL_DIR}/src/client" -name ".ruff_cache" -type d -exec rm -rf {} + 2>/dev/null || true
cp -r "${SRC_DIR}/src/configs/oasis-config.json" "${DEB_ROOT}${INSTALL_DIR}/src/configs/"
cp -r "${SRC_DIR}/src/configs/shared-state.js" "${DEB_ROOT}${INSTALL_DIR}/src/configs/" 2>/dev/null || true
cp -r "${SRC_DIR}/scripts" "${DEB_ROOT}${INSTALL_DIR}/"
cp "${SRC_DIR}/oasis.sh" "${DEB_ROOT}${INSTALL_DIR}/"
cp "${SRC_DIR}/LICENSE" "${DEB_ROOT}${INSTALL_DIR}/"

cat > "${DEB_ROOT}/DEBIAN/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: SolarNET.HuB <solarnethub@riseup.net>
Depends: nodejs (>= 18)
Recommends: npm
Installed-Size: $(du -sk "${DEB_ROOT}${INSTALL_DIR}" | cut -f1)
Section: net
Priority: optional
Homepage: https://solarnethub.com
Description: Oasis P2P Social Network
 Oasis is a P2P encrypted social network built on Secure Scuttlebutt (SSB).
 Zero browser JavaScript — all rendering is server-side HTML+CSS.
 Part of the SolarNET.HuB ecosystem.
EOF

cat > "${DEB_ROOT}/DEBIAN/postinst" << 'POSTINST'
#!/bin/bash

INSTALL_DIR="/opt/oasis"

echo "Installing Node.js dependencies..."
cd "${INSTALL_DIR}/src/server"
npm install --production 2>&1 | tail -10
node ../../scripts/patch-node-modules.js 2>/dev/null || true

if ! id -u oasis >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/oasis --create-home --shell /usr/sbin/nologin oasis
fi

mkdir -p /var/lib/oasis/.ssb
chown -R oasis:oasis /var/lib/oasis
chown -R oasis:oasis "${INSTALL_DIR}"

systemctl daemon-reload 2>/dev/null || true
echo ""
echo "=== Oasis installed ==="
echo "Start: systemctl start oasis"
echo "Enable: systemctl enable oasis"
echo "Open: http://localhost:3000"
echo ""
POSTINST
chmod 755 "${DEB_ROOT}/DEBIAN/postinst"

cat > "${DEB_ROOT}/DEBIAN/prerm" << 'PRERM'
#!/bin/bash
set -e
systemctl stop oasis 2>/dev/null || true
systemctl disable oasis 2>/dev/null || true
PRERM
chmod 755 "${DEB_ROOT}/DEBIAN/prerm"

cat > "${DEB_ROOT}/DEBIAN/postrm" << 'POSTRM'
#!/bin/bash
set -e
if [ "$1" = "purge" ]; then
    rm -rf /opt/oasis
    userdel oasis 2>/dev/null || true
    rm -rf /var/lib/oasis
fi
systemctl daemon-reload 2>/dev/null || true
POSTRM
chmod 755 "${DEB_ROOT}/DEBIAN/postrm"

cat > "${DEB_ROOT}/lib/systemd/system/oasis.service" << EOF
[Unit]
Description=Oasis P2P Social Network
After=network.target

[Service]
Type=simple
User=oasis
Group=oasis
WorkingDirectory=${INSTALL_DIR}
ExecStart=/bin/sh ${INSTALL_DIR}/oasis.sh
Restart=on-failure
RestartSec=10
Environment=HOME=/var/lib/oasis
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

cat > "${DEB_ROOT}/usr/bin/oasis" << 'LAUNCHER'
#!/bin/sh
exec /bin/sh /opt/oasis/oasis.sh "$@"
LAUNCHER
chmod 755 "${DEB_ROOT}/usr/bin/oasis"

cat > "${DEB_ROOT}/usr/share/applications/oasis.desktop" << EOF
[Desktop Entry]
Name=Oasis
GenericName=P2P Social Network
Exec=xdg-open http://localhost:3000
Icon=applications-internet
Terminal=false
Type=Application
Categories=Network;Chat;InstantMessaging;
EOF

cat > "${DEB_ROOT}/usr/share/doc/${PKG_NAME}/copyright" << EOF
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: Oasis
Source: https://code.03c8.net/KrakensLab/snh-oasis

Files: *
Copyright: 2022-2026 SolarNET.HuB / psy <epsylon@riseup.net>
License: AGPL-3.0
EOF

echo "Building .deb package..."
DEB_FILE="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --build "${DEB_ROOT}" "${DEB_FILE}"

echo ""
echo "=== Package built: ${DEB_FILE} ==="
echo "Size: $(du -h "${DEB_FILE}" | cut -f1)"
echo ""
echo "Install: sudo dpkg -i ${DEB_FILE}"
echo "         sudo apt-get install -f"
