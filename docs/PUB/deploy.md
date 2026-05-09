# Oasis PUB Deployment Guide

This guide walks you through deploying an **Oasis PUB** on a VPS using the Oasis launcher (`sh oasis.sh server`). A PUB needs a static, publicly-reachable IP address and an open TCP port (default `8008`).

---

## 1) Prepare the server

Install the basics:

```
sudo apt-get update
sudo apt-get install -y git curl build-essential
```

Install Node.js (Oasis is tested on Node 22; older LTS versions also work for server-only mode):

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22
```

## 2) Clone Oasis

```
cd ~
git clone https://code.03c8.net/krakenslab/oasis oasis
cd oasis
```

## 3) Install dependencies

The `install.sh` script installs Node deps and applies the bundled patches. **You can skip the AI model download** — a PUB does not need it.

```
bash install.sh
```

If the AI model download fails or you skipped it, that's fine. The PUB will run without it.

## 4) Configure the PUB

Edit `src/configs/server-config.json`:

```json
{
  "logging": { "level": "info" },
  "caps": { "shs": "zTmidAb7t+tKi7W93FIHbOvlbd936x6G/vm8e8Td//A=" },
  "pub": true,
  "local": false,
  "friends": { "dunbar": 150, "hops": 3 },
  "gossip": {
    "connections": 50,
    "friends": true,
    "seed": true,
    "global": true
  },
  "connections": {
    "incoming": {
      "net": [
        { "port": 8008, "scope": "public", "transform": "shs", "external": "{your-hostname}" },
        { "port": 8008, "host": "localhost", "scope": "device", "transform": "shs" }
      ],
      "unix": [
        { "scope": ["device", "local", "private"], "transform": "noauth" }
      ]
    },
    "outgoing": {
      "net": [{ "transform": "shs" }]
    }
  },
  "replicationScheduler": {
    "autostart": true,
    "partialReplication": null
  },
  "autofollow": {
    "enabled": true,
    "suggestions": [
      "@mGrevRCSX4E5dLgmflWBc50Qkn/1RXUAtDaGHOJ8xB4=.ed25519"
    ]
  }
}
```

Replace `{your-hostname}` with your VPS public hostname or IP.

## 5) Launch the PUB (server-only)

In server-only mode Oasis runs **only the SSB sbot**, not the web GUI or AI service.

Using `tmux` (simple):

```
tmux new -s oasis-pub
cd ~/oasis
sh oasis.sh server
# detach: Ctrl-b, then d
```

Using `systemd` (recommended for production). The repo ships a ready-to-use unit file at `docs/PUB/oasis-pub.service`. Copy it, edit the `YOUR_USER` placeholders (and the `node` path if you installed Node via `nvm`), then enable it:

```
sudo cp ~/oasis/docs/PUB/oasis-pub.service /etc/systemd/system/oasis-pub.service
sudo nano /etc/systemd/system/oasis-pub.service     # replace YOUR_USER, adjust PATH/ExecStart for nvm if needed
sudo systemctl daemon-reload
sudo systemctl enable --now oasis-pub
sudo journalctl -u oasis-pub -f
```

Tip — if you used `nvm` to install Node:

```
which node                                          # e.g. /home/YOUR_USER/.nvm/versions/node/v22.0.0/bin/node
```

Then in the unit file uncomment the `Environment=PATH=...` line that points at that nvm bin dir, or replace `ExecStart` with the absolute node path on `src/server/SSB_server.js start`.

Data is written to `~/.ssb/`.

## 6) Get your PUB ID

For administrative actions (creating invites, publishing the PUB profile, announcing) you need the SSB CLI. Install `ssb-server` globally on the same machine:

```
npm install -g ssb-server
```

Then, from the PUB user's shell:

```
ssb-server whoami
```

Example response:

```
{ "id": "@mGrevRCSX4E5dLgmflWBc50Qkn/1RXUAtDaGHOJ8xB4=.ed25519" }
```

> The CLI talks to the running sbot via the unix socket at `~/.ssb/socket`, so this works as long as `oasis.sh server` is running.

## 7) Set the PUB profile name

Give your PUB a human-readable name:

```
ssb-server publish --type about --about {pub-id} --name "{pub-name}"
```

## 8) Create invite codes

```
ssb-server invite.create 1
```

The number is how many times the code can be redeemed. For an open PUB you might use a large number:

```
ssb-server invite.create 500
```

Distribute these codes to people who should join the PUB.

## 9) Announce the PUB

So clients can discover the PUB by its hostname, publish a `pub` message:

```
ssb-server publish --type pub --address.key {pub-id} --address.host {your-hostname} --address.port 8008
```

Example for `solarnethub.com`:

```
ssb-server publish --type pub \
  --address.key @mGrevRCSX4E5dLgmflWBc50Qkn/1RXUAtDaGHOJ8xB4=.ed25519 \
  --address.host solarnethub.com \
  --address.port 8008
```

## 10) Follow another PUB (federation)

Federate with other PUBs in the same Oasis network so they replicate each other:

```
ssb-server publish --type contact --contact {other-pub-id} --following
```

Example, federating with `solarnethub.com`:

```
ssb-server publish --type contact \
  --contact "@mGrevRCSX4E5dLgmflWBc50Qkn/1RXUAtDaGHOJ8xB4=.ed25519" \
  --following
```

## 11) Health checks

While the PUB is running, useful inspection commands:

```
ssb-server status                 # peer / replication overview
ssb-server gossip.peers           # cold-storage peer list with state
ls -la ~/.ssb/                    # confirm flume/, blobs/, gossip.json, conn.json exist
sudo journalctl -u oasis-pub -f   # tail service logs
```

## 12) Disabling the AI module (only relevant if also running the GUI)

`sh oasis.sh server` does **not** load the GUI or AI service, so `oasis-config.json` is ignored in server-only mode. Only `server-config.json` matters.

If you also run the GUI on the same VPS (`sh oasis.sh` without `server`), set `aiMod` to `off` in `src/configs/oasis-config.json` to skip the AI model:

```
sed -i 's/"aiMod": *"on"/"aiMod": "off"/' src/configs/oasis-config.json
```

## 13) Joining the Oasis network

The default seed PUB at `solarnethub.com` is included in `autofollow.suggestions` above. As soon as your PUB connects to it (or to any peer that knows about it), gossip propagates the rest of the network's pub list.
