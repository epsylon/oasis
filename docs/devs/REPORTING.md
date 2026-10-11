# Reporting a problem

A good report lets someone else see what you saw without sitting next to you.
Copy the template below into your issue or message, fill in what you know and
leave out what you don't. A short report with the exact error text is more
useful than a long one without it.

## Never share

- `~/.ssb/secret` or any file from `~/.ssb/oasis/keys`: they are your identity.
- The admin link Oasis prints when it starts with `--allow-host`.
- Wallet user names, passwords or addresses you want to keep private.
- Backup files, recovery kits or exported keys.
- Private messages or tribe content that is not yours to share.

Invite codes of a public PUB, feed ids (`@…ed25519`) and message ids
(`%…sha256`) are fine to include.

## Template

```
### What happened
<One or two sentences. What did you see?>

### What you expected
<What should have happened instead?>

### Steps to reproduce
1. <Where you started, e.g. "fresh install, first start">
2. <What you clicked or typed>
3. <What appeared>

### Exact message
<Copy the text shown on screen, word for word. Add the page address
 without the host, e.g. /invites or /feed?filter=ALL>

### Version
<Shown on your own profile as "Oasis Version", and in the "Package" line
 Oasis prints when it starts>

### How Oasis runs
- Device: <desktop / laptop / mobile app / server or VPS>
- Operating system: <e.g. Debian, Arch, Android, macOS>
- Installed from: <git clone + install.sh / .deb package / mobile app>
- Started with: <./oasis.sh, ./oasis.sh server, or the exact command>
- Options: <--public, --host=…, --allow-host=…, --offline, --port=… or none>
- Web opened from: <the same device / another device on the network /
  through a reverse proxy or a hostname>

### Network
- Joined a PUB: <no / yes, which one>
- Network paused (Peers page): <yes / no>
- Tor: <not used / running / onion PUB>
- Fresh profile: <yes, a new ~/.ssb / no, an existing one>

### Modules involved
<e.g. Feed, Invites, Wallet, Tribes. Mention if the module was just enabled>

### What you already tried
<Restarts, other browser, copied files, changed settings… and what happened>

### Logs
<Start Oasis with --debug, reproduce the problem and paste the lines printed
 around that moment, plus the header Oasis prints when it starts. Remove
 anything listed under "Never share">

### Screenshots
<Optional. Crop out private content>
```

## Where the problem comes from

Saying which of these applies already narrows the search a lot:

- **Interface**: something looks wrong or a button does nothing.
- **Content**: an item is missing, duplicated or shows old data.
- **Network**: peers or PUBs don't connect, or content from others doesn't
  arrive.
- **Start-up**: Oasis does not start, stops, or prints an error when it starts.
- **Mobile app**: only happens in the app, not on the desktop.
