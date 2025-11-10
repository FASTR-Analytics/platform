import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t, t2, T } from "lib";
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
    silentRefreshIndicators: () => Promise<void>;
  },
  undefined
>;

export function BatchUploadForm(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [replaceAllExisting, setReplaceAllExisting] =
    createSignal<boolean>(false);

  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t2(T.FRENCH_UI_STRINGS.loading_asset_files),
  );

  function updateSelectedFileName(fileName: string) {
    setSelectedFileName(fileName);
  }

  const handleBatchUpload = timActionForm(
    async () => {
      const assetFileName = selectedFileName();

      if (!assetFileName) {
        return { success: false, err: t("You must select a CSV file") };
      }

      return serverActions.batchUploadIndicators({
        asset_file_name: assetFileName,
        replace_all_existing: replaceAllExisting(),
      });
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
          heading={t("Batch import indicators")}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <div class="text-sm">
          {t("Upload a CSV file with the following headers:")}
          <span class="font-700 ml-3 font-mono">
            indicator_common_id, indicator_common_label,
            mapped_raw_indicator_ids
          </span>
        </div>

        <div class="">
          <Button id="select-csv-file-button" iconName="upload">
            {t("Upload new CSV file")}
          </Button>
        </div>

        <div class="w-96">
          <StateHolderWrapper state={assetListing.state()} noPad>
            {(keyedAssets) => {
              return (
                <Select
                  label={t("Or select existing CSV file")}
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
            label={t("Replace all existing indicators and mappings")}
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
            {t("Process CSV")}
          </Button>
          <Button onClick={() => p.close(undefined)} intent="neutral">
            {t2(T.FRENCH_UI_STRINGS.cancel)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
