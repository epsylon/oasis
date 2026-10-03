# Connect your PeerTube account

The **Multiverse** module lets you use your PeerTube account from inside Oasis: follow the videos of the channels you subscribe to, watch them, like and comment, see your own videos and upload new ones to your channel. Your credentials are kept locally.

---

## 1) What you need

- The address of your PeerTube instance (for example `peertube.example.org`).
- Your PeerTube **username** and **password** (the same ones you use on the website).

Oasis registers itself with the instance the way the official clients do (OAuth), keeps the resulting session tokens locally and renews them when they expire. Your password is only sent once, to the instance, to obtain those tokens.

---

## 2) Connect it in Oasis

1. In Oasis, open **Settings** and find the **Multiverse** section (the **PeerTube** box).
2. Enter the **instance address**, your **username** and your **password**, then click **Connect it**.

Oasis opens your Multiverse page. From now on you'll find **Multiverse** in the main menu (the entry only appears while at least one account — Mastodon, Telegram or PeerTube — is connected).

To stop using it, go back to **Settings → Multiverse** and click **Disconnect** (this also revokes the session on the instance).

---

## 3) Using it

Open **Multiverse → PeerTube**:

- **Subscriptions**: the newest videos of the channels you follow. Click a video to watch it.
- **My videos**: what you have uploaded, with its privacy and processing state.
- **Watch** a video inside Oasis (the stream is relayed by your node, so the instance only sees your node), **like** it and read or write **comments**. **Open on PeerTube** takes you to the instance page.
- **Upload video**: choose a file, give it a title, a description and a privacy level. The file goes to your channel and PeerTube transcodes it afterwards; it shows up in **My videos** once processed.

---

## Notes

- Videos that the instance has not finished processing cannot be played yet; the page says so and offers the PeerTube link.
- The relay only serves video files from your own instance (or the storage it points to); nothing else is proxied.
- Public (clearnet) nodes never expose Multiverse accounts.
