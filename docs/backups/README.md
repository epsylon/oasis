# Oasis Backup & Restore Guide

Everything you are in Oasis lives in two places on your device: the **secret key** (`secret`), which *is* your identity, and the **log** (`db2/`), both in the folder of your account inside `~/.ssb/oasis/profiles/`, which holds every message you and the inhabitants you support have published, plus the blobs they reference. The key cannot be recovered by anyone if you lose it. 

The log can usually be rebuilt from the network, but only the parts other peers still keep. The **Backup** module (Tools › Backup) covers both.

## The tabs

| Tab | What it does | Where it works |
| --- | --- | --- |
| **RECOVERY** | Shows your secret key as text and as a QR code, ready to print or save as PDF. | Only when Oasis is opened from the same device (`localhost`). |
| **KEYS** | Downloads your secret key encrypted with a password (`oasis.enc`), and imports one. | Anywhere. |
| **FULL BACKUP** | Downloads an encrypted copy of the log and blobs (`oasis-backup-DATE.oasisbk`). | Only from the same device. |
| **RESTORE BACKUP** | Restores an `.oasisbk` copy, or imports an `oasis.enc` key: Oasis tells them apart. | Anywhere. |

Every password has a minimum length, shown on the page. The page also offers a random one; keep it with the file, because nothing can open the file without it.

## 1. Recovery kit

The simplest backup and the only one you really cannot live without. Open **RECOVERY**, print the page or generate the PDF, and store it offline. Anyone who reads it can act as you, so treat it like cash.

To recover from it later: install Oasis on a new device, open **KEYS** and import the key, or paste the secret text into `~/.ssb/secret` by hand before the first launch.

## 2. Keys export and import

**KEYS** encrypts the `secret` of the open account with your password and downloads it as `oasis.enc`. It is small enough to keep in any password manager or on a USB stick.

**KEYS › Import** decrypts the file and writes it as the `secret` of the open account. The previous secret, if any, is kept next to it as `secret.bak-DATE`. Oasis reads the key at start, so **restart Oasis after importing**.

Importing a key marks that identity as already known on the device: no welcome message is published for it and the first-contact steps are skipped. That matters for the next section.

## 3. Full backup

**FULL BACKUP** writes a single encrypted file with:

- **Scope EVERYTHING**: the whole log (yours and everyone you replicate, private messages included, still boxed) and the whole blob store.
- **Scope ONLY MY CONTENT**: only messages you authored and the blobs they reference.
- **Since**: optional date; only messages published after it.

Either scope also carries everything Oasis keeps for you outside the log: the whole of `~/.ssb/oasis/` — the keyrings that open your tribes, chats and pads, your favourites, your agenda, the banking state, the linked Multiverse accounts. [What each of those files is](../devs/inventory.md). A restore writes them back in place, keeping any current one as `.before-restore`. The file also carries the `secret` of every account in it, so a copy is enough to bring an account back on any device: keep the file and its password as safe as the recovery kit.

If the node has other avatars (Settings › Avatars), **ACCOUNTS** chooses what goes in: **ALL** (the default) or a single account, by its short id. The open account goes with the scope chosen above; every other account goes with its `secret`, its own `oasis/` folder, the messages it published and the blobs those messages reference. The rest of its log replicates again from the network once it is open.

The file is compressed and then encrypted with AES-256-GCM. Nothing inside is readable without the password. "Everything" copies can be large on a long-lived device; "only my content" is usually small and is the right choice to carry your own feed to another device.

## 4. Restore

**RESTORE BACKUP** uploads an `.oasisbk` file and the password used to create it. Restoring a copy replaces the account you restore from with the accounts in the copy:

1. Oasis reads the copy in the background and unpacks every account in it into its own folder, without touching the account that is open. The page shows the progress and refreshes itself every few seconds.
2. The summary lists the accounts of the copy and the account it replaces. **Continue** removes the account you restored from and restarts Oasis on the account that was the default one when the copy was made. Until you press it, nothing has been removed.
3. The messages and blobs of each account enter its log the first time that account is open.

An account of the copy that is already on this device, other than the one you restore from, keeps its identity: only its state and its messages are restored. A node holds up to 3 accounts; if the accounts of the copy do not fit, nothing is restored and the page says how many accounts to delete first.

A copy that carries no `secret` is restored into the account that is open: its messages are appended and its files written in place. Import the key afterwards (section 2) to become that identity.

| Line | Meaning |
| --- | --- |
| **Messages added** | Messages that were not on this device and were appended. |
| **Already present** | Identical messages this device already had. Normal when restoring twice or when the network had already replicated them. |
| **Files added** | Blobs that were not on this device. |
| **Diverged** | Messages whose author and sequence number already existed here **with different content**. See below. |
| **Failed** | Messages that could not be appended. The reasons are listed under the summary. |

Apart from the account you restore from, a restore never deletes anything: it only adds what is missing.

## Moving to a new device

1. Install Oasis on the new device and open it once. It creates an account of its own, which the copy will replace.
2. **RESTORE BACKUP › Restore** with your `.oasisbk` copy and its password.
3. Press **Continue** when the summary appears. Oasis restarts as your default account, with your other accounts next to it.
4. Check **Settings › Verification**: your feed should show no gaps, no broken links and no forks.

In Oasis every message you publish links to the one you published before, forming a chain that only you can extend. A copy is a snapshot of that chain: if the same account went on publishing on another device after the copy was made, restoring the copy here and publishing from both devices gives the same identity two different histories — a "fork" — and the network will only ever accept one of them. If the summary shows **Diverged** messages for your own identity, that is what happened.

Without a full backup, **KEYS › Import** is still enough to get your identity back: it becomes the identity of the open account, and the content arrives from the network as the pubs and friends that replicate you reconnect. That can take a while and only brings back what they still hold, which is why the full backup exists. Import the key before publishing anything on that device, and do not paste the recovery-kit secret into `~/.ssb/secret` on a device that already started Oasis: that file is only a notice, and a key put there becomes a separate account with an empty log.

## Checking a copy or a device

**Settings › Verification** inspects the local log: sequence gaps, broken links, bad hashes or signatures and duplicate sequences on your own feed, forks on any feed, and orphan or missing blobs. Run it after a restore, and whenever a device behaves oddly after a sync.

## Notes

- Both the key and the full backup are encrypted with the password you type; Oasis never stores that password. Losing it makes the file useless.
- The file formats are Oasis' own (`OASIS1` for keys, `OASISBK1` for copies) and are readable by any Oasis on any platform, so a copy made on a phone restores on a desktop and vice versa.
- On mobile, prefer **only my content** copies. They are small, and they are what you need to carry your feed anywhere.
- A restore never publishes anything on your behalf and never touches other inhabitants' feeds beyond appending messages that were missing.
