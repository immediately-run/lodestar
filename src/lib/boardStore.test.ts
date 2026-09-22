// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake async `fs` standing in for the sandbox fs (ZenFS/dev-fs). The store
// reads/writes board files through `fs.promises`, so these tests drive the
// manifest round-trip against an in-memory map.
const files = new Map<string, string | Uint8Array>();

vi.mock('fs', () => ({
  default: {
    promises: {
      mkdir: async () => undefined,
      access: async (p: string) => {
        if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      readdir: async (p: string) => {
        const dir = `${p}/`;
        return [...files.keys()].filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length));
      },
      readFile: async (p: string, enc?: string) => {
        const b = files.get(p);
        if (b === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return enc === 'utf8' ? String(b) : b;
      },
      writeFile: async (p: string, data: string | Uint8Array) => {
        files.set(p, data);
      },
      rm: async (p: string) => {
        files.delete(p);
      },
    },
  },
}));

// boardStore imports openSettings from the SDK mounts subpath at module top
// (never called by loadBoard/loadManifest/writeNewBoard). Mock it so the import
// resolves under vitest without a host transport.
vi.mock('@immediately-run/sdk/mounts', () => ({
  openSettings: vi.fn(async () => {
    throw new Error('no host transport');
  }),
}));

import { loadBoard, loadManifest, writeNewBoard, saveView, removeView } from './boardStore';
import type { BoardTarget } from './boardStore';

const target: BoardTarget = { root: '/board', mode: 'rw' };

beforeEach(() => files.clear());

describe('board manifest (R3-401)', () => {
  it('loadBoard returns the manifest title and background alongside objects', async () => {
    files.set('/board/board.md', '---\ntitle: Pacific basin\nwhiteboard:\n  schema: 1\n  background: dots\n---\n');
    files.set('/board/objects/a.mdx', '---\nwhiteboard:\n  position: { x: 0, y: 0 }\n  kind: note\n---\n');
    const board = await loadBoard(target);
    expect(board.title).toBe('Pacific basin');
    expect(board.background).toBe('dots');
    expect(board.schema).toBe(1);
    expect(board.objects.length).toBe(1);
  });

  it('loadBoard falls back to no manifest data when board.md is absent', async () => {
    files.set('/board/objects/a.mdx', '---\nwhiteboard:\n  position: { x: 0, y: 0 }\n  kind: note\n---\n');
    const board = await loadBoard(target);
    expect(board.title).toBeUndefined();
    expect(board.background).toBeUndefined();
    expect(board.objects.length).toBe(1);
  });

  it('loadBoard does NOT throw on an unparseable board.md', async () => {
    files.set('/board/board.md', 'this is not frontmatter at all');
    files.set('/board/objects/a.mdx', '---\nwhiteboard:\n  position: { x: 0, y: 0 }\n  kind: note\n---\n');
    await expect(loadBoard(target)).resolves.not.toThrow();
    const board = await loadBoard(target);
    expect(board.title).toBeUndefined();
    expect(board.objects.length).toBe(1);
  });

  it('round-trips: writeNewBoard(title) then loadBoard() returns that title', async () => {
    await writeNewBoard(target, 'My board');
    const board = await loadBoard(target);
    expect(board.title).toBe('My board');
    expect(board.background).toBe('grid');
    expect(board.schema).toBe(1);
  });

  it('the emitted manifest shape agrees with the model (bare background kind)', async () => {
    await writeNewBoard(target, 'My board');
    const raw = files.get('/board/board.md');
    expect(String(raw)).toContain('background: grid');
    expect(String(raw)).not.toContain('size');
  });

  // R3-737 — the app is Lodestar now; the on-disk format is not renamed. This pins
  // the data-format decision: a NEW board still carries the `whiteboard:` frontmatter
  // key, written by the real writer (readers in mdxObject.ts and site-main's
  // flushPolicy key on it; a rename would be its own dual-read migration).
  it('a new board manifest still carries the whiteboard: frontmatter key (R3-737 data-format pin)', async () => {
    await writeNewBoard(target, 'Format pin');
    const raw = String(files.get('/board/board.md'));
    expect(raw).toContain('\nwhiteboard:\n  schema: 1\n');
    expect(raw).not.toContain('lodestar:');
  });

  it('loadManifest is resilient to a missing file', async () => {
    const m = await loadManifest(target);
    expect(m).toEqual({});
  });
});
describe('views gain a destroy (R3-607, R-IX-5)', () => {
  it('an add-then-deleteView round-trip: the persisted board no longer lists the view', async () => {
    const view = { name: 'overview', cx: 10, cy: 20, zoom: 0.8 };
    await saveView(target, view);
    let board = await loadBoard(target);
    expect(board.views.map((v) => v.name)).toEqual(['overview']);
    await removeView(target, 'overview');
    board = await loadBoard(target);
    expect(board.views).toEqual([]);
  });

  it('removing a view that is already gone resolves — never a failure to field', async () => {
    await expect(removeView(target, 'never-saved')).resolves.not.toThrow();
  });
});
