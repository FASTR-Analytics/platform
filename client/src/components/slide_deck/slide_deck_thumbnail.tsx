import { getStartingConfigForSlideDeck, t3 } from "lib";
import { trackDeep } from "@solid-primitives/deep";
import { createSignal, createEffect, Show } from "solid-js";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { PageHolder, StateHolder, type PageInputs, _GLOBAL_CANVAS_PIXEL_WIDTH } from "panther";
import { _SLIDE_CACHE } from "~/state/project/t2_slides";
import { serverActions } from "~/server_actions";
import { projectState } from "~/state/project/t1_store";

const _defaultConfig = getStartingConfigForSlideDeck("");

type Props = {
  projectId: string;
  deckId: string;
  slideId: string;
};

export function SlideDeckThumbnail(p: Props) {
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: t3({ en: "Loading...", fr: "Chargement..." }),
  });

  createEffect(async () => {
    projectState.lastUpdated.slide_decks[p.deckId];
    projectState.lastUpdated.slides[p.slideId];
    const deck = projectState.slideDecks.find((d) => d.id === p.deckId);
    const config = deck?.config ?? _defaultConfig;
    trackDeep(config);

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
          <div class="text-neutral text-xs">{t3({ en: "Loading...", fr: "Chargement..." })}</div>
        </div>
      </Show>
      <Show when={pageInputs().status === "error"}>
        <PageHolder
          pageInputs={undefined}
          fixedCanvasH={canvasH}
          simpleError
          externalError={(pageInputs() as { err: string }).err}
          scalePixelResolution={0.2}
        />
      </Show>
      <Show when={pageInputs().status === "ready"}>
        <PageHolder
          pageInputs={(pageInputs() as { data: PageInputs }).data}
          fixedCanvasH={canvasH}
          simpleError
          scalePixelResolution={0.2}
        />
      </Show>
    </>
  );
}
