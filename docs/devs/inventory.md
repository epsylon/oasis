# What lives in `~/.ssb`

Oasis keeps everything on your own device, in a single folder. This page says what each thing in it is for, so you can look inside without guessing.

The folder is `$HOME/.ssb`. It moves with `HOME`, so the Debian package — which runs as the `oasis` user — uses `/var/lib/oasis/.ssb`. It can also be pointed elsewhere with the `ssb_path` setting of the sbot or with the `OASIS_STATE_DIR` environment variable.

It has two halves:

- The **Secure Scuttlebutt protocol** owns the root: your identity, the log, the blobs, who you have met. Any SSB client would recognise it.
- **Oasis** owns `~/.ssb/oasis/`: the settings and state of our own modules. Nothing outside that subfolder belongs to Oasis.

Most of these files are created the first time something needs them. A missing file is normal, not a fault: it only means you have not used that part of Oasis yet.

## The protocol side

| Path | What it is |
| --- | --- |
| `secret` | Your identity — the ed25519 keypair your feed is signed with. Whoever holds it *is* you, and nobody can reissue it. Back it up (Tools › Backup), never share it. |
| `secret.bak-DATE` | The identity that was here before you imported another one from Backup. Kept so an import can be undone. |
| `db2/` | The log itself and its indexes. See the table below. |
| `flume/` | Only on a device whose log was migrated into `db2/` from the previous log format. What remains is a single small `flume/log.offset` that is not a log but a guard: software that only knows that format refuses to start, instead of starting with an empty log and forking your feed. Keep it. |
| `blobs/` | The blob store: every image, audio, video and attachment, filed by its hash. |
| `blobs_push/` | A small database tracking which blobs still have to be handed to which peer. |
| `ebt/` | Replication bookkeeping: how far along each peer is in each feed, so a reconnection resumes instead of starting over. |
| `conn.json` | The address book of peers: where each one was reachable, when it was last seen and how the connection went. |
| `conn.json~` | The previous copy of the above, left by the atomic write. |
| `gossip.json` | The pubs this device uses — the ones you joined or added — in the classic format SSB clients know. Oasis keeps it; the connections themselves are handled from `conn.json`. |
| `manifest.json` | The list of RPC methods the sbot exposes, written at every start so clients know what they may call. |
| `socket` | The local unix socket. This is how the Oasis web backend talks to the sbot; nothing travels over the network here. |
| `node_modules/` | Not used by Oasis, which loads only its own plugins from the application folder. It can be removed if present. |
| `invites/` | The invite codes this node has issued. Only exists on a node running in PUB mode. |
| `config` | An optional JSON file to override the sbot configuration. Oasis never writes it; it is there because SSB reads it if you create it. |

### Inside `db2/`

`log.bipf` is the real thing: every message, yours and everyone's you replicate, in the order they arrived. Everything else in the folder is an index derived from it, and can be deleted — the next start rebuilds it, which on a large log takes a while (Settings offers the same as *Rebuild indexes*). Deleting `log.bipf` loses whatever the network no longer holds for you.

| Path | What it indexes |
| --- | --- |
| `log.bipf` | The append-only log. The single file that matters. |
| `jit/` | Small bitmaps built on demand, one per question the interface asks often: messages of a type, messages by an author, which ones are encrypted and which ones you could open. |
| `indexes/base`, `indexes/keys` | The latest sequence known for each feed, and messages by their id, for fetching one message directly. |
| `indexes/oasisLinks` | Which message points at which: replies, votes, mentions, tombstones. It is what "what links here", comment counts and the vote tallies read. |
| `indexes/contacts` | The follow and block graph — who follows whom, and how many hops away each feed is. |
| `indexes/private`, `encrypted.index`, `decrypted.index` | Which messages are boxed and which of them this identity can open. |

## The Oasis side: `~/.ssb/oasis/`

Everything Oasis itself stores. It is all plain JSON except the keyrings, it is all yours, and it never leaves the device on its own.

