# Connect your Telegram account

The **Multiverse** module lets you use your Telegram account from inside Oasis: read your chats, groups and channels, open any conversation and send messages or files — all in one place, without storing any Telegram content in your SSB log.

Unlike a Telegram *bot*, this connects **your own account** (an MTProto user session, the same thing an official client does). Oasis talks to Telegram live and shows the content ephemerally; only your credentials are kept locally.

---

## 1) Get your API ID and API hash

1. Log in at **https://my.telegram.org** with your phone number.
2. Open **API development tools** and create an application (any name, e.g. `Oasis`; platform `Desktop`).
3. Copy the **App api_id** (a number) and the **App api_hash** (a long string).

> Keep them private, like a password. They identify your Oasis instance to Telegram.

---

## 2) Connect it in Oasis

1. In Oasis, open **Settings** and find the **Multiverse** section (the **Telegram** box).
2. Enter your **API ID**, **API hash** and your **phone number** in international format (e.g. `+34600000000`), then click **Send code**.
3. Telegram sends you a login code (in the Telegram app, or by SMS). Enter it and click **Verify**.
4. If your account has **two-step verification**, Oasis asks for your cloud password next.

That's it. Oasis opens your Multiverse page. From now on you'll find **Multiverse → Timelines** in the main menu (the menu entry only appears while at least one account — Mastodon or Telegram — is connected).

To stop using it, go back to **Settings → Multiverse** and click **Disconnect** (this also logs the session out on Telegram's side).

---

## 3) Using it

Open **Multiverse → Timelines → Telegram**:

- **Chats**: your most recent conversations, with the unread counter and the last message. Click **Open**.
- **Read** a chat, newest messages at the bottom. Opening a chat marks it as read.
- **Send**: write in the box and click **Send**. You can **Attach media** (image, video, audio or PDF).

---

## If something doesn't work

- **Invalid API ID or API hash** — copy them again from my.telegram.org.
- **Invalid code** — type the code exactly as received; if it expired, start again with **Send code**.
- **Wrong password** — that's your Telegram two-step verification (cloud) password, not the login code.
- **Too many attempts** — Telegram rate-limits logins; wait a while before retrying.
- **Session invalid or expired** — the session was revoked (for example from Telegram's *Active sessions*); disconnect and connect again.
