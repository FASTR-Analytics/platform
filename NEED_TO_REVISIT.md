# Panther Sync - Issues to Revisit

## BLOCKING - Need to Fix (12 errors)

### 1. Layout System Rewrite (7 errors)

The layout system was completely rewritten:

- **Old types**: `ColContainerForLayout`, `ItemOrContainerForLayout`, `MeasurableItem`, `ADTItem`, `ADTParagraphStyleOptions`
- **New types**: `LayoutNode`, `RowsLayoutNode`, `ColsLayoutNode`, `ItemLayoutNode`
- **Affected files**:
  - `client/src/generate_report/get_rows_for_freeform.ts` (5 missing exports)
  - `client/src/generate_report/policy_brief/get_page_inputs_policy_brief_freeform.ts` (`rows` property)
  - `client/src/generate_report/slide_deck/get_page_inputs_slide_deck_freeform.ts` (`rows` property)

### 2. AI Chat API Changes (5 errors)

- **Old**: `useAIChat` hook, `MessagePayload`, `AnthropicResponse`, `AITool`, `renderMarkdown` config
- **New**: `createAIChat` signal-based API, different type names
- **Affected files**: `client/src/components/project_chatbot_v3/`

## COMMENTED OUT - Need to Restore

### `paragraph` text style key

- **Location**: `_005_page_style/text_style_keys.ts`
- **Affected files**:
  - `client/src/generate_report/policy_brief/get_style_policy_brief.ts`
  - `client/src/generate_report/slide_deck/get_style_slide_deck.ts`
- **Usage**: Styling markdown/paragraph content in reports
- **Fix**: Add `paragraph` back to `PAGE_TEXT_STYLE_KEYS` in panther source

### `tabWidth` content option

- **Location**: `_005_page_style/_2_custom_page_style_options.ts`
- **Affected files**:
  - `client/src/generate_report/policy_brief/get_style_policy_brief.ts`
  - `client/src/generate_report/slide_deck/get_style_slide_deck.ts`
- **Usage**: Tab width in content layout
- **Fix**: Add `tabWidth` back to `content` options in panther source

## FIXED

- `FontKeyOrFontInfo` → `FontInfo`
- `GenericSeriesInfo` → `ChartSeriesInfo`
- `GenericValueInfo` → `ChartValueInfo`
- `ADTFigure` → `FigureInputs`
- `.getAsObjectArray()` → `.toObjects()`
- `.fromObjectArray()` → `.fromObjects()`
- `.orderCols()` → `.reorderCols()`
- `Csv.MUTATE_addRow()` → use `aoa` in constructor
- Router `string | string[]` → `getFirstString()` helper
- markdown-it `MarkdownItToken` type mismatch (fixed in panther source)
