import { useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useI18n, type Key } from './lib/i18n';
import { Browse } from './pages/Browse';
import { Discover } from './pages/Discover';
import { Home } from './pages/Home';
import { Live } from './pages/Live';
import { MyList } from './pages/MyList';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Title } from './pages/Title';
import { Watch } from './pages/Watch';

const NAV: [string, Key][] = [
  ['/', 'home'],
  ['/live', 'live'],
  ['/browse?audience=arabic', 'arabic'],
  ['/browse?kind=movie', 'movies'],
  ['/browse?kind=series', 'series'],
  ['/browse?audience=anime', 'anime'],
  ['/my-list', 'myList'],
];

function NavBar() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const isActive = (to: string) => {
    const [path, query] = to.split('?');
    if (query) return loc.pathname === path && loc.search === `?${query}`;
    return path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(path);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <header className="nav">
      <NavLink to="/" className="brand" aria-label={t('appName')}>
        <span className="brand-mark">▶</span>
        <span>{t('appName')}</span>
      </NavLink>
      <button className="icon-btn nav-toggle" aria-label="menu" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
      <nav className={`nav-links ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        {NAV.map(([to, key]) => (
          <Link key={to} to={to} className={isActive(to) ? 'active' : ''} aria-current={isActive(to) ? 'page' : undefined}>
            {t(key)}
          </Link>
        ))}
      </nav>
      <form className="nav-search" onSubmit={submit} role="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} />
      </form>
      <button className="icon-btn lang-btn" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={t('language')}>
        {lang === 'ar' ? 'EN' : 'ع'}
      </button>
      <NavLink to="/settings" className="icon-btn" aria-label={t('settings')}>⚙</NavLink>
    </header>
  );
}

export function App() {
  return (
    <>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<Live />} />
          <Route path="/live/:id" element={<Live />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/discover/:key" element={<Discover />} />
          <Route path="/title/:id" element={<Title />} />
          <Route path="/watch/:id" element={<Watch />} />
          <Route path="/search" element={<Search />} />
          <Route path="/my-list" element={<MyList />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </>
  );
}
