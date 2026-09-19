# Developer Install

To deploy the development environment:

```shell
git clone https://code.03c8.net/KrakensLab/oasis
cd oasis
bash install.sh
cd src/server
npm run dev
```

Once Oasis is started in dev mode, visit [http://localhost:3000](http://localhost:3000).

The backend restarts automatically (via [nodemon](https://nodemon.io)) whenever you save changes to `.js` or `.json` files in `src/backend/`, `src/models/`, `src/views/`, or `src/client/`. Static assets (`src/client/assets/`) do not trigger a restart. Page autoreload is not available because we avoid using JavaScript in the browser — reload the page manually to display your changes.

## Two-process architecture

Oasis runs as two cooperating Node processes:

- **`SSB_server.js`** — boots the local Secure Scuttlebutt sbot (gossip, EBT, friends, blobs, LAN, search, box, query, tangle, links, backlinks). Owns `~/.ssb`.
- **`backend.js`** — Koa HTTP server that connects to the sbot through `ssb-client` and renders pages with hyperaxe. Serves `http://localhost:3000`.

The backend talks to the sbot over a local Unix socket. If you only restart the backend (the default in `npm run dev`), the sbot keeps running. If you change anything under `src/server/` or anything that holds an SSB handle inside a model, restart the sbot too (kill the `SSB_server.js` process and re-run `npm start`).

## npm scripts

Run these from `src/server/`:

- **`npm start`** — boots the SSB sbot in the background, waits ~10 s, then starts the HTTP backend. Use this for an end-to-end local run.
- **`npm run start:ssb`** — start only the SSB sbot.
- **`npm run start:backend`** — start only the HTTP backend (assumes sbot is already running).
- **`npm run dev`** — backend under nodemon watch (auto-restart on file change). Sbot is **not** watched.

The launcher script at the repo root (`oasis.sh`) wraps these and detects whether to start in `server`, `pub`, or `gui` mode.

## Tests

Unit and integration tests live under `test/` at the repo root, grouped per module in `test/mods/`. Coverage spans **40+ modules** including tribes, feed, banking, parliament, courts, jobs, market, shops, media (audio/video/image/document/torrent), maps, pads, calendars, events, tasks, votes, transfers, reports, projects, opinions, activity, AI, CV, LARP, melody, and more.

Run the full suite from the `oasis/` directory:

```sh
# All modules, each in a subprocess with safe ~/.ssb isolation
bash test/run.sh

# Same, but skip the confirmation prompt
bash test/run.sh --yes

# All modules in a single Node process (no isolation, faster but mixes state)
node test/run.js

# A single module
node test/run.js mods/tribes
node test/run.js mods/media/audios

# Per-module shortcut (no isolation, fast iteration)
bash test/mods/<module>/run.sh
```

`test/run.sh` moves your live `~/.ssb` to a timestamped backup (`~/.ssb-bak-YYYYMMDD_HHMMSS`) before the run and creates a fresh empty `~/.ssb` for the tests. **Stop any running Oasis instance first** — only one process can hold `~/.ssb` open at a time. Pass `--restore` to restore the original `~/.ssb` after the run finishes (CI uses this).

What the tests cover, how to add a new module suite, and a record of bugs the test harness has caught are documented in [`test/README.md`](../../test/README.md). When you change a model, add or update its test under `test/mods/<module>/` so the change comes with a regression net.

## Useful commands while developing

- **`npm install`** — install / refresh dependencies.
- **`npm test`** — run automated tests (calls into the `test/` harness).
- **`npm run fix`** — auto-fix formatting and lint issues (also runs as a pre-commit hook).

## Directory map (cheat sheet)

- `src/server/` — SSB sbot entry, ssb-config, secret-stack plugin wiring, vendored `packages/ssb-server`.
- `src/backend/` — Koa HTTP entry (`backend.js`), middleware, blob handler, URL renderer, sanitizer.
- `src/models/` — per-module data access. Factory functions that receive `cooler` (and sometimes `tribeCrypto`, `tribesModel`) and return query/publish methods.
- `src/views/` — hyperaxe view functions. Pure HTML builders.
- `src/AI/` — local LLM service (`ai_service.mjs` on port 4001) and context assembler.
- `src/configs/` — the application's own configuration: `oasis-config.json` (module toggles, themes, language), `server-config.json` (sbot), `snh-invite-code.json`, and the `*.js` helpers. No user data is kept here: everything a person accumulates lives under `~/.ssb/oasis/` (see [`inventory.md`](./inventory.md)), and `state-manager.js` is what resolves those paths.
- `src/client/assets/` — CSS, theme files, translations (11 languages), static images.
- `docs/` — user and developer documentation (this folder). [`inventory.md`](./inventory.md) explains every file in `~/.ssb`.
- `test/` — test harness (`run.sh`, `run.js`, `seed.js`, `helpers/`) and per-module test suites in `mods/`.
- `scripts/` — build helpers (`build-deb.sh`, node_modules patcher).

## Pre-commit checks

The pre-commit hook runs `cspell` and `prettier`. See [`contributing.md`](./contributing.md) for what to do when a check fails (typos go in `.cspell.json`; formatting via `npm run fix`).
