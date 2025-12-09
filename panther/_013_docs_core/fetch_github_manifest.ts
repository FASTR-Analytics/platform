// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DocsManifest,
  GitHubTreeResponse,
  ParsedGitHubUrl,
} from "./types.ts";
import { buildGitHubTreeApiUrl } from "./parse_github_url.ts";
import { buildPagesFromTree } from "./build_pages_from_tree.ts";
import { buildNavigation } from "./build_navigation.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export async function fetchGitHubManifest(
  parsed: ParsedGitHubUrl,
  title?: string,
): Promise<DocsManifest> {
  const treeUrl = buildGitHubTreeApiUrl(parsed);

  const response = await fetch(treeUrl, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub tree: ${response.status} ${response.statusText}`,
    );
  }

  const treeResponse: GitHubTreeResponse = await response.json();

  if (treeResponse.truncated) {
    console.warn(
      "GitHub tree response was truncated. Some files may be missing.",
    );
  }

  const pages = buildPagesFromTree(treeResponse.tree, parsed);
  const { rootItems, sections } = buildNavigation(pages);

  return {
    title: title ?? `${parsed.owner}/${parsed.repo}`,
    pages,
    rootItems,
    navigation: sections,
  };
}
