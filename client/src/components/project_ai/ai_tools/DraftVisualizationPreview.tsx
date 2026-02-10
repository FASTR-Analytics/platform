import {
  t3,
  getTextRenderingOptions,
  getMetricStaticData,
  getStartingConfigForSlideDeck,
  type AiFigureFromVisualization,
  type AiFigureFromMetric,
  type AiContentSlideInput,
  type MetricWithStatus,
  type ReplicantValueOverride,
  type Slide,
  type SlideDeckConfig,
} from "lib";
import type { AlertComponentProps, FigureInputs, StateHolder } from "panther";
import {
  Button,
  ChartHolder,
  Loading,
  ModalContainer,
  openComponent,
} from "panther";
import { createSignal, ErrorBoundary, Match, onMount, Show, Switch } from "solid-js";
import {
  getPOFigureInputsFromCacheOrFetch_AsyncGenerator,
  getPODetailFromCacheorFetch,
} from "~/state/po_cache";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { buildConfigFromPreset } from "~/components/slide_deck/slide_ai/build_config_from_metric";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { getStyleFromPresentationObject } from "~/generate_visualization/get_style_from_po";
import { SaveAsNewVisualizationModal } from "~/components/visualization/save_as_new_visualization_modal";
import { useProjectDetail } from "~/components/project_runner/mod";
import { useAIProjectContext } from "~/components/project_ai/context";
import { AddToDeckModal } from "./AddToDeckModal";
import { addSlideDirectlyToDeck } from "./add_slide_to_deck";

type FigureInput = AiFigureFromVisualization | AiFigureFromMetric;

type Props = {
  projectId: string;
  title: string;
  figure: FigureInput;
  metrics: MetricWithStatus[];
};

