'use strict';

var hasSymbols = require('has-symbols')();
var SLOT = require('internal-slot');
var entries = require('object.entries');
var forEach = require('for-each');
var GetIntrinsic = require('get-intrinsic');
var DefinePropertyOrThrow = require('es-abstract/2024/DefinePropertyOrThrow');
var OrdinaryObjectCreate = require('es-abstract/2024/OrdinaryObjectCreate');
var Type = require('es-abstract/2024/Type');

var $ObjectCreate = GetIntrinsic('%Object.create%', true);

var hasProto = !({ __proto__: null } instanceof Object);

exports.emptyObject = function () {
	if ($ObjectCreate) {
		return $ObjectCreate(null);
	}
	if (hasProto) {
		return { __proto__: null };
	}
	return {};
};

// eslint-disable-next-line max-params
exports.emulateES6construct = function (o, defaultNewTarget, defaultProto, slots) {
	/*
	 * This is an es5 approximation to es6 construct semantics. in es6,
	 * 'new Foo' invokes Foo.[[Construct]] which (for almost all objects)
	 * just sets the internal variable NewTarget (in es6 syntax `new.target`)
	 * to Foo and then returns Foo().
	 */

	/*
	 * Many ES6 object then have constructors of the form:
	 * 1. If NewTarget is undefined, throw a TypeError exception
	 * 2. Let xxx by OrdinaryCreateFromConstructor(NewTarget, yyy, zzz)
	 */

	// So we're going to emulate those first two steps.
	if (Type(o) !== 'Object') {
		throw new TypeError('Constructor requires `new`: ' + defaultNewTarget.name);
	}
	var proto = defaultNewTarget.prototype;
	if (Type(proto) !== 'Object') {
		proto = defaultProto;
	}

	var obj = OrdinaryObjectCreate(proto);
	forEach(entries(slots), function (entry) {
		var key = entry[0];
		var value = entry[1];
		SLOT.set(obj, key, value);
	});

	return obj;
};

/*
 * This is a private name in the es6 spec, equal to '[Symbol.iterator]'
 * we're going to use an arbitrary _-prefixed name to make our shims
 * work properly with each other, even though we don't have full Iterator
 * support. That is, `Array.from(map.keys())` will work, but we don't
 * pretend to export a "real" Iterator interface.
 */
var $iterator$ = hasSymbols && typeof Symbol.iterator === 'symbol' ? Symbol.iterator : '_es6-shim iterator_';
/*
 * Firefox ships a partial implementation using the name @@iterator.
 * https://bugzilla.mozilla.org/show_bug.cgi?id=907077#c14
 * So use that name if we detect it.
 */
if (typeof []['@@iterator'] === 'function') {
	$iterator$ = '@@iterator';
}

exports.addIterator = function (prototype, impl) {
	var implementation = impl || function iterator() {
		// eslint-disable-next-line no-invalid-this
		return this;
	};
	DefinePropertyOrThrow(prototype, $iterator$, {
		'[[Configurable]]': true,
		'[[Enumerable]]': false,
		'[[Value]]': implementation,
		'[[Writable]]': true
	});
	if (!prototype[$iterator$] && typeof $iterator$ === 'symbol') {
		// implementations are buggy when $iterator$ is a Symbol
		// eslint-disable-next-line no-param-reassign
		prototype[$iterator$] = implementation;
	}
};
