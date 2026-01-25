# Plan: Add Selection, Drag-and-Drop, and Context Menu to AI Slide Deck

## Archived Implementation Summary

From `_archived_project_ai_slide_deck/slide_deck_preview.tsx`:

**Selection state:**
```typescript
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);
```

**Slides with IDs (for SortableVendor):**
```typescript
const [slidesWithIds, setSlidesWithIds] = createStore<SlideWithId[]>(
  p.slides.map((slide, i) => ({ id: crypto.randomUUID(), slide }))
);
```

**Click handler supports:**
- Shift+click: range selection
- Ctrl/Cmd+click: toggle selection
- Single click: single selection

**SortableVendor config:**
```typescript
<SortableVendor
  idField="id"
  items={slidesWithIds}
  setItems={(newItems) => { ... }}
  multiDrag
  multiDragKey="META"
  selectedClass="sortable-selected"
  animation={150}
  ghostClass="opacity-50"
  chosenClass="shadow-2xl"
  dragClass="cursor-grabbing"
  fallbackTolerance={3}
  onSelect={(evt) => { /* add to selectedIds */ }}
  onDeselect={(evt) => { /* remove from selectedIds */ }}
>
```

**Context menu:**
```typescript
function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  const items: MenuItem[] = [
    { label: "Edit slide", icon: "pencil", onClick: () => p.onOpenEditor(p.index) },
    { type: "divider" },
    { label: "Delete slide", icon: "trash", intent: "danger", onClick: () => p.onDelete(p.index) },
  ];
  showMenu({ x: e.clientX, y: e.clientY, items });
}
```

**Selection visual:**
- Outer div: `classList={{ "sortable-selected": p.isSelected() }}`
- Inner border div: `classList={{ "border-primary ring-2 ring-primary/30": p.isSelected() }}`
- Checkmark badge when selected (absolute positioned top-right)

---

## Key Architecture Difference

| Aspect | Archived | New |
|--------|----------|-----|
| Data model | `slides: MixedSlide[]` passed as props | `slideIds: string[]` passed as props |
| Slide fetching | Parent owns all data | Each `SlideCard` fetches from cache/server |
| Reorder | Local `setSlidesWithIds` → `p.onReorder()` | Need to call `serverActions.moveSlides()` |
| ID management | Generate `crypto.randomUUID()` locally | Use actual `slideId` from server |

**Advantage of new architecture:**
- No need to generate local UUIDs - we already have stable `slideId` strings
- `slideIds` can directly be the items for SortableVendor

---

## Implementation Plan

### Phase 1: Selection

**Changes to `slide_list.tsx`:**

1. Add selection state:
```typescript
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);
```

2. Add click handler (copy from archived, adapt for slideIds):
```typescript
function handleItemClick(index: number, slideId: string, event: MouseEvent) {
  if (event.shiftKey && lastSelectedIndex() !== null) {
    // Range selection
    const newSelected = new Set(selectedIds());
    const start = Math.min(lastSelectedIndex()!, index);
    const end = Math.max(lastSelectedIndex()!, index);
    for (let i = start; i <= end; i++) {
      newSelected.add(p.slideIds[i]);
    }
    setSelectedIds(newSelected);
  } else if (event.ctrlKey || event.metaKey) {
    // Toggle
    const newSelected = new Set(selectedIds());
    if (newSelected.has(slideId)) {
      newSelected.delete(slideId);
    } else {
      newSelected.add(slideId);
    }
    setSelectedIds(newSelected);
    setLastSelectedIndex(index);
  } else {
    // Single select
    setSelectedIds(new Set([slideId]));
    setLastSelectedIndex(index);
  }
}
```

3. Pass to `SlideCard`:
   - `isSelected: boolean`
   - `onSelect: (event: MouseEvent) => void`

**Changes to `slide_card.tsx`:**

1. Add props:
```typescript
type Props = {
  // ... existing
  isSelected: boolean;
  onSelect: (event: MouseEvent) => void;
};
```

