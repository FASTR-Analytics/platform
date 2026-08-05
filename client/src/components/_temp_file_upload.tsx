import type Uppy from "@uppy/core";
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { t3 } from "lib";
import { Button } from "panther";
import {
  cleanupUppy,
  createUppyInstance,
} from "~/components/_uppy_file_upload";

let idCounter = 0;

export type TempUpload = { token: string; fileName: string };

type Props = {
  buttonLabel: string;
  value: TempUpload | undefined;
  onUploaded: (upload: TempUpload) => void;
  allowedFileTypes?: string[];
};

// Wizard-temp upload (PLAN_DHIS2_IMPORTER_CONSOLIDATION A3): the file goes
// through the TUS front door in wizard-temp mode — token-keyed, no asset row,
// no SSE wait. The token is generated client-side per file and travels in the
// TUS metadata; it is the launch payload's reference to the file.
export function TempFileUpload(p: Props) {
  const triggerId = `temp-file-upload-trigger-${++idCounter}`;
  const [uploading, setUploading] = createSignal<boolean>(false);

  let uppy: Uppy | undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: `#${triggerId}`,
      allowedFileTypes: p.allowedFileTypes,
      onUploadSuccess: (file) => {
        setUploading(false);
        if (file) {
          const token = (file.meta as Record<string, string>).uploadToken;
          if (token) {
            p.onUploaded({ token, fileName: file.name as string });
          }
        }
      },
      onUploadError: () => {
        setUploading(false);
      },
    });
    uppy.on("file-added", (file) => {
      setUploading(true);
      uppy?.setFileMeta(file.id, {
        wizardTemp: "true",
        uploadToken: crypto.randomUUID(),
      });
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  return (
    <div class="ui-spy-sm">
      <div>
        <Button id={triggerId} iconName="upload">
          {p.buttonLabel}
        </Button>
      </div>
      <Show when={uploading()}>
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "Uploading...",
            fr: "Téléversement...",
            pt: "A carregar...",
          })}
        </div>
      </Show>
      <Show when={p.value} keyed>
        {(upload) => (
          <div class="text-sm">
            {t3({ en: "Selected file:", fr: "Fichier sélectionné :", pt: "Ficheiro selecionado:" })}{" "}
            <span class="font-mono">{upload.fileName}</span>
          </div>
        )}
      </Show>
    </div>
  );
}
