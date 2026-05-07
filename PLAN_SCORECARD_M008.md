# PLAN: m008 Scorecard Module — Pipeline + Formatting

Build `m008` as a catalog-driven scorecard module with per-indicator formatting. Replaces the hardcoded m007 approach with dynamic computation based on the `calculated_indicators` catalog (phase 1, already shipped).

**Prerequisites:** Phase 1 complete — `calculated_indicators` table exists at instance level with 10 seed rows, CRUD UI in indicator manager, SSE-driven cache invalidation.

## Architecture Summary

- **Single results object at AA4 × month grain.** m008 emits one results object with `numerator` and `denominator` columns at monthly granularity. SQL aggregates up via `disaggregateBy` for both geography (AA2/AA3) and time (quarter/year) — no pre-aggregation duplication.
- **Catalog snapshot in project DB.** When HMIS imports, the catalog is snapshotted into `calculated_indicators_snapshot`. m008 reads this snapshot via codegen (same pattern as HFA).
- **Codegen, not CSV.** The R script is generated server-side with per-indicator blocks inlined. No runtime catalog read, no `eval`/`parse`.
- **Per-indicator formatting.** Client-side catalog lookup by label determines format (`percent`/`number`/`rate_per_10k`), decimal places, and threshold colors.

---

## Part A: Pipeline

### A1. Project DB snapshot table

**New migration:** `server/db/migrations/project/015_add_calculated_indicators_snapshot.sql`

```sql
CREATE TABLE IF NOT EXISTS calculated_indicators_snapshot (
  calculated_indicator_id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  group_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  num_indicator_id TEXT NOT NULL,
  denom_kind TEXT NOT NULL,
  denom_indicator_id TEXT,
  denom_population_fraction DOUBLE PRECISION,
  format_as TEXT NOT NULL,
  decimal_places INTEGER NOT NULL,
  threshold_direction TEXT NOT NULL,
  threshold_green DOUBLE PRECISION NOT NULL,
  threshold_yellow DOUBLE PRECISION NOT NULL
);
```

Also add to `server/db/project/_project_database.sql`.

### A2. HMIS info gains catalog version

**File:** `lib/types/datasets_in_project.ts`

Add to `DatasetHmisInfoInProject`:

```ts
export type DatasetHmisInfoInProject = {
  version: DatasetHmisVersion;
  windowing: DatasetHmisWindowingCommon;
  // ...existing fields...
  calculatedIndicatorsVersion: string;  // NEW — always set when HMIS imported
};
```

No toggle needed — catalog always snapshots with HMIS import.

### A3. HMIS import snapshots catalog atomically

**File:** `server/db/project/datasets_in_project_hmis.ts`

In `addDatasetHmisToProject`, inside the existing `projectDb.begin()` block:

1. Before transaction: fetch catalog rows and version from instance DB
2. Inside transaction: `DELETE FROM calculated_indicators_snapshot`, then `INSERT` each row
3. Store `calculatedIndicatorsVersion` in the `info` JSON

### A4. HMIS removal clears snapshot

**File:** `server/db/project/datasets_in_project_hmis.ts`

In `removeDatasetFromProject` for HMIS, add:

```ts
sql`DELETE FROM calculated_indicators_snapshot`
```

### A5. HMIS card surfaces catalog staleness

**File:** `client/src/components/project/project_data.tsx` (or wherever staleness reasons are computed)

Add reason when catalog version differs:

```ts
if (instanceState.calculatedIndicatorsVersion !== hmisInfo.calculatedIndicatorsVersion) {
  reasons.push(t3({
    en: "Calculated indicators changed",
    fr: "Indicateurs calculés modifiés",
  }));
}
```

### A6. Extend `scriptGenerationType` enum

**File:** `lib/types/_module_definition_installed.ts`

```ts
export const scriptGenerationType = z.enum(["template", "hfa", "calculated_indicators"]);
```

Also update `_module_definition_github.ts` if it has a separate enum.

### A7. Codegen for calculated_indicators

**File:** `server/server_only_funcs/get_script_with_parameters.ts`

Add third branch:

