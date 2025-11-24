// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildNavigation } from "./build_navigation.ts";
import { scanDirectory } from "./scan_directory.ts";
import type { DocsManifest, GenerateDocsManifestOptions } from "./types.ts";

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
