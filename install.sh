#!/bin/sh

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/src/server" || exit 1

printf "==========================\n"
printf "|| OASIS Installer v0.6 ||\n"
printf "==========================\n"

NODE_MIN=22
NODESOURCE_FPR="6F71F525282841EEDAF851B42F59B5F99B1BE0B4"

have() { command -v "$1" >/dev/null 2>&1; }

node_ok() {
    have node || return 1
    local major
    major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null) || return 1
    [ "$major" -ge "$NODE_MIN" ] 2>/dev/null
}

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if have sudo; then SUDO="sudo"; elif have doas; then SUDO="doas"; fi
fi

PM="none"
if have apt-get; then PM="apt"
elif have pacman; then PM="pacman"
elif have dnf; then PM="dnf"
elif have zypper; then PM="zypper"
elif have apk; then PM="apk"
elif have xbps-install; then PM="xbps"
elif have brew; then PM="brew"
fi

install_base() {
    case "$PM" in
        apt)    $SUDO apt-get install -y git curl tar python3 make g++ ;;
        pacman) $SUDO pacman -S --needed --noconfirm git curl tar base-devel python ;;
        dnf)    $SUDO dnf install -y git curl tar python3 make gcc-c++ ;;
        zypper) $SUDO zypper --non-interactive install git curl tar python3 make gcc-c++ ;;
        apk)    $SUDO apk add git curl tar python3 make g++ ;;
        xbps)   $SUDO xbps-install -y git curl tar python3 make gcc ;;
        brew)   brew install git curl ;;
    esac
}

install_node() {
    case "$PM" in
        apt)
            $SUDO apt-get install -y ca-certificates curl gnupg
            NS_KEY="$(mktemp)"
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$NS_KEY"
            if [ "$(gpg --show-keys --with-colons "$NS_KEY" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')" != "$NODESOURCE_FPR" ]; then
                rm -f "$NS_KEY"
                echo "The NodeSource signing key does not match the expected one. Install Node.js ${NODE_MIN}+ yourself, then run: OASIS_NO_SYSTEM_DEPS=1 ./install.sh"
                exit 1
            fi
            $SUDO mkdir -p /etc/apt/keyrings
            gpg --dearmor < "$NS_KEY" | $SUDO tee /etc/apt/keyrings/nodesource.gpg >/dev/null
            rm -f "$NS_KEY"
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MIN}.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
            $SUDO apt-get update
            $SUDO apt-get install -y nodejs
            ;;
        pacman) $SUDO pacman -S --needed --noconfirm nodejs npm ;;
        dnf)    $SUDO dnf install -y "nodejs${NODE_MIN}" npm 2>/dev/null || $SUDO dnf install -y nodejs npm ;;
        zypper) $SUDO zypper --non-interactive install "nodejs${NODE_MIN}" "npm${NODE_MIN}" 2>/dev/null || $SUDO zypper --non-interactive install nodejs npm ;;
        apk)    $SUDO apk add nodejs npm ;;
        xbps)   $SUDO xbps-install -y nodejs ;;
        brew)   brew install "node@${NODE_MIN}" && brew link --overwrite --force "node@${NODE_MIN}" ;;
    esac
}

if [ -z "${OASIS_NO_SYSTEM_DEPS:-}" ]; then
    if [ "$PM" = "none" ]; then
        echo "No known package manager found (apt, pacman, dnf, zypper, apk, xbps, brew)."
        echo "Install git, curl, tar and Node.js ${NODE_MIN}+ yourself, then run: OASIS_NO_SYSTEM_DEPS=1 ./install.sh"
        exit 1
    fi
    echo ""
    echo "System packages via $PM..."
    install_base
    if node_ok; then
        echo "Node.js $(node -v) already present."
    else
        echo "Installing Node.js ${NODE_MIN}..."
        install_node
    fi
fi

if ! node_ok; then
    echo ""
    echo "Oasis needs Node.js ${NODE_MIN} or newer; found: $(node -v 2>/dev/null || echo none)."
    echo "Install it from https://nodejs.org or with nvm (https://github.com/nvm-sh/nvm), then run this installer again."
    exit 1
fi

