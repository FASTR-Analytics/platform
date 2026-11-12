import {
  type MetricWithStatus,
  type Slide,
  type SlideDeckConfig,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  ModalContainer,
  type StateHolder,
  StateHolderWrapper,
} from "panther";
import { createSignal, onCleanup, onMount } from "solid-js";
import { draftBlueprintFromDeck, type DraftedBlueprint } from "./draft.ts";

type Props = {
  deckLabel: string;
  config: SlideDeckConfig;
  slides: Slide[];
  metrics: MetricWithStatus[];
};

// The wait while the AI drafts a blueprint from the deck (one structured
// call, up to a minute or two on a long deck). Cancel aborts the call.
export function DraftingModal(
  p: AlertComponentProps<Props, DraftedBlueprint>,
) {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const [state, setState] = createSignal<StateHolder<true>>({
    status: "loading",
    msg: t3({
      en: `Reading ${p.slides.length} slides and drafting the blueprint…`,
      fr:
        `Lecture de ${p.slides.length} diapositives et préparation du modèle…`,
      pt: `A ler ${p.slides.length} diapositivos e a preparar o modelo…`,
    }),
  });

  onMount(async () => {
    try {
      const drafted = await draftBlueprintFromDeck({
        deckLabel: p.deckLabel,
        config: p.config,
        slides: p.slides,
        metrics: p.metrics,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) p.close(drafted);
    } catch (e) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        err: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return (
    <ModalContainer
      width="md"
      title={t3({
        en: "Make a blueprint",
        fr: "Créer un modèle",
        pt: "Criar um modelo",
      })}
      onCancel={() => {
        controller.abort();
        p.close(undefined);
      }}
    >
      <StateHolderWrapper state={state()}>
        {() => <div />}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
