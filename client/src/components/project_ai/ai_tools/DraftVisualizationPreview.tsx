import {
  getTextRenderingOptions,
  getMetricStaticData,
  getStartingConfigForReport,
  type AiFigureFromVisualization,
  type AiFigureFromMetric,
  type AiContentSlideInput,
  type MetricWithStatus,
  type ReplicantValueOverride,
  type Slide,
  type SlideDeckConfig,
} from "lib";
import type { AlertComponentProps, FigureInputs, StateHolder } from "panther";
import { Button, ChartHolder, Loading, openComponent } from "panther";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import {
  getPOFigureInputsFromCacheOrFetch_AsyncGenerator,
  getPODetailFromCacheorFetch,
} from "~/state/po_cache";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { buildConfigFromMetric } from "~/components/slide_deck/slide_ai/build_config_from_metric";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { getStyleFromPresentationObject } from "~/generate_visualization/get_style_from_po";
import { VisualizationEditor } from "~/components/visualization";
import { useProjectDetail } from "~/components/project_runner/mod";
import { useAIProjectContext } from "~/components/project_ai/context";
import { snapshotForVizEditor } from "~/utils/snapshot";
import { AddToDeckModal } from "./AddToDeckModal";
import { addSlideDirectlyToDeck } from "./add_slide_to_deck";

type FigureInput =
  | AiFigureFromVisualization
  | AiFigureFromMetric;

type Props = {
  projectId: string;
  title: string;
  figure: FigureInput;
  metrics: MetricWithStatus[];
};

export function DraftVisualizationPreview(p: Props) {
  const projectDetail = useProjectDetail();
  const { aiContext, instanceDetail } = useAIProjectContext();

  const [figureState, setFigureState] = createSignal<StateHolder<FigureInputs>>(
    {
      status: "loading",
      msg: "Loading...",
    },
  );

  onMount(() => {
    if (p.figure.type === "from_metric") {
      fetchMetricFigure();
    }
  });

  async function fetchMetricFigure() {
    if (p.figure.type !== "from_metric") return;
    try {
      const figureBlock = await resolveFigureFromMetric(
        p.projectId,
        p.figure,
        p.metrics,
      );
      if (!figureBlock.figureInputs) {
        setFigureState({ status: "error", err: "No figure data" });
        return;
      }
      let finalInputs: FigureInputs = figureBlock.figureInputs;
      if (figureBlock.source?.type === "from_data") {
        const { formatAs } = getMetricStaticData(
          figureBlock.source.metricId,
        );
        const style = getStyleFromPresentationObject(
          figureBlock.source.config,
          formatAs,
        );
        finalInputs = { ...finalInputs, style };
      }
      setFigureState({ status: "ready", data: finalInputs });
    } catch (err) {
      setFigureState({
        status: "error",
        err: err instanceof Error ? err.message : "Failed to load",
      });
    }
  }

  function openExpandedModal(figureInputs: FigureInputs) {
    openComponent<ExpandedVizModalProps, void>({
      element: ExpandedVizModal,
      props: {
        figureInputs,
        onEditSave: handleEditSave,
        onAddToDeck: handleAddToDeck,
        addToDeckLabel: aiContext().mode === "editing_slide_deck"
          ? "Add to this deck"
          : "Add to slide deck",
      },
    });
  }

  function openExpandedViewForMetric() {
    const state = figureState();
    if (state.status !== "ready") return;
    openExpandedModal(state.data);
  }

  async function openExpandedViewForViz() {
    if (p.figure.type !== "from_visualization") return;
    const replicateOverride: ReplicantValueOverride | undefined =
      p.figure.replicant
        ? { selectedReplicantValue: p.figure.replicant }
        : undefined;
    const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
      p.projectId,
      p.figure.visualizationId,
      replicateOverride,
    );
    let result: FigureInputs | undefined;
    for await (const state of iter) {
      if (state.status === "ready") result = state.data;
    }
    if (result) {
      openExpandedModal(result);
    }
  }

  async function handleEditSave() {
    if (p.figure.type === "from_visualization") {
      const poDetailRes = await getPODetailFromCacheorFetch(
        p.projectId,
        p.figure.visualizationId,
      );
      if (!poDetailRes.success) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await openComponent<any, any>({
        element: VisualizationEditor,
        props: {
          mode: "create" as const,
          projectId: p.projectId,
          label: p.title || poDetailRes.data.label,
          isGlobalAdmin: false,
          returnToContext: aiContext(),
          ...snapshotForVizEditor({
            projectDetail,
            instanceDetail,
            resultsValue: poDetailRes.data.resultsValue,
            config: poDetailRes.data.config,
          }),
        },
      });
    } else {
      const buildResult = buildConfigFromMetric(p.figure, p.metrics);
      if (!buildResult.success) return;

      const { resultsValue, config } = buildResult;
      config.t.caption = p.title;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await openComponent<any, any>({
        element: VisualizationEditor,
        props: {
          mode: "create" as const,
          projectId: p.projectId,
          label: p.title || "New Visualization",
          isGlobalAdmin: false,
          returnToContext: aiContext(),
          ...snapshotForVizEditor({
            projectDetail,
            instanceDetail,
            resultsValue,
            config,
          }),
        },
      });
    }
  }

  async function handleAddToDeck() {
    const slideInput: AiContentSlideInput = {
      type: "content",
      header: p.title,
      blocks: [p.figure],
    };
    const ctx = aiContext();
    const deckConfig: SlideDeckConfig = ctx.mode === "editing_slide_deck"
      ? ctx.getDeckConfig()
      : getStartingConfigForReport("Draft");
    const slide: Slide = await convertAiInputToSlide(
      p.projectId,
      slideInput,
      p.metrics,
      deckConfig,
    );
    if (ctx.mode === "editing_slide_deck") {
      await addSlideDirectlyToDeck(p.projectId, slide, ctx);
    } else {
      await openComponent<{ projectId: string; slide: Slide }, { deckId: string } | undefined>({
        element: AddToDeckModal,
        props: { projectId: p.projectId, slide },
      });
    }
  }

  return (
    <div class="max-w-[400px] rounded border border-base-300 bg-base-100">
      <div class="p-1.5">
        <Show when={p.figure.type === "from_visualization" ? p.figure as AiFigureFromVisualization : undefined}>
          {(vizFigure) => (
            <div class="cursor-pointer transition-opacity hover:opacity-80">
              <PresentationObjectMiniDisplay
                projectId={p.projectId}
                presentationObjectId={vizFigure().visualizationId}
                shapeType="force-aspect-video"
                onClick={openExpandedViewForViz}
                scalePixelResolution={0.2}
                repliantOverride={
                  vizFigure().replicant
                    ? { selectedReplicantValue: vizFigure().replicant! }
                    : undefined
                }
              />
            </div>
          )}
        </Show>
        <Show when={p.figure.type === "from_metric"}>
          <div
            class="cursor-pointer transition-opacity hover:opacity-80"
            onClick={openExpandedViewForMetric}
          >
            <FigureStateWrapper
              state={figureState()}
              scalePixelResolution={0.2}
            />
          </div>
        </Show>
      </div>
      <div class="flex gap-1.5 border-t border-base-300 p-1.5">
        <Button size="sm" outline onClick={handleEditSave}>
          Edit / Save
        </Button>
        <Button size="sm" outline onClick={handleAddToDeck}>
          {aiContext().mode === "editing_slide_deck"
            ? "Add to this deck"
            : "Add to slide deck"}
        </Button>
      </div>
    </div>
  );
}

