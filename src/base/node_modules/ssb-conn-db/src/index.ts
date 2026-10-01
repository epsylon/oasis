import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {AddressData, ListenEvent, Opts} from './types';
import {migrateMany} from './migration';
import {selfHealingJSONCodec} from './atomic-file-codecs';
const atomic = require('atomic-file-rw') as Pick<
  typeof fs,
  'readFile' | 'writeFile'
>;
const Notify = require('pull-notify');
const msAddress = require('multiserver-address');
const debug = require('debug')('ssb:conn-db');

const defaultOpts: Opts = {
  path: path.join(os.homedir(), '.ssb'),
  writeTimeout: 2000,
};

type Updater = (prev: AddressData) => AddressData;

class ConnDB {
  private readonly _map?: Map<string, AddressData>;
  private readonly _notify?: CallableFunction & Record<string, any>;
  private readonly _writeTimeout: number;
  private readonly _loadedPromise: Promise<true>;
  private readonly _modernPath: string;
  private _closed: boolean;
  private _loadedResolve!: (val: true) => void;
  private _loadedReject!: (err: unknown) => void;
  private _scheduledWriteTask: NodeJS.Timeout | null;

  constructor(opts: Partial<Opts>) {
    const dirPath = opts.path ?? defaultOpts.path;
    const legacyPath = path.join(dirPath, 'gossip.json');
    this._modernPath = path.join(dirPath, 'conn.json');
    this._map = new Map<string, AddressData>();
    this._notify = Notify();
    this._writeTimeout =
      typeof opts.writeTimeout === 'number'
        ? opts.writeTimeout
        : defaultOpts.writeTimeout;
    this._scheduledWriteTask = null;
    this._closed = false;
    this._loadedPromise = new Promise((resolve, reject) => {
      this._loadedResolve = resolve;
      this._loadedReject = reject;
    });
    this._init(this._modernPath, legacyPath);
  }

  //#region INTERNAL

  private _fileExists(path: string, cb: (exists: boolean) => void) {
    if (typeof localStorage === 'undefined' || localStorage === null) {
      cb(fs.existsSync(path));
    } else {
      // in browser
      atomic.readFile(path, (err: unknown) => {
        if (err) cb(false);
        else cb(true);
      });
    }
  }

  private _init(modernPath: string, legacyPath: string) {
    this._fileExists(modernPath, (modernExists: boolean) => {
      this._fileExists(legacyPath, (legacyExists: boolean) => {
        if (!modernExists && !legacyExists) {
          atomic.writeFile(modernPath, '{}', 'utf8', () => {});
          this._loadedResolve(true);
          debug(
            'Created new conn.json because there was no existing ' +
              'conn.json nor gossip.json',
          );
          return;
        }

        if (!modernExists && legacyExists) {
          atomic.readFile(legacyPath, 'utf8', (err, data) => {
            if (err) {
              this._loadedReject(err);
              debug('Failed to load gossip.json, for creating conn.json');
              return;
            }
            const oldVals = JSON.parse(data.toString());
            const newVals = migrateMany(oldVals);
            const json = selfHealingJSONCodec.encode(newVals);
            atomic.writeFile(modernPath, json, 'utf8', (err2) => {
              if (err2) {
                this._loadedReject(err2);
                debug(
                  'Failed to create conn.json from an existing gossip.json',
                );
                return;
              }
              debug('Migrated gossip.json into conn.json');
              this._load(newVals);
            });
          });
          return;
        }

        if (modernExists) {
          atomic.readFile(modernPath, 'utf8', (err, data) => {
            if (err) {
              this._loadedReject(err);
              debug('Failed to load conn.json');
              return;
            }
            const vals = selfHealingJSONCodec.decode(data);
            this._load(vals);
          });
        }
      });
    });
  }

  private _load(vals: Record<string, AddressData>): void {
    for (const [addr, data] of Object.entries(vals)) {
      this._map!.set(addr, data);
    }
    this._loadedResolve(true);
    debug('Loaded conn.json into ConnDB in memory');
  }

  private _serialize(): Record<string, AddressData> {
    const record: Record<string, AddressData> = {};
    for (let [address, data] of this._map!.entries()) {
      record[address] = data;
    }
    return record;
  }

