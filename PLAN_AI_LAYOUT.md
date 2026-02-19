# Plan: AI Layout Control for Slides

## Context

Users report two problems with the AI slide tools:
1. The AI **cannot add/remove blocks** from existing slides — `update_slide_content` only swaps block content, `replace_slide` destroys layout
2. The AI **cannot change layout** (rows vs cols, spans) — it's all optimizer-decided with no override

The root cause: the AI has no tool for layout manipulation and gets almost no layout feedback (just `"2 blocks side by side"` with no span/nesting info).

## Approach: "Rows of Columns" Layout Spec

Give the AI a simple, non-recursive layout model: **an array of rows, where each row is an array of cells with column spans (12-column grid)**. Each cell references either an existing block (by ID) or defines a new block inline.

This covers all practical layouts for 1–3 blocks:
- Side by side: `[[{block: "t2n", span: 8}, {block: "x5k", span: 4}]]`
- Stacked: `[[{block: "t2n"}], [{block: "x5k"}]]`
- 2 top + 1 bottom: `[[{block: "t2n", span: 6}, {block: "x5k", span: 6}], [{block: "m3p"}]]`
- Add new block: `[[{block: "t2n", span: 8}, {block: {type: "text", markdown: "..."}, span: 4}]]`

### Limitation: "Cols of Rows" not representable

This model cannot express layouts like "1 block on left, 2 stacked on right" (i.e., `cols([item, rows([item, item])])`). The optimizer never produces these, but the **manual slide editor** can — via context menu operations like "Split into rows" on a block inside a cols layout. For `layoutNodeToStructure` (the inverse function), we handle this with a best-effort fallback (see step 5).

---

## Changes

### 1. New schema: `LayoutSpecSchema` in `lib/types/slides_ai_input.ts`

```typescript
const LayoutCellSchema = z.object({
  block: z.union([
    z.string().describe("Existing block ID (from get_slide) to keep unchanged"),
    AiContentBlockInputSchema.describe("New block content to create"),
  ]),
  span: z.number().int().min(1).max(12).optional()
    .describe("Column width (1-12). Spans per row must sum to 12. Omit for equal split."),
});

const LayoutSpecSchema = z.array(
  z.array(LayoutCellSchema).min(1).max(3)
).min(1).max(3)
  .describe("Rows (top→bottom), each containing columns (left→right).");
```

Export types: `LayoutCell`, `LayoutSpec`.

### 2. Better layout feedback in `extract_blocks_from_layout.ts`

Replace the flat `_layout_info: string` with structured output on `SimplifiedSlide`:

```typescript
// Before:
_layout_info: "2 blocks side by side"

// After:
_layout: {
  description: "Row 1: t2n (span=8) | x5k (span=4)",
  structure: [[{blockId: "t2n", span: 8}, {blockId: "x5k", span: 4}]]
}
```

The `structure` field mirrors the `LayoutSpec` format (using blockId instead of block content), so the AI can read the current state and modify it directly when calling `modify_slide_layout`.

For manually-edited slides with complex nesting that can't be cleanly represented (e.g., "cols of rows"), `structure` is set to `null` and `description` includes a note: `"Complex layout — use replace_slide to restructure"`. This is a rare edge case since the optimizer never produces these trees; only manual context-menu operations do.

`SimplifiedSlide` is safe to change — it's not imported anywhere, only used as the return type of `simplifySlideForAI()`.

**File:** `client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts`

### 3. New tool: `modify_slide_layout` in `slides.tsx`

For deck-level editing — add/remove blocks, change layout structure.

```typescript
name: "modify_slide_layout",
description: "Modify the layout and/or blocks of a content slide. Use this to:
  add new blocks, remove blocks, rearrange blocks, or change column widths.
  The layout specifies ALL blocks that will be on the slide — any existing blocks
  not referenced are REMOVED. Use block IDs from get_slide to keep existing blocks;
  provide inline content for new blocks. Prefer balanced spans (e.g. 6+6 or 8+4) unless
  the user requests specific proportions.
  To change what's IN a block → use update_slide_content.
  To change which blocks EXIST or how they're ARRANGED → use this tool.",
inputSchema: z.object({
  slideId: z.string(),
  header: z.string().max(200).optional().describe("If provided, updates the header. If omitted, the existing header is preserved."),
  layout: LayoutSpecSchema,
})
```

Handler logic:
1. Fetch current slide, validate it's a content slide. Header defaults to existing: `input.header ?? currentSlide.header`
2. Extract existing blocks from layout tree (ID → full ContentBlock map, preserving `.source`, `.style`, and all other properties)
3. For each cell in the layout spec:
   - String → look up existing block by ID, error if not found
   - Object → resolve new block via existing helpers (`resolveFigureFromMetric`, `resolveFigureFromVisualization`), generate 3-char ID via `createIdGeneratorForLayout(currentLayout)`. For inline text blocks, call `validateNoMarkdownTables()` before resolving.
4. Validate total block count ≤ MAX_CONTENT_BLOCKS, validate/normalize spans (see Validation section)
5. Build `LayoutNode<ContentBlock>` tree from spec using `buildLayoutFromSpec`
6. Save via `serverActions.updateSlide`
7. Call `ctx.optimisticSetLastUpdated` for the slide
8. Return response including list of any removed blocks: `"Removed blocks: x5k (figure), m3p (text)"`

**File:** `client/src/components/project_ai/ai_tools/tools/slides.tsx`

### 4. Layout support in `update_slide_editor` in `slide_editor.tsx`

