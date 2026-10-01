'use strict';

var define = require('define-properties');
var setToStringTag = require('es-set-tostringtag');
var SLOT = require('internal-slot');

var GetIntrinsic = require('get-intrinsic');
var OrdinaryObjectCreate = require('es-abstract/2024/OrdinaryObjectCreate');

var addIterator = require('./helpers').addIterator;

var SetIterator = function SetIterator(it) {
	SLOT.set(this, '[[isSetIterator]]', true);
	SLOT.set(this, '[[it]]', it);
};

var IteratorPrototype = GetIntrinsic('%IteratorPrototype%', true);
if (IteratorPrototype) {
	SetIterator.prototype = OrdinaryObjectCreate(IteratorPrototype);
}
addIterator(SetIterator.prototype);

define(SetIterator.prototype, {
	next: function next() {
		if (!SLOT.has(this, '[[isSetIterator]]')) {
			throw new TypeError('Not a SetIterator');
		}
		return SLOT.get(this, '[[it]]').next();
	}
});

setToStringTag(SetIterator.prototype, 'Set Iterator');

module.exports = SetIterator;
