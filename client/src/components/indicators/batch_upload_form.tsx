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
  RadioGroup,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/upload/uppy_file_upload";

type Props = EditorComponentProps<
  {
    silentRefreshIndicators: () => Promise<void>;
  },
  undefined
>;

export function BatchUploadForm(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [replaceAllExisting, setReplaceAllExisting] =
    createSignal<boolean>(false);
  const [uploadType, setUploadType] = createSignal<"common" | "raw">("common");

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

      if (uploadType() === "common") {
        return serverActions.batchUploadIndicators({
          asset_file_name: assetFileName,
          replace_all_existing: replaceAllExisting(),
        });
      } else {
        return serverActions.batchUploadRawIndicators({
          asset_file_name: assetFileName,
          replace_all_existing: replaceAllExisting(),
        });
      }
    },
    async () => {
      await p.silentRefreshIndicators();
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
          heading={t3({ en: "Batch import indicators", fr: "Importation groupée d'indicateurs" })}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <RadioGroup
          label={t3({ en: "Indicator Type", fr: "Type d'indicateur" })}
          options={getSelectOptions(["common", "raw"])}
          value={uploadType()}
          onChange={(val) => setUploadType(val as "common" | "raw")}
        />

        <div class="text-sm">
          {uploadType() === "common" ? (
            <>
              {t3({ en: "Upload a CSV file with the following headers:", fr: "Téléversez un fichier CSV avec les en-têtes suivants :" })}
              <span class="font-700 ml-3 font-mono">
                indicator_common_id, indicator_common_label,
                mapped_raw_indicator_ids
              </span>
            </>
          ) : (
            <>
              {t3({ en: "Upload a CSV file with the following headers:", fr: "Téléversez un fichier CSV avec les en-têtes suivants :" })}
              <span class="font-700 ml-3 font-mono">
                raw_indicator_id, raw_indicator_label
              </span>
            </>
          )}
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
            label={t3({ en: "Replace all existing indicators and mappings", fr: "Remplacer tous les indicateurs et associations existants" })}
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
