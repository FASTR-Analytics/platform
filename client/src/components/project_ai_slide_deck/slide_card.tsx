import { getTextRenderingOptions } from "lib";
import { createSignal, createEffect, Show } from "solid-js";
import { convertSlideToPageInputs } from "./utils/convert_slide_to_page_inputs";
import { PageHolder, StateHolder, type PageInputs, _GLOBAL_CANVAS_PIXEL_WIDTH, showMenu, type MenuItem } from "panther";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { serverActions } from "~/server_actions";
import { useProjectDirtyStates } from "../project_runner/mod";

type Props = {
  projectId: string;
  deckId: string;
  slideId: string;
  index: number;
  isSelected: boolean;
  selectedCount: number;
  slideSize: number;
  fillWidth: boolean;
  onSelect: (event: MouseEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function SlideCard(p: Props) {
  const pds = useProjectDirtyStates();

  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Loading...",
  });

  // Fetch slide from cache, reactive to PDS updates
  createEffect(async () => {
    pds.lastUpdated.slides[p.slideId]; // Track for reactivity

    const cached = await _SLIDE_CACHE.get({ projectId: p.projectId, slideId: p.slideId });

    if (!cached.data) {
      // Cache miss - fetch and cache
      const promise = serverActions.getSlide({ projectId: p.projectId, slide_id: p.slideId });
      await _SLIDE_CACHE.setPromise(promise, { projectId: p.projectId, slideId: p.slideId }, cached.version);
      const res = await promise;

      if (res.success) {
        const renderRes = await convertSlideToPageInputs(p.projectId, res.data.slide, p.index);
        if (renderRes.success) {
          setPageInputs({ status: "ready", data: renderRes.data });
        } else {
          setPageInputs({ status: "error", err: renderRes.err });
        }
      } else {
        setPageInputs({ status: "error", err: res.err });
      }
    } else {
      // Cache hit - render from cached data
      const renderRes = await convertSlideToPageInputs(p.projectId, cached.data.slide, p.index);
      if (renderRes.success) {
        setPageInputs({ status: "ready", data: renderRes.data });
      } else {
        setPageInputs({ status: "error", err: renderRes.err });
      }
    }
  });

  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();

    const deleteLabel = p.isSelected && p.selectedCount > 1
      ? `Delete ${p.selectedCount} slides`
      : "Delete slide";

    const duplicateLabel = p.isSelected && p.selectedCount > 1
      ? `Duplicate ${p.selectedCount} slides`
      : "Duplicate slide";

    const items: MenuItem[] = [
      {
        label: duplicateLabel,
        icon: "copy",
        onClick: p.onDuplicate,
      },
      {
        label: deleteLabel,
        icon: "trash",
        intent: "danger",
        onClick: p.onDelete,
      },
    ];
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  return (
    <div
      class="cursor-pointer"
      classList={{ "sortable-selected": p.isSelected }}
      onClick={p.onSelect}
      style={{ width: p.fillWidth ? "100%" : `${p.slideSize}px` }}
    >
      <div class="mb-2 text-base-content text-center text-sm font-medium">
        {p.index + 1}
      </div>
      <div
        class="slide-card-wrapper relative overflow-clip rounded-lg border-2 bg-white transition-all"
        classList={{
          "border-base-300": !p.isSelected,
          "border-primary ring-2 ring-primary/30": p.isSelected,
          "hover:border-primary": !p.isSelected,
        }}
        onContextMenu={handleContextMenu}
      >
        <Show when={p.isSelected}>
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
        <Show when={pageInputs().status === "loading"}>
          <div
            class="bg-base-200 flex items-center justify-center"
            style={{ "aspect-ratio": "16/9" }}
          >
            <div class="text-sm">Loading...</div>
          </div>
        </Show>
        <Show when={pageInputs().status === "error"}>
          <PageHolder
            pageInputs={undefined}
            fixedCanvasH={canvasH}
            textRenderingOptions={getTextRenderingOptions()}
            simpleError
            externalError={(pageInputs() as { err: string }).err}
            scalePixelResolution={0.6}
          />
        </Show>
        <Show when={pageInputs().status === "ready"}>
          <PageHolder
            pageInputs={(pageInputs() as { data: PageInputs }).data}
            fixedCanvasH={canvasH}
            textRenderingOptions={getTextRenderingOptions()}
            simpleError
            scalePixelResolution={0.6}
          />
        </Show>
      </div>
    </div>
  );
}
