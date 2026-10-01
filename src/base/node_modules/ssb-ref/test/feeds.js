var tape = require('tape')
var R = require('../')

var feedRef = '@jEA8WSl0URsB/g/XYG5zCGBkMOyTeBZfGtbw3RJMIuk=.ed25519'
var feedRefFuture = '@' + Buffer.from('the quick brown fox jumped!').toString('base64') + '.bamboo-2'

var futureWithSuffix = (suffix) => '@' + Buffer.from('the quick brown fox jumped!').toString('base64') + suffix

var feedUrls = [
  'http://localhost:7777/#/profile/%40jEA8WSl0URsB%2Fg%2FXYG5zCGBkMOyTeBZfGtbw3RJMIuk%3D.ed25519',
  'http://localhost:7777/#/profile/@jEA8WSl0URsB/g/XYG5zCGBkMOyTeBZfGtbw3RJMIuk=.ed25519',
  'http://localhost:7777/%40jEA8WSl0URsB%2Fg%2FXYG5zCGBkMOyTeBZfGtbw3RJMIuk%3D.ed25519',
  'http://localhost:7777/@jEA8WSl0URsB/g/XYG5zCGBkMOyTeBZfGtbw3RJMIuk=.ed25519',
  'http://localhost:7777/%40jEA8WSl0URsB%2Fg%2FXYG5zCGBkMOyTeBZfGtbw3RJMIuk%3D.ed25519?foo=bar',
  'http://localhost:7777/@jEA8WSl0URsB/g/XYG5zCGBkMOyTeBZfGtbw3RJMIuk=.ed25519?foo=bar'
]

tape('isFeed', t => {
  t.true(R.isFeed(feedRef), 'isFeed')
  t.false(R.isFeed(feedRefFuture), 'isFeed false on non-classic feed')
  t.false(R.isFeed('@cat'), 'isFeed false on strings only prefixed with @')

  t.true(R.isFeedType(feedRef), 'isFeedType true for classic feed')
  t.true(R.isFeedType(feedRefFuture), 'isFeedType true for future feed')
  t.false(R.isFeedType('@cat'), 'isFeedType fails on strings prefixed with @')

  t.false(R.isFeedType(futureWithSuffix('.')), 'isFeedType (suffix must have character)')
  t.false(R.isFeedType(futureWithSuffix('.bab.bab')), 'isFeedType (suffic cannot have multiple .)')
  t.false(R.isFeedType(futureWithSuffix('.bab+2')), 'isFeedType (suffix cannot have just any \\w)')

  feedUrls.forEach(function (url) {
    t.equal(R.extract(url), feedRef, 'extract ' + url)
  })

  t.end()
})
