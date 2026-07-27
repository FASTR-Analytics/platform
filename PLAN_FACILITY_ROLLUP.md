# Plan: Roll-up for facility columns ("All facilities" row/column)

Status: APPROVED 2026-07-28, ready to implement, nothing implemented yet.
Tim's rulings, all 2026-07-28: build NOW, before the results-runs merge (the
Sequencing section lists the obligations that ordering creates); label
strings decided (D6); position wording stays "Top/Bottom" (W5). No open
questions remain.

Investigated 2026-07-28 against the code; line references and the sequencing
measurements are from that date — re-verify before relying on them; where
this plan and the repo disagree, the repo is right and the plan is stale.

## Objective

Extend the admin-area roll-up (the synthetic "National"/"All areas" row) so a
visualization grouped by a facility column — `facility_type`, primarily — can
also show an "All facilities" row/column. Motivating case: an HFA table with
one column per facility type plus an "All facilities" column, with correct
`__n_*` sample sizes.

## Why the scope is admin levels + facility columns, and nothing else

The roll-up re-aggregates rows ACROSS the collapsed dimension's values. That is
only meaningful when the dimension **partitions the unit of observation**
(facilities): the three admin levels and the seven facility columns
(`facility_type`, `facility_ownership`, `facility_custom_1..5`) do. The rest do
not:

- `hfa_indicator` / `indicator_common_id` etc. — collapsing sums across
  *different indicators*; changes what is measured, not the scope.
- `time_point` — pools survey rounds; double-counts facilities.
- `hfa_service_category` — multi-membership, not groupable anyway.
- period columns — "all time" totals; out of scope, not requested.

So this is a **whitelist extension** (admin levels + facility columns), not a
generalization to every disaggregation option. The whitelist is itself the new
SQL-safety closed union.

## What already generalizes for free (verified 2026-07-28)