export function DraftVisualizationPreview(p: Props) {
  const projectDetail = useProjectDetail();
  const { aiContext } = useAIProjectContext();

  const [figureState, setFigureState] = createSignal<StateHolder<FigureInputs>>(
    {
      status: "loading",
      msg: t3({ en: "Loading...", fr: "Chargement..." }),
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
        const { formatAs } = getMetricStaticData(figureBlock.source.metricId);
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
        onEditSave: handleSave,
        onAddToDeck: handleAddToDeck,
        addToDeckLabel:
          aiContext().mode === "editing_slide_deck"
            ? t3({ en: "Add to this deck", fr: "Ajouter au deck" })
            : t3({ en: "Add to slide deck", fr: "Ajouter à un deck" }),
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
    const replicateOverride: ReplicantValueOverride | undefined = p.figure
      .replicant
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

  async function handleSave() {
    if (p.figure.type === "from_visualization") {
      const poDetailRes = await getPODetailFromCacheorFetch(
        p.projectId,
        p.figure.visualizationId,
      );
      if (!poDetailRes.success) return;

      await openComponent({
        element: SaveAsNewVisualizationModal,
        props: {
          projectId: p.projectId,
          existingLabel: p.title || poDetailRes.data.label,
          resultsValue: poDetailRes.data.resultsValue,
          config: poDetailRes.data.config,
          folders: projectDetail.visualizationFolders,
        },
      });
    } else {
      const buildResult = buildConfigFromPreset(p.figure, p.metrics);
      if (!buildResult.success) return;

      const { resultsValue, config } = buildResult;
      config.t.caption = p.title;

      await openComponent({
        element: SaveAsNewVisualizationModal,
        props: {
          projectId: p.projectId,
          existingLabel: p.title || t3({ en: "New Visualization", fr: "Nouvelle visualisation" }),
          resultsValue,
          config,
          folders: projectDetail.visualizationFolders,
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
    const deckConfig: SlideDeckConfig =
      ctx.mode === "editing_slide_deck"
        ? ctx.getDeckConfig()
        : getStartingConfigForSlideDeck("Draft");
    const slide: Slide = await convertAiInputToSlide(
      p.projectId,
      slideInput,
      p.metrics,
      deckConfig,
    );
    if (ctx.mode === "editing_slide_deck") {
      await addSlideDirectlyToDeck(p.projectId, slide, ctx);
    } else {
      await openComponent({
        element: AddToDeckModal,
        props: {
          projectId: p.projectId,
          slide,
          slideDecks: projectDetail.slideDecks,
          slideDeckFolders: projectDetail.slideDeckFolders,
        },
      });
    }
  }

  return (
    <ErrorBoundary fallback={<></>}>
    <Show
      when={
        p.figure.type !== "from_metric" || figureState().status !== "error"
      }
    >
      <div class="border-base-300 bg-base-100 max-w-[400px] rounded border">
        <div class="p-1.5">
          <Show
            when={
              p.figure.type === "from_visualization"
                ? (p.figure as AiFigureFromVisualization)
                : undefined
            }
          >
            {(vizFigure) => (
              <div
                class="cursor-pointer transition-opacity hover:opacity-80"
                onClick={openExpandedViewForViz}
              >
                <div class="pointer-events-none">
                  <PresentationObjectMiniDisplay
                    projectId={p.projectId}
                    presentationObjectId={vizFigure().visualizationId}
                    shapeType="force-aspect-video"
                    scalePixelResolution={0.2}
                    repliantOverride={
                      vizFigure().replicant
                        ? { selectedReplicantValue: vizFigure().replicant! }
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </Show>
          <Show when={p.figure.type === "from_metric"}>
            <div
              class="cursor-pointer transition-opacity hover:opacity-80"
              onClick={openExpandedViewForMetric}
            >
              <div class="pointer-events-none">
                <FigureStateWrapper
                  state={figureState()}
                  scalePixelResolution={0.2}
                />
              </div>
            </div>
          </Show>
        </div>
        <div class="border-base-300 flex gap-1.5 border-t p-1.5">
          <Button
            size="sm"
            outline
            iconName="maximize"
            onClick={() => {
              if (p.figure.type === "from_visualization")
                openExpandedViewForViz();
              else openExpandedViewForMetric();
            }}
          />
          <Button size="sm" outline onClick={handleSave}>
            {t3({ en: "Save as new visualization", fr: "Sauver comme nouvelle viz." })}
          </Button>
          <Button size="sm" outline onClick={handleAddToDeck}>
            {aiContext().mode === "editing_slide_deck"
              ? t3({ en: "Add to this deck", fr: "Ajouter au deck" })
              : t3({ en: "Add to slide deck", fr: "Ajouter à un deck" })}
          </Button>
        </div>
      </div>
    </Show>
    </ErrorBoundary>
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
        <div class="text-danger aspect-video text-xs">
          {(p.state as { err?: string }).err ?? "Error"}
        </div>
      </Match>
      <Match
        when={
          p.state.status === "ready" && (p.state as { data: FigureInputs }).data
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

function ExpandedVizModal(p: AlertComponentProps<ExpandedVizModalProps, void>) {
  return (
    <ModalContainer
      width="2xl"
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            outline
            onClick={() => {
              p.close(undefined);
              p.onEditSave();
            }}
          >
            {t3({ en: "Save as new visualization", fr: "Sauver comme nouvelle viz." })}
          </Button>,
          <Button
            outline
            onClick={() => {
              p.close(undefined);
              p.onAddToDeck();
            }}
          >
            {p.addToDeckLabel}
          </Button>,
          <Button onClick={() => p.close(undefined)}>{t3({ en: "Close", fr: "Fermer" })}</Button>,
        ]
      }
    >
      {/* <div style={{ width: "min(80vw, 1200px)" }}> */}
      <FigureStateWrapper
        state={{ status: "ready" as const, data: p.figureInputs }}
        scalePixelResolution={0.5}
      />
      {/* </div> */}
    </ModalContainer>
  );
}
