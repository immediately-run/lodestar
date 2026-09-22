// The edit-mode inspector: a right-side panel on desktop, a bottom sheet on
// mobile. Covers the frontmatter-shaped edits (title, tags, note color, lock,
// hidden, z-order, raw geometry) plus "Open source", which hands a single object
// file to the existing edit-file task (spec §4.2). With nothing selected it edits
// board-level settings (background, theme); with many, a bulk delete.

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';
import { NOTE_COLORS } from '../data/seedBoard';
import type { Background, WObject } from '../lib/types';

const fl: React.CSSProperties = { font: 'var(--mono-xs)', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--ink)', font: 'var(--body-sm)' };
const seg = (on: boolean): React.CSSProperties => ({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '7px 8px',
  background: on ? 'color-mix(in oklab, var(--accent-2) 28%, var(--panel))' : 'var(--bg)',
  border: `1px solid ${on ? 'color-mix(in oklab, var(--accent-2) 55%, var(--line-2))' : 'var(--line-2)'}`,
  borderRadius: 8,
  color: 'var(--ink)',
  font: 'var(--body-sm)',
  cursor: 'pointer',
  textTransform: 'capitalize',
});
const toggleBtn = (on: boolean): React.CSSProperties => ({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: 9,
  background: on ? 'color-mix(in oklab, var(--accent) 22%, var(--panel))' : 'var(--bg)',
  border: `1px solid ${on ? 'color-mix(in oklab, var(--accent) 50%, var(--line-2))' : 'var(--line-2)'}`,
  borderRadius: 8,
  color: 'var(--ink)',
  font: 'var(--label)',
  cursor: 'pointer',
});
const btnGhost: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--ink)', font: 'var(--label)', cursor: 'pointer' };
const btnDanger: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, background: 'color-mix(in oklab, #e0484f 12%, var(--panel))', border: '1px solid color-mix(in oklab, #e0484f 35%, var(--line))', borderRadius: 9, color: '#e07078', font: 'var(--label)', cursor: 'pointer' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={fl}>{label}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </label>
  );
}

