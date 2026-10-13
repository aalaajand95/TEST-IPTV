import { useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Player } from '../components/Player';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

export function Watch() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const title = params.get('title') ?? '';
  const parent = params.get('parent') ?? undefined;
  const season = Number(params.get('s')) || undefined;
  const episode = Number(params.get('e')) || undefined;

  const resume = useAsync(() => api.progress(id).then((p) => p.position).catch(() => 0), [id]);
  const parentDetail = useAsync(() => (parent ? api.title(parent, lang).catch(() => undefined) : Promise.resolve(undefined)), [parent, lang]);
  const seasonEps = useAsync(
    () => (parent && season !== undefined ? api.season(parent, season, lang).catch(() => []) : Promise.resolve([])),
    [parent, season, lang],
  );
  const next = episode ? seasonEps.data?.find((e) => e.episode > episode && e.available && e.id) : undefined;
  const nextLink = next && parent
    ? `/watch/${next.id}?${new URLSearchParams({
      title: `${parentDetail.data?.title ?? ''} · ${t('episode')} ${next.episode}`, parent, s: String(season), e: String(next.episode),
    })}`
    : undefined;

  const p = parentDetail.data;
  const onProgress = useCallback((position: number, duration: number) => {
    void api.saveProgress(id, {
      position,
      duration,
      parentId: parent,
      snapshot: {
        title: p?.title ?? title,
        poster: p?.poster,
        backdrop: p?.backdrop,
        kind: episode ? 'episode' : 'movie',
        subtitle: episode ? `${t('season')} ${season} · ${t('episode')} ${episode}` : undefined,
      },
    }).catch(() => undefined);
  }, [id, parent, p, title, episode, season, t]);

  return (
    <div className="page watch">
      <div className="watch-bar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>← {t('back')}</button>
        <h1>{title}</h1>
        {nextLink && <Link className="btn" to={nextLink}>{t('nextEpisode')} →</Link>}
      </div>
      {!resume.loading && (
        <Player
          playId={id}
          poster={p?.backdrop}
          resumeAt={resume.data && resume.data > 10 ? resume.data : undefined}
          onProgress={onProgress}
          onEnded={() => nextLink && navigate(nextLink, { replace: true })}
        />
      )}
    </div>
  );
}
