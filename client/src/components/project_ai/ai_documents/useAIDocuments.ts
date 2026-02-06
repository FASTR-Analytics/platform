import { createSignal, onMount } from "solid-js";
import { openComponent } from "panther";
import {
  getDocumentsForProject,
  removeDocumentFromProject,
  type ProjectDocument,
} from "~/state/ai_documents";
import { AIDocumentSelectorModal } from "./AIDocumentSelectorModal";

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
