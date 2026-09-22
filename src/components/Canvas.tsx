// The full-bleed canvas: a token-driven grid/dots background whose pattern
// tracks the camera, one transformed world layer carrying every object, and the
// connection + selection overlays. Only objects intersecting the viewport (plus
// a one-viewport margin) are mounted — the store holds all geometry in memory,
// only the DOM is virtualized (spec §3.1).

import { useWb } from '../hooks/useLodestarCtx';
import Connections from './Connections';
import ObjectFrame from './ObjectFrame';
import SelectionOverlay from './SelectionOverlay';

function Canvas() {
  const wb = useWb();
  const { cam, vp, bg, mode, panning, journey, objects, selection, hover } = wb.state;
  const z = cam.zoom;
  const tx = wb.originX(vp.vw);
  const ty = wb.originY(vp.vh);

  // Background pattern: a minor grid that subdivides into a major grid every 5
  // cells, stepping cell size up by 4× whenever it would fall under 16px so it
  // never moirés at the zoom extremes.
  let bgImage = 'none';
  let bgSize = 'auto';
  let bgPos = '0 0';
  if (bg !== 'plain') {
    let s = 24;
    let sp = s * z;
    while (sp < 16) {
      s *= 4;
      sp = s * z;
    }
    const maj = sp * 5;
    if (bg === 'grid') {
      bgImage =
        'linear-gradient(var(--grid-major) 1px, transparent 1px), linear-gradient(90deg, var(--grid-major) 1px, transparent 1px), linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)';
      bgSize = `${maj}px ${maj}px, ${maj}px ${maj}px, ${sp}px ${sp}px, ${sp}px ${sp}px`;
      bgPos = `${tx}px ${ty}px, ${tx}px ${ty}px, ${tx}px ${ty}px, ${tx}px ${ty}px`;
    } else {
      bgImage = 'radial-gradient(circle, var(--grid-major) 1.3px, transparent 1.4px)';
      bgSize = `${sp}px ${sp}px`;
      bgPos = `${tx}px ${ty}px`;
    }
  }

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'var(--bg)',
    backgroundImage: bgImage,
    backgroundSize: bgSize,
    backgroundPosition: bgPos,
    touchAction: 'none',
    cursor: journey ? 'default' : panning ? 'grabbing' : mode === 'edit' ? 'default' : 'grab',
  };

  const worldStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    transform: `translate(${tx}px, ${ty}px) scale(${z})`,
    transformOrigin: '0 0',
    willChange: 'transform',
  };

  const mx = vp.vw;
  const my = vp.vh;
  const visible = objects
    .filter((o) => {
      if (selection.includes(o.id) || o.id === hover) return true;
      const [sx, sy] = wb.project(o.x, o.y);
      const sw = o.w * z;
      const sh = o.h * z;
      return sx < vp.vw + mx && sx + sw > -mx && sy < vp.vh + my && sy + sh > -my;
    })
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  // The roving tab stop (R3-607): the selected object, else the first visible
  // one — exactly one object on the canvas is ever tabbable.
  const tabStopId = mode === 'edit' ? (selection[0] ?? visible.find((o) => !o.hidden)?.id ?? null) : null;

  // The surface funnels Tab INTO the roving stop (R3-607) — a funnel, never a
  // trap (WCAG 2.1.2): once focus is ON the stop, Tab is released to leave the
  // canvas naturally, and Shift+Tab is never intercepted at all.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || e.shiftKey || mode !== 'edit' || !tabStopId) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (t && t.getAttribute?.('data-obj-id') === tabStopId) return; // already on the stop — let Tab out
    const stop = e.currentTarget.querySelector(`[data-obj-id="${tabStopId}"][tabindex="0"]`) as HTMLElement | null;
    if (stop) {
      e.preventDefault();
      stop.focus();
    }
  };

  return (
    <div
      ref={wb.registerCanvas}
      style={canvasStyle}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => wb.onCanvasDown(e)}
      onDoubleClick={(e) => wb.onCanvasDblClick(e)}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--page-wash)', pointerEvents: 'none' }} />
      <Connections />
      <div style={worldStyle}>
        {visible.map((o) => (
          // Stable useCallbacks → the memoized ObjectFrame skips re-render on pan.
          <ObjectFrame
            key={o.id}
            o={o}
            mode={mode}
            boardRoot={wb.boardRoot}
            objects={objects}
            tabStop={o.id === tabStopId}
            selected={selection.includes(o.id)}
            onFocusObject={wb.select}
            onPointerDown={wb.objPointerDown}
            onHover={wb.setHover}
          />
        ))}
      </div>
      <SelectionOverlay />
    </div>
  );
}

export default Canvas;
