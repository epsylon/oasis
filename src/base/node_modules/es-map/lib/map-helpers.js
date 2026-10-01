'use strict';

var Call = require('es-abstract/2024/Call');
var IsArray = require('es-abstract/2024/IsArray');
var IsCallable = require('es-abstract/2024/IsCallable');
var IteratorClose = require('es-abstract/2024/IteratorClose');
var IteratorStep = require('es-abstract/2024/IteratorStep');
var ToString = require('es-abstract/2024/ToString');
var Type = require('es-abstract/2024/Type');
var GetIterator = require('es-get-iterator');

var MapIterator = require('./map-iterator');
var isMap = require('./validation').isMap;

exports.fastkey = function fastkey(key) {
	switch (Type(key)) {
		case 'String': return '$' + key;
		case 'Null':
		case 'Undefined':
		case 'Boolean':
		case 'Number':
			return ToString(key);
		default: return null;
	}
};

var forEach = function forEach(map, fn, context) {
	var it = new MapIterator(map, 'key+value');

	for (var entry = it.next(); !entry.done; entry = it.next()) {
		if (typeof context === 'undefined') {
			fn(entry.value[1], entry.value[0], map);
		} else {
			Call(fn, context, [entry.value[1], entry.value[0], map]);
		}
	}
};
exports.forEach = forEach;

exports.addIterableToMap = function addIterableToMap(map, iterable) {
	if (IsArray(iterable) || typeof iterable === 'string') {
		for (var i = 0; i < iterable.length; i++) {
			var entry = iterable[i];
			if (Type(entry) !== 'Object') {
				throw new TypeError('Iterator value ' + entry + ' is not an entry object');
			}
			map.set(entry[0], entry[1]);
		}
	} else if (isMap(iterable)) {
		forEach(iterable, function (value, key) {
			map.set(key, value);
		});
	} else {
		var adder;
		var iterRecord;
		if (iterable != null) { // eslint-disable-line eqeqeq
			adder = map.set;
			if (!IsCallable(adder)) {
				throw new TypeError('bad map');
			}
			var iter = GetIterator(iterable);
			iterRecord = {
				'[[Done]]': false,
				'[[Iterator]]': iter,
				'[[NextMethod]]': iter.next
			};
		}
		if (typeof iterRecord === 'undefined') {
			throw new TypeError('Object is not iterable');
		}

		var next;
		while ((next = IteratorStep(iterRecord))) {
			var nextItem = next.value;
			try {
				if (Type(nextItem) !== 'Object') {
					throw new TypeError('Iterator value ' + nextItem + ' is not an entry object');
				}
				Call(adder, map, [nextItem[0], nextItem[1]]);
			} catch (e) {
				IteratorClose(iterRecord, true);
				throw e;
			}
		}
	}
};
