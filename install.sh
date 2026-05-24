#!/bin/bash

cd src/server

printf "==========================\n"
printf "|| OASIS Installer v0.5 ||\n"
printf "==========================\n"

sudo apt-get install -y git curl tar

curl -sL http://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

GREEN=$'\e[32m'
DIM=$'\e[2m'
RESET=$'\e[0m'

echo ""
echo "Installing Node.js packages..."
echo ""

NPM_LOG=$(mktemp)
if ! npm install . --silent --no-audit --no-fund --no-progress --loglevel=error >"$NPM_LOG" 2>&1; then
    echo "npm install failed. Output:"
    cat "$NPM_LOG"
    rm -f "$NPM_LOG"
    exit 1
fi
rm -f "$NPM_LOG"

DEPS=$(node -e "const p=require('./package.json'); console.log(Object.keys({...(p.dependencies||{}), ...(p.devDependencies||{})}).sort().join('\n'))" 2>/dev/null)
for dep in $DEPS; do
    if [ -d "node_modules/$dep" ]; then
        printf "  ${GREEN}[✓]${RESET} %s\n" "$dep"
    fi
done

echo ""

npm audit fix --silent --no-fund --no-progress >/dev/null 2>&1 || true

MODEL_DIR="../AI"
LLM_FILE="oasis-42-1-chat.Q4_K_M.gguf"
LLM_TAR="$LLM_FILE.tar.gz"
LLM_URL="https://solarnethub.com/code/models/$LLM_TAR"
EMB_DIR="$MODEL_DIR/embeddings"
EMB_TAR="oasis-embeddings.tar.gz"
EMB_URL="https://solarnethub.com/code/models/$EMB_TAR"
EMB_FILE="$EMB_DIR/onnx/model_quantized.onnx"
CONFIG_PATH="../configs/oasis-config.json"

CHOICE="${OASIS_AI:-}"

if [ -z "$CHOICE" ] && [ -t 0 ]; then
    echo ""
    echo "Do you want to enable AI features in Oasis?"
    echo ""
    echo "  [1] Full AI: chat assistant (42) + smart navigation prompt (~3.9 GB)"
    echo "  [2] Smart navigation only (~150 MB)"
    echo "  [3] No AI features (no downloads, AI tabs hidden)"
    echo ""
    read -p "Choose [1/2/3] (default 3): " ANS
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
    echo "downloading AI model [size: 3,8 GiB (4.081.004.224 bytes)] ..."
    curl -L -o "$MODEL_DIR/$LLM_TAR" "$LLM_URL"
    echo ""
    echo "extracting package: $LLM_TAR..."
    echo ""
    tar -xzf "$MODEL_DIR/$LLM_TAR" -C "$MODEL_DIR"
    rm "$MODEL_DIR/$LLM_TAR"
fi

if [ "$WANT_EMB" = "1" ] && [ ! -f "$EMB_FILE" ]; then
    echo ""
    echo "downloading embeddings model [size: ~60 MiB] ..."
    curl -L -o "$MODEL_DIR/$EMB_TAR" "$EMB_URL"
    echo ""
    echo "extracting package: $EMB_TAR..."
    echo ""
    tar -xzf "$MODEL_DIR/$EMB_TAR" -C "$MODEL_DIR"
    rm "$MODEL_DIR/$EMB_TAR"
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
printf "\nOASIS has been correctly deployed! ;)\n\n"
printf "Run: 'sh oasis.sh' to start ...\n\n"
