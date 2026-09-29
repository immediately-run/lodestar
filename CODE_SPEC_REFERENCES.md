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

- **~~SDK-version skew~~ — RESOLVED (verified 2026-09-22, R3-737 review;
  re-verified 2026-09-29, R3-832):** the 2026-06 entry recorded a pin of `0.8.1`
  while others sat lower; the pin moved to `^0.17.0` and is now **exact
  `0.74.1`** — the `^0.17.0` range floor-resolved to 0.17.0 in the sandbox and
  its `waitForMount` TDZ bug broke board persistence on prod (R3-832), so the
  "no action in this repo" verdict did not survive contact; the skew class is
  otherwise fleet-maintenance debt tracked across the example repos, not here.
- **Vocabulary:** no `kernel` / `primary application` / `trust tier` in `src/`;
  uses "stage app" correctly. `main.tsx` carries no app logic/CSS.
- **`requireLatest: "optimistic"`** (the default) — appropriate; not a finding.
- **~~BUILD RED on origin/main (pre-existing, SDK-skew) — `capDir` not exported.~~**
  **RESOLVED (verified 2026-09-22, R3-737 review; re-verified 2026-09-29, R3-832):**
  the pinned SDK (now exact `0.74.1`) exports `capDir` and `npm run build` is
  green on this head — the recorded `TS2339` no longer reproduces; the entry is
  kept struck as the resolution record rather than deleted (this file is a
  ledger).
