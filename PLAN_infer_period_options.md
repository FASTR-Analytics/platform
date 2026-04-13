# PLAN: Infer periodOptions from data instead of module definition

## Context

`periodOptions` on a metric tells the system which time column format the data uses (e.g. `["year"]`, `["period_id"]`, `["quarter_id"]`). Currently it's manually specified in module definitions and stored in the `metrics` DB table. But the enricher already detects which time column exists in the results table — the information is redundant and can get out of sync.

## Key insight

The `ResultsValue` type (used by all client code) keeps `periodOptions: PeriodOption[]`. Nothing changes for the client. The only change is that `enrichMetric` infers the value instead of reading it from the DB.

## What changes

### 1. `server/db/project/metric_enricher.ts` — `enrichMetric()` (line 49)

Currently: `periodOptions: parseJsonOrThrow(dbMetric.period_options)`

Change: infer from `disaggregationOptions` (which are already built by this point). The `buildDisaggregationOptions` function already detected which time column exists. Extract that info:

```typescript
function inferPeriodOptions(disaggregationOptions: ResultsValue["disaggregationOptions"]): PeriodOption[] {
  const disOpts = disaggregationOptions.map(d => d.value);
  if (disOpts.includes("period_id")) return ["period_id"];
  if (disOpts.includes("quarter_id")) return ["quarter_id"];
  if (disOpts.includes("year")) return ["year"];
  return [];
}
```

Replace line 49 with: `periodOptions: inferPeriodOptions(disaggregationOptions),`

The DB column `period_options` is still written and read but no longer used by the enricher. It becomes dead data.

### 2. `lib/types/module_definition_schema.ts` (line 143)

Change `periodOptions: PeriodOption[]` to `periodOptions?: PeriodOption[]` (optional).

### 3. `lib/types/module_definitions.ts`

- Line 107 (`ResultsValue`): **NO CHANGE** — keeps `periodOptions: PeriodOption[]` (always populated by enricher)
- Line 130 (`ResultsValueDefinition`): This `Omit`s `disaggregationOptions` from `ResultsValue`. It inherits `periodOptions: PeriodOption[]`. Since module definitions won't provide it, this type needs updating. `ResultsValueDefinition` should also omit `periodOptions` or make it optional.
- Line 144 (`MetricDefinition`): Change `periodOptions: PeriodOption[]` to `periodOptions?: PeriodOption[]`

### 4. `lib/types/module_definition_validator.ts` (line 267)

Change `periodOptions: z.array(periodOption)` to `periodOptions: z.array(periodOption).optional()`

### 5. `server/db/project/modules.ts` — DB writes (lines 151, 358, 425)

These write `JSON.stringify(metric.periodOptions)` to the `period_options` column. Since `periodOptions` becomes optional on `MetricDefinition`, need to handle undefined: `JSON.stringify(metric.periodOptions ?? [])`.

### 6. `server/db_startup.ts` (line 172)

Same: `JSON.stringify(rv.periodOptions ?? [])`.

### 7. `server/db/project/modules.ts` — display lines (752, 801)

These log `firstVariant.periodOptions.join(", ")`. Handle optional: `(firstVariant.periodOptions ?? []).join(", ")` or skip the line if empty.

## What does NOT change

- `ResultsValue.periodOptions` type — stays `PeriodOption[]`, always populated by enricher
- All client code — reads `resultsValue.periodOptions` which is always populated
- `server/server_only_funcs_presentation_objects/get_results_value_info.ts` — reads `resResultsValue.data.periodOptions` which comes from the enricher
- DB schema — `period_options` column stays (no migration needed), just becomes unused by the enricher
- `client/src/state/po_cache.ts`, all visualization components, AI tools — all read from `ResultsValue`, unaffected

## Verification

- Typecheck passes
- Remove `periodOptions` from one module definition, re-install module, verify the enricher still produces correct `periodOptions` on the `ResultsValue`
- Verify timeseries X-axis still works
- Verify period bounds still work
- Verify period filter still works
