"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchNodeAndKoa = void 0;
const unparsed_1 = __importDefault(require("../unparsed"));
function patchNodeAndKoa(ctx, body, options) {
    const { patchKoa, patchNode, isMultipart, includeUnparsed, isText } = options;
    if (patchNode) {
        if (isMultipart) {
            ctx.req.body = body.fields;
            ctx.req.files = body.files;
        }
        else if (includeUnparsed) {
            ctx.req.body = body.parsed || {};
            if (!isText) {
                ctx.req.body[unparsed_1.default] = body.raw;
            }
        }
        else {
            ctx.req.body = body;
        }
    }
    if (patchKoa) {
        if (isMultipart) {
            ctx.request.body = body.fields;
            ctx.request.files = body.files;
        }
        else if (includeUnparsed) {
            ctx.request.body = body.parsed || {};
            if (!isText) {
                ctx.request.body[unparsed_1.default] = body.raw;
            }
        }
        else {
            ctx.request.body = body;
        }
    }
}
exports.patchNodeAndKoa = patchNodeAndKoa;
//# sourceMappingURL=patch-util.js.map