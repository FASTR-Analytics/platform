import { getStartingConfigForSlideDeck, t3 } from "lib";
import { trackDeep } from "@solid-primitives/deep";
import { createSignal, createEffect, Show } from "solid-js";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { getQueryStateFromApiResponse, PageHolder, StateHolder, type PageInputs } from "panther";
import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { getSlideFromCacheOrFetch } from "~/state/project/t2_slides";
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

    const res = await getSlideFromCacheOrFetch(p.projectId, p.slideId);

    if (!res.success) {
      setPageInputs({ status: "error", err: res.err });
      return;
    }

    const renderRes = await convertSlideToPageInputs(p.projectId, res.data.slide, undefined, config);
    setPageInputs(getQueryStateFromApiResponse(renderRes));
  });

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
