# Oasis PUB over Tor

A PUB can also be reached as a Tor hidden service (an `.onion` address). This is optional: the default PUB configuration does not use Tor, and a PUB can be reachable over its normal address and over Tor at the same time.

Tor and non-Tor nodes live together in the same network. Nobody is forced to use Tor: an inhabitant or a PUB without Tor keeps talking to everyone reachable over a normal address, and a Tor-only PUB simply tells them, in **Peers**, that it only accepts connections through Tor.

Everything that travels over the connection (replication, calls and rooms relayed by the PUB) works the same way over Tor; it is only slower.

---

## 1) On the PUB

Install Tor with the package manager of the server:

```
sudo apt-get install -y tor
```

Add a hidden service that forwards to the port Oasis already listens on, in `/etc/tor/torrc`:

```
HiddenServiceDir /var/lib/tor/oasis-pub/
HiddenServicePort 8008 127.0.0.1:8008
```

Restart Tor and read the address it created:

```
sudo systemctl restart tor
sudo cat /var/lib/tor/oasis-pub/hostname
```

Oasis needs no change to accept these connections: Tor delivers them to the normal listener. If the PUB must be reachable **only** over Tor, make that listener listen on the machine itself, give it the onion address as its public one, and close the port in the firewall, in `~/.ssb/oasis/oasis-server-config.json`:

```json
"incoming": {
  "net": [{ "scope": ["device", "local", "public"], "transform": "shs", "host": "127.0.0.1", "port": 8008, "external": "<address>.onion" }]
}
```

It still only listens on the machine itself; the onion address is what it hands out, so `./oasis.sh invite` creates invite codes that point to it and inhabitants with Tor can join with them.

Publish the onion address so inhabitants can find it:

```
./oasis.sh announce <address>.onion 8008
```

The full address of the PUB, to share by hand, is:

```
onion:<address>.onion:8008~shs:<PUB key without the leading @ and the trailing .ed25519>
```

Inhabitants who connect over Tor without an invite code are followed from the PUB to replicate them, as with any other feed:

```
./oasis.sh follow "@<inhabitant key>.ed25519"
```

## 2) On each inhabitant's Oasis

Run Tor locally: the Tor service (SOCKS on `127.0.0.1:9050`) or Tor Browser while it is open (`127.0.0.1:9150`).

Oasis uses a local Tor for onion addresses when one is running; nobody needs Tor to use Oasis, and without it nothing changes. The server config needs the `onion` outgoing entry below (the default in `src/configs/server-config.json` has it); if a node's own `~/.ssb/oasis/oasis-server-config.json` leaves it missing or empty, set it there and restart Oasis.

```json
"outgoing": {
  "net": [{ "transform": "shs" }],
  "onion": [{ "transform": "shs" }]
}
```

Then, in **Peers**:

- **Connect**: host `<address>.onion`, the PUB port and the PUB key; or
- **Import**: paste the full `onion:` address of the PUB.

The PUB then appears in Peers like any other, marked as reachable over Tor.

## Notes

- Without a local Tor, onion addresses cannot be reached: Peers shows the PUB as **TOR only**, and an invite code or an address that points to an onion host is refused with the same explanation until Tor runs.
- An inhabitant only needs Tor running; there is nothing to open on their side.
- Inhabitants and PUBs without Tor still get everything a Tor-only PUB carries, through any node that talks to both: the Tor-only PUB itself when it connects out to a clearnet PUB, or a PUB that also runs Tor. Give a Tor-only PUB at least one clearnet PUB to connect to, so it is part of the network instead of an island.
- A PUB reachable both over its normal address and over Tor is reached over its normal address by everyone without Tor.
