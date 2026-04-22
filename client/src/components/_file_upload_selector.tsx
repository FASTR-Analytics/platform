import type Uppy from "@uppy/core";
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AssetInfo } from "lib";
import { t3 } from "lib";
import { Button, Select, getSelectOptions } from "panther";
import { cleanupUppy, createUppyInstance } from "~/components/_uppy_file_upload";
import { instanceState } from "~/state/instance/t1_store";

let idCounter = 0;

type Props = {
  buttonLabel: string;
  selectLabel: string;
  filter: (asset: AssetInfo) => boolean;
  value: string;
  onChange: (fileName: string) => void;
};

export function FileUploadSelector(p: Props) {
  const triggerId = `file-upload-trigger-${++idCounter}`;
  const [waitingForAsset, setWaitingForAsset] = createSignal<string | null>(null);

  let uppy: Uppy | undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: `#${triggerId}`,
      onUploadSuccess: (file) => {
        if (file) {
          const fileName = file.name as string;
          // Check if file already exists (re-upload case)
          const alreadyExists = instanceState.assets
            .filter(p.filter)
            .some((a) => a.fileName === fileName);
          if (alreadyExists) {
            // File exists, select immediately
            p.onChange(fileName);
          } else {
            // New file, wait for SSE to add it to assets
            setWaitingForAsset(fileName);
          }
        }
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  // Watch for the uploaded file to appear in assets
  // Track filtered asset names as a joined string to detect any changes
  createEffect(() => {
    const pending = waitingForAsset();
    const _trackAssets = instanceState.assets
      .filter(p.filter)
      .map((a) => a.fileName)
      .join("|");

    if (!pending) return;

    const exists = instanceState.assets.filter(p.filter).some((a) => a.fileName === pending);
    if (exists) {
      p.onChange(pending);
      setWaitingForAsset(null);
    }
  });

  const options = createMemo(() =>
    getSelectOptions(instanceState.assets.filter(p.filter).map((a) => a.fileName)),
  );

  return (
    <>
      <div>
        <Button id={triggerId} iconName="upload">
          {p.buttonLabel}
        </Button>
      </div>
      <Show
        when={!waitingForAsset()}
        fallback={
          <div class="text-neutral py-2 text-sm">
            {t3({ en: "Processing upload...", fr: "Traitement du téléversement..." })}
          </div>
        }
      >
        <div class="w-96">
          <Select
            label={p.selectLabel}
            options={options()}
            value={p.value}
            onChange={p.onChange}
            fullWidth
          />
        </div>
      </Show>
    </>
  );
}
