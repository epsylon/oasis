# Connect your Mastodon account

The **Fediverse** module lets you use your Mastodon account from inside Oasis: read your timeline, publish posts (text, images or video), reply, boost and favourite — all in one place.

This short guide shows you how to connect your account.

---

## 1) Create an access token in Mastodon

1. Log in to your Mastodon server (for example `mastodon.social`).
2. Go to **Preferences → Development → New application**.
3. Fill in:
   - **Application name**: `Oasis`
   - **Application website**: optional, leave blank if you want.
   - **Redirect URI**: leave the value that's already there.
4. Under **Scopes**, tick these (and nothing else):

   ```
   read:accounts
   read:statuses
   write:statuses
   write:media
   write:favourites
   ```

5. Click **Submit**. Open the new **Oasis** application and copy **"Your access token"**.

> Keep this token private — it lets you post to your account. You can delete it any time from the same Development page.

---

## 2) Connect it in Oasis

1. In Oasis, open **Settings**.
2. Find the **Fediverse** section (the **Mastodon** box).
3. Enter:
   - **Address**: your server, e.g. `mastodon.social`.
   - **Access token**: the token you just copied.
4. Click **Connect it**.

That's it. Oasis checks the token and opens your timeline. From now on you'll find **Fediverse** in the main menu.

To stop using it, go back to **Settings → Fediverse** and click **Disconnect**.

---

## 3) Using it

Open **Fediverse → Timelines**:

- **Read** your timeline, newest first. Use **Load more** to see older posts.
- **Post**: write in the box, optionally **Attach media** (images or video), **Preview**, then **Publish**.
- **Reply**: open a post's thread and answer from there.
- **Boost** and **Favourite** any post with its buttons.

---

## Show "via Oasis" on your posts (optional)

If you'd like your posts to show that they were sent from Oasis, go to **Preferences → Privacy** in Mastodon and enable **"Display from which app you sent a post"**. Since your application is named `Oasis`, your posts will then show *"via Oasis"*.

---

## If something doesn't work

- **Invalid or expired token** — create the token again and make sure the scopes above are ticked.
- **Invalid instance URL** — use your server's domain, e.g. `mastodon.social`.
- **Couldn't publish / upload** — your token is missing `write:statuses` or `write:media`; re-create it with the right scopes.
