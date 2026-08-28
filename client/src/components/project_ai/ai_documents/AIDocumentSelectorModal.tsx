import { t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  MultiSelect,
  createFormAction,
} from "panther";
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type Uppy from "@uppy/core";
import { cleanupUppy, createUppyInstance } from "~/components/_uppy_file_upload";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { instanceState, updateInstanceAssets } from "~/state/instance/t1_store";
import {
  addUploadToProject,
  getUploadsForProject,
  setPendingAttachments,
} from "~/state/project/t4_ai_documents";

type Props = {
  projectId: string;
  conversationId: string;
  sentFilenames: string[];
  pendingFilenames: string[];
};

type ReturnType = string[] | undefined;

export function AIDocumentSelectorModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const [selectedFiles, setSelectedFiles] = createSignal<string[]>([
    ...new Set([...p.sentFilenames, ...p.pendingFilenames]),
  ]);

  let uppy: Uppy | undefined;

  const pdfAssets = () =>
    instanceState.assets.filter((a) =>
      a.fileName.toLowerCase().endsWith(".pdf"),
    );

  // Include sent/pending filenames whose asset no longer exists — a selected
  // value absent from the options is silently dropped by MultiSelect's next
  // onChange round-trip.
  const pdfOptions = createMemo(() => {
    const assetNames = pdfAssets().map((a) => a.fileName);
    const extras = [...new Set([...p.sentFilenames, ...p.pendingFilenames])]
      .filter((f) => !assetNames.includes(f));
    return [...assetNames, ...extras].map((fileName) => ({
      value: fileName,
      label: fileName,
    }));
  });

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#upload-pdf-button",
      maxNumberOfFiles: 5,
      allowedFileTypes: [".pdf"],
      onUploadSuccess: (file) => {
        const fileName = file?.name;
        if (!fileName) return;
        setSelectedFiles((prev) => [...new Set([...prev, fileName])]);
      },
      onComplete: () => {
        serverActions.getAssets({}).then((res) => {
          if (res.success) updateInstanceAssets(res.data);
        });
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      // Sent docs cannot be un-sent — membership is save-invariant, so a
      // deselected sent doc is simply ignored.
      const newPending = selectedFiles().filter(
        (f) => !p.sentFilenames.includes(f),
      );

      const registry = await getUploadsForProject(p.projectId);
      for (const filename of newPending) {
        if (registry.some((u) => u.assetFilename === filename)) continue;
        const result = await uploadAssetToAnthropic(p.projectId, filename);
        if (!result.success) {
          return { success: false as const, err: result.error };
        }
        await addUploadToProject(p.projectId, {
          assetFilename: filename,
          anthropicFileId: result.file_id,
        });
      }

      await setPendingAttachments(p.projectId, p.conversationId, newPending);
      return { success: true as const, data: newPending };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="ai-document-selector"
      header={t3({
        en: "Include PDF documents for the AI to consider",
        fr: "Inclure des documents PDF pour l'IA",
        pt: "Incluir documentos PDF para a IA considerar",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      saveButtonText={t3({
        en: "Include selected",
        fr: "Inclure la sélection",
        pt: "Incluir selecionados",
      })}
    >
      <div class="mb-3 flex items-center gap-3">
        <Button id="upload-pdf-button" size="sm" outline type="button">
          {t3({
            en: "Upload PDF from device",
            fr: "Importer un PDF depuis l'appareil",
            pt: "Carregar PDF do dispositivo",
          })}
        </Button>
        <span class="text-base-content-muted">
          {t3({
            en: "OR",
            fr: "OU",
            pt: "OU",
          })}
        </span>
      </div>

      <Show
        when={pdfOptions().length > 0}
        fallback={
          <div class="text-base-content-muted py-4 text-center">
            {t3({
              en: "No PDF files found in assets.",
              fr: "Aucun fichier PDF trouvé dans les ressources.",
              pt: "Nenhum ficheiro PDF encontrado nos recursos.",
            })}
            <br />
            {t3({
              en: "Use the button above to upload a PDF.",
              fr: "Utilisez le bouton ci-dessus pour importer un PDF.",
              pt: "Utilize o botão acima para carregar um PDF.",
            })}
          </div>
        }
      >
        <div class="mb-2 font-700">
          {t3({
            en: "Select from uploaded assets",
            fr: "Sélectionner parmi les ressources importées",
            pt: "Selecionar a partir dos recursos carregados",
          })}
        </div>
        <div class="max-h-[400px] overflow-y-auto">
          <MultiSelect
            values={selectedFiles()}
            options={pdfOptions()}
            onChange={setSelectedFiles}
            showSelectAll
            onlyShowSelectAllWhenAtLeast={5}
          />
        </div>
      </Show>
    </AlertFormHolder>
  );
}

async function uploadAssetToAnthropic(
  projectId: string,
  assetFilename: string,
): Promise<
  { success: true; file_id: string } | { success: false; error: string }
> {
  try {
    const response = await fetch(`${_SERVER_HOST}/ai/files`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Project-Id": projectId,
      },
      body: JSON.stringify({ assetFilename }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData?.error?.message ?? `Upload failed: ${response.status}`,
      };
    }
    const data = await response.json();
    return { success: true, file_id: data.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
