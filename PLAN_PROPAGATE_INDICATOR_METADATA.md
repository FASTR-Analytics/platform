# Plan: Propagate Indicator Metadata

## Background

The app has multiple sources of "indicators" — named data points that can be disaggregated in visualizations. Each source has different metadata available (labels, formatting, thresholds). The goal is consistent propagation of this metadata to the UI for proper formatting and display.

**Dependency:** This plan assumes [PLAN_PANTHER_HEADER_IDS.md](PLAN_PANTHER_HEADER_IDS.md) is implemented first, providing `rowHeaderId`/`colHeaderId` in `TableCellInfo` and `seriesId` in `ChartSeriesInfo`.

---

## Indicator Sources

| Source | Modules | DisaggregationOption | Instance Table | Project Snapshot |
|--------|---------|----------------------|----------------|------------------|
| Calculated Indicators | m007, m008 | `indicator_common_id` | `calculated_indicators` | `calculated_indicators_snapshot` |
| HFA Indicators | m010 | `hfa_indicator` | `hfa_indicators` | `hfa_indicators_snapshot` |
| ICEH Indicators | m009 | `iceh_indicator` | `iceh_indicators` | `iceh_indicators_snapshot` |
| Raw/Common Indicators | m001-m006 | `indicator_common_id` | `indicators` | `indicators` (in project) |

---

## Metadata Type

```typescript
type IndicatorMetadata = {
  // Identity (always present)
  id: string;
  label: string;
  
  // Formatting (optional)
  format_as?: "percent" | "number" | "rate_per_10k";
  decimal_places?: number;
  
  // Thresholds (optional)
  threshold_direction?: "higher_is_better" | "lower_is_better";
  threshold_green?: number;
  threshold_yellow?: number;
  
  // Organization (optional)
  group_label?: string;
  sort_order?: number;
};
```

---

## Core Principles

### 1. Lookup by ID, Not Label

**Before (fragile):**
```typescript
const metadataByLabel = new Map(metadata.map(m => [m.label, m]));
const meta = metadataByLabel.get(info.colHeader) ?? metadataByLabel.get(info.rowHeader);
```

**After (robust):**
```typescript
const metadataById = new Map(metadata.map(m => [m.id, m]));
const meta = metadataById.get(info.colHeaderId) ?? metadataById.get(info.rowHeaderId);
```

With panther providing IDs, lookup is deterministic regardless of label uniqueness.

### 2. Separate Formatting from Threshold Coloring

| Concern | Behavior | Control |
|---------|----------|---------|
| **Formatting** (percent/number, decimals) | Automatic when metadata has `format_as` | None needed — just works |
| **Threshold coloring** (red/yellow/green) | Opt-in | `specialScorecardTable` flag |

Formatting is about correctness (a percentage should display as "85%"). Threshold coloring is a presentation choice.

### 3. Graceful Fallback

For any cell:
1. Try indicator-level `format_as` (from metadata by ID)
2. Fall back to metric-level `formatAs` (from results value)

No detection logic needed — just try the lookup, use fallback if not found.

---

## Implementation

### Phase 1: Server — Unified Metadata Fetching

**File: `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`**

Ensure all indicator sources return complete metadata:

```typescript
export async function getIndicatorMetadata(
  mainDb: Sql,
  projectDb: Sql,
  moduleId: string,
): Promise<IndicatorMetadata[]> {
  const moduleRow = await projectDb<{ module_definition: string }[]>`
    SELECT module_definition FROM modules WHERE id = ${moduleId}
  `.then(rows => rows.at(0));

  if (!moduleRow) return [];

  const moduleDef = JSON.parse(moduleRow.module_definition);
  
  // Check dataSources for dataset type
  const datasetTypes = moduleDef.dataSources?.map((ds: any) => ds.datasetType) ?? [];

  if (datasetTypes.includes("hfa")) {
    return getHfaIndicatorMetadata(mainDb);
  }
  
  if (datasetTypes.includes("iceh")) {
    return getIcehIndicatorMetadata(mainDb);
  }

  // Standard: raw indicators + calculated indicators
  return getStandardIndicatorMetadata(projectDb);
}

async function getHfaIndicatorMetadata(mainDb: Sql): Promise<IndicatorMetadata[]> {
  const rows = await mainDb<DBHfaIndicator[]>`SELECT * FROM hfa_indicators`;
  return rows.map(row => ({
    id: row.var_name,
    label: row.definition,
    format_as: row.type === "binary" && row.aggregation === "avg" ? "percent" : "number",
    group_label: row.category,
    sort_order: row.sort_order,
  }));
}

async function getIcehIndicatorMetadata(mainDb: Sql): Promise<IndicatorMetadata[]> {
  const rows = await mainDb<DBIcehIndicator[]>`SELECT * FROM iceh_indicators`;
  return rows.map(row => ({
    id: row.iceh_indicator,
    label: row.indicator_name,
    format_as: row.format_as ?? "percent",  // Default to percent for survey data
    decimal_places: row.decimal_places ?? 1,
    group_label: row.category,
    sort_order: row.sort_order,
  }));
}

async function getStandardIndicatorMetadata(projectDb: Sql): Promise<IndicatorMetadata[]> {
  // Raw indicators (no formatting metadata)
  const rawIndicators = await projectDb<DBIndicator_IN_PROJECT[]>`SELECT * FROM indicators`;
  const rawMetadata: IndicatorMetadata[] = rawIndicators
    .filter(ind => ind.indicator_common_id && ind.indicator_common_label)
    .map(ind => ({
      id: ind.indicator_common_id!,
      label: ind.indicator_common_label!,
    }));

  // Calculated indicators (full metadata)
  const calculated = await getAllCalculatedIndicatorsFromSnapshot(projectDb);
  const calculatedMetadata: IndicatorMetadata[] = calculated.map(ci => ({
    id: ci.calculated_indicator_id,
    label: ci.label,
    format_as: ci.format_as,
    decimal_places: ci.decimal_places,
    threshold_direction: ci.threshold_direction,
    threshold_green: ci.threshold_green,
    threshold_yellow: ci.threshold_yellow,
    group_label: ci.group_label,
    sort_order: ci.sort_order,
  }));

  // Merge, calculated takes precedence
  const byId = new Map<string, IndicatorMetadata>();
  for (const m of rawMetadata) byId.set(m.id, m);
  for (const m of calculatedMetadata) byId.set(m.id, m);
  return Array.from(byId.values());
}
```

