import type { Channel, Episode, VodItem, XtreamSourceConfig } from '../types.js';
import { audienceFromText, cleanTitle, extractYear, inferChannelCategory, isArabicChannel } from './classify.js';
import { fetchJson } from './http.js';
import { stableId } from './m3u.js';

/** Raw shapes returned by Xtream Codes compatible panels (fields vary a lot between panels). */
interface XCategory { category_id: string; category_name: string }
interface XLive {
  num?: number; name: string; stream_id: number; stream_icon?: string;
  epg_channel_id?: string | null; category_id?: string; added?: string;
}
interface XVod {
  name: string; stream_id: number; stream_icon?: string; rating?: string | number;
  category_id?: string; container_extension?: string; added?: string; tmdb?: string | number;
  year?: string | number; plot?: string; genre?: string;
}
interface XSeries {
  series_id: number; name: string; cover?: string; plot?: string; genre?: string;
  releaseDate?: string; release_date?: string; rating?: string | number; backdrop_path?: string[] | string;
  youtube_trailer?: string; tmdb?: string | number; category_id?: string; last_modified?: string;
}
interface XEpisode {
  id: string; episode_num: number | string; title: string; container_extension?: string; season?: number | string;
  info?: { movie_image?: string; plot?: string; duration_secs?: number | string; name?: string };
}
interface XSeriesInfo { episodes?: Record<string, XEpisode[]> | XEpisode[][] }

export class XtreamClient {
  private base: string;

