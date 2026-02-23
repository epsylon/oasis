# Oasis PUB Deployment Guide

This guide will walk you through the process of deploying an **Oasis PUB** on your server. 

---

A PUB server needs a static, publicly-reachable IP address.

By default it uses port 8008, so make sure to expose that port (or whatever port you configure) to the internet.

## 1) Install NodeJS (LTS v18.20.8 for SSB-Server compatibility)

   sudo apt-get install git curl
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.bashrc
   nvm install 18
   nvm use 18
   nvm alias default 18

## 2) Create a `~/.ssb/config` file and the `oasis-pub-server.sh` launch script

Before running the server, create a config file that enables needed plugins and network options.

   nano ~/.ssb/config

Paste this:

{
  "logging": {
    "level": "info"
  },
  "caps": {
    "shs": "1BIWr6Hu+MgtNkkClvg2GAi+0HiAikGOOTd/pIUcH54="
  },
  "pub": true,
  "local": false,
  "friends": {
    "dunbar": 150,
    "hops": 3
  },
  "gossip": {
    "connections": 50,
    "seed": false,
    "global": false
  },
  "connections": {
    "incoming": {
      "net": [
        {
          "port": 8008,
          "scope": "public",
          "transform": "shs",
          "external": "{your-hostname}"
        },
        {
          "port": 8008,
          "host": "localhost",
          "scope": "device",
          "transform": "shs"
        }
      ],
      "unix": [
        {
          "scope": [
            "device",
            "local",
            "private"
          ],
          "transform": "noauth"
        }
      ]
    },
    "outgoing": {
      "net": [
        {
          "transform": "shs"
        }
      ]
    }
  },
  "replicationScheduler": {
    "autostart": true,
    "partialReplication": null
  },
  "autofollow": {
    "enabled": true,
    "suggestions": [
      "@zGfPCNPFas4gHUfib08/oQ4rsWo/tnEfQ5iTkoTiBaI=.ed25519"
    ]
  }
}

Be sure to replace {your-hostname} with your server’s domain or IP.

## 3) Install ssb-server and plugins locally

   npm -g install ssb-server

   mkdir -p ~/.ssb
   cd ~/.ssb
   npm init -y

   npm install ssb-ebt ssb-conn ssb-replication-scheduler ssb-blobs ssb-friends ssb-logging
   
   npm audit fix
   
## 4) Create the launch script and some patches

Save the following script at: ~/oasis-pub/patch-ssb-ref.js 
   
   const fs = require('fs');
   const path = require('path');

   const ssbRefPath = path.resolve(__dirname, 'node_modules/ssb-ref/index.js'); // Adjust as needed

   if (fs.existsSync(ssbRefPath)) {
     const data = fs.readFileSync(ssbRefPath, 'utf8');
     const patchedData = data.replace(
       'exports.parseAddress = deprecate(\'ssb-ref.parseAddress\', parseAddress)',
       'exports.parseAddress = parseAddress'
     );

     if (data !== patchedData) {
       fs.writeFileSync(ssbRefPath, patchedData);
       console.log('[OASIS] [PATCH] Patched ssb-ref to remove deprecated usage of parseAddress');
     }
   }

And make it executable:

   chmod +x ~/oasis-pub/patch-ssb-ref.js 

Finally, save the following script at: ~/oasis-pub/oasis-pub-server.sh.
    
  #!/bin/bash
  export NODE_OPTIONS="--no-deprecation"

  cd ~/oasis-pub
  node patch-ssb-ref.js
  ssb-server start
   
And make it executable:

   chmod +x ~/oasis-pub/oasis-pub-server.sh

## 5) Run the server script

Use a session-manager such as screen or tmux to create a detachable session. Start the session and run the script:

   sh ~/oasis-pub/oasis-pub-server.sh

Then, detach the session.

## 6) Create the Pub's profile

It's a good idea to give your PUB a name, by publishing one on its feed. 

To do this, first get the PUB's ID, with: 

   cd ~/oasis-pub 
   ssb-server whoami
   
   {
     "id": "@zGfPCNPFas4gHUfib08/oQ4rsWo/tnEfQ5iTkoTiBaI=.ed25519"
   }

Then, publish a name with the following command:

   ssb-server publish --type about --about {pub-id} --name {name}

## 7) Create Invites

For a last step, you should create invite codes, which you can send to other inhabitants to let them join the PUB. 

The command to create an invite code is:

   cd ~/oasis-pub 
   ssb-server invite.create 1

This may now be given out to friends, to command your PUB to follow them. 

If you want to let a single code be used more than once, you can provide a number larger than 1.

   cd ~/oasis-pub 
   ssb-server invite.create 500

## 8) Announce your PUB

To announce your PUB, publish this message:

   cd ~/oasis-pub 
   ssb-server publish --type pub --address.key {pub-id} --address.host {name} --address.port {number}
   
For example, to announce `solarnethub.com` PUB: "La Plaza":

   ssb-server publish --type pub --address.key @zGfPCNPFas4gHUfib08/oQ4rsWo/tnEfQ5iTkoTiBaI=.ed25519 --address.host solarnethub.com --address.port 8008
    
## 9) Following another PUB

To follow another PUB's feed, publish this other message:

   cd ~/oasis-pub 
   ssb-server publish --type contact --contact {pub-id-to-follow} --following
    
For example, to follow `solarnethub.com` PUB: "La Plaza":

   cd ~/oasis-pub 
   ssb-server publish --type contact --contact "@zGfPCNPFas4gHUfib08/oQ4rsWo/tnEfQ5iTkoTiBaI=.ed25519" --following

## 10) Join the Oasis PUB Network

To help your PUB discover other Oasis-connected peers and speed up replication, we’ve included the Oasis seed PUB at `solarnethub.com` in your config file.

