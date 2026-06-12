# Admin-Area Roll-up Rows

The synthetic "All areas" / "National" row: a per-figure aggregate row computed
across admin areas, appended to a visualization's data via a second SQL query.
This doc owns the FEATURE end-to-end — its gates, labels, display mechanics,
caching, and legacy handling.

> **Scope discipline:** SQL assembly mechanics (CTEs, UNION ALL ordering,
> escaping) are owned by
> [DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md](DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md).
> Disaggregation semantics and enrichment are owned by
> [DOC_DISAGGREGATION_OPTIONS_HANDLING.md](DOC_DISAGGREGATION_OPTIONS_HANDLING.md).
> This doc owns the roll-up's rules and invariants; those docs own the
> machinery it rides on.

---

## Principles

1. **Two independent gates, evaluated together.** The CONFIG gate
   (`getRollupAdminLevel`) decides whether the viz's shape admits a roll-up;
   the METRIC gate (`isRollupEligibleResultsValue`) decides whether the
   metric's values can be re-aggregated at all. `getEffectiveRollupLevel`
   combines them and is the single source of truth wherever a `ResultsValue`
   is in scope.
2. **The client chooses the collapse level; the server obeys.** The level is
   baked into the fetch config as `adminAreaRollupLevel`. The server must
   NEVER recompute it from raw groupBys (those include replicant levels —
   the wrong collapse target). The server's job is SQL-safety
   (`isAdminLevel` + `groupBys.includes`) and the one eligibility check that
   needs table access.
3. **Position is display-only.** `d.adminAreaRollupPosition` ("top"/"bottom")
   lives in the PO config and drives sort pinning on the client. It is never
   in the fetch config, the SQL, or the cache hash — toggling it re-renders
   without refetching.
4. **Labels are SCOPE words, never operation words.** "Total" implies SUM,
   but the row can be an AVG or a recomputed ratio. The vocabulary is
   "National", "{Area} — All areas", "All selected areas" — what the row
   covers, not how it was computed. This convention applies to any future
   aggregate-row labeling.
5. **The sentinel is not a real admin area.** `ROLLUP_SENTINEL`
   (`"__NATIONAL"`) marks the row in the collapsed column. The client maps it
   to a label and pins its sort position. `LEGACY_ROLLUP_SENTINEL`
   (`"zzNATIONAL"`) appears only in figure grids stored by a previous release
   — kept render-compatible, never emitted.

---

## The system

```text
PresentationObjectConfig (d.includeAdminAreaRollup, d.adminAreaRollupPosition)
    │
    ▼
getEffectiveRollupLevel(resultsValue, config)        [lib/get_fetch_config_from_po.ts]
    │  = isRollupEligibleResultsValue(rv)  AND  getRollupAdminLevel(config)
    │  Consumers: editor checkbox, fetch builder, save normalizer, AI editor tool
    ▼
fetch config: { includeAdminAreaRollup, adminAreaRollupLevel }   (no position)
    ▼
buildAdminAreaRollupQuery                            [server query_helpers.ts]
    │  sentinel replaces the level's column; level dropped from GROUP BY;
    │  UNION ALL'd onto the main query (same WHERE); PAE applied after the union
    ▼
items rows containing ROLLUP_SENTINEL in the collapsed column
    ▼
client display                                       [get_data_config_from_po.ts]
    ├─ label:  buildLabelReplacements ← getRollupRowLabel ← getRollupLabelContext
    ├─ sort:   getRollupAwareSort (pin first/last) / pin-only sort on chart Bars axis
    ├─ colors: sentinel series → fixed _CF_COMPARISON       [_0_common.ts]
    └─ cf:     liveDomainExcludeIds keeps the row out of auto color domains
```

## The config gate (`getRollupAdminLevel`)

EXACTLY ONE admin level (AA2/3/4) must be grouped, NOT displayed as
replicant/mapArea, and NOT filtered to a single value. More than one effective
level would require per-parent subtotals, which the display layer can't
render. Maps are excluded entirely (no "National" pane). The authoritative
doc comment lives on the function — everywhere else points there.

