import { isFrench, t, t2, T } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function AddDeckForm(
  p: AlertComponentProps<
    { projectId: string },
    { newDeckId: string }
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>("");

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!tempLabel().trim()) {
        return { success: false, err: t("You must enter a label") };
      }
      return await serverActions.createSlideDeck({
        projectId: p.projectId,
        label: tempLabel().trim(),
      });
    },
    (data) => p.close({ newDeckId: data.deckId }),
  );

  return (
    <AlertFormHolder
      formId="add-deck"
      header="Create Slide Deck"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Input
        label="Deck Name"
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
    </AlertFormHolder>
  );
}
