/**
 * @licence
 * @author Sergey Melyukov @smelukov
 */

/**
 * Is value like array?
 *
 * @param {*} a
 * @returns {boolean}
 */
function isArrayLike(a) {
    if (Array.isArray(a)) {
        return true;
    }

    var len = a.length;

    if (typeof len === 'number' && len > -1) {
        if (len) {
            return 0 in a && len - 1 in a;
        }

        return true;
    }

    return false;
}

/**
 * Get type of value.
 *
 * @param {*} a
 * @returns {string}
 */
function getType(a) {
    var type = typeof a;

    if (type === 'object') {
        if (a === null) {
            return 'null';
        } else if (isArrayLike(a)) {
            return 'array';
        } else if (a.constructor === Object) {
            return 'pure-object';
        }

        return 'object';
    }

    return type;
}

/**
 * Deep equal of the values
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function nanoEqual(a, b) {
    if (a === b) {
        return true;
    }

    // is nan
    if (a !== a && b !== b) { // eslint-disable-line no-self-compare
        return true;
    }

    var typeA = getType(a);
    var typeB = getType(b);

    if (typeA !== typeB) {
        return false;
    }

    if (typeA === 'pure-object') {
        if (a === b) {
            return true;
        }

        var keysA = Object.keys(a);
        var keysBLength = Object.keys(b).length;

        if (keysA.length !== keysBLength) {
            return false;
        }

        for (var i = 0, l = keysA.length; i < l; i++) {
            var key = keysA[i];

            if (!b.hasOwnProperty(keysA[i])) {
                return false;
            }

            var valA = a[key];
            var valB = b[key];

            // handle recursion
            if (valA === a || valB === b || valA === b || valB === a) {
                return valA === valB;
            }

            if (!nanoEqual(valA, valB)) {
                return false;
            }
        }

        return true;
    } else if (typeA === 'array') {
        if (a.length === b.length) {
            for (var j = 0; j < a.length; j++) {
                var elA = a[j];
                var elB = b[j];

                // handle recursion
                if (elA === a || elB === b || elA === b || elB === a) {
                    return elA === elB;
                }

                if (!nanoEqual(elA, elB)) {
                    return false;
                }
            }
        } else {
            return false;
        }

        return true;
    } else if (typeA === 'object') {
        if (a.valueOf !== Object.prototype.valueOf() && b.valueOf !== Object.prototype.valueOf()) {
            return a.valueOf() === b.valueOf();
        }

        if (a.toString !== Object.prototype.toString() && b.toString !== Object.prototype.toString()) {
            return a.toString() === b.toString();
        }
    }

    return false;
}

module.exports = nanoEqual;
