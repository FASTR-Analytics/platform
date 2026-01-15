import { AiSlideDeckSlide, getStartingConfigForReport, getTextRenderingOptions } from "lib";
import type { AlertComponentProps, PageInputs } from "panther";
import {
  Button,
  Loading,
  openComponent,
  PageHolder,
  StateHolder,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
} from "panther";
import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  Show,
  Switch,
} from "solid-js";
import { getPageInputs_SlideDeck_Cover } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_cover";
import { getPageInputs_SlideDeck_Freeform } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_freeform";
import { getPageInputs_SlideDeck_Section } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_section";
import { transformSlideDeckToReportItems } from "./transform";

type Props = {
  projectId: string;
  slides: AiSlideDeckSlide[];
  deckLabel: string;
};

export function SlideDeckPreview(p: Props) {
  return (
    <div class="h-full overflow-auto p-4">
      <div class="mx-auto flex max-w-4xl flex-col gap-4">
        <For each={p.slides}>
          {(slide, index) => (
            <SlidePreviewCard
              projectId={p.projectId}
              slide={slide}
              index={index()}
              totalSlides={p.slides.length}
              deckLabel={p.deckLabel}
            />
          )}
        </For>
        <Show when={p.slides.length === 0}>
          <div class="text-neutral py-16 text-center">
            No slides yet. Ask the AI to create some slides.
          </div>
        </Show>
      </div>
    </div>
  );
}

type SlidePreviewCardProps = {
  projectId: string;
  slide: AiSlideDeckSlide;
  index: number;
  totalSlides: number;
  deckLabel: string;
};

function SlidePreviewCard(p: SlidePreviewCardProps) {
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });

  async function renderSlide() {
    setPageInputs({ status: "loading", msg: "Rendering..." });

    try {
      const reportConfig = getStartingConfigForReport(p.deckLabel);
      reportConfig.showPageNumbers = false
      const reportItems = transformSlideDeckToReportItems({
        label: p.deckLabel,
        slides: [p.slide],
      });

      if (reportItems.length === 0) {
        setPageInputs({ status: "error", err: "No slide to render" });
        return;
      }

      const reportItemConfig = reportItems[0];
      let res;

      if (reportItemConfig.type === "cover") {
        res = await getPageInputs_SlideDeck_Cover(
          p.projectId,
          reportConfig,
          reportItemConfig
        );
      } else if (reportItemConfig.type === "section") {
        res = await getPageInputs_SlideDeck_Section(
          p.projectId,
          reportConfig,
          reportItemConfig,
          p.index
        );
      } else {
        res = await getPageInputs_SlideDeck_Freeform(
          p.projectId,
          reportConfig,
          reportItemConfig,
          p.index
        );
      }

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

  function openExpandedView() {
    openComponent<ExpandedSlideModalProps, void>({
      element: ExpandedSlideModal,
      props: {
        pageInputs: pageInputs(),
        slideNumber: p.index + 1,
        totalSlides: p.totalSlides,
      },
    });
  }

  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  return (
    <div
      class=" "
    >
      <div class="flex items-start gap-3 ">
        <div class="text-base-content w-8 flex-none pt-1 text-right text-sm font-medium">
          {p.index + 1}
        </div>
        <div class="min-w-0 flex-1 border border-base-300 bg-white overflow-clip hover:border-primary cursor-pointer rounded-lg"
          onClick={openExpandedView}>
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
