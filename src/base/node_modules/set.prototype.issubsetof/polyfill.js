'use strict';

var Set = require('es-set/polyfill')();

var implementation = require('./implementation');

module.exports = function getPolyfill() {
	return typeof Set.prototype.isSubsetOf === 'function' ? Set.prototype.isSubsetOf : implementation;
};
