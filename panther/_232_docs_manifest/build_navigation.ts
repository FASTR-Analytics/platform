// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DocsPage, NavItem, NavSection } from "./types.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export function buildNavigation(
  pages: DocsPage[],
  preferSentenceCase: boolean = false,
): { rootItems: NavItem[]; sections: NavSection[] } {
  const grouped = groupPagesByDirectory(pages);
  const rootItems: NavItem[] = [];
  const sections: NavSection[] = [];

  for (const [dirName, dirPages] of Object.entries(grouped)) {
    if (dirName === "_root") {
      for (const page of dirPages) {
        rootItems.push({
          label: page.title,
          slug: page.slug,
        });
      }
    } else {
      const section = buildSection(dirName, dirPages, preferSentenceCase);
      if (section.items.length > 0) {
        sections.push(section);
      }
    }
  }

  return {
    rootItems: sortRootItems(rootItems),
    sections: sortSections(sections),
  };
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function groupPagesByDirectory(
  pages: DocsPage[],
): Record<string, DocsPage[]> {
  const grouped: Record<string, DocsPage[]> = {};

  for (const page of pages) {
    const parts = page.slug.split("/");
    const topLevel = parts.length > 0 && parts[0] !== "" ? parts[0] : "_root";

    if (!grouped[topLevel]) {
      grouped[topLevel] = [];
    }
    grouped[topLevel].push(page);
  }

  return grouped;
}

function buildSection(
  dirName: string,
  pages: DocsPage[],
  preferSentenceCase: boolean,
): NavSection {
  const label = formatDirName(dirName, preferSentenceCase);
  const items = buildNavItems(pages, preferSentenceCase);
  const sectionSlug = findSectionSlug(dirName, pages);

  return {
    id: dirName,
    label: label,
    items: items,
    collapsed: false,
    slug: sectionSlug,
  };
}

function buildNavItems(
  pages: DocsPage[],
  preferSentenceCase: boolean,
): NavItem[] {
  const items: NavItem[] = [];
  const grouped = new Map<string, DocsPage[]>();

  for (const page of pages) {
    const parts = page.slug.split("/").filter((p) => p !== "");

    if (parts.length <= 2) {
      items.push({
        label: page.title,
        slug: page.slug,
      });
    } else {
      const parentDir = parts.slice(0, -1).join("/");
      const existing = grouped.get(parentDir) ?? [];
      existing.push(page);
      grouped.set(parentDir, existing);
    }
  }

  for (const [parentDir, childPages] of grouped.entries()) {
    const parts = parentDir.split("/");
    const lastPart = parts[parts.length - 1];

    items.push({
      label: formatDirName(lastPart, preferSentenceCase),
      slug: parentDir,
      children: childPages.map((p) => ({
        label: p.title,
        slug: p.slug,
      })),
    });
  }

  return items;
}

function formatDirName(
  dirName: string,
  preferSentenceCase: boolean,
): string {
  const withSpaces = dirName.replace(/[-_]/g, " ");
  return preferSentenceCase
    ? sentenceCase(withSpaces)
    : capitalizeWords(withSpaces);
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

function sentenceCase(str: string): string {
  if (str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function sortSections(sections: NavSection[]): NavSection[] {
  return sections.sort((a, b) => a.label.localeCompare(b.label));
}

function sortRootItems(items: NavItem[]): NavItem[] {
  return items.sort((a, b) => {
    if (a.slug === "") {
      return -1;
    }
    if (b.slug === "") {
      return 1;
    }
    return a.slug.localeCompare(b.slug);
  });
}

function findSectionSlug(
  dirName: string,
  pages: DocsPage[],
): string | undefined {
  for (const page of pages) {
    if (page.slug === dirName || page.slug === `${dirName}/index`) {
      return page.slug;
    }
  }

  return pages.length > 0 ? pages[0].slug : undefined;
}
