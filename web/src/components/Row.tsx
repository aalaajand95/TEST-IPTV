import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../lib/i18n';

export function Row({ title, link, children }: { title: string; link?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, dir } = useI18n();
  const scroll = (sign: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // scrollLeft runs negative in RTL, so flip the direction there.
    el.scrollBy({ left: sign * (dir === 'rtl' ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  return (
    <section className="row">
      <header className="row-head">
        <h2>{title}</h2>
        <div className="row-actions">
          {link && <Link to={link} className="link">{t('seeAll')}</Link>}
          <button className="icon-btn" aria-label="previous" onClick={() => scroll(-1)}>‹</button>
          <button className="icon-btn" aria-label="next" onClick={() => scroll(1)}>›</button>
        </div>
      </header>
      <div className="row-track" ref={ref}>{children}</div>
    </section>
  );
}
