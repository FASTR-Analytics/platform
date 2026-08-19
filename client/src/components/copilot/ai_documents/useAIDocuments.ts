import { createSignal, onMount } from "solid-js";
import { openComponent } from "panther";
import {
  getCopilotDocuments,
  removeCopilotDocument,
  type CopilotDocument,
} from "~/state/products/t4_ai_documents";
import { _SERVER_HOST } from "~/server_actions";
import { AIDocumentSelectorModal } from "./AIDocumentSelectorModal";

// Best-effort delete of the uploaded file from the Anthropic Files workspace.
// Each browser uploads its own copy (its own file_id), so deleting on remove
// frees the orphan without affecting any other browser's reference. Failures
// are swallowed — the local removal below must still proceed.
async function deleteAnthropicFile(fileId: string) {
  try {
    await fetch(`${_SERVER_HOST}/ai/files/${fileId}`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // ignore — orphan cleanup is not critical
  }
}

export function useAIDocuments() {
  const [documents, setDocuments] = createSignal<CopilotDocument[]>([]);

  async function loadDocuments() {
    setDocuments(await getCopilotDocuments());
  }

  onMount(loadDocuments);

  async function openSelector() {
    const result = await openComponent<
      Record<string, never>,
      CopilotDocument[] | undefined
    >({
      element: AIDocumentSelectorModal,
      props: {},
    });

    if (result) {
      setDocuments(result);
    }
  }

  async function removeDocument(assetFilename: string) {
    const doc = documents().find((d) => d.assetFilename === assetFilename);
    if (doc) {
      await deleteAnthropicFile(doc.anthropicFileId);
    }
    await removeCopilotDocument(assetFilename);
    await loadDocuments();
  }

  function getDocumentRefs() {
    return documents().map((doc) => ({
      file_id: doc.anthropicFileId,
      title: doc.assetFilename,
    }));
  }

  return {
    documents,
    openSelector,
    removeDocument,
    getDocumentRefs,
    refreshDocuments: loadDocuments,
  };
}
