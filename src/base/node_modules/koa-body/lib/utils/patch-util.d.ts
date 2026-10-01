import type { Context } from 'koa';
import type { Files } from 'formidable';
declare type PatchOptions = {
    isMultipart: string | boolean | null;
    isText: string | boolean | null;
    includeUnparsed: boolean;
    patchNode: boolean;
    patchKoa: boolean;
};
export declare type ContextWithBodyAndFiles = Context & {
    req: {
        body?: any;
        files?: Files;
    };
    request: {
        body?: any;
        files?: Files;
    };
};
export declare function patchNodeAndKoa(ctx: ContextWithBodyAndFiles, body: any, options: PatchOptions): void;
export {};
