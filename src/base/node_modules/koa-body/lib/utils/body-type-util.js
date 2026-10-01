"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMultipartBody = exports.isTextBody = exports.isUrlencodedBody = exports.isJsonBody = void 0;
const jsonTypes = [
    'application/json',
    'application/json-patch+json',
    'application/vnd.api+json',
    'application/csp-report',
    'application/reports+json',
];
function isJsonBody(ctx, options) {
    return options.json && ctx.is(jsonTypes);
}
exports.isJsonBody = isJsonBody;
function isUrlencodedBody(ctx, options) {
    return options.urlencoded && ctx.is('urlencoded');
}
exports.isUrlencodedBody = isUrlencodedBody;
function isTextBody(ctx, options) {
    return options.text && ctx.is('text/*');
}
exports.isTextBody = isTextBody;
function isMultipartBody(ctx, options) {
    return options.multipart && ctx.is('multipart');
}
exports.isMultipartBody = isMultipartBody;
//# sourceMappingURL=body-type-util.js.map