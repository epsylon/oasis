/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export function hash(a: number, b: number, c: number, d: number): void;
export function create_hasher(): number;
export function create_keyed(a: number, b: number): number;
export function create_derive(a: number, b: number): number;
export function __wbg_blake3hash_free(a: number): void;
export function blake3hash_reader(a: number): number;
export function blake3hash_update(a: number, b: number, c: number): void;
export function blake3hash_digest(a: number, b: number, c: number): void;
export function __wbg_hashreader_free(a: number): void;
export function hashreader_fill(a: number, b: number, c: number): void;
export function hashreader_set_position(a: number, b: number, c: number): void;
export function __wbindgen_malloc(a: number): number;
export function __wbindgen_free(a: number, b: number): void;
export function __wbindgen_realloc(a: number, b: number, c: number): number;
