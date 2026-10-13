import type { Audience, VodKind } from '../types.js';
import { audienceFromTmdb } from './classify.js';
import { fetchJson } from './http.js';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export type UiLang = 'ar' | 'en';

export interface TmdbCard {
  id: string; // "tmdb-movie-123" | "tmdb-series-456"
  tmdbId: number;
  kind: VodKind;
  title: string;
  originalTitle?: string;
  year?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  rating?: number;
  audience: Audience;
}

export interface TmdbDetail extends TmdbCard {
  genres: string[];
  runtime?: number;
  trailerYoutubeId?: string;
  cast: { name: string; character?: string; photo?: string }[];
  seasons?: { season: number; name: string; episodeCount: number; poster?: string; airYear?: number }[];
}

export interface TmdbEpisode {
  season: number;
  episode: number;
  title: string;
  overview?: string;
  still?: string;
  runtime?: number;
}

/** Discover rows. Arabic content first; Turkish dramas are included because they are hugely popular dubbed in Arabic. */
export const DISCOVER_ROWS: {
  key: string;
  title: Record<UiLang, string>;
  kind: VodKind;
  audience: Audience;
  path: string;
  params: Record<string, string>;
}[] = [
  { key: 'arabic-series', title: { en: 'Arabic Series', ar: 'مسلسلات عربية' }, kind: 'series', audience: 'arabic',
    path: '/discover/tv', params: { with_original_language: 'ar', sort_by: 'popularity.desc' } },
  { key: 'arabic-movies', title: { en: 'Arabic Movies', ar: 'أفلام عربية' }, kind: 'movie', audience: 'arabic',
    path: '/discover/movie', params: { with_original_language: 'ar', sort_by: 'popularity.desc' } },
  { key: 'egyptian-classics', title: { en: 'Egyptian Cinema Classics', ar: 'كلاسيكيات السينما المصرية' }, kind: 'movie', audience: 'arabic',
    path: '/discover/movie', params: { with_origin_country: 'EG', 'primary_release_date.lte': '1999-12-31', sort_by: 'vote_count.desc' } },
  { key: 'khaleeji-series', title: { en: 'Gulf Drama', ar: 'دراما خليجية' }, kind: 'series', audience: 'arabic',
    path: '/discover/tv', params: { with_origin_country: 'SA|KW|AE|QA|BH|OM', sort_by: 'popularity.desc' } },
  { key: 'turkish-series', title: { en: 'Turkish Drama', ar: 'مسلسلات تركية' }, kind: 'series', audience: 'turkish',
    path: '/discover/tv', params: { with_original_language: 'tr', sort_by: 'popularity.desc' } },
  { key: 'trending-movies', title: { en: 'Trending Movies', ar: 'الأفلام الرائجة' }, kind: 'movie', audience: 'english',
    path: '/trending/movie/week', params: {} },
  { key: 'english-series', title: { en: 'Popular Series', ar: 'مسلسلات أجنبية' }, kind: 'series', audience: 'english',
    path: '/discover/tv', params: { with_original_language: 'en', sort_by: 'popularity.desc', 'vote_count.gte': '200' } },
  { key: 'english-movies', title: { en: 'Hollywood Hits', ar: 'أفلام هوليوود' }, kind: 'movie', audience: 'english',
    path: '/discover/movie', params: { with_original_language: 'en', sort_by: 'popularity.desc', 'vote_count.gte': '300' } },
  { key: 'anime-series', title: { en: 'Anime', ar: 'أنمي' }, kind: 'series', audience: 'anime',
    path: '/discover/tv', params: { with_original_language: 'ja', with_genres: '16', sort_by: 'popularity.desc' } },
  { key: 'anime-movies', title: { en: 'Anime Movies', ar: 'أفلام أنمي' }, kind: 'movie', audience: 'anime',
    path: '/discover/movie', params: { with_original_language: 'ja', with_genres: '16', sort_by: 'popularity.desc' } },
  { key: 'family', title: { en: 'Family & Kids', ar: 'للعائلة والأطفال' }, kind: 'movie', audience: 'english',
    path: '/discover/movie', params: { with_genres: '10751', sort_by: 'popularity.desc' } },
];

interface RawItem {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; poster_path?: string | null; backdrop_path?: string | null;
  overview?: string; vote_average?: number; original_language?: string; genre_ids?: number[]; media_type?: string;
}

export class TmdbClient {
  private cache = new Map<string, { at: number; data: unknown }>();

  constructor(private auth: { apiKey?: string; readToken?: string }, private ttlMs = 6 * 3600_000) {}

