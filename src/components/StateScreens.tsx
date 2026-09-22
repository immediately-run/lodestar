// The designed empty/forbidden states (spec §6.1, DESIGN_BRIEF §3): empty board
// (invites the first note), no board selected, signed out, and the "not a board"
// retry after picking a folder with no board.md. The chooser is its own modal.
// These never imitate host chrome — sign-in itself is host-driven (the copy says
// so); this only frames the app-side states around it.

import { useWb } from '../hooks/useLodestarCtx';
import { BUSY_LABELS } from '../hooks/useLodestar';
import { useOverlayDialog } from '../hooks/useOverlayDialog';
import BoardChooser from './BoardChooser';
import Icon from './Icon';

function StateScreens() {
  const wb = useWb();
  const screen = wb.state.screen;
  const closeScreen = () => wb.setScreen(null);
  // The dialog contract (R3-607): focus in, Tab trapped, Escape, focus return.
  // The chooser screen delegates to BoardChooser, which carries its own.
  const dialogRef = useOverlayDialog(!!screen && screen !== 'chooser', closeScreen);
  if (!screen) return null;
  if (screen === 'chooser') return <BoardChooser />;

  const close = () => wb.setScreen(null);

  const emptyArt = (icon: string, size: number, amber = false) => (
    <div
      style={{
        width: 88,
        height: 88,
        borderRadius: 24,
        background: amber ? 'color-mix(in oklab, #caa24a 16%, var(--panel))' : 'color-mix(in oklab, var(--accent-2) 14%, var(--panel))',
        border: `1px solid ${amber ? 'color-mix(in oklab, #caa24a 40%, var(--line))' : 'var(--line-2)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: amber ? '#caa24a' : 'var(--accent-violet)',
        marginBottom: 6,
      }}
    >
      <Icon name={icon} size={size} strokeWidth={1.5} />
    </div>
  );

  // `key` is required because the same helper renders sibling buttons in an array.
  // `busyFor` (when given) names the flow this button starts: while it runs the
  // button shows the named busy label with aria-busy, and NO close-first — the
  // surface that names the wait must survive the wait (R-IX-2); the flow itself
  // closes the screen on success.
  const primary = (
    key: string,
    label: string,
    icon: string,
    onClick: () => void = close,
    busyFlow?: keyof typeof BUSY_LABELS,
  ) => {
    const busy = busyFlow !== undefined && wb.state.busy === busyFlow;
    return (
      <button
        key={key}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'var(--grad)', border: 'none', borderRadius: 'var(--r-pill)', color: '#1a1020', font: 'var(--label)', cursor: busy ? 'default' : 'pointer', boxShadow: 'var(--glow)', whiteSpace: 'nowrap' }}
      >
        <Icon name={icon} size={16} color="#1a1020" strokeWidth={icon === 'chevRight' || icon === 'plusBig' ? 2 : 1.75} />
        {busy ? BUSY_LABELS[busyFlow!] : label}
      </button>
    );
  };
  const secondary = (key: string, label: string, onClick: () => void = close, busyFlow?: keyof typeof BUSY_LABELS) => {
    const busy = busyFlow !== undefined && wb.state.busy === busyFlow;
    return (
      <button key={key} aria-busy={busy || undefined} disabled={busy} onClick={onClick} style={{ padding: '12px 20px', background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-pill)', color: 'var(--ink)', font: 'var(--label)', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
        {busy ? BUSY_LABELS[busyFlow!] : label}
      </button>
    );
  };
  // An instant action closes its screen first (nothing is awaited); a pick
  // flow does NOT — its named busy renders on the button that started it, and
  // the flow closes the screen on success (R-IX-2).
  const instant = (fn: () => void) => () => {
    close();
    fn();
  };
  const flow = (fn: () => void) => () => {
    fn();
  };

  const content: Record<string, { art: React.ReactNode; title: string; body: string; actions: React.ReactNode[] }> = {
    empty: {
      art: emptyArt('sticky', 40),
      title: 'An empty board.',
      body: 'Double-click anywhere to drop your first note — or pick an image. Every object you add becomes one file in this folder.',
      actions: [
        primary('add-note', 'Add a note', 'plusBig', instant(() => wb.createObject('note', wb.state.cam.cx, wb.state.cam.cy))),
        secondary('insert-image', 'Insert image…', flow(() => wb.insertImage(0, 0)), 'insert-image'),
      ],
    },
    noboard: {
      art: emptyArt('inbox', 38),
      title: 'No board selected.',
      body: 'Choose a board to open, or start a new one. Your boards live across your team spaces.',
      actions: [primary('open-board', 'Open a board…', 'folder', flow(wb.openBoard), 'open-board')],
    },
    signedout: {
      art: emptyArt('lock', 34),
      title: 'Sign in to load your boards.',
      body: 'Boards live in a shared space. Signing in is handled by immediately.run — this app never asks for credentials itself.',
      actions: [primary('continue', 'Continue', 'chevRight')],
    },
    notaboard: {
      art: emptyArt('alert', 38, true),
      title: 'Not a board.',
      body: 'That folder has no board.md, so there is nothing to render. Pick a different folder, or create a board here.',
      actions: [
        primary('create-board', 'Create board here…', 'plusBig', flow(wb.newBoard), 'new-board'),
        secondary('pick-another', 'Pick another…', flow(wb.openBoard), 'open-board'),
      ],
    },
  };

  const c = content[screen];
  if (!c) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'color-mix(in oklab, var(--bg) 92%, transparent)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button onClick={closeScreen} aria-label="Close" style={{ position: 'absolute', top: 18, right: 18, display: 'flex', padding: 9, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '50%', color: 'var(--ink-2)', cursor: 'pointer' }}>
        <Icon name="x" size={18} />
      </button>
      <div ref={dialogRef} tabIndex={-1} style={{ width: 'min(460px, 94vw)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {c.art}
        <div style={{ font: '800 30px/1 var(--disp)', letterSpacing: '-.03em' }}>{c.title}</div>
        <div style={{ font: 'var(--body)', color: 'var(--ink-2)', maxWidth: 380, textWrap: 'pretty' }}>{c.body}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>{c.actions}</div>
      </div>
    </div>
  );
}

export default StateScreens;
