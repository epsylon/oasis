var tape = require('tape')
var R = require('../')

tape('urls', function (t) {
  var url = 'http://example.com'
  t.equal(R.type(url), false)
  t.equal(R.isAddress(url), false)
  t.equal(R.isMultiServerInvite(url), false)
  t.equal(R.isInvite(url), false)
  t.equal(R.isMsg(url), false)
  t.equal(R.isBlob(url), false)
  t.equal(R.isFeed(url), false)
  t.equal(R.isLink(url), false)
  t.equal(R.getKeyFromAddress(url), undefined)
  t.equal(R.parseInvite(url), null)

  t.end()
})
