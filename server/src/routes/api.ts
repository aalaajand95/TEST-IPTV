import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Catalog } from '../services/catalog.js';
import type { SourceManager } from '../services/sources.js';
import type { Store } from '../services/store.js';
import { resolveStream, type StreamProxy } from '../services/streams.js';
import type { SourceConfig } from '../types.js';
import type { UiLang } from '../lib/tmdb.js';

const AUDIENCES = ['arabic', 'english', 'anime', 'turkish', 'other', 'all'] as const;
const CATEGORIES = ['news', 'sports', 'kids', 'movies', 'series', 'religious', 'music', 'documentary', 'entertainment', 'general'] as const;

const lang = (req: Request): UiLang => (req.query.lang === 'en' ? 'en' : 'ar');
const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
const bool = (v: unknown) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : undefined);

const httpUrl = z.string().trim().url().refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

const sourceInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('m3u'), name: z.string().trim().min(1).max(100), enabled: z.boolean().default(true),
    url: httpUrl, epgUrl: httpUrl.optional().or(z.literal('')), userAgent: z.string().max(300).optional() }),
  z.object({ type: z.literal('xtream'), name: z.string().trim().min(1).max(100), enabled: z.boolean().default(true),
    server: z.string().trim().min(3).max(300), username: z.string().min(1).max(200), password: z.string().min(1).max(200) }),
  z.object({ type: z.literal('iptv-org'), name: z.string().trim().min(1).max(100), enabled: z.boolean().default(true),
    languages: z.array(z.string().regex(/^[a-z]{3}$/)).max(20).default([]),
    countries: z.array(z.string().regex(/^[a-z]{2}$/)).max(60).default([]) }),
]);

const snapshot = z.object({
  title: z.string().max(300),
  poster: z.string().max(2000).optional(),
  backdrop: z.string().max(2000).optional(),
  kind: z.enum(['channel', 'movie', 'series', 'episode']),
  subtitle: z.string().max(300).optional(),
});

/** Never send provider passwords back to the browser. */
function redactSource(s: SourceConfig) {
  return s.type === 'xtream' ? { ...s, password: '••••••' } : s;
}

type Handler = (req: Request, res: Response) => unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

