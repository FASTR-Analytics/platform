import {
  type AiSlideInput,
  getStartingConfigForSlideDeck,
  type MetricWithStatus,
  type PackageScope,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  type Slide,
  type SlideDeckConfig,
  t3,
} from "lib";
import type { AlertComponentProps, PageInputs, StateHolder } from "panther";
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
import { copilotViewController } from "~/components/instance/copilot/mod.ts";
import { addSlideToDeck } from "./add_slide_to_deck";
import { canEditProduct } from "~/state/instance/product_access";

type SlideState = {
  pageInputs: PageInputs;
  convertedSlide: Slide;
};

type Props = {
  scope: PackageScope;
  slideInput: AiSlideInput;
  metrics: MetricWithStatus[];
};

// The deck the draft can be added to: the open deck, from the deck view or
// from one of its slides, when the user can edit it. A report has no deck, so
// the card is preview-only there, as it is for a viewer.
function editableDeckId(): string | undefined {
  const view = copilotViewController.current();
  if (view.id !== "editing_slide_deck" && view.id !== "editing_slide") {
    return undefined;
  }
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

  function getDeckConfig(): SlideDeckConfig {
    const view = copilotViewController.current();
    if (view.id === "editing_slide_deck" || view.id === "editing_slide") {
      return view.context.getDeckConfig();
    }
    return getStartingConfigForSlideDeck("Draft");
  }

  async function buildSlide() {
    try {
      const deckConfig = getDeckConfig();
      const convertedSlide = await convertAiInputToSlide(
        p.scope,
        p.slideInput,
        p.metrics,
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
    const deckId = editableDeckId();
    return state.status === "ready" && deckId !== undefined
      ? { slide: state.data.convertedSlide, deckId }
      : undefined;
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