2. Add click handler and selection styling:
```typescript
<div
  class="cursor-pointer"
  classList={{ "sortable-selected": p.isSelected }}
  onClick={p.onSelect}
  style={{ width: `${slideSize}px` }}
>
  ...
  <div
    class="relative overflow-clip rounded-lg border-2 bg-white transition-all"
    classList={{
      "border-base-300": !p.isSelected,
      "border-primary ring-2 ring-primary/30": p.isSelected,
      "hover:border-primary": !p.isSelected,
    }}
  >
    <Show when={p.isSelected}>
      {/* Checkmark badge */}
    </Show>
    ...
  </div>
</div>
```

---

### Phase 2: Context Menu

**Changes to `slide_card.tsx`:**

1. Import `showMenu`, `MenuItem` from panther

2. Add props:
```typescript
type Props = {
  // ... existing
  onDelete: () => void;
};
```

3. Add context menu handler:
```typescript
function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  const items: MenuItem[] = [
    { type: "divider" },
    { label: "Delete slide", icon: "trash", intent: "danger", onClick: p.onDelete },
  ];
  showMenu({ x: e.clientX, y: e.clientY, items });
}
```

4. Add to inner div: `onContextMenu={handleContextMenu}`

**Changes to `slide_list.tsx`:**

1. Add delete handler:
```typescript
async function handleDeleteSlide(slideId: string) {
  await serverActions.deleteSlides({
    projectId: p.projectDetail.id,
    deck_id: p.deckId,
    slideIds: [slideId],
  });
  // SSE will update slideIds
}
```

2. Pass to `SlideCard`: `onDelete={() => handleDeleteSlide(slideId)}`

---

### Phase 3: Drag-and-Drop

**Changes to `slide_list.tsx`:**

1. Import `SortableVendor` from panther

2. Create items array for SortableVendor:
```typescript
// Simple wrapper since slideIds are already unique
const items = () => p.slideIds.map(id => ({ id }));
```

3. Replace `For` with `SortableVendor`:
```typescript
<SortableVendor
  idField="id"
  items={items()}
  setItems={(newItems) => handleReorder(newItems.map(i => i.id))}
  class="flex flex-wrap justify-center gap-4"
  multiDrag
  multiDragKey="META"
  selectedClass="sortable-selected"
  animation={150}
  ghostClass="opacity-50"
  chosenClass="shadow-2xl"
  dragClass="cursor-grabbing"
  fallbackTolerance={3}
  onSelect={(evt) => {
    const itemId = evt.item.dataset.id;
    if (itemId && !selectedIds().has(itemId)) {
      setSelectedIds(new Set([...selectedIds(), itemId]));
    }
  }}
  onDeselect={(evt) => {
    const itemId = evt.item.dataset.id;
    if (itemId && selectedIds().has(itemId)) {
      const newSet = new Set(selectedIds());
      newSet.delete(itemId);
      setSelectedIds(newSet);
    }
  }}
>
  {(item) => {
    const index = () => p.slideIds.indexOf(item.id);
    return (
      <SlideCard
        ...
        isSelected={selectedIds().has(item.id)}
        onSelect={(e) => handleItemClick(index(), item.id, e)}
      />
    );
  }}
</SortableVendor>
```

4. Add reorder handler that calls server:
```typescript
async function handleReorder(newSlideIds: string[]) {
  // Compare to find what moved and where
  // Call serverActions.moveSlides({ ... })
  // SSE will confirm the update
}
```

**Note:** The reorder handler needs to determine which slides moved and to what position. This is a bit complex since `moveSlides` takes `{ slideIds, position }` not a full reordered array. May need to calculate the diff.

---

## Questions Before Implementation

1. **Multi-select delete in context menu?**
   - Should right-clicking when multiple slides are selected show "Delete X slides"?
   - The archived version doesn't do this (each card has its own handler)

2. **Optimistic updates for reorder?**
   - Do we need local optimistic state, or is SSE fast enough?
   - Could simplify by just waiting for SSE

3. **Does `moveSlides` API support full reorder?**
   - Current API: `moveSlides({ slideIds, position: { after/before/toStart/toEnd } })`
   - May need multiple calls for complex reorders, or add a `reorderSlides` endpoint

---

## Files to Modify

| File | Changes |
|------|---------|
| `slide_list.tsx` | Selection state, SortableVendor wrapper, handlers |
| `slide_card.tsx` | Selection props/styling, context menu |

No new files needed.
