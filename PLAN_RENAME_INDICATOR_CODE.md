# Plan: Rename indicator_code to iceh_indicator

## Goal

Rename the DisaggregationOption `indicator_code` to `iceh_indicator` for consistency with `hfa_indicator`.

## Scope

**What changes:** Internal column names, type definitions, queries
**What stays:** CSV header parsing ("Indicator Code" in ICEH zip files) - this is external format

---

## Changes Required

### wb-fastr

#### 1. Type Definition
**File:** `lib/types/disaggregation_options.ts`
```diff
- "indicator_code",
+ "iceh_indicator",
```

#### 2. Disaggregation Labels
**File:** `lib/disaggregation_labels.ts`
```diff
- case "indicator_code":
-   return { en: "Indicator", fr: "Indicateur" };
+ case "iceh_indicator":
+   return { en: "ICEH indicator", fr: "Indicateur ICEH" };
```

#### 3. Metric Enricher
**File:** `server/db/project/metric_enricher.ts`
```diff
- "indicator_code",
+ "iceh_indicator",
```

#### 4. Instance Base Schema
**File:** `server/db/instance/_main_database.sql`
- Rename `indicator_code` to `iceh_indicator` in `iceh_indicators` table (PK, line ~506)
- Rename `indicator_code` to `iceh_indicator` in `iceh_data` table (FK + composite PK, lines ~515, ~527)
- Rename index `idx_iceh_data_indicator` column reference (line ~530)

#### 5. Instance Migration (ICEH tables)
**File:** `server/db/migrations/instance/037_iceh_tables.sql`
- Rename `indicator_code` column to `iceh_indicator` in `iceh_indicators` table (PK)
- Rename `indicator_code` column to `iceh_indicator` in `iceh_data` table (FK + index)

#### 6. Project Base Schema
**File:** `server/db/project/_project_database.sql`
- Rename `indicator_code` to `iceh_indicator` in `iceh_indicators_snapshot` table (line ~43)

#### 7. Project Migration (ICEH snapshot)
**File:** `server/db/migrations/project/017_add_iceh_indicators_snapshot.sql`
- Rename `indicator_code` column to `iceh_indicator`

#### 8. Instance Dataset Access
**File:** `server/db/instance/dataset_iceh.ts`
- Update all SQL queries and type definitions
- Keep CSV parsing logic referencing "Indicator Code" (external format)

#### 9. Project Dataset Access
**File:** `server/db/project/datasets_in_project_iceh.ts`
- Update all SQL queries and type definitions

---

### wb-fastr-modules

#### 10. Validation Types
**File:** `.validation/disaggregation_options.ts`
```diff
- "indicator_code",
+ "iceh_indicator",
```

#### 11. Module m009 Results Objects
**File:** `m009/_results_objects.ts`
- Update column definitions

#### 12. Module m009 Definition
**File:** `m009/definition.json`
- Update `requiredDisaggregationOptions` in metrics

#### 13. Module m009 Metrics
**File:** `m009/_metrics/m9-01-01.ts`
- Update disaggregation references

---

## Files NOT to change

These files contain `indicator_code` but refer to HFA indicator code (R code snippets), not ICEH:
- `server/db/instance/hfa_indicators.ts` - `hfa_indicator_code` table
- `server/db/migrations/instance/015_add_hfa_indicator_code_table.sql`
- `server/db/migrations/instance/023_hfa_schema_redesign.sql`
- `server/routes/instance/hfa_time_points.ts`
- `server/db/instance/dataset_hfa.ts`
- `server/db/project/datasets_in_project_hfa.ts`
- `server/worker_routines/integrate_hfa_data/worker.ts`

---

## Verification

After changes:
1. `grep -r "indicator_code" lib/` should return nothing
2. `grep -r "indicator_code" server/db/project/` should only show HFA-related files
3. `grep -r "iceh_indicator" lib/` should show the new DisaggregationOption
4. TypeScript compilation should pass
