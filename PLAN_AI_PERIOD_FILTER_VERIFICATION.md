# Fix: AI writes wrong time period when describing figures

## Status: IMPLEMENTED

## Problem
When the AI creates a viz from a preset (e.g. `completeness-table`), the preset may have a baked-in period filter like `last_n_months: 12`. But the AI didn't know this — `get_available_metrics` didn't expose the preset's period filter, and `show_draft_visualization_to_user` / `create_slide` didn't report the actual period used. So the AI described data using the full range from `get_metric_data` instead of the figure's actual filtered range.

## Changes made

### 1. Surface preset period filter in `get_available_metrics`
**File:** `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts`
- Added `describePeriodFilter()` helper
- Preset listings now show e.g. `(YYYYMM, default period: last 12 months)` instead of just `(YYYYMM)`

### 2. Return actual period in `create_slide` / `replace_slide` responses
**File:** `client/src/components/project_ai/ai_tools/tools/slides.tsx`
- Added `describeSlidePeriodFilters()` helper
- Both tools now append period filter warnings to their responses

### 3. Return actual period in `show_draft_visualization_to_user` response
**File:** `client/src/components/project_ai/ai_tools/tools/drafts.tsx`
- Response now includes period filter info instead of just "Visualization preview displayed to user."

### 4. System prompt "CRITICAL: Data accuracy" sections
**File:** `client/src/components/project_ai/build_system_prompt.ts`
- Both deck-level and slide-level editing instructions have a "CRITICAL: Data accuracy in text blocks" section instructing the AI to use only data from `get_slide`/`get_slide_editor`

### 5. Period filter banner in figure summaries
**File:** `client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts`
- `simplifySlideForAI` prepends a `⚠️ THIS FIGURE IS FILTERED TO...` banner to each figure block that has a period filter
