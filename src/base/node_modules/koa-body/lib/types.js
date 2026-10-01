"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KoaBodyMiddlewareOptionsSchema = exports.HttpMethodEnum = void 0;
const zod_1 = require("zod");
var HttpMethodEnum;
(function (HttpMethodEnum) {
    HttpMethodEnum["POST"] = "POST";
    HttpMethodEnum["GET"] = "GET";
    HttpMethodEnum["PUT"] = "PUT";
    HttpMethodEnum["PATCH"] = "PATCH";
    HttpMethodEnum["DELETE"] = "DELETE";
    HttpMethodEnum["HEAD"] = "HEAD";
})(HttpMethodEnum = exports.HttpMethodEnum || (exports.HttpMethodEnum = {}));
const HttpMethod = zod_1.z.nativeEnum(HttpMethodEnum);
exports.KoaBodyMiddlewareOptionsSchema = zod_1.z.object({
    /**
     * {Boolean} Patch request body to Node's ctx.req, default false
     *
     * Note: You can patch request body to Node or Koa in same time if you want.
     */
    patchNode: zod_1.z.boolean().optional().default(false),
    /**
     * {Boolean} Patch request body to Koa's ctx.request, default true
     *
     * Note: You can patch request body to Node or Koa in same time if you want.
     */
    patchKoa: zod_1.z.boolean().optional().default(true),
    /**
     * {String|Integer} The byte (if integer) limit of the JSON body, default 1mb
     */
    jsonLimit: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().default('1mb'),
    /**
     * {String|Integer} The byte (if integer) limit of the form body, default 56kb
     */
    formLimit: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().default('56kb'),
    /**
     * {String|Integer} The byte (if integer) limit of the text body, default 56kb
     */
    textLimit: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().default('56kb'),
    /**
     * {String} Sets encoding for incoming form fields, default utf-8
     */
    encoding: zod_1.z.string().optional().default('utf-8'),
    /**
     * {Boolean} Parse multipart bodies, default false
     */
    multipart: zod_1.z.boolean().optional().default(false),
    /**
     * {Boolean} Parse urlencoded bodies, default true
     */
    urlencoded: zod_1.z.boolean().optional().default(true),
    /**
     * {Boolean} Parse text bodies, default true
     */
    text: zod_1.z.boolean().optional().default(true),
    /**
     * {Boolean} Parse json bodies, default true
     */
    json: zod_1.z.boolean().optional().default(true),
    /**
     * Toggles co-body strict mode; if true, only parses arrays or objects, default true
     */
    jsonStrict: zod_1.z.boolean().optional().default(true),
    /**
       * Toggles co-body returnRawBody mode; if true,
       * the raw body will be available using a Symbol for 'unparsedBody'.
       *
       * ```
       // Either:
       const unparsed = require('koa-body/unparsed.js');
       const unparsed = Symbol.for('unparsedBody');
  
       // Then later, to access:
       ctx.request.body[unparsed]
       ```
       * default false
       */
    includeUnparsed: zod_1.z.boolean().optional().default(false),
    /**
     * {String[]} What HTTP methods to enable body parsing for; should be used in preference to strict mode.
     *
     * GET, HEAD, and DELETE requests have no defined semantics for the request body,
     * but this doesn't mean they may not be valid in certain use cases.
     * koa-body will only parse HTTP request bodies for POST, PUT, and PATCH by default
     *
     * see http://tools.ietf.org/html/draft-ietf-httpbis-p2-semantics-19#section-6.3
     */
    parsedMethods: zod_1.z
        .array(HttpMethod)
        .optional()
        .default([HttpMethodEnum.POST, HttpMethodEnum.PUT, HttpMethodEnum.PATCH]),
});
//# sourceMappingURL=types.js.map