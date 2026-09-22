// Double-click-empty-canvas quick create (spec §4.2). Drops the new object at
// the clicked world point. "Image…" routes through the pick-file task
// (`wb.insertImage` → the platform file dialog + asset copy-in); the rest create
// their object directly. The Image control names its wait while the pick is
// out (R3-607 / R-IX-2) and the menu carries the dialog contract.

import { useWb } from '../hooks/useLodestarCtx';
import { useOverlayDialog } from '../hooks/useOverlayDialog';
import { BUSY_LABELS } from '../hooks/useLodestar';
import Icon from './Icon';
import type { ObjectKind } from '../lib/types';

const ITEMS: { label: string; icon: string; kind: ObjectKind }[] = [
  { label: 'Sticky note', icon: 'sticky', kind: 'note' },
  { label: 'Prose', icon: 'type', kind: 'prose' },
  { label: 'Image…', icon: 'image', kind: 'img' },
  { label: 'Shape', icon: 'square', kind: 'shape' },
  { label: 'Component stub', icon: 'comp', kind: 'component' },
];

function QuickCreateMenu() {
  const wb = useWb();
  const qm = wb.state.quickMenu;
  const close = () => wb.closeQuickMenu();
  // The dialog contract (R3-607): focus in, Tab trapped, Escape, focus return.
  const dialogRef = useOverlayDialog(!!qm, close);
  if (!qm) return null;
  const mobile = wb.isMobile();
  const { vw, vh } = wb.state.vp;
  const pickingImage = wb.state.busy === 'insert-image';

  const wrapStyle: React.CSSProperties = mobile
    ? { position: 'absolute', left: 12, right: 12, bottom: 12, padding: 8, background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 16, boxShadow: 'var(--shadow-modal)', zIndex: 50 }
    : {
        position: 'absolute',
        left: Math.min(qm.lx, vw - 220),
        top: Math.min(qm.ly, vh - 260),
        width: 200,
        padding: 6,
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-pop)',
        zIndex: 50,
      };

  return (
    <div ref={dialogRef} tabIndex={-1} style={wrapStyle}>
      <div style={{ font: 'var(--mono-xs)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '4px 10px 6px' }}>Create</div>
      {ITEMS.map((it) => {
        const busy = it.kind === 'img' && pickingImage;
        return (
          <button
            key={it.kind}
            aria-busy={busy || undefined}
            disabled={busy}
            onClick={() => (it.kind === 'img' ? wb.insertImage(qm.wx, qm.wy) : wb.createObject(it.kind, qm.wx, qm.wy))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 8, color: 'var(--ink)', font: 'var(--body-sm)', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ display: 'inline-flex', color: 'var(--ink-2)' }}>
              <Icon name={it.icon} size={16} />
            </span>
            {busy ? BUSY_LABELS['insert-image'] : it.label}
          </button>
        );
      })}
    </div>
  );
}

export default QuickCreateMenu;
