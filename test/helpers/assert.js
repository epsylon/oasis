function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

function ok(value, msg) {
  if (!value) throw new Error(`${msg || 'ok'}: expected truthy, got ${JSON.stringify(value)}`);
}

function notOk(value, msg) {
  if (value) throw new Error(`${msg || 'notOk'}: expected falsy, got ${JSON.stringify(value)}`);
}

function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || 'deepEq'}: expected ${b} got ${a}`);
}

function arrEq(actual, expected, msg) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) throw new Error(`${msg || 'arrEq'}: not arrays`);
  if (actual.length !== expected.length) throw new Error(`${msg || 'arrEq'}: length ${actual.length} !== ${expected.length}`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) throw new Error(`${msg || 'arrEq'}: at ${i} expected ${expected[i]} got ${actual[i]}`);
  }
}

async function throwsAsync(fn, msgMatch) {
  try {
    await fn();
  } catch (e) {
    if (msgMatch instanceof RegExp) {
      if (!msgMatch.test(e.message)) throw new Error(`throwsAsync: expected ${msgMatch} to match, got "${e.message}"`);
    } else if (msgMatch && !String(e.message).includes(msgMatch)) {
      throw new Error(`throwsAsync: expected "${msgMatch}" in error, got "${e.message}"`);
    }
    return e;
  }
  throw new Error(`throwsAsync: expected throw${msgMatch ? ' with ' + msgMatch : ''}, none thrown`);
}

module.exports = { eq, ok, notOk, deepEq, arrEq, throwsAsync };
