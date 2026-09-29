// The persistence layer the design comp left as a seam (WHITEBOARD_SPEC §2.6 /
// §5.2): it reads and writes the board's `.mdx`/`.md` files through the async
// `fs` module immediately.run exposes to the sandbox (ZenFS over a MessagePort
// in production; the @immediately-run/dev-fs bridge to real disk under `vite
// dev`). The board lives under a `boardRoot` directory inside this app's per-user
// **settings** mount (`openSettings` — a private `~/.config`-style filesystem,
// baseline `settings:app`), so writes are durable and private to the signed-in
// user. (The platform's old per-app-space `openAppSpace` slot API was removed;
// settings is the per-user app-private store — each `slot` becomes a subdir.)
//
// Everything here is async and dependency-free. Mutations are "write the one
// file that changed" (one object = one file = the unit of conflict, §2.1); we
// never rewrite the whole board on an edit.

import fs from 'fs';
// Import from the `/mounts` subpath, NOT the package barrel. The barrel
// (`export * from "./tasks"`) has a top-level `addListener("task-input", …)`
// side effect that calls the host transport at module-eval time — which throws
// `no host transport` under local `vite dev` (no host) before any of our
// try/catch can run. The `/mounts` subpath pulls in only the space/mount API,
// which is side-effect-free until actually called.
import { openSettings } from '@immediately-run/sdk/mounts';
import type { SandboxMount } from '@immediately-run/sdk/mounts';
import {
  parseJourney,
  parseManifest,
  parseObject,
  parseView,
  serializeJourney,
  serializeObject,
  serializeView,
} from './mdxObject';
import type { Background, Journey, View, WObject } from './types';

export interface Board {
  objects: WObject[];
  views: View[];
  journeys: Journey[];
  /** Manifest data from `board.md` (title/background/schema), when present. */
  title?: string;
  background?: Background;
  schema?: number;
}

export interface BoardTarget {
  /** Absolute mount path the board lives under (e.g. `/spaces/{id}`). */
  root: string;
  /** Live access mode; a host role-downgrade flips this to `'ro'`. */
  mode: 'ro' | 'rw';
  /** The space id, for reacting to mount changes. */
  spaceId?: string;
}

const OBJECTS = 'objects';
const VIEWS = 'views';
const JOURNEYS = 'journeys';
const TRASH = 'objects/.trash';

function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

// Exported for boardList (R6: the path-join and the is-a-board rule have ONE
// home — here — and the chooser's enumeration imports them rather than
// re-spelling either).
export { join };

