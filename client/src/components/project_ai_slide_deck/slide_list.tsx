import { t, type ProjectDetail, type Slide } from "lib";
import { Button, FrameTop, Loading, Slider, timActionButton, timActionDelete } from "panther";
import SortableVendor, { SortableJs } from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
import { createEffect, createSignal, on, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { useOptimisticSetLastUpdated } from "../project_runner/mod";
import { SlideCard } from "./slide_card";

type Props = {
  projectDetail: ProjectDetail;
  deckId: string;
  slideIds: string[];
  isLoading: boolean;
  setSelectedSlideIds: (ids: string[]) => void;
  onEditSlide: (slideId: string) => Promise<void>;
};

export function SlideList(p: Props) {
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);
  const [slideSize, setSlideSize] = createSignal(400);
  const [isFillWidth, setIsFillWidth] = createSignal(false);

  function clearSelection() {
    setSelectedIds(new Set<string>());
    setLastSelectedIndex(null);
    p.setSelectedSlideIds([]);
    document.querySelectorAll('.sortable-selected').forEach(el => {
      SortableJs.utils.deselect(el);
    });
  }

  // Local copy of slide order for optimistic drag-and-drop updates
  const [sortableSlideItems, setSortableSlideItems] = createSignal<{ id: string }[]>(
    p.slideIds.map(id => ({ id }))
  );

  // Sync local state when props change (from SSE or parent updates)
  createEffect(on(
    () => p.slideIds,
    (slideIds) => {
      const currentItems = sortableSlideItems();
      const currentIds = new Set(currentItems.map(i => i.id));
      const newIds = new Set(slideIds);

      // Sync if items were added/removed (set of IDs changed)
      const setChanged = currentIds.size !== newIds.size ||
        !slideIds.every(id => currentIds.has(id));

      // Sync if order changed (from AI or other external sources)
      // PDS timestamp checking ensures we only see latest state
      const orderChanged = !currentItems.every((item, i) => item.id === slideIds[i]);

      if (setChanged || orderChanged) {
        setSortableSlideItems(slideIds.map(id => ({ id })));
      }
    }
  ));

  function handleSlideClick(index: number, slideId: string, event: MouseEvent, isCircleClick: boolean) {
    if (isCircleClick) {
      event.stopPropagation();

      // Cmd/Ctrl + circle click: toggle this item in multi-select
      if (event.metaKey || event.ctrlKey) {
        const newSelected = new Set(selectedIds());
        if (newSelected.has(slideId)) {
          newSelected.delete(slideId);
        } else {
          newSelected.add(slideId);
        }
        setSelectedIds(newSelected);
        p.setSelectedSlideIds(Array.from(newSelected));
        setLastSelectedIndex(index);
        syncSelectionWithSortableJS(newSelected);
        return;
      }

      // Shift + circle click: range selection
      if (event.shiftKey && lastSelectedIndex() !== null) {
        event.preventDefault();
        const newSelected = new Set(selectedIds());
        const start = Math.min(lastSelectedIndex()!, index);
        const end = Math.max(lastSelectedIndex()!, index);
        const items = sortableSlideItems();
        for (let i = start; i <= end; i++) {
          newSelected.add(items[i].id);
        }
        setSelectedIds(newSelected);
        p.setSelectedSlideIds(Array.from(newSelected));
        syncSelectionWithSortableJS(newSelected);
        return;
      }

      // Regular circle click: toggle selection (deselect if already selected, otherwise select only this)
      const currentlySelected = selectedIds();
      let newSelected: Set<string>;
      if (currentlySelected.has(slideId)) {
        newSelected = new Set(currentlySelected);
        newSelected.delete(slideId);
      } else {
        newSelected = new Set([slideId]);
      }
      setSelectedIds(newSelected);
      p.setSelectedSlideIds(Array.from(newSelected));
      setLastSelectedIndex(index);
      syncSelectionWithSortableJS(newSelected);
      return;
    }

    // Cmd/Meta + click on card body toggles
    if (event.metaKey || event.ctrlKey) {
      const newSelected = new Set(selectedIds());
      if (newSelected.has(slideId)) {
        newSelected.delete(slideId);
      } else {
        newSelected.add(slideId);
      }
      setSelectedIds(newSelected);
      p.setSelectedSlideIds(Array.from(newSelected));
      setLastSelectedIndex(index);
      syncSelectionWithSortableJS(newSelected);
      return;
    }

    // Shift + click on card body does range selection
    if (event.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault();
      const newSelected = new Set(selectedIds());
      const start = Math.min(lastSelectedIndex()!, index);
      const end = Math.max(lastSelectedIndex()!, index);
      const items = sortableSlideItems();
      for (let i = start; i <= end; i++) {
        newSelected.add(items[i].id);
      }
      setSelectedIds(newSelected);
      p.setSelectedSlideIds(Array.from(newSelected));
      syncSelectionWithSortableJS(newSelected);
      return;
    }

    // Regular click - edit slide behavior
    clearSelection();
    p.onEditSlide(slideId);
  }

  function syncSelectionWithSortableJS(selectedSet: Set<string>) {
    // Sync our selection state with SortableJS by manipulating the DOM
    document.querySelectorAll('.slide-card-wrapper').forEach(el => {
      const parent = el.parentElement;
      if (!parent) return;

      const slideId = parent.dataset.id;
      if (!slideId) return;

      if (selectedSet.has(slideId)) {
        if (!parent.classList.contains('sortable-selected')) {
          parent.classList.add('sortable-selected');
        }
      } else {
        if (parent.classList.contains('sortable-selected')) {
          parent.classList.remove('sortable-selected');
        }
      }
    });
  }

  async function handleDelete(slideId: string) {
    const selected = selectedIds();
    const isSlideSelected = selected.has(slideId);
    const shouldDeleteMultiple = isSlideSelected && selected.size > 1;

    const slideIdsToDelete = shouldDeleteMultiple ? Array.from(selected) : [slideId];
    const confirmText = slideIdsToDelete.length > 1
      ? t(`Are you sure you want to delete ${slideIdsToDelete.length} slides?`)
      : t("Are you sure you want to delete this slide?");

    const deleteAction = timActionDelete(
      confirmText,
      () => serverActions.deleteSlides({
        projectId: p.projectDetail.id,
        deck_id: p.deckId,
        slideIds: slideIdsToDelete,
      }),
      (data) => {
        // Optimistic: remove from local state immediately
        setSortableSlideItems(items => items.filter(i => !slideIdsToDelete.includes(i.id)));
        clearSelection();
        // Trigger SSE refetch which will sync the real state
        optimisticSetLastUpdated("slide_decks", p.deckId, data.lastUpdated);
      },
    );
    await deleteAction.click();
  }

  async function handleDuplicate(slideId: string) {
    const selected = selectedIds();
    const isSlideSelected = selected.has(slideId);
    const shouldDuplicateMultiple = isSlideSelected && selected.size > 1;

    const slideIdsToDuplicate = shouldDuplicateMultiple ? Array.from(selected) : [slideId];

    const res = await serverActions.duplicateSlides({
      projectId: p.projectDetail.id,
      deck_id: p.deckId,
      slideIds: slideIdsToDuplicate,
    });

    if (res.success) {
      // Optimistic: insert all duplicates after the last original
      setSortableSlideItems(currentItems => {
        const newItems = [...currentItems];
        // Find the last original's index
        let lastOriginalIndex = -1;
        for (const originalId of slideIdsToDuplicate) {
          const idx = newItems.findIndex(item => item.id === originalId);
          if (idx > lastOriginalIndex) {
            lastOriginalIndex = idx;
          }
        }
        // Insert all duplicates after the last original
        if (lastOriginalIndex !== -1) {
          const newSlideItems = res.data.newSlideIds.map(id => ({ id }));
          newItems.splice(lastOriginalIndex + 1, 0, ...newSlideItems);
        }
        return newItems;
      });

      // Trigger SSE refetch
      for (const slideId of res.data.newSlideIds) {
        optimisticSetLastUpdated("slides", slideId, res.data.lastUpdated);
      }
      optimisticSetLastUpdated("slide_decks", p.deckId, res.data.lastUpdated);
    }
  }

  async function handleReorder(oldSlideIds: string[], newSlideIds: string[]) {
    if (newSlideIds.length !== oldSlideIds.length) return;
    if (newSlideIds.every((id, i) => id === oldSlideIds[i])) return;

    const movedIds: string[] = [];
    let targetPosition: { after: string } | { before: string } | { toStart: true } | { toEnd: true } | null = null;

    for (let i = 0; i < newSlideIds.length; i++) {
      const slideAtNewPos = newSlideIds[i];
      const slideAtOldPos = oldSlideIds[i];

      if (slideAtNewPos !== slideAtOldPos) {
        const oldIndex = oldSlideIds.indexOf(slideAtNewPos);
        if (oldIndex !== i) {
          let j = i;
          while (j < newSlideIds.length && oldSlideIds.indexOf(newSlideIds[j]) !== j) {
            movedIds.push(newSlideIds[j]);
            j++;
          }

          if (i === 0) {
            targetPosition = { toStart: true };
          } else {
            targetPosition = { after: newSlideIds[i - 1] };
          }
          break;
        }
      }
    }

    if (movedIds.length === 0 || !targetPosition) return;

    await serverActions.moveSlides({
      projectId: p.projectDetail.id,
      deck_id: p.deckId,
      slideIds: movedIds,
      position: targetPosition,
    });
  }

  const addSlide = timActionButton(
    async () => {
      const items = sortableSlideItems();
      const selected = selectedIds();

      // Insert after last selected slide, or at end if none selected
      let afterSlideId: string | null = null;

      if (selected.size > 0) {
        let maxIndex = -1;
        for (const id of selected) {
          const idx = items.findIndex(i => i.id === id);
          if (idx > maxIndex) {
            maxIndex = idx;
            afterSlideId = id;
          }
        }
      }

      const newSlide: Slide = {
        type: "content",
        heading: "New slide",
        layout: {
          type: "item",
          id: "a1a",
          data: { type: "placeholder" },
        },
      };

      const res = await serverActions.createSlide({
        projectId: p.projectDetail.id,
        deck_id: p.deckId,
        position: afterSlideId ? { after: afterSlideId } : { toEnd: true },
        slide: newSlide,
      });

      if (res.success) {
        // Optimistic: insert new slide at correct position
        setSortableSlideItems(currentItems => {
          if (afterSlideId === null) {
            // toEnd - add at end
            return [...currentItems, { id: res.data.slideId }];
          }

          // Find where to insert based on afterSlideId
          const afterIndex = currentItems.findIndex(i => i.id === afterSlideId);
          if (afterIndex === -1) {
            // afterSlideId not found - add at end
            return [...currentItems, { id: res.data.slideId }];
          }

          // Insert after the found position
          const newItems = [...currentItems];
          newItems.splice(afterIndex + 1, 0, { id: res.data.slideId });
          return newItems;
        });
      }

      return res;
    },
    (data) => {
      // Trigger SSE refetch which will sync the real state
      optimisticSetLastUpdated("slides", data.slideId, data.lastUpdated);
      optimisticSetLastUpdated("slide_decks", p.deckId, data.lastUpdated);
    }
  );

  return (
    <FrameTop panelChildren={<div class="flex items-center border-b border-base-300 ui-pad">
      <div class="flex-1 font-700 text-lg">Slides</div>
      <div class="flex items-center gap-4">
        <div class="w-32">
          <Slider
            value={slideSize()}
            onChange={setSlideSize}
            min={200}
            max={800}
            step={50}
            fullWidth
            disabled={isFillWidth()}
          />
        </div>
        <Button
          iconName={isFillWidth() ? "minimize" : "maximize"}
          size="sm"
          outline
          onClick={() => setIsFillWidth(!isFillWidth())}
        />
        <Button iconName="plus" size="sm" onClick={addSlide.click} state={addSlide.state()}>
          Add slide
        </Button>
      </div>
    </div>}>

      <div
        class="h-full w-full overflow-auto p-4"
        onClick={(e) => {
          // Clear selection when clicking outside slide cards
          const target = e.target as HTMLElement;
          const clickedOnSlide = target.closest('.slide-card-wrapper');
          if (!clickedOnSlide) {
            clearSelection();
          }
        }}
      >
        <Show when={p.isLoading}>
          <Loading msg="Loading slides..." />
        </Show>
        <Show when={!p.isLoading && p.slideIds.length === 0}>
          <div class="text-neutral w-full py-16 text-center">
            No slides yet. Ask the AI to create some slides.
          </div>
        </Show>
        <Show when={!p.isLoading && p.slideIds.length > 0}>
          <SortableVendor
            idField="id"
            items={sortableSlideItems()}
            setItems={(newItems: { id: string }[]) => {
              const oldItems = sortableSlideItems();
              setSortableSlideItems(newItems);
              handleReorder(oldItems.map(i => i.id), newItems.map(i => i.id));
            }}
            class="flex flex-wrap justify-center gap-4"
            multiDrag
            avoidImplicitDeselect
            selectedClass="sortable-selected"
            animation={150}
            ghostClass="opacity-50"
            chosenClass="shadow-2xl"
            dragClass="cursor-grabbing"
            fallbackTolerance={3}
          >
            {(item: { id: string }) => {
              const index = () => sortableSlideItems().findIndex(i => i.id === item.id);
              return (
                <SlideCard
                  projectId={p.projectDetail.id}
                  deckId={p.deckId}
                  slideId={item.id}
                  index={index()}
                  isSelected={selectedIds().has(item.id)}
                  selectedCount={selectedIds().size}
                  slideSize={slideSize()}
                  fillWidth={isFillWidth()}
                  onCardClick={(e, isCircleClick) => handleSlideClick(index(), item.id, e, isCircleClick)}
                  onEdit={() => {
                    clearSelection();
                    p.onEditSlide(item.id);
                  }}
                  onDelete={() => handleDelete(item.id)}
                  onDuplicate={() => handleDuplicate(item.id)}
                />
              );
            }}
          </SortableVendor>
        </Show>
      </div>
    </FrameTop>
  );
}
