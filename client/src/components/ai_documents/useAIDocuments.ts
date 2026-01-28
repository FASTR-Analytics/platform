import { createSignal, onMount } from "solid-js";
import { openComponent } from "panther";
import {
  getDocumentsForConversation,
  removeDocumentFromConversation,
  type ConversationDocument,
} from "~/state/ai_documents";
import { AIDocumentSelectorModal } from "./AIDocumentSelectorModal";

type UseAIDocumentsOptions = {
  projectId: string;
  conversationId: string;
};

export function useAIDocuments(options: UseAIDocumentsOptions) {
  const [documents, setDocuments] = createSignal<ConversationDocument[]>([]);

  async function loadDocuments() {
    const docs = await getDocumentsForConversation(options.conversationId);
    setDocuments(docs);
  }

  onMount(loadDocuments);

  async function openSelector() {
    const result = await openComponent<
      { projectId: string; conversationId: string },
      ConversationDocument[] | undefined
    >({
      element: AIDocumentSelectorModal,
      props: {
        projectId: options.projectId,
        conversationId: options.conversationId,
      },
    });

    if (result) {
      setDocuments(result);
    }
  }

  async function removeDocument(assetFilename: string) {
    await removeDocumentFromConversation(options.conversationId, assetFilename);
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
