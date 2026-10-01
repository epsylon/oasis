import {AddressData as DBData} from 'ssb-conn-db/lib/types';
import {ConnectionData as HubData} from 'ssb-conn-hub/lib/types';
import {StagedData} from 'ssb-conn-staging/lib/types';

export type Address = string;

export type Poolable = {
  pool: 'db' | 'hub' | 'staging';
};

export type Data = Poolable &
  Partial<DBData> &
  Partial<HubData> &
  Partial<StagedData>;

export type Peer = [Address, Data];
