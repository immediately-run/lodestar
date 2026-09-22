// The connection layer (spec §3.1): one SVG of directed arrows/lines between
// objects, with auto-chosen edge anchors (nearest sides), arrowheads, midpoint
// label chips, and dangling-edge warnings (§5.4 — never auto-deleted). Endpoints
// are computed in screen space from the object store so off-screen / virtualized
// objects still anchor correctly. Plus the live drag-to-connect preview.

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';

function Connections() {
  const wb = useWb();
  const { objects, cam, connectPreview } = wb.state;
  const byId: Record<string, (typeof objects)[number]> = {};
  objects.forEach((o) => (byId[o.id] = o));

  const lines: React.ReactNode[] = [];
  const heads: React.ReactNode[] = [];
  const chips: React.ReactNode[] = [];

  objects.forEach((o) => {
    (o.connections || []).forEach((c, i) => {
      const t = byId[c.to];
      const dangling = !t;
      let a: [number, number];
      let b: [number, number];
      if (t) {
        const ac = wb.anchorPoint(o, t.x + t.w / 2, t.y + t.h / 2);
        const bc = wb.anchorPoint(t, o.x + o.w / 2, o.y + o.h / 2);
        a = wb.project(ac[0], ac[1]);
        b = wb.project(bc[0], bc[1]);
      } else {
        a = wb.project(o.x + o.w, o.y + o.h / 2);
        b = [a[0] + 70 * cam.zoom, a[1]];
      }
      const key = `${o.id}-${i}`;
      const col = dangling ? 'var(--ink-3)' : c.style?.stroke === 'accent' ? 'var(--accent)' : 'var(--ink-2)';
      const dashed = c.style?.dash || dangling ? '6 5' : undefined;
      lines.push(
        <line key={`l${key}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={1.6} strokeDasharray={dashed} strokeLinecap="round" />,
      );
      if (c.kind !== 'line') {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const sz = 8;
        const p1 = [b[0] - sz * Math.cos(ang - 0.4), b[1] - sz * Math.sin(ang - 0.4)];
        const p2 = [b[0] - sz * Math.cos(ang + 0.4), b[1] - sz * Math.sin(ang + 0.4)];
        heads.push(<path key={`h${key}`} d={`M${b[0]} ${b[1]} L${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]} Z`} fill={col} />);
      }
      if (c.label || dangling) {
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        chips.push(
          <div
            key={`c${key}`}
            style={{
              position: 'absolute',
              left: mx,
              top: my,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              background: 'var(--panel)',
              border: `1px solid ${dangling ? '#caa24a' : 'var(--line-2)'}`,
              borderRadius: 'var(--r-pill)',
              font: 'var(--mono-xs)',
              color: dangling ? '#caa24a' : 'var(--ink-2)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {dangling ? (
              <>
                <Icon name="alert" size={11} color="#caa24a" strokeWidth={2} />
                dangling
              </>
            ) : (
              c.label
            )}
          </div>,
        );
      }
    });
  });

  if (connectPreview) {
    const o = byId[connectPreview.from];
    if (o) {
      const a = wb.project(o.x + o.w / 2, o.y + o.h / 2);
      lines.push(<line key="cp" x1={a[0]} y1={a[1]} x2={connectPreview.x} y2={connectPreview.y} stroke="var(--accent)" strokeWidth={1.8} strokeDasharray="5 4" />);
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {lines}
        {heads}
      </svg>
      {chips}
    </div>
  );
}

export default Connections;
