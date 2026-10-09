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

**New call**, then dial a number or paste an Oasis ID, or start the call from an inhabitant's profile. Clicking a phone number anywhere in Oasis (a profile, a room, a card in Activity) calls it straight away.

If their device cannot be reached, Phone tells you so and lets you leave a message. If they are already on another call you hear that they are busy, you can leave a message, and they find your call as missed.

Add several inhabitants to make a **joint call**: your Oasis connects with each of them and everyone hears everyone.

An incoming call shows a bar at the top of every page with **Answer** and **Reject**, and on a desktop also a system notification with the same two buttons, so you can pick up without going to the browser. Rejecting is silent: the caller only sees that nobody answered, exactly as if you were away.

While a call is on, the same bar keeps who you are talking to, a running clock, **Mute** and **Hang up**, so you can keep browsing. You can be in one call or one room at a time.

From **Phone** you can also stop hearing one particular inhabitant, in a call for two or in a joint call, with **Silence** next to their name. It only affects your ears: the others keep hearing them, and they keep hearing you. **Hear again** undoes it.

### When nobody answers

When the ringing ends without an answer, a beep sounds and Oasis starts recording a **Private Audio Message (PaM)** right away: just speak. Two beeps warn you shortly before the time is up, and the message is sent on its own when it is; **Send** finishes earlier and **Cancel** hangs up without leaving anything. It arrives encrypted, as a private message, and the recipient finds it under **Audio Records**.

### Who can call you

In **Settings → Phone**:

- **Multiverse**: every inhabitant;
- **Only mutual-support**: the inhabitants you support who support you back;
- **Do not disturb**: nobody.

A new node starts with **Only mutual-support**.

Inhabitants you block can never call you.

### Do not disturb

Your choice is published on your profile next to your number, where it can also be switched on or off; Settings does the same. Callers are told before anything rings: an inhabitant who does not take calls is not called.

### Privacy

Each call is encrypted end to end with keys made for that call alone. When both devices can reach each other (already connected, on the same LAN, or with a known address in Peers) the call always goes straight between them, even if a PUB is also available. Only when there is no direct way is it relayed by a PUB both are connected to, or by the PUB of the inhabitant being called, which only passes it along and cannot listen to it. Your call history stays on your device.

---

## Rooms

### Finding and creating rooms

**Community → Rooms** lists the rooms of your network; **LIVE** shows the ones with someone inside. **Create Room** with a title, a description, an image and tags, as:

- **OPEN**: any inhabitant can join;
- **INVITE-ONLY**: the creator hands out invite codes, which are redeemed in **Invites**; only those let in can read its title and description, find it by its number or reach the place where it meets. Whoever loses the invitation is left outside, even if they kept the number.

Tribes and sub-tribes have rooms of their own, in their **ROOMS** section, readable and open only to their members.

### Joining

Click a room's title in the list to enter it: you are in the room and hear whoever is talking. Entering another room leaves the one you were in. **Leave** to go, whenever you want; joining needs the same devices as a call. **Mute** yourself at any moment; the others see that you are muted. **Silence** next to someone's name stops their voice for you alone, without anyone else noticing; **Hear again** brings it back.

While you are in a room, the bar at the top of every page shows its name, how many are inside, how long you have been there, **Mute**, **Raise hand** and **Leave**. If the room is already busy when you enter, you come in muted, so the newcomers do not interrupt; **Unmute** when you want to speak.

A chime tells you when someone enters, and a different one when someone leaves, mutes or unmutes. On the room page, above the participants, the bell turns those chimes and the list of what happened (who entered, who left, who muted, who recorded) on or off for you, and **Clear** empties that list. It is never stored anywhere: it lives only while you are inside. On a desktop, each of those notices also appears as a system notification, so you can follow the room without reloading the page; what you do yourself is not notified.

**Raise hand** asks for a turn to speak. The others hear a signal and get a notice, and your hand appears next to your name with your place in the queue: the first hand raised is the first turn. Raised hands are listed first among the participants, in that order, and the bar at the top shows your own place. **Lower hand** takes you out of the queue.

Any participant can **Record** the room. Everyone inside hears a signal when a recording starts and another when it stops, and sees a **REC** mark next to whoever is recording. The recording stays on the device of the one who made it, under **Recordings** on the room page, to download or delete.

### The room's number

Each room has a phone number, and its creator chooses what happens when someone dials it:

- **Do not disturb**: the number takes no calls;
- **Switchboard**: dialling the number from **Phone**, or clicking it, enters the room. An invite-only room still asks for access.

### Rooms on the CLEARNET

An OPEN room can be created as CLEARNET, or switched to it later from its page, like any other item (see the [clearnet guide](../PUB/clearnet.md)). Its public page shows only the room's name and its number; nothing on it can be clicked or joined from the web. Invite-only rooms, closed rooms and tribe rooms are never public.

### Privacy

A room meets on a PUB that accepts its creator, chosen when it is opened, or on the creator's own node if none does. Everything sent in it is encrypted end to end among the participants: the PUB relays it without being able to read it.

---

## For PUB operators

What a PUB relays for calls and rooms, and how to turn it off, is in the [deploy guide](../PUB/deploy.md) (step 19). Over Tor it works the same way: [TOR.md](../PUB/TOR.md).
