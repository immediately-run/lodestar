// Bottom-center toast stack: save confirmations, the delete + 10s undo, the
// LWW/merge notice, and the role-downgrade notice (copy in the controller's demo
// scenarios). Non-blocking; an optional action button (e.g. Undo, Keep mine).

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';

function Toasts() {
  const wb = useWb();
  const { toasts } = wb.state;
  return (
    <div role="status" aria-live="polite" style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', zIndex: 60, pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const iconColor = t.iconColor || 'var(--accent-pink)';
        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '11px 15px',
              background: 'color-mix(in oklab, var(--panel) 94%, transparent)',
              border: '1px solid var(--line-2)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-pop)',
              backdropFilter: 'blur(12px)',
              font: 'var(--body-sm)',
              color: 'var(--ink)',
              pointerEvents: 'auto',
              maxWidth: 'min(440px, 92vw)',
            }}
          >
            <span style={{ display: 'inline-flex', color: iconColor, flex: 'none' }}>
              <Icon name={t.icon} size={15} color={iconColor} strokeWidth={1.75} />
            </span>
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.actionLabel ? (
              <button
                onClick={() => {
                  t.onAction?.();
                  wb.dismissToast(t.id);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--accent-pink)', font: 'var(--label)', cursor: 'pointer', padding: '2px 4px', minHeight: 24, whiteSpace: 'nowrap' }}
              >
                {t.actionLabel}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default Toasts;