type FigureStateWrapperProps = {
  state: StateHolder<FigureInputs>;
  scalePixelResolution?: number;
};

function FigureStateWrapper(p: FigureStateWrapperProps) {
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
      <Match
        when={
          p.state.status === "ready" &&
          (p.state as { data: FigureInputs }).data
        }
        keyed
      >
        {(keyedFigureInputs) => {
          const h1 =
            //@ts-ignore
            keyedFigureInputs.style.idealAspectRatio === "none"
              ? "flex"
              : "ideal";
          return (
            <div class="aspect-video overflow-hidden">
              <ChartHolder
                chartInputs={keyedFigureInputs}
                height={h1}
                noRescaleWithWidthChange
                textRenderingOptions={getTextRenderingOptions()}
                scalePixelResolution={p.scalePixelResolution}
              />
            </div>
          );
        }}
      </Match>
    </Switch>
  );
}

type ExpandedVizModalProps = {
  figureInputs: FigureInputs;
  onEditSave: () => void;
  onAddToDeck: () => void;
  addToDeckLabel: string;
};

function ExpandedVizModal(
  p: AlertComponentProps<ExpandedVizModalProps, void>,
) {
  return (
    <div
      class="ui-pad-lg flex flex-col ui-gap"
      style={{ "max-width": "90vw", "max-height": "90vh" }}
    >
      <div class="min-h-0 flex-1 overflow-auto">
        <div style={{ width: "min(80vw, 1200px)" }}>
          <FigureStateWrapper
            state={{ status: "ready" as const, data: p.figureInputs }}
            scalePixelResolution={0.5}
          />
        </div>
      </div>
      <div class="flex shrink-0 justify-end ui-gap-sm">
        <Button outline onClick={() => { p.close(undefined); p.onEditSave(); }}>
          Edit / Save
        </Button>
        <Button outline onClick={() => { p.close(undefined); p.onAddToDeck(); }}>
          {p.addToDeckLabel}
        </Button>
        <Button onClick={() => p.close(undefined)}>Close</Button>
      </div>
    </div>
  );
}
