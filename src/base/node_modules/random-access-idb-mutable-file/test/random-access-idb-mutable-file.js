/* @flow */

import RandomAccess from "../"
import test from "blue-tape"

test("test API", async test => {
  test.ok(isClass(RandomAccess), "default export is a class")
  test.ok(isFunction(RandomAccess.mount), ".mount is a function")
})

const isFunction = value => typeof value === "function"

const isClass = (value /*: any*/) => {
  return (
    typeof value === "function" &&
    typeof value.prototype === "object" &&
    value.prototype.constructor === value
  )
}