| Path | What it holds |
| --- | --- |
| `oasis-config.json` | The node's settings: modules on or off, theme, language, home page, phone and privacy choices, and the ECOin wallet connection. Created on first start and readable only by your user, because it can hold the wallet's RPC password. |
| `oasis-server-config.json` | This node's own sbot choices (replication hops, and on a PUB its whole server config), merged over the default in the application folder. Only exists once something differs from the default. |
| `keys/tribes-keys.json` | The symmetric keys of the tribes you belong to — without them, tribe content cannot be read. |
| `keys/chats-keys.json` | The same, for private chats. |
| `keys/pads-keys.json` | The same, for pads. |
| `keys/rooms-keys.json` | The same, for invite-only rooms. |
| `keys/maps-keys.json` | The same, for private maps. |
| `keys/calendars-keys.json` | The same, for private calendars. |
| `keys/events-keys.json` | The same, for private events. |
| `keys/school-keys.json` | The same, for school courses. |
| `keys/forum-keys.json` | The same, for private forums. |
| `keys/*.pre-realias` | A copy of a keyring kept before its format was converted. Safe to keep. |
| `keys/<feed id>.asc` | A GPG **public** key published on a profile — yours, or one imported from someone else to check their signatures. Never a private key. |
| `banking/wallet-addresses.json` | The ECOin address known for each inhabitant, yours included. |
| `banking/banking-address-book.json` | The addresses you saved by hand, with the label you gave them. |
| `banking/banking-allocations.json` | The UBI payments this node has committed to, with their state and, once paid, the transaction id. Only fills up on a PUB. |
| `banking/banking-epochs.json` | The monthly UBI epochs already closed by this node, with what was distributed in each. Only on a PUB. |
| `banking/banking-eco-history.json` | Samples of the ECOin value, supply and inflation over time. This is what the Exchange charts draw. |
| `banking/banking-funds-history.json` | Samples of your own ECOin wallet balance over time. This is what the funds chart of Banking › Overview draws. |
| `banking/banking-ubi-paid.json` | On a PUB, the ledger of UBI already paid: one entry per inhabitant and month, with its transaction. It is what stops the same month being paid twice. |
| `banking-rebalance-pending.json` | On a PUB, the rebalance to another PUB that was handed to the wallet but not yet confirmed. Written at the root of `~/.ssb/oasis/`. |
| `clearnet-since.json` | A marker that this identity has published, on its profile, the moment from which its CLEARNET choices apply; it is written once. Written at the root of `~/.ssb/oasis/`. |
| `banking/banking-ubi-notice.json` | Which UBI payments BankingBot has already told you about, so it does not repeat itself. |
| `banking/banking-confirm-notice.json` | The same, for contracts waiting for your confirmation. |
| `content/content_favorites.json` | What you marked as a favourite, by content type. |
| `content/follow_state.json` | Follow requests pending and accepted, with the moment of the last one. |
| `content/agenda-config.json` | How you arranged your Agenda. |
| `content/blob-access.json` | When each downloaded blob was last opened. The media cache (Settings → Media cache) uses it to decide what to drop first once the quota is exceeded. |
| `content/snapshot.oasissn`, `content/snapshot-recent.oasissn` | Only on a PUB: the copies of its log (every feed whole, and the recently active feeds; private messages as ciphertext) that newcomers receive over the SSB connection when they join, so they can start right away. Rebuilt periodically. |
| `ai/AI-history.json` | Your conversation with the AI. It stays here; it is never published. |
| `ai/AI-vectors.json` | Embeddings of the approved AI exchanges of the network, so 42 can pick the ones related to a question without recomputing them. Rebuilt on demand. |
| `ai/AI-search-vectors.json` | Embeddings of public content titles and descriptions, used by the semantic part of Search. Rebuilt on demand. |
| `multiverse/fediverse-accounts.json` | The Mastodon, Telegram and PeerTube accounts linked to Multiverse, including their session tokens. Treat it like a password file. |
| `backup/oasis-backup.json` | The state of the last backup or restore, so the page can report progress after a reload. |
| `flags/oasis-first-contact` | The identity that opened Oasis on this device for the first time, when, and which steps of the welcome guide are done. Its presence is what stops the guide from greeting you again. |
| `flags/oasis-inbox-read` | Which inbox messages you marked as read, so the inbox counter only counts the rest. |
| `flags/oasis-inbox-archived` | Which inbox messages you archived. They leave the inbox lists and the counter, and come back with Unarchive. |
| `flags/oasis-mentions-seen` | Which mentions you marked as read (their ids only), so the mentions counter only counts the rest. |
| `flags/oasis-political-seen` | Which governance announcements have already been sent to you, so none is sent twice. |
| `peers/gossip_unfollowed.json` | The pubs you stopped following, so they are not offered again. |
| `peers/peer-health.json` | Since when each pub or peer has been failing to connect. A pub that keeps failing for long enough is shown as unreachable and hidden from the peer lists; as soon as it connects again it is removed from here. |
| `peers/lan-peers.json` | The inhabitants this node has met on the local network. With the Wish set to Only LAN, you see content from them and from yourself. |
| `phone/phone-history.json` | Your call history: who, when, direction, result and duration. It stays on this device. |
| `rooms/` | The recordings you made in rooms, as audio files. They stay on this device and are not part of a backup. |
| `phone/phone-seen.json` | Which missed calls and audio records you have already seen or played, so the PHONE counter only counts the rest. |

A file with a `.before-restore` suffix next to any of these is the copy a restore kept of whatever was there before it wrote the one from the backup.

## What a backup covers

**Tools › Backup › FULL BACKUP** packs the log, the blobs and `~/.ssb/oasis/` — keyrings included, but not the settings files nor the room recordings — into one encrypted file, and a restore puts them back where they belong. The identity is *not* in there: `secret` travels on its own, through **RECOVERY** or **EXPORT KEYS**, and must be restored *after* the backup. The order matters and [the backup guide](../backups/README.md) explains why.

## What is sensitive

`secret` is the identity itself. `oasis/keys/` opens every private space you are in. `oasis/multiverse/fediverse-accounts.json` carries live session tokens for other networks. `oasis/banking/` says what you hold. None of it needs to leave the device, and none of it is published by Oasis: if you copy the folder somewhere, you are the one deciding who gets in.