async function exists(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readDirSafe(path: string): Promise<string[]> {
  try {
    return await fs.promises.readdir(path);
  } catch {
    return [];
  }
}

// Where the board lives during local `vite dev`. There is no host transport
// locally, so `openAppSpace` can't resolve a space — but @immediately-run/dev-fs
// bridges `fs` to real disk, so we persist to a fixed root instead. It sits under
// `devfs-playground/` on purpose: that path is git-ignored and is excluded from
// Vite's HMR file watcher by default, so autosaves don't trigger a page reload.
const DEV_BOARD_ROOT = '/devfs-playground/board';

// Injected by Vite's `define` (see vite.config.ts): `true` under `vite dev`,
// `false` in a production build. immediately.run transpiles this file RAW — it
// never runs Vite — so the identifier is simply absent there and the `typeof`
// guard below reads it as falsy. We must NOT write `import.meta` in this file:
// the sandbox compiles modules to CommonJS and evaluates them as classic
// scripts, where `import.meta` is a parse-time SyntaxError ("Cannot use
// 'import.meta' outside a module"). That fails before any code runs, so a `?.`
// runtime guard can't help — the token itself has to stay out of the source.
declare const __WB_DEV__: boolean | undefined;

/**
 * Open the signed-in user's board space (the §8.6 zero-config path). Rejects
 * with a SpaceError (`.code` = `auth-required` | `cancelled` | `forbidden`)
 * when there is no session or the user declines — callers degrade to an
 * in-memory board instead of crashing (platform rule 9).
 */
export async function openBoardTarget(slot = 'default'): Promise<BoardTarget> {
  // Local `vite dev`: persist to disk via dev-fs at a fixed root, since the
  // platform space API needs a host that isn't there. On immediately.run
  // `__WB_DEV__` is absent, so this branch is skipped and the real per-user
  // space path below is used.
  if (typeof __WB_DEV__ !== 'undefined' && __WB_DEV__) {
    return { root: `${DEV_BOARD_ROOT}/${slot}`, mode: 'rw' };
  }
  // The per-user settings mount is a single filesystem; namespace each board
  // under a `slot` subdir (same shape as the `__WB_DEV__` branch above).
  const mount: SandboxMount = await openSettings();
  return { root: `${mount.path}/${slot}`, mode: mount.mode === 'ro' ? 'ro' : 'rw', spaceId: mount.id };
}

/** True once the space has a board materialised (an `objects/` dir). */
export async function boardExists(t: BoardTarget): Promise<boolean> {
  return exists(join(t.root, OBJECTS));
}

export interface BoardTargetFailure {
  /** The platform error's machine code (`'unknown'` when it carries none). */
  code: string;
  /** True only for `auth-required` — the one failure signing in fixes. */
  auth: boolean;
  /** Toast copy for the degrade-to-memory path. */
  copy: string;
}

/**
 * Classify an `openBoardTarget` rejection for the degrade-to-memory path, and
 * log it WITH its code — a bare catch here hides the root cause of a signed-in
 * user losing persistence. Only `auth-required` is a sign-in problem (R3: the
 * catch must discriminate); any other code is a platform failure the user
 * cannot fix by signing in, so the toast says what happened instead.
 */
export function classifyBoardTargetFailure(e: unknown): BoardTargetFailure {
  const code = (e as { code?: string } | null)?.code ?? 'unknown';
  console.warn(`[lodestar] openBoardTarget failed · ${code}`, e);
  return {
    code,
    auth: code === 'auth-required',
    copy:
      code === 'auth-required'
        ? 'Working in memory — sign in to save your board.'
        : `Working in memory — couldn't open your board · ${code}`,
  };
}

/** Read every object/view/journey file from the target into the document model,
 *  plus the `board.md` manifest (title/background/schema) when present. */
export async function loadBoard(t: BoardTarget): Promise<Board> {
  const objFiles = (await readDirSafe(join(t.root, OBJECTS))).filter((f) => f.endsWith('.mdx'));
  const objects = await Promise.all(
    objFiles.map(async (f) => parseObject(f.replace(/\.mdx$/, ''), await fs.promises.readFile(join(t.root, OBJECTS, f), 'utf8'))),
  );
  const viewFiles = (await readDirSafe(join(t.root, VIEWS))).filter((f) => f.endsWith('.md'));
  const views = await Promise.all(
    viewFiles.map(async (f) => parseView(f.replace(/\.md$/, ''), await fs.promises.readFile(join(t.root, VIEWS, f), 'utf8'))),
  );
  const jrnFiles = (await readDirSafe(join(t.root, JOURNEYS))).filter((f) => f.endsWith('.md'));
  const journeys = await Promise.all(
    jrnFiles.map(async (f) => parseJourney(f.replace(/\.md$/, ''), await fs.promises.readFile(join(t.root, JOURNEYS, f), 'utf8'))),
  );
  const m = await loadManifest(t);
  return { objects, views, journeys, ...m };
}

/**
 * Read the board's `board.md` manifest (spec §2.4). Returns an empty object when
 * the manifest is absent or unparseable — callers fall back to their defaults,
 * never throw (R-SPACES-11 degrade-never-throw).
 */
export async function loadManifest(t: BoardTarget): Promise<Partial<Board>> {
  const path = join(t.root, BOARD_MANIFEST);
  try {
    return parseManifest(await fs.promises.readFile(path, 'utf8'));
  } catch {
    return {};
  }
}

/** Materialise a fresh board from seed data (first run on an empty space). */
export async function seedBoard(t: BoardTarget, board: Board): Promise<void> {
  await fs.promises.mkdir(join(t.root, OBJECTS), { recursive: true });
  await fs.promises.mkdir(join(t.root, VIEWS), { recursive: true });
  await fs.promises.mkdir(join(t.root, JOURNEYS), { recursive: true });
  await Promise.all([
    ...board.objects.map((o) => saveObject(t, o)),
    ...board.views.map((v) => saveView(t, v)),
    ...board.journeys.map((j) => saveJourney(t, j)),
  ]);
}

export async function saveObject(t: BoardTarget, o: WObject): Promise<void> {
  await fs.promises.mkdir(join(t.root, OBJECTS), { recursive: true });
  await fs.promises.writeFile(join(t.root, OBJECTS, `${o.id}.mdx`), serializeObject(o), 'utf8');
}

/** Delete = rename into `objects/.trash/` so the 10s undo can rename it back (§4.2). */
export async function trashObject(t: BoardTarget, id: string): Promise<void> {
  await fs.promises.mkdir(join(t.root, TRASH), { recursive: true });
  await fs.promises.rename(join(t.root, OBJECTS, `${id}.mdx`), join(t.root, TRASH, `${id}.mdx`));
}

export async function restoreObject(t: BoardTarget, id: string): Promise<void> {
  await fs.promises.rename(join(t.root, TRASH, `${id}.mdx`), join(t.root, OBJECTS, `${id}.mdx`));
}

export async function saveView(t: BoardTarget, v: View): Promise<void> {
  await fs.promises.mkdir(join(t.root, VIEWS), { recursive: true });
  await fs.promises.writeFile(join(t.root, VIEWS, `${v.name}.md`), serializeView(v), 'utf8');
}

/** Remove a view's file (R3-607: a thing creatable on the surface has a destroy
 *  on it). `force` so removing an already-absent file is a no-op, never a
 *  failure the caller has to field. */
export async function removeView(t: BoardTarget, name: string): Promise<void> {
  await fs.promises.rm(join(t.root, VIEWS, `${name}.md`), { force: true });
}

export async function saveJourney(t: BoardTarget, j: Journey): Promise<void> {
  await fs.promises.mkdir(join(t.root, JOURNEYS), { recursive: true });
  await fs.promises.writeFile(join(t.root, JOURNEYS, `${j.id}.md`), serializeJourney(j), 'utf8');
}

const ASSETS = 'assets';
const BOARD_MANIFEST = 'board.md';

/** A folder is a board when it carries a `board.md` manifest (spec §6.1). */
export async function folderIsBoard(t: BoardTarget): Promise<boolean> {
  return exists(join(t.root, BOARD_MANIFEST));
}

/**
 * Copy a file the user picked (path RELATIVE to the board's space root) into the
 * board's `assets/`, returning the assets-relative name to reference as
 * `<Img src="assets/<name>" />` (spec §4.2 — boards stay self-contained). A file
 * that already lives under `assets/` is referenced in place (no copy). The name
 * is de-duped so an insert never clobbers an existing asset.
 */
export async function copyIntoAssets(t: BoardTarget, srcRel: string): Promise<string> {
  if (srcRel.startsWith(`${ASSETS}/`)) return srcRel.slice(ASSETS.length + 1);
  const base = srcRel.split('/').pop() || 'asset';
  await fs.promises.mkdir(join(t.root, ASSETS), { recursive: true });
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let name = base;
  for (let n = 1; await exists(join(t.root, ASSETS, name)); n += 1) name = `${stem}-${n}${ext}`;
  // Binary-safe: no encoding arg → a Buffer/Uint8Array round-trip.
  const data = await fs.promises.readFile(join(t.root, srcRel));
  await fs.promises.writeFile(join(t.root, ASSETS, name), data);
  return name;
}

/**
 * Scaffold a brand-new board in an (empty) folder: the `board.md` manifest plus
 * the `objects/`/`views/`/`journeys/` dirs (spec §6.1 New board). Idempotent —
 * writing into a folder that already has a board just rewrites the manifest.
 */
export async function writeNewBoard(t: BoardTarget, title: string): Promise<void> {
  await fs.promises.mkdir(join(t.root, OBJECTS), { recursive: true });
  await fs.promises.mkdir(join(t.root, VIEWS), { recursive: true });
  await fs.promises.mkdir(join(t.root, JOURNEYS), { recursive: true });
  // The emitted shape agrees with the model: background is a bare kind. The old
  // `{ kind: grid, size: 24 }` object form is still ACCEPTED by the reader (the
  // corpus may carry it) but is no longer emitted — size is not yet honoured
  // (R3-401 settles the writer/model agreement by dropping it).
  const manifest = ['---', `title: ${title}`, 'whiteboard:', '  schema: 1', '  background: grid', '---', ''].join('\n');
  await fs.promises.writeFile(join(t.root, BOARD_MANIFEST), manifest, 'utf8');
}
