# Oasis HUB Clearnet Guide

A PUB launched with `sh oasis.sh server` does two things: it replicates the network, and it serves a **read-only web HUB** with the public content of the inhabitants it replicates. Guests reach it from the clearnet with a normal browser: they can read, listen and watch, but never write. Every POST is blocked in this mode.

## What is served

| URL | Content |
| --- | --- |
| `/c` (alias `/clearnet`) | Global HUB: every public item of every inhabitant who enabled Clearnet, with type filters, search and a row of inhabitant links. |
| `/c/inhabitant/<feedId>` | One inhabitant's HUB: avatar, description, QR and their public items. |
| `/c/audios/<id>`, `/c/blog/<key>`, `/c/documents/<id>`, `/c/events/<id>`, `/c/feed/<id>`, `/c/images/<id>`, `/c/jobs/<id>`, `/c/market/<id>`, `/c/podcasts/<id>`, `/c/projects/<id>`, `/c/school/<id>`, `/c/shops/<id>`, `/c/torrents/<id>`, `/c/videos/<id>`, `/c/wiki/<id>` | Detail pages, one per module. |
| `/c/blob/<blobId>` | Media files referenced by the pages above. |

Only content whose inhabitant opted in is ever listed or served. Nothing else of the replicated log is exposed.

## What an inhabitant has to do

Nothing on the PUB side. In their own Oasis, under **Profile → Edit**, the inhabitant turns on the modules they want to expose in the **Clearnet** block. Turning on any of them is what makes that inhabitant public; turning them all off takes them off the HUB again.

Those preferences travel with the feed, so every PUB that replicates the inhabitant applies them.

Because of that, any replicating PUB can be used to share a link. 

If `pub.example.org` replicates you, your podcast is reachable at:

```
https://pub.example.org/c/podcasts/<id>
```

No configuration is needed on the inhabitant side beyond the visibility switches.

## Exposing it on the web

Put a reverse proxy in front of the backend port and terminate TLS there.

Apache, when the HUB shares a domain with another site:

```
<VirtualHost *:443>
  ServerName example.org
  AllowEncodedSlashes NoDecode
  ProxyPreserveHost On
  ProxyPass        /c       http://127.0.0.1:3000/c nocanon
  ProxyPassReverse /c       http://127.0.0.1:3000/c
  ProxyPass        /assets  http://127.0.0.1:3000/assets
  ProxyPassReverse /assets  http://127.0.0.1:3000/assets
  ProxyPass        /qr      http://127.0.0.1:3000/qr nocanon
  ProxyPassReverse /qr      http://127.0.0.1:3000/qr
</VirtualHost>
```

nginx, on the same footing:

```
server {
  listen 443 ssl;
  server_name example.org;
  location /c {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
  location /assets { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
  location /qr     { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
}
```

Now you can launch OASIS, this way: 

```
sh oasis.sh --public --no-open --host=0.0.0.0 --port=3000 --allow-host=<your_domain.org>
```

## Notes

- Public mode also redacts, in the rest of the interface, the content of people who have not opted in, so the PUB can be browsed safely.
- The HUB reads the replicated log on each request. On a large PUB a caching proxy in front of `/c` keeps it snappy.
- Themes follow the PUB's own `oasis-config.json`; the example config in this folder is a good starting point.
