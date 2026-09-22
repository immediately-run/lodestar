// Thin wrapper over the `pick-file` task (PICK_FILE_TASK_SPEC) — the platform's
// general open/save dialog, which Lodestar invokes for Open/New board and
// Insert image (spec §6.1, §4.2). The picker NAVIGATES authority; it never grants
// it: we hand it directory roots WE already hold (a `capDir` of the board space),
// and it returns a `(root, relPath)` PATH that we then touch under our OWN grant.
//
// The `@immediately-run/sdk` barrel runs a module-eval side effect (the task-input
// listener) that throws under local `vite dev` without a host — so, exactly like
// `boardStore`, we LAZY-import it inside each call. That keeps the app loading in
// `vite dev`; a real pick reaches the transport only when invoked (host present).
import type { BoardTarget } from './boardStore';

export type PickMode = 'open-file' | 'open-folder' | 'save-file';

export interface PickFileResult {
  root: number;
  relPath: string;
  created?: boolean;
}

export interface PickFileParams {
  mode: PickMode;
  roots: unknown[]; // capDir/capFile markers — opaque to us
  rootLabels?: string[];
  rootModes?: ('ro' | 'rw')[];
  title?: string;
  filters?: { label: string; extensions: string[] }[];
  defaultName?: string;
  allowCreateFolder?: boolean;
}

/**
 * Caller-side defense in depth (spec §1.3): the callee (picker) is untrusted, so
 * we re-validate its `relPath` before mapping it onto our own mount — never a
 * traversal, backslash, leading slash, or NUL. Returns the path, or null to
 * reject. (The host already enforces this in `validateResult`; this is a belt.)
 */
export function safeRel(rel: unknown): string | null {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  if (rel.includes('\0') || rel.includes('\\') || rel.startsWith('/')) return null;
  if (rel.split('/').some((seg) => seg === '..')) return null;
  return rel;
}

/** Invoke the picker. Returns null on user cancel; rethrows other coded errors. */
export async function pickFile(params: PickFileParams): Promise<PickFileResult | null> {
  const { invokeTask } = await import('@immediately-run/sdk');
  try {
    return await invokeTask<PickFileResult>('pick-file', params as unknown as Record<string, unknown>);
  } catch (e) {
    if ((e as { code?: string })?.code === 'cancelled') return null;
    throw e;
  }
}

/** A directory cap for a board's whole space — the picker's single root. We can
 *  only delegate what we hold, so the picker sees exactly this space and no more. */
export async function boardSpaceRoot(target: BoardTarget): Promise<unknown> {
  const { capDir } = await import('@immediately-run/sdk');
  const mountId = target.spaceId ? `space:${target.spaceId}` : target.root;
  return capDir({ mountId, relPath: '' }, { mode: target.mode });
}

/** Ask the host powerbox to grant a NEW space (the §2 composition — granting is
 *  the host's job, never the picker's). Returns the new mount, or null on cancel. */
export async function requestSpace(): Promise<{ path: string; id: string; mode: 'ro' | 'rw' } | null> {
  const { requestMount } = await import('@immediately-run/sdk');
  try {
    const m = await requestMount();
    return { path: m.path, id: m.id ?? m.path, mode: m.mode === 'ro' ? 'ro' : 'rw' };
  } catch (e) {
    if ((e as { code?: string })?.code === 'cancelled') return null;
    throw e;
  }
}
