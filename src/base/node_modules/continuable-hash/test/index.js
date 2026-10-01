var test = require("tape")

var continuableHash = require("../index")

test("continuable-hash is a function", function (assert) {
    assert.equal(typeof continuableHash, "function")
    assert.end()
})