  private _write(cb?: (err: unknown) => void): void {
    if (!this._map) return;

    debug('Begun serializing and writing ConnDB into conn.json');
    const record = this._serialize();
    const json = selfHealingJSONCodec.encode(record);
    atomic.writeFile(this._modernPath, json, 'utf8', (err) => {
      if (!err) debug('Done serializing and writing ConnDB into conn.json');
      if (cb) cb(err);
    });
  }

  private _cancelScheduleWrite(): void {
    if (this._scheduledWriteTask) {
      clearTimeout(this._scheduledWriteTask);
    }
  }

  private _scheduleWrite(): void {
    this._cancelScheduleWrite();
    this._scheduledWriteTask = setTimeout(() => {
      this._write((_err: unknown) => {
        this._scheduledWriteTask = null;
      });
    }, this._writeTimeout);
  }

  private _assertNotClosed() {
    if (this._closed) {
      throw new Error('This ConnDB instance is closed, create a new one.');
    }
  }

  private _assertValidAddress(address: string) {
    if (!msAddress.check(address)) {
      throw new Error('The given address is not a valid multiserver-address');
    }
  }

  private _assertValidData(data: AddressData) {
    if (!data || typeof data !== 'object') {
      throw new Error('The given connection data should have been an object');
    }
  }

  //#endregion

  //#region PUBLIC API

  public replace(address: string, data: AddressData): ConnDB {
    this._assertNotClosed();
    this._assertValidAddress(address);
    this._assertValidData(data);

    const existed = this._map!.has(address);
    if (existed) {
      const {birth} = this._map!.get(address)!;
      this._map!.set(address, {birth: birth ?? Date.now(), ...data});
      this._notify!({type: 'update', address} as ListenEvent);
    } else {
      this._map!.set(address, {birth: Date.now(), ...data});
      this._notify!({type: 'insert', address} as ListenEvent);
    }
    this._scheduleWrite();
    return this;
  }

  public set(address: string, data: AddressData): ConnDB {
    this._assertNotClosed();
    this._assertValidAddress(address);
    this._assertValidData(data);

    const existed = this._map!.has(address);
    if (existed) {
      const previous = this._map!.get(address)!;
      this._map!.set(address, {
        birth: previous.birth ?? Date.now(),
        ...previous,
        ...data,
      });
      this._notify!({type: 'update', address} as ListenEvent);
    } else {
      this._map!.set(address, {birth: Date.now(), ...data});
      this._notify!({type: 'insert', address} as ListenEvent);
    }
    this._scheduleWrite();
    return this;
  }

  public update(address: string, x: AddressData | Updater): ConnDB {
    this._assertNotClosed();
    this._assertValidAddress(address);
    if (!x || (typeof x !== 'object' && typeof x !== 'function')) {
      throw new Error('update() expects an object or a function');
    }

    const existed = this._map!.has(address);
    if (!existed) return this;

    const previous = this._map!.get(address)!;
    const next = typeof x === 'function' ? x(previous) : x;
    this._map!.set(address, {
      birth: previous.birth ?? Date.now(),
      ...previous,
      ...next,
    });
    this._notify!({type: 'update', address} as ListenEvent);
    this._scheduleWrite();
    return this;
  }

  public get(address: string): AddressData | undefined {
    this._assertNotClosed();

    return this._map!.get(address);
  }

  public getAddressForId(id: string): string | undefined {
    this._assertNotClosed();

    for (let [address, data] of this._map!.entries()) {
      if (data.key === id) return address;
    }
    return undefined;
  }

  public has(address: string): boolean {
    this._assertNotClosed();

    return this._map!.has(address);
  }

  public delete(address: string): boolean {
    this._assertNotClosed();

    const hasDeleted = this._map!.delete(address);
    if (hasDeleted) {
      this._notify!({type: 'delete', address} as ListenEvent);
      this._scheduleWrite();
    }
    return hasDeleted;
  }

  public entries() {
    this._assertNotClosed();

    return this._map!.entries();
  }

  public listen() {
    this._assertNotClosed();

    return this._notify!.listen();
  }

  public loaded(): Promise<true> {
    this._assertNotClosed();

    return this._loadedPromise;
  }

  public close() {
    this._closed = true;
    this._cancelScheduleWrite();
    this._write();
    this._map?.clear();
    (this as any)._map = void 0;
    (this as any)._notify = void 0;
    (this as any)._stateFile = void 0;
    debug('Closed the ConnDB instance');
  }

  //#endregion
}

export = ConnDB;
