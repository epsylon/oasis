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

**New call**, then dial a number or paste an Oasis ID, or start the call from an inhabitant's profile. Clicking a phone number anywhere in Oasis (a profile, a room, a card in Activity) calls it straight away. A number that belongs to one inhabitant is called directly; only when it matches more than one does Phone ask which one you mean.

While Oasis is reaching the other device you hear a soft connecting sound and see **Connecting**; as soon as their device has the call it starts ringing, for both of you. If their device cannot be reached, Phone tells you so and lets you leave a message. If they are already on another call you hear that they are busy, you can leave a message, and they find your call as missed.

Add several inhabitants to make a **joint call**: your Oasis connects with each of them and everyone hears everyone.

An incoming call shows a bar at the top of every page with **Answer** and **Reject**, and on a desktop also a system notification with the same two buttons, so you can pick up without going to the browser. Rejecting is silent: the caller only sees that nobody answered, exactly as if you were away.

While a call is on, the same bar, in the place where Oasis shows its other notices, keeps who you are talking to, a running clock, **Mute** and **Hang up**, so you can keep browsing; its name takes you back to the call. You can be in one call or one room at a time.

### When nobody answers

When the ringing ends without an answer, a beep sounds and Oasis starts recording a **Private Audio Message (PaM)** right away: just speak. Two beeps warn you shortly before the time is up, and the message is sent on its own when it is; **Send** finishes earlier and **Cancel** hangs up without leaving anything. It arrives encrypted, as a private message, and the recipient finds it under **Audio Records**.

### Who can call you

In **Settings → Phone**:

- **Multiverse**: every inhabitant;
- **Only mutual-support**: the inhabitants you support who support you back;
- **Do not disturb**: nobody.

Inhabitants you block can never call you.

### Do not disturb

Your choice is published on your profile as a chip next to your number, and the button beside it switches it on or off; Settings does the same. Others see that chip on your profile and next to you in their Phone, instead of the call button. Callers are told before anything rings: an inhabitant who does not take calls is not called, and the caller sees who was skipped.

### Privacy

Voice travels compressed, so a call needs little data; the quality adapts to what every side can handle.

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

Click a room's title in the list to enter it: you are in the room and hear whoever is talking, with no second step. Entering another room leaves the one you were in. **Leave** to go, whenever you want; joining needs the same devices as a call. **Mute** yourself at any moment; the others see that you are muted.

While you are in a room, the bar at the top of every page shows its name, how many are inside, how long you have been there, **Mute** and **Leave**.

### The room's number

Each room has a phone number, and its creator chooses what happens when someone dials it:

- **Do not disturb**: the number takes no calls;
- **Switchboard**: dialling the number from **Phone**, or clicking it, enters the room. An invite-only room still asks for access, and a room with nobody inside cannot be called: Phone tells you so instead of entering an empty room.

Everyone sees which of the two the room has, as a chip next to its number.

### Rooms on the CLEARNET

An OPEN room can be created as CLEARNET, or switched to it later from its page, like any other item (see the [clearnet guide](../PUB/clearnet.md)). Its public page shows only the room's name and its number; nothing on it can be clicked or joined from the web. Invite-only rooms, closed rooms and tribe rooms are never public.

### Privacy

A room meets on a PUB that accepts its creator, chosen when it is opened, or on the creator's own node if none does. Everything sent in it is encrypted end to end among the participants: the PUB relays it without being able to read it.

---

## For PUB operators

What a PUB relays for calls and rooms, and how to turn it off, is in the [deploy guide](../PUB/deploy.md) (step 20). Over Tor it works the same way: [TOR.md](../PUB/TOR.md).
