'use strict';

var SLOT = require('internal-slot');
var ToString = require('es-abstract/2024/ToString');
var Type = require('es-abstract/2024/Type');

var isSet = function isSet(set) {
	return SLOT.has(set, '[[es6set]]');
};
exports.isSet = isSet;

exports.requireSetSlot = function requireSetSlot(set, method) {
	if (Type(set) !== 'Object' || !isSet(set)) {
		throw new TypeError('Method Set.prototype.' + method + ' called on incompatible receiver ' + ToString(set));
	}
};
