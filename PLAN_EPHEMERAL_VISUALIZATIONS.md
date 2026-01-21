# Plan: Ephemeral Visualizations

## Goal

Allow visualizations to be rendered without storing them in the database. Use cases:
- AI creates exploratory vizzes that user may discard
- Inline vizzes in reports (config stored in report, not as separate PO)
- Quick data exploration

## Key Insight

A stored visualization = `presentationObjectId` → fetch → `{ metric, config }`

An ephemeral visualization = `{ metric, config }` directly (same data, no ID)

Both use the same rendering path once you have `{ metric, config }`.

---

## Current Flow (Stored)

```
1. Have presentationObjectId
2. Fetch PODetail → { resultsValue (metric), config }
3. Fetch items using resultsObjectId from metric
4. Render with metric + config + items
```

## Proposed Flow (Ephemeral)

```
1. Have metric (from selection) + config (built by user/AI)
2. (skip PODetail fetch - we already have it)
3. Fetch items using resultsObjectId from metric
4. Render with metric + config + items
```

Same steps 3-4. The difference is where `{ metric, config }` comes from.

---

## Changes

### 1. Types

**`lib/types/visualization.ts`** (new file)

```typescript
import type { ResultsValue, PresentationObjectConfig } from "./presentation_objects.ts";

// The data needed to render any visualization
export type VisualizationData = {
  metric: ResultsValue;
  config: PresentationObjectConfig;
};

// How to reference a visualization
export type VisualizationSource =
  | { type: "stored"; presentationObjectId: string }
  | { type: "inline"; data: VisualizationData };
```

### 2. Client - Unified Rendering

The client already has the pattern:
- `getPODetailFromCacheOrFetch()` - gets `{ metric, config }` from stored PO
- `getPresentationObjectItemsFromCacheOrFetch()` - gets items
- `getFigureInputsFromPresentationObject()` - builds render inputs

For ephemeral, we skip step 1 (already have the data) and go straight to step 2.

**`client/src/state/po_cache.ts`** - add function:

```typescript
export async function* getVisualizationFigureInputs(
  projectId: string,
  source: VisualizationSource,
): AsyncGenerator<StateHolder<FigureInputs>> {

  let metric: ResultsValue;
  let config: PresentationObjectConfig;

  if (source.type === "stored") {
    // Fetch from server
    const poDetail = await getPODetailFromCacheOrFetch(projectId, source.presentationObjectId);
    if (!poDetail.success) {
      yield { status: "error", err: poDetail.err };
      return;
    }
    metric = poDetail.data.resultsValue;
    config = poDetail.data.config;
  } else {
    // Already have it
    metric = source.data.metric;
    config = source.data.config;
  }

  // From here, same path for both
  const items = await getItemsFromCacheOrFetch(projectId, metric, config);
  // ... render
}
```

### 3. Items Endpoint

The existing `getPresentationObjectItems` endpoint already accepts:
- `resultsObjectId`
- `fetchConfig`
- `firstPeriodOption`

The `presentationObjectId` in the body is only used for logging. We can:
- Make it optional, OR
- Pass a placeholder like `"ephemeral"` for logging

No new endpoint needed.

### 4. Client Component

**`client/src/components/visualization/index.tsx`**

```typescript
type Props = {
  projectId: string;
  source: VisualizationSource;
};

export function Visualization(props: Props) {
  // Uses getVisualizationFigureInputs() which handles both stored and inline
}
```

### 5. AI Integration

AI can create ephemeral vizzes by returning `VisualizationData`:

```typescript
createAITool({
  name: "show_visualization",
  handler: async (input) => {
    // AI picks metric from available metrics
    const metric = findMetricById(input.metricId);

    // AI builds config
    const config = buildConfig(input);

    // Return inline visualization
    return {
      type: "inline_visualization",
      data: { metric, config },
    };
  },
  displayComponent: (props) => (
    <Visualization
      projectId={projectId}
      source={{ type: "inline", data: props.result.data }}
    />
  ),
});
```

### 6. Save Ephemeral → Stored

To save an ephemeral viz, call existing `createPresentationObject` endpoint with the metric and config. No new endpoint needed.

---

## Reports with Inline Vizzes

Report items can embed visualization data:

```typescript
type ReportItem =
  | { type: "stored_viz"; presentationObjectId: string }
  | { type: "inline_viz"; data: VisualizationData }
  | { type: "markdown"; content: string };
```

Report rendering uses the same `Visualization` component with appropriate source.

---

## Files to Modify

1. `lib/types/visualization.ts` - new file with VisualizationSource, VisualizationData
2. `lib/types/mod.ts` - export new types
3. `client/src/state/po_cache.ts` - add unified rendering function
4. `client/src/components/visualization/index.tsx` - support both sources
5. `client/src/components/ai_tools/tools/visualization_tools.tsx` - use inline vizzes

---

## What We DON'T Need

- No new server endpoints (items endpoint already works)
- No database changes
- No new caching logic (items cache already keyed by resultsObjectId + fetchConfig)

---

## Verification

1. Stored vizzes continue to work exactly as before
2. AI can create inline viz → renders without DB record
3. User can "save" inline viz → creates stored PO
4. Report can embed inline viz config
