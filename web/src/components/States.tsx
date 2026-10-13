import { useI18n } from '../lib/i18n';

export function Loading() {
  const { t } = useI18n();
  return <div className="state"><div className="spinner" aria-hidden />{t('loading')}</div>;
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="state error">
      <p>{error.message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>{t('retry')}</button>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="state empty">{children}</div>;
}
