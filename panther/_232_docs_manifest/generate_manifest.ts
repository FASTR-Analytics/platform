// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildNavigation } from "./deps.ts";
import type { DocsManifest } from "./deps.ts";
import { scanDirectory } from "./scan_directory.ts";
import type { GenerateDocsManifestOptions } from "./types.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export async function generateDocsManifest(
  options: GenerateDocsManifestOptions,
): Promise<DocsManifest> {
  const pages = await scanDirectory(
    options.inputDir,
    options.excludeFromManifest ?? [],
  );
  const { rootItems, sections } = buildNavigation(
    pages,
    options.preferSentenceCase ?? false,
  );

  return {
    title: options.title ?? "Documentation",
    pages: pages,
    rootItems: rootItems,
    navigation: sections,
  };
}
