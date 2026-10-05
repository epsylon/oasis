# Oasis Phone & Rooms Guide

**Phone** lets inhabitants call each other; **Rooms** are places they meet. Both are end-to-end encrypted and need no server, operator or account: they run inside Oasis, over the connections it already has.

## What you need

Calls use the microphone and speakers of the device where Oasis runs (the browser runs no JavaScript), through PulseAudio, PipeWire or ALSA. Without one of them, **Phone** says that calls are not available on this device.

---

## Phone

Open **Phone** from the top bar. It shows your latest calls, your **History** and your **Audio Records**; its counter marks missed calls and messages you have not heard yet.

### Your number

Every inhabitant has a phone number, derived from their Oasis ID. It is shown on their profile, to everyone or only to mutual supporters, depending on who they accept calls from. PUBs have no number and cannot be called.

### Calling

**New call**, then dial a number or paste an Oasis ID, or start the call from an inhabitant's profile. If a number matches more than one inhabitant, Phone asks which one you mean.

Add several inhabitants to make a **joint call**: your Oasis connects with each of them and everyone hears everyone.

An incoming call shows a banner on every page with **Answer** and **Reject**, and on a desktop also a system notification with the same two buttons, so you can pick up without going to the browser. Rejecting is silent: the caller only sees that nobody answered, exactly as if you were away. During a call you can **Mute** and **Hang up**. You can be in one call or one room at a time.

### When nobody answers

When the ringing ends without an answer, a beep sounds and Oasis starts recording a **Private Audio Message (PaM)** right away: just speak. Two beeps warn you shortly before the time is up, and the message is sent on its own when it is; **Send** finishes earlier and **Cancel** hangs up without leaving anything. It arrives encrypted, as a private message, and the recipient finds it under **Audio Records**.

### Who can call you

In **Settings → Phone**:

- **Multiverse**: every inhabitant;
- **Only mutual-support**: the inhabitants you support who support you back;
- **Do not disturb**: nobody.

Inhabitants you block can never call you.

### Do not disturb

Your choice is published on your profile as a chip next to your number, and the button beside it switches it on or off; Settings does the same. Callers are told before anything rings: an inhabitant who does not take calls is not called, and the caller sees who was skipped.

### Privacy

Each call is encrypted end to end with keys made for that call alone. When both devices can reach each other (already connected, on the same LAN, or with a known address in Peers) the call always goes straight between them, even if a PUB is also available. Only when there is no direct way is it relayed by a PUB both are connected to, or by the PUB of the inhabitant being called, which only passes it along and cannot listen to it. Your call history stays on your device.

---

## Rooms

### Finding and creating rooms

**Community → Rooms** lists the rooms of your network; **LIVE** shows the ones with someone inside. **Create Room** with a title, a description, an image and tags, as:

- **OPEN**: any inhabitant can join;
- **INVITE-ONLY**: the creator hands out invite codes, which are redeemed in **Invites**; only those let in can read its title and description.

Tribes and sub-tribes have rooms of their own, in their **ROOMS** section, readable and open only to their members.

The creator can update, close or delete the room.

### Joining

**Join** to enter and **Leave** to go, whenever you want; joining needs the same devices as a call. **Mute** yourself at any moment; the others see that you are muted.

### The room's number

Each room has a phone number, and its creator chooses what happens when someone dials it:

- **Do not disturb**: the number takes no calls;
- **Switchboard**: dialling the number from **Phone** enters the room. An invite-only room still asks for access.

### Privacy

A room meets on the PUB its creator was connected to when it was opened, or on the creator's own node. Everything sent in it is encrypted end to end among the participants: the PUB relays it without being able to read it.

---

## For PUB operators

What a PUB relays for calls and rooms, and how to turn it off, is in the [deploy guide](../PUB/deploy.md) (step 20). Over Tor it works the same way: [TOR.md](../PUB/TOR.md).
