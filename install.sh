#!/bin/bash

cd src/server

printf "==========================\n"
printf "|| OASIS Installer v0.2 ||\n"
printf "==========================\n"

read -p "Install dependencies? (debian, ubuntu, mint and all debian like distribution only) [Y/n]" -n 1 -r
echo    
REPLY=${REPLY:-y}
if [[ $REPLY =~ ^[Yy]$ ]]
then
  sudo apt-get install -y git curl tar
  
  curl -sL http://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt-get install -y nodejs
fi
npm install .
npm audit fix

MODEL_DIR="../AI"
MODEL_FILE="oasis-42-1-chat.Q4_K_M.gguf"
MODEL_TAR="$MODEL_FILE.tar.gz"
MODEL_URL="https://solarnethub.com/code/models/$MODEL_TAR"

if [ ! -f "$MODEL_DIR/$MODEL_FILE" ]; then
    echo ""
    echo "downloading AI model [size: 3,8 GiB (4.081.004.224 bytes)] ..."
    curl -L -o "$MODEL_DIR/$MODEL_TAR" "$MODEL_URL"
    echo ""
    echo "extracting package: $MODEL_TAR..."
    echo ""
    tar -xzf "$MODEL_DIR/$MODEL_TAR" -C "$MODEL_DIR"
    rm "$MODEL_DIR/$MODEL_TAR"
fi

printf "==========================\n"
printf "\nOASIS has been correctly deployed! ;)\n\n"
printf "Run: 'sh oasis.sh' to start ...\n\n"
