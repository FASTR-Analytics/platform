// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { basename, globToRegExp, relative, walk } from "./deps.ts";
import type { DocsPage } from "./deps.ts";
import { extractTitle, parseFrontmatter } from "./parse_frontmatter.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export async function scanDirectory(
  inputDir: string,
  excludePatterns: string[] = [],
): Promise<DocsPage[]> {
  const pages: DocsPage[] = [];

  for await (const entry of walk(inputDir, { exts: [".md"] })) {
    if (!entry.isFile) {
      continue;
    }

    const relativePath = relative(inputDir, entry.path);

    if (shouldExclude(relativePath, excludePatterns)) {
      continue;
    }

    const page = await createDocsPage(inputDir, entry.path);
    pages.push(page);
  }

  return sortPages(pages);
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

async function createDocsPage(
  baseDir: string,
  filePath: string,
): Promise<DocsPage> {
  const content = await Deno.readTextFile(filePath);
  const { frontmatter, markdown } = parseFrontmatter(content);
  const fileName = basename(filePath);

  const relativePath = relative(baseDir, filePath);
  const slug = createSlug(relativePath);
  const title = extractTitle(frontmatter, markdown, fileName);
  const order = extractOrder(frontmatter);

  return {
    slug: slug,
    filePath: relativePath,
    title: title,
    order: order,
    frontmatter: frontmatter,
  };
}

function createSlug(relativePath: string): string {
  const withoutExt = relativePath.replace(/\.md$/i, "");
  const normalized = withoutExt.replace(/\\/g, "/");

  if (normalized === "README" || normalized === "index") {
    return "";
  }

  return normalized
    .replace(/\/README$/i, "")
    .replace(/\/index$/i, "")
    .toLowerCase();
}

function extractOrder(
  frontmatter: Record<string, unknown>,
): number | undefined {
  if (frontmatter.order !== undefined) {
    const order = Number(frontmatter.order);
    if (!isNaN(order)) {
      return order;
    }
  }
  return undefined;
}

function shouldExclude(relativePath: string, patterns: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  for (const pattern of patterns) {
    const regex = globToRegExp(pattern);
    if (regex.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

function sortPages(pages: DocsPage[]): DocsPage[] {
  return pages.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }

    if (a.order !== undefined) {
      return -1;
    }

    if (b.order !== undefined) {
      return 1;
    }

    return a.slug.localeCompare(b.slug);
  });
}
