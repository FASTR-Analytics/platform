# Plan: Propagate Indicator Metadata

## Background

The app has multiple sources of "indicators" - named data points that can be disaggregated in visualizations. Each source has different metadata available (labels, formatting, thresholds). The goal is consistent propagation of this metadata to the UI for proper formatting and display.

## Indicator Sources

| Source | Module | DisaggregationOption | Instance Table | Project Snapshot Table |
|--------|--------|----------------------|----------------|------------------------|
| Calculated Indicators | m007, m008 | `indicator_common_id` | `calculated_indicators` | `calculated_indicators_snapshot` |
| HFA Indicators | m010 | `hfa_indicator` | `hfa_indicators` | `hfa_indicators_snapshot` |
| ICEH Indicators | m009 | `indicator_code` | `iceh_indicators` | `iceh_indicators_snapshot` |
| Raw/Common Indicators | m001-m006 | `indicator_common_id` | `indicators` | `indicators` (in project) |

## Metadata Categories

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

## Chosen Approach: DisaggregationOption Detection + Per-Indicator Fallback

### Core Principle

Separate two concerns:
1. **Getting metadata onto indicatorMetadata** - Server-side, ensure all indicator sources populate metadata
2. **Using metadata in UI** - Client-side, detect when to use it and fall back gracefully

### Detection Logic (Client-Side)

For **tables**, use this flow:

1. **Is an indicator DisaggregationOption in `disaggregateBy`?**
   - Check for: `hfa_indicator`, `indicator_code`, `indicator_common_id`
   - If none present → use metric-level formatting, done

2. **Does any indicator have `format_as` metadata?**
   - Quick check: `indicatorMetadata.some(m => m.format_as !== undefined)`
   - If false → use metric-level formatting, done (fast bail-out for m001-m006)

3. **Per-indicator formatting with fallback**
   - For each cell, look up indicator's metadata by row/column header
   - If indicator has `format_as` → use it
   - If indicator lacks `format_as` → fall back to metric-level `formatAs`

For **charts**, stick with metric-level formatting (Y-axis requires single scale).

### Metadata Usage by Category

| Category | Tables | Charts |
|----------|--------|--------|
| **Identity** (label) | Automatic - already used everywhere | Automatic |
| **Formatting** (format_as, decimal_places) | Automatic when detected | Metric-level only |
| **Thresholds** (direction, green, yellow) | Opt-in via `specialScorecardTable` | Not applicable |
| **Organization** (sort_order, group_label) | Automatic when detected | Not applicable |

### Why This Works

- **Scorecard (m008)**: `indicator_common_id` triggers check → metadata has `format_as` → per-indicator formatting
- **Raw modules (m001-m006)**: `indicator_common_id` triggers check → metadata lacks `format_as` → fast bail-out to metric-level
- **HFA (m010)**: `hfa_indicator` triggers check → metadata has derived `format_as` → per-indicator formatting
- **ICEH (m009)**: `indicator_code` triggers check → metadata needs `format_as` added → per-indicator formatting

---

## Implementation Plan

### Phase 1: Refactor Table Styling (Client)

**File: `client/src/generate_visualization/get_style_from_po/_0_common.ts`**

Add utility functions:

```typescript
const INDICATOR_DISAGGREGATION_OPTIONS: DisaggregationOption[] = [
  "hfa_indicator",
  "indicator_code", 
  "indicator_common_id",
];

export function hasIndicatorDisaggregation(config: PresentationObjectConfig): boolean {
  return config.d.disaggregateBy.some(d => 
    INDICATOR_DISAGGREGATION_OPTIONS.includes(d.disOpt)
  );
}

export function hasIndicatorFormatMetadata(metadata: IndicatorMetadata[]): boolean {
  return metadata.some(m => m.format_as !== undefined);
}
```

**File: `client/src/generate_visualization/get_style_from_po/_6_table_with_indicator_formatting.ts`** (NEW)

Create new style builder that:
- Uses per-indicator `format_as` with metric-level fallback
- Uses per-indicator `decimal_places` with fallback
- Does NOT apply threshold coloring (that stays in `_5_scorecard.ts`)

```typescript
export function buildTableStyleWithIndicatorFormatting(
  config: PresentationObjectConfig,
  metricFormatAs: "percent" | "number",
  indicatorMetadata: IndicatorMetadata[],
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  const metadataByLabel = new Map(indicatorMetadata.map(m => [m.label, m]));
  
  return {
    // ... standard table options ...
    content: {
      tableCells: {
        textFormatter: (info: TableCellInfo) => {
          const meta = metadataByLabel.get(info.colHeader) ?? metadataByLabel.get(info.rowHeader);
          const formatAs = meta?.format_as ?? metricFormatAs;
          const decimalPlaces = meta?.decimal_places ?? config.s.decimalPlaces ?? 0;
          return formatValue(info.value, formatAs, decimalPlaces);
        },
      },
    },
  };
}
```

