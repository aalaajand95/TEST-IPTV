import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FavoriteButton } from '../components/FavoriteButton';
import { ErrorState, Loading } from '../components/States';
import { api, type Detail } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

function Episodes({ detail, season }: { detail: Detail; season: number }) {
  const { t, lang } = useI18n();
  const eps = useAsync(() => api.season(detail.id, season, lang), [detail.id, season, lang]);
  if (eps.loading && !eps.data) return <Loading />;
  if (eps.error) return <ErrorState error={eps.error} onRetry={eps.reload} />;
  return (
    <ol className="episodes">
      {eps.data!.map((e) => {
        const label = `${t('episode')} ${e.episode}`;
        const q = new URLSearchParams({ title: `${detail.title} · ${label}`, parent: detail.id, s: String(season), e: String(e.episode) });
        const body = (
          <>
            <div className="ep-still" style={{ backgroundImage: e.still ? `url(${e.still})` : detail.backdrop ? `url(${detail.backdrop})` : undefined }}>
              {e.available && <span className="ep-play">▶</span>}
            </div>
            <div className="ep-body">
              <span className="ep-title">{label}{e.title && e.title !== label ? ` · ${e.title}` : ''}</span>
              {e.durationSecs ? <span className="muted small">{Math.round(e.durationSecs / 60)} {t('minutes')}</span> : null}
              {e.overview && <p className="muted small clamp">{e.overview}</p>}
              {!e.available && <span className="badge muted">{t('notAvailable')}</span>}
            </div>
          </>
        );
        return (
          <li key={e.episode}>
            {e.available && e.id ? <Link className="ep" to={`/watch/${e.id}?${q}`}>{body}</Link> : <div className="ep disabled">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function Title() {
  const { id = '' } = useParams();
  const { t, lang } = useI18n();
  const detail = useAsync(() => api.title(id, lang), [id, lang]);
  const [season, setSeason] = useState<number | null>(null);
  const [trailer, setTrailer] = useState(false);
  const resume = useAsync(
    () => (detail.data?.playId ? api.progress(detail.data.playId).catch(() => undefined) : Promise.resolve(undefined)),
    [detail.data?.playId],
  );

  useEffect(() => {
    setSeason(null);
    setTrailer(false);
  }, [id]);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  const d = detail.data!;
  const currentSeason = season ?? d.seasons?.[0]?.season ?? 1;
  const watchQuery = new URLSearchParams({ title: d.title, parent: d.id });

  return (
    <div className="page title-page">
      <section className="title-hero" style={{ backgroundImage: d.backdrop ? `url(${d.backdrop})` : undefined }}>
        <div className="hero-shade" />
        <div className="title-hero-body">
          {d.poster && <img className="title-poster" src={d.poster} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <div className="title-info">
            <h1>{d.title}</h1>
            <p className="meta">
              {d.year && <span>{d.year}</span>}
              {d.rating ? <span>★ {d.rating.toFixed(1)}</span> : null}
              {d.runtime ? <span>{d.runtime} {t('minutes')}</span> : null}
              <span className="badge">{t(d.audience as Key)}</span>
              {d.genres.slice(0, 4).map((g) => <span key={g} className="muted">{g}</span>)}
            </p>
            {d.overview && <p className="overview">{d.overview}</p>}
            <div className="actions">
              {d.playId && (
                <Link className="btn btn-primary" to={`/watch/${d.playId}?${watchQuery}`}>
                  ▶ {resume.data ? t('resume') : t('play')}
                </Link>
              )}
              {d.trailerYoutubeId && <button className="btn" onClick={() => setTrailer(true)}>{t('trailer')}</button>}
              <FavoriteButton
                id={d.availableId ?? d.id}
                snapshot={{ title: d.title, poster: d.poster, backdrop: d.backdrop, kind: d.kind }}
              />
            </div>
            {!d.availableId && <p className="muted small">{t('notAvailable')}</p>}
            {d.sourceName && <p className="muted small">{t('available')} · {d.sourceName}</p>}
          </div>
        </div>
      </section>

      {trailer && d.trailerYoutubeId && (
        <div className="modal" role="dialog" onClick={() => setTrailer(false)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-close" onClick={() => setTrailer(false)} aria-label="close">✕</button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${d.trailerYoutubeId}?autoplay=1&hl=${lang}`}
              title={t('trailer')}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {d.kind === 'series' && !!d.seasons?.length && (
        <section className="seasons">
          <div className="chips">
            {d.seasons.map((s) => (
              <button key={s.season} className={`chip ${s.season === currentSeason ? 'on' : ''}`} onClick={() => setSeason(s.season)}>
                {t('season')} {s.season} <span className="count">{s.episodeCount}</span>
              </button>
            ))}
          </div>
          <Episodes detail={d} season={currentSeason} />
        </section>
      )}

      {d.cast.length > 0 && (
        <section className="cast">
          <h2>{t('cast')}</h2>
          <ul>
            {d.cast.map((c) => (
              <li key={c.name}>
                <div className="cast-photo" style={{ backgroundImage: c.photo ? `url(${c.photo})` : undefined }} />
                <span>{c.name}</span>
                {c.character && <span className="muted small">{c.character}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
