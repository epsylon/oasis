"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.koaBody = void 0;
const types_1 = require("./types");
const co_body_1 = __importDefault(require("co-body"));
const string_method_to_enum_method_1 = __importDefault(require("./utils/string-method-to-enum-method"));
const throwable_to_error_1 = __importDefault(require("./utils/throwable-to-error"));
const body_type_util_1 = require("./utils/body-type-util");
const parse_with_formidable_1 = __importDefault(require("./utils/parse-with-formidable"));
const patch_util_1 = require("./utils/patch-util");
__exportStar(require("./types"), exports);
function koaBody(options = {}) {
    const validatedOptions = types_1.KoaBodyMiddlewareOptionsSchema.parse(options);
    const optionsToUse = { ...options, ...validatedOptions };
    return async (ctx, next) => {
        const isJson = (0, body_type_util_1.isJsonBody)(ctx, optionsToUse);
        const isText = (0, body_type_util_1.isTextBody)(ctx, optionsToUse);
        const isUrlencoded = (0, body_type_util_1.isUrlencodedBody)(ctx, optionsToUse);
        const isMultipart = (0, body_type_util_1.isMultipartBody)(ctx, optionsToUse);
        const { encoding, jsonStrict, jsonLimit, includeUnparsed: returnRawBody, formLimit, textLimit, queryString, formidable, onError, patchNode, patchKoa, } = optionsToUse;
        // only parse the body on specifically chosen methods
        if (validatedOptions.parsedMethods.includes((0, string_method_to_enum_method_1.default)(ctx.method.toUpperCase()))) {
            try {
                if (isJson) {
                    const jsonBody = await co_body_1.default.json(ctx, {
                        encoding,
                        limit: jsonLimit,
                        strict: jsonStrict,
                        returnRawBody,
                    });
                    (0, patch_util_1.patchNodeAndKoa)(ctx, jsonBody, {
                        isText,
                        includeUnparsed: returnRawBody,
                        isMultipart,
                        patchKoa,
                        patchNode,
                    });
                }
                else if (isUrlencoded) {
                    const urlEncodedBody = await co_body_1.default.form(ctx, {
                        encoding,
                        limit: formLimit,
                        queryString: queryString,
                        returnRawBody,
                    });
                    (0, patch_util_1.patchNodeAndKoa)(ctx, urlEncodedBody, {
                        isText,
                        includeUnparsed: returnRawBody,
                        isMultipart,
                        patchKoa,
                        patchNode,
                    });
                }
                else if (isText) {
                    const textBody = await co_body_1.default.text(ctx, {
                        encoding,
                        limit: textLimit,
                        returnRawBody,
                    });
                    (0, patch_util_1.patchNodeAndKoa)(ctx, textBody, {
                        isText,
                        includeUnparsed: returnRawBody,
                        isMultipart,
                        patchKoa,
                        patchNode,
                    });
                }
                else if (isMultipart) {
                    const multipartBody = await (0, parse_with_formidable_1.default)(ctx, formidable || {});
                    (0, patch_util_1.patchNodeAndKoa)(ctx, multipartBody, {
                        isText,
                        includeUnparsed: returnRawBody,
                        isMultipart,
                        patchKoa,
                        patchNode,
                    });
                }
            }
            catch (parsingError) {
                const error = (0, throwable_to_error_1.default)(parsingError);
                if (typeof onError === 'function') {
                    onError(error, ctx);
                }
                else {
                    throw error;
                }
            }
        }
        else {
            (0, patch_util_1.patchNodeAndKoa)(ctx, {}, {
                isText,
                includeUnparsed: returnRawBody,
                isMultipart,
                patchKoa,
                patchNode,
            });
        }
        return next();
    };
}
exports.koaBody = koaBody;
exports.default = koaBody;
//# sourceMappingURL=index.js.map