# Oasis Tests

Per-module unit/integration tests covering all publishing actions across the network.

Module tests live under `test/mods/` to keep them grouped and the top-level
`test/` directory clean (so `results/`, the runner, and the README are easy
to find).

Some suites under `test/mods/` do not exercise a module — they guard rules that
must hold across the whole codebase:

- `conventions/` reads the views and fails when a shared UI rule is broken.
- `i18n/` keeps the translation files in sync (see below).
- `banking/` also covers the rules of the ECOin economy (UBI, karma, taxes, PUB
  discovery, address book), not only the API.
- `favorites/` checks that every `favKind` offered in the views is wired end to end.
- `gallery/` checks the image fields keep working across form round-trips.
- `security/` guards content spoofing across modules (`security.test.js`) and
  the HTTP layer (`request-guards.test.js`): message ids from forms, local-only
  redirects, CSRF referer checks, read-only HUB, public mode and the CSP.

## Quick start

Tests never use your `~/.ssb`: they run against a throwaway directory given
in `ssb_path`. From `test/`:

```sh
# Run every module:
ssb_path=<an empty scratch dir> node run.js

# Run a single module:
ssb_path=<an empty scratch dir> node run.js mods/tribes
ssb_path=<an empty scratch dir> node run.js mods/media/audios

# Show stack traces on failure:
STACK=1 ssb_path=<an empty scratch dir> node run.js
```

From the `oasis/` directory, `./oasis.sh test` (which runs `test/run.sh`) does
the same for every module, each in its own Node process, and writes a report
to `test/results/`.

## The test directory

`./oasis.sh test` never touches your `~/.ssb`. It runs the suites against a
test directory of its own, `~/.ssb-oasis-test` (or the one in
`OASIS_TEST_SSB`), which it empties and recreates on every run, and it refuses
to run if that directory is `~/.ssb` itself.

Options:
- `--seed` — after all tests pass, fill the test directory with dummy content
  through the real SSB models (every content module, school, games and
  banking/UBI included).
- `dummy` — skip the tests and only fill a fresh test directory with dummy
  content.
- `clean-all` — delete the test reports and the test directory, then exit.
- `-h` / `--help` — show usage.

## Layout

```
test/
  run.sh                       Aggregate runner (subprocess per module, own test directory)
  run.js                       Single-process Node test runner
  seed.js                      Dummy content for the test directory (--seed, dummy)
  README.md                    This file
  results/                     Generated reports (unit_test_<timestamp>.md)
  helpers/
    assert.js                  eq, ok, notOk, deepEq, throwsAsync, arrEq
    mock-ssb.js                In-memory SSB network (multi-peer + box1 + private msgs)
    setup.js                   makePeer / makeNetwork helpers per module

  mods/actions             actions.test.js
  mods/activity            activity.test.js
  mods/agenda              agenda.test.js
  mods/ai                  ai_nav.test.js ai_assistant.test.js
  mods/backup              backup.test.js
  mods/banking             banking.test.js
  mods/blobcache           blobcache.test.js
  mods/blockchain          blockchain.test.js
  mods/blogs               blogs.test.js
  mods/calendars           calendars.test.js
  mods/campaigns           campaigns.test.js
  mods/chats               chats.test.js
  mods/cipher              cipher.test.js
  mods/clearnet            clearnet.test.js hub.test.js
  mods/comments            comments.test.js
  mods/conventions         conventions.test.js
  mods/courts              courts.test.js rules.test.js
  mods/crypto              invite-safety.test.js primitives.test.js tombstone-author.test.js
  mods/cv                  cv.test.js
  mods/data                data.test.js
  mods/db2                 db2.test.js
  mods/dev                 dev.test.js
  mods/emergencies         emergencies.test.js
  mods/events              crypto.test.js events.test.js recurrence.test.js
  mods/favorites           favorites.test.js
  mods/feed                feed.test.js
  mods/files               encryption.test.js files.test.js
  mods/fileshare           fileshare.test.js
  mods/forum               crypto.test.js forum.test.js
  mods/gallery             gallery.test.js
  mods/games               games.test.js
  mods/housing             housing.test.js
  mods/i18n                i18n.test.js
  mods/industry            industry.test.js
  mods/inhabitants         inhabitants.test.js
  mods/jobs                jobs.test.js
  mods/larp                larp.test.js
  mods/logistics           logistics.test.js
  mods/logs                logs.test.js
  mods/mailing             mailing.test.js
  mods/maps                maps.test.js
  mods/market              market.test.js
  mods/media               media.test.js
  mods/media/audios        audios.test.js
  mods/media/bookmarks     bookmarks.test.js
  mods/media/documents     documents.test.js
  mods/media/images        images.test.js
  mods/media/videos        videos.test.js
  mods/melody              melody.test.js
  mods/mentions            mentions.test.js
  mods/multiuser           multiuser.test.js
  mods/opinions            opinions.test.js
  mods/pads                pads.test.js
  mods/parliament          cycles.test.js parliament.test.js rules.test.js
  mods/pdf                 content-pdf.test.js
  mods/peers               peers.test.js
  mods/phone               phone.test.js
  mods/pixelia             pixelia.test.js
  mods/pm                  pm.test.js pm_refs.test.js
  mods/podcasts            podcasts.test.js
  mods/politicalbot        politicalbot.test.js
  mods/polls               polls.test.js
  mods/profile             qr.test.js
  mods/projects            projects.test.js
  mods/reports             reports.test.js
  mods/rooms               rooms.test.js
  mods/school              school.test.js
  mods/search              search.test.js
  mods/security            security.test.js request-guards.test.js
  mods/shops               shops.test.js
  mods/spread              spread.test.js
  mods/stats               stats.test.js
  mods/sub-tribes          basic.test.js content.test.js
  mods/tags                tags.test.js
  mods/tasks               tasks.test.js
  mods/torrents            downloads.test.js torrents.test.js
  mods/transfers           transfers.test.js
  mods/trending            trending.test.js
  mods/tribes              basic.test.js
  mods/views               views.test.js
  mods/votes               rules.test.js votes.test.js
  mods/welcome             welcome.test.js
  mods/wiki                wiki.test.js
  mods/workflows           workflows.test.js
```

