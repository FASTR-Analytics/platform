# Plan: Declared format source — one truth, no inference

## The design

Every metric's `formatAs` becomes a three-way declaration, authored in
`wb-fastr-modules`:

```ts
formatAs: "percent" | "number" | "indicator"
```

- **`"percent"` / `"number"`** — the metric's values are the metric's own
  quantity. The format is a constant. Nothing is inferred, nowhere, ever: the
  editor's percent-only controls, the axis, the legend, the table cells, the
  AI text all use the declared format unconditionally.
- **`"indicator"`** — the metric's values ARE the displayed indicator's own
  quantity, so format is a per-value fact carried by the indicator catalog
  (`indicatorMetadata.format_as`). Every surface that formats a value (table
  cell, tooltip, data label) formats it by that value's indicator. A shared
  axis uses the displayed indicators' format when they all agree; when they
  mix, it is numeric (and the percent-only controls don't apply). That's the
  whole rule.

This replaces the previous design (metric format + displayed-indicator
inference + `ALWAYS_OBEY_METRIC_FORMAT_METRICS` escape list). That design
existed only because `"number"` was overloaded to mean both "number" and "my
format is per-indicator, go look". Every defect the adversarial review found
in the inference layer (old plan's F1, F2, F6, F8, and the R1/R2 rulings)
was compensation for that missing declaration. With the declaration:

- F1 (percent metric demoted to number) is impossible — m10-02 declares
  `percent`, that's the answer.
- R1 (floor vs bidirectional) dissolves — there is never a competition
  between metric and indicators; exactly one of them owns the format.
- `ALWAYS_OBEY_METRIC_FORMAT_METRICS` is deleted — m9-02-01 declares
  `number`, that's the answer.
- Editor/render divergence (F2) shrinks to `"indicator"` metrics only, where
  the render side has per-row truth anyway.
- Per-cell table formatting becomes principled: per-cell iff
  `formatAs === "indicator"`. (This also fixes a latent pre-existing bug:
  m10-02 don't-know-rate tables per-cell-formatted count-question cells as
  numbers even though every value is a rate.)

## Metric classification (modules repo)

`"indicator"` — the value is the indicator's own quantity:

| metric | today | why |
| --- | --- | --- |
| m10-01-01, m10-01-02 | `number` | HFA indicator values (percent for binary, number for counts — `getHfaIndicatorMeasure`) |
| m10-03-01, m10-03-02 | `number` | same values, by variant item |
| m8-01-01 | `percent` | scorecard over calculated indicators, which carry required 3-way `format_as` |
| m7-01-01/02/03 | `percent` | NHSS scorecard, same shape as m8 — **confirm with Tim, docs are placeholders** |

Everything else keeps its current declaration unchanged, notably:

- m10-02-01/02 stay `percent` (don't-know/missingness *rates* attributed to
  indicators — derived, not the indicator's quantity).
- m9-02-01 stays `number` (CIX/SII derived over percent indicators).
- m9-01-01 stays `percent` — ICEH catalog rows carry no `format_as` today
  (`icehIndicatorRow`), so `"indicator"` has nothing to read. If the derived-
  indices plan later adds formats to ICEH indicators, flip it then.
- m1/m2/m3/m4/m4a/m6 stay as declared: utilization counts are counts,
  coverage of any indicator is a percent. (`m4a-01-01`'s `source_indicator`
  dim holds raw HMIS ids with no formats — nothing to infer even in theory.)

Modules repo work: flip the 8 metrics, `deno task build` regenerates
`definition.json`. Push in lockstep AFTER the app deploy (old app schema
rejects `"indicator"` at install).

## Resolution rules (app)

`lib/resolve_effective_format.ts` collapses to:

- `formatAs !== "indicator"` → `{ formatAs, perCell: false }`. No inputs
  beyond the metric.
- `formatAs === "indicator"` → enumerate displayed indicator-dimension values
  (replicant selection, filter pins, else possible-values), map through
  `indicatorFormats`; unanimous → that format, otherwise `"number"`. Always
  `perCell: true` for tables.

Fixes that survive from the review, now scoped to `"indicator"` metrics:

- **F8**: collect candidate values ONLY from indicator dimensions
  (`INDICATOR_DISAGGREGATION_OPTIONS`), symmetric with the bail rule — a
  calculated indicator named `anc1` must not collide with a `source_indicator`
  value. Fix the "harmless noise" comment (F-DOC-4).
- **F7**: `indicatorFormats ?? {}` at the read boundary — a stale IndexedDB
  `metric_info` payload without the field must degrade, not throw. (Dev has
  no deploy purge; documented trap.)
- **F6**: a transient `status: "error"` options query must not be frozen into
  Valkey/IndexedDB — skip caching payloads that contain an `error` status.
  The resolver treating error as "cannot enumerate → number fallback" is
  correct; the caching is the bug.

Render side (`build_figure_inputs.ts`): `resolveEffectiveFormatFromItems` is
replaced by the same rule. For `"indicator"` metrics it reads pins from
`bundle.config` (replicant, filterBy) and enumerates disaggregated dims from
items; formats come from `bundle.indicatorMetadata`, which is the FULL module
catalog (`getIndicatorMetadataFromRun`), so filter-pinned indicators are
visible — the old plan's F2 shape 1 is fixed with no migration. Residual
editor/render divergence is confined to `"indicator"` metrics where the
editor's possible-values status (`too_many_values`/`error`/possible-but-empty)
disagrees with actual rows; document exactly that in SYSTEM_10 (F-DOC-1
rewrite), nothing stronger.

**F3 (stranded `forceYMax1`)**: still real for `"indicator"` metrics (the
resolved format is filter-sensitive). Fix at application, not just gating:
style builders apply `max: 1` only when the resolved format is `percent`
(`_1_standard.ts` ×2, `_2_coverage.ts`, `_3_percent_change.ts`,
`_4_disruptions.ts`) — same pattern as `isPieCompletionMode`'s render-side
re-check. The editor checkbox gating stays.

Deletions: `ALWAYS_OBEY_METRIC_FORMAT_METRICS`, `metricAlwaysObeysFormatAs`,
`obeysMetricFormatPerCell` (per-cell = `formatAs === "indicator"`),
`EffectiveFormatSource`.

AI path (`lib/ai_tools/format_metric_data_for_ai.ts:151,394`): the type change
forces handling. Minimum honest behavior: for `"indicator"` metrics print
"Format: varies by indicator" and use per-indicator formats where available;
do not print raw fractions as "number". (The full fifth-derivation cleanup
stays a separate item, but lying to the model is not acceptable interim.)

## Type/schema sites (complete inventory)

- `lib/types/_module_definition_github.ts:308` — add `"indicator"` (install
  validation; deploy-order gate).
- `lib/types/_metric_installed.ts:346` — add `"indicator"` (stored in project
  DBs).
- `lib/types/_figure_bundle.ts:60` — add `"indicator"` (stored bundles).
- `lib/types/run_manifest.ts:77` — bare `z.string()` becomes the 3-way enum
  (this also closes the old plan's dropped §3 item; the unchecked cast at
  `run_read.ts:498` and `metric_enricher.ts:108` goes away).
- `lib/types/modules.ts:46,58`, `resolve_effective_format.ts`,
  `format_metric_data_for_ai.ts:394`,
  `data_transforms/_figure_block.ts:787` — TS unions follow.
- Modules repo `.validation/_module_definition_github.ts:297` — synced copy.

## Persistence layers (all five, per CLAUDE.md discipline)

Old data says `"number"` for m10-01/m10-03 and `"percent"` for m7/m8; without
transforms, metric-owned semantics would regress every stored HFA figure to
raw numbers. List-based rewrites (the 8 metric ids frozen into the transform,
recompute-never-invent):

1. **Project DB installed definitions** — data transform over stored metric
   JSON: for the 8 ids, `formatAs → "indicator"`. Forced skip-gate per
   PROTOCOL_APP_MIGRATIONS (the value parses under the old schema, so a
   parse-only gate would skip it).
2. **Run manifests** — transform block 2 + `RUN_MANIFEST_SCHEMA_VERSION` 3→4:
   rewrite `metrics[].format_as` for the 8 ids. The v4 bump also re-runs
   block 1, which is the F4 resolution (below).
3. **Stored FigureBundles** (~17k) — figure-block sweep with force gate:
   `resultsValue.formatAs → "indicator"` where `metricId` is in the list.
   `inferFormatAs` in `_figure_block.ts` (legacy backfill) updates to the new
   rule.
4. **Valkey** — the uncommitted change already bumps `PO_CACHE_VERSION` 11→12
   and `po_detail_v5→v6`; nothing deployed since, so those bumps cover this
   design too. Verify no other cached payload carries a metric `formatAs`.
5. **Client IndexedDB** — deploy purge covers prod; dev trap noted (F7's
   `?? {}` is the guard).

## Server findings (unchanged by the redesign — fix as reviewed)

- **F4** — keep the version gate; blocks do NOT re-evaluate every boot.
  Rewrite the block comment and PROTOCOL_APP_MIGRATIONS § "Run Manifest
  Transforms": *a derivation fix requires a `RUN_MANIFEST_SCHEMA_VERSION`
  bump*. Each block stamps the version it produces (stamp moves inside the
  block), which makes the missing-block assertion live again instead of dead
  code. The v3→v4 bump this plan needs is the worked example.
- **F5** — `runDirInputRowsReader`: a listed input file that is missing or
  unparseable must funnel into the `unreadable` outcome (package unavailable,
  boot proceeds), not throw through to `Deno.exit(1)`. Throw only on genuine
  code defects. Matches the protocol failure table; a half-restored package
  must not down the instance.
- **F9** (`rate_per_10k` display, unreachable today) — fix the two formatter
  defects while in the area (legend decimals from the resolved tick list, not
  domain endpoints; rate axis tick formatter); park the CF-editor unit
  convention as an open item in SYSTEM_11.

## Doc corrections

- **F-DOC-1** — rewrite SYSTEM_10 § "Effective format" for the new design;
  state the residual `"indicator"`-metric divergence precisely.
- **F-DOC-2** — restore the SYSTEM_08 open item, correctly scoped:
  `readInputRows` (`run_read.ts`) still tolerates a mirror absent from
  `manifest.inputFiles` for the two HFA variant snapshots
  (`getHfaTaxonomyFromManifestInputs`).
- **F-DOC-3** — folded into F4.
- Record the two audit answers the old plan noted as unrecorded: the §5
  "pending refetch" judgment (resultsValueInfo does not refetch on filter
  edit — confirm once, note in SYSTEM_10) and the fourth-layer
  `bundle.indicatorMetadata` audit (derivation moved verbatim, no repair).

## What survives from the uncommitted implementation

Keep (verified by two independent reviewers): the manifest indicator catalog
(`server/runs/indicator_catalog.ts`, faithful move), the manifest transform
machinery, the editor conversion of all 8 stored-format reads, the Valkey
coverage, the `resolve_effective_format.ts` file structure and its editor
call site. The redesign REPLACES the resolution rule inside the resolver and
the render twin; it deletes the inference machinery rather than adding to it.

## Deploy order

1. App: typecheck + rigs + deploy (accepts old AND new definitions; runs all
   three transforms at boot).
2. Modules repo: push the 8 flipped metrics (old app would reject
   `"indicator"` — DEPLOY APP BEFORE PUSHING MODULES).
3. Rollback note: manifests become v4; a rolled-back image reports packages
   from a newer server (same recovery story as v3, `manifest.v3.json`
   backups).

## Verification bar

Unchanged from the review — the old session's harnesses were shaped to pass;
do not reuse them.

- Cases in BOTH directions: percent-declaring metric over number indicators
  (m10-02 filtered to count questions → must stay percent) and
  `"indicator"` metric over each unanimous/mixed shape.
- Use the render-path oracle for render gates: `buildFigureInputs` output,
  not the config-based value, for `forceYMax1` / pie mode / tick formatters.
- Mechanically assert editor format === render format per shape for
  `"indicator"` metrics (the residual divergence cases are the documented
  exceptions — assert those too).
- Exercise the real m10-01/m10-02 metrics against a real HFA package copied
  to a scratch dir (`SANDBOX_DIR_PATH` override; never write to
  `_example_instance_dir`).
- All three transforms round-trip on copies: installed-metric JSON, a v2 AND
  a v3 manifest → v4, a stored bundle for each of the 8 metrics.
- `deno task typecheck`, `./validate_queries`, `./validate_migrations`.

## Open items for Tim

1. Confirm m7-01-01/02/03 are `"indicator"` (their metric docs are
   placeholder text; classified by analogy with m8).
