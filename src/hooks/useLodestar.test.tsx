// @vitest-environment jsdom
// Post-pick busy states (R3-607 / R-IX-2): the named busy label is set BEFORE
// the awaited pick resolves, cleared after; a rejecting pick lands in the toast
// channel. `pickFile` is the boundary — mocked controllable here; everything
// else is the real controller.
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SandboxMount } from '@immediately-run/sdk/mounts';

// Per-case mounts (R3-831): the default is no mounts at all — an ordinary
// launch; the corpus cases push a `type: 'content'` mount in. Held in an
// object for the react-hooks globals rule (see `held` below).
const mountsHeld = { list: [] as SandboxMount[] };
vi.mock('@immediately-run/sdk/mounts', () => ({
  getMounts: () => mountsHeld.list,
  onMountsChange: () => () => {},
  openSettings: async () => {
    throw new Error('no host transport');
  },
}));

// The pick boundary: resolve/reject controlled per-case. `boardSpaceRoot` rides
// the same module and is waited before the pick.
let pickResult: Promise<{ relPath: string } | null> | null = null;
vi.mock('../lib/pickFile', () => ({
  pickFile: () => pickResult,
  boardSpaceRoot: async () => '/mem/board',
  requestSpace: async () => null,
  safeRel: (s: string) => s,
}));

// removeView is the one boardStore function deleteView's new branches ride —
// controllable here, real everywhere else (partial mock over the original).
// boardExists/loadBoard/openBoardTarget are controllable the same way for the
// R3-831 corpus cases: the default is the REAL function, so every other case
// behaves exactly as before.
vi.mock('../lib/boardStore', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/boardStore')>();
  return {
    ...orig,
    removeView: vi.fn(async () => undefined),
    boardExists: vi.fn(orig.boardExists),
    loadBoard: vi.fn(orig.loadBoard),
    openBoardTarget: vi.fn(orig.openBoardTarget),
  };
});

import { useLodestar } from './useLodestar';
import { boardExists, loadBoard, openBoardTarget, removeView } from '../lib/boardStore';
import { corpusMount } from '../lib/openProject';
import type { WObject } from '../lib/types';

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
  return <div>{controller.state.objects.length}</div>;
}

async function renderWithBoard() {
  render(<Harness />);
  const wb = held.wb!;
  // Arm a writable board target so insertImage passes its sign-in guard; the
  // real loadBoard tolerates an absent directory (readDirSafe degrades).
  await act(async () => {
    await wb.openBoardAt({ root: '/mem/board', mode: 'rw' });
  });
}

// Every case starts with no mounts (R3-831): a leftover corpus mount from a
// previous case would reroute the next case's boot into the corpus path.
beforeEach(() => {
  mountsHeld.list = [];
});

