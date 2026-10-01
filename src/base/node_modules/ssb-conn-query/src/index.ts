import ConnDB = require('ssb-conn-db');
import ConnHub = require('ssb-conn-hub');
import ConnStaging = require('ssb-conn-staging');
import {Address, ConnectionData as HubData} from 'ssb-conn-hub/lib/types';
import {Peer} from './types';
import * as Time from './queries/time';
import * as Health from './queries/health';
import * as Sorting from './queries/sorting';

type HubEntry = [Address, HubData];

class ConnQuery {
  private db: ConnDB;
  private hub: ConnHub;
  private staging: ConnStaging;

  constructor(db: ConnDB, hub: ConnHub, staging: ConnStaging) {
    this.db = db;
    this.hub = hub;
    this.staging = staging;
  }

  private _hubEntryToPeer([address, hubData]: HubEntry): Peer {
    const stagingEntry = Array.from(this.staging.entries()).find(
      ([addr]) => addr === address,
    );

    const peer: Peer = this.db.has(address)
      ? [address, {pool: 'db', ...this.db.get(address)}]
      : !!stagingEntry
      ? [address, {pool: 'staging', ...stagingEntry[1]}]
      : [address, {pool: 'hub', ...hubData}];
    if (hubData.key && !peer[1].key) {
      (peer[1] as any).key = hubData.key;
    }
    return peer;
  }

  //#region PUBLIC API

  /**
   * Returns an array of all known peers, from all sources (ConnDB, ConnHub,
   * ConnStaging), either connected or disconnected.
   */
  public peersAll(): Array<Peer> {
    return this.peersConnectable('dbAndStaging').concat(
      this.peersInConnection(),
    );
  }

  /**
   * Returns an array of peer objects that we are currently connected to.
   */
  public peersConnected(): Array<Peer> {
    return Array.from(this.hub.entries())
      .filter(([_address, data]: HubEntry) => data.state === 'connected')
      .map((e: HubEntry) => this._hubEntryToPeer(e));
  }

  /**
   * Returns an array of peer objects that we are currently attempting to
   * connect with.
   */
  public peersConnecting(): Array<Peer> {
    return Array.from(this.hub.entries())
      .filter(([_address, data]: HubEntry) => data.state === 'connecting')
      .map((e: HubEntry) => this._hubEntryToPeer(e));
  }

  /**
   * Returns an array of peer objects that are either: currently connected to,
   * or currently attempting to connect with.
   */
  public peersInConnection(): Array<Peer> {
    return Array.from(this.hub.entries())
      .filter(
        ([_address, data]: HubEntry) =>
          data.state === 'connected' || data.state === 'connecting',
      )
      .map((e: HubEntry) => this._hubEntryToPeer(e));
  }

  /**
   * Returns an array of peer objects that are candidates for potential
   * connection, given a specified pool of candidates.
   *
   * @param pool (optional, default is `'db'`) A string with the possible values:
   * `'db'`, `'staging'`, `'dbAndStaging'`, referring to the pools
   * [ssb-conn-db](https://github.com/staltz/ssb-conn-db) and
   * [ssb-conn-staging](https://github.com/staltz/ssb-conn-staging).
   */
  public peersConnectable(
    pool: 'db' | 'staging' | 'dbAndStaging' = 'db',
  ): Array<Peer> {
    const useDB = pool === 'db' || pool === 'dbAndStaging';
    const useStaging = pool === 'staging' || pool === 'dbAndStaging';

    const dbPool: Array<Peer> = useDB
      ? Array.from(this.db.entries()).map(([addr, data]) => [
          addr,
          {pool: 'db', ...data},
        ])
      : [];
    const stagingPool: Array<Peer> = useStaging
      ? Array.from(this.staging.entries()).map(([addr, data]) => [
          addr,
          {pool: 'staging', ...data},
        ])
      : [];

    return ([] as Array<[string, any]>)
      .concat(dbPool)
      .concat(stagingPool)
      .filter(([address]) => {
        const state = this.hub.getState(address);
        return state !== 'connected' && state !== 'connecting';
      });
  }

  //#endregion

  //#region QUERIES

  /**
   * Answers whether a peer has passed an 'exponential backoff' check, relative
   * to a given timestamp (or `Date.now()` if no timestamp is provided). The
   * exponential backoff is a certain time gap counting from the latest
   * stateChange timestamp, and this gap grows with the number of connection
   * failures that have occurred for this peer.
   *
   * @param step A temporal parameter (measured in milliseconds) for how much
   * the exponential backoff grows for each connection failure.
   * @param max (optional, default is `Infinity`) The maximum time gap (in
   * milliseconds) for the exponential backoff.
   * @param timestamp (optional, default is `Date.now()`) The timestamp to
   * compare the exponential backoff with. If the time gap between the latest
   * stateChange and the exponential backoff is less than this timestamp, this
   * check passes.
   */
  static passesExpBackoff = Time.passesExpBackoff;

  /**
   * Answers whether a group of peers (as an array) has had enough time gap
   * since the last stateChange for any peer. This is known as a "debounce". The
   * time gap is determined by the 'groupMin' argument, the first argument.
   * @param groupMin A temporal parameter (measured in milliseconds) for how
   * long the time gap should last.
   * @param timestamp (optional, default is Date.now()) The timestamp to compare
   * the time gap with. If the time gap between the latest stateChange (for any
   * peer) is less than this timestapm, this check passes.
   */
  static passesGroupDebounce = Time.passesGroupDebounce;

  /**
   * Answers whether a peer has not had a connection attempt yet.
   */
  static hasNoAttempts = Health.hasNoAttempts;

  /**
   * Answers whether a peer has never been successfully connected to yet, but
   * has been tried.
   */
  static hasOnlyFailedAttempts = Health.hasOnlyFailedAttempts;

  /**
   * Answers whether a peer has had some successful connection in the past.
   */
  static hasSuccessfulAttempts = Health.hasSuccessfulAttempts;

  /**
   * Answers whether a peer has successfully pinged us in the past.
   */
  static hasPinged = Health.hasPinged;

  /**
   * Sorts an array of peers from oldest 'stateChange' timestamp to newest.
   */
  static sortByStateChange = Sorting.sortByStateChange;

  //#endregion
}

export = ConnQuery;
