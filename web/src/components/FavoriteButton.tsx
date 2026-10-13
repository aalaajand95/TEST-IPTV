import { useEffect, useState } from 'react';
import { api, type Snapshot } from '../lib/api';
import { useI18n } from '../lib/i18n';

let cache: Promise<Set<string>> | null = null;
const favIds = () => (cache ??= api.favorites().then((f) => new Set(f.map((x) => x.id))).catch(() => new Set<string>()));

/** Keep the cached set in sync when a favourite is removed elsewhere (e.g. My List). */
export function forgetFavorite(id: string) {
  void cache?.then((s) => s.delete(id));
}

export function FavoriteButton({ id, snapshot, compact }: { id: string; snapshot: Snapshot; compact?: boolean }) {
  const { t } = useI18n();
  const [on, setOn] = useState(false);
  useEffect(() => {
    void favIds().then((s) => setOn(s.has(id)));
  }, [id]);

  const toggle = async () => {
    const set = await favIds();
    if (on) {
      await api.removeFavorite(id);
      set.delete(id);
    } else {
      await api.addFavorite(id, snapshot);
      set.add(id);
    }
    setOn(!on);
  };

  return (
    <button className={`btn ${on ? 'btn-on' : 'btn-ghost'}`} onClick={toggle} aria-pressed={on}>
      {on ? '✓' : '+'} {!compact && (on ? t('inList') : t('addToList'))}
    </button>
  );
}