describe('post-pick busy states (R3-607)', () => {
  beforeEach(() => {
    pickResult = null;
  });

  it('applySelection — the additive branch every shift-click takes (toggle in, toggle out)', async () => {
    await renderWithBoard();
    // The pure spelling both pointer and keyboard share; imported directly so a
    // toggle-branch regression cannot hide behind a render.
    const { applySelection } = await import('./useLodestar');
    expect(applySelection([], 'a', true)).toEqual(['a']);
    expect(applySelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(applySelection(['a', 'b'], 'a', true)).toEqual(['b']); // toggle out
    expect(applySelection(['a'], 'a', false)).toEqual(['a']); // replace keeps
    expect(applySelection(['a'], 'b', false)).toEqual(['b']); // replace swaps
  });

  it('the busy label is set before the pick resolves and cleared after (cancel)', async () => {
    await renderWithBoard();
    const wb = held.wb!;
    let resolvePick!: (v: { relPath: string } | null) => void;
    pickResult = new Promise((res) => {
      resolvePick = res;
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = wb.insertImage(0, 0);
    });
    expect(held.wb!.state.busy).toBe('insert-image');
    await act(async () => {
      resolvePick(null); // cancelled — the picker was dismissed
      await pending;
    });
    expect(held.wb!.state.busy).toBeNull();
  });

  it('a rejecting pick lands in the toast channel and clears busy', async () => {
    await renderWithBoard();
    const wb = held.wb!;
    pickResult = Promise.reject(Object.assign(new Error('picker failed'), { code: 'cancelled' }));
    let pending!: Promise<void>;
    // A SYNCHRONOUS act: starts the flow without flushing its microtasks, so
    // the busy state is observable before the rejection is handled.
    act(() => {
      pending = wb.insertImage(0, 0);
    });
    expect(held.wb!.state.busy).toBe('insert-image');
    await act(async () => {
      await pending;
    });
    expect(held.wb!.state.busy).toBeNull();
    expect(held.wb!.state.toasts.some((t) => t.text.includes('insert image'))).toBe(true);
  });

  it('the keyboard connect path — arm, walk the cursor (with wrap), commit through the real addConnection, cancel', async () => {
    // No board target needed: the connect actions work in memory (the seed
    // board supplies the objects); commitSave's no-board path just toasts.
    render(<Harness />);
    const wb = held.wb!;
    const first = wb.state.objects[0];
    await act(async () => {
      wb.select(first.id);
    });
    await act(async () => {
      wb.beginConnect();
    });
    // Armed: the source is the selection; the cursor starts on another object.
    const s1 = held.wb!.state;
    expect(s1.connectFrom).toBe(first.id);
    expect(s1.connectCursor).not.toBe(first.id);
    expect(s1.connectCursor).toBeTruthy();
    // The walk: arrows move the cursor through the other objects, wrapping at
    // both ends, never landing on the source.
    const others = s1.objects.filter((o) => o.id !== first.id).length;
    await act(async () => {
      for (let i = 0; i < others + 2; i += 1) wb.moveConnectCursor(1);
    });
    expect(held.wb!.state.connectCursor).not.toBe(first.id);
    await act(async () => {
      wb.moveConnectCursor(-1);
    });
    expect(held.wb!.state.connectCursor).not.toBe(first.id);
    // Commit: the edge arrives through the same store action the drag calls.
    const target = held.wb!.state.connectCursor!;
    const before = held.wb!.state.objects.find((o) => o.id === first.id)!.connections.length;
    await act(async () => {
      wb.endConnect(true);
    });
    const src = held.wb!.state.objects.find((o) => o.id === first.id)!;
    expect(src.connections.some((c) => c.to === target)).toBe(true);
    expect(src.connections.length).toBe(before + 1);
    expect(held.wb!.state.connectFrom).toBeNull();
    // Cancel adds nothing: arm again on the (still-selected) source and Escape.
    await act(async () => {
      wb.beginConnect();
    });
    await act(async () => {
      wb.endConnect(false);
    });
    const after = held.wb!.state.objects.find((o) => o.id === first.id)!.connections.length;
    expect(after).toBe(before + 1);
    expect(held.wb!.state.connectFrom).toBeNull();
  });

  it('deleteView on a read-only board refuses BEFORE dropping — the row survives', async () => {
    render(<Harness />);
    await act(async () => {
      // A read-only board target (the ro guard fires before any state change).
      await held.wb!.openBoardAt({ root: '/mem/ro', mode: 'ro' });
    });
    const name = held.wb!.state.views[0].name;
    await act(async () => {
      held.wb!.deleteView(name);
    });
    expect(held.wb!.state.views.some((v) => v.name === name)).toBe(true);
    expect(held.wb!.state.toasts.some((t) => t.text.includes('Read-only board'))).toBe(true);
    expect(removeView).not.toHaveBeenCalled();
  });

  it('deleteView rolls the row back when the file removal fails', async () => {
    render(<Harness />);
    await act(async () => {
      await held.wb!.openBoardAt({ root: '/mem/board', mode: 'rw' });
    });
    const name = held.wb!.state.views[0].name;
    vi.mocked(removeView).mockRejectedValueOnce(Object.assign(new Error('EROFS'), { code: 'EROFS' }));
    await act(async () => {
      held.wb!.deleteView(name);
    });
    expect(held.wb!.state.views.some((v) => v.name === name)).toBe(true);
    expect(held.wb!.state.toasts.some((t) => t.text.includes('remove view'))).toBe(true);
  });
});

// ── URL-dispatched corpus board (R3-831) ─────────────────────────────────────
// A cold URL load into a repo whose marker names open-project dispatches to us
// as the bound viewer with NO task input; the host marks the loaded repo as a
// `type: 'content'` mount available at boot. That mount is the project — the
// board loads from it, and the durable path never opens.
describe('URL-dispatched corpus board (R3-831)', () => {
  beforeEach(() => {
    // Call counts accumulate across the file's earlier cases (module-level
    // mocks); clear them so "not called" means "not called in THIS case".
    vi.mocked(loadBoard).mockClear();
    vi.mocked(openBoardTarget).mockClear();
  });
  const CORPUS: SandboxMount = {
    path: '/mnt/corpus',
    type: 'content',
    id: 'content:immediately-run/lodestar-sample-project',
    mode: 'ro',
  };
  const NOTE: WObject = {
    id: 'note-welcome',
    kind: 'note',
    x: 0,
    y: 0,
    w: 200,
    h: 148,
    rot: 0,
    scale: 1,
    z: 3,
    connections: [],
    title: 'Welcome',
  };

  it('corpusMount keys on the host mark (`type: content`), never on the only foreign mount', () => {
    expect(corpusMount([])).toBeNull();
    // A held space is foreign too — keying on "the only foreign mount" would
    // open the wrong board the moment a space is held.
    expect(corpusMount([{ path: '/spaces/x', type: 'firestore', id: 'space-1', mode: 'rw' }])).toBeNull();
    expect(corpusMount([CORPUS])).toBe(CORPUS);
  });

  it('with no task input, a corpus mount IS the project — the board loads from it, chrooted as mounted', async () => {
    mountsHeld.list = [CORPUS];
    vi.mocked(boardExists).mockResolvedValueOnce(true);
    vi.mocked(loadBoard).mockResolvedValueOnce({
      objects: [NOTE],
      views: [],
      journeys: [],
      title: 'Sample project',
    });
    // The durable space must never open: the URL named THIS project, so its
    // own board — not the user's space, not the demo seed — is what shows.
    vi.mocked(openBoardTarget).mockRejectedValueOnce(new Error('durable space must not open'));
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the boot chain settle
    });
    expect(loadBoard).toHaveBeenCalledWith({ root: '/mnt/corpus', mode: 'ro', spaceId: CORPUS.id });
    expect(held.wb!.state.title).toBe('Sample project');
    expect(held.wb!.state.objects).toHaveLength(1);
    expect(held.wb!.state.objects[0].id).toBe('note-welcome');
  });

  it('a corpus mount with no board files falls through to the durable path unchanged', async () => {
    mountsHeld.list = [CORPUS];
    vi.mocked(boardExists).mockResolvedValueOnce(false);
    vi.mocked(openBoardTarget).mockRejectedValueOnce(Object.assign(new Error('auth-required'), { code: 'auth-required' }));
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(loadBoard).not.toHaveBeenCalled();
    expect(openBoardTarget).toHaveBeenCalledTimes(1);
  });

  it('with no corpus mount and no task input, the durable path answers exactly as before', async () => {
    mountsHeld.list = [];
    vi.mocked(openBoardTarget).mockRejectedValueOnce(Object.assign(new Error('auth-required'), { code: 'auth-required' }));
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(loadBoard).not.toHaveBeenCalled();
    expect(openBoardTarget).toHaveBeenCalledTimes(1);
    // Signed out: the in-memory seed stays — the demo board, today's behavior.
    expect(held.wb!.state.objects.length).toBeGreaterThan(0);
  });
});
