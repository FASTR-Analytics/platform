# AI Tools Implementation Plan

## Overview

Add tools that enable AI to discover ResultsValues and create visualizations programmatically.

## New Tools

| Tool | Purpose |
|------|---------|
| `get_available_results_values` | List all ResultsValues with disaggregation options |
| `get_results_value_details` | Get period bounds, possible values for a metric |
| `get_disaggregation_values` | List values for a disaggregation dimension |
| `create_visualization` | Create PO with disaggregations and filters |
| `delete_visualization` | Delete AI-created visualizations |

## Implementation Steps

### Phase 1: Type Updates
- [x] Add `aiDescription` type to `ResultsValueDefinition` in `lib/types/module_definitions.ts`

### Phase 2: Database
- [x] Create migration adding `created_by_ai` column to `presentation_objects`
- [x] Update `DBPresentationObject` type in `server/db/project/_project_database_types.ts`

### Phase 3: Server Functions
- [x] Update `addPresentationObject()` to accept `createdByAI` parameter
- [x] Add `deleteAIPresentationObject()` function

### Phase 4: Routes & Actions
- [x] Add `POST /presentation_objects/createFromResultsValue` endpoint
- [x] Add `DELETE /presentation_objects/ai/:po_id` endpoint
- [x] Register routes in `lib/api-routes/project/presentation-objects.ts`
- [x] Server actions auto-generated from route registry

### Phase 5: Tools
- [x] Add 4 new tools to `client/src/components/project_chatbot_v3/tools.tsx`:
  - `get_available_results_values`
  - `get_results_value_details`
  - `create_visualization`
  - `delete_visualization`

## Status: COMPLETE

All implementation steps have been completed. The AI chatbot now has tools to:
1. Discover available ResultsValues with their disaggregation options
2. Get detailed information about specific ResultsValues
3. Create new visualizations from ResultsValues
4. Delete AI-created visualizations

## Next Steps (Future Work)
- [ ] Add `aiDescription` content to module definitions (descriptions are currently empty)
- [ ] Add filter support to `create_visualization` (TODO in code)

## Files to Modify

```
lib/types/module_definitions.ts              # Add aiDescription type
server/db/migrations/project/                # New migration
server/db/project/_project_database_types.ts # Update DBPresentationObject
server/db/project/presentation_objects.ts    # Update/add functions
server/routes/project/presentation_objects.ts # New endpoints
lib/api-routes/project/presentation_objects.ts # Route registration
client/src/server_actions/index.ts           # Server actions
client/src/components/project_chatbot_v3/tools.tsx # New tools
```

## aiDescription Type

```typescript
aiDescription?: {
  summary: string;           // 1-2 sentence summary
  methodology?: string;      // How it's calculated
  interpretation?: string;   // How to interpret values
  useCases?: string[];       // When to use this metric
  relatedMetrics?: string[]; // Related ResultsValue IDs
};
```

## create_visualization Input Schema

```typescript
{
  label: string;
  moduleId: string;
  resultsValueId: string;
  presentationType: "timeseries" | "table" | "chart";
  disaggregations: string[];
  filters?: { dimension: string; values: string[] }[];
  periodFilter?: { startPeriod?: number; endPeriod?: number };
}
```
