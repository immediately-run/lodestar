// The board chooser (spec §6.1): boards grouped by space, each space showing
// its role (can-edit / read-only). "Add a space" and "Open folder" route to the
// host powerbox / pick-file — space-granting authority stays with the host,
// never the app (the footnote says so out loud). The list is REAL (R3-607):
// the spaces the host granted (the mounts) with the board folders each
// contains — no boards.json metadata exists on the seam yet, so the
// mounts-derived list is the shape (see lib/boardList and the item's
// Hand-off).

import { useEffect, useState } from 'react';
import { useWb } from '../hooks/useLodestarCtx';
import { useOverlayDialog } from '../hooks/useOverlayDialog';
import { listSpacesAndBoards } from '../lib/boardList';
import { BUSY_LABELS } from '../hooks/useLodestar';
import type { SpaceBoards } from '../lib/boardList';
import Icon from './Icon';

function RoleChip({ role }: { role: 'rw' | 'ro' }) {
  const rw = role === 'rw';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        borderRadius: 'var(--r-pill)',
        font: 'var(--mono-xs)',
        letterSpacing: '.03em',
        whiteSpace: 'nowrap',
        flex: 'none',
        background: rw ? 'color-mix(in oklab, var(--accent-2) 16%, var(--panel))' : 'var(--panel-2)',
        border: `1px solid ${rw ? 'color-mix(in oklab, var(--accent-2) 38%, var(--line))' : 'var(--line-2)'}`,
        color: rw ? 'var(--ink)' : 'var(--ink-2)',
      }}
    >
      {rw ? 'can edit' : (
        <>
          <Icon name="lock" size={11} strokeWidth={2} />
          read-only
        </>
      )}
    </span>
  );
}

function BoardChooser() {
  const wb = useWb();
  const close = () => wb.setScreen(null);
  // The dialog contract (R3-607): focus in, Tab trapped, Escape, focus return.
  const dialogRef = useOverlayDialog(true, close);
  const [spaces, setSpaces] = useState<SpaceBoards[]>([]);

  // The real list: enumerate the granted spaces and the boards under each.
  // Re-derived when the mounts change (a granted space appears mid-session).
  // Every failure path is caught INSIDE boardsInMount (an unreadable space
  // degrades to no rows), so this sink is the unreachable last resort — named
  // rather than silently dropped.
  useEffect(() => {
    let cancelled = false;
    listSpacesAndBoards(wb.state.mounts)
      .then((list) => {
        if (!cancelled) setSpaces(list);
      })
      .catch(() => {
        /* boardsInMount owns the failure modes; nothing sensible to render here */
      });
    return () => {
      cancelled = true;
    };
  }, [wb.state.mounts]);

  const busy = wb.state.busy;
  const busyLabel = busy ? BUSY_LABELS[busy] : null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'color-mix(in oklab, var(--bg) 92%, transparent)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 18, right: 18, display: 'flex', padding: 9, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '50%', color: 'var(--ink-2)', cursor: 'pointer' }}>
        <Icon name="x" size={18} />
      </button>

      <div ref={dialogRef} tabIndex={-1} style={{ width: 'min(600px, 94vw)', maxHeight: '84vh', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-modal)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
          <div style={{ font: '800 24px/1 var(--disp)', letterSpacing: '-.02em' }}>Open a board.</div>
          <div style={{ font: 'var(--body-sm)', color: 'var(--ink-2)', marginTop: 6 }}>Boards live in your spaces — one space per team. Each space lists its own boards.</div>
          {busyLabel ? (
            <div aria-live="polite" style={{ font: 'var(--mono-xs)', color: 'var(--accent-violet)', marginTop: 8 }}>
              {busyLabel}
            </div>
          ) : null}
        </div>

        <div className="wb-scroll" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', flex: 1 }}>
          {spaces.length === 0 ? (
            <div style={{ padding: '18px 12px', font: 'var(--body-sm)', color: 'var(--ink-2)' }}>
              No spaces yet — add one below, or open a board folder directly.
            </div>
          ) : null}
          {spaces.map((sp) => (
            <div key={sp.mount.path} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 4px' }}>
                <span style={{ display: 'flex', color: 'var(--ink-2)' }}>
                  <Icon name="users" size={15} strokeWidth={1.75} />
                </span>
                <span style={{ flex: 1, font: '700 13.5px/1 var(--disp)', letterSpacing: '.01em', color: 'var(--ink)' }}>{sp.label}</span>
                <RoleChip role={sp.role} />
              </div>
              {sp.boards.length === 0 ? (
                <div style={{ padding: '2px 12px 6px', font: 'var(--mono-xs)', color: 'var(--ink-3)' }}>No boards in this space yet.</div>
              ) : null}
              {sp.boards.map((b) => (
                <button
                  key={b.name}
                  aria-busy={busy === 'open-board'}
                  disabled={busy !== null}
                  onClick={() => {
                    // No close() first: the busy state this row enters must be
                    // VISIBLE (R-IX-2); loadBoardInto closes the chooser on
                    // success, and a failure leaves it open to retry.
                    void wb.openBoardAt(b.target);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 12px',
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    borderRadius: 11,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--ink)',
                  }}
                >
                  <span style={{ display: 'flex', width: 34, height: 34, borderRadius: 9, background: 'var(--panel-2)', border: '1px solid var(--line)', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', flex: 'none' }}>
                    <Icon name="frame" size={16} strokeWidth={1.75} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 14.5px/1.2 var(--sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    <div style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)', marginTop: 3 }}>board folder</div>
                  </span>
                  {sp.role === 'ro' ? (
                    <Icon name="lock" size={14} color="var(--ink-3)" strokeWidth={2} />
                  ) : (
                    <Icon name="chevRight" size={16} color="var(--ink-3)" strokeWidth={1.75} />
                  )}
                </button>
              ))}
              {sp.role === 'rw' ? (
                <button
                  aria-busy={busy === 'new-board'}
                  disabled={busy !== null}
                  onClick={() => {
                    void wb.newBoardIn({ root: sp.mount.path, mode: 'rw', spaceId: sp.mount.id });
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: '1px dashed var(--line-2)', borderRadius: 11, color: 'var(--ink-3)', font: 'var(--body-sm)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Icon name="plus" size={14} strokeWidth={2} />
                  {`New board in ${sp.label}`}
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 9, flex: 'none' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { wb.addSpace(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, background: 'var(--grad)', border: 'none', borderRadius: 'var(--r-pill)', color: '#1a1020', font: 'var(--label)', cursor: 'pointer' }}>
              <Icon name="userPlus" size={16} color="#1a1020" strokeWidth={1.75} />
              Add a space…
            </button>
            <button aria-busy={busy === 'open-board'} disabled={busy !== null} onClick={() => { wb.openBoard(); }} style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-pill)', color: 'var(--ink)', font: 'var(--label)', cursor: 'pointer' }}>
              <Icon name="folder" size={16} strokeWidth={1.75} />
              Open folder…
            </button>
          </div>
          <div style={{ font: 'var(--mono-xs)', color: 'var(--ink-3)', textAlign: 'center' }}>Adding a space is granted by immediately.run — never by this app.</div>
        </div>
      </div>
    </div>
  );
}

export default BoardChooser;
