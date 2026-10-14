import {
  type AiSlideInput,
  COPILOT_PACKAGE_VIEWS,
  getStartingConfigForSlideDeck,
  type MetricWithStatus,
  type PackageScope,
  packageScopesEqual,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  scopeIdSchema,
  type Slide,
  type SlideDeckConfig,
  t3,
} from "lib";
import type {
  AIViewSnapshot,
  AlertComponentProps,
  PageInputs,
  StateHolder,
} from "panther";
import {
  Button,
  createButtonAction,
  LoadingIndicator,
  ModalContainer,
  openComponent,
  PageHolder,
} from "panther";
import {
  createSignal,
  ErrorBoundary,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { convertAiInputToSlide } from "../../slide_ai/mod.ts";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import {
  copilotViewController,
  type CopilotViewState,
  type PackageViewContext,
} from "~/components/instance/copilot/mod.ts";
import { addSlideToDeck } from "./add_slide_to_deck";
import { canEditProduct } from "~/state/instance/product_access";
import { resolveScope } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";

type SlideState = {
  pageInputs: PageInputs;
  convertedSlide: Slide;
};

type Props = {
  // The view the draft was made in, stored with the card: its identity
  // carries the pair the draft resolves under. Absent on a card stored before
  // the engine recorded it.
  view: AIViewSnapshot | undefined;
  slideInput: AiSlideInput;
};

// The pair the current view shows, when it is a package view with a package.
function currentPair(view: CopilotViewState): PackageScope | undefined {
  if (!(COPILOT_PACKAGE_VIEWS as readonly string[]).includes(view.id)) {
    return undefined;
  }
  try {
    const { runId, scopeId } = (view.context as PackageViewContext).getScope();
    return { runId, scopeId };
  } catch {
    return undefined;
  }
}

// The pair a card renders under: the one its stored view names, so an old
// card keeps its package after a reattach; a card stored without a view
// renders under the current view's pair and offers no Add, since the pair it
// was drafted under is unknown.
function draftPair(
  view: AIViewSnapshot | undefined,
): { pair: PackageScope; stored: boolean } | undefined {
  // The identity is flat strings (copilotViewIdentity); the scope id comes
  // back through its schema.
  const identity = view?.identity;
  const scopeId = identity === undefined
    ? undefined
    : scopeIdSchema.safeParse(identity.scopeId);
  if (identity?.runId !== undefined && scopeId?.success) {
    return {
      pair: { runId: identity.runId, scopeId: scopeId.data },
      stored: true,
    };
  }
  const pair = currentPair(copilotViewController.current());
  return pair === undefined ? undefined : { pair, stored: false };
}

// The open deck, from the deck view or from one of its slides, when it sits
// on the pair the draft was made under: the deck the card lays out for and
// may add to. A report has no deck, and a deck on another package would lay
// the draft out under a config its figures were not resolved for.
function openDeckOnPair(
  draft: PackageScope,
):
  | Extract<CopilotViewState, { id: "editing_slide_deck" | "editing_slide" }>
  | undefined {
  const view = copilotViewController.current();
  if (view.id !== "editing_slide_deck" && view.id !== "editing_slide") {
    return undefined;
  }
  const pair = currentPair(view);
  return pair !== undefined && packageScopesEqual(pair, draft)
    ? view
    : undefined;
}

// The deck the draft can be added to: the open deck on the draft's pair, when
// the user can edit it. A viewer cannot write, so the card is preview-only.
function editableDeckId(draft: PackageScope): string | undefined {
  const view = openDeckOnPair(draft);
  if (view === undefined) return undefined;
  return canEditProduct(view.params.deckId) ? view.params.deckId : undefined;
}

export function DraftSlidePreview(p: Props) {
  const [slideState, setSlideState] = createSignal<StateHolder<SlideState>>({
    status: "loading",
    msg: t3({
      en: "Loading slide...",
      fr: "Chargement de la diapositive...",
      pt: "A carregar diapositivo...",
    }),
  });

  // The open deck's config only in a deck view on the draft's pair;
  // elsewhere the starting draft config.
  function getDeckConfig(draft: PackageScope): SlideDeckConfig {
    const view = openDeckOnPair(draft);
    return view === undefined
      ? getStartingConfigForSlideDeck("Draft")
      : view.context.getDeckConfig();
  }

  // The pair's metrics come from its T2 authoring context, a cache hit for
  // any package a product on it has opened.
  async function metricsFor(
    pair: PackageScope,
  ): Promise<MetricWithStatus[]> {
    const res = await getRunAuthoringContextFromCacheOrFetch(
      resolveScope(pair),
    );
    if (!res.success) throw new Error(res.err);
    return res.data.metrics;
  }

  async function buildSlide() {
    try {
      const draft = draftPair(p.view);
      if (draft === undefined) {
        setSlideState({
          status: "error",
          err: t3({
            en: "No results package is in view to render this draft under.",
            fr:
              "Aucun paquet de résultats n'est affiché pour rendre ce brouillon.",
            pt:
              "Nenhum pacote de resultados está em vista para apresentar este rascunho.",
          }),
        });
        return;
      }
      const deckConfig = getDeckConfig(draft.pair);
      const convertedSlide = await convertAiInputToSlide(
        draft.pair,
        p.slideInput,
        await metricsFor(draft.pair),
        deckConfig,
      );
      const renderRes = await convertSlideToPageInputs(
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

  const addToDeckLabel = () =>
    t3({
      en: "Add to this deck",
      fr: "Ajouter à cette présentation",
      pt: "Adicionar a esta apresentação",
    });
  const addedLabel = () =>
    t3({
      en: "Added to this deck",
      fr: "Ajoutée à cette présentation",
      pt: "Adicionado a esta apresentação",
    });

  // One draft adds once: Add is disabled while the write runs and after it
  // lands, a failure alerts, and the expanded view offers Add only while the
  // card's button is enabled.
  const [added, setAdded] = createSignal(false);
  const add = createButtonAction(
    (slide: Slide, deckId: string) => addSlideToDeck(slide, deckId),
    () => {
      setAdded(true);
    },
  );
  const addTarget = (): { slide: Slide; deckId: string } | undefined => {
    const state = slideState();
    const draft = draftPair(p.view);
    if (state.status !== "ready" || draft === undefined || !draft.stored) {
      return undefined;
    }
    const deckId = editableDeckId(draft.pair);
    return deckId === undefined
      ? undefined
      : { slide: state.data.convertedSlide, deckId };
  };
  const addEnabled = () => !added() && add.state().status === "ready";

  function openExpandedView() {
    const state = slideState();
    if (state.status !== "ready") return;
    const target = addEnabled() ? addTarget() : undefined;
    openComponent<ExpandedSlideModalProps, void>({
      element: ExpandedSlideModal,
      props: {
        pageInputs: state.data.pageInputs,
        onAddToDeck: target === undefined
          ? undefined
          : () => void add.click(target.slide, target.deckId),
        addToDeckLabel: addToDeckLabel(),
      },
    });
  }

  return (
    <ErrorBoundary fallback={<></>}>
      <div class="bg-base-100 max-w-[400px] rounded border">
        <div
          class="cursor-pointer p-1.5"
          onClick={openExpandedView}
        >
          <div class="pointer-events-none">
            <SlideStateWrapper state={slideState()} />
          </div>
        </div>
        {
          /* Actions are hidden on error: the card still renders so the error
            message is visible instead of
            the whole preview vanishing under a "slide preview shown" line. */
        }
        <Show when={slideState().status !== "error"}>
          <div class="flex gap-1.5 border-t p-1.5">
            <Button
              size="sm"
              outline
              iconName="maximize"
              onClick={openExpandedView}
            />
            <Show when={addTarget()} keyed>
              {(target) => (
                <Button
                  size="sm"
                  outline
                  state={add.state()}
                  disabled={!addEnabled()}
                  onClick={() => void add.click(target.slide, target.deckId)}
                >
                  {added() ? addedLabel() : addToDeckLabel()}
                </Button>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </ErrorBoundary>
  );
}

type SlideStateWrapperProps = {
  state: StateHolder<SlideState>;
};

function SlideStateWrapper(p: SlideStateWrapperProps) {
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <div class="aspect-video text-xs">
          <LoadingIndicator msg={(p.state as { msg?: string }).msg} />
        </div>
      </Match>
      <Match when={p.state.status === "error"}>
        <div class="text-danger aspect-video text-xs">
          {(p.state as { err?: string }).err ?? "Error"}
        </div>
      </Match>
      <Match when={p.state.status === "ready"} keyed>
        <div class="aspect-video overflow-hidden">
          <PageHolder
            pageInputs={(p.state as { data: SlideState }).data.pageInputs}
            pageWidthDu={PAGE_WIDTH_DU}
            pageHeightDu={PAGE_HEIGHT_DU}
          />
        </div>
      </Match>
    </Switch>
  );
}

type ExpandedSlideModalProps = {
  pageInputs: PageInputs;
  onAddToDeck: (() => void) | undefined;
  addToDeckLabel: string;
};

function ExpandedSlideModal(
  p: AlertComponentProps<ExpandedSlideModalProps, void>,
) {
  return (
    <ModalContainer
      width="2xl"
      {...(p.onAddToDeck === undefined
        ? {
          onClose: {
            kind: "close" as const,
            onClick: () => p.close(undefined),
          },
        }
        : {
          onCancel: () => p.close(undefined),
          actions: [{
            label: p.addToDeckLabel,
            onClick: () => {
              p.close(undefined);
              p.onAddToDeck?.();
            },
          }],
        })}
    >
      <div class="aspect-video overflow-hidden rounded border">
        <PageHolder
          pageInputs={p.pageInputs}
          pageWidthDu={PAGE_WIDTH_DU}
          pageHeightDu={PAGE_HEIGHT_DU}
        />
      </div>
    </ModalContainer>
  );
}
