/**
 * ssb-typescript
 * --------------
 *
 * Contains type definitions for common SSB concepts.
 *
 *     npm install ssb-typescript
 *
 * Usage:
 *
 *     import {Msg} from 'ssb-typescript';
 */

/**
 * Starts with @
 */
export type FeedId = string;

/**
 * Starts with %
 */
export type MsgId = string;

/**
 * Starts with &
 */
export type BlobId = string;

export interface Msg<C = Content> {
  key: MsgId;
  value: {
    previous: MsgId;
    author: FeedId;
    sequence: number;
    timestamp: number;
    hash: 'sha256';
    content: C;
    signature: string;
  };
  timestamp: number;
}

export type MsgInThread = Msg<{
  root?: MsgId;
  fork?: MsgId;
  branch?: MsgId;
}>;

export interface UnboxedMsg<C = Content> extends Msg<C> {
  value: Msg<C>['value'] & {
    cyphertext: string;
    private: true;
    unbox: string;
  };
  meta?: {
    private: true;
    originalContent: string;
  };
}

export type Privatable<T> = T & {recps?: Array<FeedId>};

export type Content =
  | Privatable<PostContent>
  | Privatable<ContactContent>
  | Privatable<VoteContent>
  | Privatable<AboutContent>
  | Privatable<BlogContent>
  | Privatable<AliasContent>
  | Privatable<GatheringContent>
  | Privatable<GatheringUpdateContent>
  | Privatable<AttendeeContent>
  | null;

export interface PostContent {
  type: 'post';
  text: string;
  channel?: string;

  /**
   * Links
   */
  mentions?: Array<any>;
  root?: MsgId;
  branch?: MsgId | Array<MsgId>;
  fork?: MsgId;
  // recps: FeedLinks;
  // mentions: Links;
}

export interface AboutContent {
  type: 'about';
  about: FeedId;
  name?: string;
  description?: string;
  image?: string;
}

export interface ContactContent {
  type: 'contact';
  contact?: FeedId;
  following?: boolean;
  blocking?: boolean;
}

export interface VoteContent {
  type: 'vote';
  vote: {
    link: MsgId;
    value: number;
    expression: string;
  };
}

export interface BlogContent {
  type: 'blog';
  title: string;
  summary: string;
  channel?: string;
  thumbnail?: string;
  blog: string;

  /**
   * Links
   */
  mentions?: Array<any>;
  root?: MsgId;
  branch?: MsgId | Array<MsgId>;
  fork?: MsgId;
}

export interface AliasContent {
  type: 'room/alias';
  action?: 'registered' | 'revoked';
  alias?: string;
  aliasURL?: string;
  room?: FeedId;
}

export interface GatheringContent {
  type: 'gathering';

  /**
   * The message that spawned this gathering
   */
  progenitor?: MsgId;

  /**
   * People to notify
   */
  mentions?: Array<FeedId>;
}

export interface GatheringUpdateContent {
  type: 'about';

  /**
   * SHOULD point to a `type: 'gathering'` message.
   */
  about: MsgId;
  title?: string;
  description?: string;
  location?: string;
  startDateTime?: {
    epoch?: number;
    tz?: string;
    bias?: number;
    silent?: boolean;
  };
  image?: {
    link: BlobId;
    name?: string;
    size?: number;

    /**
     * mimetype
     */
    type?: string;
  };
}

export interface AttendeeContent {
  type: 'about';

  /**
   * SHOULD point to a `type: 'gathering'` message.
   */
  about: MsgId;
  attendee: {
    link: FeedId;
    remove?: true;
  };
}

export interface About {
  name?: string;
  description?: string;
  color?: string;
  imageUrl?: string;
  id?: FeedId;

  /**
   * true means following
   * null means not-following
   * false means blocked
   */
  following?: true | null | false;
}

export interface PeerMetadata {
  host: string;
  port: number;
  key: string;
  name?: string;
  source: 'local' | 'pub' | 'manual';
  announcers?: number;
  duration?: any;
  client: boolean;
  state: 'connecting' | 'connected' | 'disconnecting' | undefined;
  stateChange: number;
  ping?: {
    rtt: {
      mean: number;
      stdev: number;
      count: number;
      sum: number;
      sqsum: number;
    };
    skew: {
      mean: number;
      stdev: number;
      count: number;
      sum: number;
      sqsum: number;
    };
  };
}
