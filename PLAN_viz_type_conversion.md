# Plan: Visualization Type Conversion + VIZ_TYPE_CONFIG Refactoring

## Context

Visualization type (timeseries/table/chart) is currently immutable after creation. We want to support switching types in the editor. Rather than scattering more type-specific logic, we'll centralize all per-type configuration into a single `VIZ_TYPE_CONFIG` record — making future type additions (horizontal bar, scatter, etc.) a matter of adding one record entry.

## 1. Add `VIZ_TYPE_CONFIG` record in `lib/types/presentation_objects.ts`

Single source of truth for all type-specific defaults and mappings:

```typescript
export const VIZ_TYPE_CONFIG: Record<PresentationOption, {
  defaultValuesDisDisplayOpt: DisaggregationDisplayOption;
  defaultContent: PresentationObjectConfig["s"]["content"];
  disaggregationDisplayOptions: DisaggregationDisplayOption[];
  disDisplayOptFallbacks: Partial<Record<DisaggregationDisplayOption, DisaggregationDisplayOption>>;
  styleResets: Partial<PresentationObjectConfig["s"]>;
}> = {
  timeseries: {
    defaultValuesDisDisplayOpt: "series",
    defaultContent: "lines",
    disaggregationDisplayOptions: ["series", "cell", "row", "col", "replicant"],
    disDisplayOptFallbacks: { indicator: "series", rowGroup: "row", colGroup: "col" },
    styleResets: { specialScorecardTable: false, sortIndicatorValues: "none", verticalTickLabels: false },
  },
  table: {
    defaultValuesDisDisplayOpt: "col",
    defaultContent: "bars",
    disaggregationDisplayOptions: ["row", "col", "rowGroup", "colGroup", "replicant"],
    disDisplayOptFallbacks: { series: "row", cell: "row", indicator: "col" },
    styleResets: { specialBarChart: false, specialCoverageChart: false, diffAreas: false },
  },
  chart: {
    defaultValuesDisDisplayOpt: "indicator",
    defaultContent: "bars",
    disaggregationDisplayOptions: ["indicator", "series", "cell", "row", "col", "replicant"],
    disDisplayOptFallbacks: { rowGroup: "row", colGroup: "col" },
    styleResets: { specialScorecardTable: false, specialCoverageChart: false, specialBarChart: false, diffAreas: false },
  },
};
```

## 2. Refactor existing functions to use `VIZ_TYPE_CONFIG`

**`get_DISAGGREGATION_DISPLAY_OPTIONS()`** — derive valid values from config, keep existing label logic (labels vary per type so they stay in this function, but value arrays come from config).

**`getStartingConfigForPresentationObject()`** — replace inline ternaries:

```typescript
// Before:
valuesDisDisplayOpt: presentationOption === "timeseries" ? "series" : ...
content: presentationOption === "timeseries" ? "lines" : "bars",

// After:
valuesDisDisplayOpt: VIZ_TYPE_CONFIG[presentationOption].defaultValuesDisDisplayOpt,
content: VIZ_TYPE_CONFIG[presentationOption].defaultContent,
```

## 3. New file: `lib/convert_visualization_type.ts`

```typescript
function convertVisualizationType(
  config: PresentationObjectConfig,
  newType: PresentationOption,
  disaggregationOptions: ResultsValue["disaggregationOptions"],
): PresentationObjectConfig
```

Steps (all read from `VIZ_TYPE_CONFIG[newType]`):

1. **Validate** — for each `disaggregateBy` entry, if its disaggregation has `allowedPresentationOptions` that doesn't include `newType`, throw error
2. **Set** `config.d.type` to `newType`
3. **Set** `config.d.valuesDisDisplayOpt` from `defaultValuesDisDisplayOpt`
4. **Remap** each `disaggregateBy[].disDisplayOpt` using `disDisplayOptFallbacks` (keep if already valid, fallback if not). Resolve duplicates by assigning next available from `disaggregationDisplayOptions`
5. **Set** `config.s.content` from `defaultContent`
6. **Apply** `styleResets` to `config.s`
7. **Preserve** everything else (`filterBy`, `periodFilter`, `periodOpt`, `config.t`, shared style props)

## 4. Fix AI update API type safety

- `lib/api-routes/project/presentation-objects.ts:185` — `displayAs: string` → `DisaggregationDisplayOption`
- `server/db/project/presentation_objects.ts:495` — same type fix in `UpdateAIPresentationObjectParams`
- `server/db/project/presentation_objects.ts:561` — remove `as any` cast

## Files to modify

1. **Create** `lib/convert_visualization_type.ts`
2. **Edit** `lib/types/presentation_objects.ts` — add `VIZ_TYPE_CONFIG`, refactor `get_DISAGGREGATION_DISPLAY_OPTIONS()` and `getStartingConfigForPresentationObject()`
3. **Edit** `lib/mod.ts` — add exports
4. **Edit** `lib/api-routes/project/presentation-objects.ts:185` — type fix
5. **Edit** `server/db/project/presentation_objects.ts:495,561` — type fix + remove cast

## Verification

- `deno task typecheck`
