import {AddressData} from './types';
const Ref = require('ssb-ref');

export function migrateOne(old: any): [string, AddressData] {
  if (!old) throw new Error('Cannot migrate undefined entry');
  if (!old.address) {
    try {
      old.address = Ref.toMultiServerAddress(old);
    } catch (err) {
      throw new Error(
        'Cannot migrate entry without field "address" ' +
          'or legacy {host,port,key}',
      );
    }
  }

  let copy: any;
  try {
    copy = JSON.parse(JSON.stringify(old));
  } catch (err) {
    throw new Error('Cannot migrate entry that is not serializable');
  }
  const address = copy.address;
  delete copy.address;
  return [address, copy];
}

export function migrateMany(olds: any): Record<string, AddressData> {
  if (!Array.isArray(olds)) return {};

  return olds.reduce((obj: any, old: any) => {
    try {
      const [address, data] = migrateOne(old);
      obj[address] = data;
    } catch (err: any) {
      console.warn(err.message || err);
    }
    return obj;
  }, {});
}
