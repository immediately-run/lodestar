// Run-first top chrome (DESIGN_BRIEF §1): a board switcher top-left and, on
// desktop, the minimal control cluster top-right — zoom, journeys, theme, the
// run/edit posture toggle (edit only offered when the mount is writable), and
// Share. The edit toggle and Share invoke host-mediated tasks; until those tasks
// exist they surface as toasts (Lodestar holds no sharing authority — §6.3).

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';

function TopBar() {
  const wb = useWb();
  const { mode, light, panelOpen, cam, views, title } = wb.state;
  const mobile = wb.isMobile();
  const z = cam.zoom;

  const ctrlBtn = (on: boolean): React.CSSProperties => ({
    display: 'flex',
    padding: 9,
    background: on ? 'color-mix(in oklab, var(--accent-2) 24%, var(--panel))' : 'color-mix(in oklab, var(--panel) 86%, transparent)',
    border: `1px solid ${on ? 'color-mix(in oklab, var(--accent-2) 50%, var(--line-2))' : 'var(--line)'}`,
    borderRadius: 'var(--r-pill)',
    color: 'var(--ink)',
    cursor: 'pointer',
    backdropFilter: 'blur(10px)',
  });
  const modeTab = (on: boolean): React.CSSProperties => ({
    padding: '7px 15px',
    background: on ? 'var(--ink)' : 'transparent',
    border: 'none',
    borderRadius: 'var(--r-pill)',
    color: on ? 'var(--bg)' : 'var(--ink-2)',
    font: 'var(--label)',
    cursor: 'pointer',
  });

  return (
    <>
      {/* top-left: board switcher */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 10, zIndex: 40 }}>
        <button
          onClick={() => wb.setScreen('chooser')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '8px 13px',
            background: 'color-mix(in oklab, var(--panel) 86%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-pill)',
            color: 'var(--ink)',
            font: 'var(--label)',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--grad)', display: 'inline-block', transform: 'rotate(12deg)', flex: 'none' }} />
          <span>{title}</span>
          <span style={{ opacity: 0.55, display: 'inline-flex' }}>
            <Icon name="chevDown" size={15} strokeWidth={2} />
          </span>
        </button>
        {mode === 'edit' && !mobile ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 11px',
              background: 'color-mix(in oklab, var(--accent-2) 22%, var(--panel))',
              border: '1px solid color-mix(in oklab, var(--accent-2) 50%, var(--line-2))',
              borderRadius: 'var(--r-pill)',
              font: 'var(--mono-xs)',
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
            }}
          >
            Edit mode
          </span>
        ) : null}
      </div>

      {/* top-right: controls (desktop) */}
      {!mobile ? (
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'color-mix(in oklab, var(--panel) 86%, transparent)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-pill)',
              backdropFilter: 'blur(10px)',
              overflow: 'hidden',
            }}
          >
            <button title="Zoom out" aria-label="Zoom out" onClick={() => wb.setZoom(z / 1.25)} style={{ display: 'flex', padding: '8px 10px', background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer' }}>
              <Icon name="minus" size={16} strokeWidth={2} />
            </button>
            <button title="Reset zoom" aria-label="Reset zoom" onClick={() => wb.flyTo(views[0], 600)} style={{ padding: '8px 4px', minWidth: 52, background: 'none', border: 'none', color: 'var(--ink)', font: 'var(--mono-sm)', cursor: 'pointer' }}>
              {`${Math.round(z * 100)}%`}
            </button>
            <button title="Zoom in" aria-label="Zoom in" onClick={() => wb.setZoom(z * 1.25)} style={{ display: 'flex', padding: '8px 10px', background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer' }}>
              <Icon name="plus" size={16} strokeWidth={2} />
            </button>
          </div>
          <button title="Journeys & views" aria-label="Journeys & views" onClick={wb.togglePanel} style={ctrlBtn(panelOpen)}>
            <Icon name="route" size={18} />
          </button>
          <button
            title="Toggle theme"
            aria-label="Toggle theme"
            onClick={wb.toggleTheme}
            style={{ display: 'flex', padding: 9, background: 'color-mix(in oklab, var(--panel) 86%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', color: 'var(--ink-2)', cursor: 'pointer', backdropFilter: 'blur(10px)' }}
          >
            <Icon name={light ? 'moon' : 'sun'} size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', background: 'color-mix(in oklab, var(--panel) 86%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', backdropFilter: 'blur(10px)', padding: 3, gap: 2 }}>
            <button onClick={wb.setRun} style={modeTab(mode === 'run')}>
              Run
            </button>
            <button onClick={wb.setEdit} style={modeTab(mode === 'edit')}>
              Edit
            </button>
          </div>
          <button
            onClick={() => wb.toast('Opening share dialog (share-space task)…', 'share')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', background: 'var(--grad)', border: 'none', borderRadius: 'var(--r-pill)', color: '#1a1020', font: 'var(--label)', cursor: 'pointer', boxShadow: 'var(--glow)' }}
          >
            <Icon name="share" size={16} color="#1a1020" />
            <span>Share</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

export default TopBar;
