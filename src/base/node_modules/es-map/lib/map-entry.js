'use strict';

var MapEntry = function MapEntry(key, value) {
	this.key = key;
	this.value = value;
	this.next = null;
	this.prev = null;
};

MapEntry.empty = {};

MapEntry.prototype.isRemoved = function isRemoved() {
	return this.key === MapEntry.empty;
};

module.exports = MapEntry;
