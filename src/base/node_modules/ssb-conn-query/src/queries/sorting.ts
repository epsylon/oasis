import {Peer} from '../types';

/**
 * THIS MUST BE DOCUMENTED IN THE ConnQuery CLASS, not here.
 */
export function sortByStateChange(peers: Array<Peer>) {
  return peers.sort((a, b) => a[1].stateChange! - b[1].stateChange!);
}