GREEN=$(printf '\033[32m')
DIM=$(printf '\033[2m')
RESET=$(printf '\033[0m')

ensure_base() {
    if [ -e node_modules ]; then return 0; fi
    [ -L node_modules ] && rm -f node_modules
    if [ -d ../base/node_modules ]; then ln -s ../base/node_modules node_modules; return 0; fi
    return 1
}

core_loads() {
    node -e "require('ssb-db2'); require('koa'); require('sodium-native'); require('leveldown'); require('hyperaxe')" >/dev/null 2>&1
}

if ensure_base && core_loads; then
    DEPS_USED="src/base/node_modules, shipped with Oasis"
else
    echo ""
    echo "src/base is missing or does not load on this system; installing the packages with npm instead..."
    [ -L node_modules ] && rm -f node_modules
    NPM_LOG=$(mktemp)
    if [ -f package-lock.json ]; then NPM_CMD="npm ci"; else NPM_CMD="npm install ."; fi
    if ! $NPM_CMD --no-audit --no-fund --no-progress --loglevel=error >"$NPM_LOG" 2>&1; then
        echo "$NPM_CMD failed. Output:"
        cat "$NPM_LOG"
        rm -f "$NPM_LOG"
        exit 1
    fi
    rm -f "$NPM_LOG"
    DEPS_USED="$NPM_CMD (package-lock.json)"
fi

DEPS=$(node -e "const p=require('./package.json'); console.log(Object.keys({...(p.dependencies||{}), ...(p.devDependencies||{})}).sort().join('\n'))" 2>/dev/null)
for dep in $DEPS; do
    if [ -d "node_modules/$dep" ]; then
        printf "  ${GREEN}[✓]${RESET} %s\n" "$dep"
    fi
done

echo ""

MODEL_DIR="../AI"
LLM_FILE="oasis-42-1-chat.Q4_K_M.gguf"
LLM_TAR="$LLM_FILE.tar.gz"
LLM_SHA256="52c018928a6aef272b7e97a8fd49d930200b942487683ff4963e67e74c7ec14e"
EMB_DIR="$MODEL_DIR/embeddings"
EMB_TAR="oasis-embeddings.tar.gz"
EMB_SHA256="128f3526695b4af1320facc601eac2428ced39e3cd18e5ee829a1c54eea9fa41"
EMB_FILE="$EMB_DIR/onnx/model_quantized.onnx"
CONFIG_PATH="${OASIS_STATE_DIR:-${ssb_path:-$HOME/.ssb}}/oasis/oasis-config.json"
[ -f "$CONFIG_PATH" ] || node -e "require('../configs/config-manager.js')" >/dev/null 2>&1
MODEL_MIRRORS="${OASIS_MODEL_MIRRORS:-} https://solarnethub.com/code/models https://4ndr0m3d4.xyz"

