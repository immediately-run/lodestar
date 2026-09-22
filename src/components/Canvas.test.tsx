// @vitest-environment jsdom
// Canvas keyboard selection (R3-607): exactly one tabbable object (roving
// stop), focus selects, arrows drive the SAME nudge action the pointer path
// uses (real store, not a mock), Delete removes the focused object, and the
// #18 input-target scoping stays — typing in an input never nudges.
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
import Canvas from './Canvas';

// The harness keeps the REAL controller (the hook) and hands it to the tree —
// assertions read objects/selection through it, never a mock. Held in an
// object (not a bare let) so the react-hooks globals rule is satisfied.
const held = { wb: null as ReturnType<typeof useLodestar> | null };
function Harness() {
  const controller = useLodestar();
  // Capture in an EFFECT (the react-hooks immutability rule bans outside
  // writes during render); act flushes effects, so tests read it after render.
  useEffect(() => {
    held.wb = controller;
  });
  return (
    <LodestarContext.Provider value={controller}>
      <Canvas />
    </LodestarContext.Provider>
  );
}

const rect = { width: 1440, height: 900, top: 0, left: 0, right: 1440, bottom: 900, x: 0, y: 0, toJSON: () => ({}) };

async function renderEdit() {
  render(<Harness />);
  const wb = held.wb!;
  await act(async () => {
    wb.setEdit();
  });
  return wb;
}

async function focusRovingStop() {
  const stop = document.querySelector('[tabindex="0"]') as HTMLElement;
  await act(async () => {
    stop.focus();
  });
  return stop;
}

describe('Canvas keyboard selection (R3-607)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
  });

  it('exposes exactly ONE tabbable object in edit mode (the roving stop)', async () => {
    await renderEdit();
    expect(document.querySelectorAll('[tabindex="0"]').length).toBe(1);
  });

  it('focus selects — the keyboard path writes the same selection the pointer writes', async () => {
    await renderEdit();
    await focusRovingStop();
    const fresh = held.wb!;
    expect(fresh.state.selection).toHaveLength(1);
    expect(fresh.state.selection[0]).toBeTruthy();
  });

  it('arrows nudge the focused object through the existing nudge action', async () => {
    await renderEdit();
    await focusRovingStop();
    const wbNow = held.wb!;
    const id = wbNow.state.selection[0];
    const before = wbNow.state.objects.find((o) => o.id === id)!.x;
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(held.wb!.state.objects.find((o) => o.id === id)!.x).toBe(before - 1);
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(held.wb!.state.objects.find((o) => o.id === id)!.x).toBe(before + 9);
  });

  it('Delete removes the focused object', async () => {
    await renderEdit();
    await focusRovingStop();
    const wbNow = held.wb!;
    const id = wbNow.state.selection[0];
    const count = wbNow.state.objects.length;
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(held.wb!.state.objects.length).toBe(count - 1);
    expect(held.wb!.state.objects.find((o) => o.id === id)).toBeUndefined();
  });

  it('Tab from the roving stop is RELEASED — the funnel is not a trap (WCAG 2.1.2)', async () => {
    await renderEdit();
    const stop = (await focusRovingStop()) as HTMLElement;
    expect(document.activeElement).toBe(stop);
    // Tab ON the stop: not intercepted — focus is free to leave the canvas.
    const tabOut = fireEvent.keyDown(stop, { key: 'Tab', bubbles: true });
    expect(tabOut).toBe(true);
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    stop.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    // Shift+Tab is never intercepted either.
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    stop.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(false);
  });

  it('typing in an input never reaches the nudge — the #18 scoping pin', async () => {
    const { container } = render(
      <div>
        <Harness />
        <input aria-label="editor" />
      </div>,
    );
    await act(async () => {
      held.wb!.setEdit();
    });
    await focusRovingStop();
    const wbNow = held.wb!;
    const id = wbNow.state.selection[0];
    const before = wbNow.state.objects.find((o) => o.id === id)!.x;
    const input = container.querySelector('input[aria-label="editor"]') as HTMLInputElement;
    await act(async () => {
      input.focus();
    });
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    expect(held.wb!.state.objects.find((o) => o.id === id)!.x).toBe(before);
  });
});
