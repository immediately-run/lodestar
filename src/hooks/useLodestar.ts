// Lodestar's single source of truth: camera, objects, selection, and all
// pointer/keyboard gesture logic. Ported from the design comp's controller into
// one hook so the presentational components stay thin. Geometry gestures write
// "once, on gesture end" (spec §5.1); here the write is an in-memory mutation +
// a saved-toast, the seam where the persistence layer (§2.6 round-trip discipline)
// will attach once the change layer lands.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cameraForTarget,
  clampZoom,
  originX,
  originY,
  project,
  worldAt,
  zoomAround,
} from '../lib/camera';
import type { Viewport } from '../lib/camera';
import { anchorPoint, objectAtLocal, objectsInRect } from '../lib/geometry';
import { generateId } from '../lib/ids';
import type {
  Background,
  Camera,
  Connection,
  Journey,
  Mode,
  ObjectKind,
  ScreenKind,
  Toast,
  View,
  ViewTarget,
  WObject,
} from '../lib/types';
import { BOARD, SEED_JOURNEYS, SEED_VIEWS, seedObjects } from '../data/seedBoard';
import {
  boardExists,
  classifyBoardTargetFailure,
  copyIntoAssets,
  folderIsBoard,
  loadBoard,
  openBoardTarget,
  removeView,
  restoreObject,
  saveJourney as persistJourney,
  saveObject,
  saveView as persistView,
  seedBoard,
  trashObject,
  writeNewBoard,
} from '../lib/boardStore';
import type { BoardTarget } from '../lib/boardStore';
import { boardSpaceRoot, pickFile, requestSpace, safeRel } from '../lib/pickFile';
// Subpath import, not the package barrel: the barrel re-exports `./tasks`,
// whose top-level `addListener` side effect throws `no host transport` at
// module-eval time under local `vite dev`. `/mounts` is side-effect-free.
import { getMounts, onMountsChange } from '@immediately-run/sdk/mounts';
import type { SandboxMount } from '@immediately-run/sdk/mounts';
import {
  abortOpenProject,
  dirCapToBoardTarget,
  pollForCorpusMount,
  readOpenProjectInput,
  reportOpened,
  resolveDelegatedMount,
} from '../lib/openProject';

/** Join a mount root with a (validated, relative) path; collapse double slashes. */
const subPath = (root: string, rel: string): string => `${root}/${rel}`.replace(/\/+/g, '/');

/** Short ` · code` suffix from a typed platform/fs error, for toast text. */
function codeOf(e: unknown): string {
  const c = (e as { code?: string } | null)?.code;
  return c ? ` · ${c}` : '';
}

interface WBState {
  mode: Mode;
  light: boolean;
  bg: Background;
  title: string;
  cam: Camera;
  vp: Viewport;
  objects: WObject[];
  views: View[];
  journeys: Journey[];
  selection: string[];
  hover: string | null;
  marquee: { x: number; y: number; w: number; h: number } | null;
  connectPreview: { from: string; x: number; y: number; target: string | null } | null;
  /** Keyboard connect mode (R3-607): the source object, and the cursor object
   *  arrows walk as the connect target. Null when not connecting. */
  connectFrom: string | null;
  connectCursor: string | null;
  inspectorOpen: boolean;
  panelOpen: boolean;
  quickMenu: { lx: number; ly: number; wx: number; wy: number } | null;
  journey: { jid: string; idx: number } | null;
  toasts: Toast[];
  screen: ScreenKind;
  demoMenuOpen: boolean;
  panning: boolean;
  reduced: boolean;
  /** The named busy state of the one long-running pick flow (R-IX-2): the
   *  confirming control shows this label and aria-busy until it settles. */
  busy: null | 'insert-image' | 'new-board' | 'open-board';
  /** Live mounts, mirrored from the host (the board chooser lists these). */
  mounts: SandboxMount[];
}

