/** Who a title or channel is primarily for. Drives the Arabic / English / Anime sections of the UI. */
export type Audience = 'arabic' | 'english' | 'anime' | 'turkish' | 'other';

export type ChannelCategory =
  | 'news'
  | 'sports'
  | 'kids'
  | 'movies'
  | 'series'
  | 'religious'
  | 'music'
  | 'documentary'
  | 'entertainment'
  | 'general';

export interface StreamHeaders {
  userAgent?: string;
  referrer?: string;
}

export interface Channel {
  id: string;
  sourceId: string;
  name: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  /** ISO 3166-1 alpha-2, upper case */
  country?: string;
  /** ISO 639-1 codes */
  languages: string[];
  category: ChannelCategory;
  isArabic: boolean;
  number?: number;
  streamUrl: string;
  headers?: StreamHeaders;
}

export type VodKind = 'movie' | 'series';

export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  overview?: string;
  still?: string;
  durationSecs?: number;
  streamUrl: string;
}

export interface VodItem {
  id: string;
  sourceId: string;
  kind: VodKind;
  title: string;
  year?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  genres: string[];
  rating?: number;
  group?: string;
  audience: Audience;
  tmdbId?: number;
  trailerYoutubeId?: string;
  addedAt?: number;
  /** Movies only */
  streamUrl?: string;
  headers?: StreamHeaders;
  /** Series from plain M3U lists arrive with their episodes; Xtream series load them lazily. */
  episodes?: Episode[];
  /** Xtream series id, used to fetch episodes on demand */
  remoteSeriesId?: string;
}

export interface Programme {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  description?: string;
}

interface SourceBase {
  id: string;
  name: string;
  enabled: boolean;
}

export interface M3uSourceConfig extends SourceBase {
  type: 'm3u';
  url: string;
  epgUrl?: string;
  userAgent?: string;
}

export interface XtreamSourceConfig extends SourceBase {
  type: 'xtream';
  server: string;
  username: string;
  password: string;
}

/** Public, free-to-air channels indexed by the iptv-org project. */
export interface IptvOrgSourceConfig extends SourceBase {
  type: 'iptv-org';
  /** ISO 639-3 codes, e.g. "ara" */
  languages: string[];
  /** ISO 3166-1 alpha-2 codes, e.g. "sa" */
  countries: string[];
}

export interface DemoSourceConfig extends SourceBase {
  type: 'demo';
}

export type SourceConfig = M3uSourceConfig | XtreamSourceConfig | IptvOrgSourceConfig | DemoSourceConfig;

export interface SourceStatus {
  id: string;
  state: 'idle' | 'loading' | 'ok' | 'error';
  lastRefreshed?: number;
  error?: string;
  counts: { channels: number; movies: number; series: number };
}

export interface SourceContent {
  channels: Channel[];
  vod: VodItem[];
  programmes: Programme[];
  epgUrl?: string;
}
