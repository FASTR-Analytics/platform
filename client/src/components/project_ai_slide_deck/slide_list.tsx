import { t, type ProjectDetail, type Slide } from "lib";
import { Button, Loading, timActionButton, timActionDelete } from "panther";
import SortableVendor from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
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
};

export function SlideList(p: Props) {
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);

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

  function handleItemClick(index: number, slideId: string, event: MouseEvent) {
    // Ctrl/cmd is handled by SortableJS multiDrag - don't handle here
    if (event.ctrlKey || event.metaKey) {
      return;
    }

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
    } else {
      // Regular click - select only this item
      setSelectedIds(new Set([slideId]));
      p.setSelectedSlideIds([slideId]);
      setLastSelectedIndex(index);
    }
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
        setSelectedIds(new Set<string>());
        p.setSelectedSlideIds([]);
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
      // Optimistic: insert duplicated slides
      setSortableSlideItems(currentItems => {
        const newItems = [...currentItems];
        // Insert each duplicate after its original
        for (let i = slideIdsToDuplicate.length - 1; i >= 0; i--) {
          const originalId = slideIdsToDuplicate[i];
          const originalIndex = newItems.findIndex(item => item.id === originalId);
          if (originalIndex !== -1 && res.data.newSlideIds[i]) {
            newItems.splice(originalIndex + 1, 0, { id: res.data.newSlideIds[i] });
          }
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
      if (newSlideIds[i] !== oldSlideIds[i]) {
        const movedId = newSlideIds[i];
        movedIds.push(movedId);

        if (i === 0) {
          targetPosition = { toStart: true };
        } else {
          targetPosition = { after: newSlideIds[i - 1] };
        }
        break;
      }
    }

    if (movedIds.length === 0 || !targetPosition) return;

    await serverActions.moveSlides({
      projectId: p.projectDetail.id,
      deck_id: p.deckId,
      slideIds: movedIds,
      position: targetPosition,
    });
    // Don't trigger refetch - stay optimistic until next add/delete
    // SSE from AI moves will still update via effect
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
      } else if (items.length > 0) {
        afterSlideId = items[items.length - 1].id;
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
        afterSlideId,
        slide: newSlide,
      });

      if (res.success) {
        // Optimistic: insert new slide at correct position
        setSortableSlideItems(currentItems => {
          if (afterSlideId === null) {
            // No slides yet - add as first
            return [{ id: res.data.slideId }];
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
    <>
      <div class="flex items-center border-b border-base-300 ui-pad">
        <div class="flex-1 font-700 text-lg">Slides</div>
        <Button iconName="plus" size="sm" onClick={addSlide.click} state={addSlide.state()}>
          Add slide
        </Button>
      </div>
      <div
        class="h-0 flex-1 overflow-auto p-4"
        onClick={(e) => {
          // Clear selection when clicking outside slide cards
          const target = e.target as HTMLElement;
          const clickedOnSlide = target.closest('.slide-card-wrapper');
          if (!clickedOnSlide) {
            setSelectedIds(new Set<string>());
            p.setSelectedSlideIds([]);
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
            multiDragKey="META"
            avoidImplicitDeselect
            selectedClass="sortable-selected"
            animation={150}
            ghostClass="opacity-50"
            chosenClass="shadow-2xl"
            dragClass="cursor-grabbing"
            fallbackTolerance={3}
            onSelect={(evt: any) => {
              const itemId = evt.item.dataset.id;
              if (itemId && !selectedIds().has(itemId)) {
                const newSelected = new Set([...selectedIds(), itemId]);
                setSelectedIds(newSelected);
                p.setSelectedSlideIds(Array.from(newSelected));
              }
            }}
            onDeselect={(evt: any) => {
              const itemId = evt.item.dataset.id;
              if (itemId && selectedIds().has(itemId)) {
                const newSet = new Set(selectedIds());
                newSet.delete(itemId);
                setSelectedIds(newSet);
                p.setSelectedSlideIds(Array.from(newSet));
              }
            }}
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
                  onSelect={(e) => handleItemClick(index(), item.id, e)}
                  onDelete={() => handleDelete(item.id)}
                  onDuplicate={() => handleDuplicate(item.id)}
                />
              );
            }}
          </SortableVendor>
        </Show>
      </div>
    </>
  );
}
