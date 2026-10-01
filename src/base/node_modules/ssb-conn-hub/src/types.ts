export type Address = string;

export type ConnectionData = {
  key?: string;
  state: 'connecting' | 'connected' | 'disconnecting';
  inferredType?: 'bt' | 'dht' | 'internet' | 'lan' | 'tunnel';
  hubBirth: number;
  hubUpdated: number;
  disconnect?: (cb: (err?: any) => void) => void;
  [name: string]: any;
};

export type ListenEvent = {
  type:
    | ConnectionData['state']
    | 'connecting-failed'
    | 'disconnecting-failed'
    | 'disconnected';
  address: Address;
  key?: string;
  details?: any;
};
