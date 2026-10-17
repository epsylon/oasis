# Security Policy

## Security Model

Oasis is experimental software, please don't trust it with your life.

If everything is working correctly, it's likely that:

- Only your computer can access Oasis.
- Only you can publish a message to your feed.
- Only the recipients of private messages can read the message.
- Only basic HTML is supported in blobs, which can't access the rest of Oasis.

It's important to know that this is not a silver bullet:

- Your public messages can be read by anyone on the network.
- What you publish as CLEARNET is served on the open web by every PUB that replicates you, and so is tribe content that a member opens to OASIS or CLEARNET. Switching it back hides it in Oasis, but copies already made elsewhere cannot be recalled.
- Your IP address can be seen by anyone that peers with you.
- Your private messages can be read by anyone with access to your private key.

You should also know:

- Information that others can read can be saved, without your permission.
- Encryption techniques that are unbreakable today may become compromised in the future; maybe in dozens or hundreds of years.
- Don't trust your smartphone. 
- Oasis is designed to run in a safe environment (SNH kit).

## Your identity

Your identity is a key pair stored on your computer. Whoever holds the secret key can publish as you and read your private messages, so keep a backup of it in a safe place and never share it. There is no password reset and no central account: if the key is lost, the identity is lost with it.

## What others can learn about you

- Peers you connect to see your network address. Routing through Tor hides it; the LAN announcement reveals your presence only on the local network and can be switched off.
- Everything you publish is signed by you and replicated by anyone who follows you, directly or through others. Assume it is permanent.
- Private messages hide their content and recipients, but not the fact that you published something at that moment.
- Content and files shared inside a private tribe are encrypted for its members. Opening something to Oasis or clearnet publishes a plain copy of it.
- A node in public mode shows your content to the open web. Keep your own node private unless you mean to run a PUB.

## Staying in control of what you see

Nothing on the network can be erased by someone else, but your node decides what reaches you:

- The Wish setting bounds whose content you see at all, from the whole network down to mutual support, the local network or only yourself.
- Private messages and mentions can be limited to people you follow or to mutual support.
- You can mute an inhabitant, hide a single piece of content, or block an inhabitant. Muting and hiding stay on your node and nobody is told; blocking is published and also stops your node from replicating that feed.

## If someone harasses you

1. Mute them, or hide the specific content, from their profile or the content itself. It takes effect everywhere in your interface at once and they are not notified.
2. If you also want to stop carrying their feed, block them. This is visible to the network.
3. Tighten who can reach you: set private messages and mentions to people you follow or to mutual support.
4. Keep the links to the offending content. Signed messages cannot be forged or altered, so they are reliable evidence.
5. Report the content so the network is warned, or open a case in Courts if the community should mediate.
6. Everything you muted or hid can be reviewed and undone from Settings → Content.

## Supported Versions

Only the latest release is supported.

## Reporting a Vulnerability

Send an email to epsylon@riseup.net to report any security problems. Please do not use the public issue tracker.
