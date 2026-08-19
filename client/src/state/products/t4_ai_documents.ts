import { get, set, del } from "idb-keyval";

export type ProjectDocument = {
  assetFilename: string;
  anthropicFileId: string;
};

type ProjectDocumentsData = {
  documents: ProjectDocument[];
  lastUpdated: string;
};

function getKey(projectId: string): string {
  return `ai-documents/${projectId}`;
}

export async function getDocumentsForProject(
  projectId: string
): Promise<ProjectDocument[]> {
  const data = await get<ProjectDocumentsData>(getKey(projectId));
  return data?.documents ?? [];
}

export async function setDocumentsForProject(
  projectId: string,
  documents: ProjectDocument[]
): Promise<void> {
  await set(getKey(projectId), {
    documents,
    lastUpdated: new Date().toISOString(),
  } satisfies ProjectDocumentsData);
}

export async function clearDocumentsForProject(
  projectId: string
): Promise<void> {
  await del(getKey(projectId));
}

export async function addDocumentToProject(
  projectId: string,
  document: ProjectDocument
): Promise<void> {
  const existing = await getDocumentsForProject(projectId);
  const alreadyExists = existing.some(
    (d) => d.assetFilename === document.assetFilename
  );
  if (!alreadyExists) {
    await setDocumentsForProject(projectId, [...existing, document]);
  }
}

export async function removeDocumentFromProject(
  projectId: string,
  assetFilename: string
): Promise<void> {
  const existing = await getDocumentsForProject(projectId);
  const filtered = existing.filter((d) => d.assetFilename !== assetFilename);
  await setDocumentsForProject(projectId, filtered);
}
