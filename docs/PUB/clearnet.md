# Oasis HUB Clearnet Guide

A PUB launched with `sh oasis.sh server` does two things: it replicates the network, and it serves a **read-only web HUB** with the public content of the inhabitants it replicates. Guests reach it from the clearnet with a normal browser: they can read, listen and watch, but never write. Every POST is blocked in this mode.

## What is served

| URL | Content |
| --- | --- |
| `/c` (alias `/clearnet`) | Global HUB: every public item of every inhabitant who enabled Clearnet, with type filters, search and a row of inhabitant links. |
| `/c/inhabitant/<feedId>` | One inhabitant's HUB: avatar, description, QR and their public items. |
| `/c/podcasts/<id>`, `/c/shops/<id>`, `/c/jobs/<id>`, `/c/events/<id>`, `/c/projects/<id>`, `/c/school/<id>`, `/c/blog/<key>`, `/c/audios/<id>`, `/c/videos/<id>`, `/c/images/<id>`, `/c/documents/<id>`, `/c/torrents/<id>` | Detail pages. |
| `/c/blob/<blobId>` | Media files referenced by the pages above. |

Only content whose inhabitant opted in is ever listed or served. Nothing else of the replicated log is exposed.

## What an inhabitant has to do

Nothing on the PUB side. In their own Oasis, under **Profile → Edit**, the inhabitant turns on **Clearnet** and then the modules they want to expose. Those preferences travel with the feed, so every PUB that replicates the inhabitant applies them.

Because of that, any replicating PUB can be used to share a link. If `pub.example.org` replicates you, your podcast is reachable at:

```
https://pub.example.org/c/podcasts/<id>
```

and your whole public profile at `https://pub.example.org/c/inhabitant/<your feedId>`. No configuration is needed on the inhabitant side beyond the visibility switches.

## Launching

`sh oasis.sh server` starts the sbot in the background and then the backend headless:

```
node backend.js --public --no-open --host=0.0.0.0
```

Extra flags are passed through, for example `sh oasis.sh server --port=3000`. Stopping the launcher stops both processes. The systemd unit in [`oasis-pub.service`](./oasis-pub.service) already uses this command.

## Exposing it on the web

Put a reverse proxy in front of the backend port and terminate TLS there. A minimal nginx site:

```
server {
  listen 443 ssl;
  server_name pub.example.org;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

The OASIS port (`8008` by default) stays open for replication as described in [`deploy.md`](./deploy.md). The web port only needs to be reachable through the proxy.

## Notes

- Public mode also redacts, in the rest of the interface, the content of people who have not opted in, so the PUB can be browsed safely.
- The HUB reads the replicated log on each request. On a large PUB a caching proxy in front of `/c` keeps it snappy.
- Themes follow the PUB's own `oasis-config.json`; the example config in this folder is a good starting point.
