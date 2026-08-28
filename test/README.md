# Oasis Tests

Per-module unit/integration tests covering all publishing actions across the network.

**Current status:** 83 test files / 1073 tests passing.

Module tests live under `test/mods/` to keep them grouped and the top-level
`test/` directory clean (so `results/`, the runner, and the README are easy
to find).

Some suites under `test/mods/` do not exercise a module — they guard rules that
must hold across the whole codebase:

- `conventions/` reads the views and fails when a shared rule is broken: a module
  writing its own comments section instead of reusing the shared one, a card
  rendering the spread button twice, a listing offering owner-only actions, a
  view using a `render*` helper it never imported, or a detail view that offers
  no content actions (spread / pin / report).
- `i18n/` keeps the translation files in sync (see below).
- `favorites/` also checks, for every `favKind` offered in the views, that the
  kind is wired end to end: resolver, module check, add/remove routes, store
  key, `kindConfig` and `kindOrder`. A kind that can be pinned but never listed
  back fails here.
- `gallery/` checks the image fields keep working across form round-trips.

## Quick start

From the `oasis/` directory:

```sh
# Run everything (subprocess per module + safe ~/.ssb isolation):
bash test/run.sh

# Skip the prompt:
bash test/run.sh --yes

# Run all in a single Node process (no isolation):
node test/run.js

# Run a single module:
node test/run.js mods/tribes
node test/run.js mods/media/audios

# Or use the per-module run.sh (no isolation, fast iteration):
bash test/mods/tribes/run.sh
bash test/mods/forum/run.sh
bash test/mods/media/audios/run.sh

# Run all + seed dummy content (so you can boot oasis after and inspect):
bash test/run.sh --seed

# Show stack traces on failure:
STACK=1 node test/run.js
```

## ~/.ssb isolation

`bash test/run.sh` (the aggregate runner) protects your real `~/.ssb`:

1. Asks for confirmation before touching anything.
2. Moves your current `~/.ssb` to `~/.ssb-bak-<timestamp>`.
3. Creates a fresh empty `~/.ssb` for the tests.
4. Runs all tests.
5. **On exit, the test `~/.ssb` is KEPT** so you can boot oasis and visually inspect what the tests produced.
6. Your original `~/.ssb` stays at the backup path for you to restore manually.

After tests, the runner prints exactly how to restore:
```
Test ~/.ssb left in place for visual inspection.
  test data:          /home/<you>/.ssb
  your original:      /home/<you>/.ssb-bak-<ts>
To boot oasis against the test data:  sh oasis.sh
To restore your original later:       rm -rf /home/<you>/.ssb && mv /home/<you>/.ssb-bak-<ts> /home/<you>/.ssb
```

Flags:
- `-y` / `--yes` — skip the confirmation prompt (CI use).
- `--restore` — restore your original `~/.ssb` automatically on exit (destroys test data).
- `--no-isolation` — run against the current `~/.ssb` (DANGEROUS, may LOCK-conflict).
- `clean-all` — delete every report in `test/results/`, restore your real `~/.ssb` from the latest backup, and remove all stale backups. Useful when you want to wipe traces of testing entirely.
- `-h` / `--help` — show usage.

If oasis is currently running, **STOP IT FIRST** (the LOCK on `~/.ssb` will conflict).

Examples:
```sh
bash test/run.sh                  # run, prompt, keep test ~/.ssb for inspection
bash test/run.sh --yes            # skip prompt
bash test/run.sh --yes --restore  # CI-friendly: run + auto-restore original
bash test/run.sh clean-all        # wipe reports + restore original ~/.ssb
bash test/run.sh clean-all --yes  # wipe without prompting
```

## Layout