```ts
if (moduleDefinition.scriptGenerationType === "calculated_indicators") {
  return getScriptWithParametersCalculatedIndicators(
    moduleDefinition,
    configSelections,
    countryIso3,
    calculatedIndicators,  // passed from caller
  );
}
```

**New file:** `server/server_only_funcs/get_script_with_parameters_calculated_indicators.ts`

1. Run standard template substitutions (COUNTRY_ISO3, dataSources, parameters)
2. Substitute `__CALCULATED_INDICATOR_BLOCKS__` marker with generated R blocks
3. Each block: concrete arithmetic for one indicator, no `eval`/`parse`

Generated block pattern:

```r
# <indicator_id>
{
  num_col <- "<num_indicator_id>"
  denom <- <denom_expression>
  if (num_col %in% names(data)) {
    rows_<i> <- data %>%
      select(all_of(geo_cols), period_id) %>%
      mutate(indicator_common_id = "<indicator_id>",
             numerator = data[[num_col]],
             denominator = denom)
  } else {
    message("Skipping '<indicator_id>': missing column ", num_col)
    rows_<i> <- tibble()
  }
}
```

**`<denom_expression>` depends on `denom_kind`:**

- `indicator`: `data[["<denom_indicator_id>"]]` — both num and denom are monthly HMIS counts, no scaling
- `population`: `data$total_population * <fraction> * PERIOD_FRACTION` — population is annual, multiply by `1/12` for monthly

### A8. Safe-identifier validation

**New file:** `lib/types/calculated_indicator_id.ts`

```ts
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
      `Invalid identifier for ${fieldName}: ${JSON.stringify(value)}. ` +
      `Must match ${CALCULATED_INDICATOR_ID_PATTERN.source}.`,
    );
  }
}
```

Apply at:

- Save time in `server/routes/instance/calculated_indicators.ts`
- Save time in `client/src/components/indicator_manager_hmis/calculated_indicator_editor.tsx`
- Codegen time in `get_script_with_parameters_calculated_indicators.ts` (defense in depth)

### A9. Module runner reads snapshot

**File:** `server/worker_routines/run_module/run_module_iterator.ts`

```ts
let calculatedIndicators: CalculatedIndicator[] | undefined;
if (moduleDetail.moduleDefinition.scriptGenerationType === "calculated_indicators") {
  calculatedIndicators = await getAllCalculatedIndicatorsFromSnapshot(projectDb);
  if (calculatedIndicators.length === 0) {
    throw new Error(
      "No calculated indicators in project snapshot. Re-import HMIS data.",
    );
  }
}
```

**New file:** `server/db/project/calculated_indicators_snapshot.ts`

```ts
export async function getAllCalculatedIndicatorsFromSnapshot(
  projectDb: ProjectDb,
): Promise<CalculatedIndicator[]> {
  // SELECT * FROM calculated_indicators_snapshot ORDER BY sort_order
}
```

### A10. Script preview reads snapshot too

**File:** `server/routes/project/modules.ts`

In the preview route, if `scriptGenerationType === "calculated_indicators"`, fetch snapshot and pass to codegen. Ensures preview matches runtime.

### A11. m008 module scaffold

**Directory:** `wb-fastr-modules/m008/`

Copy from m007, then:

1. Rename all `m7`/`M7` → `m8`/`M8`
2. Update `definition.json`:
   - `scriptGenerationType: "calculated_indicators"`
   - Delete `BIRTHS_PCT`, `WOMEN_15_49_PCT` parameters (catalog has `denom_population_fraction`)
   - Keep `SELECTED_COUNT_VARIABLE`, `INTERPOLATE_POPULATION`
   - One results object: `M8_output_scorecard` at AA4 × month grain with `period_id`, `numerator`, `denominator` columns
   - One metric with `postAggregationExpression: { ingredientValues: [{prop: "numerator", func: "SUM"}, {prop: "denominator", func: "SUM"}], expression: "value = numerator / denominator" }`

