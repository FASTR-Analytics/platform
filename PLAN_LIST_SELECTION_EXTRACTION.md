# Plan: Extract Reusable List Selection Patterns

## Problem Statement

Three list components in wb-fastr duplicate nearly identical selection logic:

| Component | Location | Lines | Has Selection |
|-----------|----------|-------|---------------|
| `ProjectDecks` | `project/project_decks.tsx` | 609 | Yes |
| `VisualizationGrid` | `PresentationObjectPanelDisplay.tsx` | 1106 | Yes |
| `ProjectDashboards` | `dashboards/index.tsx` | 159 | **No** |

**Out of scope**: `SlideList` (slides within a deck) has SortableJS multi-drag integration that syncs selection state with the DOM. The hook would need different handling there. If needed later, could add a `syncWithExternalSelection` option or similar.

The selection logic alone accounts for ~100 lines per component, and it's copy-pasted with only variable name changes. Additionally, the "selection circle" UI (the checkmark that appears on hover) is duplicated in each card component (~20 lines each).

### Duplicated Code Analysis

**Selection state setup** (identical in decks and visualizations):
```ts
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);

function clearSelection() {
  setSelectedIds(new Set<string>());
  setLastSelectedIndex(null);
}
```

**Click handler** (~80 lines, identical structure):
- Circle click with cmd/ctrl → toggle in multi-select
- Circle click with shift → range selection
- Circle click alone → select only this / deselect if selected
- Card click with cmd/ctrl → toggle
- Card click with shift → range selection
- Card click alone → clear selection and perform action

**Batch operation pattern** (repeated 5-8 times per component):
```ts
const selected = selectedIds();
const isItemSelected = selected.has(item.id);
const shouldBatchOp = isItemSelected && selected.size > 1;
const ids = shouldBatchOp ? Array.from(selected) : [item.id];
```

**Selection circle UI** (identical JSX):
```tsx
<div
  class="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full opacity-0 group-hover:opacity-100"
  classList={{
    "bg-primary text-primary-content opacity-100": isSelected,
    "border border-base-300 bg-transparent hover:bg-base-300 hover:text-white [&:not(:hover)]:text-transparent": !isSelected,
  }}
  onClick={(e) => onCardClick(e, true)}
>
  <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
  </svg>
</div>
```

## Justification

1. **DRY Principle**: ~300 lines of duplicated logic across components
2. **Bug Risk**: Selection behavior fixes must be applied in 3 places
3. **Feature Parity**: Dashboards currently lack multi-select; extracting makes it trivial to add
4. **Consistency**: Extracted hook ensures identical keyboard/mouse behavior across all lists
5. **Panther Reusability**: Selection pattern is generic enough for any SolidJS project using panther

## Extraction Plan

### Phase 1: Extract to Panther (Generic Primitives)

These are framework-level utilities with no wb-fastr dependencies.

Both files live in one new directory in the **panther source repo**: `timroberton-panther/modules/_303_components/list_selection/`. This matches panther's organize-by-category convention (`form_inputs/`, `layout/`, `special_state/`, etc.) rather than splitting by file type (`hooks/`, `selection/`).

After implementation, sync panther to wb-fastr.

#### 1.1 `createListSelection` Hook

**Location**: `timroberton-panther/modules/_303_components/list_selection/create_list_selection.ts`

**Interface**:
```ts
type ListSelectionOptions<TId extends string> = {
  onSelectionChange?: (selectedIds: TId[]) => void;
};

type ListSelectionReturn<TId extends string> = {
  // State accessors
  selectedIds: Accessor<Set<TId>>;
  isSelected: (id: TId) => boolean;
  selectedCount: Accessor<number>;
  
  // Actions
  clearSelection: () => void;
  selectOnly: (id: TId) => void;
  selectAll: (ids: TId[]) => void;
  toggleSelection: (id: TId) => void;
  
  // Item list management (for range selection)
  setItems: (ids: TId[]) => void;
  
  // Batch operation helper
  getBatchIds: (clickedId: TId) => TId[];
  
  // Event handlers (call from card / circle onClick)
  handleCircleClick: (index: number, id: TId, event: MouseEvent) => void;
  handleCardClick: (
    index: number,
    id: TId,
    event: MouseEvent,
    onOpen: () => void,
  ) => void;
};

function createListSelection<TId extends string>(
  options?: ListSelectionOptions<TId>
): ListSelectionReturn<TId>;
```

