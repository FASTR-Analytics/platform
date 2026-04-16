# PLAN: Scorecard Phase 2 — m008 + HMIS-Coupled Catalogue Snapshot

Build `wb-fastr-modules/m008` and wire the calculated indicator catalogue into the existing HMIS dataset import pipeline. The catalogue is **not** a standalone project resource the user enables — it piggybacks on HMIS imports as an opt-in side-effect, controlled by a single boolean on the HMIS settings. m007 is not modified.

Depends on phase 1 (catalogue table exists, seeded with the 10 current indicators). At the end of this phase, an admin imports HMIS data into a project (with the new toggle on), m008 runs, and a scorecard presentation object on m008's metric renders correctly with dynamic admin-area-level and period selection.

## The architectural bet

Calculated indicators are inherently coupled to HMIS data. m008 needs both: HMIS counts (via m002's `M2_adjusted_data.csv`) and the catalogue defining how those counts get combined. Letting them drift out of sync — fresh HMIS with stale catalogue, or vice versa — produces silently wrong scorecard values. Coupling the two at import time eliminates that class of bug.

So:

- Calculated indicators are **not** their own `_POSSIBLE_DATASETS` card. The user never sees "Calculated indicators" as a thing to enable.
- They piggyback on `addDatasetHmisToProject`: when the user imports HMIS, the catalogue is exported as an extra CSV alongside `hmis.csv` in the same `datasets/` folder.
- Whether the catalogue is exported is gated by a new boolean `includeCalculatedIndicatorCatalogue` in the HMIS dataset windowing config. Default `true`. Power users can opt out (e.g. HFA-only projects, projects that don't use m008).
- The HMIS card's existing staleness check picks up catalogue drift as one more reason to refresh, so editing the instance catalogue surfaces a visible "needs update" badge on every project that opted in.

The catalogue still travels via the existing `DataSource: "dataset"` resolver. m008 declares `datasetType: "calculated_indicators"` and the existing branch in [get_script_with_parameters.ts:35-38](server/server_only_funcs/get_script_with_parameters.ts#L35-L38) substitutes `'../datasets/calculated_indicators.csv'` automatically — **zero changes** to that resolver, to [run_module_iterator.ts](server/worker_routines/run_module/run_module_iterator.ts), or to module definition schema.

## 2.1 — Extend the `DatasetType` union

**File:** [lib/types/datasets.ts](lib/types/datasets.ts)

```ts
export type DatasetType = "hmis" | "hfa" | "calculated_indicators";
```

**Do not** add an entry to `_POSSIBLE_DATASETS`. The new type exists only so module definitions can reference it via `datasetType: "calculated_indicators"` in `dataSources`; it is never rendered as a project-data card. Any code that exhaustively switches on `DatasetType` (e.g. dispatchers in `addDatasetToProject`) needs a no-op branch for `"calculated_indicators"` — admins never call those entry points with this type, but the union exhaustiveness must compile.

## 2.2 — HMIS dataset config gains `includeCalculatedIndicatorCatalogue`

**File:** [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts) — wherever `DatasetHmisWindowingCommon` is declared.

```ts
export type DatasetHmisWindowingCommon = {
  // ...existing windowing fields...
  includeCalculatedIndicatorCatalogue: boolean;
};
```

**Default value when adding HMIS to a new project:** `true`. The catalogue file is small, the cost of including it is negligible, and the cost of forgetting to enable it (m008 silently fails to find its data source) is much higher than the cost of an unused file.

**File:** [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts) — `DatasetHmisInfoInProject` (the per-project snapshot type stored in the `datasets` table's `info` JSON):

```ts
export type DatasetHmisInfoInProject = {
  // ...existing fields...
  calculatedIndicatorsVersion: string | undefined;  // undefined when the toggle is off
};
```

The `windowing` sub-object inside this type already carries the boolean (it's a `DatasetHmisWindowingCommon`); the version field at the top level is what the staleness check compares against `instanceState.calculatedIndicatorsVersion`.

## 2.3 — `addDatasetHmisToProject` exports the catalogue when enabled

**File:** [server/db/project/datasets_in_project_hmis.ts](server/db/project/datasets_in_project_hmis.ts)

After the existing HMIS `COPY` statement (around [line 151](server/db/project/datasets_in_project_hmis.ts#L151)), add a conditional catalogue export:

```ts
// HMIS export (existing, unchanged)
await mainDb.unsafe(`
COPY (${exportStatement}) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

// Calculated indicator catalogue (new, opt-in)
const catalogPathForPostgres = join(
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
  projectId,
  "datasets",
  "calculated_indicators.csv",
);
const catalogPathForDeno = join(
  _SANDBOX_DIR_PATH,
  projectId,
  "datasets",
  "calculated_indicators.csv",
);

let calculatedIndicatorsVersion: string | undefined = undefined;

if (startingWindowing.includeCalculatedIndicatorCatalogue) {
  if (onProgress) await onProgress(0.6, "Exporting calculated indicators catalogue...");

  const catalogExportStatement = `
SELECT
  calculated_indicator_id,
  label,
  group_label,
  sort_order,
  num_indicator_id,
  denom_kind,
  denom_indicator_id,
  denom_population_fraction,
  format_as,
  decimal_places,
  threshold_direction,
  threshold_green,
  threshold_yellow
FROM calculated_indicators
ORDER BY sort_order, calculated_indicator_id`;

  await mainDb.unsafe(`
COPY (${catalogExportStatement}) TO '${catalogPathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

  calculatedIndicatorsVersion = await getCalculatedIndicatorsVersion(mainDb);
} else {
  // Cleanup: a previous import may have written the file when the toggle was on
  try { await Deno.remove(catalogPathForDeno); } catch { /* not present */ }
}
```

Then thread `calculatedIndicatorsVersion` into the `info` payload that gets stored in the project DB:

```ts
const info: DatasetHmisInfoInProject = {
  version,
  windowing: startingWindowing,
  totalRows,
  structureLastUpdated,
  indicatorMappingsVersion,
  facilityColumnsConfig: resFacilityConfig.data,
  maxAdminArea: resMaxAdminArea.data.maxAdminArea,
  calculatedIndicatorsVersion,
};
```

**Why the cleanup step matters.** If a project was previously imported with the toggle on and the user later disables it, an orphaned `calculated_indicators.csv` would sit in the sandbox indefinitely. The `Deno.remove` in the `else` branch handles that — `try/catch` around the unlink because the file legitimately may not exist on a first import.

## 2.4 — `removeDatasetFromProject` for HMIS also unlinks the catalogue

**File:** [server/db/project/datasets_in_project_hmis.ts:270-288](server/db/project/datasets_in_project_hmis.ts#L270-L288)

Today this function unlinks `hmis.csv` and deletes the `datasets` row. Add one more line to also unlink `calculated_indicators.csv`:

```ts
try {
  const datasetFilePath = getDatasetFilePath(projectId, datasetType);
  await Deno.remove(datasetFilePath);
} catch { /* not present */ }

if (datasetType === "hmis") {
  try {
    const catalogPath = join(_SANDBOX_DIR_PATH, projectId, "datasets", "calculated_indicators.csv");
    await Deno.remove(catalogPath);
  } catch { /* not present */ }
}
```

The catalogue file lives in the HMIS dataset's `datasets/` folder, not under any standalone dataset path, so it's the responsibility of the HMIS removal path to clean it up.

## 2.5 — HMIS settings UI: opt-in checkbox

**File:** `client/src/components/project/settings_for_project_dataset_hmis.tsx`

Add one checkbox to the HMIS settings editor, near the indicator selection section:

```tsx
<Checkbox
  label={t3({
    en: "Include calculated indicator catalogue",
    fr: "Inclure le catalogue des indicateurs calculés",
  })}
  checked={tempWindowing.includeCalculatedIndicatorCatalogue}
  onChange={(v) => setTempWindowing("includeCalculatedIndicatorCatalogue", v)}
/>
```

Helper text below the checkbox:

> *"Required for the m008 scorecard module. Adds the instance catalogue of calculated indicators to the project; it is refreshed automatically on every HMIS update."*

The new field defaults to `true` for both new imports (in the `startingWindowing` fallback inside `addDatasetHmisToProject`) and any project loaded from a pre-phase-2 `info` JSON that lacks the field (handle with `?? true`).

## 2.6 — HMIS card surfaces catalogue staleness

**File:** [client/src/components/project/project_data.tsx](client/src/components/project/project_data.tsx) — the HMIS card's `stalenessCheck` at lines 55-95.

Add one more reason to the existing chain:

```ts
if (
  keyedProjectDatasetHmis.info.windowing.includeCalculatedIndicatorCatalogue &&
  instanceState.calculatedIndicatorsVersion !== keyedProjectDatasetHmis.info.calculatedIndicatorsVersion
) {
  reasons.push(t3({
    en: "Calculated indicators changed",
    fr: "Indicateurs calculés modifiés",
  }));
}
```

When the toggle is off, no staleness signal — the catalogue is irrelevant to that project. When it's on and the instance catalogue has changed, the existing "Update data" button refreshes everything atomically (HMIS export + catalogue export, in one round-trip).

This is the **only** place catalogue staleness surfaces in the UI. There's no separate card and no separate refresh action. One click, one consistent snapshot.

## 2.7 — m008 scaffold

Copy `wb-fastr-modules/m007/` to `wb-fastr-modules/m008/`. Rename `m7*` / `M7_*` IDs to `m8*` / `M8_*`. Update `definition.json` module ID, label, and description.

**Parameters to delete from `definition.json`:** `BIRTHS_PCT`, `WOMEN_15_49_PCT`. Both are replaced by `denom_population_fraction` in the catalog, so the module-level constants are dead.

**Parameters to keep:** `SELECTED_COUNT_VARIABLE`, `INTERPOLATE_POPULATION`. These remain genuine module knobs — how to read HMIS counts, how to interpolate population between reference years.

**New module-level constant in `script.R`:** `PERIOD_FRACTION <- 0.25`. This is m008's temporal choice (quarterly scorecards), applied to every population-based denominator at compute time. It's not a catalog field and it's not a user-configurable parameter — it's a fixed part of what m008 *is*. A hypothetical monthly scorecard module would set `PERIOD_FRACTION <- 1/12` and consume the same unchanged catalog. See §2.11.

`assetsToImport` keeps pointing at `total_population_NGA.csv`. m008 shares the population asset with m007.

## 2.8 — m008 `dataSources`

m008 declares two data sources in `definition.json`: the existing results-object input from m002, plus a new dataset entry pointing at calculated indicators.

```jsonc
"dataSources": [
  {
    "sourceType": "results_object",
    "replacementString": "M2_adjusted_data.csv",
    "resultsObjectId": "M2_adjusted_data.csv",
    "moduleId": "m002"
  },
  {
    "sourceType": "dataset",
    "replacementString": "CALCULATED_INDICATORS_FILE",
    "datasetType": "calculated_indicators"
  }
]
```

The existing branch at [get_script_with_parameters.ts:35-38](server/server_only_funcs/get_script_with_parameters.ts#L35-L38) substitutes `CALCULATED_INDICATORS_FILE` → `'../datasets/calculated_indicators.csv'` automatically. **No changes to `get_script_with_parameters.ts`.** The R script has a bare `CALCULATED_INDICATORS_FILE` token where the filename goes, and after substitution it reads as normal R.

**Prerequisite:** m008's `prerequisites` array stays as `["m002"]` — unchanged from m007. The task manager already enforces that m002 must run first so that `M2_adjusted_data.csv` exists in the m002 sandbox. The calculated indicators CSV is written into the project sandbox by the HMIS import pipeline (§2.3) — m008 simply finds it sitting in `../datasets/calculated_indicators.csv` at run time, with no module-side staging.

**Implicit HMIS dependency.** m008 doesn't formally declare HMIS as a prerequisite, but it can't run without it: m002 reads HMIS data, m008 needs m002's output, and m008 needs the calculated indicators CSV (which is only produced when HMIS is imported with the §2.5 toggle enabled). If a project has no HMIS dataset, m008 fails for two independent reasons. This is fine — neither failure is silent.

## 2.9 — m008 results object

**File:** `wb-fastr-modules/m008/_results_objects.ts`

Replace m007's three per-level objects with one at AA4 grain:

```ts
export const M8_RESULTS_OBJECTS = [{
  resultsObjectId: "M8_output_scorecard",
  createTableStatementPossibleColumns: {
    admin_area_2:        "TEXT NOT NULL",
    admin_area_3:        "TEXT NOT NULL",
    admin_area_4:        "TEXT NOT NULL",
    quarter_id:          "INTEGER NOT NULL",
    indicator_common_id: "TEXT NOT NULL",
    numerator:           "DOUBLE PRECISION",
    denominator:         "DOUBLE PRECISION",
  },
}];
```

The metric enricher at [metric_enricher.ts:128](server/db/project/metric_enricher.ts#L128) already lists `indicator_common_id` as a disaggregation-eligible physical column, so this schema auto-registers correctly on that axis.

## 2.10 — m008 metric

**File:** `wb-fastr-modules/m008/_metrics.ts`

Modelled on m002's pattern exactly: one declared `valueProps` entry (the computed output), two ingredient values (the raw SUM columns). **Not** `valueProps: ["numerator", "denominator"]` — that's not how m002 does it and not how the metric enricher consumes it. The enricher reads `valueProps` verbatim from the metric definition at [metric_enricher.ts:38](server/db/project/metric_enricher.ts#L38); it doesn't infer value columns from the schema.

```ts
{
  id: "m8-01",
  resultsObjectId: "M8_output_scorecard",
  valueProps: ["value"],
  valueFunc: "identity",
  postAggregationExpression: {
    ingredientValues: [
      { prop: "numerator",   func: "SUM" },
      { prop: "denominator", func: "SUM" },
    ],
    expression: "value = numerator / denominator",
  },
  formatAs: "percent",  // default; phase 3 overrides per-indicator via catalog lookup
}
```

`applyPostAggregationExpressionV2` at [query_helpers.ts:265-300](server/server_only_funcs_presentation_objects/query_helpers.ts#L265-L300) wraps the division with `NULLIF(denominator, 0)`, so rows with zero or null denominators render as blank rather than erroring.

**`valueLabelReplacements`** can be dropped from the metric definition entirely — labels come from the catalog at render time (phase 3) via client-side lookup. Keeping them would double-encode the labels and risk them going stale when the catalog changes.

**Mandatory verification task before shipping 2.10.** No existing module combines (a) a TEXT disaggregation column and (b) a two-ingredient `postAggregationExpression`. m008 is the first. Manually verify on a scratch query:

1. A scorecard presentation object on `m8-01` with `indicator_common_id` selected as disaggregation.
2. `buildAggregateColumns()` at [query_helpers.ts:245-259](server/server_only_funcs_presentation_objects/query_helpers.ts#L245-L259) emits `SUM(numerator), SUM(denominator)` in the SELECT clause.
3. `GROUP BY` includes `indicator_common_id`.
4. The post-aggregation expression wraps correctly producing one `value` column.
5. Aggregating up to AA2 and AA3 via `disaggregateBy` also works.

This is the one place the whole plan's aggregation story could break. Confirm it works against a real DB before declaring 2.10 done.

## 2.11 — m008 R script

**File:** `wb-fastr-modules/m008/script.R`

Everything upstream of scorecard computation is copy-paste from m007 and stays unchanged:

- Library loads, file reads (including `read_csv(ADJUSTED_DATA_FILE, ...)` for the M2 results object)
- `nhmis_timely_and_data` derivation
- Quarter detection
- `merge_population()` ([m007/script.R:177-241](../wb-fastr-modules/m007/script.R#L177-L241)) — joins `total_population_NGA.csv` at whatever geo-level the caller passes. m008 only calls it at AA4.
- Wide pivot of HMIS data by `indicator_common_id`

The **only** new logic replaces m007's `calculate_scorecard()` (lines 243-303) and `convert_scorecard_to_long()` (lines 306-314) with a catalog-driven loop:

```r
library(readr)

# m008 produces quarterly scorecards; every population-based denominator
# is scaled by this factor. A monthly scorecard module would use 1/12.
PERIOD_FRACTION <- 0.25

CALCULATED_DEFS_FILE <- CALCULATED_INDICATORS_FILE  # substituted by getScriptWithParameters
defs <- read_csv(CALCULATED_DEFS_FILE, show_col_types = FALSE)

build_num_denom_rows <- function(data, geo_cols) {
  rows <- list()

  for (i in seq_len(nrow(defs))) {
    def <- defs[i, ]
    sid <- def$calculated_indicator_id

    num_col <- def$num_indicator_id
    if (!(num_col %in% names(data))) {
      message(sprintf("Skipping '%s': missing numerator column %s", sid, num_col))
      next
    }
    num <- data[[num_col]]

    if (def$denom_kind == "indicator") {
      denom_col <- def$denom_indicator_id
      if (!(denom_col %in% names(data))) {
        message(sprintf("Skipping '%s': missing denominator column %s", sid, denom_col))
        next
      }
      denom <- data[[denom_col]]
    } else {  # "population"
      denom <- data$total_population *
               def$denom_population_fraction *
               PERIOD_FRACTION
    }

    rows[[sid]] <- data %>%
      select(all_of(geo_cols), quarter_id) %>%
      mutate(
        indicator_common_id = sid,
        numerator           = num,
        denominator         = denom,
      )
  }

  bind_rows(rows)
}
```

`PERIOD_FRACTION` is a module-level constant, not a catalog field. The catalog stores the indicator's annual population fraction (e.g. `0.22` for women 15-49); m008 multiplies by `0.25` to get the quarterly denominator. This keeps the catalog module-agnostic — see overview D3.

No `eval`. No `parse`. No sealed environment. No custom parser. Structural dispatch on `denom_kind`. Roughly fifteen lines of actual logic.

**Main execution block** collapses to one geo level:

```r
aa4_data <- process_geo_level("admin_area_4", adjusted_data, empty_cols)
aa4_rows <- build_num_denom_rows(aa4_data, geo_columns("admin_area_4"))
write_csv(aa4_rows, "M8_output_scorecard.csv")
```

Delete the AA2 and AA3 passes. The SQL query layer aggregates up dynamically via `disaggregateBy`.

**Drop `round(.x, 2)`** from the m007 pattern at [script.R:302](../wb-fastr-modules/m007/script.R#L302). m008 stores raw numerator and denominator. `SUM(num) / SUM(denom)` needs raw values; mid-pipeline rounding causes aggregation drift. This means m008 outputs will differ from m007 in the 3rd+ decimal place on aggregated values — correct, not a regression. Note in the smoke test.

## 2.12 — Module build & registration

Add `m008` to whatever the `wb-fastr-modules` repo's `build_definitions.ts` enumerates. Run `deno task build:modules` in the app repo to regenerate `module_defs_dist/` and verify m008 appears in the admin's install-module dropdown.

## 2.13 — Smoke test

In a scratch project that also has m007 installed:

1. **Import HMIS with the toggle on.** Open the HMIS dataset settings, confirm "Include calculated indicator catalogue" is checked (default), save. Verify `hmis.csv` AND `calculated_indicators.csv` both land at `{sandbox}/{projectId}/datasets/`. Verify the project's stored HMIS `info` JSON has a non-null `calculatedIndicatorsVersion` field.
2. **Toggle off and re-import.** Uncheck the new option, re-save HMIS settings. Verify `calculated_indicators.csv` is removed from the sandbox and `info.calculatedIndicatorsVersion` is `undefined`.
3. **Toggle back on, install m008, and run it.** Verify `M8_output_scorecard.csv` is produced with roughly `10 × areas × quarters` rows (long form, not wide).
4. **Render a scorecard presentation object on m8-01.** Verify it shows all 10 indicators, dynamically admin-area-level and period-selectable in the viz editor.
5. **Aggregated values match m007 to 2 decimal places.** Not bitwise — see the `round()` note in §2.11.
6. **Edit a calculated indicator in the instance catalogue** (e.g. change `penta3_coverage`'s numerator to something else). Verify:
   - The HMIS card on the Project Data tab now shows a "Calculated indicators changed" reason in its staleness panel.
   - Clicking "Update data" re-runs the HMIS import, which re-exports both `hmis.csv` and `calculated_indicators.csv`, and stores the new `calculatedIndicatorsVersion`.
   - The staleness warning clears.
   - m008 goes dirty and re-runs with the updated catalogue values.
   - Nothing was code-changed.
7. **HFA-only project regression check.** A project that has only HFA enabled (no HMIS) should not have any `calculated_indicators.csv` in its sandbox and should not crash when phase 2 ships.
8. **Verification task §2.10** passes against a real query through the enricher / postAgg / disaggregation path.

## Definition of done

- [ ] `DatasetType` union extended to include `"calculated_indicators"` (no `_POSSIBLE_DATASETS` entry — never rendered as its own card)
- [ ] `DatasetHmisWindowingCommon` has a new `includeCalculatedIndicatorCatalogue: boolean` field, default `true`
- [ ] `DatasetHmisInfoInProject` has a new `calculatedIndicatorsVersion: string | undefined` field
- [ ] `addDatasetHmisToProject` exports `calculated_indicators.csv` alongside `hmis.csv` when the toggle is on, and unlinks any stale catalogue file when the toggle is off
- [ ] `removeDatasetFromProject` for HMIS also unlinks `calculated_indicators.csv`
- [ ] HMIS settings UI exposes the "Include calculated indicator catalogue" checkbox with helper text and `?? true` fallback for projects loaded from pre-phase-2 `info` JSON
- [ ] HMIS card `stalenessCheck` includes "Calculated indicators changed" reason when the toggle is on and instance catalogue version differs from project snapshot
- [ ] Project Data tab still has only two cards (HMIS, HFA) — no third card for calculated indicators
- [ ] `wb-fastr-modules/m008/` exists with one results object, one metric, and the catalog-driven R script
- [ ] Diff of `wb-fastr-modules/m007/` against main: zero edits
- [ ] m008's `definition.json` declares `DataSource: "dataset"` entry for calculated indicators with `replacementString: "CALCULATED_INDICATORS_FILE"` and `datasetType: "calculated_indicators"`
- [ ] Zero changes to `run_module_iterator.ts` and `get_script_with_parameters.ts`
- [ ] m008's R script has no `eval`, no `parse`, no expression handling of any kind
- [ ] `BIRTHS_PCT` / `WOMEN_15_49_PCT` parameters deleted from m008's `definition.json`
- [ ] `valueLabelReplacements` omitted from m008's metric (catalog is source of truth)
- [ ] `deno task build:modules` picks up m008; it installs into a project cleanly
- [ ] Smoke test §2.13 passes end-to-end, including the toggle round-trip, the staleness round-trip, the HFA-only regression check, and the §2.10 verification
- [ ] `deno task typecheck` clean
