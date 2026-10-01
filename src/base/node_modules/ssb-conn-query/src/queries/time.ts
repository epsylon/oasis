import {Peer} from '../types';

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function passesExpBackoff(
  step: number,
  max: number = Infinity,
  timestamp: number = Date.now(),
) {
  return ([_addr, data]: Peer) => {
    const prevAttempt = data.stateChange! || 0;
    const numFailures = data.failure! || 0;
    const expBackoff = Math.min(Math.pow(2, numFailures) * step, max);
    const nextAttempt = prevAttempt + expBackoff;
    return nextAttempt < timestamp;
  };
}

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function passesGroupDebounce(
  groupMin: number,
  timestamp: number = Date.now(),
) {
  return (group: Array<Peer>) => {
    const newestStateChange = group.reduce(
      (max: number, [_addr, p]: Peer) => Math.max(max, p.stateChange || 0),
      0,
    );
    const minTimeThreshold: number = newestStateChange + groupMin;
    if (timestamp < minTimeThreshold) return [];
    else return group;
  };
}
