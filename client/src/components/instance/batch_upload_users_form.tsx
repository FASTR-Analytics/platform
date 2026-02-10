import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import {
  Button,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  getSelectOptions,
  timActionForm,
  timQuery,
  type EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  Checkbox,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/upload/uppy_file_upload";

type Props = EditorComponentProps<
  {
    silentRefreshUsers: () => Promise<void>;
  },
  undefined
>;

export function BatchUploadUsersForm(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [replaceAllExisting, setReplaceAllExisting] =
    createSignal<boolean>(false);

  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t3(TC.loadingAssets),
  );

  function updateSelectedFileName(fileName: string) {
    setSelectedFileName(fileName);
  }

  const handleBatchUpload = timActionForm(
    async () => {
      const assetFileName = selectedFileName();

      if (!assetFileName) {
        return { success: false, err: t3({ en: "You must select a CSV file", fr: "Vous devez sélectionner un fichier CSV" }) };
      }

      return serverActions.batchUploadUsers({
        asset_file_name: assetFileName,
        replace_all_existing: replaceAllExisting(),
      });
    },
    async () => {
      await p.silentRefreshUsers();
      p.close(undefined);
    },
  );

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-csv-file-button",
      onModalClosed: () => {
        assetListing.fetch();
      },
      onUploadSuccess: (file) => {
        if (!file) {
          return;
        }
        updateSelectedFileName(file.name as string);
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({ en: "Batch import users", fr: "Importation groupée d'utilisateurs" })}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <div class="text-sm">
          {t3({ en: "Upload a CSV file with the following headers:", fr: "Téléversez un fichier CSV avec les en-têtes suivants :" })}
          <span class="font-700 ml-3 font-mono">email, is_global_admin</span>
        </div>

        <div class="text-sm text-gray-600">
          {t3({ en: "Example:", fr: "Exemple :" })} <span class="font-mono">user@example.com,false</span>
        </div>

        <div class="">
          <Button id="select-csv-file-button" iconName="upload">
            {t3({ en: "Upload new CSV file", fr: "Téléverser un nouveau fichier CSV" })}
          </Button>
        </div>

        <div class="w-96">
          <StateHolderWrapper state={assetListing.state()} noPad>
            {(keyedAssets) => {
              return (
                <Select
                  label={t3({ en: "Or select existing CSV file", fr: "Ou sélectionner un fichier CSV existant" })}
                  options={getSelectOptions(
                    keyedAssets.filter((a) => a.isCsv).map((a) => a.fileName),
                  )}
                  value={selectedFileName()}
                  onChange={updateSelectedFileName}
                  fullWidth
                />
              );
            }}
          </StateHolderWrapper>
        </div>

        <div class="">
          <Checkbox
            label={t3({ en: "Replace all existing users (DANGEROUS)", fr: "Remplacer tous les utilisateurs existants (DANGEREUX)" })}
            checked={replaceAllExisting()}
            onChange={setReplaceAllExisting}
          />
        </div>

        <StateHolderFormError state={handleBatchUpload.state()} />

        <div class="ui-gap-sm flex">
          <Button
            onClick={handleBatchUpload.click}
            intent="primary"
            state={handleBatchUpload.state()}
            disabled={!selectedFileName()}
            iconName="upload"
          >
            {t3({ en: "Process CSV", fr: "Traiter le CSV" })}
          </Button>
          <Button onClick={() => p.close(undefined)} intent="neutral">
            {t3(TC.cancel)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
