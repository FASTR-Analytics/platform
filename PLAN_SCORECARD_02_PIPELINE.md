# PLAN: Scorecard Phase 2 — Project Dataset Integration & m008

Make scorecard indicators a third `DatasetType`, reusing the existing per-project dataset import pipeline (HMIS / HFA) to export the catalog as a per-project CSV snapshot. Build `wb-fastr-modules/m008` to consume that snapshot via the existing `DataSource: "dataset"` resolver. m007 is not modified.

Depends on phase 1 (catalog table exists, seeded with the 10 current indicators). At the end of this phase, an admin enables "Scorecard indicators" on a project via the Project Data tab, m008 runs, and a scorecard presentation object on m008's metric renders correctly with dynamic admin-area-level and period selection.

## The architectural bet

Scorecard indicators fit the existing dataset-import-to-project pattern mechanically, even though they're config rather than observational data. Reusing that pipeline means **zero changes** to:

- [run_module_iterator.ts](server/worker_routines/run_module/run_module_iterator.ts) — no new staging hook
- [get_script_with_parameters.ts](server/server_only_funcs/get_script_with_parameters.ts) — the existing `sourceType === "dataset"` branch handles the new type automatically once it's added to `DatasetType`
- Module definition schema — no new capability flag

The only changes are: (a) add `"scorecard_indicators"` to the `DatasetType` union, (b) add a new `addScorecardIndicatorsToProject` function mirroring `addDatasetHfaToProject`, (c) add a new `Match` branch to [ProjectData](client/src/components/project/project_data.tsx) for the new card, (d) build m008 with a standard `dataSources` entry pointing at the new type. See overview D4 for the full rationale.

## 2.1 — Extend the `DatasetType` union

**Files:**

