# PLAN: Scorecard Module Overhaul — Overview

Make the HMIS scorecard dynamic and user-configurable: an instance admin can edit which indicators appear, how each is computed from HMIS data, and how each is formatted (percent / number / rate per 10k, threshold colours). Changes flow through the existing **project dataset pipeline** — admins import the catalog into a project like any other dataset, m008 reads the per-project snapshot, scorecards render with per-indicator formatting. m007 is left untouched; projects adopt the new behaviour by installing m008.

## The three phases

Ordered **model → pipeline+module → viz**. Each phase leaves the app shippable.

| # | Phase | Plan doc |
| --- | --- | --- |
| 1 | **Catalog (shipped).** Instance-level `calculated_indicators` table + CRUD UI as a third tab in the indicators manager + seed of the 10 current indicators with dummy thresholds. Source of truth is now the code: [`019_add_calculated_indicators.sql`](server/db/migrations/instance/019_add_calculated_indicators.sql), [`lib/types/indicators.ts`](lib/types/indicators.ts), [`server/db/instance/calculated_indicators.ts`](server/db/instance/calculated_indicators.ts), [`server/routes/instance/calculated_indicators.ts`](server/routes/instance/calculated_indicators.ts), and the editor / table components in [`client/src/components/indicators/`](client/src/components/indicators/). | — (shipped) |
| 2 | **m008 + HMIS-coupled catalogue snapshot.** Build m008. Couple the catalogue export to HMIS imports via a new opt-in `includeCalculatedIndicatorCatalogue` toggle in the HMIS dataset settings. The HMIS card surfaces catalogue staleness as a refresh reason. No standalone Project Data card. | [PLAN_SCORECARD_02_PIPELINE.md](PLAN_SCORECARD_02_PIPELINE.md) |
| 3 | **Formatting.** Per-indicator format and threshold colours via client-side catalog lookup in the scorecard style closure. Deletes `conditional_formatting_scorecard.ts`. | [PLAN_SCORECARD_03_FORMATTING.md](PLAN_SCORECARD_03_FORMATTING.md) |

**Why this order.** The catalog is the foundation. Once it exists, phase 2 can clone the existing HMIS/HFA dataset pipeline almost verbatim and build m008 catalog-driven from day one. Formatting depends on both — fields live on catalog rows, and m008 needs to be producing data to style.

## Key architectural decisions

### D1. Single results object at finest granularity

m007 emits three results objects (one per admin-area level × pre-aggregated). m008 emits **one** at AA4 × quarter. The SQL query layer aggregates up via `disaggregateBy`. Pattern proven by [wb-fastr-modules/m002/_metrics.ts](../wb-fastr-modules/m002/_metrics.ts).

**Why:** removes level duplication, unlocks dynamic admin-area selection in the viz editor for scorecards.

**Aggregation math:** `SUM(num) / SUM(denom)` is correct for every calculated indicator because both columns are linearly additive. D5 below explains why "per 10k" scaling doesn't break this.

### D2. Calculated indicators are a first-class instance entity

A new table `calculated_indicator` in the instance DB, managed through the indicators manager UI. All scorecard modules in the instance see the full list; per-project subsetting, if ever needed, happens in the viz editor via `filterBy` on `indicator_common_id`.

**Why not a flag on common indicators?** A calculated indicator like "ANC4/ANC1 ratio" is a *relationship* between two common indicators, not a property of one. Population-based denominators have no common indicator at all.

### D3. Computation is structural, not expression-based

Each `calculated_indicator` row stores **typed fields**, not free-text R expressions:

```text
num_indicator_id           -- soft ref to the common_indicator that provides the numerator
denom_kind                 -- 'indicator' | 'population'
denom_indicator_id         -- soft ref, when denom_kind='indicator'
denom_population_fraction  -- when denom_kind='population'; e.g. 0.04 for under-1s, 0.22 for women 15-49, 1.0 for whole population
```

Note that `denom_population_fraction` is the **annual** fraction of population. The consuming module applies its own period scaling (e.g. m008 multiplies by `0.25` because it produces quarterly scorecards). This keeps the catalog module-agnostic — a hypothetical monthly scorecard module would use `1/12` without the catalog needing any changes.

All 10 current m007 indicators fit this schema cleanly — see the seed `INSERT` block in [`019_add_calculated_indicators.sql`](server/db/migrations/instance/019_add_calculated_indicators.sql).

