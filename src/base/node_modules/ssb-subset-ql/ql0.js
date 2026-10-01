// SPDX-FileCopyrightText: 2021 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const Ref = require('ssb-ref')
const { and, author, type, isPrivate, isPublic } = require('ssb-db2/operators')
const deepEqual = require('nano-equal')

/**
 * @typedef {object} QueryQL0
 * @property {string} author
 * @property {string} type
 */

const EXPECTED_KEYS = ['author', 'type', 'private']

/**
 * @param {Partial<QueryQL0>} [query]
 * @returns {undefined}
 */
function validate(query) {
  if (!query) throw new Error('query should be truthy: ' + query)
  if (typeof query !== 'string' && typeof query !== 'object') {
    throw new Error('query should be a string or an object')
  }
  const obj = typeof query === 'string' ? JSON.parse(query) : query
  const keys = Object.keys(obj)
  if (keys.length > EXPECTED_KEYS.length) {
    throw new Error('query has too many fields: ' + obj)
  }
  for (const k of EXPECTED_KEYS) {
    if (!keys.includes(k)) {
      throw new Error(`query is missing the "${k}" field: ${obj}`)
    }
    if (k === 'author' && typeof obj[k] !== 'string') {
      throw new Error(`query "${k}" should be a string: ${JSON.stringify(obj)}`)
    } else if (k === 'type' && typeof obj[k] !== 'string' && obj[k] !== null) {
      throw new Error(
        `query "${k}" should be a string or null: ${JSON.stringify(obj)}"`
      )
    } else if (k === 'private' && typeof obj[k] !== 'boolean') {
      throw new Error(
        `query "${k}" should be a boolean: ${JSON.stringify(obj)}`
      )
    }
  }
  if (obj.private && obj.type) {
    throw new Error(
      `if "private" is true, then "type" MUST be null: ${JSON.stringify(obj)}`
    )
  }
  if (!Ref.isFeedId(obj.author)) {
    throw new Error(`query.author should be a valid SSB feed ID: ${obj}`)
  }
}

/**
 * @param {string | QueryQL0} [query]
 * @returns {QueryQL0}
 */
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
      throw new Error('QL0 query should be an object or string: ' + query)
    }
  } catch (err) {
    console.warn('Error parsing QL0 query: ' + JSON.stringify(query))
    return null
  }
}

/**
 * @param {string | QueryQL0} query
 * @param {boolean} dedicated
 * @returns {object}
 */
function toOperator(query, dedicated = false) {
  validate(query)
  const actualQuery = parse(query)
  if (actualQuery.private) {
    return and(author(actualQuery.author, { dedicated }), isPrivate())
  } else {
    return and(
      author(actualQuery.author, { dedicated }),
      type(actualQuery.type, { dedicated }),
      isPublic()
    )
  }
}

/**
 * @param {QueryQL0} query
 * @returns {string}
 */
function stringify(query) {
  validate(query)
  const { author, type, private } = query
  // Doesn't use JSON.stringify because we want to ensure this exact order
  if (type === null) {
    return `{"author":"${author}","type":null,"private":${private}}`
  } else {
    return `{"author":"${author}","type":"${type}","private":${private}}`
  }
}

/**
 * @param {string | QueryQL0} [q1]
 * @param {string | QueryQL0} [q2]
 * @returns {boolean}
 */
function isEquals(q1, q2) {
  const q1Obj = parse(q1)
  const q2Obj = parse(q2)
  return deepEqual(q1Obj, q2Obj)
}

module.exports = {
  validate,
  parse,
  toOperator,
  stringify,
  isEquals,
}
