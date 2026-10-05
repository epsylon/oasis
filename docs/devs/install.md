# Developer Install

To deploy the development environment:

```shell
git clone https://code.03c8.net/KrakensLab/oasis
cd oasis
./install.sh
cd src/server
npm run dev
```

Once Oasis is started in dev mode, visit [http://localhost:3000](http://localhost:3000).

The backend restarts automatically (via [nodemon](https://nodemon.io)) whenever you save changes to `.js` or `.json` files in `src/backend/`, `src/models/`, `src/views/`, or `src/client/`. Static assets (`src/client/assets/`) do not trigger a restart. Page autoreload is not available because we avoid using JavaScript in the browser — reload the page manually to display your changes.

## Process model

An Oasis node runs in one Node process, `backend.js` (the AI service, when AI is on, runs apart):

- **`backend.js`** — Koa HTTP server that renders pages with hyperaxe and serves `http://localhost:3000`.
- **`SSB_server.js`** — the local Secure Scuttlebutt sbot on ssb-db2 (gossip, EBT, friends, blobs, conn, LAN, invites) plus `db2_legacy.js`, which gives the models the classic `createLogStream` / `messagesByType` / `backlinks` / `private` surface over db2. The backend runs it in the same process. It owns `~/.ssb`; a `flume/` log left by an older install is migrated into `db2/` once, before the sbot starts.

The sbot also listens on a local Unix socket (`~/.ssb/socket`), which is how the PUB admin commands (`./oasis.sh whoami`, `invite`, …) reach a running node. Only one process can hold a `~/.ssb` open at a time. Because the sbot lives inside the backend, every restart of the backend restarts it too; nodemon does not watch `src/server/`, so restart `npm run dev` by hand after changing it.

## npm scripts

Run these from `src/server/`:

- **`npm run dev`** — backend (and its sbot) under nodemon watch.
- **`npm run start:backend`** — the backend, without nodemon.
- **`npm run start:ssb`** — the sbot alone, without the web interface.
- **`npm start`** — `start:ssb` in the background, then `start:backend`.

For an ordinary run, use the launcher at the repo root instead: `./oasis.sh` (GUI, the default) or `./oasis.sh server` (PUB), which run `backend.js` directly; it also carries `./oasis.sh test` and the PUB admin commands.

## Tests

Unit and integration tests live under `test/` at the repo root, grouped per module in `test/mods/`.

Tests never use your `~/.ssb`: they run against a throwaway directory given in `ssb_path`. From `test/`:

```sh
# Every module
ssb_path=<an empty scratch dir> node run.js

# A single module
ssb_path=<an empty scratch dir> node run.js mods/tribes
ssb_path=<an empty scratch dir> node run.js mods/media/audios
```

`./oasis.sh test`, from the repo root, does the same for every module in a test directory of its own (`~/.ssb-oasis-test`, or the one in `OASIS_TEST_SSB`), recreated empty on every run, and writes a report to `test/results/`.

What the tests cover and how to add a new module suite are documented in [`test/README.md`](../../test/README.md). When you change a model, add or update its test under `test/mods/<module>/` so the change comes with a regression net.

## Useful commands while developing

- **`./install.sh`** — link the packages shipped in `src/base` and, if you want AI features, install its stack. Never `npm install` inside `src/server` (see [`base.md`](./base.md)).
- **`./oasis.sh test`** — run the whole test suite in its own test directory; from `test/`, `ssb_path=<an empty scratch dir> node run.js mods/<module>` runs one module.
- **`npm run dev`** (from `src/server`) — backend under nodemon, fetched through `npx` the first time.

## Directory map (cheat sheet)

- `src/server/` — SSB sbot entry, ssb-config, secret-stack plugin wiring, `db2_legacy.js`; its `node_modules` is a link to `src/base/node_modules`.
- `src/base/` — the runtime packages Oasis ships in the repository (see [`base.md`](./base.md)).
- `src/AI/` — the local LLM service (`ai_service.mjs` on port 4001), the context assembler and its own `package.json`; `src/AI/node_modules` is installed only when AI features are chosen.
- `src/backend/` — Koa HTTP entry (`backend.js`), middleware, blob handler, URL renderer, sanitizer.
- `src/models/` — per-module data access. Factory functions that receive `cooler` (and sometimes `tribeCrypto`, `tribesModel`) and return query/publish methods.
- `src/views/` — hyperaxe view functions. Pure HTML builders.
- `src/configs/` — the application's own configuration: `oasis-config.json` (module toggles, themes, language), `server-config.json` (sbot), `snh-invite-code.json`, and the `*.js` helpers. No personal data is kept here: everything an inhabitant accumulates lives under `~/.ssb/oasis/` (see [`inventory.md`](./inventory.md)), and `state-manager.js` is what resolves those paths.
- `src/client/assets/` — CSS, theme files, translations (one `oasis_<lang>.js` file per language), static images.
- `docs/` — documentation for inhabitants and developers (this folder). [`inventory.md`](./inventory.md) explains every file in `~/.ssb`.
- `test/` — test harness (`run.sh`, `run.js`, `seed.js`, `helpers/`) and per-module test suites in `mods/`.
- `scripts/` — build and admin helpers (`build-base.js`, `build-deb.sh`, `patch-node-modules.js`, `generate_shs.js`, and `oasis-pub.js` behind the PUB admin commands).
