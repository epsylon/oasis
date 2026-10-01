"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
function toHttpMethod(method) {
    return types_1.HttpMethodEnum[method];
}
exports.default = toHttpMethod;
//# sourceMappingURL=string-method-to-enum-method.js.map