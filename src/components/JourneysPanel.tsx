// Journeys & views panel. Run mode: play a journey, jump to a saved view. Edit
// mode adds list-based journey authoring (steps with missing-view warnings,
// add-current-view) and "save view" — deliberately humble, no timeline UI
// (spec §4.3, DESIGN_BRIEF §4). Views carry their destroy (R3-607, R-IX-5): an
// inline confirm on the row, the same surface that creates them.

import { useState } from 'react';
import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';
import { implausibleDuration } from '../lib/journey';

const fl: React.CSSProperties = { font: 'var(--mono-xs)', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-pill)', color: 'var(--ink-2)', font: 'var(--mono-xs)', cursor: 'pointer' };

function JourneysPanel() {
  const wb = useWb();
  const { panelOpen, inspectorOpen, journeys, views, mode } = wb.state;
  if (!panelOpen) return null;
  const edit = mode === 'edit';
  const mobile = wb.isMobile();

  const wrapStyle: React.CSSProperties = mobile
    ? { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '64%', background: 'color-mix(in oklab, var(--panel) 97%, transparent)', borderTop: '1px solid var(--line-2)', borderRadius: '18px 18px 0 0', zIndex: 47, backdropFilter: 'blur(14px)', boxShadow: '0 -12px 34px rgba(0,0,0,.4)', overflowY: 'auto' }
    : { position: 'absolute', top: 72, right: inspectorOpen ? 340 : 16, bottom: 16, width: 300, background: 'color-mix(in oklab, var(--panel) 94%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', zIndex: 39, backdropFilter: 'blur(14px)', boxShadow: 'var(--shadow-pop)', overflowY: 'auto' };

  return (
    <div className="wb-scroll" style={wrapStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ font: '700 16px/1 var(--disp)' }}>Journeys &amp; views</div>
        <button onClick={wb.closePanel} style={{ display: 'flex', padding: 5, background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={fl}>Journeys</div>
          {edit ? (
            <button onClick={() => wb.toast('Add a journey (authoring)', 'plus')} style={miniBtn}>
              <Icon name="plus" size={13} strokeWidth={2} />
            </button>
          ) : null}
        </div>
        {journeys.map((j) => (
          <div key={j.id} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)' }}>
            <button onClick={() => wb.playJourney(j.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 12px', background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'flex', width: 30, height: 30, borderRadius: 8, background: 'var(--grad)', alignItems: 'center', justifyContent: 'center', color: '#1a1020', flex: 'none' }}>
                <Icon name="play" size={14} color="#1a1020" strokeWidth={0} />
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ font: '600 14px/1.2 var(--sans)' }}>{j.title}</div>
                <div style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)', marginTop: 2 }}>{`${j.steps.length} steps`}</div>
              </span>
            </button>
            {edit ? (
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {j.steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8 }}>
                    <span style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)', width: 16 }}>{i + 1}</span>
                    <span style={{ flex: 1, font: 'var(--body-sm)', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof s.view === 'string' ? s.view : 'inline'}
                    </span>
                    {wb.resolveView(s.view) ? null : (
                      <span title="Missing view" style={{ display: 'flex', color: '#caa24a' }}>
                        <Icon name="alert" size={13} strokeWidth={2} />
                      </span>
                    )}
                    {implausibleDuration(s.duration) ? (
                      <span
                        title={`duration ${s.duration}ms is too small for a camera flight — unit error or typo (R3-402)`}
                        style={{ display: 'flex', color: '#caa24a' }}
                      >
                        <Icon name="alert" size={13} strokeWidth={2} />
                      </span>
                    ) : null}
                    <span style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)' }}>
                      {s.hold ? `hold ${s.hold}ms` : `${s.duration || 800}ms fly`}
                    </span>
                  </div>
                ))}
                <button onClick={() => wb.addJourneyStep(j.id)} style={{ ...miniBtn, justifyContent: 'center', padding: 6 }}>
                  <Icon name="plus" size={13} strokeWidth={2} />
                  Add current view
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ padding: '4px 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={fl}>Views</div>
          {edit ? (
            <button onClick={wb.saveView} style={miniBtn}>
              <Icon name="save" size={13} strokeWidth={1.75} />
              Save
            </button>
          ) : null}
        </div>
        {views.map((v) => (
          <ViewRow key={v.name} name={v.name} zoom={Math.round(v.zoom * 100)} />
        ))}
      </div>
    </div>
  );
}

/** One view row: jump to it, and (edit mode) remove it with an inline confirm —
 *  the LinkedIdentitiesCard shape: the affordance turns into its own
 *  confirmation rather than a dialog for a one-word decision. */
function ViewRow({ name, zoom }: { name: string; zoom: number }) {
  const wb = useWb();
  const edit = wb.state.mode === 'edit';
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => {
          setConfirming(false);
          const v = wb.state.views.find((x) => x.name === name);
          if (v) wb.flyTo(v, 800);
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, padding: '9px 11px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}
      >
        <Icon name="inbox" size={14} color="var(--ink-3)" strokeWidth={1.75} />
        <span style={{ flex: 1, font: 'var(--body-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)' }}>{`${zoom}%`}</span>
      </button>
      {edit ? (
        confirming ? (
          <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
            <button
              onClick={() => {
                setConfirming(false);
                wb.deleteView(name);
              }}
              aria-label={`Confirm removing view ${name}`}
              style={{ ...miniBtn, color: '#e07078', borderColor: 'color-mix(in oklab, #e0484f 35%, var(--line))' }}
            >
              <Icon name="trash" size={13} strokeWidth={2} />
              Remove
            </button>
            <button onClick={() => setConfirming(false)} style={miniBtn}>
              Keep
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} aria-label={`Remove view ${name}`} style={{ ...miniBtn, padding: '6px 8px' }}>
            <Icon name="trash" size={13} strokeWidth={1.75} />
          </button>
        )
      ) : null}
    </div>
  );
}

export default JourneysPanel;
