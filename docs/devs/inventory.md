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
| `flume/` | The log itself and its indexes. See the table below. |
| `blobs/` | The blob store: every image, audio, video and attachment, filed by its hash. |
| `blobs_push/` | A small database tracking which blobs still have to be handed to which peer. |
| `ebt/` | Replication bookkeeping: how far along each peer is in each feed, so a reconnection resumes instead of starting over. |
| `conn.json` | The address book of peers: where each one was reachable, when it was last seen and how the connection went. |
| `conn.json~` | The previous copy of the above, left by the atomic write. |
| `gossip.json` | The classic peer list — the pubs and LAN peers this device knows. |
| `manifest.json` | The list of RPC methods the sbot exposes, written at every start so clients know what they may call. |
| `socket` | The local unix socket. This is how the Oasis web backend talks to the sbot; nothing travels over the network here. |
| `node_modules/` | Where third-party sbot plugins would be installed. Oasis loads its own plugins from the application folder, so this stays empty unless you install one by hand. |
| `invites/` | The invite codes this node has issued. Only exists on a node running in PUB mode. |
| `config` | An optional JSON file to override the sbot configuration. Oasis never writes it; it is there because SSB reads it if you create it. |

### Inside `flume/`

`log.offset` is the real thing: every message, yours and everyone's you replicate, in the order they arrived. Everything else in the folder is an index derived from it, and can be deleted — the next start rebuilds it, which on a large log takes a while. Deleting `log.offset` loses whatever the network no longer holds for you.

| Path | What it indexes |
| --- | --- |
| `log.offset` | The append-only log. The single file that matters. |
| `clock`, `last.json` | The latest sequence number known for each feed. |
| `feed` | Messages by author and sequence — how a profile's history is read. |
| `keys` | Messages by their id, for fetching one message directly. |
| `time` | Messages by the moment they arrived. |
| `links`, `links2` | Which message points at which. |
| `backlinks-<id>`, `private-<id>` | One pair per identity that has run on this device (`<id>` is the start of its feed id): replies pointing back at a message, and private messages this identity can open. |
| `contacts2.json` | The follow and block graph — who follows whom, and how many hops away each feed is. |
| `query`, `search`, `meme` | Indexes behind the query API, full-text search and memes. |

## The Oasis side: `~/.ssb/oasis/`

Everything Oasis itself stores. It is all plain JSON except the keyrings, it is all yours, and it never leaves the device on its own.

| Path | What it holds |
| --- | --- |
| `keys/tribes-keys.json` | The symmetric keys of the tribes you belong to — without them, tribe content cannot be read. |
| `keys/chats-keys.json` | The same, for private chats. |
| `keys/pads-keys.json` | The same, for pads. |
| `keys/maps-keys.json` | The same, for private maps. |
| `keys/calendars-keys.json` | The same, for private calendars. |
| `keys/events-keys.json` | The same, for private events. |
| `keys/school-keys.json` | The same, for school courses. |
| `keys/forum-keys.json` | The same, for private forums. |
| `keys/*.pre-realias` | A copy of a keyring kept before an earlier format change. Safe to keep. |
| `keys/<feed id>.asc` | A GPG **public** key published on a profile — yours, or one imported from someone else to check their signatures. Never a private key. |
| `banking/wallet-addresses.json` | The ECOin address known for each inhabitant, yours included. |
| `banking/banking-address-book.json` | The addresses you saved by hand, with the label you gave them. |
| `banking/banking-allocations.json` | The UBI payments this node has committed to, with their state and, once paid, the transaction id. Only fills up on a PUB. |
| `banking/banking-epochs.json` | The monthly UBI epochs already closed by this node, with what was distributed in each. Only on a PUB. |
| `banking/banking-eco-history.json` | Samples of the ECOin value, supply and inflation over time. This is what the Exchange charts draw. |
| `banking/banking-ubi-paid.json` | On a PUB, the ledger of UBI already paid: one entry per inhabitant and month, with its transaction. It is what stops the same month being paid twice. |
| `banking/banking-ubi-notice.json` | Which UBI payments BankingBot has already told you about, so it does not repeat itself. |
| `banking/banking-confirm-notice.json` | The same, for contracts waiting for your confirmation. |
| `content/content_favorites.json` | What you marked as a favourite, by content type. |
| `content/follow_state.json` | Follow requests pending and accepted, with the moment of the last one. |
| `content/agenda-config.json` | How you arranged your Agenda. |
| `ai/AI-history.json` | Your conversation with the AI. It stays here; it is never published. |
| `multiverse/fediverse-accounts.json` | The Mastodon and Telegram accounts linked to Multiverse, including their session tokens. Treat it like a password file. |
| `backup/oasis-backup.json` | The state of the last backup or restore, so the page can report progress after a reload. |
| `flags/oasis-first-contact` | The identity that opened Oasis on this device for the first time, when, and which steps of the welcome guide are done. Its presence is what stops the guide from greeting you again. |
| `flags/oasis-mentions-seen` | When you last looked at your mentions, so only the new ones are highlighted. |
| `flags/oasis-political-seen` | Which governance announcements have already been sent to you, so none is sent twice. |
| `peers/gossip_unfollowed.json` | The pubs you stopped following, so they are not offered again. |

A file with a `.before-restore` suffix next to any of these is the copy a restore kept of whatever was there before it wrote the one from the backup.

## What a backup covers

**Tools › Backup › FULL BACKUP** packs the log, the blobs and the whole of `~/.ssb/oasis/` — keyrings included — into one encrypted file, and a restore puts them back where they belong. The identity is *not* in there: `secret` travels on its own, through **RECOVERY** or **EXPORT KEYS**, and must be restored *after* the backup. The order matters and [the backup guide](../backups/README.md) explains why.

## What is sensitive

`secret` is the identity itself. `oasis/keys/` opens every private space you are in. `oasis/multiverse/fediverse-accounts.json` carries live session tokens for other networks. `oasis/banking/` says what you hold. None of it needs to leave the device, and none of it is published by Oasis: if you copy the folder somewhere, you are the one deciding who gets in.
