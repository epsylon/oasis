import type { KoaBodyMiddlewareOptions } from './types';
import type { Middleware } from 'koa';
import * as Koa from 'koa';
import type { Files } from 'formidable';
export * from './types';
declare module 'koa' {
    interface Request extends Koa.BaseRequest {
        body?: any;
        files?: Files;
    }
}
export declare function koaBody(options?: Partial<KoaBodyMiddlewareOptions>): Middleware;
export default koaBody;