### Phase 2: Database — Add ICEH Formatting Columns (Optional)

If ICEH indicators need per-indicator formatting:

**File: `server/db/migrations/instance/0XX_iceh_format_columns.sql`**

```sql
ALTER TABLE iceh_indicators 
  ADD COLUMN IF NOT EXISTS format_as TEXT DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS decimal_places INTEGER DEFAULT 1;
```

If all ICEH indicators are percentages, skip this and use defaults in code.

### Phase 3: Client — Simplify Styling Logic

**File: `client/src/generate_visualization/get_style_from_po/_5_scorecard.ts`**

Update to use ID-based lookup:

```typescript
export function buildScorecardStyle(
  config: PresentationObjectConfig,
  indicatorMetadata: IndicatorMetadata[],
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  const metadataById = new Map(indicatorMetadata.map(m => [m.id, m]));

  return {
    scale: config.s.scale,
    text: getTextStyle(config, deckStyle),
    surrounds: { legendPosition: config.s.hideLegend ? "none" : undefined },
    grid: { showGrid: false },
    content: {
      tableCells: {
        func: (info: TableCellInfo) => {
          const meta = metadataById.get(info.colHeaderId) ?? metadataById.get(info.rowHeaderId);
          if (meta?.threshold_direction && info.valueAsNumber !== undefined) {
            const scaled = scaleValueForFormat(info.valueAsNumber, meta.format_as ?? "number");
            return {
              backgroundColor: getScorecardCutoffColor(
                meta.threshold_direction,
                meta.threshold_green ?? 0,
                meta.threshold_yellow ?? 0,
                scaled,
              ),
              textColorStrategy: {
                ifLight: { key: "baseContent" as const },
                ifDark: { key: "base100" as const },
              },
            };
          }
          return { backgroundColor: "none" };
        },
        textFormatter: (info: TableCellInfo) => {
          const meta = metadataById.get(info.colHeaderId) ?? metadataById.get(info.rowHeaderId);
          if (meta?.format_as && info.valueAsNumber !== undefined) {
            return formatScorecardValue(
              info.valueAsNumber,
              meta.format_as,
              meta.decimal_places ?? 0,
            );
          }
          return String(info.value);
        },
      },
    },
    table: getTableLayoutStyle(config),
  };
}
```

**File: `client/src/generate_visualization/get_style_from_po/_1_standard.ts`**

Add indicator-aware formatting to standard table style:

```typescript
export function buildStandardStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
  indicatorMetadata?: IndicatorMetadata[],
): CustomFigureStyleOptions {
  const metadataById = indicatorMetadata 
    ? new Map(indicatorMetadata.map(m => [m.id, m]))
    : undefined;

  return {
    // ... existing options ...
    content: {
      tableCells: config.d.type === "table" ? {
        func: getTableCellsContent(config, formatAs).func,
        textFormatter: (info: TableCellInfo) => {
          // Try indicator-level formatting first
          if (metadataById) {
            const meta = metadataById.get(info.colHeaderId) ?? metadataById.get(info.rowHeaderId);
            if (meta?.format_as && info.valueAsNumber !== undefined) {
              return formatValue(info.valueAsNumber, meta.format_as, meta.decimal_places ?? 0);
            }
          }
          // Fall back to metric-level
          return getFormatterFunc(formatAs, config.s.decimalPlaces ?? 0)(info.value);
        },
      } : undefined,
      // ... other content options ...
    },
    // ...
  };
}
```

**File: `client/src/generate_visualization/get_style_from_po.ts`**

Simplify dispatch — no detection needed:

