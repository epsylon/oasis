'use strict';

var getPolyfill = require('./polyfill');
var define = require('define-properties');
var shimSet = require('es-set/shim');

module.exports = function shimSetDifference() {
	shimSet();

	var polyfill = getPolyfill();
	define(
		Set.prototype,
		{ difference: polyfill },
		{ difference: function () { return Set.prototype.difference !== polyfill; } }
	);

	return polyfill;
};