**Implementation notes**:
- Split into two handlers (vs one with an `isCircleClick` flag) because the no-modifier branch differs meaningfully: circle click selects-only/deselects, card click clears selection and calls `onOpen`. Splitting removes a boolean arg and makes call sites self-documenting.
- `handleCircleClick` calls `event.stopPropagation()` internally (it must, to prevent the click bubbling to the card). Card handler does not.
- `setItems` provides the ordered list of item IDs for range selection. Caller passes items in visual/display order (handles grouped views).
- `getBatchIds(clickedId)` returns all selected IDs if clickedId is selected and count > 1, otherwise returns `[clickedId]`. Eliminates repeated batch logic.
- `onSelectionChange` fires on any selection change (for AI notification, analytics, etc.).

**Edge case handling**:
- **Range selection before `setItems` called**: Falls back to single-select (just selects the clicked item). Logs `console.warn` in dev mode to help catch missing `setItems` calls.
- **Stale selection pruning**: When `setItems` is called, any `selectedIds` not present in the new items array are automatically removed. This handles search/filter changes gracefully - if a selected item is filtered out, it's deselected.
- **Index param kept**: Although the hook could look up index from id internally (since it has the items array), keeping `index` as a param avoids an extra lookup on every click and matches the caller's existing knowledge (they already have the index from the render loop).

#### 1.2 `SelectionCircle` Component

**Location**: `timroberton-panther/modules/_303_components/list_selection/selection_circle.tsx`

**Interface**:
```ts
type SelectionCircleProps = {
  isSelected: boolean;
  onClick: (e: MouseEvent) => void;
};

function SelectionCircle(props: SelectionCircleProps): JSX.Element;
```

**Behavior**:
- Positioned top-right (hardcoded, no props - all current uses are top-right)
- Hidden by default, visible on parent hover (requires `group` class on parent)
- Always visible when selected
- Checkmark icon when selected
- Forwards the event unchanged to `onClick` — the hook's `handleCircleClick` owns `stopPropagation`, so the component stays event-policy-free (matches the rest of panther's components, which leave event control to the consumer).

**Note**: Position/size props intentionally omitted (YAGNI). Add later if needed.

---

### Phase 2: Refactor Existing Components

**No wb-fastr wrapper needed.** Selection state is T5 (component-local, dies on unmount). Per state management rules, T5 has no state files - it lives directly in components. The AI notification is just one line of config passed to `createListSelection`.

#### 2.1 Refactor `VisualizationGrid`

**Before** (lines 465-614, ~150 lines):
```ts
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);

// 40+ lines to compute visual index map for grouped views
const getVisualIndexMap = (): Map<string, number> => { ... };

// 80+ lines of click handling with shift/cmd logic
function handleVisualizationClick(...) { ... }
```

**After** (~15 lines):
```ts
const { notifyAI } = useAIProjectContext();

const selection = createListSelection<string>({
  onSelectionChange: (ids) => notifyAI({ type: "selected_visualizations", vizIds: ids }),
});

// Update item order when list changes (handles grouped views)
// NOTE: getOrderedVisualizationIds is a new local helper - same logic as
// existing getVisualIndexMap but returns string[] instead of Map<string, number>
createEffect(() => {
  const orderedIds = getOrderedVisualizationIds(p.visualizations, subGroupConfig());
  selection.setItems(orderedIds);
});

// In card:
<div
  class="group ..."
  onClick={(e) => selection.handleCardClick(index, po.id, e, () => p.onClick(po))}
>
  <SelectionCircle
    isSelected={selection.isSelected(po.id)}
    onClick={(e) => selection.handleCircleClick(index, po.id, e)}
  />
  {/* card body */}
</div>
```

