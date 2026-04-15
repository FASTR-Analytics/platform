# PLAN: Scorecard Module Overhaul — Overview

Make the HMIS scorecard dynamic and user-configurable: an instance admin can edit which indicators appear, how each is computed from HMIS data, and how each is formatted (percent / number / rate per 10k, threshold colours). Changes flow through the existing **project dataset pipeline** — admins import the catalog into a project like any other dataset, m008 reads the per-project snapshot, scorecards render with per-indicator formatting. m007 is left untouched; projects adopt the new behaviour by installing m008.

## The three phases

Ordered **model → pipeline+module → viz**. Each phase leaves the app shippable.

| # | Phase | Plan doc |
|---|---|---|
| 1 | **Catalog.** New instance-level `scorecard_indicator` entity, CRUD UI in a refactored three-tab indicators manager, seed of the 10 current indicators with dummy thresholds. Pure additive — no module or viz changes. | [PLAN_SCORECARD_01_CATALOG.md](PLAN_SCORECARD_01_CATALOG.md) |
| 2 | **Project dataset integration + m008.** Make scorecard indicators the third `DatasetType`, reusing the existing per-project import/staleness pipeline. Build m008 to consume the per-project CSV snapshot. | [PLAN_SCORECARD_02_PIPELINE.md](PLAN_SCORECARD_02_PIPELINE.md) |
| 3 | **Formatting.** Per-indicator format and threshold colours via client-side catalog lookup in the scorecard style closure. Deletes `conditional_formatting_scorecard.ts`. | [PLAN_SCORECARD_03_FORMATTING.md](PLAN_SCORECARD_03_FORMATTING.md) |

**Why this order.** The catalog is the foundation. Once it exists, phase 2 can clone the existing HMIS/HFA dataset pipeline almost verbatim and build m008 catalog-driven from day one. Formatting depends on both — fields live on catalog rows, and m008 needs to be producing data to style.

## Key architectural decisions

### D1. Single results object at finest granularity

m007 emits three results objects (one per admin-area level × pre-aggregated). m008 emits **one** at AA4 × quarter. The SQL query layer aggregates up via `disaggregateBy`. Pattern proven by [wb-fastr-modules/m002/_metrics.ts](../wb-fastr-modules/m002/_metrics.ts).

**Why:** removes level duplication, unlocks dynamic admin-area selection in the viz editor for scorecards.

**Aggregation math:** `SUM(num) / SUM(denom)` is correct for every scorecard indicator because both columns are linearly additive. D5 below explains why "per 10k" scaling doesn't break this.

### D2. Scorecard indicators are a first-class instance entity

A new table `scorecard_indicator` in the instance DB, managed through the indicators manager UI. All scorecard modules in the instance see the full list; per-project subsetting, if ever needed, happens in the viz editor via `filterBy` on `indicator_common_id`.

**Why not a flag on common indicators?** A scorecard indicator like "ANC4/ANC1 ratio" is a *relationship* between two common indicators, not a property of one. Population-based denominators have no common indicator at all.

### D3. Computation is structural, not expression-based

Each `scorecard_indicator` row stores **typed fields**, not free-text R expressions:

```text
num_indicator_id           -- soft ref to the common_indicator that provides the numerator
denom_kind                 -- 'indicator' | 'population'
denom_indicator_id         -- soft ref, when denom_kind='indicator'
denom_population_fraction  -- when denom_kind='population'; e.g. 0.04 for under-1s, 0.22 for women 15-49, 1.0 for whole population
```

Note that `denom_population_fraction` is the **annual** fraction of population. The consuming module applies its own period scaling (e.g. m008 multiplies by `0.25` because it produces quarterly scorecards). This keeps the catalog module-agnostic — a hypothetical monthly scorecard module would use `1/12` without the catalog needing any changes.

All 10 current m007 indicators fit this schema cleanly (see [§1.6 seed](PLAN_SCORECARD_01_CATALOG.md)).

