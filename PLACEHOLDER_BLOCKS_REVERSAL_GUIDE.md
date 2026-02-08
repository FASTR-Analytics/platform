# Placeholder Blocks - Reversal Guide

## Context

**Date removed:** 2026-02-07

**Why removed:** Simplified block type system. Placeholder blocks (`{ type: "placeholder" }`) were functionally equivalent to empty text blocks (`{ type: "text", markdown: "" }`) after rpd was changed to use full allocated bounds.

**Key difference eliminated:** With old rpd (content-sized), placeholder had maxH=Infinity while empty text had maxH=0. With new rpd (full allocated bounds), this distinction no longer mattered - both fill the allocated space equally.

---

## How to Reintroduce Placeholder Blocks

If you need flexible empty space with different growth behavior than empty text, follow these steps:

### 1. Add PlaceholderBlock Back to Type System

**File:** `lib/types/slides.ts`

Add PlaceholderBlock type and include in union:

```typescript
// Placeholder block - empty space for user to fill
export type PlaceholderBlock = {
  type: "placeholder";
};

export type ContentBlock = TextBlock | FigureBlock | PlaceholderBlock | ImageBlock;
```

### 2. Update Default Block Creation

**Files to change:**
- `client/src/components/slide_deck/slide_editor/index.tsx` (line ~413)
- `client/src/components/slide_deck/slide_list.tsx` (line ~328)
- `client/src/components/slide_deck/slide_editor/convert_slide_type.ts` (line ~54)
- `client/src/components/layout_editor/build_context_menu.ts` (createNewBlock callback)

```typescript
// Change from:
createNewBlock: () => createItemNode({ type: "text", markdown: "" })

// Back to:
createNewBlock: () => createItemNode({ type: "placeholder" })
```

### 3. Add Block Conversion Support

**File:** `client/src/components/slide_deck/utils/convert_block_type.ts`

Add placeholder case:

```typescript
case "placeholder":
  newBlock = { type: "placeholder" };
  break;
```

**File:** `client/src/components/layout_editor/build_context_menu.ts`

Add to conversion menu:

```typescript
if (blockType !== "placeholder" && callbacks.onConvertToPlaceholder) {
  conversionItems.push({
    label: "Placeholder",
    icon: "box",
    onClick: () => callbacks.onConvertToPlaceholder!(targetId),
  });
}
```

And add callback type:

```typescript
export type LayoutMenuCallbacks<T> = {
  // ...
  onConvertToPlaceholder?: (blockId: string) => void;
  // ...
};
```

### 4. Update Conversion to PageContentItem

**File:** `client/src/components/slide_deck/utils/convert_slide_to_page_inputs.ts`

```typescript
if (block.type === "placeholder") {
  return { spacer: true };
}
```

**File:** `client/src/components/slide_deck/utils/convert_ai_input_to_slide.ts`

```typescript
} else if (block.type === "placeholder") {
  pageItem = { spacer: true };
```

### 5. Update AI Utilities

**File:** `client/src/components/slide_deck/utils/extract_blocks_from_layout.ts`

```typescript
} else if (block.type === "placeholder") {
  return { id, summary: "Placeholder" };
```

### 6. Update Editor Panel

**File:** `client/src/components/slide_deck/slide_editor/editor_panel_content.tsx`

Add Match case:

```typescript
<Match when={getCurrentBlock()?.type === "placeholder"}>
  <div class="text-sm text-base-content/70">
    Placeholder block - empty space
  </div>
</Match>
```

### 7. Reports (Same Pattern)

**File:** `client/src/components/report/utils/convert_report_item_type.ts`

Add placeholder case (reports already have placeholder in `ReportItemContentItem`).

### 8. Migration (If Needed)

If there are existing slides with empty text that should be placeholders:

**Create adapter:** `client/src/components/slide_deck/utils/migrate_empty_text_to_placeholder.ts`

```typescript
export function migrateEmptyTextToPlaceholder(
  layout: LayoutNode<ContentBlock>
): LayoutNode<ContentBlock> {
  function walk(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
    if (node.type === "item") {
      if (node.data.type === "text" && node.data.markdown === "") {
        return { ...node, data: { type: "placeholder" } };
      }
      return node;
    }
    return { ...node, children: node.children.map(walk) };
  }
  return walk(layout);
}
```

---

## Files Modified When Removing (Reversal Checklist)

| File | Change Made | To Reverse |
|------|-------------|------------|
| `lib/types/slides.ts` | Removed PlaceholderBlock from union | Add back to union |
| `client/src/components/slide_deck/slide_editor/index.tsx` | Changed default to empty text | Change back to placeholder |
| `client/src/components/slide_deck/slide_list.tsx` | Changed default to empty text | Change back to placeholder |
| `client/src/components/slide_deck/slide_editor/convert_slide_type.ts` | Changed default to empty text | Change back to placeholder |
| `client/src/components/layout_editor/build_context_menu.ts` | Removed placeholder conversion | Add back conversion callback |
| `client/src/components/slide_deck/utils/convert_block_type.ts` | Removed placeholder case | Add back case |
| `client/src/components/slide_deck/utils/convert_slide_to_page_inputs.ts` | Removed placeholder case | Add back spacer conversion |
| `client/src/components/slide_deck/utils/convert_ai_input_to_slide.ts` | Removed placeholder case | Add back spacer conversion |
| `client/src/components/slide_deck/utils/extract_blocks_from_layout.ts` | Removed placeholder case | Add back summary |
| `client/src/components/slide_deck/slide_editor/editor_panel_content.tsx` | Removed placeholder Match | Add back UI |

---

## Why This Might Not Be Needed

After rpd change (rpd = full allocated bounds):
- Both empty text and placeholder render the same (nothing)
- Both have the same hit area (full allocated space)
- Both shrink/grow the same way in the new system

The only difference is semantic: "placeholder" vs "empty text". If empty text works fine, reversal may not be necessary.

---

## Testing After Reversal

1. Create new slide - should have placeholder by default
2. Split block - new block should be placeholder
3. Convert text → placeholder - should work
4. Verify placeholder renders as empty space
5. Verify placeholder has full-area hit detection