type Drag =
  | { type: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { type: 'move'; sx: number; sy: number; ids: string[]; orig: Record<string, { x: number; y: number }>; moved: boolean }
  | { type: 'marquee'; sx: number; sy: number; add: boolean; base: string[] }
  | { type: 'connect'; from: string; side: string; moved: boolean }
  | { type: 'resize'; kind: string; sx: number; sy: number; o: { x: number; y: number; w: number; h: number; rot: number }; id: string; moved: boolean }
  | { type: 'rotate'; sx: number; sy: number; o: { x: number; y: number; w: number; h: number; rot: number }; id: string; moved: boolean }
  | null;

const initialViewport = (): Viewport => ({
  vw: typeof window !== 'undefined' ? window.innerWidth : 1440,
  vh: typeof window !== 'undefined' ? window.innerHeight : 900,
  vleft: 0,
  vtop: 0,
});

/** The ONE spelling of selection semantics (R3-607, R6): given the current
 *  selection and an id, the next selection for a replace- or toggle-click /
 *  focus. Pure, so the pointer path and the keyboard path cannot drift. */
export function applySelection(sel: string[], id: string, additive: boolean): string[] {
  if (additive) return sel.includes(id) ? sel.filter((x) => x !== id) : sel.concat(id);
  return sel.includes(id) ? sel : [id];
}

const MOBILE_BREAKPOINT = 720;

// The board-manifest schema version THIS reader understands. A manifest carrying
// a higher `schema:` is from a newer reader — recognised but marked readonly (the
// `readonly` degraded state, spec §2.4) rather than mis-rendered (R3-401).
const SUPPORTED_SCHEMA = 1;

// The usable height a journey-playing rect view fits into: the caption + controls
// take roughly the bottom 240px of an 844px phone viewport (item R3-400), so a
// fitted view must clear that band or the subject hides under the chrome.
const JOURNEY_FIT_INSET = 240;

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** The ONE spelling of what each named busy state says on its control
 *  (R-IX-2 / R6): every surface that names a wait reads this map — coupled
 *  surfaces cannot drift apart on a reword. */
export const BUSY_LABELS = {
  'insert-image': 'Adding image…',
  'new-board': 'Creating board…',
  'open-board': 'Opening board…',
} as const;

export function useLodestar() {
  // The canvas element arrives via a callback ref (a function, not a ref object
  // read during render) so the listener effect re-runs once it mounts.
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const registerCanvas = useCallback((el: HTMLDivElement | null) => setCanvasEl(el), []);
  const dragRef = useRef<Drag>(null);
  const tweenRef = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const spaceRef = useRef(false);
  const toastSeq = useRef(0);
  // Stable indirection for the dwell auto-advance: `goStep` schedules
  // `playNextRef.current()` so the timer always calls the LATEST playNext
  // (assigned after its useCallback is defined) — breaks the circular dep.
  const playNextRef = useRef<() => void>(() => {});

  const [state, setState] = useState<WBState>(() => ({
    mode: 'run',
    light: false,
    bg: BOARD.background,
    title: BOARD.title,
    cam: { cx: 250, cy: 150, zoom: 0.6 },
    vp: initialViewport(),
    objects: seedObjects(),
    views: SEED_VIEWS.slice(),
    journeys: SEED_JOURNEYS,
    selection: [],
    hover: null,
    marquee: null,
    connectPreview: null,
    connectFrom: null,
    connectCursor: null,
    inspectorOpen: false,
    panelOpen: false,
    quickMenu: null,
    journey: null,
    toasts: [],
    screen: null,
    demoMenuOpen: false,
    panning: false,
    reduced: prefersReducedMotion(),
    busy: null,
    mounts: [],
  }));

  // Mirror committed state so the document-level handlers branch on fresh values.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const update = useCallback(
    (patch: Partial<WBState> | ((s: WBState) => Partial<WBState>)) =>
      setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })),
    [],
  );

  const isMobile = useCallback(() => state.vp.vw < MOBILE_BREAKPOINT, [state.vp.vw]);

  // ---- camera helpers (read latest viewport from the ref) ----
  const localPoint = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const vp = stateRef.current.vp;
    return [e.clientX - vp.vleft, e.clientY - vp.vtop];
  }, []);

  const setZoom = useCallback((nz: number, lx?: number, ly?: number) => {
    update((s) => ({ cam: zoomAround(s.cam, s.vp, nz, lx, ly) }));
  }, [update]);

  // ---- toasts ----
  const dismissToast = useCallback((id: number) => {
    update((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, [update]);

  const toast = useCallback(
    (text: string, icon = 'check', opts: Partial<Toast> = {}) => {
      const id = ++toastSeq.current;
      const t: Toast = { id, text, icon, ...opts };
      update((s) => ({ toasts: s.toasts.concat(t) }));
      const ttl = opts.actionLabel ? 9000 : 3500;
      setTimeout(() => dismissToast(id), ttl);
    },
    [update, dismissToast],
  );

  // ---- persistence (the §2.6 round-trip seam, now live) ----
  // The board's durable target (a per-user app space) once resolved; null means
  // we never got one (signed out / declined) and the board is in memory only.
  const boardRef = useRef<BoardTarget | null>(null);
  // Per-object debounce timers so inspector typing / arrow nudges autosave once
  // they settle, not on every keystroke.
  const saveTimers = useRef<Map<string, number>>(new Map());

  // Write the given objects' files, then report with one toast. With no board
  // the change is in memory only (we keep the optimistic message); a read-only
  // board reports instead of silently dropping the write.
  const commitSave = useCallback(
    (objs: WObject[], savedText: string, savedIcon = 'check') => {
      const t = boardRef.current;
      if (!t) {
        toast(savedText, savedIcon);
        return;
      }
      if (t.mode === 'ro') {
        toast('Read-only board · change not saved', 'lock', { iconColor: 'var(--ink-2)' });
        return;
      }
      Promise.all(objs.map((o) => saveObject(t, o))).then(
        () => toast(savedText, savedIcon),
        (e) => toast(`Save failed${codeOf(e)}`, 'alert', { iconColor: '#caa24a' }),
      );
    },
    [toast],
  );

  // Quiet debounced autosave for continuous edits (typing, arrow-key nudges).
  const scheduleSave = useCallback((ids: string[]) => {
    const t = boardRef.current;
    if (!t || t.mode === 'ro') return;
    for (const id of ids) {
      const prev = saveTimers.current.get(id);
      if (prev) clearTimeout(prev);
      const handle = window.setTimeout(() => {
        saveTimers.current.delete(id);
        const o = stateRef.current.objects.find((x) => x.id === id);
        if (o) saveObject(t, o).catch(() => undefined);
      }, 500);
      saveTimers.current.set(id, handle);
    }
  }, []);

  // ---- camera animation ----
  const flyTo = useCallback(
    (target: ViewTarget | null, dur?: number, fitH?: number) => {
      if (!target) return;
      // A view carrying a rect names a REGION, not a magnification: fit it to the
      // usable viewport (R3-400). fitH (when given) is the usable height — the
      // caption band during journey playback — so the subject clears the chrome.
      const dest = cameraForTarget(target, stateRef.current.vp.vw, fitH ?? stateRef.current.vp.vh);
      if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
      if (stateRef.current.reduced || !dur) {
        update({ cam: dest });
        return;
      }
      const from = { ...stateRef.current.cam };
      const t0 = performance.now();
      const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = ease(p);
        update({
          cam: {
            cx: from.cx + (dest.cx - from.cx) * e,
            cy: from.cy + (dest.cy - from.cy) * e,
            zoom: from.zoom + (dest.zoom - from.zoom) * e,
          },
        });
        if (p < 1) tweenRef.current = requestAnimationFrame(step);
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [update],
  );

  // ---- views & journeys ----
  const resolveView = useCallback((v: ViewTarget | string) => {
    if (typeof v === 'string') return stateRef.current.views.find((x) => x.name === v) ?? null;
    const t: ViewTarget = { cx: v.cx, cy: v.cy, zoom: v.zoom };
    if (v.w) t.w = v.w;
    if (v.h) t.h = v.h;
    return t;
  }, []);

  const saveView = useCallback(() => {
    const s = stateRef.current;
    const view: View = { name: `view-${s.views.length + 1}`, cx: s.cam.cx, cy: s.cam.cy, zoom: s.cam.zoom };
    update((st) => ({ views: st.views.concat([view]) }));
    const text = `Saved views/${view.name}.md`;
    const t = boardRef.current;
    if (!t) {
      toast(text, 'save');
      return;
    }
    if (t.mode === 'ro') {
      toast('Read-only board · view not saved', 'lock', { iconColor: 'var(--ink-2)' });
      return;
    }
    persistView(t, view).then(
      () => toast(text, 'save'),
      (e) => toast(`Couldn't save view${codeOf(e)}`, 'alert', { iconColor: '#caa24a' }),
    );
  }, [update, toast]);

  /** Remove a view on the surface that creates them (R3-607, R-IX-5). A
   *  read-only board refuses BEFORE anything drops (the row never vanishes
   *  into a refusal); on writable boards the drop is optimistic and a failed
   *  file removal rolls the view back in. */
  const deleteView = useCallback(
    (name: string) => {
      const t = boardRef.current;
      const view = stateRef.current.views.find((v) => v.name === name);
      if (!view) return;
      if (t && t.mode === 'ro') {
        toast('Read-only board · view not removed', 'lock', { iconColor: 'var(--ink-2)' });
        return;
      }
      update((s) => ({ views: s.views.filter((v) => v.name !== name) }));
      if (!t) {
        toast(`Removed views/${name}.md`, 'trash');
        return;
      }
      removeView(t, name).then(
        () => toast(`Removed views/${name}.md`, 'trash'),
        (e) => {
          // Roll the optimistic drop back — the file survived, so must the row.
          update((s) => (s.views.some((v) => v.name === name) ? {} : { views: s.views.concat([view]) }));
          toast(`Couldn't remove view${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
        },
      );
    },
    [update, toast],
  );

  const addJourneyStep = useCallback(
    (jid: string) => {
      const s = stateRef.current;
      const j = s.journeys.find((x) => x.id === jid);
      if (!j) return;
      const next: Journey = { ...j, steps: j.steps.concat([{ view: { cx: s.cam.cx, cy: s.cam.cy, zoom: s.cam.zoom } }]) };
      update((st) => ({ journeys: st.journeys.map((x) => (x.id === jid ? next : x)) }));
      const text = `Added step ${next.steps.length} to ${j.title} · saved to ${j.id}.mdx`;
      const t = boardRef.current;
      if (!t) {
        toast(text, 'plus');
        return;
      }
      if (t.mode === 'ro') {
        toast('Read-only board · step not saved', 'lock', { iconColor: 'var(--ink-2)' });
        return;
      }
      persistJourney(t, next).then(
        () => toast(text, 'plus'),
        (e) => toast(`Couldn't save journey${codeOf(e)}`, 'alert', { iconColor: '#caa24a' }),
      );
    },
    [update, toast],
  );

  const goStep = useCallback(
    (j: Journey, idx: number, instant?: boolean) => {
      const s = j.steps[idx];
      const v = resolveView(s.view);
      if (v) flyTo(v, instant ? 0 : s.duration ?? 800, stateRef.current.vp.vh - JOURNEY_FIT_INSET);
      // Dwell (R3-402): a step carrying `hold` pauses that long after arriving,
      // then AUTO-advances. Cleared by any viewer control (next/prev/seek/exit).
      // Under prefers-reduced-motion the journey stays input-driven — matching
      // flyTo's cut of the tween — so a viewer is never advanced unprompted.
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      if (s.hold && !stateRef.current.reduced) {
        holdTimer.current = window.setTimeout(() => playNextRef.current(), s.hold);
      }
    },
    [resolveView, flyTo],
  );

  const playJourney = useCallback(
    (jid: string) => {
      const j = stateRef.current.journeys.find((x) => x.id === jid);
      if (!j) return;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      update({ journey: { jid, idx: 0 }, panelOpen: false, inspectorOpen: false });
      goStep(j, 0, true);
    },
    [update, goStep],
  );

  const playExit = useCallback(() => {
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    update({ journey: null });
  }, [update]);

  const playNext = useCallback(() => {
    const jr = stateRef.current.journey;
    if (!jr) return;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    const j = stateRef.current.journeys.find((x) => x.id === jr.jid);
    if (!j) return;
    const ni = jr.idx + 1;
    if (ni >= j.steps.length) {
      playExit();
      return;
    }
    update({ journey: { ...jr, idx: ni } });
    goStep(j, ni);
  }, [update, goStep, playExit]);
  // Keep the dwell timer's indirection pointed at the current playNext.
  playNextRef.current = playNext;

  const playPrev = useCallback(() => {
    const jr = stateRef.current.journey;
    if (!jr) return;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    const j = stateRef.current.journeys.find((x) => x.id === jr.jid);
    if (!j) return;
    const ni = Math.max(0, jr.idx - 1);
    update({ journey: { ...jr, idx: ni } });
    goStep(j, ni);
  }, [update, goStep]);

  const playSeek = useCallback(
    (idx: number) => {
      const jr = stateRef.current.journey;
      if (!jr) return;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      const j = stateRef.current.journeys.find((x) => x.id === jr.jid);
      if (!j) return;
      update({ journey: { ...jr, idx } });
      goStep(j, idx);
    },
    [update, goStep],
  );

  // ---- mutations ----
  const patchSel = useCallback(
    (patch: Partial<WObject>) => {
      update((s) => ({ objects: s.objects.map((o) => (s.selection.includes(o.id) ? { ...o, ...patch } : o)) }));
      scheduleSave(stateRef.current.selection);
    },
    [update, scheduleSave],
  );

  // ---- selection: one action for pointer and keyboard (R3-607) ----
  const select = useCallback(
    (id: string, additive = false) => {
      update((s) => ({
        selection: applySelection(s.selection, id, additive),
        inspectorOpen: true,
        quickMenu: null,
      }));
    },
    [update],
  );

  /** Close the quick-create menu (its Escape/blur path, R3-607). */
  const closeQuickMenu = useCallback(() => update({ quickMenu: null }), [update]);

  const deleteSelection = useCallback(() => {
    const sel = stateRef.current.selection.slice();
    if (!sel.length) return;
    const removed = stateRef.current.objects.filter((o) => sel.includes(o.id));
    update((s) => ({ objects: s.objects.filter((o) => !sel.includes(o.id)), selection: [] }));
    // Delete is a rename into objects/.trash/ with a 10s undo (spec §4.2).
    const t = boardRef.current;
    if (t && t.mode !== 'ro') {
      Promise.all(sel.map((id) => trashObject(t, id))).catch((e) =>
        toast(`Delete failed${codeOf(e)}`, 'alert', { iconColor: '#caa24a' }),
      );
    }
    toast(`${sel.length > 1 ? `${sel.length} objects` : 'Object'} moved to .trash`, 'trash', {
      actionLabel: 'Undo',
      onAction: () => {
        update((s) => ({ objects: s.objects.concat(removed) }));
        if (t && t.mode !== 'ro') {
          Promise.all(removed.map((o) => restoreObject(t, o.id))).catch(() => undefined);
        }
      },
    });
  }, [update, toast]);

  const createObject = useCallback(
    (kind: ObjectKind, wx: number, wy: number) => {
      const o: WObject = {
        id: generateId(kind === 'note' ? 'note' : kind),
        kind,
        x: wx - 100,
        y: wy - 74,
        w: 200,
        h: 148,
        rot: 0,
        scale: 1,
        z: 3,
        connections: [],
      };
      if (kind === 'note') {
        o.color = 'lemon';
        o.title = 'New note';
      } else if (kind === 'prose') {
        o.title = 'Prose';
        o.body = 'Write here…';
        o.w = 260;
        o.h = 160;
      } else if (kind === 'label') {
        o.title = 'Label';
        o.w = 320;
        o.h = 80;
        o.z = 1;
      } else if (kind === 'shape') {
        o.shape = 'rect';
        o.title = '';
        o.w = 200;
        o.h = 140;
      } else if (kind === 'frame') {
        o.title = 'Frame';
        o.w = 360;
        o.h = 300;
        o.z = 1;
      } else if (kind === 'img') {
        o.loaded = false;
        o.title = 'Image';
      } else if (kind === 'component') {
        o.title = '<Component/>';
      }
      update((s) => ({
        objects: s.objects.concat(o),
        selection: [o.id],
        quickMenu: null,
        inspectorOpen: true,
        mode: 'edit',
      }));
      commitSave([o], `Created objects/${o.id}.mdx`, 'plus');
    },
    [update, commitSave],
  );

  // ── pick-file flows (spec §6.1 Open/New board, §4.2 Insert image) ──────────
  // Each invokes the platform picker over a `capDir` of the board's space (the
  // only authority we hold), then maps the returned `(root, relPath)` PATH back
  // onto our OWN mount — re-validating it first (defense in depth, §1.3).

  /** Insert an image: pick a file, copy it into the board's `assets/`, drop an
   *  <Img> object at the world point. Self-contained per §4.2. The pick is
   *  named-busy on the confirming control until it settles (R-IX-2). */
  const insertImage = useCallback(
    async (wx: number, wy: number) => {
      const target = boardRef.current;
      if (!target) {
        toast('Sign in to insert images into your board.', 'save', { iconColor: 'var(--ink-2)' });
        return;
      }
      update({ busy: 'insert-image' });
      try {
        const res = await pickFile({
          mode: 'open-file',
          roots: [await boardSpaceRoot(target)],
          rootLabels: ['This board’s space'],
          rootModes: [target.mode],
          title: 'Insert image',
          filters: [
            { label: 'Images', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'] },
            { label: 'All files', extensions: [] },
          ],
        });
        if (!res) return; // cancelled — no toast spam
        const rel = safeRel(res.relPath);
        if (!rel) {
          toast('That file can’t be inserted.', 'alert', { iconColor: '#caa24a' });
          return;
        }
        const name = await copyIntoAssets(target, rel);
        const o: WObject = {
          id: generateId('img'),
          kind: 'img',
          x: wx - 130,
          y: wy - 90,
          w: 260,
          h: 180,
          rot: 0,
          scale: 1,
          z: 3,
          title: name,
          body: `<Img src="assets/${name}" />`,
          loaded: true,
          connections: [],
        };
        update((s) => ({
          objects: s.objects.concat(o),
          selection: [o.id],
          quickMenu: null,
          inspectorOpen: true,
          mode: 'edit',
          screen: null,
        }));
        commitSave([o], `Inserted assets/${name}`, 'image');
      } catch (e) {
        toast(`Couldn’t insert image${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
      } finally {
        update({ busy: null });
      }
    },
    [toast, update, commitSave],
  );

  /** Re-point the active board to `target` and hydrate the canvas from it. */
  const loadBoardInto = useCallback(
    async (target: BoardTarget) => {
      const board = await loadBoard(target);
      boardRef.current = target;
      // The board.md manifest names the board (spec §2.4) — a board is a folder
      // that can state its own name; fall back to the seed only when absent.
      // A manifest schema newer than this reader marks the board readonly (the
      // `readonly` degraded state), unless the mount itself is already ro.
      const readonly = target.mode === 'ro' || (typeof board.schema === 'number' && board.schema > SUPPORTED_SCHEMA);
      update({
        objects: board.objects,
        views: board.views.length ? board.views : SEED_VIEWS.slice(),
        journeys: board.journeys.length ? board.journeys : SEED_JOURNEYS,
        bg: board.background ?? stateRef.current.bg,
        title: board.title ?? stateRef.current.title,
        mode: readonly ? 'run' : stateRef.current.mode,
        selection: [],
        // A keyboard connect armed against the previous board must not survive
        // the swap (R3-607 review): its source id is stale the moment objects
        // are replaced.
        connectFrom: null,
        connectCursor: null,
        inspectorOpen: false,
        screen: null,
      });
    },
    [update],
  );

  /** Open an existing board folder in `space`: pick a folder, require a board.md,
   *  then load it as the active board. Named-busy while the pick is out. */
  const openBoardIn = useCallback(
    async (space: BoardTarget) => {
      update({ busy: 'open-board' });
      try {
        const res = await pickFile({
          mode: 'open-folder',
          roots: [await boardSpaceRoot(space)],
          rootLabels: ['Your board space'],
          rootModes: [space.mode],
          title: 'Open board',
        });
        if (!res) return;
        const rel = safeRel(res.relPath);
        if (!rel) {
          toast('That folder can’t be opened.', 'alert', { iconColor: '#caa24a' });
          return;
        }
        const candidate: BoardTarget = { root: subPath(space.root, rel), mode: space.mode, spaceId: space.spaceId };
        if (!(await folderIsBoard(candidate)) && !(await boardExists(candidate))) {
          toast('That folder isn’t a board (no board.md). Open folder again to pick another.', 'alert', {
            iconColor: '#caa24a',
          });
          return;
        }
        await loadBoardInto(candidate);
        toast('Board opened.', 'check');
      } catch (e) {
        toast(`Couldn’t open board${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
      } finally {
        update({ busy: null });
      }
    },
    [toast, update, loadBoardInto],
  );

  /** Open a SPECIFIC board directory directly (the chooser's rows, R3-607):
   *  no picker — the caller already knows the folder (it listed it). Loads
   *  through the same `loadBoardInto` every open path funnels into. */
  const openBoardAt = useCallback(
    async (target: BoardTarget) => {
      update({ busy: 'open-board' });
      try {
        await loadBoardInto(target);
        toast('Board opened.', 'check');
      } catch (e) {
        toast(`Couldn’t open board${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
      } finally {
        update({ busy: null });
      }
    },
    [toast, update, loadBoardInto],
  );

  /** New board: pick (or create) a folder in `space`, scaffold board.md, open it.
   *  Named-busy while the pick is out. */
  const newBoardIn = useCallback(
    async (space: BoardTarget) => {
      if (space.mode === 'ro') {
        toast('That space is read-only — you can’t create a board there.', 'lock', { iconColor: 'var(--ink-2)' });
        return;
      }
      update({ busy: 'new-board' });
      try {
        const res = await pickFile({
          mode: 'open-folder',
          roots: [await boardSpaceRoot(space)],
          rootLabels: ['Your board space'],
          rootModes: [space.mode],
          title: 'New board · choose a folder',
          allowCreateFolder: true,
        });
        if (!res) return;
        const rel = safeRel(res.relPath);
        if (!rel) {
          toast('That folder can’t be used.', 'alert', { iconColor: '#caa24a' });
          return;
        }
        const candidate: BoardTarget = { root: subPath(space.root, rel), mode: 'rw', spaceId: space.spaceId };
        const title = rel.split('/').pop() || 'Untitled board';
        await writeNewBoard(candidate, title);
        await loadBoardInto(candidate);
        toast('Board created.', 'check');
      } catch (e) {
        toast(`Couldn’t create board${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
      } finally {
        update({ busy: null });
      }
    },
    [toast, update, loadBoardInto],
  );

  /** Open / new board against the CURRENT board space (the chooser's footer). */
  const openBoard = useCallback(() => {
    const space = boardRef.current;
    if (!space) {
      toast('Sign in to open a board from your space.', 'save', { iconColor: 'var(--ink-2)' });
      return;
    }
    void openBoardIn(space);
  }, [toast, openBoardIn]);

  const newBoard = useCallback(() => {
    const space = boardRef.current;
    if (!space) {
      toast('Sign in to create a board in your space.', 'save', { iconColor: 'var(--ink-2)' });
      return;
    }
    void newBoardIn(space);
  }, [toast, newBoardIn]);

  /** "Add a space": the host powerbox grants a NEW space (never this app, §2),
   *  then we offer to open a board in it. */
  const addSpace = useCallback(async () => {
    try {
      const granted = await requestSpace();
      if (!granted) return; // cancelled
      const space: BoardTarget = { root: granted.path, mode: granted.mode, spaceId: granted.id };
      await openBoardIn(space);
    } catch (e) {
      toast(`Couldn’t add a space${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
    }
  }, [toast, openBoardIn]);

  const patchObject = useCallback(
    (id: string, patch: Partial<WObject>) => {
      update((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
      scheduleSave([id]);
    },
    [update, scheduleSave],
  );

  const addConnection = useCallback(
    (from: string, to: string) => {
      const c: Connection = { to, kind: 'arrow', style: { stroke: 'accent', dash: false } };
      const src = stateRef.current.objects.find((o) => o.id === from);
      const updated = src ? { ...src, connections: src.connections.concat(c) } : null;
      update((s) => ({ objects: s.objects.map((o) => (o.id === from ? { ...o, connections: o.connections.concat(c) } : o)) }));
      if (updated) commitSave([updated], `Connected ${from} → ${to}`);
    },
    [update, commitSave],
  );

  // ---- keyboard connect (the non-drag path to an edge, R3-607 / 2.5.7) ----
  /** Enter connect-from on the selected object; the cursor starts on the first
   *  other object in stacking order. Arrows then walk the cursor (the overlay
   *  draws it), Enter commits through the same addConnection the drag calls,
   *  Escape cancels. */
  const beginConnect = useCallback(() => {
    const s = stateRef.current;
    if (s.selection.length !== 1) return;
    const from = s.selection[0];
    const order = s.objects.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).map((o) => o.id).filter((id) => id !== from);
    update({ connectFrom: from, connectCursor: order[0] ?? null, inspectorOpen: false });
  }, [update]);

  const endConnect = useCallback(
    (commit: boolean) => {
      const s = stateRef.current;
      if (!s.connectFrom) return;
      if (commit && s.connectCursor) addConnection(s.connectFrom, s.connectCursor);
      update({ connectFrom: null, connectCursor: null });
    },
    [update, addConnection],
  );

  const moveConnectCursor = useCallback(
    (dir: -1 | 1) => {
      update((s) => {
        if (!s.connectFrom) return {};
        const order = s.objects.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).map((o) => o.id).filter((id) => id !== s.connectFrom);
        if (!order.length) return {};
        const idx = order.indexOf(s.connectCursor ?? order[0]);
        return { connectCursor: order[(idx + dir + order.length) % order.length] };
      });
    },
    [update],
  );

  // ---- pointer gestures ----
  const onCanvasDown = useCallback(
    (e: React.PointerEvent) => {
      const s = stateRef.current;
      if (s.quickMenu) update({ quickMenu: null });
      if (s.demoMenuOpen) update({ demoMenuOpen: false });
      const mid = e.button === 1;
      if (s.mode === 'edit' && !spaceRef.current && !mid && !isMobile()) {
        const [lx, ly] = localPoint(e);
        if (!e.shiftKey) update({ selection: [] });
        dragRef.current = { type: 'marquee', sx: lx, sy: ly, add: e.shiftKey, base: s.selection.slice() };
        update({ marquee: { x: lx, y: ly, w: 0, h: 0 } });
      } else {
        dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: s.cam.cx, cy: s.cam.cy };
        update({ panning: true });
      }
    },
    [update, isMobile, localPoint],
  );

  const objPointerDown = useCallback(
    (id: string, e: React.PointerEvent) => {
      e.stopPropagation();
      const s = stateRef.current;
      if (s.mode !== 'edit') {
        dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: s.cam.cx, cy: s.cam.cy };
        update({ panning: true });
        return;
      }
      const o = s.objects.find((x) => x.id === id);
      if (!o) return;
      // One spelling of selection for pointer and keyboard alike (R3-607).
      const sel = applySelection(s.selection, id, e.shiftKey);
      update({ selection: sel, inspectorOpen: true, quickMenu: null });
      if (o.locked) return;
      const orig: Record<string, { x: number; y: number }> = {};
      s.objects.forEach((x) => {
        if (sel.includes(x.id)) orig[x.id] = { x: x.x, y: x.y };
      });
      dragRef.current = { type: 'move', sx: e.clientX, sy: e.clientY, ids: sel, orig, moved: false };
    },
    [update],
  );

  const startHandle = useCallback((kind: 'resize' | 'rotate', handle: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const s = stateRef.current;
    const id = s.selection[0];
    const o = s.objects.find((x) => x.id === id);
    if (!o) return;
    const base = { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot };
    dragRef.current =
      kind === 'rotate'
        ? { type: 'rotate', sx: e.clientX, sy: e.clientY, o: base, id, moved: false }
        : { type: 'resize', kind: handle, sx: e.clientX, sy: e.clientY, o: base, id, moved: false };
  }, []);

  const startConnect = useCallback(
    (id: string, side: string, e: React.PointerEvent) => {
      e.stopPropagation();
      dragRef.current = { type: 'connect', from: id, side, moved: false };
      const [lx, ly] = localPoint(e);
      update({ connectPreview: { from: id, x: lx, y: ly, target: null } });
    },
    [update, localPoint],
  );

  const setHover = useCallback((id: string | null) => update({ hover: id }), [update]);
  const clearSelection = useCallback(() => update({ selection: [] }), [update]);

  // ---- mode / view controls ----
  const setRun = useCallback(
    // Leaving edit disarms a keyboard connect too (its cursor lives on the
    // edit surface) — connectFrom surviving into run mode would own the
    // arrows of a mode that has no selection (R3-607 review).
    () => update({ mode: 'run', selection: [], inspectorOpen: false, quickMenu: null, connectPreview: null, connectFrom: null, connectCursor: null }),
    [update],
  );
  const setEdit = useCallback(() => update({ mode: 'edit' }), [update]);
  const toggleTheme = useCallback(() => update((s) => ({ light: !s.light })), [update]);
  const togglePanel = useCallback(() => update((s) => ({ panelOpen: !s.panelOpen })), [update]);
  const setScreen = useCallback((screen: ScreenKind) => update({ screen }), [update]);
  const setBackground = useCallback((bg: Background) => update({ bg }), [update]);
  const setLight = useCallback((light: boolean) => update({ light }), [update]);
  const closeInspector = useCallback(() => update({ inspectorOpen: false }), [update]);
  const closePanel = useCallback(() => update({ panelOpen: false }), [update]);
  const toggleDemoMenu = useCallback(() => update((s) => ({ demoMenuOpen: !s.demoMenuOpen })), [update]);

  const onCanvasDblClick = useCallback(
    (e: React.MouseEvent) => {
      if (stateRef.current.mode !== 'edit') return;
      const [lx, ly] = localPoint(e);
      const [wx, wy] = worldAt(stateRef.current.cam, stateRef.current.vp, lx, ly);
      update({ quickMenu: { lx, ly, wx, wy } });
    },
    [update, localPoint],
  );

  // ---- demo scenarios (the design's "demo states" menu) ----
  const demoLWW = useCallback(() => {
    toast('Note was changed by @dana while you edited — their version kept.', 'alert', {
      iconColor: '#caa24a',
      actionLabel: 'Keep mine',
      onAction: () => toast('Your version restored', 'check'),
    });
  }, [toast]);

  const demoDowngrade = useCallback(() => {
    update({ mode: 'run', selection: [], inspectorOpen: false });
    toast('Your access changed to read-only. Edit mode closed.', 'lock', { iconColor: 'var(--ink-2)' });
  }, [update, toast]);

  // ---- effects: measurement + global listeners ----
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.light ? 'light' : 'dark');
  }, [state.light]);

  useEffect(() => {
    const el = canvasEl;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      update({ vp: { vw: r.width, vh: r.height, vleft: r.left, vtop: r.top } });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [lx, ly] = localPoint(e);
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.01);
        setZoom(stateRef.current.cam.zoom * f, lx, ly);
      } else {
        update((s) => ({ cam: { cx: s.cam.cx + e.deltaX / s.cam.zoom, cy: s.cam.cy + e.deltaY / s.cam.zoom, zoom: s.cam.zoom } }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z = stateRef.current.cam.zoom;
      if (d.type === 'pan') {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        update({ cam: { cx: d.cx - dx / z, cy: d.cy - dy / z, zoom: z } });
      } else if (d.type === 'move') {
        const dx = (e.clientX - d.sx) / z;
        const dy = (e.clientY - d.sy) / z;
        d.moved = true;
        update((s) => ({
          objects: s.objects.map((o) =>
            d.ids.includes(o.id) && d.orig[o.id] ? { ...o, x: d.orig[o.id].x + dx, y: d.orig[o.id].y + dy } : o,
          ),
        }));
      } else if (d.type === 'marquee') {
        const [lx, ly] = localPoint(e);
        const x = Math.min(lx, d.sx);
        const y = Math.min(ly, d.sy);
        const w = Math.abs(lx - d.sx);
        const hh = Math.abs(ly - d.sy);
        const s = stateRef.current;
        const sel = objectsInRect(s.objects, s.cam, s.vp, x, y, w, hh);
        update({ marquee: { x, y, w, h: hh }, selection: d.add ? Array.from(new Set(d.base.concat(sel))) : sel });
      } else if (d.type === 'connect') {
        const [lx, ly] = localPoint(e);
        const s = stateRef.current;
        const tgt = objectAtLocal(s.objects, s.cam, s.vp, lx, ly, d.from);
        update({ connectPreview: { from: d.from, x: lx, y: ly, target: tgt } });
      } else if (d.type === 'resize' || d.type === 'rotate') {
        applyHandle(d, e);
      }
    };

    const applyHandle = (d: Extract<Drag, { type: 'resize' | 'rotate' }>, e: PointerEvent) => {
      const s = stateRef.current;
      const z = s.cam.zoom;
      const dx = (e.clientX - d.sx) / z;
      const dy = (e.clientY - d.sy) / z;
      d.moved = true;
      update((st) => ({
        objects: st.objects.map((o) => {
          if (o.id !== d.id) return o;
          if (d.type === 'rotate') {
            const cx = d.o.x + d.o.w / 2;
            const cy = d.o.y + d.o.h / 2;
            const [lx, ly] = localPoint(e);
            const [wx, wy] = worldAt(s.cam, s.vp, lx, ly);
            let ang = (Math.atan2(wy - cy, wx - cx) * 180) / Math.PI + 90;
            if (e.shiftKey) ang = Math.round(ang / 15) * 15;
            return { ...o, rot: Math.round(ang) };
          }
          let x = d.o.x;
          let y = d.o.y;
          let w = d.o.w;
          let hh = d.o.h;
          const k = d.kind;
          if (k.includes('e')) w = Math.max(60, d.o.w + dx);
          if (k.includes('s')) hh = Math.max(48, d.o.h + dy);
          if (k.includes('w')) {
            w = Math.max(60, d.o.w - dx);
            x = d.o.x + (d.o.w - w);
          }
          if (k.includes('n')) {
            hh = Math.max(48, d.o.h - dy);
            y = d.o.y + (d.o.h - hh);
          }
          return { ...o, x, y, w, h: hh };
        }),
      }));
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) {
        if (stateRef.current.panning) update({ panning: false });
        return;
      }
      if (d.type === 'pan') {
        update({ panning: false });
      } else if (d.type === 'move' && d.moved) {
        const moved = stateRef.current.objects.filter((o) => d.ids.includes(o.id));
        commitSave(moved, `Moved · saved to ${d.ids.length > 1 ? `${d.ids.length} files` : `${d.ids[0]}.mdx`}`);
      } else if (d.type === 'marquee') {
        update({ marquee: null });
      } else if (d.type === 'connect') {
        const [lx, ly] = localPoint(e);
        const s = stateRef.current;
        const tgt = objectAtLocal(s.objects, s.cam, s.vp, lx, ly, d.from);
        if (tgt) addConnection(d.from, tgt);
        update({ connectPreview: null });
      } else if ((d.type === 'resize' || d.type === 'rotate') && d.moved) {
        const o = stateRef.current.objects.find((x) => x.id === d.id);
        commitSave(o ? [o] : [], 'Resized · saved');
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const s = stateRef.current;
      if (s.journey) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          playNext();
        } else if (e.key === 'ArrowLeft') {
          playPrev();
        } else if (e.key === 'Escape') {
          playExit();
        }
        return;
      }
      // Keyboard connect owns the arrows while it is armed (R3-607): arrows
      // walk the target cursor, Enter commits, Escape cancels — never nudging
      // or deleting underneath a live connect.
      if (s.connectFrom) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          moveConnectCursor(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          moveConnectCursor(1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          endConnect(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          endConnect(false);
        }
        return;
      }
      if (e.key === 'Escape') update({ selection: [], quickMenu: null, screen: null });
      if (e.key === ' ') spaceRef.current = true;
      if (s.mode === 'edit' && s.selection.length) {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;
        if (dx || dy) {
          e.preventDefault();
          const sel = s.selection;
          update((st) => ({ objects: st.objects.map((o) => (sel.includes(o.id) && !o.locked ? { ...o, x: o.x + dx, y: o.y + dy } : o)) }));
          scheduleSave(sel);
        }
        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
    };
    // The listeners read the latest state via stateRef, so they install once
    // the canvas mounts; the action callbacks they close over are all stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEl]);

  /**
   * Provider side of `open-project` (SPACES_UI_SPEC §6): given the delegated
   * `capDir`, find the chroot the host mounted for it, hydrate the canvas from
   * it, and arm the durable-board machinery (autosave, downgrade watch) against
   * it. Resolves true once the board is shown, false if the delegated folder
   * never resolved to a mount (the caller then aborts the task). The folder is
   * expected to already be a board (the marker only lives on board folders); an
   * empty one is seeded so the canvas still renders.
   */
  const openDelegatedProject = useCallback(
    async (dirPath: string): Promise<boolean> => {
      // The host announces the task chroot as a mount AT the delegated path; it
      // may not be present the instant we read the input, so poll briefly (a few
      // frames) for the mount whose `path` matches.
      let mount = resolveDelegatedMount(dirPath, getMounts());
      for (let tries = 0; !mount && tries < 40; tries += 1) {
        await new Promise((r) => setTimeout(r, 50));
        mount = resolveDelegatedMount(dirPath, getMounts());
      }
      if (!mount) {
        toast('Couldn’t open that project — the folder isn’t available.', 'alert', { iconColor: '#caa24a' });
        return false;
      }
      const target = dirCapToBoardTarget(mount);
      try {
        if (await boardExists(target)) {
          await loadBoardInto(target);
        } else {
          // The marker said this is a project folder but it has no objects yet:
          // seed it so the user lands on a usable board, not a blank canvas.
          boardRef.current = target;
          const s = stateRef.current;
          await seedBoard(target, { objects: s.objects, views: s.views, journeys: s.journeys });
        }
        toast('Project opened.', 'check');
        return true;
      } catch (e) {
        toast(`Couldn’t open project${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
        return false;
      }
    },
    [toast, loadBoardInto],
  );

  // ---- open the durable board space, hydrate (or seed), watch for downgrades ----
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const timers = saveTimers.current;
    (async () => {
      // ── open-project provider path (SPACES_UI_SPEC §6, Phase 5) ───────────
      // If a file manager launched us via the `open-project` task, it handed a
      // `capDir` for the project folder; the host mounted that folder as a
      // chroot. Load the board from it and complete the task, then arm the same
      // downgrade watch below against the delegated mount. A normal launch (no
      // task input) falls through to the durable-board path unchanged.
      let delegated = false;
      const dir = await readOpenProjectInput();
      if (dir) {
        const opened = await openDelegatedProject(dir);
        if (opened) await reportOpened(true);
        else await abortOpenProject();
        if (cancelled) return;
        // On success the canvas is chrooted at the project; skip the durable
        // board space. On failure, fall through to the in-memory seed so the
        // canvas still renders something rather than a blank app.
        delegated = opened;
      }

      // ── URL-dispatch path (R3-831, REPO_CONTENT_DISPATCH_SPEC §3) ─────────
      // A cold URL load into a repo whose marker names `open-project`
      // dispatches to us as the bound viewer with NO task input: the host
      // mounts the loaded repo as our corpus, marked `type: 'content'`. That
      // mount IS the project the URL opened — load the board from it BEFORE
      // the durable path, so a dispatched project shows its own board, not
      // the demo seed. Chrooted as mounted (ro as dispatched): saving follows
      // whatever the corpus grant allows, like any board target. A corpus
      // with no board files, or a failed load, falls through to the durable
      // path unchanged.
      //
      // The read is a bounded poll (`pollForCorpusMount`, the sibling of the
      // delegated mount's poll above): the SDK's mount mirror populates from
      // the host's mount-add re-announcement asynchronously relative to this
      // effect, and a one-shot read intermittently missed the corpus and
      // booted the demo board instead (found live on the venue, 2026-10-03).
      if (!delegated) {
        let corpus: SandboxMount | null = null;
        try {
          corpus = await pollForCorpusMount(getMounts, () => cancelled);
        } catch {
          // No host runtime (local vite dev): no corpus; the durable path answers.
        }
        if (corpus) {
          const target = dirCapToBoardTarget(corpus);
          try {
            if (await boardExists(target)) {
              await loadBoardInto(target);
              if (!cancelled) toast('Project opened.', 'check');
              delegated = true;
            }
          } catch (e) {
            if (!cancelled) toast(`Couldn’t open project${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
          }
        }
      }
      // A cancelled chain (the component unmounted mid-poll, or a corpus load
      // settled after unmount) stops here: the durable path below would open
      // the user's board space and toast into an unmounted canvas.
      if (cancelled) return;

      if (!delegated) {
        let target: BoardTarget;
        try {
          // Auto-open the signed-in user's board space. Declined / signed-out
          // rejects with a typed SpaceError — we degrade to the in-memory seed.
          target = await openBoardTarget();
        } catch (e) {
          // Only `auth-required` is a sign-in problem; anything else is logged
          // with its code and reported as the platform failure it is.
          const failure = classifyBoardTargetFailure(e);
          if (!cancelled)
            toast(
              failure.copy,
              failure.auth ? 'save' : 'alert',
              failure.auth ? { iconColor: 'var(--ink-2)' } : { iconColor: '#caa24a' },
            );
          return;
        }
        if (cancelled) return;
        boardRef.current = target;
        try {
          if (await boardExists(target)) {
            const board = await loadBoard(target);
            if (!cancelled) {
              update({
                objects: board.objects,
                views: board.views.length ? board.views : SEED_VIEWS.slice(),
                journeys: board.journeys.length ? board.journeys : SEED_JOURNEYS,
              });
              toast('Board loaded from your space.', 'check');
            }
          } else {
            // First run on an empty space: persist the seed demo as the starting board.
            const s = stateRef.current;
            await seedBoard(target, { objects: s.objects, views: s.views, journeys: s.journeys });
            if (!cancelled) toast('Board created in your space.', 'check');
          }
        } catch (e) {
          if (!cancelled) toast(`Couldn't open board${codeOf(e)}`, 'alert', { iconColor: '#caa24a' });
        }
      }
      if (cancelled) return;
      // Mirror the live mounts into state (the board chooser lists these,
      // R3-607) alongside the downgrade watch below.
      try {
        update({ mounts: getMounts() });
      } catch {
        // No host runtime yet — the list stays empty and the chooser degrades.
      }
      // A live role-downgrade re-announces the mount as `ro`; removal tears it down.
      // The mount service needs the host runtime, which is absent under local
      // `vite dev` — there the board is a static on-disk dir with no role changes,
      // so skip the subscription rather than crash.
      try {
        unsub = onMountsChange((mounts, removed) => {
          update({ mounts });
          const cur = boardRef.current;
          if (!cur) return;
          const m = mounts.find((x) => (cur.spaceId ? x.id === cur.spaceId : x.path === cur.root));
          if (m) {
            const mode = m.mode === 'ro' ? 'ro' : 'rw';
            if (mode !== cur.mode) {
              boardRef.current = { ...cur, mode };
              if (mode === 'ro') {
                update({ mode: 'run', selection: [], inspectorOpen: false });
                toast('Your access changed to read-only.', 'lock', { iconColor: 'var(--ink-2)' });
              }
            }
          } else if (removed.some((r) => (cur.spaceId ? r.id === cur.spaceId : r.path === cur.root))) {
            boardRef.current = null;
            toast('Board space disconnected.', 'alert', { iconColor: 'var(--ink-2)' });
          }
        });
      } catch {
        // No host runtime (local `vite dev`): no live mount updates to track.
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
      for (const h of timers.values()) clearTimeout(h);
      timers.clear();
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };
    // Runs once on mount; reads live state via stateRef and stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    registerCanvas,
    boardRoot: boardRef.current?.root ?? null,
    isMobile,
    // camera
    originX: (vw: number) => originX(state.cam, vw),
    originY: (vh: number) => originY(state.cam, vh),
    project: (wx: number, wy: number) => project(state.cam, state.vp, wx, wy),
    setZoom,
    clampZoom,
    flyTo,
    anchorPoint,
    // gestures
    onCanvasDown,
    onCanvasDblClick,
    objPointerDown,
    startHandle,
    startConnect,
    setHover,
    clearSelection,
    select,
    closeQuickMenu,
    // keyboard connect (the non-drag path)
    beginConnect,
    endConnect,
    moveConnectCursor,
    // mutations
    patchSel,
    patchObject,
    deleteSelection,
    createObject,
    // pick-file flows
    insertImage,
    openBoard,
    openBoardAt,
    newBoard,
    newBoardIn,
    openBoardIn,
    addSpace,
    // views & journeys
    saveView,
    deleteView,
    addJourneyStep,
    resolveView,
    playJourney,
    playNext,
    playPrev,
    playExit,
    playSeek,
    // mode / chrome
    setRun,
    setEdit,
    toggleTheme,
    togglePanel,
    closeInspector,
    closePanel,
    setBackground,
    setLight,
    setScreen,
    toggleDemoMenu,
    // toasts + demo
    toast,
    dismissToast,
    demoLWW,
    demoDowngrade,
  };
}
