// A bottom-left scenario switcher that surfaces the designed states and
// collaboration moments for review — the board chooser, the empty/forbidden
// screens, and the concurrent-edit / role-downgrade toasts. It stands in for
// states the live platform layer (mounts, share-link redemption) will drive once
// wired; it is a dev affordance, not host chrome.

import { useWb } from '../hooks/useLodestarCtx';
import { useOverlayDialog } from '../hooks/useOverlayDialog';
import Icon from './Icon';
import type { ScreenKind } from '../lib/types';

function DemoMenu() {
  const wb = useWb();
  const { demoMenuOpen } = wb.state;
  const closeMenu = () => wb.toggleDemoMenu();
  // The dialog contract (R3-607): focus in, Tab trapped, Escape, focus return —
  // armed while the dropdown is open.
  const dialogRef = useOverlayDialog(demoMenuOpen, closeMenu);

  const items: { label: string; run: () => void }[] = [
    { label: 'Board chooser', run: () => setScreen('chooser') },
    { label: 'Empty board (invite)', run: () => setScreen('empty') },
    { label: 'No board selected', run: () => setScreen('noboard') },
    { label: 'Signed out', run: () => setScreen('signedout') },
    { label: 'Not a board (retry)', run: () => setScreen('notaboard') },
    { label: 'Simulate concurrent edit', run: () => { wb.demoLWW(); wb.toggleDemoMenu(); } },
    { label: 'Simulate role downgrade', run: () => { wb.demoDowngrade(); wb.toggleDemoMenu(); } },
  ];

  function setScreen(k: ScreenKind) {
    wb.setScreen(k);
    wb.toggleDemoMenu();
  }

  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 45 }}>
      {demoMenuOpen ? (
        <div ref={dialogRef} tabIndex={-1} style={{ position: 'absolute', bottom: 46, left: 0, width: 230, padding: 6, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-pop)' }}>
          <div style={{ font: 'var(--mono-xs)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '4px 10px 6px' }}>States &amp; scenarios</div>
          {items.map((d) => (
            <button key={d.label} onClick={d.run} style={{ display: 'block', width: '100%', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 8, color: 'var(--ink)', font: 'var(--body-sm)', cursor: 'pointer', textAlign: 'left' }}>
              {d.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        onClick={wb.toggleDemoMenu}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', background: 'color-mix(in oklab, var(--panel) 86%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', color: 'var(--ink-2)', font: 'var(--mono-xs)', letterSpacing: '.04em', cursor: 'pointer', backdropFilter: 'blur(10px)', textTransform: 'uppercase' }}
      >
        <Icon name="layers" size={13} strokeWidth={1.75} />
        <span>Demo states</span>
      </button>
    </div>
  );
}

export default DemoMenu;