function Inspector() {
  const wb = useWb();
  const { inspectorOpen, selection, objects, views, journeys, bg, light } = wb.state;
  if (!inspectorOpen) return null;
  const mobile = wb.isMobile();

  const head = (title: string, sub: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
      <div>
        <div style={{ font: '700 16px/1 var(--disp)', color: 'var(--ink)', textTransform: 'capitalize' }}>{title}</div>
        <div style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>
      </div>
      <button onClick={wb.closeInspector} style={{ display: 'flex', padding: 5, background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );

  let body: React.ReactNode;
  const sel: WObject | null = selection.length === 1 ? objects.find((o) => o.id === selection[0]) ?? null : null;

  if (selection.length > 1) {
    body = (
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {head(`${selection.length} objects selected`, 'multi')}
        <button onClick={wb.deleteSelection} style={btnDanger}>
          <Icon name="trash" size={15} strokeWidth={1.75} />
          Delete selection
        </button>
      </div>
    );
  } else if (!sel) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('Board', 'board')}
        <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Title">
            <input defaultValue="Q3 planning" style={inp} />
          </Field>
          <div>
            <div style={fl}>Background</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              {(['grid', 'dots', 'plain'] as Background[]).map((b) => (
                <button key={b} onClick={() => wb.setBackground(b)} style={seg(bg === b)}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={fl}>Theme</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              {([['dark', false], ['light', true]] as [string, boolean][]).map(([lbl, v]) => (
                <button key={lbl} onClick={() => wb.setLight(v)} style={seg(light === v)}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)', lineHeight: 1.6, paddingTop: 4, borderTop: '1px solid var(--line)' }}>
            {`${objects.length} objects · ${views.length} views · ${journeys.length} journeys`}
          </div>
        </div>
      </div>
    );
  } else {
    const isNote = sel.kind === 'note';
    body = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head(sel.kind, sel.id)}
        <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 15 }}>
          <Field label="Title">
            <input value={sel.title || ''} onChange={(e) => wb.patchSel({ title: e.target.value })} style={inp} />
          </Field>
          <Field label="Tags">
            <input value={sel.tags || ''} placeholder="comma, separated" onChange={(e) => wb.patchSel({ tags: e.target.value })} style={inp} />
          </Field>
          {isNote ? (
            <div>
              <div style={fl}>Note color</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => wb.patchSel({ color: c })}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: `var(--n-${c})`,
                      border: sel.color === c ? '2px solid var(--ink)' : '1px solid rgba(0,0,0,.15)',
                      cursor: 'pointer',
                      boxShadow: sel.color === c ? '0 0 0 2px var(--bg), 0 0 0 3px var(--accent)' : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="X">
              <input type="number" value={Math.round(sel.x)} onChange={(e) => wb.patchSel({ x: +e.target.value })} style={inp} />
            </Field>
            <Field label="Y">
              <input type="number" value={Math.round(sel.y)} onChange={(e) => wb.patchSel({ y: +e.target.value })} style={inp} />
            </Field>
            <Field label="W">
              <input type="number" value={Math.round(sel.w)} onChange={(e) => wb.patchSel({ w: +e.target.value })} style={inp} />
            </Field>
            <Field label="H">
              <input type="number" value={Math.round(sel.h)} onChange={(e) => wb.patchSel({ h: +e.target.value })} style={inp} />
            </Field>
          </div>
          <Field label="Rotation">
            {/* The same transform the rotate handle drags (R3-607): one action,
                two triggers — the field and the handle both write `rot`. */}
            <input
              type="number"
              aria-label="Rotation in degrees"
              value={Math.round(sel.rot || 0)}
              onChange={(e) => wb.patchSel({ rot: +e.target.value })}
              style={inp}
            />
          </Field>
          <button
            onClick={wb.beginConnect}
            disabled={selection.length !== 1}
            title={selection.length !== 1 ? 'Connect needs exactly one object selected' : 'Arrows pick the target · Enter connects · Escape cancels'}
            style={selection.length !== 1 ? { ...btnGhost, opacity: 0.55, cursor: 'default' } : btnGhost}
          >
            <Icon name="refresh" size={14} strokeWidth={1.75} />
            Connect from here…
          </button>
          <div>
            <div style={fl}>Stacking</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              <button onClick={() => wb.patchSel({ z: (sel.z || 0) + 1 })} style={seg(false)}>
                <Icon name="arrowUp" size={14} strokeWidth={1.75} />
                Up
              </button>
              <button onClick={() => wb.patchSel({ z: Math.max(0, (sel.z || 0) - 1) })} style={seg(false)}>
                <Icon name="arrowDown" size={14} strokeWidth={1.75} />
                Down
              </button>
              <button onClick={() => wb.patchSel({ z: 99 })} style={seg(false)}>
                <Icon name="bringFront" size={14} strokeWidth={1.5} />
                Front
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => wb.patchSel({ locked: !sel.locked })} style={toggleBtn(!!sel.locked)}>
              <Icon name="lock" size={14} strokeWidth={1.75} />
              {sel.locked ? 'Locked' : 'Lock'}
            </button>
            <button onClick={() => wb.patchSel({ hidden: !sel.hidden })} style={toggleBtn(!!sel.hidden)}>
              <Icon name="eyeOff" size={14} strokeWidth={1.75} />
              {sel.hidden ? 'Hidden' : 'Hide'}
            </button>
          </div>
          <button onClick={() => wb.toast(`Opening ${sel.id}.mdx in edit-file…`, 'pencil')} style={btnGhost}>
            <Icon name="pencil" size={14} strokeWidth={1.75} />
            Open source
          </button>
          <button onClick={wb.deleteSelection} style={btnDanger}>
            <Icon name="trash" size={14} strokeWidth={1.75} />
            Delete
          </button>
        </div>
      </div>
    );
  }

  const wrapStyle: React.CSSProperties = mobile
    ? {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '64%',
        background: 'color-mix(in oklab, var(--panel) 97%, transparent)',
        borderTop: '1px solid var(--line-2)',
        borderRadius: '18px 18px 0 0',
        zIndex: 46,
        backdropFilter: 'blur(14px)',
        boxShadow: '0 -12px 34px rgba(0,0,0,.4)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }
    : {
        position: 'absolute',
        top: 72,
        right: 16,
        bottom: 16,
        width: 312,
        background: 'color-mix(in oklab, var(--panel) 94%, transparent)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)',
        zIndex: 38,
        backdropFilter: 'blur(14px)',
        boxShadow: 'var(--shadow-pop)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      };

  return (
    <div className="wb-scroll" style={wrapStyle}>
      {body}
    </div>
  );
}

export default Inspector;
