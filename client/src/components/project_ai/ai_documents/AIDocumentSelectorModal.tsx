import { t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Loading,
  MultiSelect,
  timActionForm,
} from "panther";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { _SERVER_HOST } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  addDocumentToProject,
  getDocumentsForProject,
  removeDocumentFromProject,
  type ProjectDocument,
} from "~/state/ai_documents";

type Props = {
  projectId: string;
};

type ReturnType = ProjectDocument[] | undefined;

export function AIDocumentSelectorModal(
  p: AlertComponentProps<Props, ReturnType>
) {
  const [isLoading, setIsLoading] = createSignal(true);
  const [selectedFiles, setSelectedFiles] = createSignal<string[]>([]);
  const [existingDocs, setExistingDocs] = createSignal<ProjectDocument[]>(
    []
  );

  const pdfAssets = () =>
    instanceState.assets.filter((a) => a.fileName.toLowerCase().endsWith(".pdf"));

  const pdfOptions = createMemo(() =>
    pdfAssets().map((asset) => ({
      value: asset.fileName,
      label: asset.fileName,
    }))
  );

  onMount(async () => {
    const existing = await getDocumentsForProject(p.projectId);

    setExistingDocs(existing);

    const alreadySelected = existing.map((d) => d.assetFilename);
    setSelectedFiles(alreadySelected);

    setIsLoading(false);
  });

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const selected = selectedFiles();
      const existing = existingDocs();
      const existingFilenames = existing.map((d) => d.assetFilename);

      const toAdd = selected.filter((f) => !existingFilenames.includes(f));
      const toRemove = existingFilenames.filter((f) => !selected.includes(f));

      for (const filename of toRemove) {
        await removeDocumentFromProject(p.projectId, filename);
      }

      for (const filename of toAdd) {
        const result = await uploadAssetToAnthropic(p.projectId, filename);
        if (!result.success) {
          return { success: false as const, err: result.error };
        }
        await addDocumentToProject(p.projectId, {
          assetFilename: filename,
          anthropicFileId: result.file_id,
        });
      }

      const finalDocs = await getDocumentsForProject(p.projectId);
      return { success: true as const, data: finalDocs };
    },
    (data) => {
      p.close(data);
    }
  );

  return (
    <AlertFormHolder
      formId="ai-document-selector"
      header={t3({ en: "Include PDF documents for the AI to consider", fr: "Inclure des documents PDF pour l'IA" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      saveButtonText={t3({ en: "Include selected", fr: "Inclure la sélection" })}
    >
      <Show when={isLoading()}>
        <div class="flex justify-center py-4">
          <Loading msg={t3({ en: "Loading assets...", fr: "Chargement des ressources..." })} noPad />
        </div>
      </Show>

      <Show when={!isLoading()}>
        <Show
          when={pdfAssets().length > 0}
          fallback={
            <div class="py-4 text-center text-base-content/60">
              {t3({ en: "No PDF files found in assets.", fr: "Aucun fichier PDF trouvé dans les ressources." })}
              <br />
              {t3({ en: "Upload PDFs to the assets folder first.", fr: "Téléversez d'abord des PDF dans le dossier des ressources." })}
            </div>
          }
        >
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
      </Show>
    </AlertFormHolder>
  );
}

async function uploadAssetToAnthropic(
  projectId: string,
  assetFilename: string,
): Promise<{ success: true; file_id: string } | { success: false; error: string }> {
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

