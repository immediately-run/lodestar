// Journey playback — the showcase moment (DESIGN_BRIEF §4). Full-viewport: tap
// zones on the left/right thirds (mobile), a step-dot header, a bottom-center
// caption, and prev/next controls. Fully keyboard-driven (arrows/space/Esc are
// handled in the controller). The camera easing + reduced-motion cut live in
// `flyTo`.

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';

const roundBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'flex',
  width: 44,
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
  background: 'color-mix(in oklab, var(--panel) 86%, transparent)',
  border: '1px solid var(--line)',
  borderRadius: '50%',
  color: disabled ? 'var(--ink-3)' : 'var(--ink)',
  cursor: disabled ? 'default' : 'pointer',
  backdropFilter: 'blur(10px)',
  opacity: disabled ? 0.5 : 1,
});

function Playback() {
  const wb = useWb();
  const jr = wb.state.journey;
  if (!jr) return null;
  const j = wb.state.journeys.find((x) => x.id === jr.jid);
  if (!j) return null;
  const idx = jr.idx;
  const s = j.steps[idx];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 55, pointerEvents: 'none' }}>
      <div onClick={wb.playPrev} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '33%', cursor: 'w-resize', pointerEvents: 'auto' }} />
      <div onClick={wb.playNext} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '33%', cursor: 'e-resize', pointerEvents: 'auto' }} />

      <div
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 14px',
          background: 'color-mix(in oklab, var(--panel) 80%, transparent)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-pill)',
          pointerEvents: 'auto',
          backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ font: 'var(--mono-xs)', color: 'var(--ink-2)' }}>{j.title}</span>
        <span style={{ display: 'flex', gap: 5 }}>
          {j.steps.map((_, i) => (
            <span
              key={i}
              onClick={() => wb.playSeek(i)}
              style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 4, background: i === idx ? 'var(--accent)' : 'var(--line-2)', cursor: 'pointer', transition: 'width .2s' }}
            />
          ))}
        </span>
        <button onClick={wb.playExit} style={{ display: 'flex', padding: 4, marginLeft: 4, background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {s.caption ? (
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'min(720px, 88vw)',
            padding: '20px 34px',
            background: 'color-mix(in oklab, var(--panel) 78%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            backdropFilter: 'blur(14px)',
            boxShadow: 'var(--shadow-pop)',
            textAlign: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ font: '600 clamp(18px, 2.4vw, 26px)/1.3 var(--disp)', letterSpacing: '-.02em', color: 'var(--ink)', textWrap: 'balance' }}>{s.caption}</div>
        </div>
      ) : null}

      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14, pointerEvents: 'auto' }}>
        <button onClick={wb.playPrev} disabled={idx === 0} style={roundBtn(idx === 0)}>
          <Icon name="chevLeft" size={20} strokeWidth={2} />
        </button>
        <span style={{ font: 'var(--mono-sm)', color: 'var(--ink-2)', minWidth: 48, textAlign: 'center' }}>{`${idx + 1} / ${j.steps.length}`}</span>
        <button onClick={wb.playNext} style={roundBtn(false)}>
          <Icon name="chevRight" size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default Playback;
