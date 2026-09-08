import { t3, type Slide } from "lib";
import { AlertComponentProps, AlertFormHolder, createFormAction } from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { reportDraftSlideAdded } from "./add_slide_to_deck";
import { createLabelledProduct } from "./create_labelled_product";
import { DeckSelector, slideDeckProducts } from "./DeckSelector";

type Props = {
  slide: Slide;
};

type ReturnType = { deckId: string } | undefined;

export function AddToDeckModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedDeckId, setSelectedDeckId] = createSignal<string>(
    slideDeckProducts()[0]?.id ?? "",
  );
  const [isCreatingNew, setIsCreatingNew] = createSignal(false);
  const [newDeckLabel, setNewDeckLabel] = createSignal("");

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      let deckId: string;

      if (isCreatingNew()) {
        const label = newDeckLabel().trim();
        if (!label) {
          return { success: false as const, err: "Please enter a deck name" };
        }
        const createRes = await createLabelledProduct("slide_deck", label);
        if (!createRes.success) {
          return createRes;
        }
        deckId = createRes.data.productId;
      } else {
        deckId = selectedDeckId();
      }

      const addRes = await serverActions.createSlide({
        product_id: deckId,
        position: { toEnd: true },
        slide: p.slide,
      });

      if (!addRes.success) {
        return addRes;
      }

      reportDraftSlideAdded(addRes.data.slideId, deckId);

      return { success: true as const, data: { deckId } };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="add-to-deck"
      header={t3({ en: "Add to Slide Deck", fr: "Ajouter à une présentation", pt: "Adicionar à apresentação" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={
        isCreatingNew() ? !newDeckLabel().trim() : !selectedDeckId()
      }
    >
      <DeckSelector
        selectedDeckId={selectedDeckId()}
        onSelectDeck={setSelectedDeckId}
        isCreatingNew={isCreatingNew()}
        onSetCreatingNew={setIsCreatingNew}
        newDeckLabel={newDeckLabel()}
        onSetNewDeckLabel={setNewDeckLabel}
      />
    </AlertFormHolder>
  );
}
