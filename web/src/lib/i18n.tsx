import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';

const dict = {
  appName: { en: 'Souq TV', ar: 'سوق تي في' },
  home: { en: 'Home', ar: 'الرئيسية' },
  live: { en: 'Live TV', ar: 'البث المباشر' },
  arabic: { en: 'Arabic', ar: 'عربي' },
  movies: { en: 'Movies', ar: 'أفلام' },
  series: { en: 'Series', ar: 'مسلسلات' },
  anime: { en: 'Anime', ar: 'أنمي' },
  turkish: { en: 'Turkish', ar: 'تركي' },
  english: { en: 'English', ar: 'أجنبي' },
  other: { en: 'World', ar: 'عالمي' },
  all: { en: 'All', ar: 'الكل' },
  myList: { en: 'My List', ar: 'قائمتي' },
  search: { en: 'Search', ar: 'بحث' },
  settings: { en: 'Settings', ar: 'الإعدادات' },
  searchPlaceholder: { en: 'Search channels, movies, series…', ar: 'ابحث عن قنوات، أفلام، مسلسلات…' },
  play: { en: 'Play', ar: 'تشغيل' },
  resume: { en: 'Resume', ar: 'استئناف' },
  trailer: { en: 'Trailer', ar: 'الإعلان' },
  addToList: { en: 'My List', ar: 'أضف لقائمتي' },
  inList: { en: 'In My List', ar: 'في قائمتي' },
  notAvailable: { en: 'Not in your sources yet', ar: 'غير متوفر في مصادرك بعد' },
  available: { en: 'Available', ar: 'متوفر' },
  season: { en: 'Season', ar: 'الموسم' },
  episode: { en: 'Episode', ar: 'الحلقة' },
  nextEpisode: { en: 'Next episode', ar: 'الحلقة التالية' },
  cast: { en: 'Cast', ar: 'طاقم التمثيل' },
  continueWatching: { en: 'Continue Watching', ar: 'متابعة المشاهدة' },
  nowPlaying: { en: 'Now', ar: 'الآن' },
  upNext: { en: 'Next', ar: 'التالي' },
  guide: { en: 'TV Guide', ar: 'دليل البرامج' },
  arabicOnly: { en: 'Arabic channels', ar: 'القنوات العربية' },
  allChannels: { en: 'All channels', ar: 'كل القنوات' },
  allCountries: { en: 'All countries', ar: 'كل الدول' },
  allGenres: { en: 'All genres', ar: 'كل التصنيفات' },
  sortAdded: { en: 'Recently added', ar: 'المضاف حديثاً' },
  sortTitle: { en: 'A–Z', ar: 'أبجدي' },
  sortYear: { en: 'Newest', ar: 'الأحدث' },
  sortRating: { en: 'Top rated', ar: 'الأعلى تقييماً' },
  loadMore: { en: 'Load more', ar: 'عرض المزيد' },
  loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
  retry: { en: 'Retry', ar: 'إعادة المحاولة' },
  seeAll: { en: 'See all', ar: 'عرض الكل' },
  discover: { en: 'Discover', ar: 'اكتشف' },
  discoverHint: {
    en: 'Titles from TMDB. Ones tagged “Discover” aren’t in your connected sources yet; open them for details and trailers.',
    ar: 'عناوين من TMDB. المعلّمة بـ«اكتشف» غير متوفرة في مصادرك بعد؛ افتحها لمشاهدة التفاصيل والإعلان.',
  },
  emptyLibrary: {
    en: 'No titles here yet. Connect an IPTV provider you subscribe to in Settings to fill your library.',
    ar: 'لا توجد عناوين بعد. أضف مزود IPTV مشترك فيه من الإعدادات لملء مكتبتك.',
  },
  emptyList: { en: 'Nothing saved yet. Tap “My List” on any title or channel.', ar: 'لا شيء محفوظ بعد. اضغط «أضف لقائمتي» على أي عنوان أو قناة.' },
  noResults: { en: 'No results', ar: 'لا توجد نتائج' },
  channels: { en: 'Channels', ar: 'القنوات' },
  library: { en: 'In your library', ar: 'في مكتبتك' },
  fromTmdb: { en: 'More titles', ar: 'عناوين أخرى' },
  sources: { en: 'Sources', ar: 'المصادر' },
  addSource: { en: 'Add source', ar: 'إضافة مصدر' },
  language: { en: 'Interface language', ar: 'لغة الواجهة' },
  streamError: { en: 'This stream could not be played.', ar: 'تعذر تشغيل هذا البث.' },
  back: { en: 'Back', ar: 'رجوع' },
  minutes: { en: 'min', ar: 'د' },
  cat_news: { en: 'News', ar: 'أخبار' },
  cat_sports: { en: 'Sports', ar: 'رياضة' },
  cat_kids: { en: 'Kids', ar: 'أطفال' },
  cat_movies: { en: 'Movies', ar: 'أفلام' },
  cat_series: { en: 'Drama', ar: 'مسلسلات' },
  cat_religious: { en: 'Religious', ar: 'ديني' },
  cat_music: { en: 'Music', ar: 'موسيقى' },
  cat_documentary: { en: 'Documentary', ar: 'وثائقي' },
  cat_entertainment: { en: 'Entertainment', ar: 'منوعات' },
  cat_general: { en: 'General', ar: 'عام' },
} as const;

export type Key = keyof typeof dict;

interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  t: (k: Key) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    // storage unavailable
  }
  return navigator.language?.startsWith('en') ? 'en' : 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18n>(() => ({ lang, dir, setLang, t: (k) => dict[k][lang] }), [lang, dir, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}

const COUNTRY_NAMES_AR: Record<string, string> = {
  SA: 'السعودية', AE: 'الإمارات', EG: 'مصر', QA: 'قطر', KW: 'الكويت', BH: 'البحرين', OM: 'عُمان', JO: 'الأردن',
  LB: 'لبنان', SY: 'سوريا', IQ: 'العراق', PS: 'فلسطين', YE: 'اليمن', MA: 'المغرب', DZ: 'الجزائر', TN: 'تونس',
  LY: 'ليبيا', SD: 'السودان', MR: 'موريتانيا', SO: 'الصومال', DJ: 'جيبوتي', KM: 'جزر القمر', TR: 'تركيا',
  US: 'أمريكا', UK: 'بريطانيا', GB: 'بريطانيا', FR: 'فرنسا',
};

export function countryName(code: string, lang: Lang): string {
  if (lang === 'ar' && COUNTRY_NAMES_AR[code]) return COUNTRY_NAMES_AR[code];
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code === 'UK' ? 'GB' : code) ?? code;
  } catch {
    return code;
  }
}

export function formatTime(ts: number, lang: Lang) {
  return new Date(ts).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}