3. Update `script.R` — structure mirrors m007 but at monthly grain:

   **Setup (before marker):**
   - Load M2_adjusted_data.csv, population asset
   - Derive `nhmis_timely_and_data` (same logic as m007)
   - Aggregate facility rows → AA4 × period_id (monthly, not quarterly)
   - Pivot wide so each `indicator_common_id` becomes a column
   - Merge population (monthly lookup, same fallback logic as m007)
   - Add `PERIOD_FRACTION <- 1/12` constant

   **Marker:** `__CALCULATED_INDICATOR_BLOCKS__` — codegen inserts per-indicator blocks here

   **Output (after marker):**
   - `bind_rows(rows_1, rows_2, ...)` to combine indicator results
   - Write single CSV at AA4 × month grain
   - Remove `round(.x, 2)` mid-pipeline (store raw for accurate aggregation)

---

## Part B: Formatting

**Key decisions:**

1. **Use project snapshot** — Formatting uses the project snapshot, not the live instance catalog. This ensures consistency between computed values and display. Edits to the instance catalog only affect future HMIS imports.

2. **Snapshot bundled with items** — The snapshot is returned as part of the items holder response (like `indicatorLabelReplacements`), not fetched separately. Server includes it when the metric's module has `scriptGenerationType === "calculated_indicators"`.

3. **Dedicated style builder** — Use `specialScorecardTable` flag to dispatch to `_5_scorecard.ts`, following the pattern of `specialCoverageChart`, `specialDisruptionsChart`.

### B1. Extend items holder response

**File:** `lib/types/instance.ts`

Add `calculatedIndicatorsSnapshot` to the items holder response:

```ts
export type ItemsHolderResponse =
  | {
      status: "ok";
      items: Record<string, string>[];
      indicatorLabelReplacements: Record<string, string>;
      calculatedIndicatorsSnapshot?: CalculatedIndicator[];  // NEW
      dateRange: ...;
    }
  | { status: "too_many_items" }
  | { status: "error"; message: string };
```

**File:** `server/routes/project/items.ts` (or wherever items are fetched)

When building the response, check if the metric's module has `scriptGenerationType === "calculated_indicators"`. If so, query `calculated_indicators_snapshot` and include it.

### B2. Scorecard data transformation

**File:** `client/src/generate_visualization/get_figure_inputs_from_po.ts`

When `ih.calculatedIndicatorsSnapshot` is present:

1. Build `indicatorLabelReplacements` from snapshot: `{ [ci.calculated_indicator_id]: ci.label }`
2. Inject `group` field into each data row from snapshot's `group_label`
3. Set `colGroupProp = "group"` in data config for grouped column headers

### B3. Add `specialScorecardTable` config flag

**File:** `lib/types/presentation_object.ts`

Add to style config:

```ts
specialScorecardTable?: boolean;
```

This flag is set automatically when creating a PO from an m008 metric, or can be toggled manually.

### B4. Scorecard style builder

**File:** `client/src/generate_visualization/get_style_from_po/_5_scorecard.ts`

Dispatch from `get_style_from_po.ts` when `config.s.specialScorecardTable` is true.

**Formatting helpers:**

```ts
function scaleValueForFormat(rawValue: number, formatAs: string): number {
  if (formatAs === "percent") return rawValue * 100;
  if (formatAs === "rate_per_10k") return rawValue * 10000;
  return rawValue;
}

function getScorecardCutoffColor(
  direction: "higher_is_better" | "lower_is_better",
  green: number,
  yellow: number,
  scaledValue: number,
): string {
  if (direction === "higher_is_better") {
    if (scaledValue >= green) return _CF_LIGHTER_GREEN;
    if (scaledValue >= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  } else {
    if (scaledValue <= green) return _CF_LIGHTER_GREEN;
    if (scaledValue <= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  }
}
```

**Style builder:**

