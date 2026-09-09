import { get, set } from "idb-keyval";

// The copilot's PDF attachments (T4: per-browser IndexedDB, no server copy).
// Keyed by the ONE copilot conversation scope, not by a project: there is one
// mount and one scope, "copilot" (PLAN_PRODUCTS_RESTRUCTURE D15).
export type UploadedDocument = {
  assetFilename: string;
  anthropicFileId: string;
};

const UPLOADS_KEY = "ai-documents/copilot";

function pendingKey(conversationId: string): string {
  return `ai-attachments/copilot/${conversationId}`;
}

export async function getUploads(): Promise<UploadedDocument[]> {
  return (await get<UploadedDocument[]>(UPLOADS_KEY)) ?? [];
}

export async function addUpload(upload: UploadedDocument): Promise<void> {
  const existing = await getUploads();
  if (existing.some((u) => u.assetFilename === upload.assetFilename)) {
    return;
  }
  await set(UPLOADS_KEY, [...existing, upload]);
}

export async function getPendingAttachments(
  conversationId: string,
): Promise<string[]> {
  return (await get<string[]>(pendingKey(conversationId))) ?? [];
}

export async function setPendingAttachments(
  conversationId: string,
  assetFilenames: string[],
): Promise<void> {
  await set(pendingKey(conversationId), assetFilenames);
}
