import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { StreamProxy } from '../src/services/streams.js';

/** A fake Xtream Codes panel served through a stubbed global fetch. */
function xtreamFetch(): typeof fetch {
  const data: Record<string, unknown> = {
    '': { user_info: { auth: 1, status: 'Active', exp_date: '1893456000' } },
    get_live_categories: [{ category_id: '1', category_name: 'AR | News' }, { category_id: '2', category_name: 'EN | Sports' }],
    get_vod_categories: [{ category_id: '10', category_name: 'AR | Movies' }, { category_id: '11', category_name: 'EN | Movies' }],
    get_series_categories: [{ category_id: '20', category_name: 'AR | Ramadan 2026' }, { category_id: '21', category_name: 'Anime' }],
    get_live_streams: [
      { num: 1, name: 'Al Arabiya', stream_id: 501, category_id: '1', epg_channel_id: 'AlArabiya.ae' },
      { num: 2, name: 'Sky Sports', stream_id: 502, category_id: '2', epg_channel_id: 'SkySports.uk' },
    ],
    get_vod_streams: [
      { name: 'AR | الرسالة (1976)', stream_id: 601, category_id: '10', container_extension: 'mkv', tmdb: '30985', added: '1700000000' },
      { name: 'EN | Dune: Part Two (2024)', stream_id: 602, category_id: '11', container_extension: 'mp4', rating: '8.3', added: '1760000000' },
    ],
    get_series: [
      { series_id: 701, name: 'باب الحارة', category_id: '20', cover: 'https://img/bab.jpg', genre: 'Drama' },
      { series_id: 702, name: 'Naruto', category_id: '21' },
    ],
    get_series_info: { episodes: { '1': [
      { id: '9001', episode_num: 1, title: 'E1', container_extension: 'mp4', season: 1 },
      { id: '9002', episode_num: 2, title: 'E2', container_extension: 'mp4', season: 1 },
    ] } },
  };
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith('/player_api.php')) throw new Error(`unexpected fetch ${url}`);
    if (url.searchParams.get('password') !== 'secret') return Response.json({ user_info: { auth: 0 } });
    return Response.json(data[url.searchParams.get('action') ?? '']);
  }) as typeof fetch;
}

