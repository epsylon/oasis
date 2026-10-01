const pull = require('pull-stream');
const cat = require('pull-cat');
const Notify = require('pull-notify');
const msAddress = require('multiserver-address');
const debug = require('debug')('ssb:conn-staging');
import {ListenEvent, Address, StagedData} from './types';

class ConnStaging {
  private readonly _peers: Map<Address, StagedData>;
  private readonly _notifyEvent: any;
  private readonly _notifyEntries: any;
  private _closed: boolean;

  constructor() {
    this._peers = new Map<Address, StagedData>();
    this._closed = false;
    this._notifyEvent = Notify();
    this._notifyEntries = Notify();
  }

  //#region PRIVATE

  private _assertNotClosed() {
    if (this._closed) {
      throw new Error('This ConnStaging instance is closed, create a new one.');
    }
  }

  private _assertValidAddress(address: Address) {
    if (!msAddress.check(address)) {
      throw new Error('The given address is not a valid multiserver-address');
    }
  }

  private _updateLiveEntries() {
    this._notifyEntries(Array.from(this._peers.entries()));
  }

  //#endregion

  //#region PUBLIC API

  public stage(address: Address, data: Partial<StagedData>): boolean {
    this._assertNotClosed();
    this._assertValidAddress(address);

    const now = Date.now();
    if (this._peers.has(address)) {
      const previous = this._peers.get(address)!;
      this._peers.set(address, {...previous, stagingUpdated: now, ...data});
      this._updateLiveEntries();
      return false;
    } else {
      this._peers.set(address, {
        stagingBirth: now,
        stagingUpdated: now,
        ...data,
      });
      debug('staged peer %s', address);
      this._notifyEvent({type: 'staged', address} as ListenEvent);
      this._updateLiveEntries();
      return true;
    }
  }

  public unstage(address: Address): boolean {
    this._assertNotClosed();
    this._assertValidAddress(address);

    if (!this._peers.has(address)) return false;

    this._peers.delete(address);
    debug('unstaged peer %s', address);
    this._notifyEvent({type: 'unstaged', address} as ListenEvent);
    this._updateLiveEntries();
    return true;
  }

  public get(address: Address): StagedData | undefined {
    this._assertNotClosed();
    this._assertValidAddress(address);

    return this._peers.get(address);
  }

  public entries() {
    this._assertNotClosed();

    return this._peers.entries();
  }

  public liveEntries() {
    this._assertNotClosed();

    return cat([
      pull.values([Array.from(this._peers.entries())]),
      this._notifyEntries.listen(),
    ]);
  }

  public listen() {
    this._assertNotClosed();

    return this._notifyEvent.listen();
  }

  public close() {
    this._closed = true;
    this._notifyEvent.end();
    this._peers.clear();
    debug('closed the ConnStaging instance');
  }

  //#endregion
}

export = ConnStaging;
