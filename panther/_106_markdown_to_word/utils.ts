// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Document } from "./deps.ts";
import { Packer } from "./deps.ts";

/**
 * Converts a Word document to a Blob for browser download
 *
 * @param document - The Word document to convert
 * @returns Promise resolving to a Blob containing the Word document
 *
 * @example
 * ```ts
 * const wordDocument = convertMarkdownToWordDocument(markdownText);
 * const blob = await wordDocumentToBlob(wordDocument);
 * saveAs(blob, "document.docx");
 * ```
 */
export async function wordDocumentToBlob(document: Document): Promise<Blob> {
  return await Packer.toBlob(document);
}