```
test/
  run.sh                       Aggregate runner (subprocess per module + ~/.ssb isolation)
  run.js                       Single-process Node test runner
  README.md                    This file
  results/                     Generated reports (unit_test_<timestamp>.md)
  helpers/
    assert.js                  eq, ok, notOk, deepEq, throwsAsync, arrEq
    mock-ssb.js                In-memory SSB network (multi-peer + box1 + private msgs)
    setup.js                   makePeer / makeNetwork helpers per module

  mods/actions          actions.test.js
  mods/activity         activity.test.js
  mods/agenda           agenda.test.js
  mods/ai               ai_nav.test.js
  mods/banking          banking.test.js
  mods/blockchain       blockchain.test.js
  mods/blogs            blogs.test.js
  mods/calendars        calendars.test.js
  mods/chats            chats.test.js
  mods/cipher           cipher.test.js
  mods/comments         comments.test.js
  mods/conventions      conventions.test.js
  mods/courts           courts.test.js rules.test.js
  mods/crypto           invite-safety.test.js primitives.test.js tombstone-author.test.js
  mods/cv               cv.test.js
  mods/data             data.test.js
  mods/dev              dev.test.js
  mods/events           crypto.test.js events.test.js recurrence.test.js
  mods/favorites        favorites.test.js
  mods/feed             feed.test.js
  mods/fileshare        fileshare.test.js
  mods/forum            crypto.test.js forum.test.js
  mods/gallery          gallery.test.js
  mods/games            games.test.js
  mods/housing          housing.test.js
  mods/i18n             i18n.test.js
  mods/industry         industry.test.js
  mods/inhabitants      inhabitants.test.js
  mods/jobs             jobs.test.js
  mods/larp             larp.test.js
  mods/legacy           legacy.test.js
  mods/logs             logs.test.js
  mods/maps             maps.test.js
  mods/market           market.test.js
  mods/media            media.test.js
  mods/media/audios     audios.test.js
  mods/media/bookmarks  bookmarks.test.js
  mods/media/documents  documents.test.js
  mods/media/images     images.test.js
  mods/media/videos     videos.test.js
  mods/melody           melody.test.js
  mods/mentions         mentions.test.js
  mods/multiuser        multiuser.test.js
  mods/opinions         opinions.test.js
  mods/pads             pads.test.js
  mods/parliament       cycles.test.js parliament.test.js rules.test.js
  mods/pdf              content-pdf.test.js
  mods/pixelia          pixelia.test.js
  mods/pm               pm.test.js pm_refs.test.js
  mods/politicalbot     politicalbot.test.js
  mods/polls            polls.test.js
  mods/profile          qr.test.js
  mods/projects         projects.test.js
  mods/reports          reports.test.js
  mods/search           search.test.js
  mods/security         security.test.js
  mods/shops            shops.test.js
  mods/spread           spread.test.js
  mods/stats            stats.test.js
  mods/sub-tribes       basic.test.js content.test.js
  mods/tags             tags.test.js
  mods/tasks            tasks.test.js
  mods/torrents         torrents.test.js
  mods/transfers        transfers.test.js
  mods/trending         trending.test.js
  mods/tribes           basic.test.js
  mods/votes            rules.test.js votes.test.js
  mods/welcome          welcome.test.js
  mods/workflows        workflows.test.js
```

Most module directories have their own `run.sh` (48 of 71); for the rest use
`node test/run.js mods/<module>`:
```sh
bash test/mods/tribes/run.sh
node test/run.js mods/conventions
```

## Test pattern

```js
const { eq, ok, notOk, deepEq, throwsAsync } = require('../helpers/assert');
const { makeNetwork, makePeer } = require('../helpers/setup');

describe('<module>: <flow>', (t) => {
  t('A does X', async () => {
    const net = makeNetwork();
    const A = makePeer(net);
    A.setActor();
    const r = await A.use('<modelName>').<method>(...args);
    ok(r);
  });
});
```

For multi-peer scenarios:

```js
const A = makePeer(net); const B = makePeer(net);
A.setActor();
const r = await A.use('tribes').createTribe(...);
B.setActor();   // switch identity
await B.use('tribes').joinByInvite(code);
```

`A.use(modelName)` resolves the factory from `FACTORIES` in `helpers/setup.js` and instantiates with shared deps. Models are cached per peer.

## Mock SSB

`helpers/mock-ssb.js`:
- `makeNetwork()` — shared in-memory log (simulates SSB replication).
- `makeNode(network, keypair)` — peer with `publish`, `createLogStream` (live + old), `createUserStream`, `get`, `private.unbox/publish` (real `ssb-keys.box`/`unbox`), `links`, `messagesByType`, `whoami`, `blobs.has`, `replicate.upto`, `conn.hub`.
- `makeCooler(node)` — wraps node into the cooler `{open: async () => node}` interface.
- `generateKeypair()` — real ed25519 via `ssb-keys`.

When `content.recps` is set, `ssb-keys.box(content, recps)` is invoked and the message is published as a `.box` string. `private.unbox` decrypts using the receiver's keypair.