```typescript
export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
  indicatorMetadata?: IndicatorMetadata[],
): CustomFigureStyleOptions {
  // Scorecard: formatting + threshold coloring
  if (isSpecialScorecardTableActive(config) && indicatorMetadata) {
    return buildScorecardStyle(config, indicatorMetadata, deckStyle);
  }
  
  // Special chart styles
  if (isSpecialCoverageChartActive(config)) {
    return buildCoverageChartStyle(config, formatAs, deckStyle);
  }
  if (isSpecialBarChartActive(config)) {
    return buildPercentChangeChartStyle(config, formatAs, deckStyle);
  }
  if (isSpecialDisruptionsChartActive(config)) {
    return buildDisruptionsChartStyle(config, formatAs, deckStyle);
  }
  
  // Standard: pass metadata for indicator-aware formatting
  return buildStandardStyle(config, formatAs, deckStyle, indicatorMetadata);
}
```

### Phase 4: Client — Sorting via Metadata

**File: `client/src/generate_visualization/get_figure_inputs_from_po.ts`**

The existing `buildIndicatorSortOrder` returns IDs and labels for custom sort. With panther's new sorting API, we can pass a sort function directly:

```typescript
function buildIndicatorSortFunc(metadata: IndicatorMetadata[]): HeaderSortFunc | undefined {
  const withSortOrder = metadata.filter(m => m.sort_order !== undefined);
  if (withSortOrder.length === 0) return undefined;
  
  const sortOrderById = new Map(withSortOrder.map(m => [m.id, m.sort_order!]));
  
  return (a, b) => {
    const aOrder = sortOrderById.get(a.id) ?? Infinity;
    const bOrder = sortOrderById.get(b.id) ?? Infinity;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.label.localeCompare(b.label);
  };
}
```

This sort function can be passed to panther's new `sort.series` or `sort.indicator` config.

---

## Files to Modify

### Server

| File | Change |
|------|--------|
| `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts` | Add ICEH handling, use datasetType detection |
| `server/db/migrations/instance/0XX_iceh_format_columns.sql` | (Optional) Add format columns to iceh_indicators |

### Client

| File | Change |
|------|--------|
| `client/src/generate_visualization/get_style_from_po/_5_scorecard.ts` | Use ID-based lookup |
| `client/src/generate_visualization/get_style_from_po/_1_standard.ts` | Add indicator-aware formatting with fallback |
| `client/src/generate_visualization/get_style_from_po.ts` | Pass metadata to standard style |
| `client/src/generate_visualization/get_figure_inputs_from_po.ts` | Update sort to use new panther API |

### Removed from Original Plan

| Item | Reason |
|------|--------|
| `_6_table_with_indicator_formatting.ts` | Not needed — standard style handles it |
| `hasIndicatorDisaggregation()` detection | Not needed — ID lookup handles it |
| `hasIndicatorFormatMetadata()` check | Not needed — fallback handles it |
| `INDICATOR_DISAGGREGATION_OPTIONS` list | Not needed |

---

## Data Flow Summary

```
Server:
  Module → dataSources → datasetType
    → getIndicatorMetadata() dispatches to:
      - getHfaIndicatorMetadata()
      - getIcehIndicatorMetadata()  
      - getStandardIndicatorMetadata()
    → IndicatorMetadata[] with id, label, format_as, thresholds, sort_order

Client:
  indicatorMetadata flows to:
    → getStyleFromPresentationObject()
      → buildScorecardStyle() [if specialScorecardTable]
      → buildStandardStyle() [otherwise]
        → textFormatter receives TableCellInfo with rowHeaderId/colHeaderId
        → lookup metadata by ID
        → use format_as if present, else metric-level formatAs
```

---

## Summary

| Before | After |
|--------|-------|
| Lookup by label (fragile) | Lookup by ID (robust) |
| Detection logic for indicator tables | No detection — try lookup, fallback if not found |
| Separate `_6_table_with_indicator_formatting.ts` | Integrated into `_1_standard.ts` |
| `specialScorecardTable` controls formatting + thresholds | `specialScorecardTable` controls thresholds only |
| ICEH not handled | ICEH handled via datasetType detection |
| Sort order via string[] list | Sort order via HeaderSortFunc |

---

## Future: Chart Data Labels

The panther changes also add `seriesId` to `ChartSeriesInfo` and `ChartValueInfo`. This enables per-indicator formatting for chart data labels:

```typescript
// Potential future use in chart content style
dataLabels: {
  textFormatter: (info: ChartValueInfo) => {
    const meta = metadataById.get(info.seriesId);
    if (meta?.format_as && info.val !== undefined) {
      return formatValue(info.val, meta.format_as, meta.decimal_places ?? 0);
    }
    return defaultFormatter(info.val);
  },
}
```

**Not in scope for initial implementation** — tables are the priority. Chart axis formatting still requires a single scale, but data labels could vary per-series.

---

**Dependency chain:**
1. PLAN_PANTHER_HEADER_IDS.md (provides IDs in Info objects)
2. This plan (uses IDs for metadata lookup)