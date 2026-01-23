import { SimpleSlide, MixedSlide, ProjectDetail, getStartingConfigForReport, getTextRenderingOptions } from "lib";
import type { AlertComponentProps, OpenEditorProps, PageInputs } from "panther";
import {
  Button,
  Loading,
  MenuItem,
  openComponent,
  PageHolder,
  showMenu,
  StateHolder,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
} from "panther";
import SortableVendor from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { createStore } from "solid-js/store";
import { convertSlideToPageInputs } from "./transform_v2";
import { SlideEditor, type SlideEditorInnerProps } from "./slide_editor";

type SlideWithId = {
  id: string;
  slide: MixedSlide;
};

type Props = {
  projectDetail: ProjectDetail;
  reportId: string;
  slides: MixedSlide[];
  deckLabel: string;
  slideSize?: number;
  onReorder?: (reorderedSlides: MixedSlide[]) => void;
  openEditor: <TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) => Promise<TReturn | undefined>;
  onSlideUpdate: (index: number, slide: MixedSlide) => Promise<void>;
  onSelectionChange?: (selectedIndices: number[]) => void;
};

export function SlideDeckPreview(p: Props) {
  console.log("Rendering 2", "props:", { projectId: p.projectDetail.id, slidesLength: p.slides.length, slideSize: p.slideSize })

  onCleanup(() => {
    console.log("SlideDeckPreview CLEANUP - component unmounting");
  });

  const slideSize = () => p.slideSize ?? 400;

  const [slidesWithIds, setSlidesWithIds] = createStore<SlideWithId[]>(
    p.slides.map((slide, i) => ({ id: crypto.randomUUID(), slide }))
  );

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(null);

  // Get selected indices
  const getSelectedIndices = (): number[] => {
    const indices: number[] = [];
    selectedIds().forEach(id => {
      const index = slidesWithIds.findIndex(s => s.id === id);
      if (index !== -1) indices.push(index);
    });
    return indices.sort((a, b) => a - b);
  };

  // Notify parent of selection changes
  createEffect(() => {
    selectedIds(); // Track this signal
    const indices = getSelectedIndices();
    console.log("Selection changed in preview, indices:", indices);
    p.onSelectionChange?.(indices);
  });

  // Open editor for specific slide
  async function openEditorForSlide(index: number) {
    const result = await p.openEditor({
      element: SlideEditor,
      props: {
        projectDetail: p.projectDetail,
        reportId: p.reportId,
        slide: p.slides[index],
        slideIndex: index,
        totalSlides: p.slides.length,
      },
    });
    if (result !== undefined) {
      // User saved - update slide
      await p.onSlideUpdate(index, result);
    }
  }

  createEffect(
    on(
      () => p.slides,
      (newSlides, prevSlides) => {
        // Preserve IDs when only content changes, not array structure
        const newSlidesWithIds = newSlides.map((slide, i) => {
          const existingItem = slidesWithIds[i];
          // Keep existing ID if slide exists at same position
          if (existingItem) {
            return { id: existingItem.id, slide };
          }
          // New slide added - generate stable ID
          return { id: crypto.randomUUID(), slide };
        });
        setSlidesWithIds(newSlidesWithIds);
      }
    )
  );

  function handleItemClick(index: number, event: MouseEvent) {
    const itemId = slidesWithIds[index].id;
    console.log("handleItemClick", index, "itemId:", itemId, "ctrl/meta:", event.ctrlKey || event.metaKey);

    if (event.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault();
      const newSelected = new Set(selectedIds());
      const start = Math.min(lastSelectedIndex()!, index);
      const end = Math.max(lastSelectedIndex()!, index);
      for (let i = start; i <= end; i++) {
        newSelected.add(slidesWithIds[i].id);
      }
      setSelectedIds(newSelected);
      console.log("After shift-click, selected IDs:", newSelected);
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      const newSelected = new Set(selectedIds());
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId);
      } else {
        newSelected.add(itemId);
      }
      setSelectedIds(newSelected);
      setLastSelectedIndex(index);
      console.log("After ctrl-click, selected IDs:", newSelected);
    } else {
      // Single click - select only this item
      setSelectedIds(new Set([itemId]));
      setLastSelectedIndex(index);
      console.log("After single click, selected IDs:", new Set([itemId]));
    }
  }

  return (
    <div class="h-full overflow-auto p-4">
      <Show when={p.slides.length === 0}>
        <div class="text-neutral w-full py-16 text-center">
          No slides yet. Ask the AI to create some slides.
        </div>
      </Show>
      <Show when={p.slides.length > 0}>
        <SortableVendor
          idField="id"
          items={slidesWithIds}
          setItems={(newItems: SlideWithId[]) => {
            setSlidesWithIds(newItems);
            const reordered = newItems.map((item: SlideWithId) => item.slide);
            p.onReorder?.(reordered);
          }}
          class="flex flex-wrap justify-center gap-4"
          multiDrag
          multiDragKey="META"
          selectedClass="sortable-selected"
          animation={150}
          ghostClass="opacity-50"
          chosenClass="shadow-2xl"
          dragClass="cursor-grabbing"
          fallbackTolerance={3}
          onSelect={(evt: any) => {
            const itemId = evt.item.dataset.id;
            if (itemId && !selectedIds().has(itemId)) {
              setSelectedIds(new Set([...selectedIds(), itemId]));
            }
          }}
          onDeselect={(evt: any) => {
            const itemId = evt.item.dataset.id;
            if (itemId && selectedIds().has(itemId)) {
              const newSet = new Set(selectedIds());
              newSet.delete(itemId);
              setSelectedIds(newSet);
            }
          }}
        >
          {(item: SlideWithId) => {
            const itemIndex = () => slidesWithIds.findIndex((s) => s.id === item.id);
            return (
              <SlidePreviewCard
                projectId={p.projectDetail.id}
                reportId={p.reportId}
                slide={item.slide}
                slideId={item.id}
                index={itemIndex()}
                totalSlides={slidesWithIds.length}
                deckLabel={p.deckLabel}
                slideSize={slideSize()}
                isSelected={() => selectedIds().has(item.id)}
                onItemClick={(index, event) => handleItemClick(index, event)}
                onOpenEditor={openEditorForSlide}
                onDelete={(index) => {
                  const newSlides = p.slides.filter((_, i) => i !== index);
                  p.onReorder?.(newSlides);
                }}
              />
            );
          }}
        </SortableVendor>
      </Show>
    </div>
  );
}

