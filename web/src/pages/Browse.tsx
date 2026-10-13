import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PosterCard } from '../components/Cards';
import { Empty, ErrorState, Loading } from '../components/States';
import { api, type Card, type Kind } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

const AUDIENCES: ['all' | 'arabic' | 'english' | 'turkish' | 'anime' | 'other', Key][] = [
  ['all', 'all'], ['arabic', 'arabic'], ['english', 'english'], ['turkish', 'turkish'], ['anime', 'anime'], ['other', 'other'],
];
const SORTS: [string, Key][] = [['added', 'sortAdded'], ['year', 'sortYear'], ['rating', 'sortRating'], ['title', 'sortTitle']];

export function Browse() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as Kind | null) ?? undefined;
  const audience = params.get('audience') ?? 'all';
  const genre = params.get('genre') ?? '';
  const sort = params.get('sort') ?? 'added';

  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    if (k !== 'genre') next.delete('genre');
    setParams(next, { replace: true });
  };

  const query = { kind, audience, genre: genre || undefined, sort };
  const key = JSON.stringify(query);
  // Page is tied to the filter key so changing a filter can never request page N of the new query.
  const [paging, setPaging] = useState({ key, page: 1 });
  const page = paging.key === key ? paging.page : 1;
  const setPage = (fn: (p: number) => number) => setPaging({ key, page: fn(page) });
  const [items, setItems] = useState<Card[]>([]);

  const res = useAsync(() => api.library({ ...query, page, pageSize: 60 }), [key, page]);
  useEffect(() => {
    if (res.data) setItems((prev) => (res.data!.page === 1 ? res.data!.items : [...prev, ...res.data!.items]));
  }, [res.data]);

  const facets = useAsync(() => api.libraryFacets({ kind, audience }), [kind, audience]);
  const discover = useAsync(() => api.discoverRows(lang), [lang]);
  const discoverRows = discover.data?.enabled
    ? discover.data.rows.filter((r) => (!kind || r.kind === kind) && (audience === 'all' || r.audience === audience))
    : [];

  const heading = kind ? t(kind === 'movie' ? 'movies' : 'series') : audience !== 'all' ? t(audience as Key) : t('all');

  return (
    <div className="page browse">
      <header className="page-head">
        <h1>{heading}{kind && audience !== 'all' ? ` · ${t(audience as Key)}` : ''}</h1>
        <div className="seg">
          <button className={!kind ? 'on' : ''} onClick={() => set('kind')}>{t('all')}</button>
          <button className={kind === 'movie' ? 'on' : ''} onClick={() => set('kind', 'movie')}>{t('movies')}</button>
          <button className={kind === 'series' ? 'on' : ''} onClick={() => set('kind', 'series')}>{t('series')}</button>
        </div>
      </header>

      <div className="filters">
        <div className="chips">
          {AUDIENCES.map(([a, label]) => (
            <button key={a} className={`chip ${audience === a ? 'on' : ''}`} onClick={() => set('audience', a)}>{t(label)}</button>
          ))}
        </div>
        <div className="filter-selects">
          {!!facets.data?.genres.length && (
            <select className="input" value={genre} onChange={(e) => set('genre', e.target.value)}>
              <option value="">{t('allGenres')}</option>
              {facets.data.genres.map((g) => <option key={g.value} value={g.value}>{g.value} ({g.count})</option>)}
            </select>
          )}
          <select className="input" value={sort} onChange={(e) => set('sort', e.target.value)}>
            {SORTS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
          </select>
        </div>
      </div>

      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : (
        <>
          {res.data && <p className="muted small">{res.data.total.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en')} · {t('library')}</p>}
          <div className="grid">
            {items.map((c) => <PosterCard key={c.id} item={c} />)}
          </div>
          {res.loading && <Loading />}
          {!res.loading && res.data && items.length < res.data.total && (
            <div className="center"><button className="btn" onClick={() => setPage((p) => p + 1)}>{t('loadMore')}</button></div>
          )}
          {!res.loading && res.data?.total === 0 && (
            <Empty>
              <p>{t('emptyLibrary')}</p>
              <Link className="btn" to="/settings">{t('addSource')}</Link>
            </Empty>
          )}
        </>
      )}

      {discoverRows.length > 0 && (
        <section className="discover-links">
          <h2>{t('discover')}</h2>
          <div className="chips">
            {discoverRows.map((r) => <Link key={r.key} className="chip" to={`/discover/${r.key}`}>{r.title}</Link>)}
          </div>
        </section>
      )}
    </div>
  );
}
