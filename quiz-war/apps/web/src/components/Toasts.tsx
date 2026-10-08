import { useToasts } from '../lib/toast';

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.icon && <span className="t-icon" aria-hidden>{t.icon}</span>}
          <div className="grow">
            <strong>{t.title}</strong>
            {t.body && <span className="muted">{t.body}</span>}
            {t.actions && (
              <div className="t-actions">
                {t.actions.map((a) => (
                  <button key={a.label} className={`btn sm ${a.primary ? 'primary' : 'outline'}`} onClick={a.onClick}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!t.actions && (
            <button className="btn icon sm ghost" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
