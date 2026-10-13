import { randomUUID } from 'node:crypto';
import type {
  Channel,
  Episode,
  IptvOrgSourceConfig,
  Programme,
  SourceConfig,
  SourceContent,
  SourceStatus,
  VodItem,
} from '../types.js';
import { ARAB_COUNTRIES } from '../lib/classify.js';
import { fetchText, redact } from '../lib/http.js';
import { parseM3u, playlistToContent } from '../lib/m3u.js';
import { parseXmltv } from '../lib/xmltv.js';
import { XtreamClient } from '../lib/xtream.js';
import { demoContent } from '../demo/seed.js';
import type { Store } from './store.js';

const IPTV_ORG = 'https://iptv-org.github.io/iptv';

export function defaultSources(demo: boolean): SourceConfig[] {
  const list: SourceConfig[] = [
    {
      id: 'iptv-org-arabic',
      type: 'iptv-org',
      name: 'Free-to-air Arabic channels (iptv-org)',
      enabled: true,
      languages: ['ara'],
      countries: ARAB_COUNTRIES.map((c) => c.toLowerCase()),
    },
  ];
  if (demo) list.unshift({ id: 'demo', type: 'demo', name: 'Demo content', enabled: true });
  return list;
}

/**
 * Loads every configured source, keeps the merged content in memory and refreshes on a timer.
 * Each source fails independently, so one dead provider never empties the whole guide.
 */
export class SourceManager {
  private content = new Map<string, SourceContent>();
  private status = new Map<string, SourceStatus>();
  private episodeCache = new Map<string, { at: number; episodes: Episode[] }>();
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<() => void>();

  // Merged indexes, rebuilt after each refresh
  channels: Channel[] = [];
  vod: VodItem[] = [];
  private channelById = new Map<string, Channel>();
  private vodById = new Map<string, VodItem>();
  private episodeIndex = new Map<string, { series: VodItem; episode: Episode }>();
  private epg = new Map<string, Programme[]>();

  constructor(private store: Store, private opts: { refreshMinutes: number }) {}

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  list(): SourceConfig[] {
    return this.store.read().sources;
  }

  get(id: string) {
    return this.list().find((s) => s.id === id);
  }

  statuses(): SourceStatus[] {
    return this.list().map((s) => this.status.get(s.id) ?? { id: s.id, state: 'idle', counts: { channels: 0, movies: 0, series: 0 } });
  }

  add(cfg: Omit<SourceConfig, 'id'> & { id?: string }): SourceConfig {
    const source = { ...cfg, id: cfg.id ?? randomUUID() } as SourceConfig;
    this.store.update((d) => d.sources.push(source));
    void this.refreshOne(source);
    return source;
  }

  updateSource(id: string, patch: Partial<SourceConfig>): SourceConfig | undefined {
    let updated: SourceConfig | undefined;
    this.store.update((d) => {
      const i = d.sources.findIndex((s) => s.id === id);
      if (i < 0) return;
      // Keep the stored password when the client sends the redacted placeholder back.
      if ('password' in patch && (!patch.password || patch.password === '••••••')) delete patch.password;
      d.sources[i] = { ...d.sources[i], ...patch, id, type: d.sources[i].type } as SourceConfig;
      updated = d.sources[i];
    });
    if (updated) {
      if (updated.enabled) void this.refreshOne(updated);
      else this.drop(id);
    }
    return updated;
  }

  remove(id: string): boolean {
    const before = this.list().length;
    this.store.update((d) => (d.sources = d.sources.filter((s) => s.id !== id)));
    this.drop(id);
    return this.list().length < before;
  }

  private drop(id: string) {
    this.content.delete(id);
    this.status.delete(id);
    this.rebuild();
  }

