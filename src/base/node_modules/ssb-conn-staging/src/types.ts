export type Address = string;

export type ListenEvent = Readonly<{
  type: 'staged' | 'unstaged';
  address: Address;
}>;

export type StagedData = Readonly<{
  key?: string;
  stagingBirth: number;
  stagingUpdated: number;
  [misc: string]: any;
}>;
