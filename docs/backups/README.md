# Oasis Backup & Restore Guide

Everything you are in Oasis lives in two places on your device: the **secret key** (`~/.ssb/secret`), which *is* your identity, and the **log** (`~/.ssb`), which holds every message you and the people you follow have published, plus the blobs they reference. The key cannot be recovered by anyone if you lose it. 

The log can usually be rebuilt from the network, but only the parts other peers still keep. The **Backup** module (Tools › Backup) covers both.

## The four tabs

| Tab | What it does | Where it works |
| --- | --- | --- |
| **RECOVERY** | Shows your secret key as text and as a QR code, ready to print or save as PDF. | Only when Oasis is opened from the same device (`localhost`). |
| **EXPORT KEYS** | Downloads your secret key encrypted with a password (`oasis.enc`). | Anywhere. |
| **FULL BACKUP** | Downloads an encrypted copy of the log and blobs (`oasis-backup-DATE.oasisbk`). | Only from the same device. |
| **RESTORE BACKUP** | Imports an `.oasisbk` copy, or an `oasis.enc` key. | Anywhere. |

Every password must be at least 32 characters long. The page offers a random one; keep it with the file, because nothing can open the file without it.

## 1. Recovery kit

The simplest backup and the only one you really cannot live without. Open **RECOVERY**, print the page or generate the PDF, and store it offline. Anyone who reads it can act as you, so treat it like cash.

To recover from it later: install Oasis on a new device, open **RESTORE BACKUP** and import the key, or paste the secret text into `~/.ssb/secret` by hand before the first launch.

## 2. Keys export and import

**EXPORT KEYS** encrypts `~/.ssb/secret` with your password and downloads it as `oasis.enc`. It is small enough to keep in any password manager or on a USB stick.

**RESTORE BACKUP › Import keys** decrypts the file and writes it as `~/.ssb/secret`. The previous secret, if any, is kept next to it as `secret.bak-DATE`. Oasis reads the key at start, so **restart Oasis after importing**.

Importing a key marks that identity as already known on the device: no welcome message is published for it and the first-contact steps are skipped. That matters for the next section.

## 3. Full backup

**FULL BACKUP** writes a single encrypted file with:

- **Scope EVERYTHING**: the whole log (yours and everyone you replicate, private messages included, still boxed) and the whole blob store.
- **Scope ONLY MY CONTENT**: only messages you authored and the blobs they reference.
- **Since**: optional date; only messages published after it.

The file is compressed and then encrypted with AES-256-GCM. Nothing inside is readable without the password. "Everything" copies can be large on a long-lived device; "only my content" is usually a few megabytes and is the right choice to carry your own feed to another device.

## 4. Restore

**RESTORE BACKUP** uploads an `.oasisbk` file and the password used to create it. The restore runs in the background: the page shows the progress and refreshes itself every few seconds, and you can keep using Oasis meanwhile. When it finishes the page shows a summary:

| Line | Meaning |
| --- | --- |
| **Messages added** | Messages that were not on this device and were appended. |
| **Already present** | Identical messages this device already had. Normal when restoring twice or when the network had already replicated them. |
| **Files added** | Blobs that were not on this device. |
| **Diverged** | Messages whose author and sequence number already existed here **with different content**. See below. |
| **Failed** | Messages that could not be appended. The reasons are listed under the summary. |

Nothing is ever deleted by a restore. It only appends what is missing.

## Moving to a new device (the order matters)

In Oasis every message you publish links to the one you published before, forming a chain that only you can extend. A device that has published *anything* with your identity has started its own chain, and a backup of the real chain can no longer be applied on top of it. The result is a "fork": the same identity with two different histories, and your other devices and the network will only ever accept one of them.

That is why the backup goes in **before** the key, not after:

1. Install Oasis on the new device and open it once. It creates an identity of its own, which you are about to replace.
2. **RESTORE BACKUP › Restore backup** with your `.oasisbk` copy. Your old feed lands in the log while that identity is still a stranger, so nothing can collide with it.
3. **RESTORE BACKUP › Import keys** (or place the recovery-kit secret in `~/.ssb/secret`).
4. Restart Oasis. You are now yourself, and your history is already underneath you.
5. Check **Settings › Verification**: your feed should show no gaps, no broken links and no forks.

Doing it the other way round leaves a window where Oasis is running as you with an empty log. Anything published in that window becomes message number one of your feed, and the copy no longer fits.

If the summary shows **Diverged** messages for your own identity, that window caught you. The only clean way out is to remove this device's `~/.ssb` and start again from step 1.

Without a full backup, importing the key is still enough to get your identity back; the content then arrives from the network as the pubs and friends that replicate you reconnect. That can take a while and only brings back what they still hold, which is why the full backup exists.

## Checking a copy or a device

**Settings › Verification** inspects the local log: sequence gaps, broken links, bad hashes or signatures and duplicate sequences on your own feed, forks on any feed, and orphan or missing blobs. Run it after a restore, and whenever a device behaves oddly after a sync.

## Notes

- Both the key and the full backup are encrypted with the password you type; Oasis never stores that password. Losing it makes the file useless.
- The file formats are Oasis' own (`OASIS1` for keys, `OASISBK1` for copies) and are readable by any Oasis on any platform, so a copy made on a phone restores on a desktop and vice versa.
- On mobile, prefer **only my content** copies. They are small, and they are what you need to carry your feed anywhere.
- A restore never publishes anything on your behalf and never touches other people's feeds beyond appending messages that were missing.