  start() {
    void this.refreshAll();
    this.timer = setInterval(() => void this.refreshAll(), this.opts.refreshMinutes * 60_000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async refreshAll() {
    await Promise.all(this.list().filter((s) => s.enabled).map((s) => this.refreshOne(s)));
  }

  async refreshOne(source: SourceConfig) {
    const prev = this.status.get(source.id);
    this.status.set(source.id, { id: source.id, state: 'loading', counts: prev?.counts ?? { channels: 0, movies: 0, series: 0 }, lastRefreshed: prev?.lastRefreshed });
    try {
      const content = await this.load(source);
      // A source that was removed or disabled while loading shouldn't come back.
      const current = this.get(source.id);
      if (!current?.enabled) return;
      this.content.set(source.id, content);
      this.status.set(source.id, {
        id: source.id,
        state: 'ok',
        lastRefreshed: Date.now(),
        counts: {
          channels: content.channels.length,
          movies: content.vod.filter((v) => v.kind === 'movie').length,
          series: content.vod.filter((v) => v.kind === 'series').length,
        },
      });
      this.rebuild();
      // EPG is slow and optional: load it after the channels are already visible.
      if (content.epgUrl && content.programmes.length === 0) void this.loadEpg(source.id, content);
    } catch (err) {
      const message = redact(err instanceof Error ? err.message : String(err));
      console.warn(`[sources] ${source.name}: ${message}`);
      // Keep serving the last good copy of this source.
      this.status.set(source.id, { ...this.status.get(source.id)!, state: 'error', error: message });
    }
  }

  private async load(source: SourceConfig): Promise<SourceContent> {
    switch (source.type) {
      case 'demo':
        return demoContent(source.id);
      case 'm3u': {
        const playlist = parseM3u(await fetchText(source.url, { userAgent: source.userAgent }));
        const { channels, vod } = playlistToContent(playlist, source.id, { userAgent: source.userAgent });
        return { channels, vod, programmes: [], epgUrl: source.epgUrl || playlist.epgUrl };
      }
      case 'xtream': {
        const client = new XtreamClient(source);
        const { channels, vod } = await client.loadAll();
        return { channels, vod, programmes: [], epgUrl: client.epgUrl() };
      }
      case 'iptv-org':
        return this.loadIptvOrg(source);
    }
  }

  /** Fetches the per-language and per-country iptv-org playlists and de-duplicates by stream URL. */
  private async loadIptvOrg(source: IptvOrgSourceConfig): Promise<SourceContent> {
    const urls = [
      ...source.languages.map((l) => `${IPTV_ORG}/languages/${l}.m3u`),
      ...source.countries.map((c) => `${IPTV_ORG}/countries/${c}.m3u`),
    ];
    const results = await Promise.allSettled(urls.map((u) => fetchText(u)));
    const ok = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled');
    if (ok.length === 0) {
      const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      throw new Error(`iptv-org unreachable: ${first?.reason?.message ?? 'unknown error'}`);
    }
    const entries = ok.flatMap((r) => parseM3u(r.value).entries);
    const { channels } = playlistToContent({ entries }, source.id);
    // These lists are curated by country/language already, so trust that over heuristics.
    for (const c of channels) {
      if (!c.languages.length && source.languages.includes('ara')) c.languages = ['ar'];
      c.isArabic ||= !!c.country && ARAB_COUNTRIES.includes(c.country);
    }
    return { channels, vod: [], programmes: [] };
  }

  private async loadEpg(sourceId: string, content: SourceContent) {
    try {
      const xml = await fetchText(content.epgUrl!, undefined, 180_000);
      const ids = new Set(content.channels.map((c) => c.tvgId).filter((x): x is string => !!x));
      content.programmes = parseXmltv(xml, { channelIds: ids });
      this.rebuild();
    } catch (err) {
      console.warn(`[epg] ${sourceId}: ${redact(err instanceof Error ? err.message : String(err))}`);
    }
  }

  private rebuild() {
    const order = this.list().map((s) => s.id);
    const contents = order.map((id) => this.content.get(id)).filter((c): c is SourceContent => !!c);
    this.channels = contents.flatMap((c) => c.channels);
    this.vod = contents.flatMap((c) => c.vod);
    this.channelById = new Map(this.channels.map((c) => [c.id, c]));
    this.vodById = new Map(this.vod.map((v) => [v.id, v]));
    this.episodeIndex.clear();
    for (const v of this.vod) for (const e of v.episodes ?? []) this.episodeIndex.set(e.id, { series: v, episode: e });
    for (const [seriesId, { episodes }] of this.episodeCache) {
      const series = this.vodById.get(seriesId);
      if (series) for (const e of episodes) this.episodeIndex.set(e.id, { series, episode: e });
    }
    this.epg.clear();
    for (const c of contents) {
      for (const p of c.programmes) {
        const list = this.epg.get(p.channelId) ?? [];
        list.push(p);
        this.epg.set(p.channelId, list);
      }
    }
    for (const fn of this.listeners) fn();
  }

  channel(id: string) {
    return this.channelById.get(id);
  }

  item(id: string) {
    return this.vodById.get(id);
  }

  programmes(channel: Channel, from = Date.now() - 3600_000, to = Date.now() + 12 * 3600_000): Programme[] {
    if (!channel.tvgId) return [];
    return (this.epg.get(channel.tvgId) ?? []).filter((p) => p.stop > from && p.start < to);
  }

  nowNext(channel: Channel): { now?: Programme; next?: Programme } {
    const t = Date.now();
    const list = this.programmes(channel, t, t + 6 * 3600_000);
    const i = list.findIndex((p) => p.start <= t && p.stop > t);
    return i >= 0 ? { now: list[i], next: list[i + 1] } : { next: list[0] };
  }

  /** Episodes for a series; Xtream series are fetched on first use and cached for an hour. */
  async episodes(series: VodItem): Promise<Episode[]> {
    if (series.episodes) return series.episodes;
    const source = this.get(series.sourceId);
    if (source?.type !== 'xtream' || !series.remoteSeriesId) return [];
    const hit = this.episodeCache.get(series.id);
    if (hit && Date.now() - hit.at < 3600_000) return hit.episodes;
    const episodes = await new XtreamClient(source).loadEpisodes(series.remoteSeriesId);
    this.episodeCache.set(series.id, { at: Date.now(), episodes });
    for (const e of episodes) this.episodeIndex.set(e.id, { series, episode: e });
    return episodes;
  }

  episode(id: string) {
    return this.episodeIndex.get(id);
  }
}
