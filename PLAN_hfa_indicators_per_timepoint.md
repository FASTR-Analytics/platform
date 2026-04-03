# HFA Indicators: Per-Time-Point R Code with Live Validation

## Summary

Replace the single `r_code` / `r_filter_code` per HFA indicator with one code snippet per (indicator, time_point). Add a real-time client-side validator that checks referenced variables against the dictionary for that time_point.

---

## 1. Database Changes

### 1.1 New Table

```sql
CREATE TABLE hfa_indicator_code (
  var_name text NOT NULL,
  time_point text NOT NULL,
  r_code text NOT NULL DEFAULT '',
  r_filter_code text,
  PRIMARY KEY (var_name, time_point),
  FOREIGN KEY (var_name) REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES dataset_hfa_dictionary_time_points(time_point) ON DELETE RESTRICT
);
```

Note: `ON DELETE CASCADE` on `var_name` (deleting an indicator removes all its code). `ON DELETE RESTRICT` on `time_point` — reimporting a time_point must NOT delete indicator code. See section 1.4 for how reimport is handled.

### 1.2 Migration `015_add_hfa_indicator_code_table.sql`

```sql
CREATE TABLE IF NOT EXISTS hfa_indicator_code (
  var_name text NOT NULL,
  time_point text NOT NULL,
  r_code text NOT NULL DEFAULT '',
  r_filter_code text,
  PRIMARY KEY (var_name, time_point),
  FOREIGN KEY (var_name) REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES dataset_hfa_dictionary_time_points(time_point) ON DELETE RESTRICT
);

-- Migrate existing r_code from hfa_indicators into hfa_indicator_code for all existing time_points
INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
SELECT i.var_name, tp.time_point, i.r_code, i.r_filter_code
FROM hfa_indicators i
CROSS JOIN dataset_hfa_dictionary_time_points tp
WHERE i.r_code != ''
ON CONFLICT DO NOTHING;

ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS r_code;
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS r_filter_code;
```

### 1.3 Keep `r_code` / `r_filter_code` on `hfa_indicators`?

Remove them. They're now on `hfa_indicator_code`. The `hfa_indicators` table becomes purely metadata: `var_name`, `category`, `definition`, `type` (binary/numeric), `sort_order`, `updated_at`.

### 1.4 Integration Worker: Preserve Indicator Code on Reimport

**Critical:** The current integration worker DELETEs and reinserts `dataset_hfa_dictionary_time_points` rows during reimport. With `ON DELETE RESTRICT` on `hfa_indicator_code`, this would fail if code exists for that time_point.

**Fix:** Change the integration worker to UPDATE the existing time_point row instead of DELETE + INSERT:

```sql
-- Instead of:
--   DELETE FROM dataset_hfa_dictionary_time_points WHERE time_point = $tp;
--   INSERT INTO dataset_hfa_dictionary_time_points ...;

-- Do:
INSERT INTO dataset_hfa_dictionary_time_points (time_point, time_point_label, date_imported)
VALUES ($tp, $label, $dateImported)
ON CONFLICT (time_point) DO UPDATE SET
  time_point_label = EXCLUDED.time_point_label,
  date_imported = EXCLUDED.date_imported;
```

Similarly, `dataset_hfa_dictionary_vars` rows are referenced by `hfa_indicator_code` indirectly (through the data). The current worker deletes dictionary_vars too — this is fine because `hfa_indicator_code` only FKs to `time_point`, not to `(time_point, var_name)`. So dictionary_vars can be freely deleted and reinserted.

The `deleteDatasetHfaData` function (delete by time_point) also needs updating: it currently deletes from `dataset_hfa_dictionary_time_points` which would be blocked by RESTRICT. Options:
- Also delete indicator code when deleting a time_point's data (makes sense — if you delete the data, the code for that round is probably no longer useful)
- Or warn the user that deleting a time_point also removes indicator code for it

Decision: delete indicator code too. Add to the delete function:
```sql
DELETE FROM hfa_indicator_code WHERE time_point = $timePoint;
DELETE FROM dataset_hfa_dictionary_time_points WHERE time_point = $timePoint;
```

