import { get, set, del } from "idb-keyval";

// Anthropic file ids for documents the user has attached to the copilot, held
// per browser. ONE conversation scope: the copilot is a single instance-level
// mount (§2.6), so there is nothing left to key these by — the old
// `ai-documents/<projectId>` residue in a returning user's IndexedDB is
// accepted and never migrated (D8).
const _KEY = "ai-documents/copilot";

export type CopilotDocument = {
  assetFilename: string;
  anthropicFileId: string;
};

type CopilotDocumentsData = {
  documents: CopilotDocument[];
  lastUpdated: string;
};

export async function getCopilotDocuments(): Promise<CopilotDocument[]> {
  const data = await get<CopilotDocumentsData>(_KEY);
  return data?.documents ?? [];
}

export async function setCopilotDocuments(
  documents: CopilotDocument[],
): Promise<void> {
  await set(_KEY, {
    documents,
    lastUpdated: new Date().toISOString(),
  } satisfies CopilotDocumentsData);
}

export async function clearCopilotDocuments(): Promise<void> {
  await del(_KEY);
}

export async function addCopilotDocument(
  document: CopilotDocument,
): Promise<void> {
  const existing = await getCopilotDocuments();
  const alreadyExists = existing.some(
    (d) => d.assetFilename === document.assetFilename,
  );
  if (!alreadyExists) {
    await setCopilotDocuments([...existing, document]);
  }
}

export async function removeCopilotDocument(
  assetFilename: string,
): Promise<void> {
  const existing = await getCopilotDocuments();
  await setCopilotDocuments(
    existing.filter((d) => d.assetFilename !== assetFilename),
  );
}
