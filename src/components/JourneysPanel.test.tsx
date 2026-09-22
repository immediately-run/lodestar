// @vitest-environment jsdom
// The JourneysPanel adoption (R3-607, R-IX-5): the view row's remove calls the
// controller's deleteView — an inline confirm first, the destroy second.
import { act, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi, beforeAll } from 'vitest';

vi.mock('@immediately-run/sdk/mounts', () => ({
  getMounts: () => [],
  onMountsChange: () => () => {},
  openSettings: async () => {
    throw new Error('no host transport');
  },
}));

import { useLodestar } from '../hooks/useLodestar';
import { LodestarContext } from '../lib/context';
import JourneysPanel from './JourneysPanel';

const held = { wb: null as ReturnType<typeof useLodestar> | null };
function Harness() {
  const controller = useLodestar();
  useEffect(() => {
    held.wb = controller;
  });
  return (
    <LodestarContext.Provider value={controller}>
      <JourneysPanel />
    </LodestarContext.Provider>
  );
}

const rect = { width: 1440, height: 900, top: 0, left: 0, right: 1440, bottom: 900, x: 0, y: 0, toJSON: () => ({}) };

async function renderEditingPanel() {
  render(<Harness />);
  const wb = held.wb!;
  const firstView = wb.state.views[0];
  await act(async () => {
    wb.setEdit();
    wb.togglePanel();
  });
  return firstView.name;
}

describe('JourneysPanel view rows (R3-607)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
  });

  it('the row remove calls deleteView — one confirm, then the view is gone', async () => {
    const viewName = await renderEditingPanel();
    // The seed board's views render as rows; the first one's remove affordance.
    const remove = document.querySelector(`button[aria-label="Remove view ${viewName}"]`) as HTMLButtonElement;
    expect(remove).toBeTruthy();
    fireEvent.click(remove);
    // Inline confirm: the row now offers Confirm removing / Keep.
    const confirm = document.querySelector(`button[aria-label="Confirm removing view ${viewName}"]`) as HTMLButtonElement;
    expect(confirm).toBeTruthy();
    // Before confirming, nothing is destroyed.
    expect(held.wb!.state.views.some((v) => v.name === viewName)).toBe(true);
    fireEvent.click(confirm);
    // The row remove routed through deleteView (the only writer that drops
    // views from state next to the confirm).
    expect(held.wb!.state.views.some((v) => v.name === viewName)).toBe(false);
  });

  it('Keep cancels the destroy — the view survives its own confirm', async () => {
    const viewName = await renderEditingPanel();
    const remove = document.querySelector(`button[aria-label="Remove view ${viewName}"]`) as HTMLButtonElement;
    fireEvent.click(remove);
    fireEvent.click(screenKeepButton());
    expect(held.wb!.state.views.some((v) => v.name === viewName)).toBe(true);
  });
});

function screenKeepButton(): HTMLButtonElement {
  const el = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Keep');
  return el as HTMLButtonElement;
}
