import {
  t3,
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
  LoadingIndicator,
  ModalContainer,
  openAlert,
  openComponent,
} from "panther";
import {
  createSignal,
  ErrorBoundary,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import {
  getPOFigureInputsFromCacheOrFetch_AsyncGenerator,
  getPODetailFromCacheorFetch,
} from "~/state/project/t2_presentation_objects";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { buildConfigFromPreset } from "~/components/slide_deck/slide_ai/build_config_from_metric";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { SaveAsNewVisualizationModal } from "~/components/visualization/save_as_new_visualization_modal";
import { projectState } from "~/state/project/t1_store";
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
  const { aiContext } = useAIProjectContext();

  const [figureState, setFigureState] = createSignal<StateHolder<FigureInputs>>(
    {
      status: "loading",
      msg: t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." }),
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
      if (!figureBlock.bundle) {
        setFigureState({ status: "error", err: "No figure data" });
        return;
      }
      setFigureState({
        status: "ready",
        data: buildFigureInputs(figureBlock.bundle),
      });
    } catch (err) {
      // Log + render the error (the card is no longer hidden on from_metric
      // errors) so a schema-invalid bundle surfaces its named field here,
      // rather than vanishing silently before the user reaches add-to-deck.
      console.error("Failed to build metric figure preview:", err);
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
            ? t3({
                en: "Add to this deck",
                fr: "Ajouter au deck",
                pt: "Adicionar a esta apresentação",
              })
            : t3({
                en: "Add to slide deck",
                fr: "Ajouter à un deck",
                pt: "Adicionar a uma apresentação",
              }),
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
          folders: projectState.visualizationFolders,
        },
      });
    } else {
      const { resultsValue, config } = buildConfigFromPreset(p.figure, p.metrics);
      config.t.caption = p.title;

      await openComponent({
        element: SaveAsNewVisualizationModal,
        props: {
          projectId: p.projectId,
          existingLabel:
            p.title ||
            t3({
              en: "New Visualization",
              fr: "Nouvelle visualisation",
              pt: "Nova visualização",
            }),
          resultsValue,
          config,
          folders: projectState.visualizationFolders,
        },
      });
    }
  }

  async function handleAddToDeck() {
    const ctx = aiContext();
    if (ctx.mode === "editing_slide") {
      await openAlert({
        text: t3({
          en: "Switch back to the full slide deck viewer to add this as a slide.",
          fr: "Revenez à la vue complète de la présentation pour l'ajouter comme diapositive.",
          pt: "Volte ao visualizador completo da apresentação para adicionar isto como diapositivo.",
        }),
        intent: "neutral",
      });
      return;
    }
    try {
      const slideInput: AiContentSlideInput = {
        type: "content",
        header: p.title,
        blocks: [p.figure],
      };
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
            slideDecks: projectState.slideDecks,
            slideDeckFolders: projectState.slideDeckFolders,
          },
        });
      }
    } catch (err) {
      console.error("Failed to add to slide deck:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      await openAlert({
        text: `${t3({ en: "Failed to add to slide deck", fr: "Échec de l'ajout à la présentation", pt: "Falha ao adicionar à apresentação" })}: ${errMsg}`,
        intent: "danger",
      });
    }
  }

  return (
    <ErrorBoundary fallback={<></>}>
      <div class="bg-base-100 max-w-[400px] rounded border">
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
                class="cursor-pointer"
                onClick={openExpandedViewForViz}
              >
                <div class="pointer-events-none">
                  <PresentationObjectMiniDisplay
                    projectId={p.projectId}
                    presentationObjectId={vizFigure().visualizationId}
                    shapeType="force-aspect-video"
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
              class="cursor-pointer"
              onClick={openExpandedViewForMetric}
            >
              <div class="pointer-events-none">
                <FigureStateWrapper state={figureState()} />
              </div>
            </div>
          </Show>
        </div>
        <div class="flex gap-1.5 border-t p-1.5">
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
            {t3({
              en: "Save as new visualization",
              fr: "Sauver comme nouvelle viz.",
              pt: "Guardar como nova visualização",
            })}
          </Button>
          <Button size="sm" outline onClick={handleAddToDeck}>
            {aiContext().mode === "editing_slide_deck"
              ? t3({
                  en: "Add to this deck",
                  fr: "Ajouter au deck",
                  pt: "Adicionar a esta apresentação",
                })
              : t3({
                  en: "Add to slide deck",
                  fr: "Ajouter à un deck",
                  pt: "Adicionar a uma apresentação",
                })}
          </Button>
        </div>
      </div>
    </ErrorBoundary>
  );
}

type FigureStateWrapperProps = {
  state: StateHolder<FigureInputs>;
};

function FigureStateWrapper(p: FigureStateWrapperProps) {
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <div class="aspect-video text-xs">
          <LoadingIndicator msg={(p.state as { msg?: string }).msg} noPad />
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
            "tableData" in keyedFigureInputs
              ? ("ideal" as const)
              : ("flex" as const);
          return (
            <div class="aspect-video overflow-hidden">
              <ChartHolder
                chartInputs={keyedFigureInputs}
                height={h1}
                sizing="zoom"
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
            {t3({
              en: "Save as new visualization",
              fr: "Sauver comme nouvelle viz.",
              pt: "Guardar como nova visualização",
            })}
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
          <Button onClick={() => p.close(undefined)}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
    >
      {/* <div style={{ width: "min(80vw, 1200px)" }}> */}
      <FigureStateWrapper
        state={{ status: "ready" as const, data: p.figureInputs }}
      />
      {/* </div> */}
    </ModalContainer>
  );
}
