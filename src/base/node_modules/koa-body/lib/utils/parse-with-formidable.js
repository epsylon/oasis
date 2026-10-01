"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const formidable_1 = __importDefault(require("formidable"));
function parseWithFormidable(ctx, options) {
    const { onFileBegin, ...directOptions } = options;
    const form = (0, formidable_1.default)({ multiples: true, ...directOptions });
    if (onFileBegin) {
        form.on('fileBegin', onFileBegin);
    }
    return new Promise((resolve, reject) => {
        form.parse(ctx.req, (error, fields, files) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({ fields, files });
        });
    });
}
exports.default = parseWithFormidable;
//# sourceMappingURL=parse-with-formidable.js.map