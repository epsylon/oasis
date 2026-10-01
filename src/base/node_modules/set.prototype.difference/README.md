# set.prototype.difference <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

ES Proposal spec-compliant shim for Set.prototype.difference. Invoke its "shim" method to shim `Set.prototype.difference` if it is unavailable or noncompliant.

This package implements the [es-shim API](https://github.com/es-shims/api) interface. It works in an ES3-supported environment, and complies with the [proposed spec](https://github.com/tc39/proposal-set-methods). When shimmed, it uses [`es-set`](https://npmjs.com/es-set) to shim the `Set` implementation itself if needed.

Most common usage:
```js
var assert = require('assert');
var difference = require('set.prototype.difference');

var set1 = new Set([1, 2]);
var set2 = new Set([2, 3]);
var result = difference(set1, set2);

assert.deepEqual(result, new Set([1]));

difference.shim();

var shimmedResult = set1.difference(set2);
assert.deepEqual(shimmedResult, new Set([1]));
```

## Compatibility
node v22 and equivalent versions of Chrome have Set difference, but has a bug with set-like arguments with non-SMI integer sizes.

## Tests
Simply clone the repo, `npm install`, and run `npm test`

## Set Method Packages
 - [union](https://npmjs.com/set.prototype.union)
 - [intersection](https://npmjs.com/set.prototype.intersection)
 - [difference](https://npmjs.com/set.prototype.difference)
 - [symmetricDifference](https://npmjs.com/set.prototype.symmetricdifference)
 - [isSubsetOf](https://npmjs.com/set.prototype.issubsetof)
 - [isSupersetOf](https://npmjs.com/set.prototype.issupersetof)
 - [isDisjointFrom](https://npmjs.com/set.prototype.isdisjointfrom)

[package-url]: https://npmjs.com/package/set.prototype.difference
[npm-version-svg]: http://versionbadg.es/es-shims/Set.prototype.difference.svg
[deps-svg]: https://david-dm.org/es-shims/Set.prototype.difference.svg
[deps-url]: https://david-dm.org/es-shims/Set.prototype.difference
[dev-deps-svg]: https://david-dm.org/es-shims/Set.prototype.difference/dev-status.svg
[dev-deps-url]: https://david-dm.org/es-shims/Set.prototype.difference#info=devDependencies
[testling-svg]: https://ci.testling.com/es-shims/Set.prototype.difference.png
[testling-url]: https://ci.testling.com/es-shims/Set.prototype.difference
[npm-badge-png]: https://nodei.co/npm/set.prototype.difference.png?downloads=true&stars=true
[license-image]: http://img.shields.io/npm/l/set.prototype.difference.svg
[license-url]: LICENSE
[downloads-image]: http://img.shields.io/npm/dm/set.prototype.difference.svg
[downloads-url]: http://npm-stat.com/charts.html?package=set.prototype.difference
[codecov-image]: https://codecov.io/gh/es-shims/Set.prototype.difference/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/es-shims/Set.prototype.difference/
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfpocch.runkit.sh/es-shims/Set.prototype.difference
[actions-url]: https://github.com/es-shims/Set.prototype.difference/actions