## The metric gate (`isRollupEligibleResultsValue`)

Re-aggregation across areas is only meaningful for:

| valueFunc | Eligible? | Why |
|---|---|---|
| SUM / COUNT | yes | Additive. |
| identity + post-aggregation expression | yes | Ingredients (SUM/AVG) are re-aggregated, ratio recomputed after the union. |
| AVG, table HAS `facility_id` | yes | Rows are raw facility observations — re-averaging over any scope is the correctly weighted statistic (e.g. m001 outliers). |
| AVG, table has NO `facility_id` | no | Rows are pre-aggregated area summaries — re-averaging gives a population-blind mean (e.g. m004/m005/m006 coverage, m1-03-01). |
| identity, no PAE | no | Pre-aggregated percentages/rates (e.g. m007 scorecards). |
| MIN / MAX | no | Never used; semantics unclear. |

The raw-vs-pre-aggregated distinction IS the presence of `facility_id` on the
results table, derived at enrichment as `ResultsValue.hasFacilityLevelRows`
(`server/db/project/metric_enricher.ts`). The field is optional — stale cached
payloads read as `false` (safe).

**Server enforcement is split:** `lib/validate_fetch_config.ts` rejects the
never-eligible funcs (it has no table access); the AVG↔facility_id half is
checked in `getPresentationObjectItems` via `detectColumnExists`. App clients
never trip either — they guard hand-crafted requests.

