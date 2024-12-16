# Install

This is a guide on how to download the source code for Oasis so that you can
build and install it on your device.

--------------

For a GNU/Linux based system, execute the following steps (from a shell):

    sudo apt-get install git curl
    curl -sL http://deb.nodesource.com/setup_22.x | sudo bash -
    sudo apt-get install -y nodejs
    git clone https://code.03c8.net/KrakensLab/oasis
    cd oasis
    npm install .
    npm run start
