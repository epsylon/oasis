import type { Fields, Files } from 'formidable';
import type { Context } from 'koa';
import type { ExtendedFormidableOptions } from '../types';
export declare type ParseWithFormidableResult = {
    fields: Fields;
    files: Files;
};
export default function parseWithFormidable(ctx: Context, options: ExtendedFormidableOptions): Promise<ParseWithFormidableResult>;
