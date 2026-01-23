import { getTextRenderingOptions } from "lib";
import { createSignal, onMount, Show } from "solid-js";
import { convertSlideToPageInputs } from "./utils/convert_slide_to_page_inputs";
import { PageHolder, StateHolder, type PageInputs, _GLOBAL_CANVAS_PIXEL_WIDTH } from "panther";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  deckId: string;
  slideId: string;
  index: number;
};

export function SlideCard(p: Props) {
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Loading...",
  });

  // Fetch slide from cache, render when loaded
  onMount(async () => {
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
  const slideSize = 400;

  return (
    <div class="cursor-pointer" style={{ width: `${slideSize}px` }}>
      <div class="mb-2 text-base-content text-center text-sm font-medium">
        {p.index + 1}
      </div>
      <div class="relative overflow-clip rounded-lg border-2 border-base-300 bg-white hover:border-primary">
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
