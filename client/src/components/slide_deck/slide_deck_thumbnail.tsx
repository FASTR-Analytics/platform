import { getStartingConfigForSlideDeck, getTextRenderingOptions, type SlideDeckConfig } from "lib";
import { createSignal, createEffect, Show } from "solid-js";
import { convertSlideToPageInputs } from "./slide_rendering/convert_slide_to_page_inputs";
import { PageHolder, StateHolder, type PageInputs, _GLOBAL_CANVAS_PIXEL_WIDTH } from "panther";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { serverActions } from "~/server_actions";
import { useProjectDirtyStates } from "../project_runner/mod";

const _defaultConfig = getStartingConfigForSlideDeck("");

type Props = {
  projectId: string;
  slideId: string;
  deckConfig?: SlideDeckConfig;
};

export function SlideDeckThumbnail(p: Props) {
  const pds = useProjectDirtyStates();

  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Loading...",
  });

  createEffect(async () => {
    pds.lastUpdated.slides[p.slideId];
    const config = p.deckConfig ?? _defaultConfig;

    const cached = await _SLIDE_CACHE.get({ projectId: p.projectId, slideId: p.slideId });

    if (!cached.data) {
      const promise = serverActions.getSlide({ projectId: p.projectId, slide_id: p.slideId });
      await _SLIDE_CACHE.setPromise(promise, { projectId: p.projectId, slideId: p.slideId }, cached.version);
      const res = await promise;
      if (res.success) {
        const renderRes = await convertSlideToPageInputs(p.projectId, res.data.slide, undefined, config);
        if (renderRes.success) {
          setPageInputs({ status: "ready", data: renderRes.data });
        } else {
          setPageInputs({ status: "error", err: renderRes.err });
        }
      } else {
        setPageInputs({ status: "error", err: res.err });
      }
    } else {
      const renderRes = await convertSlideToPageInputs(p.projectId, cached.data.slide, undefined, config);
      if (renderRes.success) {
        setPageInputs({ status: "ready", data: renderRes.data });
      } else {
        setPageInputs({ status: "error", err: renderRes.err });
      }
    }
  });

  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  return (
    <>
      <Show when={pageInputs().status === "loading"}>
        <div
          class="bg-base-200 flex items-center justify-center"
          style={{ "aspect-ratio": "16/9" }}
        >
          <div class="text-neutral text-xs">Loading...</div>
        </div>
      </Show>
      <Show when={pageInputs().status === "error"}>
        <PageHolder
          pageInputs={undefined}
          fixedCanvasH={canvasH}
          textRenderingOptions={getTextRenderingOptions()}
          simpleError
          externalError={(pageInputs() as { err: string }).err}
          scalePixelResolution={0.2}
        />
      </Show>
      <Show when={pageInputs().status === "ready"}>
        <PageHolder
          pageInputs={(pageInputs() as { data: PageInputs }).data}
          fixedCanvasH={canvasH}
          textRenderingOptions={getTextRenderingOptions()}
          simpleError
          scalePixelResolution={0.2}
        />
      </Show>
    </>
  );
}
