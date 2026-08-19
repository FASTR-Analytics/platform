import { getStartingConfigForSlideDeck, t3 } from "lib";
import { trackDeep } from "@solid-primitives/deep";
import { createSignal, createEffect, Show } from "solid-js";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { getQueryStateFromApiResponse, PageHolder, StateHolder, type PageInputs } from "panther";
import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { instanceState, productById } from "~/state/instance/t1_store";

const _defaultConfig = getStartingConfigForSlideDeck("");

type Props = {
  /** A deck product's id IS its deck id. */
  deckId: string;
  slideId: string;
};

export function SlideDeckThumbnail(p: Props) {
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." }),
  });

  let fetchRunId = 0;
  createEffect(async () => {
    instanceState.lastUpdated.products[p.deckId];
    instanceState.lastUpdated.slides[p.slideId];
    const deck = productById(p.deckId);
    const config =
      deck?.type === "slide_deck" ? deck.config : _defaultConfig;
    trackDeep(config);
    const runId = ++fetchRunId;

    const res = await getSlideFromCacheOrFetch(p.slideId);
    if (runId !== fetchRunId) return;

    if (!res.success) {
      setPageInputs({ status: "error", err: res.err });
      return;
    }

    const renderRes = await convertSlideToPageInputs(res.data.slide, undefined, config);
    if (runId !== fetchRunId) return;
    setPageInputs(getQueryStateFromApiResponse(renderRes));
  });

  return (
    <>
      <Show when={pageInputs().status === "loading"}>
        <div
          class="bg-base-200 flex items-center justify-center"
          style={{ "aspect-ratio": "16/9" }}
        >
          <div class="ui-text-caption">{t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." })}</div>
        </div>
      </Show>
      <Show when={pageInputs().status === "error"}>
        <PageHolder
          pageInputs={undefined}
          pageWidthDu={PAGE_WIDTH_DU}
          pageHeightDu={PAGE_HEIGHT_DU}
          simpleError
          externalError={(pageInputs() as { err: string }).err}
        />
      </Show>
      <Show when={pageInputs().status === "ready"}>
        <PageHolder
          pageInputs={(pageInputs() as { data: PageInputs }).data}
          pageWidthDu={PAGE_WIDTH_DU}
          pageHeightDu={PAGE_HEIGHT_DU}
          simpleError
        />
      </Show>
    </>
  );
}
