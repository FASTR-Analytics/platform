import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t, t2, T, type CsvDetails } from "lib";
import { serverActions } from "~/server_actions";
import {
  Button,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  getSelectOptions,
  timActionForm,
  timQuery,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/upload/uppy_file_upload";

type Props = {
  step1Result: CsvDetails | undefined;
  silentFetch: () => Promise<void>;
};

export function Step1(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>(
    p.step1Result?.fileName ?? "",
  );
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step1Result);

  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t2(T.FRENCH_UI_STRINGS.loading_asset_files),
  );

  function updateSelectedFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedFileName(fileName);
  }

  const save = timActionForm(async () => {
    const assetFileName = selectedFileName();
    if (!assetFileName) {
      return { success: false, err: t("You must select a file") };
    }
    return serverActions.uploadDatasetHfaCsv({
      assetFileName,
    });
  }, p.silentFetch);

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
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
    <div class="ui-pad ui-spy">
      <div class="">
        <Button id="select-file-button" iconName="upload">
          {t2(T.FRENCH_UI_STRINGS.upload_new_csv_file_to_use)}
        </Button>
      </div>
      <div class="w-96">
        <StateHolderWrapper state={assetListing.state()} noPad>
          {(keyedAssets) => {
            return (
              <Select
                label={t2(T.FRENCH_UI_STRINGS.existing_csv_file_to_use)}
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
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving() || !selectedFileName()}
          iconName="save"
        >
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
      </div>
    </div>
  );
}
