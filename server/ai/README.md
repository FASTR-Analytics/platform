# AI Chart Interpretation

This module provides functionality to interpret charts using Anthropic's Claude API. It supports all three panther visualization types: Timeseries, ChartOV, and Table.

## Usage

### High-level API

The simplest way to get AI interpretation of any panther visualization:

```typescript
import { getAIInterpretation } from "./ai/mod.ts"
import type { TimFigureInputs } from "../deno-panther/panther/mod.ts"

// Your visualization inputs (Timeseries, ChartOV, or Table)
const figureInputs: TimFigureInputs = {
  timeseriesType: "timeseries",
  timeseriesData: { /* ... */ },
  caption: "Sales Performance"
}

// Get AI interpretation
const interpretation = await getAIInterpretation(figureInputs)
console.log(interpretation)
```

### Low-level APIs

#### Interpret from structured data (recommended)

```typescript
import { interpretChartFromData } from "./ai/mod.ts"
import type { ChartData } from "./ai/mod.ts"

const chartData: ChartData = {
  type: "line",
  title: "Monthly Sales",
  datasets: [
    {
      label: "Product A",
      data: [
        { x: "Jan", y: 100 },
        { x: "Feb", y: 120 }
      ],
      color: "#3b82f6"
    }
  ]
}

const interpretation = await interpretChartFromData(
  process.env.ANTHROPIC_API_KEY,
  {
    chartData,
    context: "This shows our Q1 sales performance",
    questions: ["What trends do you see?", "Should we be concerned?"]
  }
)
```

#### Interpret from image

```typescript
import { interpretChartFromImage } from "./ai/mod.ts"

const base64Image = "data:image/png;base64,..."

const interpretation = await interpretChartFromImage(
  process.env.ANTHROPIC_API_KEY,
  {
    imageData: base64Image,
    context: "This is our competitor analysis chart",
    questions: ["How do we compare to competitors?"]
  }
)
```

## Environment Setup

You need to set the `ANTHROPIC_API_KEY` environment variable:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

## Internal Architecture

The module is organized as follows:

- `get_ai_interpretation.ts` - Main entry point that detects visualization type
- `interpret_chart_data.ts` - Interprets structured chart data
- `interpret_chart_image.ts` - Interprets chart images
- `types.ts` - TypeScript type definitions
- `_internal/converters/` - Converters for each visualization type:
  - `timeseries_to_chart_data.ts` - Converts TimeseriesInputs to ChartData
  - `chartov_to_chart_data.ts` - Converts ChartOVInputs to ChartData
  - `table_to_chart_data.ts` - Converts TableInputs to ChartData

## Best Practices

1. **Use structured data interpretation over image interpretation** when possible - it provides more accurate and detailed insights
2. **Include relevant context** to help the AI understand what the chart represents
3. **Ask specific questions** to guide the AI's analysis
4. **Handle errors gracefully** - the API calls may fail due to rate limits or network issues