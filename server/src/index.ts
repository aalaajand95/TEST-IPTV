import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app, store, sources } = createApp(config);

sources.start();
const server = app.listen(config.port, () => {
  console.log(`Souq TV listening on http://localhost:${config.port}`);
  if (!config.tmdbApiKey && !config.tmdbReadToken) {
    console.log('TMDB not configured: Discover rows and rich metadata are disabled (set TMDB_API_KEY).');
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    sources.stop();
    store.flush();
    server.close(() => process.exit(0));
  });
}