Run any of them on its own from `test/`, e.g.
`ssb_path=<an empty scratch dir> node run.js mods/conventions`.

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

Every `./oasis.sh test` generates `test/results/unit_test_<YYYY-MM-DD_HH-MM-SS>.md` with:
1. **Summary** — tests passed / total, modules passed / total.
2. **✅ Passing modules** — every module with timing and individual test names.
3. **❌ Failing modules** (only if any) — full output including stack traces.

## Adding a new module

1. Create `test/mods/<module>/<name>.test.js` following the pattern.
2. If the model isn't registered, add it to `FACTORIES` in `helpers/setup.js`. If it has unusual deps (services, cipher, etc.), add a branch in `requireOnce`.
3. Nothing to register: `test/run.sh` discovers every directory under
   `test/mods/` that contains a `*.test.js`. The `MODULES` array at the top only
   fixes the order of the first ones; anything not listed is appended
   automatically.
4. Run it from `test/`: `ssb_path=<an empty scratch dir> node run.js mods/<module>`.

## What's covered

- All major content publish actions: `createX`, `updateX`, `deleteX`
- Voting / opinion casting / attending / assigning
- Flows between several inhabitants (A creates → B interacts)
- Privacy / opacity (member vs non-member visibility)
- Tribe cryptography (wrap/unwrap, AAD, invites, sub-tribes)
- Sub-tribe content publishing + parent/sub key isolation
- Banking address management + epoch / claim history (no RPC parts)
- i18n translation-key consistency across all languages (`mods/i18n`)
- Wiki pages (versions, restore, wikilinks, tribe scoping), emergencies (severity, confirmations, updates), mailing lists (open/closed, subscription on write, threads), logistics (bookings, ratings, opinions), podcasts (channels, episodes, views, opinions), campaigns (signatures, goal, updates, opinions, Parliament proposal)
- Backup: encrypted keys export/import, full `.oasisbk` round trip and restore
- Clearnet HUB: public listing, filters, search and read-only guarantee (`mods/clearnet`)
- Every module view boots from a cold start and detail views never leak content chips on an empty census (`mods/views`)
- Phone (calls between nodes, through a pub, joint calls, private audio messages, numbers), Rooms (meeting on a pub, refusals) and Peers (failing pubs, pausing the network)

## i18n consistency (`mods/i18n`)

`mods/i18n/i18n.test.js` validates the translation files in
`src/client/assets/translations/` (`oasis_<lang>.js`). The language list is
discovered dynamically from those files, so adding or removing a language needs
no change to the test. English is the reference; the goal is that **every file
has the exact same set of keys** — only the values (the translations) differ.
It checks:

1. **Each language contains every English key** — fails listing the missing keys
   per language (e.g. `fr is missing N key(s): …`).
2. **English has no gaps** — English is not missing any key that exists in another
   language, so every file shares an identical key set.
3. **No undefined references** — every `i18n.<key>` used in `src/views/**` is
   defined in English. This catches chips/labels that silently fall back to
   hardcoded English text (e.g. a `PRIVATE` chip whose `privacyPrivate` key was
   never added to the translations).

Run it on its own from `test/` with
`ssb_path=<an empty scratch dir> node run.js mods/i18n`. On failure it prints
the exact keys involved, so adding a label means: add its key to **every**
language file.

## Out of scope

These models are deliberately not tested as unit tests:

- **`panicmode`** / **`exportmode`** — destructive operations.
- **`wallet`** — requires external `localhost:7474` RPC; tested via `banking` mock.
- **`tribes_content`** — covered by `tribes` and `sub-tribes` test suites.
