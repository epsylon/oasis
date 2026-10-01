'use strict';

var $Set = require('./polyfill')();

var callBind = require('call-bind');
var callBound = require('call-bind/callBound');
var gOPD = require('gopd');
var iterate = require('iterate-value');

var $nativeSetForEach = callBound('Set.prototype.forEach', true);
var $polyfillSetForEach = callBind($Set.prototype.forEach);
var forEach = function (set, callback) {
	if ($nativeSetForEach) {
		try {
			return $nativeSetForEach(set, callback);
		} catch (e) { /**/ }
	}
	try {
		return $polyfillSetForEach(set, callback);
	} catch (e) { /**/ }
	iterate(set, callback);
	return void undefined;
};

var $nativeSetAdd = callBound('Set.prototype.add', true);
var $polyfillSetAdd = $Set.prototype.add && callBind($Set.prototype.add);
var add = function (S, v) {
	if ($nativeSetAdd) {
		try {
			return $nativeSetAdd(S, v);
		} catch (e) { /**/ }
	}
	return $polyfillSetAdd(S, v);
};

var $nativeSetHas = callBound('Set.prototype.has', true);
var $polyfillSetHas = callBind($Set.prototype.has);
var has = function (set, key) {
	if ($nativeSetHas) {
		try {
			return $nativeSetHas(set, key);
		} catch (e) { /**/ }
	}
	return $polyfillSetHas(set, key);
};

var $nativeSetDelete = callBound('Set.prototype.delete', true);
var $polyfillSetDelete = callBind($Set.prototype['delete']);
var setDelete = function (set, key) {
	if ($nativeSetDelete) {
		try {
			return $nativeSetDelete(set, key);
		} catch (e) { /**/ }
	}
	return $polyfillSetDelete(set, key);
};

var $nativeSetSize = callBound('Set.prototype.size', true);
var $polyfillSetSize = gOPD ? callBind(gOPD($Set.prototype, 'size').get) : null;
var legacySetSize = function setSize(set) {
	var count = 0;
	forEach(set, function () {
		count += 1;
	});
	return count;
};
var size = function (S) {
	if ($nativeSetSize) {
		try {
			return $nativeSetSize(S);
		} catch (e) { /**/ }
	}
	if ($polyfillSetSize) {
		try {
			return $polyfillSetSize(S);
		} catch (e) { /**/ }
	}
	return legacySetSize(S);
};

module.exports = {
	add: add,
	'delete': setDelete,
	forEach: forEach,
	has: has,
	size: size
};
