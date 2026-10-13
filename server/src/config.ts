import { randomBytes } from 'node:crypto';

export interface Config {
  port: number;
  dataDir: string | null;
  tmdbApiKey?: string;
  tmdbReadToken?: string;
  adminToken?: string;
  /** off: client plays upstream URLs directly. on: always via this server. fallback: direct first, proxy if the browser can't. */
  streamProxy: 'off' | 'on' | 'fallback';
  proxySecret: string;
  refreshMinutes: number;
  demo: boolean;
  webDist?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const proxy = (env.STREAM_PROXY ?? 'fallback').toLowerCase();
  return {
    port: Number(env.PORT) || 8080,
    dataDir: env.DATA_DIR === '' ? null : env.DATA_DIR ?? './data',
    tmdbApiKey: env.TMDB_API_KEY || undefined,
    tmdbReadToken: env.TMDB_READ_TOKEN || undefined,
    adminToken: env.ADMIN_TOKEN || undefined,
    streamProxy: proxy === 'on' || proxy === 'off' ? proxy : 'fallback',
    proxySecret: env.PROXY_SECRET || randomBytes(32).toString('hex'),
    refreshMinutes: Math.max(Number(env.REFRESH_MINUTES) || 360, 5),
    demo: env.DEMO !== '0' && env.DEMO !== 'false',
    webDist: env.WEB_DIST,
  };
}
