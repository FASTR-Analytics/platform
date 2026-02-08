import {
  getStartingConfigForReport,
  getTextRenderingOptions,
  type AiSlideInput,
  type MetricWithStatus,
  type Slide,
  type SlideDeckConfig,
} from "lib";
import type { AlertComponentProps, PageInputs, StateHolder } from "panther";
import { Button, Loading, openComponent, PageHolder, _GLOBAL_CANVAS_PIXEL_WIDTH } from "panther";
import { createSignal, Match, onMount, Switch } from "solid-js";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { convertSlideToPageInputs } from "~/components/slide_deck/slide_rendering/convert_slide_to_page_inputs";
import { useAIProjectContext } from "~/components/project_ai/context";
import { useProjectDetail } from "~/components/project_runner/mod";
import { AddToDeckModal } from "./AddToDeckModal";
import { addSlideDirectlyToDeck } from "./add_slide_to_deck";

const CANVAS_H = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

type SlideState = {
  pageInputs: PageInputs;
  convertedSlide: Slide;
};

type Props = {
  projectId: string;
  slideInput: AiSlideInput;
  metrics: MetricWithStatus[];
};

export function DraftSlidePreview(p: Props) {
  const { aiContext } = useAIProjectContext();
  const projectDetail = useProjectDetail();

  const [slideState, setSlideState] = createSignal<StateHolder<SlideState>>({
    status: "loading",
    msg: "Loading slide...",
  });

  function getDeckConfig(): SlideDeckConfig {
    const ctx = aiContext();
    if (ctx.mode === "editing_slide_deck") {
      return ctx.getDeckConfig();
    }
    return getStartingConfigForReport("Draft");
  }

  async function buildSlide() {
    try {
      const deckConfig = getDeckConfig();
      const convertedSlide = await convertAiInputToSlide(
        p.projectId,
        p.slideInput,
        p.metrics,
        deckConfig,
      );
      const renderRes = await convertSlideToPageInputs(
        p.projectId,
        convertedSlide,
        undefined,
        deckConfig,
      );
      if (!renderRes.success) {
        setSlideState({ status: "error", err: renderRes.err });
        return;
      }
      setSlideState({
        status: "ready",
        data: { pageInputs: renderRes.data, convertedSlide },
      });
    } catch (err) {
      setSlideState({
        status: "error",
        err: err instanceof Error ? err.message : "Failed to render slide",
      });
    }
  }

  onMount(() => {
    buildSlide();
  });

  function openExpandedView() {
    const state = slideState();
    if (state.status !== "ready") return;
    openComponent<ExpandedSlideModalProps, void>({
      element: ExpandedSlideModal,
      props: {
        pageInputs: state.data.pageInputs,
        onAddToDeck: handleAddToDeck,
        addToDeckLabel: aiContext().mode === "editing_slide_deck"
          ? "Add to this deck"
          : "Add to slide deck",
      },
    });
  }

  async function handleAddToDeck() {
    const state = slideState();
    if (state.status !== "ready") return;
    const ctx = aiContext();
    if (ctx.mode === "editing_slide_deck") {
      await addSlideDirectlyToDeck(p.projectId, state.data.convertedSlide, ctx);
    } else {
      await openComponent({
        element: AddToDeckModal,
        props: {
          projectId: p.projectId,
          slide: state.data.convertedSlide,
          slideDecks: projectDetail.slideDecks,
          slideDeckFolders: projectDetail.slideDeckFolders,
        },
      });
    }
  }

  return (
    <div class="max-w-[400px] rounded border border-base-300 bg-base-100">
      <div
        class="cursor-pointer p-1.5 transition-opacity hover:opacity-80"
        onClick={openExpandedView}
      >
        <SlideStateWrapper state={slideState()} scalePixelResolution={0.2} />
      </div>
      <div class="flex gap-1.5 border-t border-base-300 p-1.5">
        <Button size="sm" outline iconName="maximize" onClick={openExpandedView} />
        <Button size="sm" outline onClick={handleAddToDeck}>
          {aiContext().mode === "editing_slide_deck"
            ? "Add to this deck"
            : "Add to slide deck"}
        </Button>
      </div>
    </div>
  );
}

type SlideStateWrapperProps = {
  state: StateHolder<SlideState>;
  scalePixelResolution?: number;
};

function SlideStateWrapper(p: SlideStateWrapperProps) {
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <div class="aspect-video text-xs">
          <Loading msg={(p.state as { msg?: string }).msg} noPad />
        </div>
      </Match>
      <Match when={p.state.status === "error"}>
        <div class="aspect-video text-xs text-danger">
          {(p.state as { err?: string }).err ?? "Error"}
        </div>
      </Match>
      <Match when={p.state.status === "ready"} keyed>
        <div class="aspect-video overflow-hidden">
          <PageHolder
            pageInputs={(p.state as { data: SlideState }).data.pageInputs}
            fixedCanvasH={CANVAS_H}
            textRenderingOptions={getTextRenderingOptions()}
            scalePixelResolution={p.scalePixelResolution}
          />
        </div>
      </Match>
    </Switch>
  );
}

type ExpandedSlideModalProps = {
  pageInputs: PageInputs;
  onAddToDeck: () => void;
  addToDeckLabel: string;
};

function ExpandedSlideModal(
  p: AlertComponentProps<ExpandedSlideModalProps, void>,
) {
  return (
    <div
      class="ui-pad-lg flex flex-col ui-gap"
      style={{ "max-width": "90vw", "max-height": "90vh" }}
    >
      <div class="min-h-0 flex-1 overflow-auto">
        <div style={{ width: "min(80vw, 1200px)" }}>
          <div class="aspect-video overflow-hidden">
            <PageHolder
              pageInputs={p.pageInputs}
              fixedCanvasH={CANVAS_H}
              textRenderingOptions={getTextRenderingOptions()}
              scalePixelResolution={0.5}
            />
          </div>
        </div>
      </div>
      <div class="flex shrink-0 justify-end ui-gap-sm">
        <Button outline onClick={() => { p.close(undefined); p.onAddToDeck(); }}>
          {p.addToDeckLabel}
        </Button>
        <Button onClick={() => p.close(undefined)}>Close</Button>
      </div>
    </div>
  );
}
