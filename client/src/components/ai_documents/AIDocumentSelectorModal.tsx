import type { AssetInfo } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  Loading,
  timActionForm,
} from "panther";
import { createSignal, For, onMount, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { uploadAssetToAnthropic } from "~/server_actions/ai_files";
import {
  addDocumentToConversation,
  getDocumentsForConversation,
  type ConversationDocument,
} from "~/state/ai_documents";

type Props = {
  projectId: string;
  conversationId: string;
};

type ReturnType = ConversationDocument[] | undefined;

export function AIDocumentSelectorModal(
  p: AlertComponentProps<Props, ReturnType>
) {
  const [assets, setAssets] = createSignal<AssetInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [selectedFiles, setSelectedFiles] = createSignal<Set<string>>(
    new Set()
  );
  const [existingDocs, setExistingDocs] = createSignal<ConversationDocument[]>(
    []
  );

  const pdfAssets = () =>
    assets().filter((a) => a.fileName.toLowerCase().endsWith(".pdf"));

  onMount(async () => {
    const [assetsRes, existing] = await Promise.all([
      serverActions.getAssets({}),
      getDocumentsForConversation(p.conversationId),
    ]);

    if (assetsRes.success) {
      setAssets(assetsRes.data);
    }
    setExistingDocs(existing);

    const alreadySelected = new Set(existing.map((d) => d.assetFilename));
    setSelectedFiles(alreadySelected);

    setIsLoading(false);
  });

  function toggleFile(fileName: string) {
    const current = selectedFiles();
    const next = new Set(current);
    if (next.has(fileName)) {
      next.delete(fileName);
    } else {
      next.add(fileName);
    }
    setSelectedFiles(next);
  }

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const selected = selectedFiles();
      const existing = existingDocs();
      const existingFilenames = new Set(existing.map((d) => d.assetFilename));

      const toAdd = [...selected].filter((f) => !existingFilenames.has(f));

      for (const filename of toAdd) {
        const result = await uploadAssetToAnthropic(p.projectId, filename);
        if (!result.success) {
          return { success: false as const, err: result.error };
        }
        await addDocumentToConversation(p.conversationId, {
          assetFilename: filename,
          anthropicFileId: result.file_id,
        });
      }

      const finalDocs = await getDocumentsForConversation(p.conversationId);
      return { success: true as const, data: finalDocs };
    },
    (data) => {
      p.close(data);
    }
  );

  return (
    <AlertFormHolder
      formId="ai-document-selector"
      header="Include PDF Documents"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      saveButtonText="Include Selected"
    >
      <Show when={isLoading()}>
        <div class="flex justify-center py-4">
          <Loading msg="Loading assets..." noPad />
        </div>
      </Show>

      <Show when={!isLoading()}>
        <Show
          when={pdfAssets().length > 0}
          fallback={
            <div class="py-4 text-center text-base-content/60">
              No PDF files found in assets.
              <br />
              Upload PDFs to the assets folder first.
            </div>
          }
        >
          <div class="space-y-2 max-h-[400px] overflow-y-auto">
            <For each={pdfAssets()}>
              {(asset) => (
                <div class="p-2 rounded hover:bg-base-200">
                  <Checkbox
                    checked={selectedFiles().has(asset.fileName)}
                    onChange={() => toggleFile(asset.fileName)}
                    label={
                      <div class="flex-1 min-w-0">
                        <div class="truncate font-medium">{asset.fileName}</div>
                        <div class="text-xs text-base-content/60">
                          {formatFileSize(asset.size)}
                        </div>
                      </div>
                    }
                  />
                </div>
              )}
            </For>
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
