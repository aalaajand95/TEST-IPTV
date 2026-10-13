import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import type { StreamHeaders } from '../types.js';
import { fetchWithTimeout, redact, upstreamHeaders } from '../lib/http.js';
import type { SourceManager } from './sources.js';

export interface ResolvedStream {
  url: string;
  headers?: StreamHeaders;
  type: 'hls' | 'file';
}

export function streamType(url: string): 'hls' | 'file' {
  if (/\.m3u8?(\?|$)/i.test(url) || /\/live\//.test(url)) return 'hls';
  if (/\.(mp4|mkv|webm|mov|m4v|avi)(\?|$)/i.test(url)) return 'file';
  return 'hls';
}

/** Ids carry their type in the prefix: ch- (channel), mov- (movie), ep- (episode). */
export function resolveStream(sources: SourceManager, id: string): ResolvedStream | undefined {
  if (id.startsWith('ch-')) {
    const c = sources.channel(id);
    return c && { url: c.streamUrl, headers: c.headers, type: streamType(c.streamUrl) };
  }
  if (id.startsWith('mov-')) {
    const m = sources.item(id);
    return m?.streamUrl ? { url: m.streamUrl, headers: m.headers, type: streamType(m.streamUrl) } : undefined;
  }
  if (id.startsWith('ep-')) {
    const hit = sources.episode(id);
    return hit && { url: hit.episode.streamUrl, headers: hit.series.headers, type: streamType(hit.episode.streamUrl) };
  }
  return undefined;
}

/**
 * Optional pass-through proxy. Playlists are rewritten so every segment/key/variant URL points back at
 * /api/proxy with an HMAC signature, which stops the endpoint from being used as an open proxy.
 */
export class StreamProxy {
  constructor(private secret: string) {}

  sign(url: string, headers?: StreamHeaders): string {
    const payload = Buffer.from(JSON.stringify({ u: url, h: headers ?? null })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url').slice(0, 32);
    return `/api/proxy?p=${payload}&s=${sig}`;
  }

  verify(p: string, s: string): { u: string; h: StreamHeaders | null } | null {
    const expected = createHmac('sha256', this.secret).update(p).digest('base64url').slice(0, 32);
    const a = Buffer.from(expected);
    const b = Buffer.from(s ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  rewritePlaylist(body: string, baseUrl: string, headers?: StreamHeaders): string {
    const abs = (u: string) => new URL(u, baseUrl).toString();
    return body
      .split(/\r?\n/)
      .map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
          // EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, EXT-X-I-FRAME-STREAM-INF carry URI="..."
          return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${this.sign(abs(u), headers)}"`);
        }
        return this.sign(abs(t), headers);
      })
      .join('\n');
  }

  async pipe(req: Request, res: Response, url: string, headers?: StreamHeaders) {
    const h = upstreamHeaders(headers);
    if (req.headers.range) h.range = req.headers.range;
    const abort = new AbortController();
    req.on('close', () => abort.abort());
    let upstream: globalThis.Response;
    try {
      upstream = await fetchWithTimeout(url, { headers: h, signal: abort.signal });
    } catch (err) {
      if (!res.headersSent) res.status(502).json({ error: `Upstream unreachable: ${redact(String((err as Error).message))}` });
      return;
    }
    const ctype = upstream.headers.get('content-type') ?? '';
    const finalUrl = upstream.url || url;
    const isPlaylist = /mpegurl/i.test(ctype) || /\.m3u8?(\?|$)/i.test(new URL(finalUrl).pathname);

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', isPlaylist ? 'no-cache' : 'public, max-age=60');
    if (isPlaylist && upstream.ok) {
      const text = await upstream.text();
      res.status(200).type('application/vnd.apple.mpegurl').send(this.rewritePlaylist(text, finalUrl, headers));
      return;
    }
    res.status(upstream.status);
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(k);
      if (v) res.setHeader(k, v);
    }
    if (!upstream.body) return void res.end();
    Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).on('error', () => res.destroy()).pipe(res);
  }
}
