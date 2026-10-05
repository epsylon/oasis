# Oasis PUB over Tor

A PUB can also be reached as a Tor hidden service (an `.onion` address). This is optional: the default PUB configuration does not use Tor, and a PUB can be reachable over its normal address and over Tor at the same time.

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

Oasis needs no change to accept these connections: Tor delivers them to the normal listener. If the PUB must be reachable **only** over Tor, make that listener local in `src/configs/server-config.json` and close the port in the firewall:

```json
"incoming": {
  "net": [{ "scope": ["device", "local"], "transform": "shs", "host": "127.0.0.1", "port": 8008 }]
}
```

Publish the onion address so inhabitants can find it:

```
./oasis.sh announce <address>.onion 8008
```

The full address of the PUB, to share by hand, is:

```
onion:<address>.onion:8008~shs:<PUB key without the leading @ and the trailing .ed25519>
```

Inhabitants who connect over Tor are not invited through a code, so follow them from the PUB to replicate them, as with any other feed:

```
./oasis.sh follow "@<inhabitant key>.ed25519"
```

## 2) On each inhabitant's Oasis

Run Tor locally: the Tor service (SOCKS on `127.0.0.1:9050`) or Tor Browser while it is open (`127.0.0.1:9150`).

Allow outgoing onion connections in `src/configs/server-config.json`, then restart Oasis:

```json
"outgoing": {
  "net": [{ "transform": "shs" }],
  "onion": [{ "transform": "shs" }]
}
```

Then, in **Peers**:

- **Connect**: host `<address>.onion`, the PUB port and the PUB key; or
- **Import**: paste the full `onion:` address of the PUB.

The PUB then appears in Peers like any other, with its onion host.

## Notes

- Without a local Tor, onion addresses cannot be reached: the PUB stays listed but never connects.
- An inhabitant only needs the outgoing onion setting; there is nothing to open on their side.
