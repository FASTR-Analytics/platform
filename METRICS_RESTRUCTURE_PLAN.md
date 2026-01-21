# Metrics Restructuring Plan

## Summary

Restructure metrics storage from nested JSON to SQL tables with table routing.

**Key changes:**
- Metrics stored in `metrics` table (not nested JSON)
- Globally unique metricId (no moduleId needed in queries)
- `tableRouting` determines which CSV/table based on disaggregation
- `presentation_objects` uses `metric_id` FK (removes `module_id`, `results_object_id`)

---

## Database Schema

### New `metrics` table

```sql
CREATE TABLE metrics (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  label text NOT NULL,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  value_props text NOT NULL,  -- JSON array
  period_options text NOT NULL,  -- JSON array
  required_disaggregation_options text NOT NULL,  -- JSON array
  value_label_replacements text,  -- JSON object (nullable)
  post_aggregation_expression text,  -- JSON object (nullable)
  auto_include_facility_columns boolean DEFAULT false,
  table_routing text NOT NULL  -- JSON: {"default": "...", "byDisaggregation": {...}}
);
CREATE INDEX idx_metrics_module_id ON metrics(module_id);
```

### New `results_objects` table

```sql
CREATE TABLE results_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  description text,
  column_definitions text  -- JSON object
);
CREATE INDEX idx_results_objects_module_id ON results_objects(module_id);
```

### Updated `presentation_objects` table

Remove: `module_id`, `results_object_id`, `results_value`
Add: `metric_id` (FK to metrics)

---

## Implementation Steps

### Step 1: Add types

File: `lib/types/module_definitions.ts`

```typescript
export type MetricDefinition = {
  id: string;
  label: string;
  valueProps: string[];
  valueFunc: ValueFunc;
  formatAs: "percent" | "number";
  periodOptions: PeriodOption[];
  requiredDisaggregationOptions: DisaggregationOption[];
  valueLabelReplacements?: Record<string, string>;
  postAggregationExpression?: PostAggregationExpression;
  autoIncludeFacilityColumns?: boolean;
  tableRouting: {
    default: string;
    byDisaggregation?: Partial<Record<DisaggregationOption, string>>;
  };
};

// Add to ModuleDefinition type:
metrics?: MetricDefinition[];
```

### Step 2: SQL migration

File: `server/db/migrations/project/006_add_metrics_table.sql`

```sql
DROP TABLE IF EXISTS results_values;
DROP TABLE IF EXISTS results_objects;

CREATE TABLE results_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  description text,
  column_definitions text
);
CREATE INDEX idx_results_objects_module_id ON results_objects(module_id);

CREATE TABLE metrics (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  label text NOT NULL,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  value_props text NOT NULL,
  period_options text NOT NULL,
  required_disaggregation_options text NOT NULL,
  value_label_replacements text,
  post_aggregation_expression text,
  auto_include_facility_columns boolean DEFAULT false,
  table_routing text NOT NULL
);
CREATE INDEX idx_metrics_module_id ON metrics(module_id);

ALTER TABLE presentation_objects ADD COLUMN metric_id text;
```

### Step 3: JS migration

File: `server/db_startup.ts` - add `migrateModulesToMetricsTables()`

Populates `metrics` and `results_objects` from existing `modules.module_definition` JSON.
Updates `presentation_objects.metric_id` from `results_value` JSON field.

### Step 4: Update module install

File: `server/db/project/modules.ts`

In `installModule()` and `updateModuleDefinition()`:
- Insert into `results_objects` for each resultsObject
- Insert into `metrics` for each metric (or flattened resultsValue)

### Step 5: Update resolver

File: `server/db/project/results_value_resolver.ts`

New function `resolveMetric(metricId, disaggregations)`:
- Query `metrics` table by id
- Use `tableRouting` to determine resultsObjectId based on disaggregations
- Return enriched metric

### Step 6: Update presentation_objects

File: `server/db/project/presentation_objects.ts`

- Use `metric_id` instead of `module_id` + `results_value`
- Derive `resultsObjectId` from metric's `tableRouting` + config disaggregations

### Step 7: Finalize schema

File: `server/db/migrations/project/007_finalize_metrics.sql`

```sql
ALTER TABLE presentation_objects DROP COLUMN results_value;
ALTER TABLE presentation_objects DROP COLUMN results_object_id;
ALTER TABLE presentation_objects DROP COLUMN module_id;
ALTER TABLE presentation_objects ALTER COLUMN metric_id SET NOT NULL;
ALTER TABLE presentation_objects
  ADD CONSTRAINT fk_metric FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE;
```

### Step 8: Update M003 definition

File: `module_defs/m003/1.0.0/definition.ts`

Move resultsValues to top-level `metrics` array with `tableRouting`.

---

## Files to Modify

1. `lib/types/module_definitions.ts` - Add MetricDefinition type
2. `server/db/migrations/project/006_add_metrics_table.sql` - Create tables
3. `server/db/migrations/project/007_finalize_metrics.sql` - Cleanup
4. `server/db_startup.ts` - JS migration
5. `server/db/project/modules.ts` - Populate on install
6. `server/db/project/results_value_resolver.ts` - Table-based resolver
7. `server/db/project/presentation_objects.ts` - Use metric_id
8. `module_defs/m003/1.0.0/definition.ts` - Add tableRouting

---

## Verification

1. `deno task typecheck`
2. `deno task build:modules`
3. Fresh project creates and populates tables
4. Existing project migrates correctly
5. M003 queries route to correct table based on disaggregation
6. Presentation objects work with metric_id
7. Module delete cascades to metrics and presentation_objects
