import { useState } from 'react';
import { Link } from 'react-router';
import type { Card, Channel } from '../lib/api';
import { formatTime, useI18n } from '../lib/i18n';

/** Poster image that falls back to the title text when the image is missing or fails to load. */
export function PosterImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="poster-fallback">{title}</div>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function PosterCard({ item }: { item: Card }) {
  const { t } = useI18n();
  return (
    <Link to={`/title/${item.id}`} className="poster-card" title={item.title}>
      <div className="poster">
        <PosterImage src={item.poster} title={item.title} />
        {item.rating ? <span className="badge rating">★ {item.rating.toFixed(1)}</span> : null}
        {!item.availableId && <span className="badge muted" title={t('notAvailable')}>{t('discover')}</span>}
      </div>
      <div className="poster-meta">
        <span className="poster-title">{item.title}</span>
        {item.year ? <span className="poster-year">{item.year}</span> : null}
      </div>
    </Link>
  );
}

export function ChannelLogo({ channel, size = 48 }: { channel: Pick<Channel, 'name' | 'logo'>; size?: number }) {
  const initials = channel.name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  return (
    <div className="ch-logo" style={{ width: size, height: size }}>
      {channel.logo ? (
        <img src={channel.logo} alt="" loading="lazy" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
      ) : null}
      <span>{initials}</span>
    </div>
  );
}

export function ChannelTile({ channel }: { channel: Channel }) {
  const { lang, t } = useI18n();
  const progress = channel.now ? (Date.now() - channel.now.start) / (channel.now.stop - channel.now.start) : 0;
  return (
    <Link to={`/live/${channel.id}`} className="channel-tile">
      <ChannelLogo channel={channel} size={56} />
      <div className="channel-tile-body">
        <span className="channel-name">{channel.name}</span>
        <span className="channel-now">
          {channel.now ? `${t('nowPlaying')}: ${channel.now.title}` : t(`cat_${channel.category}`)}
        </span>
        {channel.now && (
          <>
            <div className="bar"><div style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
            <span className="channel-time">{formatTime(channel.now.start, lang)} – {formatTime(channel.now.stop, lang)}</span>
          </>
        )}
      </div>
    </Link>
  );
}
