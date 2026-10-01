// @flow strict

export interface OpenDBRequest {
  result: IDBDatabase;
  error: Error;
  onupgradeneeded: $PropertyType<IDBOpenDBRequest, "onupgradeneeded">;
  onerror: (err: any) => mixed;
  onsuccess: (e: any) => mixed;
}

export interface IDBFactory {
  open(name: string, version?: number): IDBOpenDBRequest;
  deleteDatabase(name: string): IDBOpenDBRequest;
  cmp(a: any, b: any): -1 | 0 | 1;
}

export interface IDBRequest<x, a> extends EventTarget {
  result: a;
  error: x;
  source: ?(IDBIndex | IDBObjectStore<*, *> | IDBCursor);
  transaction: IDBTransaction;
  readyState: "pending" | "done";
  onerror: (err: any) => mixed;
  onsuccess: (e: any) => mixed;
}

export interface IDBOpenDBRequest extends IDBRequest<Error, IDBDatabase> {
  onblocked: (e: any) => mixed;
  onupgradeneeded: (e: any) => mixed;
}

export interface DOMStringList {
  +length: number;
  item(): string;
  contains(string): boolean;
}

export interface IDBDatabase extends EventTarget {
  close(): void;
  createObjectStore(
    name: string,
    options?: {
      keyPath?: ?(string | string[]),
      autoIncrement?: boolean
    }
  ): IDBObjectStore<*, *>;
  deleteObjectStore(name: string): void;
  createMutableFile(
    name: string,
    type: "text" | "binary/random"
  ): IDBRequest<Error, IDBMutableFile>;
  transaction(
    storeNames: string | string[],
    mode?: "readonly" | "readwrite" | "versionchange"
  ): IDBTransaction;
  name: string;
  version: number;
  objectStoreNames: DOMStringList;
  onabort: (e: any) => mixed;
  onclose: (e: any) => mixed;
  onerror: (e: any) => mixed;
  onversionchange: (e: any) => mixed;
}

export interface IDBTransaction extends EventTarget {
  abort(): void;
  db: IDBDatabase;
  error: Error;
  mode: "readonly" | "readwrite" | "versionchange";
  name: string;
  objectStore(name: string): IDBObjectStore<*, *>;
  onabort: (e: any) => mixed;
  oncomplete: (e: any) => mixed;
  onerror: (e: any) => mixed;
}

export interface IDBIndexParameters {
  unique?: boolean;
  multiEntry?: boolean;
  locale?: string;
}

export interface IDBObjectStore<k, v> {
  name: string;
  keyPath: any;

  +indexNames: string[];
  +transaction: IDBTransaction;
  +autoIncrement: boolean;

  add(value: v): IDBRequest<Error, null>;
  add(value: v, key: k): IDBRequest<Error, k>;
  delete(key: k | IDBKeyRange): IDBRequest<Error, void>;
  get(key: k | IDBKeyRange): IDBRequest<Error, v>;
  getKey(key: k | IDBKeyRange): IDBRequest<Error, k>;
  clear(): IDBRequest<Error, void>;

  createIndex(
    indexName: string,
    keyPath: string | string[],
    optionalParameter?: IDBIndexParameters
  ): IDBIndex;
  count(keyRange?: k | IDBKeyRange): IDBRequest<Error, number>;
  deleteIndex(indexName: string): void;
  index(indexName: string): IDBIndex;
  openCursor(
    range?: k | IDBKeyRange,
    direction?: IDBDirection
  ): IDBRequest<Error, IDBCursorWithValue>;
  openKeyCursor(
    range?: k | IDBKeyRange,
    direction?: IDBDirection
  ): IDBRequest<Error, IDBCursor>;
  put(value: v, key: k): IDBRequest<Error, k>;
}

export interface IDBMutableFile extends EventTarget {
  +name: string;
  +type: string;
  +database: IDBDatabase;

  onabort: ?EventHandler;
  onerror: ?EventHandler;

  open(mode?: "readonly" | "readwrite"): LockedFile;
  getFile(): IDBRequest<Error, File>;
}

export interface IDBFileMetadataParameters {
  size?: boolean;
  lastModified?: boolean;
}

export type ArrayBufferView =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | DataView

export interface IDBFileHandle extends EventTarget {
  +mutableFile: IDBMutableFile;
  +fileHandle: IDBMutableFile;
  +mode: "readonly" | "readwrite";
  +active: boolean;

  location: number;

  getMetadata(): IDBRequest<Error, { size: number, lastModified: Date }>;
  getMetadata({ size: true }): IDBRequest<Error, { size: number }>;
  getMetadata({ lastModified: true }): IDBRequest<
    Error,
    { lastModified: Date }
  >;
  getMetadata({ lastModified: true, size: true }): IDBRequest<
    Error,
    { size: number, lastModified: Date }
  >;

  readAsArrayBuffer(size: number): IDBRequest<Error, ArrayBuffer>;
  readAsText(size: number, encoding?: ?string): IDBRequest<Error, string>;
  write(string | ArrayBuffer | ArrayBufferView | Blob): IDBRequest<Error, void>;
  append(
    string | ArrayBuffer | ArrayBufferView | Blob
  ): IDBRequest<Error, void>;
  truncate(size?: number): IDBRequest<Error, void>;
  flush(): IDBRequest<Error, void>;
  abort(): void;

  oncomplete: ?EventHandler;
  onabort: ?EventHandler;
  onerror: ?EventHandler;
}

export type LockedFile = IDBFileHandle

export const indexedDB: IDBFactory = window.indexedDB
