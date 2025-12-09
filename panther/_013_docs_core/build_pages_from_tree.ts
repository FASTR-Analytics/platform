// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DocsPage, GitHubTreeEntry, ParsedGitHubUrl } from "./types.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export function buildPagesFromTree(
  tree: GitHubTreeEntry[],
  parsed: ParsedGitHubUrl,
): DocsPage[] {
  const pages: DocsPage[] = [];

  for (const entry of tree) {
    if (entry.type !== "blob") {
      continue;
    }

    if (!entry.path.endsWith(".md")) {
      continue;
    }

    if (
      parsed.docsPath && !entry.path.startsWith(parsed.docsPath + "/") &&
      entry.path !== parsed.docsPath
    ) {
      continue;
    }

    const relativePath = parsed.docsPath
      ? entry.path.slice(parsed.docsPath.length + 1)
      : entry.path;

    if (!relativePath) {
      continue;
    }

    const slug = pathToSlug(relativePath);
    const title = pathToTitle(relativePath);

    pages.push({
      slug,
      filePath: relativePath,
      title,
      frontmatter: {},
    });
  }

  return sortPages(pages);
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function pathToSlug(path: string): string {
  let slug = path;

  if (slug.endsWith(".md")) {
    slug = slug.slice(0, -3);
  }

  if (slug.endsWith("/README") || slug === "README") {
    slug = slug.replace(/\/?README$/, "");
  }
  if (slug.endsWith("/index") || slug === "index") {
    slug = slug.replace(/\/?index$/, "");
  }

  return slug;
}

function pathToTitle(path: string): string {
  let filename = path;

  const lastSlash = filename.lastIndexOf("/");
  if (lastSlash !== -1) {
    filename = filename.slice(lastSlash + 1);
  }

  if (filename.endsWith(".md")) {
    filename = filename.slice(0, -3);
  }

  if (filename === "README" || filename === "index") {
    const parts = path.split("/");
    if (parts.length > 1) {
      filename = parts[parts.length - 2];
    } else {
      filename = "Home";
    }
  }

  return formatTitle(filename);
}

function formatTitle(filename: string): string {
  const withSpaces = filename.replace(/[-_]/g, " ");

  return withSpaces
    .split(" ")
    .map((word) => {
      if (word.length === 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function sortPages(pages: DocsPage[]): DocsPage[] {
  return pages.sort((a, b) => {
    if (a.slug === "") {
      return -1;
    }
    if (b.slug === "") {
      return 1;
    }
    return a.slug.localeCompare(b.slug);
  });
}
