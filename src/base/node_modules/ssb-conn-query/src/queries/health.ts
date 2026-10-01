import {Peer} from '../types';

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function hasNoAttempts([_addr, p]: Peer): boolean {
  return !p.stateChange;
}

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function hasOnlyFailedAttempts([_addr, p]: Peer): boolean {
  return !!p.stateChange && (!p.duration || p.duration.mean == 0);
}

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function hasSuccessfulAttempts([_addr, p]: Peer): boolean {
  return !!p.duration && p.duration.mean > 0;
}

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function hasPinged([_addr, p]: Peer): boolean {
  return !!p.ping && !!p.ping.rtt && p.ping.rtt.mean > 0;
}
