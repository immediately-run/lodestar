// Edit-mode affordances drawn above the objects (screen space): the selection
// box(es), resize/rotate handles, hover anchor dots for drawing connections, and
// the drag-rectangle marquee. Resize/rotate handles and anchors are desktop-only
// — mobile edit is select/move/inspector (spec §4.4).

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';
import type { WObject } from '../lib/types';

const RESIZE_PTS: [string, string, number, number][] = [
  ['nw', 'nwse', 0, 0],
  ['n', 'ns', 0.5, 0],
  ['ne', 'nesw', 1, 0],
  ['e', 'ew', 1, 0.5],
  ['se', 'nwse', 1, 1],
  ['s', 'ns', 0.5, 1],
  ['sw', 'nesw', 0, 1],
  ['w', 'ew', 0, 0.5],
];

const ANCHOR_PTS: [string, number, number][] = [
  ['n', 0.5, 0],
  ['e', 1, 0.5],
  ['s', 0.5, 1],
  ['w', 0, 0.5],
];

function SelectionOverlay() {
  const wb = useWb();
  const { objects, selection, marquee, hover, mode, panning, connectPreview, connectFrom, connectCursor } = wb.state;
  const mobile = wb.isMobile();
  if (mode !== 'edit') return null;

  const byId: Record<string, WObject> = {};
  objects.forEach((o) => (byId[o.id] = o));

  const resizeHandles = () =>
    RESIZE_PTS.map(([k, cur, fx, fy]) => (
      <div
        key={k}
        onPointerDown={(e) => wb.startHandle('resize', k, e)}
        style={{
          position: 'absolute',
          left: `calc(${fx * 100}% - 5px)`,
          top: `calc(${fy * 100}% - 5px)`,
          width: 10,
          height: 10,
          background: 'var(--bg)',
          border: '1.5px solid var(--accent)',
          borderRadius: 2,
          cursor: `${cur}-resize`,
          pointerEvents: 'auto',
        }}
      />
    ));

  const overlays: React.ReactNode[] = [];

  selection.forEach((id) => {
    const o = byId[id];
    if (!o) return;
    const [sx, sy] = wb.project(o.x, o.y);
    const sw = o.w * wb.state.cam.zoom;
    const sh = o.h * wb.state.cam.zoom;
    const single = selection.length === 1;
    const showHandles = single && !o.locked && !mobile;
    overlays.push(
      <div
        key={`sel${id}`}
        style={{ position: 'absolute', left: sx, top: sy, width: sw, height: sh, transform: `rotate(${o.rot}deg)`, transformOrigin: 'center', pointerEvents: 'none' }}
      >
        <div style={{ position: 'absolute', inset: -2, border: '1.5px solid var(--accent)', borderRadius: 6, boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent) 30%, transparent)' }} />
        {showHandles ? resizeHandles() : null}
      </div>,
    );
    if (showHandles) {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const dist = sh / 2 + 26;
      const rad = ((o.rot - 90) * Math.PI) / 180;
      const hx = cx + Math.cos(rad) * dist;
      const hy = cy + Math.sin(rad) * dist;
      overlays.push(
        <div
          key={`rot${id}`}
          title="Rotate"
          onPointerDown={(e) => wb.startHandle('rotate', '', e)}
          style={{
            position: 'absolute',
            left: hx - 7,
            top: hy - 7,
            width: 14,
            height: 14,
            background: 'var(--bg)',
            border: '1.5px solid var(--accent)',
            borderRadius: '50%',
            cursor: 'grab',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="refresh" size={9} color="var(--accent)" strokeWidth={2} />
        </div>,
      );
    }
  });

  if (hover && !selection.includes(hover) && !panning && !connectPreview && !mobile) {
    const o = byId[hover];
    if (o) {
      const [sx, sy] = wb.project(o.x, o.y);
      const sw = o.w * wb.state.cam.zoom;
      const sh = o.h * wb.state.cam.zoom;
      overlays.push(
        <div key={`anc${o.id}`} style={{ position: 'absolute', left: sx, top: sy, width: sw, height: sh, transform: `rotate(${o.rot}deg)`, transformOrigin: 'center', pointerEvents: 'none' }}>
          {ANCHOR_PTS.map(([k, fx, fy]) => (
            <div
              key={k}
              title="Drag to connect"
              onPointerDown={(e) => wb.startConnect(o.id, k, e)}
              onMouseEnter={() => wb.setHover(o.id)}
              onMouseLeave={() => wb.setHover(null)}
              style={{
                position: 'absolute',
                left: `calc(${fx * 100}% - 6px)`,
                top: `calc(${fy * 100}% - 6px)`,
                width: 12,
                height: 12,
                background: 'var(--accent)',
                border: '2px solid var(--bg)',
                borderRadius: '50%',
                cursor: 'crosshair',
                pointerEvents: 'auto',
              }}
            />
          ))}
        </div>,
      );
    }
  }

  // The keyboard-connect cursor (R3-607): a dashed ring on the object arrows
  // have walked to, and a hint line naming the mode — an armed keyboard mode
  // must be visible, never a silent state change.
  if (connectFrom) {
    const src = byId[connectFrom];
    if (src) {
      const [sx, sy] = wb.project(src.x, src.y);
      overlays.push(
        <div
          key={`cfrom${connectFrom}`}
          style={{ position: 'absolute', left: sx, top: sy, width: src.w * wb.state.cam.zoom, height: src.h * wb.state.cam.zoom, transform: `rotate(${src.rot}deg)`, pointerEvents: 'none', border: '1.5px dashed var(--accent-violet)', borderRadius: 8 }}
        >
          <div style={{ position: 'absolute', top: -26, left: 0, whiteSpace: 'nowrap', font: 'var(--mono-xs)', color: 'var(--accent-violet)' }}>
            Connect from here · arrows pick · Enter connects · Esc cancels
          </div>
        </div>,
      );
    }
    const cur = connectCursor ? byId[connectCursor] : null;
    if (cur) {
      const [cx, cy] = wb.project(cur.x, cur.y);
      overlays.push(
        <div
          key={`ccur${cur.id}`}
          style={{ position: 'absolute', left: cx, top: cy, width: cur.w * wb.state.cam.zoom, height: cur.h * wb.state.cam.zoom, transform: `rotate(${cur.rot}deg)`, pointerEvents: 'none', border: '2px solid var(--accent)', borderRadius: 10, boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent) 35%, transparent)' }}
        >
          <div style={{ position: 'absolute', top: -24, right: 0, font: 'var(--mono-xs)', color: 'var(--ink)' }}>target</div>
        </div>,
      );
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 21 }}>
      {overlays}
      {marquee ? (
        <div
          style={{
            position: 'absolute',
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
            border: '1px solid var(--accent)',
            borderRadius: 3,
          }}
        />
      ) : null}
    </div>
  );
}

export default SelectionOverlay;
