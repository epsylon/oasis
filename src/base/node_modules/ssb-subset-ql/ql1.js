// SPDX-FileCopyrightText: 2021 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const { and, or, type, author } = require('ssb-db2/operators')

function validate(query) {
  if (!query) throw new Error('query should be truthy: ' + query)
  if (typeof query !== 'string' && typeof query !== 'object') {
    throw new Error('query should be a string or an object')
  }
  const obj = typeof query === 'string' ? JSON.parse(query) : query

  if (!obj.op) {
    throw new Error('query is missing "op" field ' + stringify(obj))
  } else if (obj.op === 'and' || obj.op === 'or') {
    if (!Array.isArray(obj.args)) {
      throw new Error('"args" field must be an array: ' + stringify(obj))
    }
    for (const arg of obj.args) {
      validate(arg)
    }
  } else if (obj.op === 'type') {
    if (typeof obj.string !== 'string') {
      throw new Error(
        '"type" in the query must have a "string" field: ' + stringify(obj)
      )
    }
  } else if (obj.op === 'author') {
    if (typeof obj.feed !== 'string') {
      throw new Error(
        '"author" in the query must have a "feed" field: ' + stringify(obj)
      )
    }
  } else {
    throw new Error('Unknown "op" field: ' + obj.op)
  }
}

function parse(query) {
  if (!query) return null
  try {
    if (typeof query === 'string') {
      const parsed = JSON.parse(query)
      validate(parsed)
      return parsed
    } else if (typeof query === 'object') {
      validate(query)
      return query
    } else {
      throw new Error('QL1 query should be an object or string: ' + query)
    }
  } catch (err) {
    console.warn('Error parsing QL1 query: ' + query)
    return null
  }
}

function toOperator(query, dedicated = false) {
  validate(query)
  const obj = parse(query)

  if (obj.op === 'and') {
    const args = obj.args.map((op) => toOperator(op, dedicated))
    return and(...args)
  } else if (obj.op === 'or') {
    const args = obj.args.map((op) => toOperator(op, dedicated))
    return or(...args)
  } else if (obj.op === 'type') {
    return type(obj.string, { dedicated })
  } else if (obj.op === 'author') {
    return author(obj.feed, { dedicated })
  }
}

function stringify(query) {
  return JSON.stringify(query)
}

function isEquals(q1, q2) {
  throw new Error(
    'QL1.isEquals() is not supported. In the general case, ' +
      'this seems to be an NP complete problem'
  )
}

module.exports = {
  validate,
  parse,
  toOperator,
  stringify,
  isEquals,
}