## Generated report

Every `bash test/run.sh` generates `test/results/unit_test_<YYYY-MM-DD_HH-MM-SS>.md` with:
1. **Summary** — tests passed / total, modules passed / total.
2. **✅ Passing modules** — every module with timing and individual test names.
3. **❌ Failing modules** (only if any) — full output including stack traces.

## Adding a new module

1. Create `test/mods/<module>/<name>.test.js` following the pattern.
2. If the model isn't registered, add it to `FACTORIES` in `helpers/setup.js`. If it has unusual deps (services, cipher, etc.), add a branch in `requireOnce`.
3. Optionally create `test/mods/<module>/run.sh` for fast iteration:
   ```bash
   #!/usr/bin/env bash
   export NODE_NO_WARNINGS=1
   cd "$(dirname "$0")/../.."
   node test/run.js mods/<module> "$@"
   ```
4. Nothing to register: `test/run.sh` discovers every directory under
   `test/mods/` that contains a `*.test.js`. The `MODULES` array at the top only
   fixes the order of the first ones; anything not listed is appended
   automatically.
5. `chmod +x test/mods/<module>/run.sh && bash test/mods/<module>/run.sh`.

## What's covered

- All major content publish actions: `createX`, `updateX`, `deleteX`
- Voting / opinion casting / attending / assigning
- Multi-user flows (A creates → B interacts)
- Privacy / opacity (member vs non-member visibility)
- Tribe cryptography (wrap/unwrap, AAD, invites, sub-tribes)
- Sub-tribe content publishing + parent/sub key isolation
- Banking address management + epoch / claim history (no RPC parts)
- i18n translation-key consistency across all languages (`mods/i18n`)

## i18n consistency (`mods/i18n`)

`mods/i18n/i18n.test.js` validates the translation files in
`src/client/assets/translations/` (`oasis_<lang>.js`). The language list is
discovered dynamically from those files, so adding or removing a language needs
no change to the test. English is the reference; the goal is that **every file
has the exact same set of keys** — only the values (the translations) differ.
It checks:

1. **Each language contains every English key** — fails listing the missing keys
   per language (e.g. `fr is missing 3 key(s): …`).
2. **English has no gaps** — English is not missing any key that exists in another
   language, so every file shares an identical key set.
3. **No undefined references** — every `i18n.<key>` used in `src/views/**` is
   defined in English. This catches chips/labels that silently fall back to
   hardcoded English text (e.g. a `PRIVATE` chip whose `privacyPrivate` key was
   never added to the translations).

Run it on its own with `node run.js mods/i18n`. On failure it prints the exact
keys involved, so adding a label means: add its key to **every** language file.

## Out of scope

These models are deliberately not tested as unit tests:

- **`legacy`** — broken crypto (audit found); disable in production.
- **`panicmode`** / **`exportmode`** — destructive operations.
- **`wallet`** — requires external `localhost:7474` RPC; tested via `banking` mock.
- **`tribes_content`** — covered by `tribes` and `sub-tribes` test suites.

## Bugs caught by these tests

During development, these tests caught real bugs that have been fixed:

1. `events_model.js` captured `userId` at module load (broke multi-user tests). Now reads per-call.
2. `stats_model.getFolderSize` had no try/catch (crashed on clean `~/.ssb`). Wrapped.
3. `activity_model.isAllowedTribeActivity` excluded `isAnonymous=true` even for members. Now allows when `_decrypted=true`.
4. `blockchain_model` eagerly required `SSB_server.js` (started ssb-server on every test). Switched to `ssb_config`.
5. Public tribes wrapped same as private (invisible to non-members). Fixed with dual format (plaintext public, wrapped private).
6. `joinByInvite` returned tip ID instead of root ID. Fixed.
7. Invite tombstone only respected if authored by invite-author (couldn't be invalidated by joiner). Now any author's tombstone invalidates.
8. `backend.js` reference-before-init on `blockchainModelInit` (regression from refactor). Fixed.

The recommended workflow for any future model change is: write a test that reproduces the issue first, fix the model until it passes, keep both. The test becomes a regression net.

## CI

Add a job that runs `bash test/run.sh --yes --restore` from the `oasis/` directory on Linux + Node ≥20. The `--restore` flag is appropriate for CI (no need to inspect test data visually).
