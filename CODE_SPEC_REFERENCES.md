# CODE_SPEC_REFERENCES — Lodestar

Durable index of **non-trivial** code↔spec mappings. Seeded by the 2026-06
code-verification pass (R3-124; plan `08-system-apps.md`). Most Lodestar
spec-refs are trivial inline `spec §N` comments (the bare `spec §N` convention =
`WHITEBOARD_SPEC §N`, which lives in the whiteboard-app docs subdir, not the main
`docs/specs/` checkout). This file records only the non-obvious mappings.

## The `import.meta` ban ↔ `__WB_DEV__` define (CLAUDE.md hard-rule #9)

**Why non-obvious:** immediately.run transpiles each module to CommonJS and runs
it as a classic script, where `import.meta` is a **parse-time `SyntaxError`**
("Cannot use 'import.meta' outside a module") — it fails before any code runs, so
a `?.` runtime guard cannot save it. Vite replaces `import.meta` at build time, so
it looks fine in `vite dev` and only breaks on immediately.run.

**Mapping (verified 2026-06 — correctly implemented; DO NOT reintroduce
`import.meta`):**
- `vite.config.ts` — `define: { __WB_DEV__: ... }` injects a dev-only flag.
- `src/lib/boardStore.ts` — reads it behind a `typeof __WB_DEV__ !== 'undefined'`
  guard (declares `__WB_DEV__: boolean | undefined`). No file in `src/` writes the
  `import.meta` token (only comments mention it).

## The three-task invoke surface

**Spec:** `WHITEBOARD_SPEC` (+ `PICK_FILE_TASK_SPEC`). core_concepts §6 (Service)
/ §5 (display-in-a-region capability). `package.json` declares
`invokes: pick-file, share-space, edit-file`.

**Mapping (verified 2026-06):**
- **pick-file** — fully wired: `src/lib/pickFile.ts` calls
  `invokeTask<PickFileResult>('pick-file', …)`, returns `null` on `cancelled`
  (callers degrade with `if (!res) return`). This is the live, complete path.
- **share-space** / **edit-file** — declared as `invokes` and surfaced as **toast
  placeholders** today (`TopBar.tsx` / `MobileChrome.tsx` for share-space;
  `Inspector.tsx` for edit-file "Open source"). They degrade rather than crash
  when the task is absent (core_concepts invariant: "expect absence"). Recorded as
  **partial / placeholder**, not a Done-but-absent gap — the manifest correctly
  declares intent and the UI handles absence.

---

## Recorded findings (code-verification pass, 2026-06)

- **SDK-version skew (record only, do NOT bump):** Lodestar pins
  `@immediately-run/sdk` at **`0.8.1`** (others on `0.2.8`; file-explorer
  `0.11.0`; agent-demo `^0.12.0`). Fleet maintenance debt; coordinated bump is a
  separate gated change.
- **Vocabulary:** no `kernel` / `primary application` / `trust tier` in `src/`;
  uses "stage app" correctly. `main.tsx` carries no app logic/CSS.
- **`requireLatest: "optimistic"`** (the default) — appropriate; not a finding.
- **BUILD RED on origin/main (pre-existing, SDK-skew) — `capDir` not exported.**
  `src/lib/pickFile.ts:59` uses `capDir` from `@immediately-run/sdk`, which the
  pinned `0.8.1` does not export → `npm run build` fails `TS2339` on a clean
  origin/main checkout. **Not introduced by this pass** (record-only `.md` added;
  `npm run lint` green). Same SDK-version-skew class as file-explorer's `chat`
  import — resolves with a coordinated SDK bump (out of scope for verify/record).