- [lib/types/datasets.ts](lib/types/datasets.ts) (or wherever `DatasetType` is declared)
- `_POSSIBLE_DATASETS` constant (used by [project_data.tsx:39](client/src/components/project/project_data.tsx#L39))

```ts
export type DatasetType = "hmis" | "hfa" | "scorecard_indicators";
```

Add a `_POSSIBLE_DATASETS` entry for scorecard indicators with:

- `datasetType: "scorecard_indicators"`
- `label: t3({ en: "Scorecard indicators", fr: "Indicateurs du scorecard" })`

No other properties are needed — unlike HMIS, there's no windowing, no facility filter, no time range.

## 2.2 — Per-project export function

**New file:** `server/db/project/datasets_in_project_scorecard_indicators.ts`. Mirrors [datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts) closely — HFA is the simpler analog (no windowing).

```ts
export async function addScorecardIndicatorsToProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (onProgress) await onProgress(0.1, "Removing existing snapshot...");
    const res = await removeDatasetFromProject(projectDb, projectId, "scorecard_indicators");
    throwIfErrNoData(res);

    if (onProgress) await onProgress(0.2, "Validating configuration...");
    const count = (await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM scorecard_indicators LIMIT 1
    `)[0].count;
    if (count === 0) {
      throw new Error("No scorecard indicators configured at the instance level.");
    }

    const datasetDirPath = getDatasetDirPath(projectId);
    await ensureDir(datasetDirPath);
    await Deno.chmod(datasetDirPath, 0o777);

    const datasetFilePathForPostgres = getDatasetFilePathForPostgres(
      projectId,
      "scorecard_indicators",
    );

    if (onProgress) await onProgress(0.5, "Exporting scorecard indicators to CSV...");

    // Flat SELECT — one row per scorecard indicator, all columns the R script needs.
    // Column order matches the CSV schema documented in the R script.
    const exportStatement = `
SELECT
  scorecard_indicator_id,
  label,
  group_label,
  sort_order,
  num_indicator_id,
  denom_kind,
  denom_indicator_id,
  denom_population_factor,
  denom_period_fraction,
  format_as,
  decimal_places,
  threshold_direction,
  threshold_green,
  threshold_yellow
FROM scorecard_indicators
ORDER BY sort_order, scorecard_indicator_id`;

    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

    if (onProgress) await onProgress(0.8, "Updating project database...");
    const lastUpdated = new Date().toISOString();
    const version = await getScorecardIndicatorsVersion(mainDb);

    const info = { version, count };

    await projectDb`
INSERT INTO datasets (dataset_type, info, last_updated)
VALUES (
  'scorecard_indicators',
  ${JSON.stringify(info)},
  ${lastUpdated}
)
ON CONFLICT (dataset_type) DO UPDATE SET
  info = EXCLUDED.info,
  last_updated = EXCLUDED.last_updated
`;

    return { success: true, data: { lastUpdated } };
  });
}
```

Uses the shared `getDatasetDirPath` / `getDatasetFilePathForPostgres` helpers from [datasets_in_project_hmis.ts](server/db/project/datasets_in_project_hmis.ts). Files land at `{sandbox}/{projectId}/datasets/scorecard_indicators.csv` — exactly the same location the existing `DataSource: "dataset"` resolver points to.

**Project DB `info` payload** is minimal: just `{ version, count }`. Unlike HMIS, there's no windowing or facility config to snapshot — the catalog is small and always imported in full. The `version` field drives staleness.

## 2.3 — Wire into `addDatasetToProject` dispatcher

The existing `addDatasetToProject` server action (called from [project_data.tsx:335-340](client/src/components/project/project_data.tsx#L335-L340)) dispatches on `datasetType`. Add a branch for `"scorecard_indicators"` that calls `addScorecardIndicatorsToProject`. `removeDatasetFromProject` in [datasets_in_project_hmis.ts:270-288](server/db/project/datasets_in_project_hmis.ts#L270-L288) already accepts an arbitrary `datasetType` and handles row deletion + file unlinking generically — no change needed there beyond making sure the `getDatasetFilePath` helper handles the new type (it's already parameterized on `datasetType`).

No new API route — the existing `addDatasetToProject` / `removeDatasetFromProject` routes in [server/routes/project/](server/routes/project/) handle the new type automatically via the dispatcher.

## 2.4 — `ProjectData` UI: third dataset card

**File:** [client/src/components/project/project_data.tsx](client/src/components/project/project_data.tsx)

Today the `For each={_POSSIBLE_DATASETS}` loop has three `Match` branches per possible dataset: one for HMIS (with windowing settings editor), one for HFA (simpler, no settings), and a fallback "Enable" button. Add a fourth `Match` branch for scorecard indicators, structurally identical to the HFA branch but simpler still (no settings editor at all).

The card renders:

- Card heading: "Scorecard indicators"
- Stale warning badge when `instanceState.scorecardIndicatorsVersion !== projectSnapshot.info.version`
- Last-exported timestamp
- "Update data" button (calls `addDatasetToProject({ datasetType: "scorecard_indicators" })`) — only shown when stale
- "Disable" button (calls `removeDatasetFromProject`)
- In the fallback/no-snapshot case: an "Enable" button

**Staleness check:**

```ts
const projectVersion = () => keyedProjectDatasetScorecard.info.version;
const instanceVersion = () => instanceState.scorecardIndicatorsVersion;
const isStale = () => {
  const inst = instanceVersion();
  const proj = projectVersion();
  return inst !== undefined && proj !== inst;
};
```

Simpler than HMIS (no structure check, no facility config check, no indicator mappings check). The catalog is a single small resource; one version field is enough.

## 2.5 — m008 scaffold

Copy `wb-fastr-modules/m007/` to `wb-fastr-modules/m008/`. Rename `m7*` / `M7_*` IDs to `m8*` / `M8_*`. Update `definition.json` module ID, label, and description.

**Parameters to delete from `definition.json`:** `BIRTHS_PCT`, `WOMEN_15_49_PCT`. Both are now catalog fields (`denom_population_factor` and `denom_period_fraction`), so the module-level constants are dead.

**Parameters to keep:** `SELECTED_COUNT_VARIABLE`, `INTERPOLATE_POPULATION`. These remain genuine module knobs — how to read HMIS counts, how to interpolate population between reference years.

`assetsToImport` keeps pointing at `total_population_NGA.csv`. m008 shares the population asset with m007.

## 2.6 — m008 `dataSources`

m008 declares two data sources in `definition.json`: the existing results-object input from m002, plus a new dataset entry pointing at scorecard indicators.

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
    "replacementString": "SCORECARD_INDICATORS_FILE",
    "datasetType": "scorecard_indicators"
  }
]
```

