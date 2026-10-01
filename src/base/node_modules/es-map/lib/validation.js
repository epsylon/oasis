'use strict';

var SLOT = require('internal-slot');
var ToString = require('es-abstract/2024/ToString');
var Type = require('es-abstract/2024/Type');

var isMap = function isMap(map) {
	return SLOT.has(map, '[[es6map]]');
};
exports.isMap = isMap;

exports.requireMapSlot = function requireMapSlot(map, method) {
	if (Type(map) !== 'Object' || !isMap(map)) {
		throw new TypeError('Method Map.prototype.' + method + ' called on incompatible receiver ' + ToString(map));
	}
};
