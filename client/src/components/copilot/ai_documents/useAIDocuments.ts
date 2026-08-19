import { createSignal, onMount } from "solid-js";
import { openComponent } from "panther";
import {
  getDocumentsForProject,
  removeDocumentFromProject,
  type ProjectDocument,
} from "~/state/project/t4_ai_documents";
import { _SERVER_HOST } from "~/server_actions";
import { AIDocumentSelectorModal } from "./AIDocumentSelectorModal";

// Best-effort delete of the uploaded file from the Anthropic Files workspace.
// Each browser uploads its own copy (its own file_id), so deleting on remove
// frees the orphan without affecting any other browser's reference. Failures
// are swallowed — the local removal below must still proceed.
async function deleteAnthropicFile(projectId: string, fileId: string) {
  try {
    await fetch(`${_SERVER_HOST}/ai/files/${fileId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Project-Id": projectId },
    });
  } catch {
    // ignore — orphan cleanup is not critical
  }
}

type UseAIDocumentsOptions = {
  projectId: string;
};

export function useAIDocuments(options: UseAIDocumentsOptions) {
  const [documents, setDocuments] = createSignal<ProjectDocument[]>([]);

  async function loadDocuments() {
    const docs = await getDocumentsForProject(options.projectId);
    setDocuments(docs);
  }

  onMount(loadDocuments);

  async function openSelector() {
    const result = await openComponent<
      { projectId: string },
      ProjectDocument[] | undefined
    >({
      element: AIDocumentSelectorModal,
      props: {
        projectId: options.projectId,
      },
    });

    if (result) {
      setDocuments(result);
    }
  }

  async function removeDocument(assetFilename: string) {
    const doc = documents().find((d) => d.assetFilename === assetFilename);
    if (doc) {
      await deleteAnthropicFile(options.projectId, doc.anthropicFileId);
    }
    await removeDocumentFromProject(options.projectId, assetFilename);
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