For "delete all", delete all indicator code first:
```sql
DELETE FROM hfa_indicator_code;
```

### 1.5 Auto-copy on New Time Point Import

When a new time_point is integrated, after upserting the time_point row:

```sql
INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
SELECT var_name, $newTimePoint, r_code, r_filter_code
FROM hfa_indicator_code
WHERE time_point = (
  SELECT tp.time_point FROM dataset_hfa_dictionary_time_points tp
  WHERE tp.time_point != $newTimePoint
  ORDER BY tp.date_imported DESC NULLS LAST
  LIMIT 1
)
ON CONFLICT DO NOTHING;
```

Uses `date_imported DESC` for ordering (not lexicographic `time_point`), since time_point IDs may not sort chronologically (e.g., "baseline", "endline").

`ON CONFLICT DO NOTHING` means if code already exists for this (indicator, time_point) — e.g., from a previous import — it's preserved.

---

## 2. Type Changes

### 2.1 Update `HfaIndicator`

Current (actual type in codebase):
```typescript
type HfaIndicator = {
  category: string;
  definition: string;
  rFilterCode?: string;
  varName: string;
  rCode: string;
  type: "binary" | "numeric";
};
```

New:
```typescript
type HfaIndicator = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  sortOrder: number;
};
```

Note: `sortOrder` is on `DBHfaIndicator` but not currently exposed on `HfaIndicator`. Add it now since the client needs it for ordering.

### 2.2 New Type: `HfaIndicatorCode`

```typescript
type HfaIndicatorCode = {
  varName: string;
  timePoint: string;
  rCode: string;
  rFilterCode: string | undefined;
};
```

`rFilterCode` is `string | undefined` to match the nullable DB column.

### 2.3 New Type: Dictionary for Validation

```typescript
type HfaDictionaryForValidation = {
  timePoints: {
    timePoint: string;
    timePointLabel: string;
    vars: { varName: string; varLabel: string; varType: string }[];
    values: { varName: string; value: string; valueLabel: string }[];
  }[];
};
```

Loaded when the indicator manager opens — full dictionary grouped by time_point for the live validator.

---

## 3. Server Changes

### 3.1 New DB Functions

**`server/db/instance/hfa_indicators.ts`** (update existing):

- `getHfaIndicatorCode(mainDb, varName)` → returns `HfaIndicatorCode[]` (one per time_point)
- `getAllHfaIndicatorCode(mainDb)` → returns all code snippets (for R script generation)
- `updateHfaIndicatorCode(mainDb, varName, timePoint, rCode, rFilterCode)` → upserts a single snippet
- `getHfaDictionaryForValidation(mainDb)` → returns full dictionary grouped by time_point

### 3.2 New API Routes

- `getHfaIndicatorCode` — POST, body: `{ varName }`, returns `HfaIndicatorCode[]`
- `updateHfaIndicatorCode` — POST, body: `{ varName, timePoint, rCode, rFilterCode }`
- `getHfaDictionaryForValidation` — GET, returns `HfaDictionaryForValidation`

All require `can_configure_data` permission.

### 3.3 Update R Script Generation

**`server/server_only_funcs/get_script_with_parameters_hfa.ts`:**

Currently reads `r_code` from `hfa_indicators`. Change to:
- Load all code from `hfa_indicator_code` via `getAllHfaIndicatorCode()`
- Group by indicator var_name
- For each indicator, generate time_point-specific `case_when` blocks
- If an indicator has no code for a time_point, produce `NA_real_`

The generated R script structure changes from:
```r
mutate(indicator = r_code_expression)
```
to:
```r
mutate(indicator = case_when(
  time_point == "1" ~ (r_code_for_tp_1),
  time_point == "2" ~ (r_code_for_tp_2),
  TRUE ~ NA_real_
))
```

