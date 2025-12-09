// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Document } from "./deps.ts";
import { Packer } from "./deps.ts";

export async function wordDocumentToBlob(document: Document): Promise<Blob> {
  return await Packer.toBlob(document);
}
