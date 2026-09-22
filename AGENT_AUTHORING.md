# Lodestar — agent authoring (proposal)

**Status:** design note (proposal) · **Updated:** 2026-06-26
**Platform source of truth:** the immediately-run **docs** repo,
`specs/AGENT_AUTHORING_ARCHITECTURE.md` — the cross-app architecture. This note is the
**Lodestar-specific** application of it. (Grove is the sibling application; see
`grove/docs/product-defs/grove-agent-authoring.md`.)

First-class agent authoring is **aspirational** for Lodestar today (there is no agent, no
chat, no diagnostics wired). This note records the target architecture so the build order is
deliberate.

---

## Why Lodestar is the clean exemplar

Lodestar's substrate is already the shape the model wants:

- **Filesystem *is* the document.** One file per object (`objects/{id}.mdx` — YAML frontmatter
  + MDX body), a `board.md` manifest, `views/`, `journeys/`, `assets/`, in a mounted board
  space (`src/lib/boardStore.ts`). Agent-legible by construction (the README's "an agent that
  has never heard of this app" can read the MDX).
- **Minimal capabilities.** Lodestar reads/writes only its own board data; it invokes
  `pick-file` / `share-space` / `edit-file` and provides `open-project`. It never holds
  `llm:chat`, `net:fetch`, secrets, or foreign-mount authority.
- **Document and engine already separate.** The **board** lives in a mount (FS 2); Lodestar's
  **source** is its repo (FS 1). The agent authors the *document*; the engine is a fixed,
  forkable app it never touches. (This is the cleaner form of the "no engine/content
  capability border": there is no caps border — everything inline runs with Lodestar's
  minimal caps — only a *substrate* tier, document vs engine source.)

So there is little to un-build. The model lands almost verbatim; what's missing are enabling
pieces, listed as deltas below.

---

## The model, applied to Lodestar

**The agent is an externalized mini-app, not ambient in Lodestar.** Because it needs
`llm:chat`, it runs as a separate host-brokered app with its **own appKey**, under the tight
**self-authoring agent principal** — ceiling `{ chat(), diagnostics:read (subject),
render:read (subject), ipc → Lodestar }` and **nothing else** (no `net:fetch`, no secrets, no
foreign mounts, **no board write**). Its `rw` reach, when it has any, is scoped to the **board
mount** — it structurally cannot touch Lodestar's engine source.

**The agent proposes; Lodestar applies.** The agent emits semantic patches over the IPC edge;
Lodestar — which owns the object model — validates and writes:

- `patch(objectId, fieldOps)` — *set `body` of object O*; *move/resize* (geometry); *add a
  `connection`*; *retag*; *create object `{ kind, x, y, w, h, body, … }`*.
- `putAsset(path, bytes)` — an image (whole-file; no merge).

The agent never holds a board-write capability; Lodestar is the gatekeeper that validates
against the object schema and applies through the conflict chain. Lodestar writes the board
via its ordinary **rw mount grant** (the board mount today) — collaborator-gated, revocable,
not a standing app capability.

**Observe + context.** Context is re-derived from files (`board.md` + `objects/*.mdx`) plus
live IPC deltas (**selected objects, viewport rect, zoom**). Observation is subject-scoped:
`diagnostics:read` for object-body MDX compile/transpile errors (once MDX-from-mount lands), and
`render:read` — **screenshot-leaning, because a canvas is visual** — for the "does it look
right" check. The loop: read context → `chat()` → emit `patch` → Lodestar validates + merges
+ writes → host re-reads → diagnostics (± snapshot) → repeat; landing is a separate gated
`contribute`/save step.

---

## Capability-using objects: host-brokered mini-apps, composited at rest

An object that needs an elevated capability (an AI widget, a network-fetching report, a
writable foreign mount) does **not** run inline. It runs as a **host-owned mini-app sibling**,
composited over the object's rectangle — **never** a Lodestar-owned `<iframe>` (which would
put Lodestar in the mini-app's TCB; today's `embed` object does exactly this and must be
re-architected).

**Composition is one-shot, at a settled transform.** Rather than track an affine per frame as
the canvas pans/zooms/rotates, show the existing **placeholder** (the click-to-load preview
card) during motion, and overlay the live iframe **only when the camera rests** — computing the
screen rect from the existing `project(cam, vp, …)`. This sidesteps the hardest part of canvas
composition (per-frame affine tracking) and composes with "preview-until-run": the placeholder
*is* the preview. It requires a **camera-settled event**, which does not exist today
(`flyTo()` completes but fires no callback).