Add optional `layoutChange` parameter (mutually exclusive with `blockUpdates`):

```typescript
layoutChange: z.object({
  layout: LayoutSpecSchema,
}).optional()
  .describe("Restructure the slide layout. Mutually exclusive with blockUpdates.")
```

Runtime check:
```typescript
if (input.blockUpdates && input.layoutChange) {
  throw new Error("Cannot use both blockUpdates and layoutChange. Use blockUpdates to change block content, or layoutChange to change layout structure.");
}
```

Handler flow for content slides: `header` is processed first (independently), then either `blockUpdates` or `layoutChange`. This means `header` + `layoutChange` together is valid.

Same core logic as #3 but operates on the temp slide state via `ctx.getTempSlide()` / `ctx.setTempSlide(reconcile(...))`.

**File:** `client/src/components/project_ai/ai_tools/tools/slide_editor.tsx`

### 5. New helper: `layout_spec_helpers.ts`

Shared conversion logic used by both tools and the feedback function.

#### `buildLayoutFromSpec`

Converts the rows-of-cols spec to a LayoutNode tree **matching the optimizer's tree shape exactly**:

```
Spec: [[{A}]]                  → rows([item(A)])
Spec: [[{A}], [{B}]]           → rows([rows([item(A)]), rows([item(B)])])
Spec: [[{A, s:8}, {B, s:4}]]   → cols([rows([item(A)]).span=8, rows([item(B)]).span=4])
Spec: [[{A, s:6}, {B, s:6}],   → rows([
       [{C}]]                       cols([rows([item(A)]).span=6, rows([item(B)]).span=6]),
                                     rows([item(C)])
                                   ])
```

Key rules:
- Items inside `cols` are always wrapped in `rows([item])` with span on the `rows` wrapper (matching optimizer at `optimizer.ts:190-194`)
- Items in multi-row layouts are wrapped in `rows([item])` (matching optimizer's recursive `n===1` base case at `optimizer.ts:152-153`)
- Single-item slide: `rows([item])` (no extra wrapping)
- Container nodes (rows/cols wrappers) use UUID IDs via `createRowsNode`/`createColsNode` defaults. Item nodes use 3-char IDs via `createIdGeneratorForLayout`.

#### `layoutNodeToStructure`

Converts a LayoutNode tree back to the rows-of-cols format for AI feedback.

Unwrapping rules (handles both optimizer-produced and `buildLayoutFromSpec`-produced trees):
- `item` at root → `[[{blockId, span: 12}]]`
- `rows` at root → each child becomes a row:
  - child is `item` → single-block row `[{blockId, span: 12}]`
  - child is `rows` with exactly 1 `item` child → unwrap: single-block row
  - child is `cols` → multi-block row (unwrap each cols child)
  - child is `rows` with multiple children → fallback to `null`
- `cols` at root → single multi-block row, unwrap each child:
  - child is `rows([item]).span=N` → `{blockId, span: N}`
  - child is `item.span=N` → `{blockId, span: N}`
  - child is `rows` with multiple children → can't represent, fallback to `null`

Returns `{ description: string, structure: LayoutStructure | null }`. Null structure means the layout is too complex for the rows-of-cols model (manual editor "cols of rows" case).

**File:** New file at `client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts`

### 6. Update tool descriptions

Update existing tool descriptions for clarity now that there are 4 content-modification tools:

- **`replace_slide`**: Add: "For layout changes on existing content, prefer modify_slide_layout which preserves existing blocks."
- **`update_slide_content`**: Add: "To add/remove blocks or change layout arrangement, use modify_slide_layout instead."
- **`modify_slide_layout`** (new): Primary description covers when to use it vs the others.

---

## Validation Rules

**Span normalization** (forgiving, not strict):
- If ALL spans in a row are omitted → equal split (e.g., 2 blocks → 6+6, 3 blocks → 4+4+4)
- If SOME spans are omitted → remaining space distributed equally among unspecified cells. E.g., `[{span: 8}, {}]` → `[{span: 8}, {span: 4}]`
- If all spans specified but don't sum to 12 → error (don't silently rescale, AI should fix)
- Single-item rows → span defaults to 12

**Other rules:**
- Total blocks across all rows ≤ MAX_CONTENT_BLOCKS (3)
- Every string block reference must exist in the current slide's layout
- Each block (existing or new) must appear exactly once — **check for duplicate block IDs**
- At least 1 block required
- Content slides only (error on cover/section)

## File Summary

| File | Action |
|------|--------|
| `lib/types/slides_ai_input.ts` | Add LayoutCellSchema, LayoutSpecSchema, export types |
| `client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts` | Replace `_layout_info` with structured `_layout` |
| `client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts` | **New** — buildLayoutFromSpec + layoutNodeToStructure |
| `client/src/components/project_ai/ai_tools/tools/slides.tsx` | Add `modify_slide_layout` tool, update existing descriptions |
| `client/src/components/project_ai/ai_tools/tools/slide_editor.tsx` | Add `layoutChange` to `update_slide_editor` |

## Verification

1. `deno task typecheck` — must pass
2. Manual test: create a 2-block slide, ask AI to "put the text to the right of the chart" — should use `modify_slide_layout`
3. Manual test: ask AI to "add a text interpretation to this slide" — should add a block with layout
4. Verify `get_slide` returns structured layout info with spans and block positions
5. Manual test: manually edit a slide layout via context menu to create a "cols of rows" tree, then call `get_slide` — should get `structure: null` with text fallback, not a crash
