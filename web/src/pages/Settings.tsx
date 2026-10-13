import { useState, type FormEvent } from 'react';
import { ErrorState, Loading } from '../components/States';
import { api, setAdminToken, type Source } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAsync } from '../lib/useAsync';

type NewType = 'xtream' | 'm3u' | 'iptv-org';

const ARAB = 'dz bh km dj eg iq jo kw lb ly mr ma om ps qa sa so sd sy tn ae ye';

function describe(s: Source) {
  switch (s.type) {
    case 'm3u': return s.url;
    case 'xtream': return `${s.server} · ${s.username}`;
    case 'iptv-org': return [...s.languages, ...s.countries].join(', ');
    case 'demo': return 'Open test streams (Blender Foundation, Mux, Apple)';
  }
}

function AddSource({ onAdded }: { onAdded: () => void }) {
  const { lang } = useI18n();
  const L = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [type, setType] = useState<NewType>('xtream');
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = (k: string) => ({ value: form[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const split = (v?: string) => (v ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);
    const body: Record<string, unknown> = { type, name: form.name || type };
    if (type === 'xtream') Object.assign(body, { server: form.server, username: form.username, password: form.password });
    if (type === 'm3u') Object.assign(body, { url: form.url, epgUrl: form.epgUrl || undefined, userAgent: form.userAgent || undefined });
    if (type === 'iptv-org') Object.assign(body, { languages: split(form.languages), countries: split(form.countries) });
    try {
      await api.addSource(body);
      setForm({});
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={type === 'xtream' ? 'on' : ''} onClick={() => setType('xtream')}>Xtream Codes</button>
        <button type="button" className={type === 'm3u' ? 'on' : ''} onClick={() => setType('m3u')}>M3U</button>
        <button type="button" className={type === 'iptv-org' ? 'on' : ''} onClick={() => setType('iptv-org')}>{L('Free-to-air', 'قنوات مجانية')}</button>
      </div>
      <label>{L('Name', 'الاسم')}<input className="input" required {...field('name')} /></label>
      {type === 'xtream' && (
        <>
          <label>{L('Server URL', 'رابط الخادم')}<input className="input" required placeholder="http://provider.example:8080" dir="ltr" {...field('server')} /></label>
          <div className="two">
            <label>{L('Username', 'اسم المستخدم')}<input className="input" required dir="ltr" autoComplete="off" {...field('username')} /></label>
            <label>{L('Password', 'كلمة المرور')}<input className="input" required type="password" dir="ltr" autoComplete="new-password" {...field('password')} /></label>
          </div>
        </>
      )}
      {type === 'm3u' && (
        <>
          <label>{L('Playlist URL', 'رابط القائمة')}<input className="input" required type="url" dir="ltr" placeholder="https://…/playlist.m3u" {...field('url')} /></label>
          <label>{L('EPG (XMLTV) URL, optional', 'رابط دليل البرامج (اختياري)')}<input className="input" type="url" dir="ltr" {...field('epgUrl')} /></label>
          <label>{L('User-Agent, optional', 'User-Agent (اختياري)')}<input className="input" dir="ltr" {...field('userAgent')} /></label>
        </>
      )}
      {type === 'iptv-org' && (
        <>
          <p className="muted small">
            {L('Public channels indexed by iptv-org. Use ISO 639-3 language codes and ISO country codes.',
              'قنوات عامة مفهرسة من مشروع iptv-org. استخدم رموز اللغات (ISO 639-3) ورموز الدول.')}
          </p>
          <label>{L('Languages', 'اللغات')}<input className="input" dir="ltr" placeholder="ara, eng" {...field('languages')} /></label>
          <label>{L('Countries', 'الدول')}<input className="input" dir="ltr" placeholder={ARAB} {...field('countries')} /></label>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{L('Add source', 'إضافة المصدر')}</button>
    </form>
  );
}

export function Settings() {
  const { t, lang, setLang } = useI18n();
  const L = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const sources = useAsync(() => api.sources(), []);
  const config = useAsync(() => api.config(), []);
  const [token, setToken] = useState('');
  const [actionError, setActionError] = useState('');

  const act = (fn: () => Promise<unknown>) => () => {
    setActionError('');
    fn().then(sources.reload, (e: Error) => setActionError(e.message));
  };

  return (
    <div className="page settings">
      <header className="page-head"><h1>{t('settings')}</h1></header>

      <section className="card">
        <h2>{t('language')}</h2>
        <div className="seg">
          <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
        </div>
      </section>

      {config.data && (
        <section className="card">
          <h2>{L('Server', 'الخادم')}</h2>
          <ul className="kv">
            <li><span>TMDB</span><span>{config.data.tmdb ? '✓' : L('Not configured (set TMDB_API_KEY)', 'غير مفعّل (TMDB_API_KEY)')}</span></li>
            <li><span>{L('Stream proxy', 'وكيل البث')}</span><span>{config.data.streamProxy}</span></li>
          </ul>
          {config.data.adminRequired && (
            <div className="inline-form">
              <input className="input" type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} />
              <button className="btn" onClick={() => setAdminToken(token)}>{L('Save', 'حفظ')}</button>
            </div>
          )}
        </section>
      )}

      <section>
        <h2>{t('sources')}</h2>
        <p className="muted small">
          {L('Connect only playlists and providers you are licensed to use. Souq TV does not host or sell any content.',
            'أضف فقط القوائم والمزودين المرخّص لك باستخدامهم. سوق تي في لا يستضيف أو يبيع أي محتوى.')}
        </p>
        {actionError && <p className="error-text">{actionError}</p>}
        {sources.loading && !sources.data ? <Loading /> : sources.error ? <ErrorState error={sources.error} onRetry={sources.reload} /> : (
          <ul className="sources">
            {sources.data!.map((s) => (
              <li key={s.id} className="card source">
                <div className="grow">
                  <strong>{s.name}</strong> <span className="badge">{s.type}</span>
                  <p className="muted small ellipsis" dir="ltr">{describe(s)}</p>
                  {s.status && (
                    <p className="small">
                      <span className={`dot ${s.status.state}`} /> {s.status.state}
                      {s.status.state === 'ok' && ` · ${s.status.counts.channels} ${t('channels')} · ${s.status.counts.movies} ${t('movies')} · ${s.status.counts.series} ${t('series')}`}
                      {s.status.error && <span className="error-text"> · {s.status.error}</span>}
                    </p>
                  )}
                </div>
                <div className="source-actions">
                  <button className="btn btn-ghost" onClick={act(() => api.updateSource(s.id, { enabled: !s.enabled }))}>
                    {s.enabled ? L('Disable', 'تعطيل') : L('Enable', 'تفعيل')}
                  </button>
                  <button className="btn btn-ghost" onClick={act(() => api.refreshSource(s.id))}>{L('Refresh', 'تحديث')}</button>
                  <button
                    className="btn btn-ghost danger"
                    onClick={act(async () => {
                      if (confirm(L(`Remove “${s.name}”?`, `حذف «${s.name}»؟`))) await api.removeSource(s.id);
                    })}
                  >
                    {L('Remove', 'حذف')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <h2>{t('addSource')}</h2>
        <AddSource onAdded={sources.reload} />
      </section>
    </div>
  );
}
