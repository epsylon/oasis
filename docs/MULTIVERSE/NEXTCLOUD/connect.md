# Connect your Nextcloud

Oasis keeps every file it shares inside the network, and that puts a ceiling on how big a file can be. With the **Multiverse** module you can connect your own **Nextcloud** and share bigger files through it: the file is uploaded to your cloud and only its public link is published in Oasis. Whoever opens it downloads it from your Nextcloud; nothing of the file travels through the network.

This short guide shows you how to connect it.

---

## 1) Create an app password in Nextcloud

1. Log in to your Nextcloud.
2. Open **Settings → Security**.
3. Under **Devices & sessions**, type a name (for example `Oasis`) and click **Create new app password**.
4. Copy the password it shows you: it is shown only once.

> Keep it private — it lets Oasis upload files to your cloud. You can revoke it any time from the same page, and it never has to be your real password.

---

## 2) Connect it in Oasis

1. In Oasis, open **Settings** and choose **Multiverse**.
2. In the **Nextcloud** box, enter:
   - **Server**: the address of your Nextcloud, e.g. `cloud.example.org`.
   - **User**: your Nextcloud user name.
   - **Password**: the app password you just created.
   - **Folder**: where the files will go in your cloud. Leave it empty for `Oasis`; the folder is created if it does not exist.
3. Click **Connect it**.

Oasis checks the details against your cloud before keeping them. **Disconnect** removes them from your device.

---

## 3) Share a big file

1. Open **Files** and click **Add file**.
2. Below the usual form you now have a **Nextcloud** box: choose the file, give it a title, a description and tags, and decide whether it also goes to the Clearnet.
3. Click **Upload**.

The file goes to your Nextcloud, in the folder you chose, in pieces if it is large. Nextcloud gives Oasis a public link for it, and that link is what gets published: in **Files** the entry shows an **External link** instead of the download buttons, with the file's name, size and type. If a file with the same name is already in the folder, the new one gets its own name instead of replacing it.

---

## What stays where

- The file lives in your Nextcloud and stays there; Oasis never keeps a copy.
- Oasis publishes the title, description, tags, size and the public link, like any other file entry, with the reach you chose.
- Anyone with the link can download the file from your cloud: that is what a public link is. If you take the share down in Nextcloud, the link stops working while the entry stays in Oasis.
- The app password stays on your device.
