import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseM3u, playlistToContent } from '../src/lib/m3u.js';
import { parseXmltv, parseXmltvDate } from '../src/lib/xmltv.js';
import {
  audienceFromText, cleanTitle, extractYear, inferChannelCategory, isArabicChannel, normalizeLanguages, normalizeTitle,
} from '../src/lib/classify.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseM3u', () => {
  const playlist = parseM3u(fixture('arabic.m3u'));

  it('reads the EPG url from the header', () => {
    expect(playlist.epgUrl).toBe('https://example.com/epg.xml.gz');
  });

  it('parses attributes, names with commas in group-title, and header hints', () => {
    const bbc = playlist.entries.find((e) => e.name === 'BBC News')!;
    expect(bbc.attrs['group-title']).toBe('News, World');
    const mbc = playlist.entries.find((e) => e.name === 'MBC 1')!;
    expect(mbc.headers).toEqual({ userAgent: 'Mozilla/5.0 Test', referrer: 'https://mbc.example/' });
    const st = playlist.entries.find((e) => e.name === 'سبيستون')!;
    expect(st.url).toBe('https://example.com/spacetoon.m3u8');
    expect(st.headers.userAgent).toBe('Kodi/20');
  });
});

describe('playlistToContent', () => {
  const { channels, vod } = playlistToContent(parseM3u(fixture('arabic.m3u')), 'src1');

  it('splits live channels from VOD and drops duplicate URLs', () => {
    expect(channels.map((c) => c.name)).toEqual(['Al Jazeera (1080p)', 'MBC 1', 'سبيستون', 'BBC News']);
  });

  it('classifies Arabic channels and categories', () => {
    const byName = Object.fromEntries(channels.map((c) => [c.name, c]));
    expect(byName['Al Jazeera (1080p)']).toMatchObject({ isArabic: true, category: 'news', country: 'QA', languages: ['ar'] });
    expect(byName['MBC 1']).toMatchObject({ isArabic: true, country: 'AE' });
    expect(byName['سبيستون']).toMatchObject({ isArabic: true, category: 'kids' });
    expect(byName['BBC News']).toMatchObject({ isArabic: false, category: 'news', country: 'UK' });
  });

  it('builds movies with clean titles and years', () => {
    const movies = vod.filter((v) => v.kind === 'movie');
    expect(movies.map((m) => [m.title, m.year, m.audience])).toEqual([
      ['الرسالة', 1976, 'arabic'],
      ['The Message', 1976, 'english'],
    ]);
  });

  it('groups episodes into sorted series', () => {
    const bab = vod.find((v) => v.kind === 'series' && v.title === 'باب الحارة')!;
    expect(bab.audience).toBe('arabic');
    expect(bab.episodes!.map((e) => [e.season, e.episode])).toEqual([[1, 1], [1, 2]]);
    const naruto = vod.find((v) => v.title === 'Naruto')!;
    expect(naruto.audience).toBe('anime');
  });

  it('gives stable ids across parses', () => {
    const again = playlistToContent(parseM3u(fixture('arabic.m3u')), 'src1');
    expect(again.channels.map((c) => c.id)).toEqual(channels.map((c) => c.id));
  });
});

describe('classify', () => {
  it('detects audiences from provider category conventions', () => {
    expect(audienceFromText('AR | MBC')).toBe('arabic');
    expect(audienceFromText('|AR| أفلام')).toBe('arabic');
    expect(audienceFromText('EN - Netflix')).toBe('english');
    expect(audienceFromText('VOD: Anime')).toBe('anime');
    expect(audienceFromText('TR | Diziler')).toBe('turkish');
    expect(audienceFromText('مسلسلات تركية')).toBe('turkish');
    expect(audienceFromText('Cartoons')).toBeUndefined();
    // "Arabian Nights" is not an "AR" tag
    expect(audienceFromText('Arabian Nights')).toBeUndefined();
  });

  it('flags Arabic channels by country, language, script or group tag', () => {
    expect(isArabicChannel({ name: 'X', country: 'EG', languages: [] })).toBe(true);
    expect(isArabicChannel({ name: 'X', languages: ['ar'] })).toBe(true);
    expect(isArabicChannel({ name: 'قناة', languages: [] })).toBe(true);
    expect(isArabicChannel({ name: 'Rotana Cinema', group: 'OSN', languages: [] })).toBe(true);
    expect(isArabicChannel({ name: 'CNN', group: 'News', languages: ['en'], country: 'US' })).toBe(false);
  });

  it('infers channel categories in both languages', () => {
    expect(inferChannelCategory('beIN Sports 1')).toBe('sports');
    expect(inferChannelCategory('قناة القرآن الكريم')).toBe('religious');
    expect(inferChannelCategory('Rotana Cinema')).toBe('movies');
    expect(inferChannelCategory('Some Channel', 'أخبار')).toBe('news');
    expect(inferChannelCategory('Random')).toBe('general');
  });

  it('normalizes languages and titles', () => {
    expect(normalizeLanguages('Arabic;English')).toEqual(['ar', 'en']);
    expect(normalizeLanguages('ara')).toEqual(['ar']);
    expect(normalizeTitle('الرِّسالة')).toBe(normalizeTitle('الرسالة'));
    expect(normalizeTitle('AR | The Message (1976) 4K')).toBe('the message');
    expect(cleanTitle('EN | Dune: Part Two (2024)')).toBe('Dune: Part Two');
    expect(extractYear('Dune: Part Two (2024)')).toBe(2024);
    expect(extractYear('2012')).toBeUndefined();
  });
});

describe('xmltv', () => {
  it('parses timezone offsets', () => {
    expect(parseXmltvDate('20261013180000 +0300')).toBe(Date.UTC(2026, 9, 13, 15, 0, 0));
    expect(parseXmltvDate('20261013180000')).toBe(Date.UTC(2026, 9, 13, 18, 0, 0));
  });

  it('keeps only wanted channels within the window and prefers the requested language', () => {
    const progs = parseXmltv(fixture('epg.xml'), {
      channelIds: new Set(['AlJazeera.qa@SD']),
      from: Date.UTC(2026, 9, 13, 0),
      to: Date.UTC(2026, 9, 14, 0),
      preferLang: 'ar',
    });
    expect(progs.map((p) => p.title)).toEqual(['حصاد اليوم', 'Inside Story & Analysis']);
    expect(progs[0].description).toBe('نشرة الأخبار');
  });
});
