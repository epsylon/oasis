var tape = require('tape')
var R = require('../')

var msgId = '%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256'
var msgIdWithNumberAtStart = '%09abcdefghyq9KH6dYMc/g17L04jDbl1py8arGQmL1I=.sha256'

var secretMessage = '%WgVG9T2IryRoPMCQk7znuMt2Cmo/shgnrbn0wY6gc3M=.sha256?unbox=AZlrtZIJQiHqgwCaB0GgtIiFXha+XN5y6n5NJz/HtunP'
var cloaked = '%zoYYzPzPqekTHlErnLC29mrkofpPDuQbUh+DgQYD6H4=.cloaked'
var msgIdFuture = '%' + Buffer.from('the quick brown fox jumped!').toString('base64') + '.gabster-v2'

var msgUrls = [
  'http://localhost:7777/#/msg/%25pGzeEydYdHjKW1iIchR0Yumydsr3QSp8%2BFuYcwVwi8Q%3D.sha256',
  'http://localhost:7777/#/msg/%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256',
  'http://localhost:7777/%25pGzeEydYdHjKW1iIchR0Yumydsr3QSp8%2BFuYcwVwi8Q%3D.sha256',
  'http://localhost:7777/%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256',
  'http://localhost:7777/%25pGzeEydYdHjKW1iIchR0Yumydsr3QSp8%2BFuYcwVwi8Q%3D.sha256?foo=bar',
  'http://localhost:7777/%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256?foo=bar'
]

tape('msg', function (t) {
  t.true(R.isMsg(msgId), 'isMsg')
  t.false(R.isMsg(msgIdFuture), 'isMsg false if not not classic format')
  t.false(R.isMsg('%cat=.sha256'), 'isMsg false if not base64 body')

  t.true(R.isLink(msgId), 'isLink')
  t.true(R.isMsgLink(msgId), 'isMsgLink')

  t.true(R.isCloakedMsg(cloaked), 'isCloakedMsg')
  t.false(R.isCloakedMsg(msgId), 'isCloakedMsg false for classic msg')

  t.true(R.isMsgType(msgIdFuture), 'isMsgType')
  t.true(R.isMsgType(msgId), 'isMsgType (classic)')
  t.false(R.isMsgType('%cat=.sha256'), 'isMsgTpe false if not base64 body')

  t.deepEqual(
    R.parseLink(secretMessage),
    {
      link: '%WgVG9T2IryRoPMCQk7znuMt2Cmo/shgnrbn0wY6gc3M=.sha256',
      query: {
        unbox: 'AZlrtZIJQiHqgwCaB0GgtIiFXha+XN5y6n5NJz/HtunP'
      }
    },
    'parseLink'
  )
  t.true(R.isMsgLink(secretMessage), 'isMsgLink')

  t.equal(R.extract(msgId), msgId, 'extract ' + msgId)
  t.equal(R.extract(msgIdWithNumberAtStart), msgIdWithNumberAtStart, 'extract ' + msgIdWithNumberAtStart)
  msgUrls.forEach(function (url) {
    t.equal(R.extract(url), msgId, 'extract ' + url)
  })

  t.equal(R.extract(encodeURIComponent(msgId)), msgId, 'extract encodeURIComponent(msgId)')
  t.equal(R.extract(encodeURIComponent(msgIdWithNumberAtStart)), msgIdWithNumberAtStart, 'extract encodeURIComponent(msgId)')

  t.end()
})
