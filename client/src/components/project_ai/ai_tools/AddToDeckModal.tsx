import type { Slide, SlideDeckFolder, SlideDeckSummary } from "lib";
import { AlertComponentProps, AlertFormHolder, timActionForm } from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { DeckSelector } from "./DeckSelector";

type Props = {
  projectId: string;
  slide: Slide;
  slideDecks: SlideDeckSummary[];
  slideDeckFolders: SlideDeckFolder[];
};

type ReturnType = { deckId: string } | undefined;

export function AddToDeckModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedDeckId, setSelectedDeckId] = createSignal<string>(
    p.slideDecks.length > 0 ? p.slideDecks[0].id : "",
  );
  const [isCreatingNew, setIsCreatingNew] = createSignal(false);
  const [newDeckLabel, setNewDeckLabel] = createSignal("");

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      let deckId: string;

      if (isCreatingNew()) {
        const label = newDeckLabel().trim();
        if (!label) {
          return { success: false as const, err: "Please enter a deck name" };
        }
        const createRes = await serverActions.createSlideDeck({
          projectId: p.projectId,
          label,
        });
        if (!createRes.success) {
          return createRes;
        }
        deckId = createRes.data.deckId;
      } else {
        deckId = selectedDeckId();
      }

      const addRes = await serverActions.createSlide({
        projectId: p.projectId,
        deck_id: deckId,
        position: { toEnd: true },
        slide: p.slide,
      });

      if (!addRes.success) {
        return addRes;
      }

      return { success: true as const, data: { deckId } };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="add-to-deck"
      header="Add to Slide Deck"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={
        isCreatingNew() ? !newDeckLabel().trim() : !selectedDeckId()
      }
    >
      <DeckSelector
        decks={p.slideDecks}
        folders={p.slideDeckFolders}
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
