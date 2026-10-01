"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function throwableToError(e) {
    if (e instanceof Error) {
        return e;
    }
    const error = new Error(typeof e === 'object' ? JSON.stringify(e) : '' + e);
    error.name = typeof e;
    error.stack = undefined;
    return error;
}
exports.default = throwableToError;
//# sourceMappingURL=throwable-to-error.js.map