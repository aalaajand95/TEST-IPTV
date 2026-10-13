import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChannelLogo } from '../components/Cards';
import { FavoriteButton } from '../components/FavoriteButton';
import { Player } from '../components/Player';
import { Empty, ErrorState, Loading } from '../components/States';
import { api, type Channel } from '../lib/api';
import { countryName, formatTime, useI18n, type Key } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

export function Live() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [arabicOnly, setArabicOnly] = useState(true);
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');

  const arabic = arabicOnly ? true : undefined;
  const facets = useAsync(() => api.channelFacets(arabic), [arabic]);
  const channels = useAsync(() => api.channels({ arabic, category, country }), [arabic, category, country]);
  const current = useAsync(() => (id ? api.channel(id) : Promise.resolve(undefined)), [id]);

  const filtered = useMemo(() => {
    const list = channels.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.group?.toLowerCase().includes(needle)) : list;
  }, [channels.data, q]);

  const select = (c: Channel) => navigate(`/live/${c.id}`, { replace: !!id });

  const ch = current.data;
  const upcoming = ch?.programmes.filter((p) => p.stop > Date.now()).slice(0, 8) ?? [];

  return (
    <div className="page live">
      <aside className="live-list">
        <div className="live-filters">
          <div className="seg">
            <button className={arabicOnly ? 'on' : ''} onClick={() => setArabicOnly(true)}>{t('arabicOnly')}</button>
            <button className={!arabicOnly ? 'on' : ''} onClick={() => setArabicOnly(false)}>{t('allChannels')}</button>
          </div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
          <div className="chips">
            <button className={`chip ${!category ? 'on' : ''}`} onClick={() => setCategory('')}>{t('all')}</button>
            {facets.data?.categories.map((c) => (
              <button key={c.value} className={`chip ${category === c.value ? 'on' : ''}`} onClick={() => setCategory(c.value)}>
                {t(`cat_${c.value}` as Key)} <span className="count">{c.count}</span>
              </button>
            ))}
          </div>
          {!!facets.data?.countries.length && (
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t('allCountries')}</option>
              {facets.data.countries.map((c) => (
                <option key={c.value} value={c.value}>{countryName(c.value, lang)} ({c.count})</option>
              ))}
            </select>
          )}
        </div>
        {channels.loading && !channels.data ? <Loading /> : channels.error ? <ErrorState error={channels.error} onRetry={channels.reload} /> : (
          <ul className="channel-list">
            {filtered.map((c) => (
              <li key={c.id}>
                <button className={`channel-row ${c.id === id ? 'on' : ''}`} onClick={() => select(c)}>
                  <ChannelLogo channel={c} size={40} />
                  <span className="channel-row-body">
                    <span className="channel-name">{c.number ? <span className="muted">{c.number} · </span> : null}{c.name}</span>
                    <span className="channel-now">{c.now?.title ?? t(`cat_${c.category}` as Key)}</span>
                  </span>
                </button>
              </li>
            ))}
            {!filtered.length && <Empty>{t('noResults')}</Empty>}
          </ul>
        )}
      </aside>

      <section className="live-stage">
        {ch ? (
          <>
            <Player playId={ch.id} live poster={ch.logo} />
            <div className="live-info">
              <ChannelLogo channel={ch} size={56} />
              <div className="grow">
                <h1>{ch.name}</h1>
                <p className="muted">
                  {t(`cat_${ch.category}` as Key)}
                  {ch.country ? ` · ${countryName(ch.country, lang)}` : ''}
                  {ch.group ? ` · ${ch.group}` : ''}
                </p>
              </div>
              <FavoriteButton id={ch.id} snapshot={{ title: ch.name, poster: ch.logo, kind: 'channel' }} />
            </div>
            {upcoming.length > 0 && (
              <div className="epg">
                <h2>{t('guide')}</h2>
                <ol>
                  {upcoming.map((p) => {
                    const onAir = p.start <= Date.now();
                    return (
                      <li key={p.start} className={onAir ? 'on-air' : ''}>
                        <span className="epg-time">{formatTime(p.start, lang)}</span>
                        <span className="epg-title">{onAir && <span className="live-dot" />}{p.title}</span>
                        {p.description && <span className="epg-desc muted">{p.description}</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </>
        ) : current.loading && id ? <Loading /> : (
          <div className="live-placeholder">
            <p>{t('live')}</p>
            {filtered[0] && <Link className="btn btn-primary" to={`/live/${filtered[0].id}`}>▶ {filtered[0].name}</Link>}
          </div>
        )}
      </section>
    </div>
  );
}
