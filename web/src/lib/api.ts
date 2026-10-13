export type Audience = 'arabic' | 'english' | 'anime' | 'turkish' | 'other';
export type Kind = 'movie' | 'series';
export type ChannelCategory =
  | 'news' | 'sports' | 'kids' | 'movies' | 'series' | 'religious' | 'music' | 'documentary' | 'entertainment' | 'general';

export interface Slot { title: string; start: number; stop: number }

export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  country?: string;
  languages: string[];
  category: ChannelCategory;
  isArabic: boolean;
  number?: number;
  sourceId: string;
  now?: Slot;
  next?: Slot;
}

export interface Card {
  id: string;
  kind: Kind;
  title: string;
  year?: number;
  poster?: string;
  backdrop?: string;
  rating?: number;
  audience: Audience;
  availableId?: string;
}

export interface Detail extends Card {
  overview?: string;
  genres: string[];
  runtime?: number;
  trailerYoutubeId?: string;
  cast: { name: string; character?: string; photo?: string }[];
  tmdbId?: number;
  playId?: string;
  seasons?: { season: number; name: string; episodeCount: number; poster?: string }[];
  sourceName?: string;
}

export interface EpisodeInfo {
  id?: string;
  season: number;
  episode: number;
  title: string;
  overview?: string;
  still?: string;
  durationSecs?: number;
  available: boolean;
}

export interface Snapshot {
  title: string;
  poster?: string;
  backdrop?: string;
  kind: 'channel' | 'movie' | 'series' | 'episode';
  subtitle?: string;
}

export interface Favorite { id: string; addedAt: number; snapshot: Snapshot }
export interface Progress { id: string; parentId?: string; position: number; duration: number; updatedAt: number; snapshot: Snapshot }

export interface HomeRow { key: string; title: string; type: 'channels' | 'cards'; items: (Channel | Card)[]; link?: string }

export interface SourceStatus {
  state: 'idle' | 'loading' | 'ok' | 'error';
  lastRefreshed?: number;
  error?: string;
  counts: { channels: number; movies: number; series: number };
}

export type Source = { id: string; name: string; enabled: boolean; status?: SourceStatus } & (
  | { type: 'm3u'; url: string; epgUrl?: string; userAgent?: string }
  | { type: 'xtream'; server: string; username: string; password: string }
  | { type: 'iptv-org'; languages: string[]; countries: string[] }
  | { type: 'demo' }
);

export interface Facet { value: string; count: number }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let adminToken = '';
try {
  adminToken = localStorage.getItem('adminToken') ?? '';
} catch {
  // storage unavailable
}
export function setAdminToken(t: string) {
  adminToken = t;
  try {
    localStorage.setItem('adminToken', t);
  } catch {
    // ignore
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const api = {
  config: () => call<{ tmdb: boolean; streamProxy: string; adminRequired: boolean }>('GET', '/config'),
  home: (lang: string) => call<{ hero?: Card; rows: HomeRow[] }>('GET', `/home${qs({ lang })}`),
  channels: (p: { arabic?: boolean; category?: string; country?: string; group?: string; q?: string }) =>
    call<Channel[]>('GET', `/channels${qs(p)}`),
  channelFacets: (arabic?: boolean) =>
    call<{ total: number; categories: Facet[]; countries: Facet[]; groups: Facet[] }>('GET', `/channels/facets${qs({ arabic })}`),
  channel: (id: string) => call<Channel & { programmes: { start: number; stop: number; title: string; description?: string }[] }>('GET', `/channels/${id}`),
  library: (p: { kind?: Kind; audience?: string; genre?: string; q?: string; sort?: string; page?: number; pageSize?: number }) =>
    call<{ total: number; page: number; pageSize: number; items: Card[] }>('GET', `/library${qs(p)}`),
  libraryFacets: (p: { kind?: Kind; audience?: string }) => call<{ genres: Facet[]; groups: Facet[] }>('GET', `/library/facets${qs(p)}`),
  discoverRows: (lang: string) => call<{ enabled: boolean; rows: { key: string; title: string; kind: Kind; audience: Audience }[] }>('GET', `/discover${qs({ lang })}`),
  discover: (key: string, lang: string, page = 1) => call<{ items: Card[]; totalPages: number; page: number }>('GET', `/discover/${key}${qs({ lang, page })}`),
  title: (id: string, lang: string) => call<Detail>('GET', `/title/${encodeURIComponent(id)}${qs({ lang })}`),
  season: (id: string, n: number, lang: string) => call<EpisodeInfo[]>('GET', `/title/${encodeURIComponent(id)}/season/${n}${qs({ lang })}`),
  search: (q: string, lang: string) => call<{ channels: Channel[]; library: Card[]; discover: Card[] }>('GET', `/search${qs({ q, lang })}`),
  play: (id: string) => call<{ type: 'hls' | 'file'; url: string; fallbackUrl?: string }>('GET', `/play/${id}`),

  sources: () => call<Source[]>('GET', '/sources'),
  addSource: (s: Record<string, unknown>) => call<Source>('POST', '/sources', s),
  updateSource: (id: string, patch: Record<string, unknown>) => call<Source>('PATCH', `/sources/${id}`, patch),
  removeSource: (id: string) => call<void>('DELETE', `/sources/${id}`),
  refreshSource: (id: string) => call<SourceStatus>('POST', `/sources/${id}/refresh`),

  favorites: () => call<Favorite[]>('GET', '/favorites'),
  addFavorite: (id: string, snapshot: Snapshot) => call<void>('PUT', `/favorites/${id}`, { snapshot }),
  removeFavorite: (id: string) => call<void>('DELETE', `/favorites/${id}`),
  progressList: () => call<Progress[]>('GET', '/progress'),
  progress: (id: string) => call<Progress>('GET', `/progress/${id}`),
  saveProgress: (id: string, p: { position: number; duration: number; parentId?: string; snapshot: Snapshot }) =>
    call<void>('PUT', `/progress/${id}`, p),
};
