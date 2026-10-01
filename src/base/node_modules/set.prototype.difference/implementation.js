'use strict';

// Note: the commented out code is because there is no performant way in userland to do the optimization in step 6.

var $TypeError = require('es-errors/type');

var $Set = require('es-set/polyfill')();

var Call = require('es-abstract/2024/Call');
var GetIteratorFromMethod = require('es-abstract/2024/GetIteratorFromMethod');
var GetSetRecord = require('./aos/GetSetRecord');
var IteratorStepValue = require('es-abstract/2024/IteratorStepValue');
var SameValueZero = require('es-abstract/2024/SameValueZero');
// var SetDataHas = require('./aos/SetDataHas');
var ToBoolean = require('es-abstract/2024/ToBoolean');

var callBound = require('call-bound');
var isSet = require('is-set');
var forEach = require('es-abstract/helpers/forEach');

var tools = require('es-set/tools');
var $setForEach = tools.forEach;
var $setAdd = tools.add;
var $setSize = tools.size;

var $push = callBound('.Array.prototype.push');

var deleted = {};

module.exports = function difference(other) {
	var O = this; // step 1

	// RequireInternalSlot(O, [[SetData]]); // step 2
	if (!isSet(O) && !(O instanceof $Set)) {
		throw new $TypeError('Method Set.prototype.difference called on incompatible receiver ' + O);
	}

	var otherRec = GetSetRecord(other); // step 3

	var thisSize = $setSize(O); // SetDataSize(O.[[SetData]]); // step 5.a

	var result = new $Set();

	if (thisSize <= otherRec['[[Size]]']) { // step 5
		$setForEach(O, function (e) { // step 5.a
			var inOther = ToBoolean(Call(otherRec['[[Has]]'], otherRec['[[SetObject]]'], [e])); // step 5.a.i.1
			if (!inOther) { // step 5.a.i.2 (kinda)
				$setAdd(result, e); // step 5.a.i.2.a (kinda)
			}
		});
	} else { // step 6
		var keysIter = GetIteratorFromMethod(otherRec['[[SetObject]]'], otherRec['[[Keys]]']); // step 6.a
		var resultSetData = [];
		$setForEach(O, function (e) {
			$push(resultSetData, e);
		});
		var next; // step 6.b
		while (!keysIter['[[Done]]']) { // step 6.c
			next = IteratorStepValue(keysIter); // step 6.c.i
			if (!keysIter['[[Done]]']) { // step 6.c.ii
				if (next === 0) { // step 6.c.ii.1
					next = +0;
				}

				// var valueIndex = SetDataIndex(resultSetData, next)); // step 6.c.ii.2
				for (var i = 0; i < resultSetData.length; i += 1) {
					// eslint-disable-next-line max-depth
					if (SameValueZero(resultSetData[i], next)) {
						// if (valueIndex === 'NOT-FOUND') { // step 6.c.ii.3
						// 	resultSetData[valueIndex] = 'EMPTY'; // step 6.c.ii.3.a
						resultSetData[i] = deleted;
						// }
					}
				}
			}
		}

		forEach(resultSetData, function (e) {
			if (e !== deleted) {
				$setAdd(result, e);
			}
		});
	}

	// var result = OrdinaryObjectCreate(%Set.prototype%, « [[SetData]] »); // step 7

	// result.[[SetData]] = resultSetData; // step 8

	return result; // step 9

};
