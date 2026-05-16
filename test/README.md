# Oasis Tests

Per-module unit/integration tests covering all publishing actions across the network.

**Current status:** 40 modules / 149 tests passing.

Module tests live under `test/mods/` to keep them grouped and the top-level
`test/` directory clean (so `results/`, the runner, and the README are easy
to find).

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

  crypto/         primitives.test.js   Keyring, fingerprint, wrap/unwrap, AAD, invites, AES-GCM
  tribes/         basic.test.js        Create, list, invite, join, content
  sub-tribes/     basic.test.js        Hierarchy, invite scoping, cycles, tombstone cascade
                  content.test.js      Publishing inside sub-tribes (feed, event, votation)
                                       and parent vs sub key isolation
  media/
    audios/       audios.test.js       createAudio, opinion, list, delete
    videos/       videos.test.js       createVideo, opinion, delete
    images/       images.test.js       createImage (meme + non-meme), opinion
    documents/    documents.test.js    createDocument, opinion
    bookmarks/    bookmarks.test.js    createBookmark, opinion

  forum/          forum.test.js        createForum, addMessageToForum, voteContent
  transfers/      transfers.test.js    createTransfer, confirmTransferById, opinion
  votes/          votes.test.js        createVote, voteOnVote, opinion
  events/         events.test.js       createEvent, toggleAttendee (multi-user), delete
  tasks/          tasks.test.js        createTask, toggleAssignee, updateTaskStatus
  chats/          chats.test.js        createChat (standalone), close, delete
  pads/           pads.test.js         createPad, close, delete
  maps/           maps.test.js         createMap (SINGLE), delete
  torrents/       torrents.test.js     createTorrent, opinion, delete
  calendars/      calendars.test.js    createCalendar, addDate, listAll
  reports/        reports.test.js      createReport, confirmReportById (multi-user), delete
  market/         market.test.js       createItem (exchange/auction), addBidToAuction
  jobs/           jobs.test.js         createJob, subscribeToJob, deleteJob
  projects/       projects.test.js     createProject, followProject, pledgeToProject
  inhabitants/    inhabitants.test.js  listInhabitants
  parliament/     parliament.test.js   proposeCandidature, createProposal
  courts/         courts.test.js       openCase, nominateJudge
  opinions/       opinions.test.js     createVote (opinion), listOpinions
  shops/          shops.test.js        createShop, createProduct, update, delete
  pixelia/        pixelia.test.js      paintPixel, repaint (replace), cross-peer visibility
  pm/             pm.test.js           sendMessage, listAllPrivate (private box1)
  feed/           feed.test.js         createFeed, createRefeed, addComment, opinion
  tags/           tags.test.js         listTags (aggregate)
  search/         search.test.js      search() across modules
  trending/       trending.test.js     listTrending, createVote (opinion)
  agenda/         agenda.test.js       listAgenda
  cv/             cv.test.js           createCV
  favorites/      favorites.test.js    listAll
  banking/        banking.test.js      addAddress, getUserAddress, hasClaimedThisMonth,
                                       getUbiClaimHistory, listBanking, getBankingData,
                                       isPubNode, DEFAULT_RULES, listAddressesMerged
  activity/       activity.test.js     listFeed (member vs non-member visibility)
  stats/          stats.test.js        getStats (member sees own tribes, non-member doesn't)
  blockchain/     blockchain.test.js   listBlockchain (member decrypts tribe content)
```

Each module directory has its own `run.sh`:
```sh
bash test/<module>/run.sh
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

1. Create `test/<module>/<name>.test.js` following the pattern.
2. If the model isn't registered, add it to `FACTORIES` in `helpers/setup.js`. If it has unusual deps (services, cipher, etc.), add a branch in `requireOnce`.
3. Create `test/<module>/run.sh`:
   ```bash
   #!/usr/bin/env bash
   export NODE_NO_WARNINGS=1
   cd "$(dirname "$0")/../.."
   node test/run.js <module> "$@"
   ```
4. Add `<module>` to the `MODULES` array in `test/run.sh`.
5. `chmod +x test/<module>/run.sh && bash test/<module>/run.sh`.

## What's covered

- All major content publish actions: `createX`, `updateX`, `deleteX`
- Voting / opinion casting / attending / assigning
- Multi-user flows (A creates → B interacts)
- Privacy / opacity (member vs non-member visibility)
- Tribe cryptography (wrap/unwrap, AAD, invites, sub-tribes)
- Sub-tribe content publishing + parent/sub key isolation
- Banking address management + epoch / claim history (no RPC parts)

## Out of scope

These models are deliberately not tested as unit tests:

- **`legacy`** — broken crypto (audit found); disable in production.
- **`panicmode`** / **`exportmode`** — destructive operations.
- **`wallet`** — requires external `localhost:7474` RPC; tested via `banking` mock.
- **`logs`** / **`cipher`** — internal utilities, no publish actions.
- **`games`** — each minigame independent, gameplay-specific.
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
