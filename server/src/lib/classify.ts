import type { Audience, ChannelCategory } from '../types.js';

/** Arab League members, ISO 3166-1 alpha-2. */
export const ARAB_COUNTRIES = [
  'DZ', 'BH', 'KM', 'DJ', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'MR',
  'MA', 'OM', 'PS', 'QA', 'SA', 'SO', 'SD', 'SY', 'TN', 'AE', 'YE',
];

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabicScript(text: string | undefined): boolean {
  return !!text && ARABIC_SCRIPT.test(text);
}

/**
 * Provider category names are messy: "AR | MBC", "ARABIC MOVIES", "|AR| أفلام", "EN - Netflix",
 * "VOD: Anime". These patterns catch the common conventions.
 */
const ARABIC_TAG = /(^|[^a-z])(ar|ara|arab|arabic|arabe|عربي|عربية|العربية)([^a-z]|$)/i;
const ARABIC_COUNTRY_TAG = new RegExp(
  `(^|[^a-z])(${ARAB_COUNTRIES.join('|')}|ksa|uae|mena|gulf|khaleeji|osn|mbc|shahid|rotana)([^a-z]|$)`,
  'i',
);
const ENGLISH_TAG = /(^|[^a-z])(en|eng|english|uk|us|usa|netflix|hbo|disney|amazon|apple tv)([^a-z]|$)/i;
const ANIME_TAG = /(anime|animé|أنمي|انمي|crunchyroll|japanese animation)/i;
const TURKISH_TAG = /(^|[^a-z])(tr|tur|turk|turkish|türk|تركي|تركية)([^a-z]|$)/i;

export function audienceFromText(...texts: (string | undefined)[]): Audience | undefined {
  const joined = texts.filter(Boolean).join(' | ');
  if (!joined) return undefined;
  if (ANIME_TAG.test(joined)) return 'anime';
  if (TURKISH_TAG.test(joined)) return 'turkish';
  if (ARABIC_TAG.test(joined) || hasArabicScript(joined)) return 'arabic';
  if (ENGLISH_TAG.test(joined)) return 'english';
  return undefined;
}

export function isArabicChannel(opts: {
  name: string;
  group?: string;
  country?: string;
  languages: string[];
}): boolean {
  if (opts.languages.includes('ar')) return true;
  if (opts.country && ARAB_COUNTRIES.includes(opts.country.toUpperCase())) return true;
  if (hasArabicScript(opts.name) || hasArabicScript(opts.group)) return true;
  const tagged = `${opts.group ?? ''} | ${opts.name}`;
  return ARABIC_TAG.test(tagged) || ARABIC_COUNTRY_TAG.test(opts.group ?? '');
}

const CATEGORY_RULES: [ChannelCategory, RegExp][] = [
  ['news', /(news|akhbar|أخبار|اخبار|إخبارية|اخبارية|jazeera|الجزيرة|arabiya|العربية|sky news|cnn|bbc news|france 24|alhadath|الحدث)/i],
  ['sports', /(sport|رياض|bein|ssc|ad sport|dubai sports|كورة|koora|football|kass|alkass|الكأس)/i],
  ['kids', /(kids|children|cartoon|أطفال|اطفال|spacetoon|سبيستون|majid|ماجد|baraem|براعم|jeem|جيم|nickelodeon|disney jr|cn arabia)/i],
  ['religious', /(quran|قرآن|القرآن|قران|sunnah|سنة|islam|إسلام|makkah|مكة|madinah|المدينة|iqraa|اقرأ|resalah|الرسالة|church|christian|noursat|نورسات|religious|دين)/i],
  ['documentary', /(documentar|وثائقي|nat geo|national geographic|discovery|history|jazeera documentary)/i],
  ['music', /(music|موسيقى|اغاني|أغاني|mazzika|مزيكا|rotana clip|روتانا كليب|melody|ميلودي|wanasah|وناسة|mtv)/i],
  ['movies', /(movie|cinema|film|أفلام|افلام|سينما|aflam|rotana cinema|mbc 2|mbc max|mbc action)/i],
  ['series', /(series|drama|مسلسلات|دراما|mosalsalat|mbc drama|mbc 4|rotana drama)/i],
  ['entertainment', /(entertainment|منوعات|variety|comedy|lifestyle|cooking|طبخ|fatafeat|فتافيت)/i],
];

