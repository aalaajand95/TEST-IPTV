import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Config } from './config.js';
import { TmdbClient } from './lib/tmdb.js';
import { apiRouter } from './routes/api.js';
import { Catalog } from './services/catalog.js';
import { defaultSources, SourceManager } from './services/sources.js';
import { Store } from './services/store.js';
import { StreamProxy } from './services/streams.js';

export function createApp(config: Config) {
  const store = new Store(config.dataDir);
  if (store.isNew) store.update((d) => (d.sources = defaultSources(config.demo)));

  const sources = new SourceManager(store, { refreshMinutes: config.refreshMinutes });
  const tmdb = new TmdbClient({ apiKey: config.tmdbApiKey, readToken: config.tmdbReadToken });
  const catalog = new Catalog(sources, tmdb);
  const proxy = new StreamProxy(config.proxySecret);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', apiRouter({ config, store, sources, catalog, proxy }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built web app (npm run build) with an SPA fallback.
  const here = dirname(fileURLToPath(import.meta.url));
  const dist = resolve(config.webDist ?? join(here, '../../web/dist'));
  if (existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  });

  return { app, store, sources, catalog };
}
