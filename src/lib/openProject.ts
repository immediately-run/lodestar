// Provider side of the `open-project` task (SPACES_UI_SPEC §6, Phase 5
// `05-capdir-open-with.md`). A file manager that finds an `opensWith`
// marker on a whiteboard-project folder invokes the `open-project` contract,
// handing the folder over as a directory capability (`capDir`). The host
// resolves THIS app as the bound provider, mints a task-scoped chroot rooted at
// that folder, and launches us with the folder already mounted. Here we read
// the task input, locate that chroot among our mounts, and hand back a
// `BoardTarget` the controller loads the board from — then `completeTask`.
//
// Like `boardStore`/`pickFile`, the `@immediately-run/sdk` task module runs a
// module-eval side effect (the `task-input` listener) that throws `no host
// transport` under local `vite dev` (no host). So every entry point here is
// async and LAZY-imports the SDK, and the whole feature is gated off under
// `__WB_DEV__` (there is no host to deliver a task input locally anyway).

import type { SandboxMount } from '@immediately-run/sdk/mounts';
import type { BoardTarget } from './boardStore';

/** The contract this app provides; the marker a project folder declares. */
export const OPEN_PROJECT_TASK = 'open-project';
export const OPEN_PROJECT_VERSION = '1.0';

/** Injected by Vite `define` (see vite.config.ts): truthy under `vite dev`,
 *  absent in a production build. Never write `import.meta` — it is a parse-time
 *  SyntaxError in the immediately.run sandbox (CLAUDE.md rule 9). */
declare const __WB_DEV__: boolean | undefined;

const isDev = (): boolean => typeof __WB_DEV__ !== 'undefined' && !!__WB_DEV__;

/**
 * Read the task input we were launched with, IF we are running as the
 * `open-project` provider. The host REWRITES the caller's `capDir` into a
 * concrete chroot PATH STRING before delivering it (`/task/<slot>/dir`) — the
 * same way `pick-file` delivers its `roots` as path strings, not cap objects —
 * so the param is a string we read the board off of, not a `{ $cap }` object.
 * Returns that path, or null for a normal launch (no task input / a different
 * task / a malformed param — all degrade silently, never throw, R-SPACES-11).
 * Never reached under `vite dev` (no host to deliver a task input).
 */
export async function readOpenProjectInput(): Promise<string | null> {
  if (isDev()) return null;
  let input: { task: string; params: Record<string, unknown> } | null;
  try {
    const { getTaskInput } = await import('@immediately-run/sdk');
    input = getTaskInput();
  } catch {
    // No host transport (or the module threw): we are not a task callee.
    return null;
  }
  if (!input || input.task !== OPEN_PROJECT_TASK) return null;
  const dir = input.params?.dir;
  return typeof dir === 'string' && dir.length > 0 ? dir : null;
}

/**
 * The dispatched corpus mount (R3-831, REPO_CONTENT_DISPATCH_SPEC §3): with no
 * task input, the host mounts the repo a URL load dispatched to us as our
 * corpus and MARKS it `type: 'content'` — the loaded repo IS the project the
 * URL opened (its marker named `open-project`; the host resolved us as the
 * bound viewer). Returns that mount, or null on an ordinary launch (no corpus,
 * or no host runtime yet — the caller guards the read). Keyed on the host's
 * mark, never on "the only foreign mount": the user's own spaces are foreign
 * to us too, and that guess would open the wrong board the moment a space is
 * held.
 */
export function corpusMount(mounts: SandboxMount[]): SandboxMount | null {
  return mounts.find((m) => m.type === 'content') ?? null;
}

/** The corpus poll's named bound (R3-831): the SDK's mount mirror populates
 *  from the host's mount-add re-announcement asynchronously relative to the
 *  app's boot effect, so the corpus is read as a bounded poll, not a one-shot
 *  (a one-shot intermittently missed it and booted the demo board, found live
 *  on the venue, 2026-10-03). Named once, with the interval, so the tests'
 *  settle waits derive from it instead of hard-coding a headroom over a
 *  private literal. An ordinary launch pays at most this window before the
 *  durable path opens — no signal distinguishes it from a dispatched boot
 *  whose corpus has not been mirrored yet, so the window is the price of not
 *  intermittently ignoring the URL's project. */
export const CORPUS_POLL_TRIES = 20;
export const CORPUS_POLL_INTERVAL_MS = 50;

/**
 * Read the corpus mount as a bounded poll (R3-831): the first read, then one
 * read per interval until a `type: 'content'` mount appears or the bound
 * runs out. `isCancelled` (the boot effect's cleanup contract) stops the poll
 * early — an unmounted chain never reaches the durable path on its behalf.
 * `read` is the mounts read (getMounts); it may throw under no host runtime,
 * which the caller catches.
 */
export async function pollForCorpusMount(
  read: () => SandboxMount[],
  isCancelled: () => boolean,
): Promise<SandboxMount | null> {
  let mount = corpusMount(read());
  for (let tries = 0; !mount && tries < CORPUS_POLL_TRIES; tries += 1) {
    await new Promise((r) => setTimeout(r, CORPUS_POLL_INTERVAL_MS));
    if (isCancelled()) return null;
    mount = corpusMount(read());
  }
  return mount;
}

/**
 * Find the chroot the host mounted for the delegated directory. The host mints
 * the delegation mount AT the rewritten path the `dir` param carries, so the
 * mount whose `path` equals `dirPath` IS our board root — an exact match, no id
 * heuristic. Returns null if it hasn't been announced yet (the caller retries on
 * `onMountsChange`).
 */
export function resolveDelegatedMount(
  dirPath: string,
  mounts: SandboxMount[],
): SandboxMount | null {
  return mounts.find((m) => m.path === dirPath) ?? null;
}

/** Turn the resolved delegated mount into a board target. The mount is already
 *  chroot'd at the project folder, so its `path` is the board root; the effective
 *  mode is whatever the host granted on the chroot — already attenuated host-side
 *  to the narrower of the caller's request and the underlying grant. */
export function dirCapToBoardTarget(mount: SandboxMount): BoardTarget {
  const mode: 'ro' | 'rw' = mount.mode === 'ro' ? 'ro' : 'rw';
  return { root: mount.path, mode, spaceId: mount.id };
}

/** Tell the caller we opened the project (or couldn't). Lazy-imports the SDK and
 *  swallows the no-host case so a stray call under `vite dev` never throws. */
export async function reportOpened(opened: boolean): Promise<void> {
  if (isDev()) return;
  try {
    const { completeTask } = await import('@immediately-run/sdk');
    completeTask({ opened });
  } catch {
    // No host transport: nothing to report to.
  }
}

/** Abort the task (e.g. the delegated folder never resolved to a mount). */
export async function abortOpenProject(): Promise<void> {
  if (isDev()) return;
  try {
    const { cancelTask } = await import('@immediately-run/sdk');
    cancelTask();
  } catch {
    // No host transport.
  }
}