export function inferChannelCategory(name: string, group?: string): ChannelCategory {
  // Group names are the stronger signal when present ("News", "أخبار"); fall back to the channel name.
  for (const text of [group, name]) {
    if (!text) continue;
    for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  }
  return 'general';
}

/** ISO 639-3 → 639-1 for the languages iptv-org and EPG feeds commonly use. */
const LANG3_TO_1: Record<string, string> = {
  ara: 'ar', eng: 'en', fra: 'fr', fre: 'fr', tur: 'tr', jpn: 'ja', kor: 'ko',
  hin: 'hi', urd: 'ur', fas: 'fa', per: 'fa', kur: 'ku', heb: 'he', spa: 'es',
  deu: 'de', ger: 'de', ita: 'it', por: 'pt', rus: 'ru', zho: 'zh', chi: 'zh',
};

const LANG_NAMES: Record<string, string> = {
  arabic: 'ar', english: 'en', french: 'fr', turkish: 'tr', japanese: 'ja', korean: 'ko',
  hindi: 'hi', urdu: 'ur', persian: 'fa', farsi: 'fa', kurdish: 'ku', hebrew: 'he',
  spanish: 'es', german: 'de', italian: 'it', portuguese: 'pt', russian: 'ru', chinese: 'zh',
};

/** Normalises "ara", "Arabic", "ar", "Arabic;English" to ["ar", "en"]. */
export function normalizeLanguages(raw: string | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/[;,|]/)) {
    const p = part.trim().toLowerCase();
    if (!p) continue;
    if (p.length === 2) out.add(p);
    else if (LANG3_TO_1[p]) out.add(LANG3_TO_1[p]);
    else if (LANG_NAMES[p]) out.add(LANG_NAMES[p]);
  }
  return [...out];
}

/** Map a TMDB original_language + genre ids to an audience bucket. */
export function audienceFromTmdb(originalLanguage: string | undefined, genreIds: number[] = []): Audience {
  const ANIMATION = 16;
  if (originalLanguage === 'ja' && genreIds.includes(ANIMATION)) return 'anime';
  if (originalLanguage === 'ar') return 'arabic';
  if (originalLanguage === 'tr') return 'turkish';
  if (originalLanguage === 'en') return 'english';
  return 'other';
}

/** Lower-case, strip punctuation, diacritics, tashkeel and release-tag noise for title matching. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|multi|sub|dub|dubbed|مدبلج|مترجم)\b/g, ' ')
    .replace(/^\s*(ar|en|tr|4k)\s*[|:-]\s*/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Pull a trailing or bracketed year out of a title: "The Message (1976)" → 1976. */
export function extractYear(title: string): number | undefined {
  const m = title.match(/[([\s-]((?:19|20)\d{2})[)\]]?\s*$/) ?? title.match(/\(((?:19|20)\d{2})\)/);
  return m ? Number(m[1]) : undefined;
}

/** "Title (2019)" → "Title"; also strips "AR |" style provider prefixes. */
export function cleanTitle(title: string): string {
  return title
    .replace(/^\s*\|?\s*[A-Z]{2,3}\s*\|\s*/, '')
    .replace(/^\s*[A-Z]{2,3}\s*[:-]\s+/, '')
    .replace(/\s*[([]\s*(?:19|20)\d{2}\s*[)\]]\s*$/, '')
    .replace(/\s+-\s*(?:19|20)\d{2}\s*$/, '')
    .trim();
}