**Why structural, not expressions?** An earlier draft proposed storing `numerator_expression` and `denominator_expression` as R text, parsed by a custom validator and evaluated in a sealed R environment. Rejected. That approach requires a recursive-descent parser, a whitelist, a save-time validator, a task-manager-time validator, a sealed R eval, and a runtime skip path for missing columns — all to support flexibility the 10 real indicators don't need. Structural fields give the UI typed dropdowns, soft-reference validation, zero sandboxing risk, and an R script that's 15 lines long. When someone genuinely needs a novel computation, they write a new module — which is how the system already handles every other novel computation.

### D4. Scorecard indicators are a third `DatasetType`, imported per-project

Rather than inventing a new staging mechanism, scorecard indicators reuse the **existing dataset-import-to-project pipeline** that HMIS and HFA already use. The catalog lives in the instance DB. When an admin enables the "Scorecard indicators" dataset on a project, the existing `addDatasetToProject` pattern exports the catalog to `{sandbox}/{projectId}/datasets/scorecard_indicators.csv` via Postgres `COPY`, records a snapshot version in the project DB's `datasets` table, and m008 reads the CSV at run time via the existing `DataSource: "dataset"` resolver in [get_script_with_parameters.ts:35-38](server/server_only_funcs/get_script_with_parameters.ts#L35-L38).

**What this buys:**

- **Project-scoped snapshot.** Editing the instance catalog doesn't immediately invalidate existing module runs. The user explicitly refreshes the project when ready.
- **Staleness is first-class.** The project's stored `scorecardIndicatorsVersion` compared against `instanceState.scorecardIndicatorsVersion` drives a "Scorecard indicators updated in instance" warning and a one-click refresh button, identical to how HMIS and HFA work today.
- **Zero new code paths.** No task-manager hook, no `getScriptWithParameters` changes, no boolean capability flag on module definitions. `DatasetType` gets one new member, `_POSSIBLE_DATASETS` gets one new entry, and a new export function mirrors `addDatasetHfaToProject`.
- **Mental model match.** In the project Data tab, admins see a "Scorecard indicators" card sitting next to "HMIS" and "HFA", with the same enable / disable / update / staleness affordances. Consistent UX.

**Why "DatasetType" even though it's config, not data?** The label is a loose semantic fit — scorecard indicators are a small tabular catalog, not a time-series of observations. But the mechanical fit is perfect: instance-level source of truth, filtered per-project export, file-based consumption by a module, user-controlled refresh, staleness tracking. Treating them as a dataset type reuses a well-built abstraction; inventing a parallel "project config resources" pattern would be more code for no real gain.

### D5. m008 is driven by the catalog from day one

No phase writes hardcoded indicator logic into m008. Phase 1 seeds the catalog with the 10 current indicators. Phase 2 builds m008 to read whatever is in the catalog via the project snapshot. The R script is a fifteen-line loop that dispatches on `denom_kind` — no `eval`, no `parse`, no sandboxing, no parameter substitution for indicator constants. When phase 2 ships, m008 already produces the same outputs m007 produces today, with zero throwaway transitional code.

### D6. "Per 10k" is a format, not a computation

m007 expresses HTN and diabetes as `(hypertension_new / (total_population * 0.25)) * 10000`. The `* 10000` is a display choice — "cases per 10,000 people" — not epidemiology. Moving it into the format layer means:

- Numerator stays `hypertension_new` (no scaling).
- Denominator is `population * 1.0` in the catalog (whole population), with m008's R script multiplying by `0.25` (its module-level period constant) to get the quarterly denominator.
- `format_as: 'rate_per_10k'` renders the value as `value * 10000` with a " per 10k" suffix at display time.
- The underlying metric value is a pure rate, which is what it should be.

This also cleans up D1's aggregation math: without a `×10000` in any numerator, every scorecard indicator is a pure ratio and `SUM(num) / SUM(denom)` is unambiguously correct.