**File: `client/src/generate_visualization/get_style_from_po.ts`**

Update main dispatch:

```typescript
export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
  indicatorMetadata?: IndicatorMetadata[],
): CustomFigureStyleOptions {
  
  // Scorecard with thresholds (existing behavior)
  if (isSpecialScorecardTableActive(config) && indicatorMetadata) {
    return buildScorecardStyle(config, indicatorMetadata, deckStyle);
  }
  
  // Tables with indicator formatting (NEW)
  if (config.d.type === "table" && indicatorMetadata) {
    if (hasIndicatorDisaggregation(config) && hasIndicatorFormatMetadata(indicatorMetadata)) {
      return buildTableStyleWithIndicatorFormatting(config, formatAs, indicatorMetadata, deckStyle);
    }
  }
  
  // Special chart styles (existing)
  if (isSpecialCoverageChartActive(config)) {
    return buildCoverageChartStyle(config, formatAs, deckStyle);
  }
  // ... etc
  
  return buildStandardStyle(config, formatAs, deckStyle);
}
```

### Phase 2: Add ICEH Metadata Support (Server)

**File: `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`**

Add ICEH handling:

```typescript
export async function getIndicatorMetadata(
  mainDb: Sql,
  projectDb: Sql,
  moduleId: string,
): Promise<IndicatorMetadata[]> {
  const moduleRow = await projectDb<{ module_definition: string }[]>`
    SELECT module_definition FROM modules WHERE id = ${moduleId}
  `.then(rows => rows.at(0));

  const moduleDef = moduleRow ? JSON.parse(moduleRow.module_definition) : null;
  const scriptGenerationType = moduleDef?.scriptGenerationType;

  if (scriptGenerationType === "hfa") {
    // Existing HFA logic
    return getHfaIndicatorMetadata(mainDb);
  }
  
  if (scriptGenerationType === "iceh") {  // NEW
    return getIcehIndicatorMetadata(mainDb);
  }

  // Existing: raw indicators + calculated indicators snapshot
  return getStandardIndicatorMetadata(projectDb);
}

async function getIcehIndicatorMetadata(mainDb: Sql): Promise<IndicatorMetadata[]> {
  const rows = await mainDb<DBIcehIndicator[]>`SELECT * FROM iceh_indicators`;
  return rows.map(row => ({
    id: row.indicator_code,
    label: row.indicator_name,
    format_as: "percent",  // ICEH indicators are typically percentages
    group_label: row.category,
    sort_order: row.sort_order,
  }));
}
```

**Alternative**: If ICEH format varies, add `format_as` column to `iceh_indicators` table.

### Phase 3: Organization (Sort Order) Support

**File: `client/src/generate_visualization/get_figure_inputs_from_po.ts`**

The `buildIndicatorSortOrder()` function already exists but only runs for scorecard. Extend to run for any table with indicator disaggregation:

```typescript
// Change from:
const customSortHeaders = isSpecialScorecardTableActive(config)
  ? buildIndicatorSortOrder(ih.indicatorMetadata)
  : undefined;

// To:
const customSortHeaders = (config.d.type === "table" && hasIndicatorDisaggregation(config))
  ? buildIndicatorSortOrder(ih.indicatorMetadata)
  : undefined;
```

---

## Files to Modify

### Client

| File | Change |
|------|--------|
| `client/src/generate_visualization/get_style_from_po/_0_common.ts` | Add `hasIndicatorDisaggregation()`, `hasIndicatorFormatMetadata()` |
| `client/src/generate_visualization/get_style_from_po/_6_table_with_indicator_formatting.ts` | NEW: Table style with per-indicator formatting, no thresholds |
| `client/src/generate_visualization/get_style_from_po.ts` | Update dispatch to use new table style when appropriate |
| `client/src/generate_visualization/get_figure_inputs_from_po.ts` | Extend sort order to all indicator-disaggregated tables |

### Server

| File | Change |
|------|--------|
| `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts` | Add ICEH handling |

### Types (if needed)

| File | Change |
|------|--------|
| `lib/types/_module_definition_github.ts` | Add `"iceh"` to `scriptGenerationType` if not present |

---

## Summary

**Before**: Per-indicator formatting only via `specialScorecardTable` flag, tightly coupled with threshold coloring.

**After**: 
- Per-indicator formatting automatic for tables when indicator DisaggregationOption present + metadata available
- Threshold coloring remains opt-in via `specialScorecardTable`
- Fast bail-out for modules without format metadata
- Charts unchanged (metric-level formatting)
