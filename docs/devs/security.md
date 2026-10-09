# Security model for developers

This page describes the principles the code follows to stay safe and what new
code has to respect. The public policy and the way to report a problem are in
[../security.md](../security.md).

## Who can reach the interface

- By default the web interface only answers the device it runs on.
- Exposing it to other machines is an explicit choice of the operator. Anyone
  who can reach an exposed interface can act as the operator on every page that
  is not reserved to the local device, so it belongs on trusted networks only.
- A node published through a proxy, a tunnel or an anonymity network must use
  the option meant for it, which adds a per-start admin secret for the reserved
  pages. A request that arrives through an intermediary is never taken as local.
- Requests that change something must come from the node's own pages. Checking
  where a request comes from stops other web sites from acting through the
  browser, but cannot stop a machine on the same network from lying about it.

## Reserved pages

Pages that change the node, reveal secrets or move money are reserved to the
local device. Paths are normalized before they are compared, so different
spellings of the same address get the same answer. New pages of that kind
belong in the reserved list.

## Reading and changing

Reading never changes anything that depends on the request. Any housekeeping a
page does while being read must give the same result whoever triggers it.
Following, joining, voting, publishing or paying are always explicit actions
taken from a form.

## Trusting what peers publish

Every message is signed by its author and nothing else in it can be taken at
face value.

- Only the author of something can replace or delete it.
- Counts, totals, statuses and winners are always recomputed from signed
  messages, one voice per author and within the time allowed. Figures written
  inside a message are ignored.
- Lists of people (members, voters, attendees) are only believed from whoever
  controls that list.
- Any field that names a person acting must match the signer.
- Timestamps are chosen by their author. Rules that depend on order must still
  give every node the same answer.
- Deletions do not take up the space reserved for recent content.

## Keys and invitations

- Each private space has its own key. A key handed out through the network is
  only accepted from those who are allowed to hand it out for that space.
- When someone leaves, the key is changed by someone who stays, and the new
  key reaches only those who stay.
- Invitations never publish anything that works as a key. Joining requires
  proof of holding the key, and private invitations work only once.
- Decrypted data is never allowed to alter the program's own objects.

## Money

- Shared payouts are paid at most once per person and period, and an address
  cannot be used to collect for several people.
- Amounts are always checked before anything is sent.

## Files and media

- Files rebuilt from pieces are checked against what was announced before they
  are accepted.
- Media from other networks is isolated from the interface.
- Nothing that leaves the node (exports, published files) carries private or
  local network addresses.
- Cleaning the cache never removes the operator's own files or private
  correspondence.

## Local state

- Configuration and state live in the data directory, outside the application,
  so an update never overwrites them. Those files are private to their owner.
- Secrets that are kept as a safety copy stay private to their owner as well.

## Supply chain

- Runtime packages are vendored and must match the lockfile.
- Local changes to vendored packages live only in the patch script.
- Every file fetched by the installer or shipped from a third party is pinned
  by its hash.

## How to check

- The security suite covers the rules shared by the whole application, and
  each module suite covers its own rules.
- Before writing a test, think of what a hostile peer could publish or send and
  check that the result does not change.

## Checklist for new code

- Does it trust a field that the signer could set to anything?
- Can a stranger make the node publish, follow, pay or hand out a key?
- Does reading a page change anything that depends on the request?
- Do counts, lists and statuses come from signed messages recounted locally?
- Does it accept a key, a member or a vote from someone who does not control it?
- Could it leak a private address, a key or a private file?
