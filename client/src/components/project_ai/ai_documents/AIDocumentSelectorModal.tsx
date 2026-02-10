import { t3, type AssetInfo } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Loading,
  MultiSelect,
  timActionForm,
} from "panther";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { uploadAssetToAnthropic } from "~/server_actions/ai_files";
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
  const [assets, setAssets] = createSignal<AssetInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [selectedFiles, setSelectedFiles] = createSignal<string[]>([]);
  const [existingDocs, setExistingDocs] = createSignal<ProjectDocument[]>(
    []
  );

  const pdfAssets = () =>
    assets().filter((a) => a.fileName.toLowerCase().endsWith(".pdf"));

  const pdfOptions = createMemo(() =>
    pdfAssets().map((asset) => ({
      value: asset.fileName,
      label: asset.fileName,
    }))
  );

  onMount(async () => {
    const [assetsRes, existing] = await Promise.all([
      serverActions.getAssets({}),
      getDocumentsForProject(p.projectId),
    ]);

    if (assetsRes.success) {
      setAssets(assetsRes.data);
    }
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
