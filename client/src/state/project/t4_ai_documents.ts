import { get, set } from "idb-keyval";

export type UploadedDocument = {
  assetFilename: string;
  anthropicFileId: string;
};

function uploadsKey(projectId: string): string {
  return `ai-uploads/${projectId}`;
}

function pendingKey(projectId: string, conversationId: string): string {
  return `ai-attachments/${projectId}/${conversationId}`;
}

export async function getUploadsForProject(
  projectId: string,
): Promise<UploadedDocument[]> {
  return (await get<UploadedDocument[]>(uploadsKey(projectId))) ?? [];
}

export async function addUploadToProject(
  projectId: string,
  upload: UploadedDocument,
): Promise<void> {
  const existing = await getUploadsForProject(projectId);
  if (existing.some((u) => u.assetFilename === upload.assetFilename)) {
    return;
  }
  await set(uploadsKey(projectId), [...existing, upload]);
}

export async function getPendingAttachments(
  projectId: string,
  conversationId: string,
): Promise<string[]> {
  return (await get<string[]>(pendingKey(projectId, conversationId))) ?? [];
}

export async function setPendingAttachments(
  projectId: string,
  conversationId: string,
  assetFilenames: string[],
): Promise<void> {
  await set(pendingKey(projectId, conversationId), assetFilenames);
}