The existing branch at [get_script_with_parameters.ts:35-38](server/server_only_funcs/get_script_with_parameters.ts#L35-L38) substitutes `SCORECARD_INDICATORS_FILE` → `'../datasets/scorecard_indicators.csv'` automatically. **No changes to `get_script_with_parameters.ts`.** The R script has a bare `SCORECARD_INDICATORS_FILE` token where the filename goes, and after substitution it reads as normal R.

**Prerequisite:** m008's `prerequisites` array stays as `["m002"]` — unchanged from m007. The task manager already enforces that m002 must run first so that `M2_adjusted_data.csv` exists in the m002 sandbox. Scorecard indicators are staged via the project-dataset pipeline (§2.2) before the module runs, not as a module prerequisite.

## 2.7 — m008 results object

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

## 2.8 — m008 metric

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

**Mandatory verification task before shipping 2.8.** No existing module combines (a) a TEXT disaggregation column and (b) a two-ingredient `postAggregationExpression`. m008 is the first. Manually verify on a scratch query:

1. A scorecard presentation object on `m8-01` with `indicator_common_id` selected as disaggregation.
2. `buildAggregateColumns()` at [query_helpers.ts:245-259](server/server_only_funcs_presentation_objects/query_helpers.ts#L245-L259) emits `SUM(numerator), SUM(denominator)` in the SELECT clause.
3. `GROUP BY` includes `indicator_common_id`.
4. The post-aggregation expression wraps correctly producing one `value` column.
5. Aggregating up to AA2 and AA3 via `disaggregateBy` also works.

This is the one place the whole plan's aggregation story could break. Confirm it works against a real DB before declaring 2.8 done.

## 2.9 — m008 R script

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

SCORECARD_DEFS_FILE <- SCORECARD_INDICATORS_FILE  # substituted by getScriptWithParameters
defs <- read_csv(SCORECARD_DEFS_FILE, show_col_types = FALSE)

build_num_denom_rows <- function(data, geo_cols) {
  rows <- list()

  for (i in seq_len(nrow(defs))) {
    def <- defs[i, ]
    sid <- def$scorecard_indicator_id

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
               def$denom_population_factor *
               def$denom_period_fraction
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

No `eval`. No `parse`. No sealed environment. No custom parser. Structural dispatch on `denom_kind`. Roughly fifteen lines of actual logic.

**Main execution block** collapses to one geo level:

```r
aa4_data <- process_geo_level("admin_area_4", adjusted_data, empty_cols)
aa4_rows <- build_num_denom_rows(aa4_data, geo_columns("admin_area_4"))
write_csv(aa4_rows, "M8_output_scorecard.csv")
```

Delete the AA2 and AA3 passes. The SQL query layer aggregates up dynamically via `disaggregateBy`.

**Drop `round(.x, 2)`** from the m007 pattern at [script.R:302](../wb-fastr-modules/m007/script.R#L302). m008 stores raw numerator and denominator. `SUM(num) / SUM(denom)` needs raw values; mid-pipeline rounding causes aggregation drift. This means m008 outputs will differ from m007 in the 3rd+ decimal place on aggregated values — correct, not a regression. Note in the smoke test.

## 2.10 — Module build & registration

Add `m008` to whatever the `wb-fastr-modules` repo's `build_definitions.ts` enumerates. Run `deno task build:modules` in the app repo to regenerate `module_defs_dist/` and verify m008 appears in the admin's install-module dropdown.

## 2.11 — Smoke test

In a scratch project that also has m007 installed:

1. **Enable scorecard indicators on the project.** In the Project Data tab, click "Enable" on the new Scorecard indicators card. Verify the CSV lands at `{sandbox}/{projectId}/datasets/scorecard_indicators.csv` with 10 rows.
2. **Install m008 and run it.** Verify `M8_output_scorecard.csv` is produced with roughly `10 × areas × quarters` rows (long form, not wide).
3. **Render a scorecard presentation object on m8-01.** Verify it shows all 10 indicators, dynamically admin-area-level and period-selectable in the viz editor.
4. **Aggregated values match m007 to 2 decimal places.** Not bitwise — see the `round()` note in §2.9.
5. **Edit a scorecard indicator in the catalog** (e.g. change `penta3_coverage`'s numerator to something else). Verify:
   - The Project Data card shows a "Scorecard indicators updated in instance" staleness warning.
   - Clicking "Update data" re-exports the CSV and marks m008 dirty.
   - Re-running m008 produces updated values.
   - Nothing was code-changed.
6. **Verification task §2.8** passes against a real query through the enricher / postAgg / disaggregation path.

## Definition of done

- [ ] `DatasetType` union extended to include `"scorecard_indicators"`
- [ ] `_POSSIBLE_DATASETS` has a "Scorecard indicators" entry
- [ ] `server/db/project/datasets_in_project_scorecard_indicators.ts` exposes `addScorecardIndicatorsToProject`
- [ ] `addDatasetToProject` dispatcher routes `"scorecard_indicators"` to the new function
- [ ] `removeDatasetFromProject` and `getDatasetFilePath` handle the new type (verify — likely already generic)
- [ ] ProjectData UI has a third `Match` branch for scorecard indicators with enable / disable / update / staleness
- [ ] Staleness check uses `instanceState.scorecardIndicatorsVersion` vs project-snapshot version
- [ ] `wb-fastr-modules/m008/` exists with one results object, one metric, and the catalog-driven R script
- [ ] Diff of `wb-fastr-modules/m007/` against main: zero edits
- [ ] m008's `definition.json` declares `DataSource: "dataset"` entry for scorecard indicators with `replacementString: "SCORECARD_INDICATORS_FILE"` and `datasetType: "scorecard_indicators"`
- [ ] Zero changes to `run_module_iterator.ts` and `get_script_with_parameters.ts`
- [ ] m008's R script has no `eval`, no `parse`, no expression handling of any kind
- [ ] `BIRTHS_PCT` / `WOMEN_15_49_PCT` parameters deleted from m008's `definition.json`
- [ ] `valueLabelReplacements` omitted from m008's metric (catalog is source of truth)
- [ ] `deno task build:modules` picks up m008; it installs into a project cleanly
- [ ] Smoke test §2.11 passes end-to-end, including the staleness round-trip and §2.8 verification
- [ ] `deno task typecheck` clean
