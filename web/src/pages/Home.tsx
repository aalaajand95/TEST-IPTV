import { Link } from 'react-router';
import { ChannelTile, PosterCard } from '../components/Cards';
import { Row } from '../components/Row';
import { ErrorState, Loading } from '../components/States';
import { api, type Card, type Channel, type Progress } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

function watchLink(p: Progress) {
  const q = new URLSearchParams({ title: p.snapshot.title });
  if (p.parentId) q.set('parent', p.parentId);
  return `/watch/${p.id}?${q}`;
}

export function Home() {
  const { lang, t } = useI18n();
  const home = useAsync(() => api.home(lang), [lang]);
  const progress = useAsync(() => api.progressList(), []);

  if (home.loading && !home.data) return <Loading />;
  if (home.error) return <ErrorState error={home.error} onRetry={home.reload} />;
  const { hero, rows } = home.data!;

  return (
    <div className="page home">
      {hero && (
        <section className="hero" style={{ backgroundImage: hero.backdrop ? `url(${hero.backdrop})` : undefined }}>
          <div className="hero-shade" />
          <div className="hero-body">
            <h1>{hero.title}</h1>
            {hero.year && <p className="muted">{hero.year}</p>}
            <div className="actions">
              <Link className="btn btn-primary" to={`/title/${hero.id}`}>▶ {t('play')}</Link>
            </div>
          </div>
        </section>
      )}

      {!!progress.data?.length && (
        <Row title={t('continueWatching')}>
          {progress.data.map((p) => (
            <Link key={p.id} to={watchLink(p)} className="continue-card">
              <div className="continue-art" style={{ backgroundImage: `url(${p.snapshot.backdrop ?? p.snapshot.poster ?? ''})` }}>
                <div className="bar"><div style={{ width: `${(p.position / p.duration) * 100}%` }} /></div>
              </div>
              <span className="poster-title">{p.snapshot.title}</span>
              {p.snapshot.subtitle && <span className="muted small">{p.snapshot.subtitle}</span>}
            </Link>
          ))}
        </Row>
      )}

      {rows.map((row) => (
        <Row key={row.key} title={row.title} link={row.link}>
          {row.type === 'channels'
            ? (row.items as Channel[]).map((c) => <ChannelTile key={c.id} channel={c} />)
            : (row.items as Card[]).map((c) => <PosterCard key={c.id} item={c} />)}
        </Row>
      ))}
    </div>
  );
}
