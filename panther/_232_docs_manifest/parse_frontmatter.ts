// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { parseYaml } from "./deps.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  markdown: string;
} {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (!frontmatterMatch) {
    return {
      frontmatter: {},
      markdown: content,
    };
  }

  const frontmatterText = frontmatterMatch[1];
  const markdown = content.slice(frontmatterMatch[0].length);

  try {
    const frontmatter = parseYaml(frontmatterText) as Record<string, unknown>;
    return {
      frontmatter: frontmatter ?? {},
      markdown: markdown,
    };
  } catch (error) {
    console.warn("Failed to parse frontmatter:", error);
    return {
      frontmatter: {},
      markdown: content,
    };
  }
}

export function extractTitle(
  frontmatter: Record<string, unknown>,
  markdown: string,
  fileName: string,
): string {
  if (frontmatter.title && typeof frontmatter.title === "string") {
    return frontmatter.title;
  }

  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1];
  }

  return formatFileNameAsTitle(fileName);
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function formatFileNameAsTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.md$/i, "");
  const withSpaces = withoutExt.replace(/[-_]/g, " ");
  return capitalizeWords(withSpaces);
}

function capitalizeWords(str: string): string {
  return str
    .split(" ")
    .map((word) => {
      if (word.length === 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
