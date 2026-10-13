import type { SourceContent } from '../types.js';
import { stableId } from '../lib/m3u.js';

/**
 * Demo content so the app is usable before any provider is connected.
 * Every stream here is an openly licensed test asset (Blender Foundation films under CC-BY,
 * Mux / Apple HLS test streams). Channel names are fictional placeholders, not real broadcasters.
 */
const HLS_TEST = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const HLS_BIPBOP = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8';
const GTV = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';
const BLENDER_IMG = 'https://upload.wikimedia.org/wikipedia/commons/thumb';

export function demoContent(sourceId: string): SourceContent {
  const ch = (name: string, group: string, category: SourceContent['channels'][number]['category'], isArabic: boolean, n: number, url = HLS_TEST) => ({
    id: stableId('ch', sourceId, name),
    sourceId,
    name,
    group,
    category,
    isArabic,
    languages: isArabic ? ['ar'] : ['en'],
    country: isArabic ? 'SA' : undefined,
    number: n,
    streamUrl: url,
    tvgId: `demo.${n}`,
  });

  const channels = [
    ch('قناة الأخبار التجريبية', 'أخبار', 'news', true, 1),
    ch('الرياضة التجريبية ١', 'رياضة', 'sports', true, 2, HLS_BIPBOP),
    ch('دراما تجريبية', 'مسلسلات', 'series', true, 3),
    ch('سينما تجريبية', 'أفلام', 'movies', true, 4, HLS_BIPBOP),
    ch('أطفال تجريبي', 'أطفال', 'kids', true, 5),
    ch('القرآن الكريم - تجريبي', 'ديني', 'religious', true, 6, HLS_BIPBOP),
    ch('Demo News International', 'News', 'news', false, 101),
    ch('Demo Movies', 'Movies', 'movies', false, 102, HLS_BIPBOP),
  ];

  const now = Date.now();
  const hour = 3600_000;
  const slot = Math.floor(now / hour) * hour;
  const programmes = channels.flatMap((c, i) =>
    Array.from({ length: 6 }, (_, k) => ({
      channelId: c.tvgId!,
      start: slot + (k - 1) * hour,
      stop: slot + k * hour,
      title: c.isArabic ? `برنامج ${k + 1 + i}` : `Programme ${k + 1 + i}`,
      description: c.isArabic ? 'وصف تجريبي للبرنامج.' : 'Demo programme description.',
    })),
  );

  const movie = (title: string, year: number, file: string, poster: string, audience: 'english' | 'anime', overview: string, genres: string[]) => ({
    id: stableId('mov', sourceId, file),
    sourceId,
    kind: 'movie' as const,
    title,
    year,
    poster,
    backdrop: poster,
    overview,
    genres,
    audience,
    group: 'Open Movies',
    streamUrl: `${GTV}/${file}`,
    addedAt: now,
  });

  const vod = [
    movie('Big Buck Bunny', 2008, 'BigBuckBunny.mp4',
      `${BLENDER_IMG}/c/c5/Big_buck_bunny_poster_big.jpg/400px-Big_buck_bunny_poster_big.jpg`, 'english',
      'A giant rabbit takes on three bullying rodents. Blender Foundation open movie (CC-BY).', ['Animation', 'Comedy']),
    movie('Sintel', 2010, 'Sintel.mp4',
      `${BLENDER_IMG}/8/8f/Sintel_poster.jpg/400px-Sintel_poster.jpg`, 'anime',
      'A lonely girl searches for her dragon companion. Blender Foundation open movie (CC-BY).', ['Animation', 'Fantasy']),
    movie('Tears of Steel', 2012, 'TearsOfSteel.mp4',
      `${BLENDER_IMG}/7/70/Tos-poster.png/400px-Tos-poster.png`, 'english',
      'Scientists try to save the world from robots in a future Amsterdam. Blender Foundation open movie (CC-BY).', ['Sci-Fi']),
    movie('Elephants Dream', 2006, 'ElephantsDream.mp4',
      `${BLENDER_IMG}/e/e8/Elephants_Dream_s5_both.jpg/400px-Elephants_Dream_s5_both.jpg`, 'english',
      'Two characters explore a surreal machine world. The first Blender open movie (CC-BY).', ['Animation']),
    {
      id: stableId('ser', sourceId, 'demo-series'),
      sourceId,
      kind: 'series' as const,
      title: 'مسلسل تجريبي',
      year: 2026,
      overview: 'مسلسل تجريبي لعرض واجهة الحلقات والمواسم. Demo series built from open test clips.',
      genres: ['Drama'],
      audience: 'arabic' as const,
      group: 'مسلسلات',
      addedAt: now,
      episodes: ['ForBiggerBlazes', 'ForBiggerEscapes', 'ForBiggerFun', 'ForBiggerJoyrides'].map((f, i) => ({
        id: stableId('ep', sourceId, f),
        season: 1,
        episode: i + 1,
        title: `الحلقة ${i + 1}`,
        streamUrl: `${GTV}/${f}.mp4`,
      })),
    },
  ];

  return { channels, vod, programmes };
}