tar_is_safe() {
    local file="$1" pattern="$2" listing
    listing=$(tar -tvzf "$file" 2>/dev/null) || return 1
    printf '%s\n' "$listing" | grep -q '^[lhcbp]' && return 1
    tar -tzf "$file" 2>/dev/null | while IFS= read -r entry; do
        case "$entry" in /*|..|../*|*/..|*/../*) exit 1 ;; esac
        [ "$entry" = "./" ] && continue
        printf '%s\n' "$entry" | grep -Eq "$pattern" || exit 1
    done
}

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

download_package() {
    local name="$1" out="$2" pattern="$3" digest="$4" base url
    for base in $MODEL_MIRRORS; do
        url="${base%/}/$name"
        echo "  trying $url"
        if curl -fL --progress-bar --retry 2 --connect-timeout 20 -o "$out.part" "$url" && [ "$(sha256_of "$out.part")" = "$digest" ] && tar_is_safe "$out.part" "$pattern"; then
            mv "$out.part" "$out"
            return 0
        fi
        rm -f "$out.part"
    done
    return 1
}

CHOICE="${OASIS_AI:-}"

if [ -z "$CHOICE" ] && [ -t 0 ]; then
    echo ""
    echo "Do you want to enable AI features in Oasis?"
    echo ""
    echo "  [1] Full AI: chat assistant (42) + smart navigation prompt (~2.2 GB)"
    echo "  [2] Smart navigation only (~150 MB)"
    echo "  [3] No AI features (no downloads, AI tabs hidden)"
    echo ""
    printf "Choose [1/2/3] (default 3): "
    read ANS
    case "$ANS" in
        1) CHOICE="full" ;;
        2) CHOICE="nav" ;;
        *) CHOICE="none" ;;
    esac
fi

if [ -z "$CHOICE" ]; then
    CHOICE="none"
fi

case "$CHOICE" in
    full)
        WANT_LLM=1
        WANT_EMB=1
        ;;
    nav)
        WANT_LLM=0
        WANT_EMB=1
        ;;
    *)
        WANT_LLM=0
        WANT_EMB=0
        ;;
esac

if [ "$WANT_LLM" = "1" ] && [ ! -f "$MODEL_DIR/$LLM_FILE" ]; then
    echo ""
    echo "downloading AI model [size: 1,9 GiB (2.051.410.266 bytes)] ..."
    if download_package "$LLM_TAR" "$MODEL_DIR/$LLM_TAR" '^(\./)?oasis-42-1-chat\.Q4_K_M\.gguf$' "$LLM_SHA256"; then
        echo ""
        echo "extracting package: $LLM_TAR..."
        echo ""
        tar -xzf "$MODEL_DIR/$LLM_TAR" -C "$MODEL_DIR"
        rm "$MODEL_DIR/$LLM_TAR"
    else
        echo "The AI model could not be downloaded from any mirror; the assistant stays off. Run the installer again later, or set OASIS_MODEL_MIRRORS=https://your.mirror"
        WANT_LLM=0
    fi
fi

if [ "$WANT_EMB" = "1" ] && [ ! -f "$EMB_FILE" ]; then
    echo ""
    echo "downloading embeddings model [size: ~74 MiB] ..."
    if download_package "$EMB_TAR" "$MODEL_DIR/$EMB_TAR" '^(\./)?embeddings(/.*)?$' "$EMB_SHA256"; then
        echo ""
        echo "extracting package: $EMB_TAR..."
        echo ""
        tar -xzf "$MODEL_DIR/$EMB_TAR" -C "$MODEL_DIR"
        rm "$MODEL_DIR/$EMB_TAR"
    else
        echo "The embeddings model could not be downloaded from any mirror; smart navigation stays off."
        WANT_EMB=0
    fi
fi

if [ "$WANT_LLM" = "1" ] || [ "$WANT_EMB" = "1" ]; then
    echo ""
    echo "Installing the AI packages in src/AI..."
    ( cd ../AI && {
        if [ "$WANT_LLM" = "1" ]; then AI_NPM="npm ci"; AI_CHECK="require('@xenova/transformers'); require('node-llama-cpp')"; else AI_NPM="npm ci --omit=optional"; AI_CHECK="require('@xenova/transformers')"; fi
        if [ -d node_modules ] && node -e "$AI_CHECK" >/dev/null 2>&1; then
            echo "AI packages already in place."
        else
            $AI_NPM --no-audit --no-fund --no-progress --loglevel=error && node ../../scripts/patch-node-modules.js || { echo "The AI packages could not be installed; AI features will stay off."; WANT_LLM=0; WANT_EMB=0; }
        fi
    } )
fi

if [ -f "$CONFIG_PATH" ]; then
    AI_VAL="off"; NAV_VAL="off"
    [ "$WANT_LLM" = "1" ] && AI_VAL="on"
    [ "$WANT_EMB" = "1" ] && NAV_VAL="on"
    node -e "
const fs = require('fs');
const p = '$CONFIG_PATH';
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
cfg.modules = cfg.modules || {};
cfg.modules.aiMod = '$AI_VAL';
cfg.modules.aiNavMod = '$NAV_VAL';
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
"
fi

printf "==========================\n"
printf "\nNode.js %s, database: ssb-db2, packages: %s\n" "$(node -v)" "$DEPS_USED"
printf "\nOASIS has been correctly deployed! ;)\n\n"
printf "Run: './oasis.sh' to start ...\n\n"
