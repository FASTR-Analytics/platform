import { get, set, del } from "idb-keyval";

export type ConversationDocument = {
  assetFilename: string;
  anthropicFileId: string;
};

type ConversationDocumentsData = {
  documents: ConversationDocument[];
  lastUpdated: string;
};

function getKey(conversationId: string): string {
  return `ai-documents/${conversationId}`;
}

export async function getDocumentsForConversation(
  conversationId: string
): Promise<ConversationDocument[]> {
  const data = await get<ConversationDocumentsData>(getKey(conversationId));
  return data?.documents ?? [];
}

export async function setDocumentsForConversation(
  conversationId: string,
  documents: ConversationDocument[]
): Promise<void> {
  await set(getKey(conversationId), {
    documents,
    lastUpdated: new Date().toISOString(),
  } satisfies ConversationDocumentsData);
}

export async function clearDocumentsForConversation(
  conversationId: string
): Promise<void> {
  await del(getKey(conversationId));
}

export async function addDocumentToConversation(
  conversationId: string,
  document: ConversationDocument
): Promise<void> {
  const existing = await getDocumentsForConversation(conversationId);
  const alreadyExists = existing.some(
    (d) => d.assetFilename === document.assetFilename
  );
  if (!alreadyExists) {
    await setDocumentsForConversation(conversationId, [...existing, document]);
  }
}

export async function removeDocumentFromConversation(
  conversationId: string,
  assetFilename: string
): Promise<void> {
  const existing = await getDocumentsForConversation(conversationId);
  const filtered = existing.filter((d) => d.assetFilename !== assetFilename);
  await setDocumentsForConversation(conversationId, filtered);
}