  constructor(private cfg: XtreamSourceConfig) {
    this.base = cfg.server.replace(/\/+$/, '');
    if (!/^https?:\/\//.test(this.base)) this.base = `http://${this.base}`;
  }

  private api<T>(action?: string, params: Record<string, string | number> = {}): Promise<T> {
    const q = new URLSearchParams({ username: this.cfg.username, password: this.cfg.password });
    if (action) q.set('action', action);
    for (const [k, v] of Object.entries(params)) q.set(k, String(v));
    return fetchJson<T>(`${this.base}/player_api.php?${q}`, undefined, 120_000);
  }

  private cred() {
    return `${encodeURIComponent(this.cfg.username)}/${encodeURIComponent(this.cfg.password)}`;
  }

  liveUrl(streamId: number) { return `${this.base}/live/${this.cred()}/${streamId}.m3u8`; }
  movieUrl(streamId: number, ext = 'mp4') { return `${this.base}/movie/${this.cred()}/${streamId}.${ext}`; }
  episodeUrl(id: string, ext = 'mp4') { return `${this.base}/series/${this.cred()}/${id}.${ext}`; }
  epgUrl() {
    return `${this.base}/xmltv.php?username=${encodeURIComponent(this.cfg.username)}&password=${encodeURIComponent(this.cfg.password)}`;
  }

  async authenticate(): Promise<{ status: string; expires?: number }> {
    const res = await this.api<{ user_info?: { auth?: number; status?: string; exp_date?: string | null } }>();
    if (!res.user_info || res.user_info.auth === 0) throw new Error('Xtream login rejected');
    return {
      status: res.user_info.status ?? 'Active',
      expires: res.user_info.exp_date ? Number(res.user_info.exp_date) * 1000 : undefined,
    };
  }

  async loadAll(): Promise<{ channels: Channel[]; vod: VodItem[] }> {
    await this.authenticate();
    const sourceId = this.cfg.id;
    const [liveCats, vodCats, seriesCats, live, movies, series] = await Promise.all([
      this.api<XCategory[]>('get_live_categories').catch(() => []),
      this.api<XCategory[]>('get_vod_categories').catch(() => []),
      this.api<XCategory[]>('get_series_categories').catch(() => []),
      this.api<XLive[]>('get_live_streams').catch(() => []),
      this.api<XVod[]>('get_vod_streams').catch(() => []),
      this.api<XSeries[]>('get_series').catch(() => []),
    ]);
    const catName = (cats: XCategory[]) => {
      const m = new Map(cats.map((c) => [String(c.category_id), c.category_name]));
      return (id?: string) => (id ? m.get(String(id)) : undefined);
    };
    const liveCat = catName(liveCats);
    const vodCat = catName(vodCats);
    const seriesCat = catName(seriesCats);

    const channels: Channel[] = (Array.isArray(live) ? live : []).map((s) => {
      const group = liveCat(s.category_id);
      const country = s.epg_channel_id?.match(/\.([a-z]{2})$/i)?.[1]?.toUpperCase();
      return {
        id: stableId('ch', sourceId, s.stream_id),
        sourceId,
        name: s.name.trim(),
        logo: s.stream_icon || undefined,
        group,
        tvgId: s.epg_channel_id || undefined,
        country,
        languages: [],
        category: inferChannelCategory(s.name, group),
        isArabic: isArabicChannel({ name: s.name, group, country, languages: [] }),
        number: s.num,
        streamUrl: this.liveUrl(s.stream_id),
      };
    });

    const vod: VodItem[] = [];
    for (const m of Array.isArray(movies) ? movies : []) {
      const group = vodCat(m.category_id);
      vod.push({
        id: stableId('mov', sourceId, m.stream_id),
        sourceId,
        kind: 'movie',
        title: cleanTitle(m.name),
        year: Number(m.year) || extractYear(m.name),
        poster: m.stream_icon || undefined,
        overview: m.plot || undefined,
        genres: splitGenres(m.genre),
        rating: toRating(m.rating),
        group,
        audience: audienceFromText(group, m.name) ?? 'other',
        tmdbId: Number(m.tmdb) || undefined,
        addedAt: m.added ? Number(m.added) * 1000 : undefined,
        streamUrl: this.movieUrl(m.stream_id, m.container_extension),
      });
    }
    for (const s of Array.isArray(series) ? series : []) {
      const group = seriesCat(s.category_id);
      const backdrop = Array.isArray(s.backdrop_path) ? s.backdrop_path[0] : s.backdrop_path;
      const date = s.releaseDate || s.release_date;
      vod.push({
        id: stableId('ser', sourceId, s.series_id),
        sourceId,
        kind: 'series',
        title: cleanTitle(s.name),
        year: date ? Number(date.slice(0, 4)) || undefined : extractYear(s.name),
        poster: s.cover || undefined,
        backdrop: backdrop || undefined,
        overview: s.plot || undefined,
        genres: splitGenres(s.genre),
        rating: toRating(s.rating),
        group,
        audience: audienceFromText(group, s.name) ?? 'other',
        tmdbId: Number(s.tmdb) || undefined,
        trailerYoutubeId: s.youtube_trailer || undefined,
        addedAt: s.last_modified ? Number(s.last_modified) * 1000 : undefined,
        remoteSeriesId: String(s.series_id),
      });
    }
    return { channels, vod };
  }

  async loadEpisodes(seriesId: string): Promise<Episode[]> {
    const info = await this.api<XSeriesInfo>('get_series_info', { series_id: seriesId });
    const groups = info.episodes ? Object.values(info.episodes) : [];
    const episodes: Episode[] = [];
    for (const list of groups) {
      for (const e of list ?? []) {
        episodes.push({
          id: stableId('ep', this.cfg.id, e.id),
          season: Number(e.season) || 1,
          episode: Number(e.episode_num) || episodes.length + 1,
          title: e.title || e.info?.name || `Episode ${e.episode_num}`,
          overview: e.info?.plot || undefined,
          still: e.info?.movie_image || undefined,
          durationSecs: Number(e.info?.duration_secs) || undefined,
          streamUrl: this.episodeUrl(e.id, e.container_extension),
        });
      }
    }
    return episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  }
}

function splitGenres(g?: string): string[] {
  return g ? g.split(/[,/|]/).map((x) => x.trim()).filter(Boolean) : [];
}

function toRating(r?: string | number): number | undefined {
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined;
}
