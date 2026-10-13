import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { PosterCard } from '../components/Cards';
import { ErrorState, Loading } from '../components/States';
import { api, type Card } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

export function Discover() {
  const { key = '' } = useParams();
  const { t, lang } = useI18n();
  const pagingKey = `${key}:${lang}`;
  const [paging, setPaging] = useState({ key: pagingKey, page: 1 });
  const page = paging.key === pagingKey ? paging.page : 1;
  const [items, setItems] = useState<Card[]>([]);
  const rows = useAsync(() => api.discoverRows(lang), [lang]);
  const res = useAsync(() => api.discover(key, lang, page), [key, lang, page]);
  useEffect(() => {
    if (res.data) setItems((prev) => (res.data!.page === 1 ? res.data!.items : [...prev, ...res.data!.items]));
  }, [res.data]);

  const title = rows.data?.rows.find((r) => r.key === key)?.title ?? t('discover');
  return (
    <div className="page">
      <header className="page-head"><h1>{title}</h1></header>
      <p className="muted small">{t('discoverHint')}</p>
      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : (
        <>
          <div className="grid">{items.map((c) => <PosterCard key={c.id} item={c} />)}</div>
          {res.loading && <Loading />}
          {!res.loading && res.data && page < res.data.totalPages && (
            <div className="center"><button className="btn" onClick={() => setPaging({ key: pagingKey, page: page + 1 })}>{t('loadMore')}</button></div>
          )}
        </>
      )}
    </div>
  );
}
