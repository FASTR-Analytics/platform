import {
  t3,
  getStartingConfigForSlideDeck,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  type AiSlideInput,
  type MetricWithStatus,
  type PackageScope,
  type Slide,
  type SlideDeckConfig,
} from "lib";
import type { AlertComponentProps, PageInputs, StateHolder } from "panther";
import {
  Button,
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
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { copilotViewController } from "~/components/copilot/ai_views";
import { addSlideToDeck } from "./add_slide_to_deck";

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
// from one of its slides. A report has no deck, so the card is preview-only.
function openDeckId(): string | undefined {
  const view = copilotViewController.current();
  return view.id === "editing_slide_deck" || view.id === "editing_slide"
    ? view.params.deckId
    : undefined;
}

export function DraftSlidePreview(p: Props) {
  const [slideState, setSlideState] = createSignal<StateHolder<SlideState>>({
    status: "loading",
    msg: t3({ en: "Loading slide...", fr: "Chargement de la diapositive...", pt: "A carregar diapositivo..." }),
  });

  function getDeckConfig(): SlideDeckConfig {
    const view = copilotViewController.current();
    if (view.id === "editing_slide_deck") {
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
    t3({ en: "Add to this deck", fr: "Ajouter à cette présentation", pt: "Adicionar a esta apresentação" });

  function openExpandedView() {
    const state = slideState();
    if (state.status !== "ready") return;
    openComponent<ExpandedSlideModalProps, void>({
      element: ExpandedSlideModal,
      props: {
        pageInputs: state.data.pageInputs,
        onAddToDeck: openDeckId() === undefined ? undefined : handleAddToDeck,
        addToDeckLabel: addToDeckLabel(),
      },
    });
  }

  async function handleAddToDeck() {
    const state = slideState();
    const deckId = openDeckId();
    if (state.status !== "ready" || deckId === undefined) return;
    await addSlideToDeck(state.data.convertedSlide, deckId);
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
        {/* Actions are hidden on error: the card still renders so the error
            message is visible instead of
            the whole preview vanishing under a "slide preview shown" line. */}
        <Show when={slideState().status !== "error"}>
          <div class="flex gap-1.5 border-t p-1.5">
            <Button
              size="sm"
              outline
              iconName="maximize"
              onClick={openExpandedView}
            />
            <Show when={openDeckId() !== undefined}>
              <Button size="sm" outline onClick={handleAddToDeck}>
                {addToDeckLabel()}
              </Button>
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
          <LoadingIndicator msg={(p.state as { msg?: string }).msg} noPad />
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
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Show when={p.onAddToDeck}>
            {(onAddToDeck) => (
              <Button
                outline
                onClick={() => {
                  p.close(undefined);
                  onAddToDeck()();
                }}
              >
                {p.addToDeckLabel}
              </Button>
            )}
          </Show>,
          <Button onClick={() => p.close(undefined)}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
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
