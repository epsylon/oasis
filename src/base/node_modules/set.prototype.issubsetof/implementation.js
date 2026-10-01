'use strict';

var $TypeError = require('es-errors/type');

var $Set = require('es-set/polyfill')();

var Call = require('es-abstract/2024/Call');
var GetSetRecord = require('./aos/GetSetRecord');
var ToBoolean = require('es-abstract/2024/ToBoolean');

var isSet = require('is-set');

var tools = require('es-set/tools');
var $setForEach = tools.forEach;
var $setSize = tools.size;

module.exports = function isSubsetOf(other) {
	var O = this; // step 1

	// RequireInternalSlot(O, [[SetData]]); // step 2
	if (!isSet(O) && !(O instanceof $Set)) {
		throw new $TypeError('Method Set.prototype.isSubsetOf called on incompatible receiver ' + O);
	}

	var otherRec = GetSetRecord(other); // step 3

	var thisSize = $setSize(O); // SetDataSize(O.[[SetData]]); // step 4

	if (thisSize > otherRec['[[Size]]']) {
		return false; // step 5
	}
	try {
		var index = 0; // step 6
		$setForEach(O, function (e) {
			if (index < thisSize) { // step 7
				var inOther = ToBoolean(Call(otherRec['[[Has]]'], otherRec['[[Set]]'], [e])); // step 7.c.i
				if (!inOther) {
				// eslint-disable-next-line no-throw-literal
					throw false; // step 7.c.ii, kinda
				}
				thisSize = $setSize(O); // step 7.c.iv
			}
		});
	} catch (e) {
		if (e === false) {
			return false; // step 7.c.ii, the rest
		}
		throw e;
	}
	return true; // step 8
};