**Batch operations**:
```ts
// Before (repeated 5-8 times)
const selected = selectedIds();
const isItemSelected = selected.has(po.id);
const shouldDeleteMultiple = isItemSelected && selected.size > 1;
const idsToDelete = shouldDeleteMultiple ? Array.from(selected) : [po.id];

// After
const idsToDelete = selection.getBatchIds(po.id);
```

**Batch labels** (callers write the ternary directly):
```ts
const label = idsToDelete.length > 1
  ? t3({ en: `Delete ${idsToDelete.length} visualizations`, fr: `Supprimer ${idsToDelete.length} visualisations` })
  : t3(TC.delete);
```

#### 2.2 Refactor `ProjectDecks`

Same pattern as visualizations. Estimated reduction: ~150 lines → ~20 lines.

#### 2.3 Add Selection to `ProjectDashboards`

Currently 159 lines with no selection. After adding selection with the extracted hooks: ~180 lines (only +20 lines for full multi-select support).

Context menu: **delete only** (no folders, no duplicate for now).

---

## Implementation Order

1. **Create panther primitives** (no existing code changes)
   - `create_list_selection.ts` (includes `getBatchIds` as a method)
   - `selection_circle.tsx`
   - `mod.ts` for exports
   - Update `timroberton-panther/modules/_303_components/mod.ts` to export from `list_selection/mod.ts`

2. **Refactor VisualizationGrid** (most complex, validates the API)
   - Test shift+click range selection with grouped views
   - Test AI notification

3. **Refactor ProjectDecks**
   - Simpler than visualizations (no sub-grouping)

4. **Add selection to ProjectDashboards**
   - Add multi-select
   - Add context menu with batch delete

---

## Testing Checklist

For each refactored component:

- [ ] Single click opens editor
- [ ] Cmd/Ctrl + click toggles selection
- [ ] Shift + click selects range
- [ ] Circle click selects only that item
- [ ] Cmd/Ctrl + circle click toggles in multi-select
- [ ] Shift + circle click extends range
- [ ] Click outside clears selection
- [ ] Context menu shows batch labels when multiple selected
- [ ] Batch delete works
- [ ] Batch move-to-folder works (where applicable)
- [ ] AI notification fires on selection change

---

## Estimated Effort

| Task | Time |
|------|------|
| Phase 1: Panther primitives | 1.5-2 hours |
| Phase 2.1: Refactor VisualizationGrid | 1-2 hours |
| Phase 2.2: Refactor ProjectDecks | 1 hour |
| Phase 2.3: Add to ProjectDashboards | 1 hour |
| Testing | 1 hour |
| **Total** | **5-7 hours** |

---

## Future Considerations

- **Keyboard navigation**: Could add arrow key navigation to `createListSelection` (select next/prev)
- **Select all**: Cmd+A to select all visible items
- **Drag selection**: Marquee/lasso selection (complex, probably not needed)
- **Persistence**: Remember selection across navigation (probably not wanted)

---

## Files to Modify

### New Files (panther source repo)

- `timroberton-panther/modules/_303_components/list_selection/create_list_selection.ts`
- `timroberton-panther/modules/_303_components/list_selection/selection_circle.tsx`
- `timroberton-panther/modules/_303_components/list_selection/mod.ts`

### Modified Files (panther source repo)

- `timroberton-panther/modules/_303_components/mod.ts` (add export for `list_selection/mod.ts`)

### Modified Files (wb-fastr, after panther sync)

- `client/src/components/PresentationObjectPanelDisplay.tsx`
- `client/src/components/project/project_decks.tsx`
- `client/src/components/dashboards/index.tsx`
