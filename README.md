# Lodestar

An infinite-canvas collaborative board where **every canvas object is one
MDX file** in a shared space — an [immediately.run](https://immediately.run) app.
Sticky notes, prose, images, video, shapes, and live React components live on a
zoomable/pannable stage; saved camera **views** chain into guided **journeys**
that are the headline experience for anyone who opens a read-only share link
(often on a phone). There is no database and no opaque document format: a board
is a folder you can read, diff, and edit with any tool — including an agent that
has never heard of this app.

Specs live in the `immediately-run/docs` repo (`WHITEBOARD_SPEC.md` is the
anchor); this repo is the app.

## What's here today

The full canvas experience, built faithfully from the Claude Design asset bundle
and driven by an in-memory demo board (`src/data/seedBoard.ts`) that exercises
every object kind and degraded state:

- **Run mode** — pan (drag / wheel / pinch), zoom `[0.02, 8]`, grid/dots/plain
  backgrounds that track the camera, journeys list + full-screen **playback**
  (keyboard + tap-zone driven, with a reduced-motion cut).
- **Edit mode** — select / multi-select / marquee, move, resize + rotate handles,
  drag-to-connect anchors, an inspector (title, tags, note color, geometry,
  z-order, lock/hide), quick-create on double-click, delete with 10s undo.
- **The built-in component library** (`src/components/library/`) — `StickyNote`,
  prose, `Label`, `Frame`, `Shape`, `Img`, `Video`, the click-to-load `Embed`
  security surface, and the component-error chip.
- **Connections** — directed arrows / lines with auto edge anchors, midpoint
  labels, and dangling-edge warnings.
- **State screens** — board chooser, the four empty/forbidden states, and the
  concurrent-edit (LWW) + role-downgrade toasts (try the "Demo states" menu,
  bottom-left).
- **Mobile** — first-class run mode + playback; edit is select/move/inspector.

## Architecture

- `src/hooks/useLodestar.ts` — the controller: camera, store, and all
  pointer/keyboard gestures. The single seam where the persistence and change
  layers attach.
- `src/lib/` — pure helpers: `camera.ts` (projection/zoom math), `geometry.ts`
  (hit-testing, connection anchors), `types.ts` (the document model, shaped to
  the `whiteboard:` frontmatter namespace), `ids.ts`.
- `src/components/` — the canvas (`Canvas`, `ObjectFrame`, `Connections`,
  `SelectionOverlay`) and chrome (`TopBar`, `Inspector`, `JourneysPanel`,
  `Playback`, `StateScreens`, `MobileChrome`, …), wired through context.

### Not yet wired (separate, gated platform deltas)

Per the spec's dependency table (§11), these depend on capabilities in other
repos and are deliberately left as integration seams; the Share / Insert-image /
Open-source actions currently surface the task invocation as a toast:

- live space mounts + `boards.json` discovery, MDX-from-mount compilation (the
  V1 gate), `PollSource`/`WatchSource` change intake (D5);
- the `pick-file`, `share-space`, and `edit-file` task integrations (D1–D3);
- anonymous share links end to end (D4).

The `package.json` manifest declares exactly the three tasks the spec's §7
names — no capability is added ahead of a spec change.

## Open a folder *as* a whiteboard project (`open-project`)

Lodestar **provides** the `open-project` task contract (SPACES_UI_SPEC §6,
spaces-ui Phase 5). A folder declares that it is a whiteboard project with an
in-directory marker — the `immediately.run` field of its `package.json`, or a
small `immediately.run.json` at the folder root:

```jsonc
// immediately.run.json  (a whiteboard project folder)
{
  "opensWith": { "task": "open-project", "version": "1.0" },
  "kind": "whiteboard-project"
}
```

A file manager that finds that marker on a readable folder offers **"Open
project."** Choosing it invokes the `open-project` contract, delegating the
folder as a directory capability (`capDir`) — *narrowing a grant the file
manager already holds, no new authority, no consent prompt* (R-SPACES-9/11). The
host resolves the bound provider (Lodestar by default, user-overridable),
mounts the folder as a task-scoped chroot, and launches the app. On boot the
app reads `useTaskInput()`, locates that mount, loads the board from it,
and calls `completeTask({ opened: true })`. A normal launch (no task input) is
unaffected — it opens the user's durable board space as before.

A runnable demo project folder lives in `fixtures/sample-project/` (the marker
plus a `board.md` and two object files). The provider logic is in
`src/lib/openProject.ts`, wired into the controller's boot effect in
`src/hooks/useLodestar.ts`.

## Develop

```bash
npm install
npm run dev     # vite — eyeball the canvas
npm run build   # tsc -b && vite build (must pass)
npm run lint    # eslint (must pass — Fast Refresh rule is load-bearing here)
```

See `CLAUDE.md` for the immediately.run authoring rules this repo follows.
