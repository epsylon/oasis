#!/bin/bash

cd src/server
printf "==========================\n"
printf "|| OASIS Installer v0.1 ||\n"
printf "==========================\n"
sudo apt-get install git curl
curl -sL http://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
npm install .
npm audit fix
printf "==========================\n"
printf "\nOASIS has been correctly deployed! ;)\n\n"
printf "Run: 'sh oasis.sh' to start ...\n\n"
