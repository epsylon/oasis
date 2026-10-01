var tape = require('tape')
var R = require('../')

var invite1 = 'net:145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=:DxiHEv+ds+zUzA49efDgZk8ssGeqrp/5kgvRVzTM7vU='
var invite2 = '145.12.20.3:8080:@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519~DxiHEv+ds+zUzA49efDgZk8ssGeqrp/5kgvRVzTM7vU='
var invite1ws = 'ws://145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=:DxiHEv+ds+zUzA49efDgZk8ssGeqrp/5kgvRVzTM7vU='

var seed = 'DxiHEv+ds+zUzA49efDgZk8ssGeqrp/5kgvRVzTM7vU='
var cjdnsInvite2 = 'net:fcbc:6c66:bcd4:d3b5:2a2a:60b3:9b86:498f:8008~shs:ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=:' + seed
var cjdnsInvite = 'fcbc:6c66:bcd4:d3b5:2a2a:60b3:9b86:498f:8008:@ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=.ed25519~' + seed

var cjdnsAddr = 'fcbc:6c66:bcd4:d3b5:2a2a:60b3:9b86:498f:8008:@ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=.ed25519'
var cjdnsAddr2 = 'net:fcbc:6c66:bcd4:d3b5:2a2a:60b3:9b86:498f:8008~shs:ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI='

var ipv6Addr = '2a03:2267::ba27:ebff:fe8c:5a4d:8080:@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519'
var ipv6Invite = '2a03:2267::ba27:ebff:fe8c:5a4d:8080:@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519~DxiHEv+ds+zUzA49efDgZk8ssGeqrp/5kgvRVzTM7vU='
var ipv6AddrLocal = '::1:8080:@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519'
var ipv6InviteLocal = '::1:8080:@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519~DxiHEv+ds+zUzA49efDgZk8ssGeqrp/5kgvRVzTM7vU='

tape('ipv6 invite', function (t) {
  t.ok(R.isAddress(ipv6Addr))
  t.ok(R.isAddress(cjdnsAddr))
  t.ok(R.isInvite(ipv6Invite))
  t.ok(R.isAddress(ipv6AddrLocal))
  t.ok(R.isAddress(cjdnsAddr))
  t.ok(R.isAddress(cjdnsAddr2))
  t.ok(R.isInvite(ipv6InviteLocal))
  t.end()
})

tape('multiserver invite', function (t) {
  var rand = Math.random()
  t.ok(R.isMultiServerInvite(invite1))
  t.deepEqual(
    R.parseMultiServerInvite(invite1),
    {
      invite: invite1,
      remote: 'net:145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=',
      key: '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519',
      redirect: null
    })
  t.deepEqual(
    R.parseInvite(invite1ws),
    {
      invite: invite1ws,
      remote: 'ws://145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=',
      key: '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519',
      redirect: null
    })
  t.deepEqual(
    R.parseMultiServerInvite(invite1 + '#' + rand),
    {
      invite: invite1,
      remote: 'net:145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=',
      key: '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519',
      redirect: '#' + rand
    })

  t.equal(R.getKeyFromAddress(invite1), '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519')

  t.deepEqual(
    R.parseInvite(cjdnsInvite2 + '#' + rand),
    {
      invite: cjdnsInvite2,
      remote: 'net:fcbc:6c66:bcd4:d3b5:2a2a:60b3:9b86:498f:8008~shs:ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=',
      key: '@ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=.ed25519',
      redirect: '#' + rand
    })

  t.deepEqual(
    R.parseInvite(cjdnsInvite + '#' + rand),
    {
      invite: cjdnsInvite2,
      remote: 'net:fcbc:6c66:bcd4:d3b5:2a2a:60b3:9b86:498f:8008~shs:ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=',
      key: '@ppdSxn1pSozJIqtDE4pYgwaQGmswCT9y15VJJcXRntI=.ed25519',
      redirect: '#' + rand
    })

  t.end()
})

tape('legacy invite', function (t) {
  var rand = Math.random()
  t.ok(R.isLegacyInvite(invite2))
  t.deepEqual(
    R.parseLegacyInvite(invite2),
    {
      invite: invite1,
      remote: 'net:145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=',
      key: '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519',
      redirect: null
    })

  t.deepEqual(
    R.parseLegacyInvite(invite2 + '#' + rand),
    {
      invite: invite1,
      remote: 'net:145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=',
      key: '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519',
      redirect: '#' + rand
    })
  t.end()

  tape('handle non `shs` protocol invites', (t) => {
    t.doesNotThrow(() => {
      R.getKeyFromAddress('INVITE sip:0019294040830@51.15.166.54:8008 SIP/2.0')
    })
    t.end()
  })
})
