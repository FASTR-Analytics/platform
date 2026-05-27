import { t3, TC } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  timActionDelete,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function DeleteData(
  p: EditorComponentProps<
    {
      silentFetch: () => Promise<void>;
    },
    undefined
  >
) {
  const [checkText, setCheckText] = createSignal("");

  async function attemptDeleteData() {
    const deleteAction = timActionDelete(
      t3({
        en: "Are you very sure you want to delete all ICEH data?",
        fr: "Êtes-vous sûr de vouloir supprimer toutes les données ICEH ?",
      }),
      () => serverActions.deleteDatasetIcehData({}),
      async () => {
        await p.silentFetch();
        p.close(undefined);
      }
    );

    await deleteAction.click();
  }

  const canDelete = () => checkText() === "yes please delete";

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">{t3(TC.delete)}</div>
        </div>
      }
    >
      <div class="ui-pad ui-spy h-full w-full">
        <div class="">
          {t3({ en: "If you want to delete", fr: "Pour supprimer" })}{" "}
          {t3({ en: "all the ICEH data", fr: "toutes les données ICEH" })},{" "}
          {t3({ en: "write", fr: "écrivez" })}{" "}
          <span class="font-700">yes please delete</span>{" "}
          {t3({ en: "in the input box", fr: "dans le champ de saisie" })}
        </div>
        <div class="w-96">
          <Input value={checkText()} onChange={setCheckText} />
        </div>
        <div class="">
          <Button
            intent="danger"
            iconName="trash"
            disabled={!canDelete()}
            onClick={attemptDeleteData}
          >
            {t3(TC.delete)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