`r_filter_code` gets the same `case_when` treatment — filter logic can differ per time_point:
```r
mutate(indicator = case_when(
  is.na(dep1) | dep1 == -99 ~ NA_real_,
  time_point == "1" & !(r_filter_code_tp_1) ~ NA_real_,
  time_point == "2" & !(r_filter_code_tp_2) ~ NA_real_,
  time_point == "1" ~ (r_code_tp_1),
  time_point == "2" ~ (r_code_tp_2),
  TRUE ~ NA_real_
))
```

### 3.4 Update Module Executor

**`server/worker_routines/run_module/run_module_iterator.ts`:**

Currently loads indicators from `hfa_indicators` and passes them to `getScriptWithParametersHfa()`. Update to also load from `hfa_indicator_code` and pass the per-time_point code alongside the indicator metadata.

### 3.5 Update Dependency Analyzer

**`server/server_only_funcs/hfa_dependency_analyzer.ts`:**

Currently extracts variable references from a single `r_code` and performs a single topological sort. Change to:

- **Union all dependency edges across all time_points into a single combined graph.** For each time_point's code snippets, extract variable references and add edges to the graph. The combined graph is the union of all per-time_point dependencies.
- Perform a single topological sort on the combined graph.
- **If the combined graph has a cycle, error at validation time.** This means two indicators have conflicting dependency orders across time_points (e.g., A depends on B in tp1, B depends on A in tp2). This is fundamentally incompatible and the user must restructure their indicators. The error message should identify the conflicting indicators and time_points.
- The single topological sort order determines the `mutate()` call sequence in the generated R script. Each `mutate()` uses `case_when` for its per-time_point code.
- Report validation errors per (indicator, time_point) for missing variables.

Note: `case_when` in R evaluates all branch expressions for all rows, so the `mutate()` order must be valid for every time_point simultaneously. The union approach guarantees this — if the union has a valid sort, every time_point's dependencies are satisfied by the time each indicator is computed.

### 3.6 Cache Invalidation

New routes (`updateHfaIndicatorCode`) must invalidate any caches that depend on indicator definitions. Check existing indicator CRUD routes for cache invalidation patterns and apply the same to the new code routes.

---

## 4. Client Changes

### 4.1 Indicator Manager Restructure

**`client/src/components/instance/hfa_indicators_manager.tsx`:**

Currently shows a table of indicators with inline editing. Change to:

**Main table:** Shows indicators (var_name, category, definition, type). No r_code column.

**On row click → opens indicator editor** with:
- Metadata fields (category, definition, type) at the top
- Below: **tabbed code editor**, one tab per time_point
- Each tab shows:
  - The available variables for that time_point (from dictionary) — as a reference panel
  - R code textarea with live validation
  - R filter code textarea with live validation
  - Validation warnings/errors inline

### 4.2 Live Validation Component

A reusable component that:
1. Takes an R code string and a list of available variable names (+ other indicator var_names)
2. Extracts R identifiers from the code using regex
3. Filters out R keywords/functions (`if`, `else`, `TRUE`, `FALSE`, `NA`, `is.na`, `case_when`, `mean`, `sum`, `c`, etc.)
4. Checks remaining identifiers against the variable list
5. Returns warnings: `["Variable 'q5_hygiene' not found in this time point"]`
6. Renders inline below the textarea, updating as the user types (debounced ~300ms)

**R identifier extraction regex:**
- Match `[a-zA-Z._][a-zA-Z0-9._]*` (R variable naming rules)
- Exclude known R functions and keywords (maintain a comprehensive list)
- Exclude other indicator var_names (since indicators can reference each other)

### 4.3 Variable Reference Panel

For each time_point tab, show a searchable list:
```
Available variables for Round 1:
  select_one:
    b0 - Who brought the child? [1: Mother, 2: Father, 8: Other]
    b1 - Type of ID card [1: National ID, 2: Passport]
  select_multiple_binary:
    c8a_1 - What foods...? - Breastmilk [0: No, 1: Yes]
    c8a_2 - What foods...? - Water [0: No, 1: Yes]
  integer:
    a12a - How many people in household?
  decimal:
    anthro1 - Weight
```

Grouped by type. Click to insert var_name into the code textarea.

### 4.4 Batch Upload