**Editor UX:** when the config gate passes but the metric is ineligible, the
checkbox renders DISABLED with a reason ("values cannot be aggregated across
areas") instead of hiding — absence must be explicable.

## Labeling (`getRollupLabelContext`)

Precedence, evaluated against admin-level `filterBy` entries and replicant
display:

1. **subset** → "All selected areas" — an admin filter restricts the
   geography: 2+ values at/coarser than the roll-up level, or ANY values on a
   FINER level (one district still subsets the data). Levels displayed as
   replicant are skipped — their filter narrows which panes exist; the pin
   (rule 2) governs each pane's data.
2. **pinned** → "{Area} — All areas" — the FINEST coarser level pinned to one
   value (replicant `selectedReplicantValue`, or a single-value filter). The
   "— All areas" marker is load-bearing: a child area can share its parent's
   display name (Bauchi LGA in Bauchi State), and the marker is what
   distinguishes the aggregate row.
3. **national** → "National" (`TC.national`).

Non-admin filters (facility type, indicator, …) deliberately do NOT change
the label — the row reads as "national among the selection".

The same context drives the editor checkbox text ("Include National results" /
"Include {Level} results" / "Include results for all selected areas"), so row
and checkbox can never tell different stories.

## Display mechanics

- **Sort:** `getRollupAwareSort(config)` = by-label with the sentinel ids
  (`ROLLUP_PIN_IDS`) pinned first/last per position; plain "by-label" when the
  roll-up is inactive. Tables pin only the axis carrying the roll-up level
  (`getTableAdminAxis`) so indicator axes keep `byIdOrder`.
- **Chart "Bars" (indicator) axis:** panther applies `sort.indicator` only
  when `sortIndicatorValues` is undefined; any string (including "none")
  keeps DATA order — deliberate, year-old panther semantics (`--v` axes carry
  module-defined valueProps order). When the roll-up level sits on this axis
  and `s.sortIndicatorValues === "none"`, the app passes
  `sortIndicatorValues: undefined` plus a PIN-ONLY sort (no base; panther's
  `sortByPinned` with optional base + stable sort preserves data order
  exactly). With asc/desc the row participates in value order.
- **Conditional formatting:** `liveDomainExcludeIds` (panther
  `TableJsonDataConfig`) excludes the sentinel rows — matched on the row
  header id OR its rowGroup id — from per-column live min/max, so the
  aggregate row can't compress auto color scales.
- **Series colors:** the sentinel series gets fixed `_CF_COMPARISON`
  (matched on the `seriesColorFuncPropToUse`-relevant header id). Known
  residual: other series still shift palette index when position is "top"
  (panther index-keyed palettes).
- **Label replacements** for the sentinels are added only when the roll-up is
  active — stored figures never carry dead entries.

## Editor lifecycle

- **No eager clearing.** Gate closures are often transient (filter chips
  toggle one value at a time). The flag survives in the editor; the fetch
  builder re-derives safely; `normalizePOConfigForStorage(config,
  resultsValue)` strips it at save time when the gate is closed.
- **Canonical off-state = both fields absent.** When kept, position defaults
  to "bottom". `SaveAsNewVisualizationModal` normalizes too (covers AI draft
  saves).
- Checking the box sets position `?? "bottom"`; the radio displays
  `?? "bottom"` (legacy configs may lack it).

## Caching

- `hashFetchConfig` includes `includeAdminAreaRollup` + `adminAreaRollupLevel`
  only — never position.
- The enriched `ResultsValue` rides inside Valkey's `po_detail` cache,
  version-hashed by the PO's `last_updated` — a deploy that changes the
  PAYLOAD SHAPE must bump the cache prefix (`po_detail_v2` did this for
  `hasFacilityLevelRows`). See the comment at `_PO_DETAIL_CACHE`.

## Legacy / migrations

- Pre-rename fields `includeNationalForAdminArea2` / `includeNationalPosition`
  are renamed by po_config Block 24. Because zod's strip mode silently
  swallows unknown keys, every sweep gate consults
  `configNeedsForcedTransform` / `rawJsonNeedsForcedTransform` — see
  PROTOCOL_APP_MIGRATIONS.md "Skip-Gate Gotcha".
- Sweeps skip the write when output equals stored, so forced-scan false
  positives can't churn `last_updated` every boot.

## AI integration

- The viz-editor tool validates the gate UP FRONT on a candidate config (a
  throw means nothing changed) and defaults position when enabling.
- AI data payloads deliberately EXCLUDE the roll-up row (double-counting
  hazard); the viz-editor context says so explicitly and explains
  unavailability reasons. Known gap: the standalone visualization-data tool
  adds no such notice.

## Parked / known limitations

- m004/m005/m006 (+ m1-03-01) use the loose AVG-on-pre-aggregated idiom where
  m2/m3/m7–m10 use identity — reclassifying them to identity is a candidate
  cleanup (would also make their granularity contract explicit).
- Canonical indicator order under `sortIndicatorValues: "none"` (data order
  today, always has been) is an open product question, independent of the
  roll-up.

## File map

| File | Owns |
|---|---|
| `lib/admin_area_rollup.ts` | sentinels, `ROLLUP_PIN_IDS`, `AdminLevel`, metric eligibility |
| `lib/get_fetch_config_from_po.ts` | config gate, combined gate, label context, `isRollupActive`, fetch baking, hash |
| `lib/normalize_po_config.ts` | save-time strip, canonical off-state |
| `lib/validate_fetch_config.ts` | wire-level guards (table-blind half) |
| `server/server_only_funcs_presentation_objects/query_helpers.ts` | roll-up query, aggregate modes |
| `server/server_only_funcs_presentation_objects/get_presentation_object_items.ts` | AVG↔facility_id enforcement |
| `server/db/project/metric_enricher.ts` | `hasFacilityLevelRows` derivation |
| `client/src/generate_visualization/get_data_config_from_po.ts` | labels, sorts, cf exclusion ids |
| `client/src/generate_visualization/get_style_from_po/_0_common.ts` | sentinel series color |
| `client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx` | checkbox/radio UI + disabled reason |
| `panther/_001_render_system/header_types.ts` | pin-only `sortByPinned` (vendored; edit in panther repo) |
| `panther/_010_table/` | `liveDomainExcludeIds` (vendored; edit in panther repo) |
