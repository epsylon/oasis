# Oasis HUB Clearnet Guide

A PUB launched with `./oasis.sh server` does two things: it replicates the network, and it serves a **read-only web HUB** with the content its inhabitants chose to publish on the CLEARNET. Guests reach it from the clearnet with a normal browser: they can read, listen and watch, but never write. Every POST is blocked in this mode.

## What is served

| URL | Content |
| --- | --- |
| `/c` (alias `/clearnet`) | Global HUB: every CLEARNET item of every inhabitant the PUB replicates, with type filters, search, a row of inhabitant links and the public tribes. |
| `/c/inhabitant/<feedId>` | One inhabitant's HUB: avatar, description, QR and the items that inhabitant put on the CLEARNET. |
| `/c/tribe/<slug>` | The public page of a tribe: its cover, description and the tribe content its members opened to the CLEARNET. |
| `/c/audios/<id>`, `/c/blog/<key>`, `/c/calendars/<id>`, `/c/campaigns/<id>`, `/c/documents/<id>`, `/c/emergencies/<id>`, `/c/events/<id>`, `/c/feed/<id>`, `/c/files/<id>`, `/c/housing/<id>`, `/c/images/<id>`, `/c/jobs/<id>`, `/c/maps/<id>`, `/c/market/<id>`, `/c/podcasts/<id>`, `/c/projects/<id>`, `/c/rooms/<id>`, `/c/school/<id>`, `/c/shops/<id>`, `/c/torrents/<id>`, `/c/videos/<id>`, `/c/wiki/<id>` | Detail pages, one per module. Links use a readable slug built from the title; the raw id works too. |
| `/c/blob/<blobId>` | Media files referenced by the pages above. |
| `/c/qr/<feedId>` | The QR code of an inhabitant's HUB. |
| `/c/sitemap.xml` | Every public page: the HUB, the public tribes, each inhabitant's HUB and each item. |
| `/c/rss/<module>` | An RSS feed of the latest CLEARNET items of one module (for example `/c/rss/blog`, `/c/rss/podcasts`). |

Only items placed on the CLEARNET are ever listed or served. Nothing else of the replicated log is exposed through the HUB.

## What an inhabitant has to do

Nothing on the PUB side. Every publishable item in Oasis is created as **OASIS** (visible to the inhabitants of Oasis only) or **CLEARNET** (also published on these public pages). The author chooses when creating the item and can switch it later from the item's own page. The choice travels with the feed, so every PUB that replicates the inhabitant applies it, and any replicating PUB can be used to share a link.

If `pub.example.org` replicates you, your podcast is reachable at:

```
https://pub.example.org/c/podcasts/<id>
```

Private, hidden, closed, invite-only, paid or tribe content can never be CLEARNET. An item that is later hidden, closed or made private leaves the CLEARNET, and it does not come back on its own when it is reopened: its author has to switch it again.

Modules with a CLEARNET choice: audios, videos, images, documents, files, torrents, bookmarks, blogs, feed, wiki, podcasts, market, shops, school, jobs, events, projects, rooms, maps, calendars, emergencies, campaigns and housing. Some of them only when the item is open to everyone: rooms (OPEN rooms), maps (open maps, with the markers of every contributor), calendars (open), emergencies (active), campaigns (open) and housing (public).

Content of a **public tribe** has its own reach level, chosen by its members: TRIBE, OASIS or CLEARNET. What they open to the CLEARNET is served on the tribe's page under `/c/tribe/…` and listed in the HUB with the public tribes. Private tribes never appear.

Public pages show what the author published, never what other inhabitants added to it: confirmations, signatures, requests, attendees, votes and comments stay inside Oasis.

## Exposing it on the web

Put a reverse proxy in front of the backend port and terminate TLS there.

Apache, when the HUB shares a domain with another site:

```
<VirtualHost *:443>
  ServerName example.org
  AllowEncodedSlashes NoDecode
  ProxyPreserveHost On
  ProxyPassMatch   "^/c(/.*)?$"  "http://127.0.0.1:3000/c$1" nocanon
  ProxyPassReverse /c        http://127.0.0.1:3000/c
  ProxyPass        /assets/  http://127.0.0.1:3000/assets/
  ProxyPassReverse /assets/  http://127.0.0.1:3000/assets/
  ProxyPass        /qr/      http://127.0.0.1:3000/qr/ nocanon
  ProxyPassReverse /qr/      http://127.0.0.1:3000/qr/
</VirtualHost>
```

nginx, on the same footing:

```
server {
  listen 443 ssl;
  server_name example.org;
  location = /c {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
  location ^~ /c/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
  location ^~ /assets/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
  location ^~ /qr/     { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
}
```

Match these paths exactly as written. A plain prefix such as `/c` or `/qr` also matches `/chats`, `/campaigns` or `/qr-action/…`, and would publish the private interface of the node. Never forward the whole backend port to the web, nor through a Tor hidden service.

Then launch the PUB allowing your domain (with the systemd unit of the [deploy guide](./deploy.md), add these options to its `ExecStart` line):

```
./oasis.sh server --port=3000 --allow-host=<your_domain.org>
```

## Notes

- A change made by an inhabitant shows up once the PUB has replicated it. On a large PUB a caching proxy in front of `/c` keeps it snappy.
- `/robots.txt` disallows crawlers on the whole site; `/c/sitemap.xml` is there for the search engines you point at the HUB yourself.
- Themes follow the PUB's own `oasis-config.json`; the example config in this folder is a good starting point.