export function apiRouter(deps: {
  config: Config;
  store: Store;
  sources: SourceManager;
  catalog: Catalog;
  proxy: StreamProxy;
}): Router {
  const { config, store, sources, catalog, proxy } = deps;
  const r = Router();

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!config.adminToken) return next();
    if (req.headers.authorization === `Bearer ${config.adminToken}`) return next();
    res.status(401).json({ error: 'Admin token required' });
  };

  r.get('/health', (_req, res) => res.json({ ok: true }));

  r.get('/config', (_req, res) =>
    res.json({ tmdb: catalog.tmdb.enabled, streamProxy: config.streamProxy, adminRequired: !!config.adminToken }),
  );

  // ----- Browse -----

  r.get('/home', wrap(async (req, res) => res.json(await catalog.home(lang(req)))));

  r.get('/channels', (req, res) => {
    const category = str(req.query.category);
    res.json(catalog.channels({
      arabic: bool(req.query.arabic),
      category: CATEGORIES.includes(category as never) ? (category as (typeof CATEGORIES)[number]) : undefined,
      country: str(req.query.country),
      group: str(req.query.group),
      q: str(req.query.q),
      sourceId: str(req.query.sourceId),
    }));
  });

  r.get('/channels/facets', (req, res) => res.json(catalog.channelFacets(bool(req.query.arabic))));

  r.get('/channels/:id', (req, res) => {
    const c = catalog.channelDetail(req.params.id);
    if (!c) return void res.status(404).json({ error: 'Channel not found' });
    res.json(c);
  });

  const libraryQuery = z.object({
    kind: z.enum(['movie', 'series']).optional(),
    audience: z.enum(AUDIENCES).optional(),
    genre: z.string().optional(),
    group: z.string().optional(),
    q: z.string().optional(),
    sort: z.enum(['added', 'title', 'year', 'rating']).optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
  });

  r.get('/library', (req, res) => {
    const q = libraryQuery.safeParse(req.query);
    if (!q.success) return void res.status(400).json({ error: q.error.issues[0].message });
    res.json(catalog.library(q.data));
  });

  r.get('/library/facets', (req, res) => {
    const kind = req.query.kind === 'movie' || req.query.kind === 'series' ? req.query.kind : undefined;
    const audience = AUDIENCES.find((a) => a === req.query.audience);
    res.json(catalog.libraryFacets(kind, audience));
  });

  r.get('/discover', (req, res) => res.json({ enabled: catalog.tmdb.enabled, rows: catalog.discoverRows(lang(req)) }));

  r.get('/discover/:key', wrap(async (req, res) => {
    if (!catalog.tmdb.enabled) return void res.status(503).json({ error: 'TMDB is not configured' });
    if (!catalog.discoverRows('en').some((row) => row.key === req.params.key)) return void res.status(404).json({ error: 'Unknown row' });
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 500);
    res.json(await catalog.discover(String(req.params.key), lang(req), page));
  }));

  r.get('/title/:id', wrap(async (req, res) => {
    const d = await catalog.detail(String(req.params.id), lang(req));
    if (!d) return void res.status(404).json({ error: 'Title not found' });
    if (d.kind === 'series' && !d.seasons?.length && d.availableId) d.seasons = await catalog.localSeasons(d.availableId);
    res.json(d);
  }));

  r.get('/title/:id/season/:n', wrap(async (req, res) => {
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 0) return void res.status(400).json({ error: 'Bad season' });
    res.json(await catalog.season(String(req.params.id), n, lang(req)));
  }));

  r.get('/search', wrap(async (req, res) => {
    const q = str(req.query.q)?.slice(0, 100);
    if (!q) return void res.json({ channels: [], library: [], discover: [] });
    res.json(await catalog.search(q, lang(req)));
  }));

  // ----- Playback -----

  r.get('/play/:id', (req, res) => {
    const s = resolveStream(sources, String(req.params.id));
    if (!s) return void res.status(404).json({ error: 'Stream not found' });
    const proxied = proxy.sign(s.url, s.headers);
    // Custom headers can't be set by a browser, so streams that need them always go through the proxy.
    const mustProxy = config.streamProxy === 'on' || (config.streamProxy !== 'off' && !!(s.headers?.userAgent || s.headers?.referrer));
    res.json({
      type: s.type,
      url: mustProxy ? proxied : s.url,
      fallbackUrl: config.streamProxy === 'fallback' && !mustProxy ? proxied : undefined,
    });
  });

  r.get('/proxy', wrap(async (req, res) => {
    if (config.streamProxy === 'off') return void res.status(404).end();
    const payload = proxy.verify(String(req.query.p ?? ''), String(req.query.s ?? ''));
    if (!payload) return void res.status(403).json({ error: 'Bad signature' });
    await proxy.pipe(req, res, payload.u, payload.h ?? undefined);
  }));

  // ----- Sources -----

  r.get('/sources', (_req, res) => {
    const statuses = new Map(sources.statuses().map((s) => [s.id, s]));
    res.json(sources.list().map((s) => ({ ...redactSource(s), status: statuses.get(s.id) })));
  });

  r.post('/sources', requireAdmin, (req, res) => {
    const parsed = sourceInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const data = parsed.data.type === 'm3u' && !parsed.data.epgUrl ? { ...parsed.data, epgUrl: undefined } : parsed.data;
    res.status(201).json(redactSource(sources.add(data as Omit<SourceConfig, 'id'>)));
  });

  r.patch('/sources/:id', requireAdmin, (req, res) => {
    const existing = sources.get(String(req.params.id));
    if (!existing) return void res.status(404).json({ error: 'Source not found' });
    const base = sourceInput.options.find((o) => o.shape.type.value === existing.type);
    const parsed = base ? base.partial().safeParse({ ...req.body, type: existing.type }) : z.object({ name: z.string().optional(), enabled: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const updated = sources.updateSource(existing.id, parsed.data as Partial<SourceConfig>);
    res.json(updated && redactSource(updated));
  });

  r.delete('/sources/:id', requireAdmin, (req, res) => {
    if (!sources.remove(String(req.params.id))) return void res.status(404).json({ error: 'Source not found' });
    res.status(204).end();
  });

  r.post('/sources/:id/refresh', requireAdmin, wrap(async (req, res) => {
    const s = sources.get(String(req.params.id));
    if (!s) return void res.status(404).json({ error: 'Source not found' });
    await sources.refreshOne(s);
    res.json(sources.statuses().find((x) => x.id === s.id));
  }));

  // ----- My list & continue watching -----

  r.get('/favorites', (_req, res) => res.json([...store.read().favorites].sort((a, b) => b.addedAt - a.addedAt)));

  r.put('/favorites/:id', (req, res) => {
    const parsed = z.object({ snapshot }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const id = String(req.params.id);
    store.update((d) => {
      d.favorites = d.favorites.filter((f) => f.id !== id);
      d.favorites.push({ id, addedAt: Date.now(), snapshot: parsed.data.snapshot });
    });
    res.status(204).end();
  });

  r.delete('/favorites/:id', (req, res) => {
    store.update((d) => (d.favorites = d.favorites.filter((f) => f.id !== req.params.id)));
    res.status(204).end();
  });

  r.get('/progress', (_req, res) => {
    const list = Object.values(store.read().progress)
      .filter((p) => p.duration > 0 && p.position / p.duration < 0.95)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
    res.json(list);
  });

  r.get('/progress/:id', (req, res) => {
    const p = store.read().progress[String(req.params.id)];
    if (!p) return void res.status(404).json({ error: 'No progress' });
    res.json(p);
  });

  r.put('/progress/:id', (req, res) => {
    const parsed = z.object({
      position: z.number().min(0),
      duration: z.number().min(0),
      parentId: z.string().max(100).optional(),
      snapshot,
    }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const id = String(req.params.id);
    store.update((d) => {
      d.progress[id] = { id, ...parsed.data, updatedAt: Date.now() };
      // Bound the history so the JSON file doesn't grow forever.
      const all = Object.values(d.progress);
      if (all.length > 500) {
        for (const old of all.sort((a, b) => a.updatedAt - b.updatedAt).slice(0, all.length - 500)) delete d.progress[old.id];
      }
    });
    res.status(204).end();
  });

  r.delete('/progress/:id', (req, res) => {
    store.update((d) => delete d.progress[String(req.params.id)]);
    res.status(204).end();
  });

  return r;
}
