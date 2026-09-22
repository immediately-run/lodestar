// @vitest-environment jsdom
// The adoption proof (R3-607): the board chooser carries the dialog contract —
// Escape closes it and focus returns to the control that opened it.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@immediately-run/sdk/mounts', () => ({
  getMounts: () => [],
  onMountsChange: () => () => {},
  openSettings: async () => {
    throw new Error('no host transport');
  },
}));

import { useLodestar } from '../hooks/useLodestar';
import { LodestarContext } from '../lib/context';
import StateScreens from './StateScreens';

function Harness() {
  const wb = useLodestar();
  return (
    <LodestarContext.Provider value={wb}>
      <button onClick={() => wb.setScreen('chooser')}>Open chooser</button>
      <StateScreens />
    </LodestarContext.Provider>
  );
}

describe('BoardChooser adoption (R3-607)', () => {
  it('Escape closes the chooser and focus returns to the opener', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open chooser' });
    opener.focus();
    fireEvent.click(opener);
    // The chooser is up (its heading is rendered).
    expect(screen.getByText('Open a board.')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Open a board.')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });
});
