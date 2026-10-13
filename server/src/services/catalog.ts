import type { Audience, Channel, ChannelCategory, Episode, VodItem, VodKind } from '../types.js';
import { normalizeTitle } from '../lib/classify.js';
import { DISCOVER_ROWS, TmdbClient, type TmdbCard, type TmdbDetail, type UiLang } from '../lib/tmdb.js';
import type { SourceManager } from './sources.js';

export interface ChannelDTO {
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
  now?: { title: string; start: number; stop: number };
  next?: { title: string; start: number; stop: number };
}

export interface CardDTO {
  id: string;
  kind: VodKind;
  title: string;
  year?: number;
  poster?: string;
  backdrop?: string;
  rating?: number;
  audience: Audience;
  /** Id of a playable library item, when a connected source has this title */
  availableId?: string;
}

export interface EpisodeDTO {
  id?: string;
  season: number;
  episode: number;
  title: string;
  overview?: string;
  still?: string;
  durationSecs?: number;
  available: boolean;
}

export interface DetailDTO extends CardDTO {
  overview?: string;
  genres: string[];
  runtime?: number;
  trailerYoutubeId?: string;
  cast: { name: string; character?: string; photo?: string }[];
  tmdbId?: number;
  /** Movies: the id to pass to /api/play */
  playId?: string;
  seasons?: { season: number; name: string; episodeCount: number; poster?: string }[];
  sourceName?: string;
}

export interface LibraryQuery {
  kind?: VodKind;
  audience?: Audience | 'all';
  genre?: string;
  group?: string;
  q?: string;
  sort?: 'added' | 'title' | 'year' | 'rating';
  page?: number;
  pageSize?: number;
}

export interface ChannelQuery {
  arabic?: boolean;
  category?: ChannelCategory;
  country?: string;
  group?: string;
  q?: string;
  sourceId?: string;
}

function toChannelDTO(c: Channel, sources: SourceManager): ChannelDTO {
  const { now, next } = sources.nowNext(c);
  const brief = (p?: { title: string; start: number; stop: number }) => (p ? { title: p.title, start: p.start, stop: p.stop } : undefined);
  return {
    id: c.id, name: c.name, logo: c.logo, group: c.group, country: c.country, languages: c.languages,
    category: c.category, isArabic: c.isArabic, number: c.number, sourceId: c.sourceId,
    now: brief(now), next: brief(next),
  };
}

function toCard(v: VodItem): CardDTO {
  return {
    id: v.id, kind: v.kind, title: v.title, year: v.year, poster: v.poster, backdrop: v.backdrop,
    rating: v.rating, audience: v.audience, availableId: v.id,
  };
}

function matches(q: string, ...fields: (string | undefined)[]) {
  const nq = normalizeTitle(q);
  if (!nq) return true;
  return fields.some((f) => f && normalizeTitle(f).includes(nq));
}

export class Catalog {
  private byTmdb = new Map<string, VodItem>();
  private byTitle = new Map<string, VodItem>();
  /** Provider titles without a TMDB id, resolved lazily via search when a detail page is opened */
  private tmdbGuess = new Map<string, number | null>();

  constructor(private sources: SourceManager, readonly tmdb: TmdbClient) {
    sources.onChange(() => this.reindex());
    this.reindex();
  }

  private reindex() {
    this.byTmdb.clear();
    this.byTitle.clear();
    for (const v of this.sources.vod) {
      if (v.tmdbId && !this.byTmdb.has(`${v.kind}:${v.tmdbId}`)) this.byTmdb.set(`${v.kind}:${v.tmdbId}`, v);
      const t = normalizeTitle(v.title);
      if (!t) continue;
      if (v.year) this.byTitle.set(`${v.kind}:${t}:${v.year}`, v);
      if (!this.byTitle.has(`${v.kind}:${t}`)) this.byTitle.set(`${v.kind}:${t}`, v);
    }
  }