```ts
export function buildScorecardStyle(
  config: PresentationObjectConfig,
  snapshot: CalculatedIndicator[],
): CustomFigureStyleOptions {
  const snapshotById = new Map(snapshot.map(ci => [ci.calculated_indicator_id, ci]));

  return {
    // ... standard options ...
    content: {
      tableCells: {
        func: (info: TableCellInfo) => {
          const ci = snapshotById.get(info.colHeader);
          if (ci && info.valueAsNumber !== undefined) {
            const scaled = scaleValueForFormat(info.valueAsNumber, ci.format_as);
            return {
              backgroundColor: getScorecardCutoffColor(
                ci.threshold_direction, ci.threshold_green, ci.threshold_yellow, scaled
              ),
              textColorStrategy: { ifLight: "baseContent", ifDark: "base100" },
            };
          }
          return { backgroundColor: "none" };
        },
        textFormatter: (info: TableCellInfo) => {
          const ci = snapshotById.get(info.colHeader);
          if (ci && info.valueAsNumber !== undefined) {
            return formatScorecardValue(info.valueAsNumber, ci.format_as, ci.decimal_places);
          }
          return String(info.value);
        },
      },
    },
  };
}
```

### B5. Scorecard legend

**File:** `client/src/generate_visualization/conditional_formatting.ts`

Add scorecard legend builder:

```ts
export function getScorecardLegend(): LegendInput {
  return [
    { label: t3({ en: "On track", fr: "En bonne voie" }), color: _CF_LIGHTER_GREEN },
    { label: t3({ en: "Progress needed", fr: "Progrès nécessaire" }), color: _CF_LIGHTER_YELLOW },
    { label: t3({ en: "Not on track", fr: "Pas en bonne voie" }), color: _CF_LIGHTER_RED },
  ];
}
```

### B6. Lookup helper

**File:** `lib/types/indicators.ts` (or inline where needed)

```ts
export function getCalculatedIndicatorsByIdMap(
  indicators: CalculatedIndicator[],
): Map<string, CalculatedIndicator> {
  return new Map(indicators.map((ci) => [ci.calculated_indicator_id, ci]));
}
```

---

## Verification Checklist

### Pipeline (Part A)

- [ ] Migration 015 creates `calculated_indicators_snapshot`
- [ ] `DatasetHmisInfoInProject` has `calculatedIndicatorsVersion: string`
- [ ] HMIS import populates snapshot and stores version
- [ ] HMIS removal clears snapshot
- [ ] HMIS card shows "Calculated indicators changed" staleness reason
- [ ] `scriptGenerationType` enum includes `"calculated_indicators"`
- [ ] Codegen produces concrete R blocks (no eval/parse)
- [ ] ID validation at save time (server + client) and codegen time
- [ ] Module runner reads snapshot, throws friendly error if empty
- [ ] Script preview reads snapshot too
- [ ] m008 exists with single AA4 × month results object, postAggregationExpression metric
- [ ] m007 unchanged (diff shows zero edits)

### Formatting (Part B)

- [ ] Items holder response extended with `calculatedIndicatorsSnapshot` (B1)
- [ ] Server includes snapshot when metric has `scriptGenerationType === "calculated_indicators"`
- [ ] `specialScorecardTable` config flag added (B3)
- [ ] Scorecard style builder `_5_scorecard.ts` created (B4)
- [ ] Formatting helpers: `scaleValueForFormat`, `getScorecardCutoffColor`, `formatScorecardValue`
- [ ] Scorecard data transformation (labels, groups, colGroupProp) works (B2)
- [ ] Scorecard legend displays (B5)
- [ ] Tables without snapshot degrade gracefully

### End-to-End Smoke Test

1. Import HMIS → snapshot populated, version stored
2. Install m008, run → `M8_output_scorecard.csv` produced
3. Create scorecard PO → `specialScorecardTable` auto-set, grouped columns by `group_label`
4. Render scorecard PO → per-indicator colors/formatting, legend shows 3 statuses
5. Edit catalog threshold in instance → existing project unchanged (uses snapshot)
6. Re-import HMIS → project now uses updated thresholds
7. Compare m008 vs m007 values → match to 2 decimal places
8. HFA-only project → no crash, snapshot empty, m008 not installed

---

## Out of Scope (Deferred)

- "View indicators" modals on Project Data cards
- Project-level indicator subsetting
- Novel-computation indicators beyond the structural schema
- Migrating or retiring m007
