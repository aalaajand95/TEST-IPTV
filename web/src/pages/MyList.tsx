import { Link } from 'react-router';
import { PosterImage } from '../components/Cards';
import { forgetFavorite } from '../components/FavoriteButton';
import { Empty, ErrorState, Loading } from '../components/States';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

export function MyList() {
  const { t } = useI18n();
  const favs = useAsync(() => api.favorites(), []);
  if (favs.loading && !favs.data) return <Loading />;
  if (favs.error) return <ErrorState error={favs.error} onRetry={favs.reload} />;
  const list = favs.data!;
  return (
    <div className="page">
      <header className="page-head"><h1>{t('myList')}</h1></header>
      {list.length === 0 ? <Empty>{t('emptyList')}</Empty> : (
        <div className="grid">
          {list.map((f) => {
            const to = f.id.startsWith('ch-') ? `/live/${f.id}` : `/title/${f.id}`;
            return (
              <div key={f.id} className="poster-card">
                <Link to={to} className="poster">
                  <PosterImage src={f.snapshot.poster} title={f.snapshot.title} />
                  {f.snapshot.kind === 'channel' && <span className="badge live">LIVE</span>}
                </Link>
                <div className="poster-meta">
                  <span className="poster-title">{f.snapshot.title}</span>
                  <button className="link small" onClick={() => api.removeFavorite(f.id).then(() => (forgetFavorite(f.id), favs.reload()))}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
