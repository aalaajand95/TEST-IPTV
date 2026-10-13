import { gunzipSync } from 'node:zlib';
import type { StreamHeaders } from '../types.js';

const DEFAULT_UA = 'SouqTV/0.1 (+https://github.com/aalaajand95/test-iptv)';

export function upstreamHeaders(h?: StreamHeaders): Record<string, string> {
  const out: Record<string, string> = { 'user-agent': h?.userAgent || DEFAULT_UA };
  if (h?.referrer) out.referer = h.referrer;
  return out;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  const res = await fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) });
  return res;
}

export async function fetchText(url: string, headers?: StreamHeaders, timeoutMs = 60_000): Promise<string> {
  const res = await fetchWithTimeout(url, { headers: upstreamHeaders(headers), timeoutMs });
  if (!res.ok) throw new Error(`GET ${redact(url)} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // EPG feeds are usually .xml.gz served as application/octet-stream, so sniff the gzip magic bytes.
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

export async function fetchJson<T>(url: string, headers?: Record<string, string>, timeoutMs = 30_000): Promise<T> {
  const res = await fetchWithTimeout(url, { headers: { 'user-agent': DEFAULT_UA, ...headers }, timeoutMs });
  if (!res.ok) throw new Error(`GET ${redact(url)} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Strip credentials from URLs before they end up in logs or API error messages. */
export function redact(url: string): string {
  return url
    .replace(/(password|username|api_key)=[^&]+/gi, '$1=***')
    .replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, '/$1/***/***/');
}
