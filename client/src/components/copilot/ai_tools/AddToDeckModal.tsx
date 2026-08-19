import { productScope, t3, type ProductSummary, type Slide } from "lib";
import { AlertComponentProps, AlertFormHolder, createFormAction } from "panther";
import { createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { reportDraftSlideAdded } from "./add_slide_to_deck";
import { reresolveSlideFiguresUnderScope } from "./reresolve_slide_figures";
import { DeckSelector } from "./DeckSelector";

type Props = {
  slide: Slide;
};

type ReturnType = { deckId: string } | undefined;

export function AddToDeckModal(p: AlertComponentProps<Props, ReturnType>) {
  const decks = createMemo(() =>
    instanceState.products.filter(
      (product): product is Extract<ProductSummary, { type: "slide_deck" }> =>
        product.type === "slide_deck",
    )
  );

  const [selectedDeckId, setSelectedDeckId] = createSignal<string>(
    decks().length > 0 ? decks()[0].id : "",
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
        // The server mints the row and resolves run_id from the pin (D16); the
        // label is a separate product-registry write.
        const createRes = await serverActions.createProduct({
          type: "slide_deck",
          folderId: null,
        });
        if (!createRes.success) {
          return createRes;
        }
        deckId = createRes.data.productId;
        const labelRes = await serverActions.updateProductLabel({
          product_id: deckId,
          label,
        });
        if (!labelRes.success) {
          return labelRes;
        }
      } else {
        deckId = selectedDeckId();
      }

      // The draft was resolved under the copilot's pair at draft time — the
      // pin at national scope, since this modal only opens when NO deck editor
      // is up. The target deck may sit on another package or another admin
      // area, so its figures are re-queried under the deck's own pair before
      // the write (D15).
      const target = instanceState.products.find((product) =>
        product.id === deckId
      );
      if (!target) {
        return { success: false as const, err: "That slide deck no longer exists" };
      }
      let slide: Slide;
      try {
        slide = await reresolveSlideFiguresUnderScope(
          p.slide,
          productScope(target),
        );
      } catch (err) {
        return {
          success: false as const,
          err: err instanceof Error ? err.message : "Could not prepare the slide for this deck",
        };
      }

      const addRes = await serverActions.createSlide({
        deck_id: deckId,
        position: { toEnd: true },
        slide,
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
        decks={decks()}
        folders={instanceState.folders}
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
