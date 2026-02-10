import { DatasetHfaVersion, t, t2, T } from "lib";
import { Button, EditorComponentProps, ModalContainer, toNum0 } from "panther";
import { Show } from "solid-js";

export function ImportInformation(
  p: EditorComponentProps<
    {
      version: DatasetHfaVersion;
      isCurrentVersion: boolean;
      isGlobalAdmin: boolean;
    },
    undefined
  >,
) {
  return (
    <ModalContainer
      title={t2(T.FRENCH_UI_STRINGS.import_information)}
      width="md"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t2(T.FRENCH_UI_STRINGS.done)}
          </Button>,
        ]
      }
    >
      <div class="ui-spy-sm text-sm">
        <Show when={p.version.stagingResult}>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Import source")}</div>
            <div class="flex-1">CSV Import</div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t2(T.FRENCH_UI_STRINGS.date_imported)}</div>
            <div class="flex-1">
              {new Date(p.version.stagingResult!.dateImported).toLocaleString()}
            </div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("File name")}</div>
            <div class="flex-1">{p.version.stagingResult!.assetFileName}</div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Rows inserted")}</div>
            <div class="flex-1">{toNum0(p.version.nRowsInserted ?? 0)}</div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Rows updated")}</div>
            <div class="flex-1">{toNum0(p.version.nRowsUpdated ?? 0)}</div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Total rows imported")}</div>
            <div class="flex-1">{toNum0(p.version.nRowsTotalImported)}</div>
          </div>
        </Show>
      </div>
      {/* <Show when={p.isCurrentVersion && p.isGlobalAdmin}>
        <Button
          onClick={() => p.close("DELETE_THIS_IMPORT")}
          intent="danger"
          outline
          iconName="trash"
        >
          {t2(T.FRENCH_UI_STRINGS.delete_this_import)}
        </Button>
      </Show> */}
    </ModalContainer>
  );
}