  /** Find a playable provider item for a TMDB title: by TMDB id, then by localized/original title + year. */
  matchTmdb(card: Pick<TmdbCard, 'kind' | 'tmdbId' | 'title' | 'originalTitle' | 'year'>): VodItem | undefined {
    const direct = this.byTmdb.get(`${card.kind}:${card.tmdbId}`);
    if (direct) return direct;
    for (const title of [card.title, card.originalTitle]) {
      if (!title) continue;
      const t = normalizeTitle(title);
      const exact = card.year ? this.byTitle.get(`${card.kind}:${t}:${card.year}`) : undefined;
      if (exact) return exact;
      // Title-only match, but don't pair a 1976 film with its 2018 remake.
      const loose = this.byTitle.get(`${card.kind}:${t}`);
      if (loose && (!card.year || !loose.year || Math.abs(loose.year - card.year) <= 1)) return loose;
    }
    return undefined;
  }

  private annotate(cards: TmdbCard[]): CardDTO[] {
    return cards.map((c) => {
      const { overview: _o, originalTitle: _t, tmdbId: _id, ...card } = c;
      return { ...card, availableId: this.matchTmdb(c)?.id };
    });
  }

  // ---------- Live TV ----------

  channels(q: ChannelQuery): ChannelDTO[] {
    let list = this.sources.channels;
    if (q.arabic !== undefined) list = list.filter((c) => c.isArabic === q.arabic);
    if (q.category) list = list.filter((c) => c.category === q.category);
    if (q.country) list = list.filter((c) => c.country === q.country!.toUpperCase());
    if (q.group) list = list.filter((c) => c.group === q.group);
    if (q.sourceId) list = list.filter((c) => c.sourceId === q.sourceId);
    if (q.q) list = list.filter((c) => matches(q.q!, c.name, c.group));
    return [...list]
      .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.name.localeCompare(b.name))
      .map((c) => toChannelDTO(c, this.sources));
  }

  channelFacets(arabic?: boolean) {
    const list = arabic === undefined ? this.sources.channels : this.sources.channels.filter((c) => c.isArabic === arabic);
    const count = (key: (c: Channel) => string | undefined) => {
      const m = new Map<string, number>();
      for (const c of list) {
        const k = key(c);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    };
    return {
      total: list.length,
      categories: count((c) => c.category),
      countries: count((c) => c.country),
      groups: count((c) => c.group).slice(0, 200),
    };
  }

  channelDetail(id: string) {
    const c = this.sources.channel(id);
    if (!c) return undefined;
    return { ...toChannelDTO(c, this.sources), programmes: this.sources.programmes(c) };
  }

  // ---------- Library (what connected sources can actually play) ----------

  library(q: LibraryQuery) {
    let list = this.sources.vod;
    if (q.kind) list = list.filter((v) => v.kind === q.kind);
    if (q.audience && q.audience !== 'all') list = list.filter((v) => v.audience === q.audience);
    if (q.genre) list = list.filter((v) => v.genres.some((g) => g.toLowerCase() === q.genre!.toLowerCase()));
    if (q.group) list = list.filter((v) => v.group === q.group);
    if (q.q) list = list.filter((v) => matches(q.q!, v.title));
    const sorted = [...list];
    switch (q.sort ?? 'added') {
      case 'title': sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'year': sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)); break;
      case 'rating': sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      default: sorted.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    }
    const pageSize = Math.min(Math.max(q.pageSize ?? 60, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    return {
      total: sorted.length,
      page,
      pageSize,
      items: sorted.slice((page - 1) * pageSize, page * pageSize).map(toCard),
    };
  }

  libraryFacets(kind?: VodKind, audience?: Audience | 'all') {
    let list = this.sources.vod;
    if (kind) list = list.filter((v) => v.kind === kind);
    if (audience && audience !== 'all') list = list.filter((v) => v.audience === audience);
    const genres = new Map<string, number>();
    const groups = new Map<string, number>();
    for (const v of list) {
      for (const g of v.genres) genres.set(g, (genres.get(g) ?? 0) + 1);
      if (v.group) groups.set(v.group, (groups.get(v.group) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    return { genres: top(genres).slice(0, 40), groups: top(groups).slice(0, 200) };
  }

  // ---------- Discover (TMDB) ----------

  discoverRows(ui: UiLang) {
    return DISCOVER_ROWS.map((r) => ({ key: r.key, title: r.title[ui], kind: r.kind, audience: r.audience }));
  }

  async discover(rowKey: string, ui: UiLang, page = 1) {
    const { items, totalPages } = await this.tmdb.discover(rowKey, ui, page);
    return { items: this.annotate(items), totalPages, page };
  }

  // ---------- Home ----------

  async home(ui: UiLang) {
    const t = (en: string, ar: string) => (ui === 'ar' ? ar : en);
    const rows: { key: string; title: string; type: 'channels' | 'cards'; items: (ChannelDTO | CardDTO)[]; link?: string }[] = [];

    const arabicLive = this.channels({ arabic: true }).slice(0, 24);
    if (arabicLive.length) rows.push({ key: 'live-arabic', title: t('Live Arabic Channels', 'القنوات العربية المباشرة'), type: 'channels', items: arabicLive, link: '/live' });

    const libRows: [string, string, string, LibraryQuery][] = [
      ['lib-arabic-series', 'New Arabic Series', 'مسلسلات عربية جديدة', { kind: 'series', audience: 'arabic' }],
      ['lib-arabic-movies', 'New Arabic Movies', 'أفلام عربية جديدة', { kind: 'movie', audience: 'arabic' }],
      ['lib-turkish', 'Turkish Series', 'مسلسلات تركية', { kind: 'series', audience: 'turkish' }],
      ['lib-english-movies', 'Movies', 'أفلام أجنبية', { kind: 'movie', audience: 'english' }],
      ['lib-english-series', 'Series', 'مسلسلات أجنبية', { kind: 'series', audience: 'english' }],
      ['lib-anime', 'Anime', 'أنمي', { audience: 'anime' }],
    ];
    for (const [key, en, ar, query] of libRows) {
      const { items } = this.library({ ...query, pageSize: 24 });
      if (items.length) rows.push({ key, title: t(en, ar), type: 'cards', items, link: `/browse?${new URLSearchParams(query as Record<string, string>)}` });
    }

    const heroItem = this.sources.vod.find((v) => v.backdrop && v.audience === 'arabic') ?? this.sources.vod.find((v) => v.backdrop);
    let hero: CardDTO | undefined = heroItem && toCard(heroItem);
    if (this.tmdb.enabled) {
      const discover = await Promise.allSettled(
        ['arabic-series', 'arabic-movies', 'turkish-series', 'trending-movies', 'anime-series'].map(async (key) => {
          const row = DISCOVER_ROWS.find((r) => r.key === key)!;
          const { items } = await this.discover(key, ui);
          return { key: `discover-${key}`, title: `${row.title[ui]} · ${t('Discover', 'اكتشف')}`, type: 'cards' as const, items, link: `/discover/${key}` };
        }),
      );
      for (const r of discover) if (r.status === 'fulfilled' && r.value.items.length) rows.push(r.value);
      if (!hero) {
        const first = discover.find((r) => r.status === 'fulfilled');
        hero = first?.status === 'fulfilled' ? (first.value.items as CardDTO[]).find((c) => c.backdrop) : undefined;
      }
    }
    return { hero, rows };
  }

  // ---------- Detail ----------

  async detail(id: string, ui: UiLang): Promise<DetailDTO | undefined> {
    const tmdbMatch = id.match(/^tmdb-(movie|series)-(\d+)$/);
    if (tmdbMatch) {
      if (!this.tmdb.enabled) return undefined;
      const kind = tmdbMatch[1] as VodKind;
      const d = await this.tmdb.detail(kind, Number(tmdbMatch[2]), ui);
      const local = this.matchTmdb(d);
      return this.merge(d, local);
    }

    const item = this.sources.item(id);
    if (!item) return undefined;
    let tmdbId = item.tmdbId;
    if (!tmdbId && this.tmdb.enabled) tmdbId = (await this.guessTmdb(item)) ?? undefined;
    if (tmdbId && this.tmdb.enabled) {
      try {
        return this.merge(await this.tmdb.detail(item.kind, tmdbId, ui), item);
      } catch {
        // fall through to provider-only metadata
      }
    }
    return {
      ...toCard(item),
      overview: item.overview,
      genres: item.genres,
      trailerYoutubeId: item.trailerYoutubeId,
      cast: [],
      playId: item.kind === 'movie' ? item.id : undefined,
      sourceName: this.sources.get(item.sourceId)?.name,
    };
  }

  private merge(d: TmdbDetail, local?: VodItem): DetailDTO {
    return {
      id: d.id, kind: d.kind, title: d.title, year: d.year,
      poster: d.poster ?? local?.poster, backdrop: d.backdrop ?? local?.backdrop,
      rating: d.rating ?? local?.rating, audience: local?.audience ?? d.audience,
      availableId: local?.id, overview: d.overview ?? local?.overview, genres: d.genres.length ? d.genres : local?.genres ?? [],
      runtime: d.runtime, trailerYoutubeId: d.trailerYoutubeId ?? local?.trailerYoutubeId, cast: d.cast,
      tmdbId: d.tmdbId, playId: d.kind === 'movie' ? local?.id : undefined, seasons: d.seasons,
      sourceName: local ? this.sources.get(local.sourceId)?.name : undefined,
    };
  }

  private async guessTmdb(item: VodItem): Promise<number | null> {
    if (this.tmdbGuess.has(item.id)) return this.tmdbGuess.get(item.id)!;
    let found: number | null = null;
    try {
      const results = await this.tmdb.search(item.title, 'en');
      const want = normalizeTitle(item.title);
      const hit = results.find((r) => r.kind === item.kind && (!item.year || !r.year || Math.abs(r.year - item.year) <= 1)
        && [r.title, r.originalTitle].some((t) => t && normalizeTitle(t) === want));
      found = hit?.tmdbId ?? null;
    } catch {
      found = null;
    }
    this.tmdbGuess.set(item.id, found);
    return found;
  }

  /**
   * Episodes for one season. Combines TMDB episode metadata (titles, stills, overviews) with what the
   * provider can actually play; provider-only shows return their own episode list.
   */
  async season(id: string, season: number, ui: UiLang): Promise<EpisodeDTO[]> {
    const tmdbMatch = id.match(/^tmdb-series-(\d+)$/);
    const local = tmdbMatch
      ? this.matchTmdb({ kind: 'series', tmdbId: Number(tmdbMatch[1]), title: '', year: undefined })
      : this.sources.item(id);
    const localEpisodes: Episode[] = local ? await this.sources.episodes(local) : [];
    const playable = new Map(localEpisodes.filter((e) => e.season === season).map((e) => [e.episode, e]));

    const tmdbId = tmdbMatch ? Number(tmdbMatch[1]) : local?.tmdbId ?? (local && this.tmdbGuess.get(local.id)) ?? undefined;
    if (tmdbId && this.tmdb.enabled) {
      try {
        const meta = await this.tmdb.season(tmdbId, season, ui);
        const out: EpisodeDTO[] = meta.map((m) => {
          const e = playable.get(m.episode);
          return {
            id: e?.id, season, episode: m.episode, title: m.title, overview: m.overview ?? e?.overview,
            still: m.still ?? e?.still, durationSecs: m.runtime ? m.runtime * 60 : e?.durationSecs, available: !!e,
          };
        });
        // Providers sometimes carry episodes TMDB doesn't list yet (e.g. airing Ramadan series).
        for (const e of playable.values()) if (!meta.some((m) => m.episode === e.episode)) out.push(this.epDTO(e));
        return out.sort((a, b) => a.episode - b.episode);
      } catch {
        // fall back to provider list
      }
    }
    return [...playable.values()].map((e) => this.epDTO(e));
  }

  /** Seasons available from the provider, for shows with no TMDB metadata. */
  async localSeasons(id: string) {
    const item = this.sources.item(id);
    if (!item || item.kind !== 'series') return [];
    const eps = await this.sources.episodes(item);
    const counts = new Map<number, number>();
    for (const e of eps) counts.set(e.season, (counts.get(e.season) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0] - b[0]).map(([season, episodeCount]) => ({ season, name: `Season ${season}`, episodeCount }));
  }

  private epDTO(e: Episode): EpisodeDTO {
    return {
      id: e.id, season: e.season, episode: e.episode, title: e.title, overview: e.overview,
      still: e.still, durationSecs: e.durationSecs, available: true,
    };
  }

  // ---------- Search ----------

  async search(q: string, ui: UiLang) {
    const channels = this.channels({ q }).slice(0, 30);
    const library = this.library({ q, pageSize: 60 }).items;
    let discover: CardDTO[] = [];
    if (this.tmdb.enabled && q.trim().length >= 2) {
      try {
        const libIds = new Set(library.map((l) => l.id));
        discover = this.annotate(await this.tmdb.search(q, ui)).filter((c) => !c.availableId || !libIds.has(c.availableId));
      } catch {
        discover = [];
      }
    }
    return { channels, library, discover };
  }
}
