import type { File, Options as FormidableOptions } from 'formidable';
import type { Options as CoBodyOptions } from 'co-body';
import type { Context } from 'koa';
import { z } from 'zod';
export declare enum HttpMethodEnum {
    POST = "POST",
    GET = "GET",
    PUT = "PUT",
    PATCH = "PATCH",
    DELETE = "DELETE",
    HEAD = "HEAD"
}
declare const HttpMethod: z.ZodNativeEnum<typeof HttpMethodEnum>;
export declare type HttpMethod = z.infer<typeof HttpMethod>;
export declare type ExtendedFormidableOptions = FormidableOptions & {
    onFileBegin?: (name: string, file: File) => void;
};
export declare const KoaBodyMiddlewareOptionsSchema: z.ZodObject<{
    /**
     * {Boolean} Patch request body to Node's ctx.req, default false
     *
     * Note: You can patch request body to Node or Koa in same time if you want.
     */
    patchNode: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * {Boolean} Patch request body to Koa's ctx.request, default true
     *
     * Note: You can patch request body to Node or Koa in same time if you want.
     */
    patchKoa: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * {String|Integer} The byte (if integer) limit of the JSON body, default 1mb
     */
    jsonLimit: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>>;
    /**
     * {String|Integer} The byte (if integer) limit of the form body, default 56kb
     */
    formLimit: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>>;
    /**
     * {String|Integer} The byte (if integer) limit of the text body, default 56kb
     */
    textLimit: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>>;
    /**
     * {String} Sets encoding for incoming form fields, default utf-8
     */
    encoding: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    /**
     * {Boolean} Parse multipart bodies, default false
     */
    multipart: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * {Boolean} Parse urlencoded bodies, default true
     */
    urlencoded: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * {Boolean} Parse text bodies, default true
     */
    text: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * {Boolean} Parse json bodies, default true
     */
    json: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * Toggles co-body strict mode; if true, only parses arrays or objects, default true
     */
    jsonStrict: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
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
    includeUnparsed: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    /**
     * {String[]} What HTTP methods to enable body parsing for; should be used in preference to strict mode.
     *
     * GET, HEAD, and DELETE requests have no defined semantics for the request body,
     * but this doesn't mean they may not be valid in certain use cases.
     * koa-body will only parse HTTP request bodies for POST, PUT, and PATCH by default
     *
     * see http://tools.ietf.org/html/draft-ietf-httpbis-p2-semantics-19#section-6.3
     */
    parsedMethods: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof HttpMethodEnum>, "many">>>;
}, "strip", z.ZodTypeAny, {
    json: boolean;
    encoding: string;
    multipart: boolean;
    patchNode: boolean;
    patchKoa: boolean;
    jsonLimit: string | number;
    formLimit: string | number;
    textLimit: string | number;
    urlencoded: boolean;
    text: boolean;
    jsonStrict: boolean;
    includeUnparsed: boolean;
    parsedMethods: HttpMethodEnum[];
}, {
    json?: boolean | undefined;
    encoding?: string | undefined;
    multipart?: boolean | undefined;
    patchNode?: boolean | undefined;
    patchKoa?: boolean | undefined;
    jsonLimit?: string | number | undefined;
    formLimit?: string | number | undefined;
    textLimit?: string | number | undefined;
    urlencoded?: boolean | undefined;
    text?: boolean | undefined;
    jsonStrict?: boolean | undefined;
    includeUnparsed?: boolean | undefined;
    parsedMethods?: HttpMethodEnum[] | undefined;
}>;
export declare type KoaBodyDirectOptions = z.infer<typeof KoaBodyMiddlewareOptionsSchema>;
export declare type KoaBodyMiddlewareOptions = KoaBodyDirectOptions & {
    onError?: (err: Error, ctx: Context) => void;
    formidable?: ExtendedFormidableOptions;
    queryString?: CoBodyOptions['queryString'];
};
export {};