type SlidePreviewCardProps = {
  projectId: string;
  reportId: string;
  slide: MixedSlide;
  slideId: string;
  index: number;
  totalSlides: number;
  deckLabel: string;
  slideSize: number;
  isSelected: () => boolean;
  onItemClick: (index: number, event: MouseEvent) => void;
  onOpenEditor: (index: number) => Promise<void>;
  onDelete: (index: number) => void;
};

function SlidePreviewCard(p: SlidePreviewCardProps) {
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });

  async function renderSlide() {
    setPageInputs({ status: "loading", msg: "Rendering..." });

    try {
      // V2: Direct conversion to PageInputs (bypasses ReportItemConfig)
      const res = await convertSlideToPageInputs(p.projectId, p.slide, p.index);

      if (!res.success) {
        setPageInputs({ status: "error", err: res.err });
        return;
      }

      setPageInputs({ status: "ready", data: res.data });
    } catch (e) {
      setPageInputs({
        status: "error",
        err: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  createEffect(
    on(
      () => JSON.stringify(p.slide),
      () => {
        renderSlide();
      }
    )
  );

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const items: MenuItem[] = [
      {
        label: "Edit slide",
        icon: "pencil",
        onClick: () => p.onOpenEditor(p.index),
      },
      { type: "divider" },
      {
        label: "Delete slide",
        icon: "trash",
        intent: "danger",
        onClick: () => p.onDelete(p.index),
      },
    ];
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  return (
    <div
      class="cursor-pointer"
      classList={{
        "sortable-selected": p.isSelected(),
      }}
      onClick={(e) => p.onItemClick(p.index, e)}
      data-selected={p.isSelected()}
      style={{ width: `${p.slideSize}px` }}
    >
      <div class="mb-2 text-base-content text-center text-sm font-medium">
        {p.index + 1}
      </div>
      <div
        class="relative overflow-clip rounded-lg border-2 bg-white transition-all"
        classList={{
          "border-base-300": !p.isSelected(),
          "border-primary ring-2 ring-primary/30": p.isSelected(),
          "hover:border-primary": !p.isSelected(),
        }}
        onContextMenu={handleContextMenu}
      >
        <Show when={p.isSelected()}>
          <div class="bg-primary text-primary-content absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-lg">
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </Show>
        <Switch>
          <Match when={pageInputs().status === "loading"}>
            <div
              class="bg-base-200 flex items-center justify-center rounded"
              style={{ "aspect-ratio": "16/9" }}
            >
              <Loading msg="Rendering..." noPad />
            </div>
          </Match>
          <Match when={pageInputs().status === "error"}>
            <PageHolder
              pageInputs={undefined}
              fixedCanvasH={canvasH}
              textRenderingOptions={getTextRenderingOptions()}
              simpleError
              externalError={(pageInputs() as { err: string }).err}
              scalePixelResolution={0.6}
            />
          </Match>
          <Match
            when={
              pageInputs().status === "ready" &&
              (pageInputs() as { data: PageInputs }).data
            }
            keyed
          >
            {(data) => {
              // console.log("Page inputs", data);
              return (
                <PageHolder
                  pageInputs={data}
                  fixedCanvasH={canvasH}
                  textRenderingOptions={getTextRenderingOptions()}
                  simpleError
                  scalePixelResolution={0.6}
                />
              );
            }}
          </Match>
        </Switch>
      </div>
    </div>
  );
}

// Modal for expanded slide view
type ExpandedSlideModalProps = {
  pageInputs: StateHolder<PageInputs>;
  slideNumber: number;
  totalSlides: number;
};

function ExpandedSlideModal(p: AlertComponentProps<ExpandedSlideModalProps, void>) {
  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  return (
    <div class="ui-pad flex flex-col" style={{ "max-width": "90vw", "max-height": "90vh" }}>
      <div class="mb-4 flex items-center justify-between">
        <span class="text-lg font-medium">
          Slide {p.slideNumber} of {p.totalSlides}
        </span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div style={{ width: "min(80vw, 1200px)" }}>
          <Switch>
            <Match when={p.pageInputs.status === "loading"}>
              <div
                class="bg-base-200 flex items-center justify-center rounded"
                style={{ "aspect-ratio": "16/9" }}
              >
                <Loading msg="Rendering..." noPad />
              </div>
            </Match>
            <Match when={p.pageInputs.status === "error"}>
              <PageHolder
                pageInputs={undefined}
                fixedCanvasH={canvasH}
                textRenderingOptions={getTextRenderingOptions()}
                simpleError
                externalError={(p.pageInputs as { err: string }).err}
                scalePixelResolution={0.6}
              />
            </Match>
            <Match
              when={
                p.pageInputs.status === "ready" &&
                (p.pageInputs as { data: PageInputs }).data
              }
              keyed
            >
              {(data) => (
                <PageHolder
                  pageInputs={data}
                  fixedCanvasH={canvasH}
                  textRenderingOptions={getTextRenderingOptions()}
                  simpleError
                  scalePixelResolution={0.6}
                />
              )}
            </Match>
          </Switch>
        </div>
      </div>
      <div class="ui-pad-top flex shrink-0 justify-end">
        <Button onClick={() => p.close(undefined)}>Close</Button>
      </div>
    </div>
  );
}