---

## Conflicts: the agent is just another writer

Scope is **light async collaboration**, not real-time multi-cursor (that would need a CRDT/OT
substrate and break the file-writer model). Agent patches, local direct manipulation, and a
remote collaborator all become writes to the board mount, surfaced by `onFsChange`.

> *(Superseded 2026-06-27 by `AGENT_AUTHORING_ARCHITECTURE.md` §7.2 — the field-merge, chained
> resolvers, and per-author undo below are **retired for V1**. V1 conflict is **file-level**, two
> existing mechanisms: `buffer.ts` block-on-dirty (open text) + `RemoteOverwriteEmitter`
> (closed-file/delete/binary). **Field-aware merge** (geometry last-write-per-field, `connections`
> set-union, body 3-way, `tags` set) is the **deferred V2 CRDT track** — so the "field is the unit
> of conflict" framing is a V2 property; in V1 a same-*object*-file overlap (e.g. a drag's geometry
> vs. an agent's body rewrite) is **whole-file LWW**, recoverable-post-hoc, **not** field-merged.
> **Undo is per-working-tree-timeline, not per-author** (`FILESYSTEM_SPEC §5` tracks no provenance).
> The direct-manipulation rw board writer is **not** serialized by the single-author lease — that
> lease bounds *agents*, not FS 2.)*

- **File-per-object partitions most conflict away** — two writers on different objects never
  conflict.
- ~~**Within an object, merge by field** … **Chained resolvers** … **per-author-scoped undo**~~ →
  **V1 is file-level** (`buffer.ts` open-text + `RemoteOverwriteEmitter`); field-merge/resolvers
  deferred V2; undo is per-working-tree-timeline (see the superseding note above). The durable
  terminal is git PR (git board) or detect-after-clobber (non-git); semantic staleness is caught at
  human review of the save/publish diff.

Crucially, making the agent's writes appear live needs the **same `onFsChange`-driven per-object
re-read** that multiplayer needs — build it once, it serves both.

---

## Deltas, in dependency order

1. **MDX-from-mount gate** — compile + render object bodies inline (today bodies are static
   text; the `component` kind is a stub). The enabling step for inline content-logic; safe by
   the no-standing-high-stakes-authority invariant. **This delta is not Lodestar-private:**
   it is the platform-general capability specced once in the docs repo's
   `specs/MDX_FROM_MOUNT_SPEC.md`, shared with **Grove**'s dispatched-wiki consumer. The
   Phase-0 pipeline spike (`WHITEBOARD_SPEC §11`, `MDX_FROM_MOUNT_SPEC §3`) settles the
   `Include`/`dynamicImport`-vs-runtime-`evaluate()` choice for **both** consumers at once —
   run it once, both ride it.
2. **`onFsChange`-driven per-object re-read** — live external writes (absent today). Serves both
   agent authoring and multiplayer; required for the loop to close.
3. **Re-architect `embed`/`component` → host-brokered mini-app** — move iframe ownership to the
   host; reuse the click-to-load placeholder as the preview.
4. **Camera-settled event + static-affine region composition** — overlay the live mini-app only
   at rest, via `project(cam, vp, …)`.
5. **The self-authoring agent mini-app** + observe/context contract, scoped to the board mount;
   the patch interface as the agent↔Lodestar protocol.
6. **Undo + per-object conflict handling** — benign single-user gaps become requirements once an
   agent is a concurrent writer.

**Where it fights today:** no inline content-logic until (1); the `embed` iframe-ownership is a
TCB-model violation to undo, not extend (3); no live fs resync (2); no undo/conflict model (6).
None contradicts the model — they are its build order.

---

## Open questions

1. **Patch vocabulary** — the `fieldOps` for objects (geometry, body, connections, tags) and how
   Lodestar registers its resolver + schema with the host.
2. **Camera-settled signal** — debounce on `cam` stabilizing + interaction-idle; and the
   coordinate/occlusion contract for the host overlay.
3. **Render snapshot** — screenshot vs. per-object render check; size bounds; pull cadence.
4. **Multiplayer convergence** — whether the same `onFsChange` re-read + conflict chain is the
   whole multiplayer story for light async collaboration, or a single-merge-authority is needed
   for non-git boards.

See `specs/AGENT_AUTHORING_ARCHITECTURE.md` in the docs repo for the platform-level model, the
self-authoring agent principal, and the consolidated platform deltas.
