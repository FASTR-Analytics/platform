# Fix: AI writes wrong time period when describing figures

## Status: IMPLEMENTED

## Problem
When the AI creates a viz from a preset with a relative period filter (e.g. `last_n_months: 12`), the data returned to the AI via `get_slide`/`get_slide_editor` was unfiltered — it showed all-time aggregated data instead of the last 12 months. The chart rendered correctly (the server resolves relative filters), but the CSV data the AI read was wrong.

**Root cause:** `getDataFromConfig` in `format_metric_data_for_ai.ts` only passed bounded period filters (`custom`, `from_month`) to the data query. Relative filters like `last_n_months` were silently dropped, causing the query to return all data.

## Changes made

### Core fix: Pass relative period filters through to data queries
**File:** `client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts`
- `getDataFromConfig` now passes `config.d.periodFilter` directly (including relative filters) instead of only extracting bounded min/max
- Added `periodFilterOverride` parameter to `getMetricDataForAI`
- Updated `formatItemsAsMarkdown` to accept and display all period filter types

### Surface preset period filter in `get_available_metrics`
**File:** `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts`
- Preset listings now show e.g. `(YYYYMM, default period: last 12 months)`
- Added `describePeriodFilter()` helper

### Return actual period in tool responses
**File:** `client/src/components/project_ai/ai_tools/tools/slides.tsx`
- `create_slide` and `replace_slide` responses now include period filter warnings
- Added `describeSlidePeriodFilters()` helper

**File:** `client/src/components/project_ai/ai_tools/tools/drafts.tsx`
- `show_draft_visualization_to_user` response now includes period filter info

### System prompt + data banner reinforcement
**File:** `client/src/components/project_ai/build_system_prompt.ts`
- "CRITICAL: Data accuracy in text blocks" sections in both deck and slide editing modes

**File:** `client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts`
- Period filter warning banner prepended to figure block summaries in `simplifySlideForAI`