Deferred to a follow-up. The per-time_point code makes CSV upload significantly more complex, and the UI editor is the primary workflow. The existing metadata-only CSV upload (category, definition, varName, type) can remain — it just won't include code.

---

## 5. Deploy Note

All phases must ship together in a single deploy. The migration (Phase 1) drops `r_code`/`r_filter_code` columns and adds the RESTRICT FK, which breaks any server code still reading the old columns or doing DELETE+INSERT on time_points. The phases are implementation order, not independent deploy stages.

## 6. Implementation Order

### Phase 1: Database & Types
1. Create migration `015_add_hfa_indicator_code_table.sql` — must be fully idempotent (all statements use `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`). Includes: create table, migrate existing r_code data, drop old columns.
2. Update `_main_database.sql` — add `hfa_indicator_code` table definition, remove `r_code` and `r_filter_code` columns from `hfa_indicators` table definition
3. Add `HfaIndicatorCode` type
4. Update `HfaIndicator` type (remove rCode, rFilterCode, add sortOrder)
5. Add `HfaDictionaryForValidation` type
6. Update `DBHfaIndicator` type (remove r_code, r_filter_code)

### Phase 2: Server — Integration Worker Fix
7. Change integration worker to UPSERT `dataset_hfa_dictionary_time_points` instead of DELETE+INSERT
8. Update `deleteDatasetHfaData` to delete indicator code before deleting time_point

### Phase 3: Server — DB Functions & Routes
9. Add `getHfaIndicatorCode`, `getAllHfaIndicatorCode`, `updateHfaIndicatorCode`, `getHfaDictionaryForValidation`
10. Add API route definitions
11. Add route handlers with cache invalidation
12. Update existing indicator CRUD to not include r_code/r_filter_code

### Phase 4: Server — R Script Generation & Module Executor
13. Update `run_module_iterator.ts` to load from `hfa_indicator_code`
14. Update `get_script_with_parameters_hfa.ts` to generate per-time_point `case_when` blocks
15. Update dependency analyzer: union edges across all time_points, single topological sort, error on cycle

### Phase 5: Client — Live Validator
16. Create R code variable extractor utility
17. Create validation component (textarea + inline warnings, debounced)

### Phase 6: Client — Indicator Manager UI
18. Update indicator table (remove r_code column)
19. Create indicator editor with tabbed time_point code
20. Create variable reference panel (searchable, grouped by type, click to insert)
21. Integrate live validator into code textareas

### Phase 7: Integration Worker — Auto-copy
22. Add auto-copy logic when new time_point is integrated (ordered by `date_imported DESC`)

### Phase 8: Testing
23. Test with multiple time_points with different questionnaires
24. Test live validation catches missing variables
25. Test R script generation produces correct time_point-specific code
26. Test auto-copy on new time_point import
27. Test reimport preserves indicator code (UPSERT, not DELETE)
28. Test delete time_point also removes indicator code
29. Test dependency analyzer handles different dependency orders per time_point

---

## 7. Decisions Made

| Item | Decision | Rationale |
|------|----------|-----------|
| FK on time_point | ON DELETE RESTRICT | Prevents accidental code loss on reimport |
| Reimport time_point | UPSERT (not DELETE+INSERT) | Preserves indicator code FK references |
| Delete time_point data | Also deletes indicator code | If data is gone, code for that round is probably stale |
| Missing code for time_point | Produce NA_real_ | Safe default — indicator is undefined for that round |
| Dependency sort | Union all edges, single topological sort | Conflicting orders across time_points = cycle = error. case_when evaluates all branches so order must be globally valid |
| r_filter_code | Also per-time_point case_when | Filter logic can differ across rounds |
| Deploy | All phases ship together | Migration drops columns that server code depends on |
| Auto-copy ordering | By date_imported DESC | time_point IDs may not sort chronologically |
| rFilterCode type | string \| undefined | Matches nullable DB column |
| Batch upload | Deferred | Per-time_point code makes CSV complex; UI editor is primary |
| Cache invalidation | Same pattern as existing indicator CRUD | New code routes must invalidate dependent caches |
