import { useSearchParams } from 'react-router';
import { ChannelTile, PosterCard } from '../components/Cards';
import { Row } from '../components/Row';
import { Empty, ErrorState, Loading } from '../components/States';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

export function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { t, lang } = useI18n();
  const res = useAsync(() => api.search(q, lang), [q, lang]);

  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const { channels, library, discover } = res.data!;
  return (
    <div className="page">
      <header className="page-head"><h1>{t('search')}: “{q}”</h1></header>
      {channels.length > 0 && (
        <Row title={t('channels')}>{channels.map((c) => <ChannelTile key={c.id} channel={c} />)}</Row>
      )}
      {library.length > 0 && (
        <section><h2>{t('library')}</h2><div className="grid">{library.map((c) => <PosterCard key={c.id} item={c} />)}</div></section>
      )}
      {discover.length > 0 && (
        <section><h2>{t('fromTmdb')}</h2><div className="grid">{discover.map((c) => <PosterCard key={c.id} item={c} />)}</div></section>
      )}
      {!channels.length && !library.length && !discover.length && <Empty>{t('noResults')}</Empty>}
    </div>
  );
}
