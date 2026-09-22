// Phone chrome (spec §4.4, DESIGN_BRIEF §5). Run mode + journey playback are
// first-class; edit is select/move/inspector only. A round top-right cluster
// (edit toggle, journeys, theme, share) and a horizontally-scrolling create bar
// shown only while editing with the inspector closed.

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';
import type { ObjectKind } from '../lib/types';

const CREATE: { icon: string; label: string; kind: ObjectKind }[] = [
  { icon: 'sticky', label: 'Note', kind: 'note' },
  { icon: 'type', label: 'Prose', kind: 'prose' },
  { icon: 'square', label: 'Shape', kind: 'shape' },
  { icon: 'image', label: 'Image', kind: 'img' },
  { icon: 'type', label: 'Label', kind: 'label' },
  { icon: 'frame', label: 'Frame', kind: 'frame' },
  { icon: 'comp', label: 'Comp', kind: 'component' },
];

function MobileChrome() {
  const wb = useWb();
  const { mode, light, panelOpen, inspectorOpen, cam } = wb.state;
  if (!wb.isMobile()) return null;

  const pill = (on: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    background: on ? 'color-mix(in oklab, var(--accent-2) 26%, var(--panel))' : 'color-mix(in oklab, var(--panel) 88%, transparent)',
    border: `1px solid ${on ? 'color-mix(in oklab, var(--accent-2) 50%, var(--line-2))' : 'var(--line)'}`,
    borderRadius: '50%',
    color: on ? 'var(--ink)' : 'var(--ink-2)',
    cursor: 'pointer',
    backdropFilter: 'blur(10px)',
    flex: 'none',
  });

  const showBar = mode === 'edit' && !inspectorOpen;

  return (
    <>
      <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 8, zIndex: 41 }}>
        <button title={mode === 'edit' ? 'Done' : 'Edit'} aria-label={mode === 'edit' ? 'Done' : 'Edit'} onClick={() => (mode === 'edit' ? wb.setRun() : wb.setEdit())} style={pill(mode === 'edit')}>
          <Icon name={mode === 'edit' ? 'check' : 'pencil'} size={18} strokeWidth={1.75} />
        </button>
        <button
          title="Journeys"
          aria-label="Journeys"
          onClick={() => {
            wb.togglePanel();
            wb.closeInspector();
          }}
          style={pill(panelOpen)}
        >
          <Icon name="route" size={18} strokeWidth={1.75} />
        </button>
        <button title="Theme" aria-label="Theme" onClick={() => wb.setLight(!light)} style={pill(false)}>
          <Icon name={light ? 'moon' : 'sun'} size={18} strokeWidth={1.75} />
        </button>
        <button
          title="Share"
          aria-label="Share"
          onClick={() => wb.toast('Opening share dialog (share-space task)…', 'share')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, background: 'var(--grad)', border: 'none', borderRadius: '50%', color: '#1a1020', cursor: 'pointer', boxShadow: 'var(--glow)', flex: 'none' }}
        >
          <Icon name="share" size={17} color="#1a1020" strokeWidth={1.75} />
        </button>
      </div>

      {showBar ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 16,
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 2,
            maxWidth: '94vw',
            overflowX: 'auto',
            padding: 6,
            background: 'color-mix(in oklab, var(--panel) 93%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            zIndex: 44,
            backdropFilter: 'blur(10px)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          {CREATE.map((t) => (
            <button
              key={t.label}
              title={t.label}
              onClick={() => wb.createObject(t.kind, cam.cx, cam.cy)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 11px', background: 'none', border: 'none', borderRadius: 10, color: 'var(--ink-2)', cursor: 'pointer', flex: 'none' }}
            >
              <Icon name={t.icon} size={21} strokeWidth={1.7} />
              <span style={{ font: 'var(--mono-xs)' }}>{t.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default MobileChrome;