- `buildSelectQuery` takes a generic `collapsedLevel: string | undefined`
  ([query_helpers.ts:175](server/server_only_funcs_presentation_objects/query_helpers.ts#L175));
  the column-prefix map (`f.` for facility CTE columns) is applied before the
  collapse check, and the sentinel replaces the reference entirely — a facility
  column collapses exactly like an admin column. UNION ALL assembly, PAE
  re-computation after the union, blank-fold interplay, WHERE: all unchanged.
- **Sample-n**: the roll-up branch's `COUNT(DISTINCT facility_id)` gives
  exactly the wanted n for the "All facilities" column — distinct facilities in
  the collapsed scope. Zero work.
- **Metric eligibility** (`isRollupEligibleResultsValue`,
  [lib/admin_area_rollup.ts](lib/admin_area_rollup.ts)) is already
  dimension-blind (PAE / SUM / COUNT / AVG-over-facility-rows). All shipped HFA
  metrics carry a PAE → eligible. The server-side AVG↔`facility_id` half is
  trivially satisfied for facility dims (facility columns are only offered when
  the table has `facility_id`).
- Blank facility values: the main branch folds them to `__BLANK` as its own
  group; the roll-up branch has no filter on the collapsed column, so
  blank-typed facilities are correctly INCLUDED in "All facilities".
- Display pin machinery: `getRollupAwareSort` already applies to every axis
  (series/lane/tier/pane); CF exclusion and sentinel color key off
  `ROLLUP_PIN_IDS`.

## Design decisions

### D1 — Config shape: per-entry flag on `disaggregateBy` (migration required)

Today the config stores a global boolean (`d.includeAdminAreaRollup`) and the
target is DERIVED ("exactly one admin level grouped"). With facility columns in
play a config can group both `admin_area_2` and `facility_type` — the boolean
is ambiguous. The rolled dimension must be named.

Chosen shape: the flag moves onto the `disaggregateBy` entry:

```ts
disaggregateBy: [{
  disOpt, disDisplayOpt,
  rollup?: boolean,                       // this dimension gets the roll-up
  rollupPosition?: "top" | "bottom",      // display-only, per-entry
}]
```

`d.includeAdminAreaRollup` and `d.adminAreaRollupPosition` are DELETED
(migrated, see below). Rationale: the roll-up is a property of a grouped
dimension; the flag dies naturally when the dimension is removed; and it is the
phase-2-proof shape (see D2). Alternative rejected: a top-level
`rollupDisOpt` field — dangles when the dimension is removed, and freezes
phase 1's one-roll-up rule into storage.

### D2 — Phase 1 = exactly one roll-up, WITHOUT precluding simultaneous ones

Phase 1 renders at most one rolled dimension per viz (a National row AND an
"All facilities" column in the same table needs 2ⁿ UNION branches for the
cross-product — real but separable server work). The one-roll-up rule lives
ONLY in derivation code and UI, never in storage or wire shape:

- Stored config: multiple `rollup: true` entries are schema-VALID; the gate
  (D4) treats >1 effective flagged entry as "gate closed" (roll-up inert),
  exactly like today's "exactly one admin level" rule. UI prevents flagging a
  second (checking one clears others).
- Wire: single optional field (D5); can become an array later — the fetch
  config is never persisted, so that change is free.
- Sentinels are per-dimension-kind (D3); a future cross row carries each
  sentinel in its own column — no conflict.

Nothing in phase 1 requires a second storage migration to lift the limit.

### D3 — Sentinels

Keep `__NATIONAL` (`ROLLUP_SENTINEL`) for admin dims — stored figure grids
carry it; changing it is pure churn. Add `ALL_FACILITIES_SENTINEL =
"__ALL_FACILITIES"` for facility dims. `ROLLUP_PIN_IDS` grows to three ids
(current + legacy + new); every pin/exclusion/color consumer keys off the list
already.

### D4 — Gates (generalize, same rules)

- Config-shape gate: `getRollupAdminLevel` → **`getRollupDimension(config)`**:
  the entry with `rollup: true` whose `disOpt` is in the whitelist, is not
  displayed as replicant/mapArea, and is not filtered to a single value; maps
  excluded; >1 such entry ⇒ `undefined` (phase-1 rule). Same
  no-eager-clearing lifecycle: transient gate closures leave the flag latent;
  `normalizePOConfigForStorage` strips flags whose entry fails the gate at save
  time.
- Metric gate: `isRollupEligibleResultsValue` unchanged.
- Combined: `getEffectiveRollupLevel` → **`getEffectiveRollupDimension`** —
  still the single gate for editor checkbox, fetch builder, save-time strip,
  and AI tool.

### D5 — Wire contract

`GenericLongFormFetchConfig` replaces `includeAdminAreaRollup` +
`adminAreaRollupLevel` with one field: `rollupDim?: DisaggregationOption`
(presence = on). Validation (Zod route schema + `validateFetchConfig`):
membership in the whitelist union AND `groupBys.includes(rollupDim)` — same
SQL-safety story as today. Server behavior unchanged: obeys the baked
dimension, never recomputes it; malformed/stale ⇒ roll-up branch silently
omitted (existing precedent).

### D6 — Naming: computed scope words; NO editor/instance naming

Follow the existing precedent (labels are scope words, resolved client-side
with translation, never frozen into cached payloads). Collapsing ANY facility
attribute — type, ownership, or a custom Urban/Rural column — means the same
scope, so one label works for all seven columns without consulting the
instance column labels:

- default: **"All facilities"** / fr **"Toutes les formations sanitaires"** /
  pt **"Todas as unidades sanitárias"** (DECIDED 2026-07-28 — "formation
  sanitaire" / "unidade sanitária" are the standard terms in the
  francophone-Africa / Mozambique contexts FASTR serves)
- subset (the rolled column ITSELF filtered to 2+ values): **"All selected
  facilities"** / fr "Toutes les formations sanitaires sélectionnées" /
  pt "Todas as unidades sanitárias selecionadas"
- Implementation check before using these strings: grep the existing fr/pt UI
  literals for the app's established "facility" term; if it differs, the
  existing translations win — internal consistency beats these suggestions.

Filters on OTHER columns (ownership, admin, indicator) deliberately do not
change the label — same "all, among the selection" reading as the admin
roll-up. No "pinned" analog: facility columns are not hierarchical.
`getRollupLabelContext` gains facility kinds (e.g. `all_facilities` /
`facility_subset`); admin logic untouched. A per-viz custom label override is
NOT in scope — trivially addable later via the label-replacement map if ever
wanted.

### D7 — Caching

- `hashFetchConfig`: the two roll-up segments become one `rollupDim ?? ""`
  segment. Segment-list change ⇒ every `po_items`/`replicant_opts` key changes
  once ⇒ one-time cold cache on deploy. Benign; repopulates on demand.
- NO `po_items` prefix bump (payload shape unchanged) and NO
  `PO_CACHE_VERSION` bump (the global key change already invalidates
  everything; the knob's rule — "meaning changed for an unchanged key" — does
  not apply).
- The N1 gap (facility-columns config absent from version keys) applies to the
  rolled facility dim exactly as it already does to facility disaggregation
  generally — no new exposure, still deferred to PLAN_RESULTS_RUNS §8.

## Risk profile

Moderate, concentrated entirely in W2 — the migration is the ONLY component
that writes stored data. Its failure mode is the Zod-strip silent-loss gotcha
(a missed sweep gate silently drops users' roll-up settings), defended by the
forced skip-gates; Block 24 shipped the identical rename pattern on these same
fields; transforms run in a transaction with fail-stop boot; and W8 requires a
dry-run against a copy of real configs before shipping. Everything else has
display-layer blast radius — a bug shows a wrong or missing roll-up row, it
does not corrupt data. Existing figures cannot silently change: old stored
grids keep `__NATIONAL`, and the new sentinel appears only for configs that
newly flag a facility column. Deploy effects: one-time cold PO cache
(self-healing) and the standard open-tab wire blip (a tab left open across the
deploy sends the old wire fields and loses its roll-up row until reload).

## Work items

### W1 — lib: types, whitelist, gates

- [lib/admin_area_rollup.ts](lib/admin_area_rollup.ts) → rename
  `lib/rollup.ts` (it no longer admin-specific). **Update the SYSTEM_09
  front-matter glob** (`lint:systems` enforces the manifest).
  - Add `FACILITY_ROLLUP_COLUMNS` (7 cols), `ROLLUP_DIMENSIONS` (= admin
    levels + facility cols), `isRollupDimension()`, `ALL_FACILITIES_SENTINEL`;
    extend `ROLLUP_PIN_IDS`.
- [lib/types/_metric_installed.ts:160](lib/types/_metric_installed.ts#L160)
  `configDStrict`: add `rollup`/`rollupPosition` to the `disaggregateBy` entry
  schema; delete `includeAdminAreaRollup`/`adminAreaRollupPosition`. Same edit
  in the github twin
  [_module_definition_github.ts](lib/types/_module_definition_github.ts).
- [lib/get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts):
  `getRollupDimension` / `getEffectiveRollupDimension` /
  `getRollupLabelContext` per D4/D6; fetch builder emits `rollupDim`;
  `hashFetchConfig` per D7.
- [lib/normalize_po_config.ts](lib/normalize_po_config.ts): strip logic moves
  to the entries (flag + position kept only on the entry passing
  `getEffectiveRollupDimension`).
- [lib/validate_fetch_config.ts](lib/validate_fetch_config.ts) +
  [lib/api-routes/project/presentation-objects.ts:76](lib/api-routes/project/presentation-objects.ts#L76):
  `rollupDim` validation per D5 (whitelist enum; must be grouped; keep the
  table-blind never-eligible-func rejection).

### W2 — Migration (the cost center; PROTOCOL_APP_MIGRATIONS applies in full)

New transform block in
[data_transforms/po_config.ts](server/db/migrations/data_transforms/po_config.ts)
(`transformConfigD` Block 25), following Block 24's exact pattern:

- If `d.includeAdminAreaRollup === true`: tag the target entry with
  `rollup: true` + `rollupPosition = d.adminAreaRollupPosition ?? "bottom"`.
  Target selection, preserving latent flags: (a) the entry the old
  `getRollupAdminLevel` logic selects (replicated config-only in the
  transform); (b) if the old gate is transiently closed but EXACTLY ONE
  admin-level entry exists in `disaggregateBy`, tag that one (the flag stays
  latent and can reactivate, matching today's no-eager-clearing behavior);
  (c) otherwise (0 or ambiguous 2+) the flag was inert AND ambiguous — drop
  it.
- Always `delete d.includeAdminAreaRollup` / `delete d.adminAreaRollupPosition`.
- **Skip-gates**: extend `configNeedsForcedTransform` and
  `rawJsonNeedsForcedTransform` with the two deleted keys (Zod strip mode
  silently swallows them — the Skip-Gate Gotcha). The existing sweep callers
  (presentation_objects, viz presets via metric.ts, installed module
  definitions via module_definition.ts, slide configs, dashboard figure
  blocks, report figures via `_figure_block.ts`) pick the block up through the
  shared `transformConfigD` — verify each surface's forced-transform gate
  consults the extended raw scan.
- Migration numbering: coordinate with PLAN_RESULTS_RUNS (its merge renumbers
  migrations; whichever lands second renumbers).

### W3 — Server SQL

[query_helpers.ts](server/server_only_funcs_presentation_objects/query_helpers.ts) +
[get_combined_query.ts](server/server_only_funcs_presentation_objects/get_combined_query.ts):

- `buildAdminAreaRollupQuery` → `buildRollupQuery`: guard becomes
  `rollupDim !== undefined && isRollupDimension(rollupDim) &&
  groupBys.includes(rollupDim)`; sentinel chosen by dimension kind
  (`isAdminLevel(dim) ? ROLLUP_SENTINEL : ALL_FACILITIES_SENTINEL`);
  `collapsedLevel` plumbing unchanged.
- `getPresentationObjectItems`: the server-side AVG↔facility check already
  keys on `queryContext.hasFacilityId` — verify it reads the new field name,
  no behavior change.
- No new SQL constructs (UNION ALL, facility CTE JOIN, blank fold all exist) —
  nothing new for the PLAN_RESULTS_RUNS DuckDB dialect inventory.

### W4 — Client display

[get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts):

- `getRollupRowLabel`: facility branches per D6 (new inline `{en,fr,pt}`
  literals); label replacements map the ACTIVE dimension's sentinel (keep
  mapping legacy + `__NATIONAL` for stored grids).
- Sorts/pins: position now read from the flagged entry
  (`entry.rollupPosition`); the rolled-axis detection generalizes from
  `getRollupAdminLevel` to `getRollupDimension`. Mechanical.
- [get_style_from_po/_0_common.ts](client/src/generate_visualization/get_style_from_po/_0_common.ts)
  (CF exclusion/color) and
  [_5_scorecard.ts](client/src/generate_visualization/get_style_from_po/_5_scorecard.ts)
  (uses `ROLLUP_SENTINEL` directly — switch to `ROLLUP_PIN_IDS`).

### W5 — Editor (S11)

[_3_disaggregation.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx):

- The checkbox block already renders per-dimension gated on
  `getRollupAdminLevel(...) === disOpt` — generalize the gate; it then appears
  under facility entries too. Checkbox label from the extended
  `getRollupLabelContext` (same helper as the rendered row, per the existing
  can't-tell-different-stories rule).
- Single-flag enforcement: checking a dimension's box clears any other entry's
  flag. Position select reads/writes the entry's `rollupPosition`. Wording:
  keep **"Top/Bottom"** (DECIDED 2026-07-28 — zero wording churn for existing
  admin roll-ups; imperfect for column axes, accepted).

### W6 — AI surfaces

Patch schema passthroughs in [lib/types/ai_input.ts:171](lib/types/ai_input.ts#L171),
[apply_figure_config_patch.ts](client/src/generate_visualization/apply_figure_config_patch.ts),
[validate_display_slots.ts:124](client/src/generate_visualization/validate_display_slots.ts#L124)
(availability error message), the two `format_*_for_ai.ts` files (editor-state
description; AI data payload roll-up exclusion generalizes via
`ROLLUP_PIN_IDS`), and the tool schema in `visualization_editor.tsx`
(PROTOCOL_APP_AI_TOOLS recipe applies).

### W7 — wb-fastr-modules lockstep

The github schema (W1) is embedded in authored definitions. Check whether any
authored preset/defaultPresentationObject sets `includeAdminAreaRollup`; run
`deno task build` there and push in lockstep with the app deploy (stored
installed definitions are covered by the W2 sweep).

### W8 — Verification

- Query rig (`./validate_queries`, PROTOCOL_APP_QUERY_RIG): new cases —
  facility_type roll-up with PAE (the HFA shape, asserting the `__n_*` value
  on the roll-up row = distinct facilities across types), roll-up with blank
  facility_type values, roll-up with a filter on a DIFFERENT facility column,
  roll-up + time_point grouping, admin roll-up regression (unchanged
  behavior + old cases still green).
- Execute-don't-read check of the migration transform on a copy of real
  configs (read-only harness per the house rule).
- `deno task typecheck` (includes `lint:systems` — the glob rename).
- Doc updates after landing: SYSTEM_09 (roll-up section + globs), SYSTEM_10
  (display mechanics pointer), SYSTEM_11 (editor prose).

## Suggested landing order

W1 (lib, both schemas) → W2 (migration + skip-gates) → W3 (server) → W4/W5
(client) → W6 (AI) → W7 (modules repo) → W8 throughout; single deploy (wire
contract changes client+server together).

## Sequencing vs PLAN_RESULTS_RUNS (measured 2026-07-28)

**DECIDED 2026-07-28: this plan is implemented FIRST, on main, before the
runs merge.** The measurements below justify that and enumerate the
obligations it creates for the merge. Measured against the `results-runs`
branch (merge-base d0ee2e3e 2026-07-09; main 285 ahead / branch 30):

- The branch rewrites the S9 orchestration/engine layer
  (`get_presentation_object_items`, `get_query_context`,
  `get_possible_values`, period helpers, `metric_enricher`, cache instances).
  This plan's core surface — `query_helpers.ts`, `get_combined_query.ts`, all
  the lib gates, the `po_config.ts` transform, the rig, the entire client
  side — is branch-UNTOUCHED and flows through a main→results-runs merge
  automatically.
- Obligations at landing (owed to the runs merge):
  1. Update PLAN_RESULTS_RUNS's pre-flight note: the migration renumbering
     ruling (065/066/038) shifts by one for the W2 project migration, and the
     merge's manual-conflict list gains the files this plan touches that the
     branch also touches: `lib/api-routes/project/presentation-objects.ts`,
     `lib/types/_module_definition_github.ts`,
     `get_presentation_object_items.ts`, possibly
     `visualization_editor_inner.tsx`.
  2. Post-merge: W8's rig cases must pass the runs golden-diff (DuckDB). Low
     risk — no new SQL construct (UNION ALL, facility CTE join, blank fold
     all pre-exist; contrast n-values' `FILTER`, which was flagged absent
     from the dialect inventory).
- Unlike table n-values (deferred into the runs merge because it touched
  `metric_enricher`, which the runs work deletes), this plan does not touch
  the enricher at all.
