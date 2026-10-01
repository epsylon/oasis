import type { KoaBodyMiddlewareOptions } from '../types';
import type { Context } from 'koa';
export declare function isJsonBody(ctx: Context, options: KoaBodyMiddlewareOptions): string | false | null;
export declare function isUrlencodedBody(ctx: Context, options: KoaBodyMiddlewareOptions): string | false | null;
export declare function isTextBody(ctx: Context, options: KoaBodyMiddlewareOptions): string | false | null;
export declare function isMultipartBody(ctx: Context, options: KoaBodyMiddlewareOptions): string | false | null;
