import { SimpleSlide, getStartingConfigForReport, getTextRenderingOptions } from "lib";
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
import { convertSlideToPageInputs } from "./transform_v2";
// import { getPageInputs_SlideDeck_Cover } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_cover";
// import { getPageInputs_SlideDeck_Freeform } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_freeform";
// import { getPageInputs_SlideDeck_Section } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_section";
// import { transformSlideDeckToReportItems } from "./transform";

type Props = {
  projectId: string;
  slides: SimpleSlide[];
  deckLabel: string;
  slideSize?: number;
};

export function SlideDeckPreview(p: Props) {
  const slideSize = () => p.slideSize ?? 400;

  return (
    <div class="h-full overflow-auto p-4">
      <div class="flex flex-wrap justify-center gap-4">
        <For each={p.slides}>
          {(slide, index) => (
            <SlidePreviewCard
              projectId={p.projectId}
              slide={slide}
              index={index()}
              totalSlides={p.slides.length}
              deckLabel={p.deckLabel}
              slideSize={slideSize()}
            />
          )}
        </For>
        <Show when={p.slides.length === 0}>
          <div class="text-neutral w-full py-16 text-center">
            No slides yet. Ask the AI to create some slides.
          </div>
        </Show>
      </div>
    </div>
  );
}

type SlidePreviewCardProps = {
  projectId: string;
  slide: SimpleSlide;
  index: number;
  totalSlides: number;
  deckLabel: string;
  slideSize: number;
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
    <div style={{ width: `${p.slideSize}px` }}>
      <div class="mb-2 text-base-content text-center text-sm font-medium">
        {p.index + 1}
      </div>
      <div
        class="cursor-pointer overflow-clip rounded-lg border border-base-300 bg-white hover:border-primary"
        onClick={openExpandedView}
      >
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
              console.log("Page inputs", data)
              return <PageHolder
                pageInputs={data}
                fixedCanvasH={canvasH}
                textRenderingOptions={getTextRenderingOptions()}
                simpleError
                scalePixelResolution={0.6}
              />
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
