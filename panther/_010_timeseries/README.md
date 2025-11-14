# _010_timeseries

Time-based **Chart** with period handling (monthly, quarterly, yearly, etc.).

Timeseries is a **Chart** (Figure with panes/tiers/lanes support), not just a
simple Figure. See `FIGURE_ARCHITECTURE.md` for the Figure taxonomy.

## Purpose

Specialized Chart renderer for time-series data with:

- Period-based X-axis (monthly, quarterly, yearly, custom)
- Automatic period label formatting
- Calendar system support (Gregorian, Ethiopian, etc.)
- Date range handling
- Period intersection calculations
- Time-based data aggregation

## Key Exports

### Timeseries Renderer

```typescript
const TimeseriesRenderer: Renderer<TimeseriesInputs, MeasuredTimeseries>;
```

Object-based renderer implementing the standard Panther renderer pattern:

- `measure()` - Calculate chart dimensions with period axis
- `render()` - Draw the time-series chart
- `measureAndRender()` - Combined operation

### Data Transformation

```typescript
getTimeseriesDataTransformed(
  data: TimeseriesData,
  options: TimeseriesOptions,
): TimeseriesDataTransformed

getTimeseriesDataJsonTransformed(
  json: JsonArray,
  mapping: DataMapping,
): TimeseriesDataTransformed
```

Transform raw time data into chart-ready format.

### Period System

```typescript
interface PeriodInfo {
  periodId: string;
  periodType: "monthly" | "quarterly" | "yearly" | "custom";
  startDate: Date;
  endDate: Date;
  label?: string;
}

// Period utilities
getPeriodLabel(period: PeriodInfo, format?: string): string
getPeriodsInRange(start: Date, end: Date, type: PeriodType): PeriodInfo[]
```

## Usage Example

```typescript
import {
  getTimeseriesDataTransformed,
  TimeseriesRenderer,
} from "@timroberton/panther";

// Prepare timeseries data
const data = getTimeseriesDataTransformed(rawData, {
  periodField: "month",
  valueField: "revenue",
  seriesField: "region",
});

// Create inputs
const inputs: TimeseriesInputs = {
  timeseriesData: data,
  periodType: "monthly",
  dateRange: { start: "2023-01", end: "2023-12" },
  style: figureStyle,
};

// Render
TimeseriesRenderer.measureAndRender(
  renderContext,
  boundingBox,
  inputs,
);
```

## Period Types

- **Monthly**: Jan 2023, Feb 2023, etc.
- **Quarterly**: Q1 2023, Q2 2023, etc.
- **Yearly**: 2023, 2024, etc.
- **Custom**: User-defined period ranges

## Features

- **Automatic labeling**: Smart period label formatting
- **Calendar systems**: Support for different calendar types
- **Gap handling**: Handle missing periods in data
- **Period grouping**: Aggregate data by period
- **Intersection detection**: Find overlapping periods

## Module Dependencies

- `_007_figure_core` - Core chart framework
- `_003_figure_style` - Chart styling
- `_001_render_system` - Rendering primitives
- `_000_utils` - Period utilities