  get enabled() {
    return !!(this.auth.apiKey || this.auth.readToken);
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    if (this.auth.apiKey && !this.auth.readToken) q.set('api_key', this.auth.apiKey);
    const url = `${API}${path}?${q}`;
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data as T;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.auth.readToken) headers.authorization = `Bearer ${this.auth.readToken}`;
    const data = await fetchJson<T>(url, headers);
    this.cache.set(url, { at: Date.now(), data });
    if (this.cache.size > 2000) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  static lang(ui: UiLang) {
    return ui === 'ar' ? 'ar-SA' : 'en-US';
  }

  private card(raw: RawItem, kind: VodKind): TmdbCard {
    const date = raw.release_date || raw.first_air_date;
    return {
      id: `tmdb-${kind}-${raw.id}`,
      tmdbId: raw.id,
      kind,
      title: raw.title || raw.name || raw.original_title || raw.original_name || '',
      originalTitle: raw.original_title || raw.original_name,
      year: date ? Number(date.slice(0, 4)) || undefined : undefined,
      poster: raw.poster_path ? `${IMG}/w342${raw.poster_path}` : undefined,
      backdrop: raw.backdrop_path ? `${IMG}/w1280${raw.backdrop_path}` : undefined,
      overview: raw.overview || undefined,
      rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : undefined,
      audience: audienceFromTmdb(raw.original_language, raw.genre_ids),
    };
  }

  async discover(rowKey: string, ui: UiLang, page = 1): Promise<{ items: TmdbCard[]; totalPages: number }> {
    const row = DISCOVER_ROWS.find((r) => r.key === rowKey);
    if (!row) throw new Error(`Unknown row ${rowKey}`);
    const res = await this.get<{ results: RawItem[]; total_pages: number }>(row.path, {
      ...row.params,
      language: TmdbClient.lang(ui),
      include_adult: 'false',
      page,
    });
    return {
      items: res.results.filter((r) => r.poster_path).map((r) => this.card(r, row.kind)),
      totalPages: Math.min(res.total_pages, 500),
    };
  }

  async search(query: string, ui: UiLang): Promise<TmdbCard[]> {
    const res = await this.get<{ results: RawItem[] }>('/search/multi', {
      query,
      language: TmdbClient.lang(ui),
      include_adult: 'false',
    });
    return res.results
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => this.card(r, r.media_type === 'tv' ? 'series' : 'movie'));
  }

  async detail(kind: VodKind, tmdbId: number, ui: UiLang): Promise<TmdbDetail> {
    const path = kind === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
    // include_video_language lets Arabic UIs still get English trailers when no Arabic one exists.
    const raw = await this.get<RawItem & {
      genres?: { id: number; name: string }[]; runtime?: number; episode_run_time?: number[];
      videos?: { results: { key: string; site: string; type: string; iso_639_1: string }[] };
      credits?: { cast: { name: string; character?: string; profile_path?: string | null }[] };
      seasons?: { season_number: number; name: string; episode_count: number; poster_path?: string | null; air_date?: string }[];
    }>(path, {
      language: TmdbClient.lang(ui),
      append_to_response: 'videos,credits',
      include_video_language: `${ui},en,null`,
    });
    const card = this.card({ ...raw, genre_ids: raw.genres?.map((g) => g.id) }, kind);
    const videos = raw.videos?.results.filter((v) => v.site === 'YouTube') ?? [];
    const trailer = videos.find((v) => v.type === 'Trailer' && v.iso_639_1 === ui) ?? videos.find((v) => v.type === 'Trailer') ?? videos[0];
    return {
      ...card,
      genres: raw.genres?.map((g) => g.name) ?? [],
      runtime: raw.runtime ?? raw.episode_run_time?.[0],
      trailerYoutubeId: trailer?.key,
      cast: (raw.credits?.cast ?? []).slice(0, 12).map((c) => ({
        name: c.name,
        character: c.character,
        photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined,
      })),
      seasons: raw.seasons
        ?.filter((s) => s.season_number > 0)
        .map((s) => ({
          season: s.season_number,
          name: s.name,
          episodeCount: s.episode_count,
          poster: s.poster_path ? `${IMG}/w342${s.poster_path}` : undefined,
          airYear: s.air_date ? Number(s.air_date.slice(0, 4)) : undefined,
        })),
    };
  }

  async season(tmdbId: number, season: number, ui: UiLang): Promise<TmdbEpisode[]> {
    const raw = await this.get<{ episodes: { episode_number: number; name: string; overview?: string; still_path?: string | null; runtime?: number }[] }>(
      `/tv/${tmdbId}/season/${season}`,
      { language: TmdbClient.lang(ui) },
    );
    return raw.episodes.map((e) => ({
      season,
      episode: e.episode_number,
      title: e.name,
      overview: e.overview || undefined,
      still: e.still_path ? `${IMG}/w300${e.still_path}` : undefined,
      runtime: e.runtime,
    }));
  }
}
