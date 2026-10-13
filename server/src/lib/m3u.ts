import { createHash } from 'node:crypto';
import type { Channel, Episode, StreamHeaders, VodItem } from '../types.js';
import {
  audienceFromText,
  cleanTitle,
  extractYear,
  inferChannelCategory,
  isArabicChannel,
  normalizeLanguages,
} from './classify.js';

export interface M3uEntry {
  name: string;
  url: string;
  duration: number;
  attrs: Record<string, string>;
  headers: StreamHeaders;
}

export interface M3uPlaylist {
  epgUrl?: string;
  entries: M3uEntry[];
}

export function stableId(prefix: string, ...parts: (string | number | undefined)[]): string {
  const h = createHash('sha1').update(parts.map((p) => String(p ?? '')).join('\u0000')).digest('base64url');
  return `${prefix}-${h.slice(0, 16)}`;
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

/** Parses extended M3U, including #EXTVLCOPT / #EXTHTTP header hints and #EXTGRP. */
export function parseM3u(text: string): M3uPlaylist {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const playlist: M3uPlaylist = { entries: [] };
  let pending: Omit<M3uEntry, 'url'> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      const attrs = Object.fromEntries([...line.matchAll(ATTR_RE)].map((m) => [m[1].toLowerCase(), m[2]]));
      const epg = attrs['x-tvg-url'] ?? attrs['url-tvg'] ?? attrs['tvg-url'];
      if (epg) playlist.epgUrl = epg.split(',')[0].trim();
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const body = line.slice(line.indexOf(':') + 1);
      // The display name follows the last comma that is outside an attribute value.
      let inQuote = false;
      let split = -1;
      for (let i = 0; i < body.length; i++) {
        if (body[i] === '"') inQuote = !inQuote;
        else if (body[i] === ',' && !inQuote) split = i;
      }
      const meta = split >= 0 ? body.slice(0, split) : body;
      const name = split >= 0 ? body.slice(split + 1).trim() : '';
      const attrs = Object.fromEntries([...meta.matchAll(ATTR_RE)].map((m) => [m[1].toLowerCase(), m[2]]));
      const duration = Number.parseFloat(meta) || -1;
      pending = { name, duration, attrs, headers: {} };
      if (attrs['http-user-agent']) pending.headers.userAgent = attrs['http-user-agent'];
      if (attrs['http-referrer']) pending.headers.referrer = attrs['http-referrer'];
      continue;
    }

    if (line.startsWith('#EXTGRP:') && pending) {
      pending.attrs['group-title'] ??= line.slice(8).trim();
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:') && pending) {
      const opt = line.slice(11);
      const [key, ...rest] = opt.split('=');
      const value = rest.join('=').trim();
      if (/http-user-agent/i.test(key)) pending.headers.userAgent = value;
      if (/http-referr?er/i.test(key)) pending.headers.referrer = value;
      continue;
    }

    if (line.startsWith('#')) continue;

    if (pending) {
      // Kodi-style "url|User-Agent=..&Referer=.." suffix
      const [url, pipeOpts] = line.split('|');
      if (pipeOpts) {
        for (const kv of pipeOpts.split('&')) {
          const [k, v] = kv.split('=');
          if (!v) continue;
          if (/user-agent/i.test(k)) pending.headers.userAgent = decodeURIComponent(v);
          if (/referr?er/i.test(k)) pending.headers.referrer = decodeURIComponent(v);
        }
      }
      playlist.entries.push({ ...pending, url: url.trim() });
      pending = null;
    }
  }
  return playlist;
}

const SERIES_RE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,4})\b/i;
const VOD_EXT = /\.(mp4|mkv|avi|mov|m4v|webm)(\?|$)/i;

export function entryKind(entry: M3uEntry): 'live' | 'movie' | 'episode' {
  const url = entry.url;
  if (/\/series\//i.test(url) || (SERIES_RE.test(entry.name) && VOD_EXT.test(url))) return 'episode';
  if (/\/movie\//i.test(url) || VOD_EXT.test(url)) return 'movie';
  return 'live';
}

function headersOrUndefined(h: StreamHeaders, fallbackUa?: string): StreamHeaders | undefined {
  const merged = { userAgent: h.userAgent ?? fallbackUa, referrer: h.referrer };
  return merged.userAgent || merged.referrer ? merged : undefined;
}

/** Turns a parsed playlist into channels, movies and series (episodes grouped by show name). */
export function playlistToContent(
  playlist: M3uPlaylist,
  sourceId: string,
  opts: { userAgent?: string } = {},
): { channels: Channel[]; vod: VodItem[] } {
  const channels: Channel[] = [];
  const vod: VodItem[] = [];
  const seriesMap = new Map<string, VodItem>();
  const seenUrls = new Set<string>();

  for (const entry of playlist.entries) {
    if (!entry.url || seenUrls.has(entry.url)) continue;
    seenUrls.add(entry.url);
    const group = entry.attrs['group-title'] || undefined;
    const logo = entry.attrs['tvg-logo'] || undefined;
    const name = entry.name || entry.attrs['tvg-name'] || 'Untitled';
    const headers = headersOrUndefined(entry.headers, opts.userAgent);
    const kind = entryKind(entry);

    if (kind === 'live') {
      const tvgId = entry.attrs['tvg-id'] || undefined;
      // iptv-org ids look like "AlJazeera.qa@SD"; the suffix after the dot is the country.
      const idCountry = tvgId?.match(/\.([a-z]{2})(@|$)/i)?.[1];
      const country = (entry.attrs['tvg-country'] || idCountry || '').split(/[;,]/)[0].toUpperCase() || undefined;
      const languages = normalizeLanguages(entry.attrs['tvg-language']);
      const chno = Number(entry.attrs['tvg-chno']);
      channels.push({
        id: stableId('ch', sourceId, entry.url),
        sourceId,
        name,
        logo,
        group,
        tvgId,
        country,
        languages,
        category: inferChannelCategory(name, group),
        isArabic: isArabicChannel({ name, group, country, languages }),
        number: Number.isFinite(chno) && chno > 0 ? chno : undefined,
        streamUrl: entry.url,
        headers,
      });
      continue;
    }

    const audience = audienceFromText(group, name) ?? 'other';

    if (kind === 'movie') {
      vod.push({
        id: stableId('mov', sourceId, entry.url),
        sourceId,
        kind: 'movie',
        title: cleanTitle(name),
        year: extractYear(name),
        poster: logo,
        genres: [],
        group,
        audience,
        streamUrl: entry.url,
        headers,
      });
      continue;
    }

    const m = name.match(SERIES_RE);
    const showName = cleanTitle((m?.[1] ?? name).trim()) || name;
    const season = m ? Number(m[2]) : 1;
    const episodeNo = m ? Number(m[3]) : (seriesMap.get(showName)?.episodes?.length ?? 0) + 1;
    let show = seriesMap.get(showName);
    if (!show) {
      show = {
        id: stableId('ser', sourceId, showName),
        sourceId,
        kind: 'series',
        title: showName,
        poster: logo,
        genres: [],
        group,
        audience,
        headers,
        episodes: [],
      };
      seriesMap.set(showName, show);
      vod.push(show);
    }
    const episode: Episode = {
      id: stableId('ep', sourceId, entry.url),
      season,
      episode: episodeNo,
      title: name,
      streamUrl: entry.url,
    };
    show.episodes!.push(episode);
  }

  for (const show of seriesMap.values()) {
    show.episodes!.sort((a, b) => a.season - b.season || a.episode - b.episode);
  }
  return { channels, vod };
}
