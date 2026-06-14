# Plan — Validate the slide write-route body (remove the `z.unknown()` exception)

> **Status: NOT STARTED** (2026-06-14). Promoted from
> `PLAN_FIGURE_BUNDLE_FOLLOWUPS.md` §"Residual cleanups" item 2, which
> mischaracterised it as a trivial sentinel-removal tidy. It is neither trivial
> nor sentinel-related. Owner: **S12** (Documents & Sharing) + possibly panther.
> Conformance: `panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md` and the route-body
> rules from the (shipped) PLAN_API_ZOD work — **strip mode, never `.strict()`**.

## Goal

`createSlide` / `updateSlide` (`lib/api-routes/project/slides.ts:43,57`) still
declare `body: { slide: z.unknown() }`. Replace `z.unknown()` with the real
`slideConfigSchema`, so the slide write bodies are validated at the route
boundary like every other route (the last `z.unknown()` body exception left
after FigureBundle removed the sentinel layer).

**This is not a security hole — priority is "consistency / earlier rejection," not
"close a gap."** The DB layer already validates every write via
`slideConfigSchema.parse()` (`server/db/project/slides.ts`), so a malformed slide
is rejected today — just at the DB call, not at the boundary. The win is a 400 at
the edge + finishing the "every body is a schema" invariant.

## Why it was blocked (two real, unrelated-to-FigureBundle reasons)

The body is a `Slide` = panther's **branded** `LayoutNode<ContentBlock>` generic;
the schema infers `SlideFromSchema = z.infer<slideConfigSchema>`
(`lib/types/_slide_config.ts:161`). They don't line up:

1. **The recursive layout node can't infer the branded generic.**
   `containerLayoutNodeSchema` is annotated `z.ZodTypeAny`
   (`_slide_config.ts:73-75, 92`) precisely because a `z.lazy()` recursive schema
   cannot reproduce panther's branded `LayoutNode<ContentBlock>` type. So
   `SlideFromSchema`'s nested layout is loosely typed and `SlideFromSchema` is not
   assignable to `Slide`. This is the **compile-time** blocker.
2. **`PatternType "none"` is missing from the Zod enum.** panther's `PatternType`
   includes `"none"` (`panther/_002_pattern/types.ts`); the app's Zod enum
   (`_slide_config.ts:29-38`) omits it. So the schema would *runtime-reject* a slide
   carrying a `"none"` pattern fill. Empirically the slide UI never produces
   `"none"` (grep: zero references in `components/slide_deck/`), so this is a
   **type-completeness** gap, not an active bug — but a route-body schema must
   accept everything a valid `Slide` can hold.

## Approach

### Step 1 — close the `PatternType "none"` gap (small, low-risk, do first)
Add `"none"` to the `patternType` `z.enum` in `lib/types/_slide_config.ts`. This is
a **stored-schema** change but a *widening* one — adding a permitted value needs no
migration (existing rows still validate; the skip-gate passes) per
PROTOCOL_APP_MIGRATIONS.
- **Empirical check first** (per the debug-stored-data-empirically habit): query a
  couple of prod project DBs for any `slides.config` carrying `patternType:"none"`.
  If found, this also fixes a latent reject-bug; if not, it is pure
  type-completeness. Either way the change is safe.

### Step 2 — reconcile `SlideFromSchema` → `Slide` (the real work)
Pick one (decision for whoever implements):
- **(a) Narrow cast at the boundary (recommended).** Keep `body: z.object({ slide:
  slideConfigSchema, … })` for runtime validation, and cast the strip-parsed
  `body.slide as Slide` where it's handed to `createSlide`/`updateSlide`. Zod
  guarantees the structure at runtime; the cast only bridges the branded-generic
  compile gap. Lowest-risk, no panther change. Document the cast with a one-line
  reason.
- **(b) De-brand / align in panther.** Make `LayoutNode<ContentBlock>` inferable
  (or export a non-branded structural twin the schema can target). Cleaner types,
  but a cross-repo panther change + re-sync — heavier, and the brand exists on
  purpose. Only if (a)'s cast proves to hide real bugs.

Then swap `slide: z.unknown()` → `slide: slideConfigSchema` in both routes and
delete the `// Slide body: z.unknown() …` comment (`slides.ts:16-18`).

### Step 3 — also revisit `position`/`expectedLastUpdated`/`overwrite`
Already schema'd (`slidePositionSchema`, `z.string().optional()`,
`z.boolean().optional()`) — no change; just confirm nothing else in the two bodies
is `z.unknown()`.

## Out of scope
- Reports — **already done**: `updateReportFigures` validates via
  `reportFiguresSchema` (`lib/api-routes/project/reports.ts:69`).
- Any FigureBundle / sentinel work — finished; unrelated.

## Verification
- `deno task typecheck` green both tiers (the cast or panther change resolves the
  `SlideFromSchema`/`Slide` mismatch).
- Negative test: hand-`fetch` `createSlide` with a malformed `slide` body → **400**
  with a readable envelope `err` (not the old "reaches the DB then fails").
- Positive: create/edit/reload a real slide (incl. one with a pattern fill and an
  embedded figure) → unchanged behaviour; strip mode tolerates any extra fields the
  client sends.
- Grep `lib/api-routes` for `z.unknown()` → the slide bodies no longer appear (the
  intended end-state of PLAN_API_ZOD).