describe('API', () => {
  let ctx: ReturnType<typeof createApp>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', xtreamFetch());
    ctx = createApp(loadConfig({ DATA_DIR: '', DEMO: '1', STREAM_PROXY: 'fallback', PROXY_SECRET: 'test' }));
    // Replace the default sources with the demo + a fake Xtream provider.
    ctx.store.update((d) => {
      d.sources = [
        { id: 'demo', type: 'demo', name: 'Demo', enabled: true },
        { id: 'xt', type: 'xtream', name: 'Provider', enabled: true, server: 'panel.example:8080', username: 'u', password: 'secret' },
      ];
    });
    await ctx.sources.refreshAll();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lists Arabic channels from every source with facets', async () => {
    const res = await request(ctx.app).get('/api/channels?arabic=true').expect(200);
    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toContain('Al Arabiya');
    expect(names).not.toContain('Sky Sports');
    const facets = await request(ctx.app).get('/api/channels/facets?arabic=true').expect(200);
    expect(facets.body.categories.find((c: { value: string }) => c.value === 'news').count).toBeGreaterThan(0);
  });

  it('includes now/next from the EPG', async () => {
    const res = await request(ctx.app).get('/api/channels?category=news&arabic=true').expect(200);
    const demo = res.body.find((c: { sourceId: string }) => c.sourceId === 'demo');
    expect(demo.now.title).toBeTruthy();
    expect(demo.next.start).toBeGreaterThan(demo.now.start);
  });

  it('filters the library by audience and kind', async () => {
    const arabic = await request(ctx.app).get('/api/library?audience=arabic&kind=movie').expect(200);
    expect(arabic.body.items.map((i: { title: string }) => i.title)).toEqual(['الرسالة']);
    const anime = await request(ctx.app).get('/api/library?audience=anime&kind=series').expect(200);
    expect(anime.body.items.map((i: { title: string }) => i.title)).toEqual(['Naruto']);
    await request(ctx.app).get('/api/library?kind=bogus').expect(400);
  });

  it('loads Xtream series episodes lazily and plays them', async () => {
    const lib = await request(ctx.app).get('/api/library?q=باب').expect(200);
    const id = lib.body.items[0].id;
    const detail = await request(ctx.app).get(`/api/title/${id}`).expect(200);
    expect(detail.body.seasons).toEqual([{ season: 1, name: 'Season 1', episodeCount: 2 }]);
    const eps = await request(ctx.app).get(`/api/title/${id}/season/1`).expect(200);
    expect(eps.body).toHaveLength(2);
    const play = await request(ctx.app).get(`/api/play/${eps.body[1].id}`).expect(200);
    expect(play.body.url).toBe('http://panel.example:8080/series/u/secret/9002.mp4');
    expect(play.body.type).toBe('file');
    expect(play.body.fallbackUrl).toMatch(/^\/api\/proxy\?p=/);
  });

  it('builds HLS live URLs and returns 404 for unknown streams', async () => {
    const ch = (await request(ctx.app).get('/api/channels?q=arabiya')).body[0];
    const play = await request(ctx.app).get(`/api/play/${ch.id}`).expect(200);
    expect(play.body).toMatchObject({ type: 'hls', url: 'http://panel.example:8080/live/u/secret/501.m3u8' });
    await request(ctx.app).get('/api/play/ch-nope').expect(404);
  });

  it('searches across channels and library, Arabic diacritics-insensitive', async () => {
    const res = await request(ctx.app).get('/api/search?q=' + encodeURIComponent('الرِّسالة')).expect(200);
    expect(res.body.library.map((i: { title: string }) => i.title)).toContain('الرسالة');
  });

  it('never returns provider passwords and validates new sources', async () => {
    const res = await request(ctx.app).get('/api/sources').expect(200);
    const xt = res.body.find((s: { id: string }) => s.id === 'xt');
    expect(xt.password).toBe('••••••');
    expect(xt.status).toMatchObject({ state: 'ok', counts: { channels: 2, movies: 2, series: 2 } });
    await request(ctx.app).post('/api/sources').send({ type: 'm3u', name: 'x', url: 'file:///etc/passwd' }).expect(400);
  });

  it('keeps the stored password when the redacted placeholder is sent back', async () => {
    await request(ctx.app).patch('/api/sources/xt').send({ name: 'Renamed', password: '••••••' }).expect(200);
    const stored = ctx.sources.get('xt');
    expect(stored).toMatchObject({ name: 'Renamed', password: 'secret' });
  });

  it('reports a rejected login as a source error without dropping other sources', async () => {
    ctx.store.update((d) => {
      const xt = d.sources.find((s) => s.id === 'xt');
      if (xt?.type === 'xtream') xt.password = 'wrong';
    });
    const status = await request(ctx.app).post('/api/sources/xt/refresh').expect(200);
    expect(status.body).toMatchObject({ state: 'error', error: 'Xtream login rejected' });
    // Last good content is kept
    const lib = await request(ctx.app).get('/api/library?audience=arabic&kind=movie').expect(200);
    expect(lib.body.total).toBe(1);
  });

  it('stores favourites and continue-watching progress', async () => {
    const snapshot = { title: 'Sintel', kind: 'movie' };
    await request(ctx.app).put('/api/favorites/mov-1').send({ snapshot }).expect(204);
    expect((await request(ctx.app).get('/api/favorites')).body[0]).toMatchObject({ id: 'mov-1', snapshot });
    await request(ctx.app).put('/api/progress/mov-1').send({ position: 60, duration: 600, snapshot }).expect(204);
    await request(ctx.app).put('/api/progress/mov-2').send({ position: 599, duration: 600, snapshot }).expect(204);
    const prog = await request(ctx.app).get('/api/progress').expect(200);
    expect(prog.body.map((p: { id: string }) => p.id)).toEqual(['mov-1']); // finished titles drop off
  });

  it('home has Arabic live and library rows', async () => {
    const res = await request(ctx.app).get('/api/home?lang=ar').expect(200);
    const keys = res.body.rows.map((r: { key: string }) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['live-arabic', 'lib-arabic-movies', 'lib-arabic-series', 'lib-anime']));
    expect(res.body.rows[0].title).toBe('القنوات العربية المباشرة');
  });

  it('never leaks upstream stream URLs (they carry provider credentials) outside /api/play', async () => {
    for (const path of ['/api/home?lang=en', '/api/library', '/api/channels', '/api/search?q=a', '/api/library?q=باب']) {
      const res = await request(ctx.app).get(path).expect(200);
      expect(JSON.stringify(res.body), path).not.toMatch(/streamUrl|secret|\/movie\/u\/|\/live\/u\//);
    }
    const lib = await request(ctx.app).get('/api/library?q=' + encodeURIComponent('باب')).expect(200);
    const eps = await request(ctx.app).get(`/api/title/${lib.body.items[0].id}/season/1`).expect(200);
    expect(JSON.stringify(eps.body)).not.toMatch(/streamUrl|secret/);
  });

  it('requires the admin token for source changes when configured', async () => {
    const locked = createApp(loadConfig({ DATA_DIR: '', DEMO: '1', ADMIN_TOKEN: 'tok' }));
    await request(locked.app).delete('/api/sources/demo').expect(401);
    await request(locked.app).delete('/api/sources/demo').set('authorization', 'Bearer tok').expect(204);
  });
});

describe('StreamProxy', () => {
  const proxy = new StreamProxy('k');

  it('rewrites variant, segment and key URIs to signed proxy URLs', () => {
    const out = proxy.rewritePlaylist(
      ['#EXTM3U', '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"', '#EXTINF:6,', 'seg1.ts', 'https://cdn.example/abs.ts'].join('\n'),
      'https://origin.example/live/index.m3u8',
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    const keyUrl = lines[1].match(/URI="([^"]+)"/)![1];
    const params = new URL(keyUrl, 'http://x').searchParams;
    expect(proxy.verify(params.get('p')!, params.get('s')!)?.u).toBe('https://origin.example/live/key.bin');
    const seg = new URL(lines[3], 'http://x').searchParams;
    expect(proxy.verify(seg.get('p')!, seg.get('s')!)?.u).toBe('https://origin.example/live/seg1.ts');
    expect(lines[4]).toMatch(/^\/api\/proxy\?/);
  });

  it('rejects tampered signatures', () => {
    const url = new URL(proxy.sign('https://a.example/x.m3u8'), 'http://x');
    const forged = Buffer.from(JSON.stringify({ u: 'http://169.254.169.254/', h: null })).toString('base64url');
    expect(proxy.verify(forged, url.searchParams.get('s')!)).toBeNull();
  });
});
