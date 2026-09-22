// @vitest-environment jsdom
// Inspector (R3-607): the Rotation field writes the store's transform action —
// the same `rot` the rotate handle drags — and the X/Y/W/H fields it joins
// are unchanged.
import { act, fireEvent, render, screen } from '@testing-library/react';
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
import Inspector from './Inspector';

// Held in an object (not a bare let): the react-hooks globals rule forbids
// reassigning outside-declared variables inside a component.
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
      <Inspector />
    </LodestarContext.Provider>
  );
}

const rect = { width: 1440, height: 900, top: 0, left: 0, right: 1440, bottom: 900, x: 0, y: 0, toJSON: () => ({}) };

async function renderWithSelection() {
  render(<Harness />);
  const wb = held.wb!;
  const first = wb.state.objects[0];
  await act(async () => {
    wb.setEdit();
    wb.select(first.id);
  });
  return first.id;
}

describe('Inspector (R3-607)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
  });

  it('the Rotation field writes the store transform — the same rot the drag writes', async () => {
    const id = await renderWithSelection();
    const rotation = screen.getByLabelText(/rotation/i) as HTMLInputElement;
    expect(rotation).toBeInTheDocument();
    fireEvent.change(rotation, { target: { value: '45' } });
    expect(held.wb!.state.objects.find((o) => o.id === id)!.rot).toBe(45);
  });

  it('X/Y/W/H remain, unchanged by the new field', async () => {
    const id = await renderWithSelection();
    const wb = held.wb!;
    for (const label of ['X', 'Y', 'W', 'H']) {
      expect(screen.getByLabelText(label, { exact: false })).toBeInTheDocument();
    }
    const x = screen.getByLabelText(/^X$/i) as HTMLInputElement;
    const before = wb.state.objects.find((o) => o.id === id)!.x;
    fireEvent.change(x, { target: { value: String(before + 12) } });
    expect(held.wb!.state.objects.find((o) => o.id === id)!.x).toBe(before + 12);
  });
});
