'use strict';

var implementation = require('./implementation');
var support = require('./lib/support');

module.exports = function getPolyfill() {
	if (
		typeof Map !== 'function'
		|| support.mapHasOldFirefoxInterface()
		|| !support.mapCompliantConstructor()
		|| !support.mapAcceptsArguments()
		|| !support.mapUsesSameValueZero()
		|| !support.mapSupportsChaining()
		|| !support.mapIterationFinishes()
	) {
		return implementation;
	}

	return Map;
};
