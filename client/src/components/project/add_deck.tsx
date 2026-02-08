import { isFrench, SlideDeckFolder, t } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  Select,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function AddDeckForm(
  p: AlertComponentProps<
    { projectId: string; folders: SlideDeckFolder[]; currentFolderId: string | null },
    { newDeckId: string }
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>("");
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.currentFolderId ?? "_none",
  );

  const folderOptions = () => [
    { value: "_none", label: t("General") },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!tempLabel().trim()) {
        return { success: false, err: t("You must enter a label") };
      }
      const folderId = tempFolderId() === "_none" ? null : tempFolderId();
      return await serverActions.createSlideDeck({
        projectId: p.projectId,
        label: tempLabel().trim(),
        folderId,
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
      <div class="ui-spy">
        <Input
          label="Deck Name"
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <Select
          label={t("Folder")}
          options={folderOptions()}
          value={tempFolderId()}
          onChange={setTempFolderId}
          fullWidth
        />
      </div>
    </AlertFormHolder>
  );
}
