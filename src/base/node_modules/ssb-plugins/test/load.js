const SecretStack = require('secret-stack')

const test = require('tape')
const { join } = require('path')

// for the stack
const ak = require('crypto').randomBytes(32).toString('base64')
let opt = { caps: {shs: ak}, timeout: 1000, temp: true }

test('load: secret-stack style', (t) => {

    // load our plugin
    const plugPath = join(process.cwd(), 'example')
    let plug = require('../load')(plugPath)
    // hand it to the stack and init
    let stack = SecretStack({}).use(plug)
    let bot = stack(opt)

    for (const fn of ['hello', 'callback', 'crash', 'goodbye']) {
        t.true(bot[fn], `has function ${fn}`)
    }

    console.error('call hello')
    bot.hello('alice', (err, greet) => {
        t.error(err)
        t.equal(greet, 'hello alice')
        console.log('goodbype')
        bot.goodbye((err, val) => {
            t.error(err)
            t.equal(val, 'done')
            bot.close(true, () => {
                t.end()
            })
        })
    })
})

test('load#2 - trigger callhost', (t) => {
    const plugPath = join(process.cwd(), 'example')
    let plug = require('../load')(plugPath)
    let stack = SecretStack(opt).use(plug)
    let bot = stack(opt)

    console.log('BOT', bot)
    bot.callhost((err, ret) => {
        console.log("CALLHOST", err, ret)
        t.error(err)
        var addr = bot.getAddress()
        t.comment('got addr:'+addr)
        t.deepEqual(ret, addr)
        console.log("goodbye")
        bot.goodbye((err, val) => {
            t.error(err)
            t.equal(val, 'done')
            bot.close(true, () => {
                t.end()
            })
        })
    })
})


test('load, with name: secret-stack style', (t) => {

    // load our plugin
    const plugPath = join(process.cwd(), 'example')
    let plug = require('../load')(plugPath, 'example')
    t.equal(plug.name, 'example')
    // hand it to the stack and init
    let stack = SecretStack(opt).use(plug)
    let bot = stack(opt)

    for (const fn of ['hello', 'callback', 'crash', 'goodbye']) {
        t.true(bot.example[fn], `has function ${fn}`)
    }

    bot.example.hello('alice', (err, greet) => {
        t.error(err)
        t.equal(greet, 'hello alice')
        console.log('goodbype')
        bot.example.goodbye((err, val) => {
            t.error(err)
            t.equal(val, 'done')
            bot.close(() => {
                t.end()
            })
        })
    })
})








