var test = require("tape")

var list = require("../index")

test("list is a function", function (assert) {
    assert.equal(typeof list, "function")
    assert.end()
})
