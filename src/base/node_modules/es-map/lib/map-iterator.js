'use strict';

var SLOT = require('internal-slot');
var setToStringTag = require('es-set-tostringtag');

var GetIntrinsic = require('get-intrinsic');
var CreateIterResultObject = require('es-abstract/2024/CreateIterResultObject');
var DefineMethodProperty = require('es-abstract/2024/DefineMethodProperty');
var OrdinaryObjectCreate = require('es-abstract/2024/OrdinaryObjectCreate');

var requireMapSlot = require('./validation').requireMapSlot;
var addIterator = require('./helpers').addIterator;

var MapIterator = function MapIterator(map, kind) {
	requireMapSlot(map, '[[MapIterator]]');

	SLOT.set(this, '[[isMapIterator]]', true);

	var head = SLOT.get(map, '[[head]]');
	SLOT.set(this, '[[i]]', head);
	SLOT.set(this, '[[head]]', head);
	SLOT.set(this, '[[kind]]', kind);
};

var IteratorPrototype = GetIntrinsic('%IteratorPrototype%', true);
if (IteratorPrototype) {
	MapIterator.prototype = OrdinaryObjectCreate(IteratorPrototype);
}
addIterator(MapIterator.prototype);

DefineMethodProperty(
	MapIterator.prototype,
	'next',
	function next() {
		/* eslint no-invalid-this: 0 */
		if (!SLOT.has(this, '[[isMapIterator]]')) {
			throw new TypeError('Not a MapIterator');
		}
		var i = SLOT.get(this, '[[i]]');
		var kind = SLOT.get(this, '[[kind]]');
		var head = SLOT.get(this, '[[head]]');
		if (typeof i === 'undefined') {
			return CreateIterResultObject(void undefined, true);
		}
		while (i.isRemoved() && i !== head) {
			// back up off of removed entries
			i = i.prev;
		}
		// advance to next unreturned element.
		var result;
		while (i.next !== head) {
			i = i.next;
			if (!i.isRemoved()) {
				if (kind === 'key') {
					result = i.key;
				} else if (kind === 'value') {
					result = i.value;
				} else {
					result = [i.key, i.value];
				}
				SLOT.set(this, '[[i]]', i);
				return CreateIterResultObject(result, false);
			}
		}
		// once the iterator is done, it is done forever.
		SLOT.set(this, '[[i]]', void undefined);
		return CreateIterResultObject(void undefined, true);
	},
	false
);

setToStringTag(MapIterator.prototype, 'Map Iterator');

module.exports = MapIterator;