### D7. Per-row threshold cutoffs, not preset enum

Cutoff colours are stored on each `scorecard_indicator` row as three fields:

```text
threshold_direction  -- 'higher_is_better' | 'lower_is_better'
threshold_green      -- the cutoff above (or below) which a value is green
threshold_yellow     -- the cutoff above (or below) which a value is yellow
```

Cutoffs are stored in the **displayed scale** for that indicator's `format_as`. A `percent` indicator with `threshold_green: 0.8` means "green at ≥ 80%"; a `rate_per_10k` indicator with `threshold_green: 10` means "green at ≤ 10 per 10k" (direction `lower_is_better`).

**Why not the existing preset enum in [conditional_formatting.ts:68-149](client/src/generate_visualization/conditional_formatting.ts#L68-L149)?** The presets like `fmt-80-70` hardcode cutoffs on a 0–1 scale, which works for percent but can't express "10 or 20 per 10k" — a preset named `fmt-10-20` means 0.1 / 0.2, not 10 / 20. Rather than invent rate-scale presets for every new format, store cutoffs as raw numbers per indicator and compose the colour function on the fly.

### D8. Phase 3 formatting uses a client-side catalog lookup

Phase 3 does **not** thread `indicatorMetadata` through the metric enricher and into the result type. The scorecard indicator catalog is already an instance resource — the client fetches it once (like common indicators) and caches it. The style closure looks up format and thresholds by label against the cached catalog.

The existing scorecard renderer at [conditional_formatting_scorecard.ts:263-275](client/src/generate_visualization/conditional_formatting_scorecard.ts#L263-L275) already uses `info.colHeader` (the column header label) for per-indicator threshold lookup — that pattern stays. The only change is sourcing the label → metadata map from the catalog instead of a hardcoded constant. **Label uniqueness is enforced at catalog save time** so label collisions can't produce ambiguous lookups.

## Out of scope

- **Project-level scorecard subsetting.** Achievable via viz-editor `filterBy` on `indicator_common_id` if ever needed.
- **Novel-computation indicators** that don't fit the structural schema. Edge cases become new modules.
- **Migrating or retiring m007.** m007 stays frozen as legacy. Projects migrate themselves by installing m008.
- **Instance-level population data store or CSV importer UI.** m008 continues reading the `total_population_NGA.csv` asset as m007 does.
- **DHIS2 import of numerator/denominator.** [lib/types/indicators.ts:56-76](lib/types/indicators.ts#L56-L76) has type fields for this but the import path doesn't populate them. Orthogonal.

## Risk register

- **Common indicator rename/deletion after a scorecard indicator points at it.** Soft reference, not cascade. Catalog editor flags broken rows with a red badge; the viz layer already tolerates missing data. No delete guard — scorecard indicators follow the existing convention where references degrade gracefully.
- **m007 and m008 aggregated outputs differ in low decimal places during transition.** m007 rounds mid-pipeline to 2 dp ([m007/script.R:302](../wb-fastr-modules/m007/script.R#L302)); m008 stores raw values so `SUM(num)/SUM(denom)` is exact. The smoke test compares to 2 dp, not bitwise.
- **Metric enricher on multi-ingredient + TEXT disaggregation is unprecedented.** No existing module combines a TEXT disaggregation column (`indicator_common_id`) with a two-ingredient `postAggregationExpression`. m008 is the first. One real-query verification task lands in phase 2 before shipping.
- **"Scorecard indicators" as a `DatasetType` is a loose semantic fit.** They're config, not data. Mechanically the existing dataset abstraction is exactly right; the concern is purely naming. UI labelling keeps the distinction clear to users ("Scorecard indicators", not "Scorecard indicators dataset").

No expression-sandboxing risk. No task-manager staging risk. No new module-definition capability flag. All removed with D3, D4, D5.
