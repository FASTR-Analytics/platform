# PLAN: Scorecard Phase 2 — m008 + HMIS-Coupled Catalogue Snapshot (DB-table version)

Build `wb-fastr-modules/m008` and wire the calculated indicator catalogue into the existing HMIS dataset import pipeline. The catalogue travels as a project-DB snapshot, populated atomically inside the HMIS import transaction — the same pattern HMIS common indicators, HMIS facilities, and HFA indicators already use. m007 is not modified.

Depends on phase 1 (shipped): `calculated_indicators` table at instance level with seeded rows and CRUD UI. At the end of this phase, an admin imports HMIS data into a project (with the new toggle on), m008 installs and runs, and a scorecard presentation object on m008's metric renders correctly with dynamic admin-area-level and period selection.

## The architectural bet

Calculated indicators are inherently coupled to HMIS data. m008 needs both: HMIS counts (via m002's `M2_adjusted_data.csv`) and the catalogue defining how those counts get combined. Letting them drift out of sync produces silently wrong scorecard values. Coupling the two at import time eliminates that class of bug.

Design principles:

- The catalogue is **not** a standalone project resource. No `_POSSIBLE_DATASETS` card, no separate enable/disable lifecycle.
- It piggybacks on `addDatasetHmisToProject`: when HMIS is imported, the catalogue is snapshotted from the instance DB into the project DB as a side-effect, in the same `projectDb.begin()` transaction.
- A single boolean `includeCalculatedIndicatorCatalogue` on the HMIS windowing config gates it, default `true`. Power users (HFA-only projects) can opt out.
- The HMIS card's existing staleness check picks up catalogue drift as one more reason to refresh.
- m008's R script is generated server-side (the HFA pattern): per-indicator computation blocks are inlined into the script from the snapshot at run time. No `eval`, no `parse`, no expression parsing, no CSV dispatch loop.

## Why DB-table + codegen, not CSV

Every other "indicator-like metadata" snapshot in this system already lives as a project-DB table populated inside the import transaction:

| Snapshot | Instance source | Project destination |
| --- | --- | --- |
| HMIS common indicators | `indicators` (instance) | `indicators` (project DB) |
| HMIS facilities | `facilities` (instance) | `facilities` (project DB) |
| HFA indicator defs | `hfa_indicators` (instance) | `hfa_indicators_snapshot` (project DB) |
| HFA indicator R code | `hfa_indicator_code` (instance) | `hfa_indicator_code_snapshot` (project DB) |

HFA's recent refactor (PLAN_hfa_01) established the codegen + DB-snapshot pattern explicitly: the R script for hfa001 is generated server-side by inlining per-indicator R code read from the project snapshot. The result is a static-looking script on disk, no runtime catalog read on the R side, atomicity enforced by the DB transaction.

The same pattern applies cleanly to calculated indicators. m008's script becomes N blocks of concrete arithmetic (one per catalog row), inlined at generation time. No CSV in the sandbox, no CSV lifecycle (unlink-on-toggle-off, unlink-on-removeDataset), no `DatasetType` extension for a thing that isn't a dataset. Consistent with HMIS and HFA.

## 2.1 — Project DB snapshot table

**New migration:** `server/db/migrations/project/014_add_calculated_indicators_snapshot.sql`

```sql
CREATE TABLE IF NOT EXISTS calculated_indicators_snapshot (
  calculated_indicator_id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  group_label text NOT NULL,
  sort_order integer NOT NULL,
  num_indicator_id text NOT NULL,
  denom_kind text NOT NULL,
  denom_indicator_id text,
  denom_population_fraction double precision,
  format_as text NOT NULL,
  decimal_places integer NOT NULL,
  threshold_direction text NOT NULL,
  threshold_green double precision NOT NULL,
  threshold_yellow double precision NOT NULL
);
```

Mirrors the instance-level `calculated_indicators` table. Same DDL also added to [server/db/project/_project_database.sql](server/db/project/_project_database.sql) so fresh DBs get it directly. Use migration number `014` (branch's hfa work is `012` and `013`; next free is `014`).

## 2.2 — HMIS dataset config gains toggle + version

**File:** [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts) — wherever `DatasetHmisWindowingCommon` lives.

```ts
export type DatasetHmisWindowingCommon = {
  // ...existing windowing fields...
  includeCalculatedIndicatorCatalogue: boolean;
};
```

Default `true` when adding HMIS to a new project. Pre-phase-2 `info` JSON loaded from the DB gets `?? true` at read time.

**File:** [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts) — `DatasetHmisInfoInProject`:

```ts
export type DatasetHmisInfoInProject = {
  // ...existing fields...
  calculatedIndicatorsVersion: string | undefined;  // undefined when toggle is off
};
```

`calculatedIndicatorsVersion` is the staleness signal, compared client-side against `instanceState.calculatedIndicatorsVersion`. When the toggle is off, this field is `undefined` — the staleness check short-circuits, catalogue drift is irrelevant for that project.

## 2.3 — `addDatasetHmisToProject` snapshots catalogue in the existing transaction

**File:** [server/db/project/datasets_in_project_hmis.ts](server/db/project/datasets_in_project_hmis.ts)

Alongside the existing `indicators` / `facilities` repopulation in the `projectDb.begin()` block (around [line 250](server/db/project/datasets_in_project_hmis.ts#L250)), add a gated snapshot:

```ts
// Fetch catalogue from instance DB before the transaction — matches the pattern
// for indicators/facilities above.
let calculatedIndicatorsRows: CalculatedIndicator[] = [];
let calculatedIndicatorsVersion: string | undefined = undefined;
if (startingWindowing.includeCalculatedIndicatorCatalogue) {
  calculatedIndicatorsRows = await getAllCalculatedIndicators(mainDb);
  calculatedIndicatorsVersion = await getCalculatedIndicatorsVersion(mainDb);
}

// Inside the existing projectDb.begin((sql) => [...]) array:
sql`DELETE FROM calculated_indicators_snapshot`,
...calculatedIndicatorsRows.map(
  (ci) => sql`
    INSERT INTO calculated_indicators_snapshot
      (calculated_indicator_id, label, group_label, sort_order,
       num_indicator_id, denom_kind, denom_indicator_id, denom_population_fraction,
       format_as, decimal_places, threshold_direction, threshold_green, threshold_yellow)
    VALUES
      (${ci.calculated_indicator_id}, ${ci.label}, ${ci.group_label}, ${ci.sort_order},
       ${ci.num_indicator_id}, ${ci.denom_kind}, ${ci.denom_indicator_id}, ${ci.denom_population_fraction},
       ${ci.format_as}, ${ci.decimal_places}, ${ci.threshold_direction}, ${ci.threshold_green}, ${ci.threshold_yellow})
  `,
),
```

And thread `calculatedIndicatorsVersion` into the `info` payload stored in `datasets.info`:

```ts
const info: DatasetHmisInfoInProject = {
  // ...existing fields...
  calculatedIndicatorsVersion,
};
```

When the toggle is off, `calculatedIndicatorsRows` is empty, the `DELETE` runs, no `INSERT`s run, and `calculatedIndicatorsVersion` is `undefined`. Clean.

`getAllCalculatedIndicators` and `getCalculatedIndicatorsVersion` already exist at instance level ([server/db/instance/calculated_indicators.ts](server/db/instance/calculated_indicators.ts) and [server/db/instance/instance.ts](server/db/instance/instance.ts) respectively).

## 2.4 — `removeDatasetFromProject` clears the snapshot

**File:** [server/db/project/datasets_in_project_hmis.ts:270-288](server/db/project/datasets_in_project_hmis.ts#L270-L288)

In the `datasetType === "hmis"` branch (around [line 282](server/db/project/datasets_in_project_hmis.ts#L282)), add one more DELETE:

```ts
...(datasetType === "hmis"
  ? [
      sql`DELETE FROM indicators`,
      sql`DELETE FROM facilities`,
      sql`DELETE FROM calculated_indicators_snapshot`,
    ]
  : ...
```

No sandbox file unlink, no orphan file concern. The snapshot table is cleared as part of the same transaction that deletes the `datasets` row.

## 2.5 — HMIS settings UI: opt-in checkbox

**File:** `client/src/components/project/settings_for_project_dataset_hmis.tsx`

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

Helper text:

> *"Required for the scorecard module. When enabled, the current instance catalogue is copied into the project on every HMIS update, keeping scorecard computations in sync with your data."*

Default `true` for new imports. Legacy `info` JSON gets `?? true` at read time.

## 2.6 — HMIS card surfaces catalogue staleness

**File:** [client/src/components/project/project_data.tsx](client/src/components/project/project_data.tsx) — the HMIS card's `stalenessCheck` at lines 56-95.

Add one more reason:

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

Toggle off → no staleness signal. Toggle on and instance moved → "Update data" refreshes both atomically.

Only place catalogue staleness surfaces. No separate card. One click, one consistent snapshot — same UX as HFA.

## 2.7 — m008 scaffold

Copy `wb-fastr-modules/m007/` to `wb-fastr-modules/m008/`. Rename `m7*` / `M7_*` → `m8*` / `M8_*`. Update `definition.json` module ID, label, description.

**Parameters to delete:** `BIRTHS_PCT`, `WOMEN_15_49_PCT`. Replaced by `denom_population_fraction` in the catalog.

**Parameters to keep:** `SELECTED_COUNT_VARIABLE`, `INTERPOLATE_POPULATION`. Genuine module knobs.

**New module-level constant in `script.R`:** `PERIOD_FRACTION <- 0.25`. m008's temporal choice (quarterly scorecards). Not a catalog field, not user-configurable — fixed part of what m008 is. A hypothetical monthly scorecard module would set `PERIOD_FRACTION <- 1/12` and consume the same catalog unchanged.

`assetsToImport` keeps pointing at `total_population_NGA.csv`. m008 shares the population asset with m007.

## 2.8 — m008 `dataSources` + `scriptGenerationType`

m008 declares one dataSource (HMIS results from m002). Catalogue is NOT declared here — it's injected by codegen, not resolved as a CSV.

```jsonc
"dataSources": [
  {
    "sourceType": "results_object",
    "replacementString": "M2_adjusted_data.csv",
    "resultsObjectId": "M2_adjusted_data.csv",
    "moduleId": "m002"
  }
]
```

**New:** `scriptGenerationType: "calculated_indicators"` (mirrors `"hfa"`).

Add to enum in [lib/types/module_definition_schema.ts](lib/types/module_definition_schema.ts):

```ts
export type ScriptGenerationType = "template" | "hfa" | "calculated_indicators";
```

Update the Zod schema in `module_definition_validator.ts`.

**Prerequisites:** `["m002"]` — same as m007.

**Implicit HMIS dependency** (explicit here): m008 fails at runtime if the project has no HMIS dataset (m002 never ran) OR if HMIS was imported with the catalogue toggle off (snapshot table is empty). See §2.9 for the runner precheck that makes the second failure user-friendly.

## 2.9 — Codegen: extend script generation pipeline

**File:** [server/server_only_funcs/get_script_with_parameters.ts](server/server_only_funcs/get_script_with_parameters.ts)

Add a third branch analogous to HFA:

```ts
if (moduleDefinition.scriptGenerationType === "calculated_indicators") {
  if (!calculatedIndicators) {
    throw new Error(
      "calculatedIndicators is required for calculated_indicators script generation",
    );
  }
  return getScriptWithParametersCalculatedIndicators(
    moduleDefinition,
    configSelections,
    countryIso3,
    calculatedIndicators,
  );
}
```

Add parameter `calculatedIndicators?: CalculatedIndicator[]` to the signature.

**New file:** `server/server_only_funcs/get_script_with_parameters_calculated_indicators.ts`

Structure:

1. Run the same template substitutions as the default branch (COUNTRY_ISO3, dataSources, parameters).
2. After those, substitute a marker `__CALCULATED_INDICATOR_BLOCKS__` in the script with server-generated R code (one block per catalog row, inlining numerator/denominator sources).

The generated block for each indicator:

```r
# <indicator_id>
{
  num_col <- "<num_indicator_id>"
  denom <- <denom_expression>  # either data[[denom_indicator_id]]
                                # or data$total_population * <fraction> * PERIOD_FRACTION
  if (num_col %in% names(data)) {
    rows_<i> <- data %>%
      select(all_of(geo_cols), quarter_id) %>%
      mutate(indicator_common_id = "<indicator_id>",
             numerator = data[[num_col]],
             denominator = denom)
  } else {
    message("Skipping '<indicator_id>': missing column ", num_col)
    rows_<i> <- tibble()
  }
}
```

Final combined output built by concatenating `rows_1, rows_2, …` via `bind_rows`. The function's output is a closed-form R script with no runtime dispatch; each indicator is a literal block.

No `eval`, no `parse`, no CSV read. Just server-side string generation, with the safe-identifier rule specified in §2.9a.

## 2.9a — Safe-identifier validation for catalogue IDs

Three fields on a `CalculatedIndicator` are interpolated into the generated R script: `calculated_indicator_id`, `num_indicator_id`, and `denom_indicator_id` (when `denom_kind === "indicator"`). All three flow into R string literals (`"<id>"` inside `mutate(indicator_common_id = "<id>")` and `data[["<id>"]]`). A well-formed value is safe because it sits inside quotes; a value containing `"`, backslash, newline, or `$` breaks out of the quoted context and allows arbitrary R injection.

Rather than try to escape everything correctly for R string semantics, we regex-gate these fields to a known-safe character set. The rule below accepts every seed-catalogue ID and every convention in common use elsewhere in the codebase, while rejecting every character that could start an R escape.

### 2.9a.1 — The canonical identifier helper

**New file:** `lib/types/calculated_indicator_id.ts`

```ts
// A calculated-indicator ID must be a short lowercase slug:
//   - starts with a lowercase letter
//   - followed by lowercase letters, digits, or underscores
//   - at most 64 characters total
// This accepts every seed catalogue ID and rejects every character that
// can escape an R double-quoted string literal ("  \  $  newline  etc.).
// Applied to calculated_indicator_id, num_indicator_id, denom_indicator_id.
export const CALCULATED_INDICATOR_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function isValidCalculatedIndicatorIdentifier(value: string): boolean {
  return CALCULATED_INDICATOR_ID_PATTERN.test(value);
}

export function assertValidCalculatedIndicatorIdentifier(
  value: string,
  fieldName: string,
): void {
  if (!isValidCalculatedIndicatorIdentifier(value)) {
    throw new Error(
      `Invalid calculated-indicator identifier for field ${fieldName}: ${JSON.stringify(value)}. ` +
      `Must match ${CALCULATED_INDICATOR_ID_PATTERN.source} (lowercase letter, then lowercase letters/digits/underscores, max 64 chars).`,
    );
  }
}
```

Export both helpers from `lib/types/mod.ts` so client + server can use them.

### 2.9a.2 — Apply at save time in the server route

**File:** [server/routes/instance/calculated_indicators.ts](server/routes/instance/calculated_indicators.ts)

At the top of the `addCalculatedIndicator` handler and the `updateCalculatedIndicator` handler, validate all three ID fields before passing to the DB layer:

```ts
import {
  assertValidCalculatedIndicatorIdentifier,
} from "lib";

// Inside each handler, before the DB call:
try {
  assertValidCalculatedIndicatorIdentifier(
    indicator.calculated_indicator_id,
    "calculated_indicator_id",
  );
  assertValidCalculatedIndicatorIdentifier(
    indicator.num_indicator_id,
    "num_indicator_id",
  );
  if (indicator.denom.kind === "indicator") {
    assertValidCalculatedIndicatorIdentifier(
      indicator.denom.indicator_id,
      "denom_indicator_id",
    );
  }
} catch (err) {
  return { success: false as const, err: (err as Error).message };
}
```

The server is the authoritative defence. Any client (including future scripted clients) that tries to save an invalid row is rejected with a clear message.

### 2.9a.3 — Apply at save time in the catalogue editor UI

**File:** [client/src/components/indicators/calculated_indicator_editor.tsx](client/src/components/indicators/calculated_indicator_editor.tsx)

Two reasons to duplicate validation on the client:

1. Immediate feedback — user sees the error inline while typing, not after hitting Save.
2. Prevents a round-trip for obvious errors.

Add:

```ts
import { isValidCalculatedIndicatorIdentifier } from "lib";

// At the start of the save button's click handler, OR as a derived `formErrors`
// signal that the save button watches:
const idError = () =>
  !isValidCalculatedIndicatorIdentifier(tempIndicator.calculated_indicator_id)
    ? t3({
        en: "ID must be lowercase letters, digits, and underscores only (max 64 chars, starts with a letter).",
        fr: "L'identifiant doit contenir uniquement des lettres minuscules, chiffres et tirets bas (max 64 caractères, commence par une lettre).",
      })
    : null;

// Similar for numeratorIdError and denominatorIdError.

// The Save button is disabled when any of the three returns non-null,
// and the corresponding field shows the error text below it.
```

Apply the same check to the numerator-indicator and denominator-indicator fields. These are typed-dropdowns referencing common-indicator IDs — the common-indicator IDs MUST themselves pass the same rule (see §2.9a.5). If a common indicator somehow has a non-conforming ID in the DB, the dropdown option is either hidden or marked as disabled with a tooltip explaining the constraint.

### 2.9a.4 — Apply at codegen time as defence in depth

**File:** `server/server_only_funcs/get_script_with_parameters_calculated_indicators.ts` (new, per §2.9)

Before emitting any R block, assert every ID field on every row:

```ts
import { assertValidCalculatedIndicatorIdentifier } from "lib";

for (const ci of calculatedIndicators) {
  assertValidCalculatedIndicatorIdentifier(ci.calculated_indicator_id, "calculated_indicator_id");
  assertValidCalculatedIndicatorIdentifier(ci.num_indicator_id, "num_indicator_id");
  if (ci.denom.kind === "indicator") {
    assertValidCalculatedIndicatorIdentifier(ci.denom.indicator_id, "denom_indicator_id");
  }
}
```

If this ever throws, something slipped past §2.9a.2 (e.g. a direct DB edit, a data migration, or a bug in save-validation). Throwing here is the correct behaviour: module run fails loudly at script-generation time with a clear error rather than generating a script with an injected payload.

### 2.9a.5 — One-time audit of existing catalogue and common indicators

**Not a code change. A reviewer task before merge.**

Run the audit query against the dev / staging instance DB:

```sql
-- Must return zero rows.
SELECT calculated_indicator_id, num_indicator_id, denom_indicator_id
FROM calculated_indicators
WHERE calculated_indicator_id !~ '^[a-z][a-z0-9_]{0,63}$'
   OR num_indicator_id         !~ '^[a-z][a-z0-9_]{0,63}$'
   OR (denom_indicator_id IS NOT NULL
       AND denom_indicator_id  !~ '^[a-z][a-z0-9_]{0,63}$');

-- And for the soft-ref target:
SELECT indicator_common_id
FROM indicators
WHERE indicator_common_id !~ '^[a-z][a-z0-9_]{0,63}$';
```

Seed catalogue (10 rows) passes — confirmed by inspection ([`019_add_calculated_indicators.sql`](server/db/migrations/instance/019_add_calculated_indicators.sql)). If `indicators` has any row that fails the pattern, either (a) extend the regex to accept that convention and update the helper consistently, or (b) treat those rows as unlink-from-catalog candidates. Decision deferred to the reviewer based on audit output, but NOT left ambiguous — the audit must be run and its outcome must determine the code.

### 2.9a.6 — Test coverage

Add a unit test for the helper:

```ts
// lib/types/calculated_indicator_id_test.ts
Deno.test("isValidCalculatedIndicatorIdentifier — accepts seed catalogue IDs", () => {
  for (const id of [
    "anc4_anc1_ratio", "penta3_coverage", "htn_new_per_10000",
    "fully_immunized_coverage", "nhmis_data_timeliness_final",
  ]) {
    assertEquals(isValidCalculatedIndicatorIdentifier(id), true, id);
  }
});

Deno.test("isValidCalculatedIndicatorIdentifier — rejects injection attempts", () => {
  for (const bad of [
    '"; system("rm -rf /"); "',
    "foo\\nbar",
    "foo bar",
    "FooBar",        // uppercase
    "foo-bar",       // hyphen
    "1foo",          // starts with digit
    "",              // empty
    "a".repeat(65),  // too long
    "foo.bar",       // dot
    "foo$bar",       // dollar
  ]) {
    assertEquals(isValidCalculatedIndicatorIdentifier(bad), false, bad);
  }
});
```

## 2.10 — Module runner reads the snapshot and passes to codegen

**File:** [server/worker_routines/run_module/run_module_iterator.ts](server/worker_routines/run_module/run_module_iterator.ts)

Parallel to the HFA branch (around [line 110-130](server/worker_routines/run_module/run_module_iterator.ts#L110-L130)), add:

```ts
let calculatedIndicators: CalculatedIndicator[] | undefined;
if (moduleDetail.moduleDefinition.scriptGenerationType === "calculated_indicators") {
  calculatedIndicators = await getAllCalculatedIndicatorsFromSnapshot(projectDb);
  if (calculatedIndicators.length === 0) {
    throw new Error(
      "No calculated indicators in project snapshot. Re-import HMIS data with 'Include calculated indicator catalogue' enabled.",
    );
  }
}
```

Pass `calculatedIndicators` through to `getScriptWithParameters`.

**New file:** `server/db/project/calculated_indicators_snapshot.ts` exporting `getAllCalculatedIndicatorsFromSnapshot(projectDb)` — mirrors `getAllHfaIndicatorsFromSnapshot`.

## 2.11 — Script preview route reads the snapshot

**File:** [server/routes/project/modules.ts](server/routes/project/modules.ts) — preview route around [line 249](server/routes/project/modules.ts#L249).

Same pattern as for HFA: if `scriptGenerationType === "calculated_indicators"`, fetch the snapshot and pass to `getScriptWithParameters`. Without this, preview generates a different script than the actual run.

## 2.12 — m008 results object

**File:** `wb-fastr-modules/m008/_results_objects.ts`

One results object at AA4 grain (D1 in `PLAN_SCORECARD_00_OVERVIEW.md`):

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

## 2.13 — m008 metric

**File:** `wb-fastr-modules/m008/_metrics.ts`

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

`valueLabelReplacements` omitted — catalog is source of truth, looked up client-side at render time in phase 3. During the phase-2-only window (if any), scorecards render with raw `indicator_common_id` values (`penta3_coverage` not "Penta 3"). Accept this as interim, OR sequence phase 3 to land immediately after.

**Mandatory verification before shipping 2.13.** No existing module combines TEXT disaggregation + two-ingredient `postAggregationExpression`. m008 is the first. Manually verify on a scratch query:

1. Scorecard PO on `m8-01` with `indicator_common_id` as disaggregation.
2. `buildAggregateColumns()` at [query_helpers.ts:245](server/server_only_funcs_presentation_objects/query_helpers.ts#L245) emits `SUM(numerator), SUM(denominator)` in the SELECT.
3. `GROUP BY` includes `indicator_common_id`.
4. Post-aggregation expression wraps correctly producing one `value` column.
5. Aggregating up to AA2/AA3 via `disaggregateBy` also works.

This is the one place the aggregation story could break. Confirm against a real DB before declaring 2.13 done.

## 2.14 — m008 R script

**File:** `wb-fastr-modules/m008/script.R`

Copy m007's script. Keep everything upstream of the scorecard compute block unchanged (library loads, `read_csv` of `M2_adjusted_data.csv`, nhmis derivation, quarter detection, `merge_population`, wide pivot).

Replace m007's `calculate_scorecard()` + `convert_scorecard_to_long()` (m007/script.R:243-314) with a marker and a combining call:

```r
PERIOD_FRACTION <- 0.25

build_num_denom_rows <- function(data, geo_cols) {
  __CALCULATED_INDICATOR_BLOCKS__
  bind_rows(rows_1, rows_2, rows_3, ...)  # generator emits the concrete list
}
```

The generator in §2.9 substitutes both the blocks AND the `bind_rows` call with the correct variable list.

**Main execution:**

```r
aa4_data <- process_geo_level("admin_area_4", adjusted_data, empty_cols)
aa4_rows <- build_num_denom_rows(aa4_data, geo_columns("admin_area_4"))
write_csv(aa4_rows, "M8_output_scorecard.csv")
```

Delete the AA2 and AA3 passes (SQL aggregates up via `disaggregateBy`).

**Drop `round(.x, 2)`** from the m007 pattern at m007/script.R:302. m008 stores raw num/denom; SUM(num)/SUM(denom) needs raw values; mid-pipeline rounding causes aggregation drift. Aggregated values will differ from m007 in the 3rd+ decimal place — correct, not a regression.

## 2.15 — Module build & registration

Add `m008` to the modules repo build. Run `deno task build:modules` in the app repo to regenerate `module_defs_dist/` and verify m008 appears in the admin's install-module dropdown.

## 2.16 — Smoke test

Scratch project with m007 also installed for comparison.

1. **Import HMIS with toggle on.** Open HMIS settings, confirm "Include calculated indicator catalogue" is checked, save. Verify `hmis.csv` exists in sandbox; verify `calculated_indicators_snapshot` in project DB has N rows (one per catalog entry); verify HMIS `info.calculatedIndicatorsVersion` is non-null.
2. **Toggle off and re-import.** Uncheck, save. Verify `calculated_indicators_snapshot` is empty; verify `info.calculatedIndicatorsVersion` is `undefined`.
3. **Toggle back on, install m008, run.** Verify `M8_output_scorecard.csv` is produced with roughly `10 × areas × quarters` rows (long form).
4. **Render a scorecard PO on m8-01.** Verify all 10 indicators appear, dynamically admin-area-selectable and period-selectable in the editor.
5. **Aggregated values match m007 to 2 decimal places.** Manual spot-check: pick 3 (indicator × area × quarter) cells, compare m007 vs m008 values. Not bitwise — see the `round()` note in §2.14.
6. **Edit a calculated indicator at the instance level** (change `penta3_coverage`'s numerator). Verify:
   - HMIS card on Project Data tab shows "Calculated indicators changed" reason.
   - Clicking "Update data" refreshes HMIS + snapshot atomically, stores new version.
   - Staleness clears.
   - m008 goes dirty, re-runs, produces new values.
7. **HFA-only project regression.** A project with only HFA enabled should not crash when phase 2 ships; `calculated_indicators_snapshot` is empty there, m008 not installed, nothing references the snapshot.
8. **Toggle off + install m008 failure UX.** Import HMIS with toggle off, install m008, run. Verify the runner throws the friendly error from §2.10 ("No calculated indicators in project snapshot. Re-import HMIS data..."), NOT a cryptic R error.
9. **Verification task §2.13** passes against a real query through enricher / postAgg / disaggregation.
10. **HMIS "View common indicators" modal.** Import HMIS, click the button on the HMIS card. Modal opens, fetches fresh from server, lists every `indicator_common_id` / `indicator_common_label` snapshotted in the project. Close and reopen → refetches (no stale data).
11. **HMIS "View calculated indicators" modal.** With toggle on, click the button on the HMIS card. Modal lists all 10 seed rows with label, group, numerator, denominator details, format, thresholds. Toggle off and reload the page: verify the button is hidden (nothing to view).
12. **HFA "View HFA indicators" modal.** Enable HFA, click the button on the HFA card. Modal lists indicators with `var_name`, `category`, `definition`, `type`, `aggregation`. Each row is expandable to show per-time-point `r_code` and `r_filter_code` fragments verbatim in a monospaced block.

## 2.17 — "View associated indicators" modals

Three read-only modals on the Project Data tab, giving users direct visibility into what indicator metadata and R code lives in their project. Transparency feature. Tier 3 state per [DOC_STATE_MGT_TIERS.md](DOC_STATE_MGT_TIERS.md) — fetched fresh on modal open, not cached, not SSE-subscribed.

### 2.17.1 — Server routes

**New file:** `server/routes/project/indicators.ts`

Three GET endpoints on the project scope, each using `requireProjectPermission` (`"view"` role sufficient — read-only):

```ts
GET /projects/:projectId/indicators/hmis
  → APIResponseWithData<{ indicator_common_id: string; indicator_common_label: string }[]>

GET /projects/:projectId/indicators/hfa
  → APIResponseWithData<HfaIndicatorWithCode[]>
    where HfaIndicatorWithCode = HfaIndicator & {
      code: { time_point: string; r_code: string; r_filter_code: string | null }[]
    }

GET /projects/:projectId/indicators/calculated
  → APIResponseWithData<CalculatedIndicator[]>
```

Each endpoint reads the project DB and returns a flat array. No pagination — these tables are small (tens of rows).

### 2.17.2 — Server DB helpers

Some helpers already exist from earlier work; add the two missing ones:

- **`getAllCommonIndicatorsForProject(projectDb)`** — new, in `server/db/project/datasets_in_project_hmis.ts`. Returns `{ indicator_common_id, indicator_common_label }[]` from the project's `indicators` table.
- **`getAllHfaIndicatorsWithCodeForProject(projectDb)`** — new, in `server/db/project/datasets_in_project_hfa.ts`. Combines `getAllHfaIndicatorsFromSnapshot` (already exists, added in PLAN_hfa_01) with `getAllHfaIndicatorCodeFromSnapshot` (also exists) and returns the indicators each with their per-time-point code rows attached. One query per table; join in-memory (simpler than a single SQL join for this size).
- **`getAllCalculatedIndicatorsFromSnapshot(projectDb)`** — added as part of §2.10. Reuse as-is.

### 2.17.3 — API route declarations

**File:** `lib/api-routes/mod.ts` (or wherever route defs live — use the same location as the other `/projects/:id/...` routes)

Add three entries: `getHmisIndicatorsForProject`, `getHfaIndicatorsForProject`, `getCalculatedIndicatorsForProject`. Each with the corresponding response type from §2.17.1.

### 2.17.4 — Client modal component

**New file:** `client/src/components/project/view_indicators_modal.tsx`

One generic modal, discriminated by `type: "hmis" | "hfa" | "calculated"`. Fetches on mount via Tier 3 pattern — no cache, no SSE subscription, lives inside the component:

```tsx
type Props = {
  projectId: string;
  type: "hmis" | "hfa" | "calculated";
  onClose: () => void;
};

export function ViewIndicatorsModal(p: Props) {
  const [state, setState] = createSignal<StateHolder<IndicatorRows>>({ status: "loading" });

  onMount(async () => {
    const res =
      p.type === "hmis"
        ? await serverActions.getHmisIndicatorsForProject({ projectId: p.projectId })
        : p.type === "hfa"
          ? await serverActions.getHfaIndicatorsForProject({ projectId: p.projectId })
          : await serverActions.getCalculatedIndicatorsForProject({ projectId: p.projectId });
    if (res.success) {
      setState({ status: "ready", data: res.data });
    } else {
      setState({ status: "error", err: res.err });
    }
  });

  // Render a modal with StateHolderWrapper + a type-specific table...
}
```

No `t2_` file, no `idb-keyval`, no `createReactiveCache` — explicitly NOT cached. Dismiss releases the signal; reopen refetches.

**Column sets per type:**

- **`hmis`**: two columns, `indicator_common_id` | `indicator_common_label`. Sortable on either.
- **`hfa`**: six base columns — `sort_order`, `var_name`, `category`, `definition`, `type`, `aggregation`. Each row has an expand affordance (chevron) that reveals a sub-table of `{ time_point, r_code, r_filter_code }` rows. `r_code` and `r_filter_code` rendered in a `<pre>` monospaced block, verbatim.
- **`calculated`**: columns — `sort_order`, `group_label`, `label`, `calculated_indicator_id`, `num_indicator_id`, denominator (composed column: `denom_kind === "indicator" ? denom_indicator_id : "population × " + denom_population_fraction`), `format_as`, `decimal_places`, `threshold_direction` + `threshold_green` + `threshold_yellow` (composed into a single "Thresholds" column for readability).

Title based on type: "HMIS common indicators" / "HFA indicators" / "Calculated indicators".

### 2.17.5 — Client integration in `project_data.tsx`

**File:** [client/src/components/project/project_data.tsx](client/src/components/project/project_data.tsx)

On the **HMIS card body**, below the existing "Data scope" summary:

```tsx
<div class="ui-gap-sm flex">
  <Button onClick={() => setViewIndicatorsModalType("hmis")}>
    {t3({ en: "View common indicators", fr: "Voir les indicateurs communs" })}
  </Button>
  <Show when={keyedProjectDatasetHmis.info.windowing.includeCalculatedIndicatorCatalogue}>
    <Button onClick={() => setViewIndicatorsModalType("calculated")}>
      {t3({ en: "View calculated indicators", fr: "Voir les indicateurs calculés" })}
    </Button>
  </Show>
</div>
```

The second button is gated on the toggle — nothing to view when the catalogue wasn't snapshotted.

On the **HFA card body**, below the existing HFA summary:

```tsx
<Button onClick={() => setViewIndicatorsModalType("hfa")}>
  {t3({ en: "View HFA indicators", fr: "Voir les indicateurs HFA" })}
</Button>
```

Modal mounting: a single `ViewIndicatorsModal` sibling conditional on `viewIndicatorsModalType()` being non-null; close handler nulls the signal. T5 local signal on the `ProjectData` component (no T4 persistence needed — closing a modal and reopening it should refetch).

### 2.17.6 — Auth scope

All three endpoints require `requireProjectPermission("view")`. These are read-only views of data the user already has implicit access to (they can see the project). No additional gating.

## Definition of done

- [ ] Migration 014 + schema file update for `calculated_indicators_snapshot`
- [ ] `DatasetHmisWindowingCommon.includeCalculatedIndicatorCatalogue: boolean` field, default `true`
- [ ] `DatasetHmisInfoInProject.calculatedIndicatorsVersion: string | undefined` field
- [ ] `addDatasetHmisToProject` populates the snapshot table atomically when toggle is on; clears it when toggle is off
- [ ] `removeDatasetFromProject` for HMIS clears the snapshot table
- [ ] HMIS settings UI checkbox with `?? true` fallback for pre-phase-2 configs
- [ ] HMIS card `stalenessCheck` includes "Calculated indicators changed" reason when toggle is on and version differs
- [ ] Project Data tab still has exactly two cards (HMIS, HFA)
- [ ] `scriptGenerationType: "calculated_indicators"` added to enum + Zod
- [ ] `getScriptWithParameters` third branch for `calculated_indicators`
- [ ] `get_script_with_parameters_calculated_indicators.ts` generates concrete per-indicator R blocks
- [ ] `lib/types/calculated_indicator_id.ts` exports `CALCULATED_INDICATOR_ID_PATTERN`, `isValidCalculatedIndicatorIdentifier`, `assertValidCalculatedIndicatorIdentifier`, re-exported from `lib/types/mod.ts`
- [ ] Save-time validation wired into server `addCalculatedIndicator` and `updateCalculatedIndicator` handlers (rejects invalid `calculated_indicator_id`, `num_indicator_id`, `denom_indicator_id`)
- [ ] Save-time validation wired into `calculated_indicator_editor.tsx` as inline errors disabling the Save button
- [ ] Defence-in-depth `assertValidCalculatedIndicatorIdentifier` calls at the top of `get_script_with_parameters_calculated_indicators.ts`
- [ ] Audit query §2.9a.5 run against dev / staging DB; zero non-conforming rows OR follow-up action taken and documented before merge
- [ ] Unit test for `isValidCalculatedIndicatorIdentifier` covering seed IDs and injection attempts
- [ ] `run_module_iterator.ts` reads snapshot and passes to codegen; throws friendly error when snapshot is empty for a `calculated_indicators` module
- [ ] Script preview route at `routes/project/modules.ts` reads snapshot too — parity with run-time script
- [ ] `calculated_indicators_snapshot.ts` exports `getAllCalculatedIndicatorsFromSnapshot(projectDb)`
- [ ] `wb-fastr-modules/m008/` exists with one results object, one metric, one R script using the marker
- [ ] Diff of `wb-fastr-modules/m007/` against main: zero edits
- [ ] `BIRTHS_PCT` / `WOMEN_15_49_PCT` parameters deleted from m008's `definition.json`
- [ ] m008's `dataSources` does NOT include calculated indicators (no CSV, no DataSource entry)
- [ ] No changes to `DatasetType` union; no changes to `_POSSIBLE_DATASETS`
- [ ] m008's R script has no `eval`, no `parse`, no dynamic dispatch
- [ ] `valueLabelReplacements` omitted from m008's metric
- [ ] `deno task build:modules` picks up m008; installs cleanly
- [ ] `server/routes/project/indicators.ts` exposes GET `/indicators/hmis`, `/indicators/hfa`, `/indicators/calculated` with `requireProjectPermission("view")`
- [ ] Server helpers: `getAllCommonIndicatorsForProject`, `getAllHfaIndicatorsWithCodeForProject` added; `getAllCalculatedIndicatorsFromSnapshot` reused
- [ ] API route declarations added in `lib/api-routes/mod.ts` for all three new endpoints
- [ ] `view_indicators_modal.tsx` renders type-specific tables; Tier 3 pattern (no cache, no SSE, fetch on mount, dismiss releases)
- [ ] HFA modal rows expandable to show `r_code` / `r_filter_code` verbatim in monospaced block
- [ ] HMIS card shows "View common indicators" button (always when HMIS enabled) and "View calculated indicators" button (conditional on `includeCalculatedIndicatorCatalogue`)
- [ ] HFA card shows "View HFA indicators" button when HFA enabled
- [ ] Smoke test §2.16 passes end-to-end including toggle round-trip, staleness round-trip, HFA-only regression, toggle-off + install m008 error UX, §2.13 verification, and modal items 10–12
- [ ] `deno task typecheck` clean