**Why structural, not expressions?** An earlier draft proposed storing `numerator_expression` and `denominator_expression` as R text, parsed by a custom validator and evaluated in a sealed R environment. Rejected. That approach requires a recursive-descent parser, a whitelist, a save-time validator, a task-manager-time validator, a sealed R eval, and a runtime skip path for missing columns — all to support flexibility the 10 real indicators don't need. Structural fields give the UI typed dropdowns, soft-reference validation, zero sandboxing risk, and an R script that's 15 lines long. When someone genuinely needs a novel computation, they write a new module — which is how the system already handles every other novel computation.

### D4. Calculated indicators piggyback on HMIS imports — no standalone project resource

Calculated indicators are inherently coupled to HMIS data: m008 cannot compute a single value without both the HMIS counts (via m002's `M2_adjusted_data.csv`) **and** the catalogue defining how those counts get combined. Letting them drift out of sync — fresh HMIS with stale catalogue, or vice versa — produces silently wrong scorecard values. So phase 2 enforces consistency by tying the catalogue lifecycle to the HMIS import lifecycle.

**The model:**

- `DatasetType` gains a `"calculated_indicators"` member so module definitions can declare it via `dataSources`. But it is **not** added to `_POSSIBLE_DATASETS` and never appears as its own card in the Project Data UI.
- The HMIS dataset windowing config gains a single boolean: `includeCalculatedIndicatorCatalogue` (default `true`).
- When `addDatasetHmisToProject` runs, if the toggle is on, it exports the instance catalogue as a side-effect: a second `COPY` writes `calculated_indicators.csv` next to `hmis.csv` in the same `datasets/` folder. The project's HMIS `info` JSON stores the catalogue version snapshot.
- m008 reads the file via the existing `DataSource: "dataset"` resolver in [get_script_with_parameters.ts:35-38](server/server_only_funcs/get_script_with_parameters.ts#L35-L38) — substitutes `'../datasets/calculated_indicators.csv'` automatically. Zero changes to the resolver.
- The HMIS card's existing staleness check picks up catalogue drift as one more reason to refresh: if the instance catalogue version no longer matches the project snapshot, the card displays "Calculated indicators changed" and the existing "Update data" button refreshes both atomically.

**What this buys:**

- **No silent drift.** Refreshing HMIS always refreshes the catalogue. Editing the catalogue surfaces a visible warning on every project that's opted in. There is no way to end up with mismatched HMIS-and-catalogue snapshots in a project.
- **One refresh action.** Users see one "Update data" button, click once, get consistent state. No two-step "did I forget to refresh the catalogue?" dance.
- **Zero new UI.** No third dataset card. No new dispatcher branch. No standalone enable/disable lifecycle. The catalogue is invisible plumbing tied to HMIS — the user only thinks about it via the one checkbox in HMIS settings.
- **Per-project opt-out.** HFA-only projects, or projects that don't use m008, can untick the checkbox and never have a catalogue file in their sandbox.
- **Zero new code paths in the module pipeline.** No task-manager hook, no `getScriptWithParameters` changes, no boolean capability flag on module definitions.

**Trade-off accepted.** Editing the catalogue and wanting to push the change to a project requires re-importing HMIS, even if HMIS data itself hasn't changed. That re-import is slow (full CSV export). Acceptable because (a) catalogue edits are rare relative to HMIS imports, (b) the consistency guarantee is worth it, (c) the alternative (decoupled snapshots) silently bites users with stale-catalogue scorecards.

### D5. m008 is driven by the catalog from day one

No phase writes hardcoded indicator logic into m008. Phase 1 seeds the catalog with the 10 current indicators. Phase 2 builds m008 to read whatever is in the catalog via the project snapshot. The R script is a fifteen-line loop that dispatches on `denom_kind` — no `eval`, no `parse`, no sandboxing, no parameter substitution for indicator constants. When phase 2 ships, m008 already produces the same outputs m007 produces today, with zero throwaway transitional code.

### D6. "Per 10k" is a format, not a computation

m007 expresses HTN and diabetes as `(hypertension_new / (total_population * 0.25)) * 10000`. The `* 10000` is a display choice — "cases per 10,000 people" — not epidemiology. Moving it into the format layer means:

- Numerator stays `hypertension_new` (no scaling).
- Denominator is `population * 1.0` in the catalog (whole population), with m008's R script multiplying by `0.25` (its module-level period constant) to get the quarterly denominator.
- `format_as: 'rate_per_10k'` renders the value as `value * 10000` with a " per 10k" suffix at display time.
- The underlying metric value is a pure rate, which is what it should be.

This also cleans up D1's aggregation math: without a `×10000` in any numerator, every calculated indicator is a pure ratio and `SUM(num) / SUM(denom)` is unambiguously correct.

### D7. Per-row threshold cutoffs, not preset enum

Cutoff colours are stored on each `calculated_indicator` row as three fields:

```text
threshold_direction  -- 'higher_is_better' | 'lower_is_better'
threshold_green      -- the cutoff above (or below) which a value is green
threshold_yellow     -- the cutoff above (or below) which a value is yellow
```

Cutoffs are stored in the **displayed scale** for that indicator's `format_as`. A `percent` indicator with `threshold_green: 0.8` means "green at ≥ 80%"; a `rate_per_10k` indicator with `threshold_green: 10` means "green at ≤ 10 per 10k" (direction `lower_is_better`).

**Why not the existing preset enum in [conditional_formatting.ts:68-149](client/src/generate_visualization/conditional_formatting.ts#L68-L149)?** The presets like `fmt-80-70` hardcode cutoffs on a 0–1 scale, which works for percent but can't express "10 or 20 per 10k" — a preset named `fmt-10-20` means 0.1 / 0.2, not 10 / 20. Rather than invent rate-scale presets for every new format, store cutoffs as raw numbers per indicator and compose the colour function on the fly.

### D8. Phase 3 formatting uses a client-side catalog lookup

Phase 3 does **not** thread `indicatorMetadata` through the metric enricher and into the result type. The calculated indicator catalog is already an instance resource — the client fetches it once (like common indicators) and caches it. The style closure looks up format and thresholds by label against the cached catalog.

The existing scorecard renderer at [conditional_formatting_scorecard.ts:263-275](client/src/generate_visualization/conditional_formatting_scorecard.ts#L263-L275) already uses `info.colHeader` (the column header label) for per-indicator threshold lookup — that pattern stays. The only change is sourcing the label → metadata map from the catalog instead of a hardcoded constant. **Label uniqueness is enforced at catalog save time** so label collisions can't produce ambiguous lookups.

## Out of scope

- **Project-level scorecard subsetting.** Achievable via viz-editor `filterBy` on `indicator_common_id` if ever needed.
- **Novel-computation indicators** that don't fit the structural schema. Edge cases become new modules.
- **Migrating or retiring m007.** m007 stays frozen as legacy. Projects migrate themselves by installing m008.
- **Instance-level population data store or CSV importer UI.** m008 continues reading the `total_population_NGA.csv` asset as m007 does.
- **DHIS2 import of numerator/denominator.** [lib/types/indicators.ts:56-76](lib/types/indicators.ts#L56-L76) has type fields for this but the import path doesn't populate them. Orthogonal.

## Risk register

- **Common indicator rename/deletion after a calculated indicator points at it.** Soft reference, not cascade. Catalog editor flags broken rows with a red badge; the viz layer already tolerates missing data. No delete guard — calculated indicators follow the existing convention where references degrade gracefully.
- **m007 and m008 aggregated outputs differ in low decimal places during transition.** m007 rounds mid-pipeline to 2 dp ([m007/script.R:302](../wb-fastr-modules/m007/script.R#L302)); m008 stores raw values so `SUM(num)/SUM(denom)` is exact. The smoke test compares to 2 dp, not bitwise.
- **Metric enricher on multi-ingredient + TEXT disaggregation is unprecedented.** No existing module combines a TEXT disaggregation column (`indicator_common_id`) with a two-ingredient `postAggregationExpression`. m008 is the first. One real-query verification task lands in phase 2 before shipping.
- **"Calculated indicators" as a `DatasetType` is a loose semantic fit.** They're config, not data. Mechanically the existing dataset abstraction is exactly right; the concern is purely naming. UI labelling keeps the distinction clear to users ("Calculated indicators", not "Calculated indicators dataset").

No expression-sandboxing risk. No task-manager staging risk. No new module-definition capability flag. All removed with D3, D4, D5.
