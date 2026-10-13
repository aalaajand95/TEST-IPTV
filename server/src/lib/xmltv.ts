import { XMLParser } from 'fast-xml-parser';
import type { Programme } from '../types.js';

/** XMLTV timestamps look like "20261013183000 +0300". */
export function parseXmltvDate(s: string): number {
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, sec = '00', tz = '+0000'] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);
  const sign = tz[0] === '-' ? -1 : 1;
  const offsetMin = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  return utc - offsetMin * 60_000;
}

function text(node: unknown, preferLang?: string): string | undefined {
  if (node == null) return undefined;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    const preferred = preferLang ? node.find((n) => n?.['@_lang'] === preferLang) : undefined;
    return text(preferred ?? node[0]);
  }
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text']);
  }
  return undefined;
}

/**
 * Parses an XMLTV document, keeping only programmes for the given channel ids inside
 * [from, to]. EPG feeds are often tens of MB, so filtering early keeps memory in check.
 */
export function parseXmltv(
  xml: string,
  opts: { channelIds?: Set<string>; from?: number; to?: number; preferLang?: string } = {},
): Programme[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['programme', 'title', 'desc', 'channel'].includes(name),
    processEntities: true,
  });
  const doc = parser.parse(xml);
  const progs: unknown[] = doc?.tv?.programme ?? [];
  const from = opts.from ?? Date.now() - 3 * 3600_000;
  const to = opts.to ?? Date.now() + 36 * 3600_000;
  const out: Programme[] = [];
  for (const p of progs as Record<string, unknown>[]) {
    const channelId = String(p['@_channel'] ?? '');
    if (opts.channelIds && !opts.channelIds.has(channelId)) continue;
    const start = parseXmltvDate(String(p['@_start'] ?? ''));
    const stop = parseXmltvDate(String(p['@_stop'] ?? ''));
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < from || start > to) continue;
    out.push({
      channelId,
      start,
      stop,
      title: text(p.title, opts.preferLang) ?? '',
      description: text(p.desc, opts.preferLang),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}
