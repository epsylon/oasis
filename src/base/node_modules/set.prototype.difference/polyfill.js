'use strict';

var Set = require('es-set/polyfill')();

var implementation = require('./implementation');

module.exports = function getPolyfill() {
	if (typeof Set.prototype.difference === 'function') {
		var called = false;
		var setLike = {
			size: Infinity,
			has: function () {},
			keys: function () {
				called = true;
				return [].values();
			}
		};

		new Set([1]).difference(setLike);
		setLike.size = 2147483648; // 2 ** 31
		new Set([1]).difference(setLike);

		if (!called) {
			return Set.prototype.difference;
		}
	}
	return implementation;
};
