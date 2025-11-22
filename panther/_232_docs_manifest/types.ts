// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// ================================================================================
// CORE TYPES
// ================================================================================

export type DocsManifest = {
  title: string;
  pages: DocsPage[];
  rootItems: NavItem[];
  navigation: NavSection[];
};

export type DocsPage = {
  slug: string;
  filePath: string;
  title: string;
  order?: number;
  frontmatter: Record<string, unknown>;
  children?: DocsPage[];
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  collapsed?: boolean;
  slug?: string;
};

export type NavItem = {
  label: string;
  slug: string;
  children?: NavItem[];
};

// ================================================================================
// OPTIONS TYPES
// ================================================================================

export type GenerateDocsManifestOptions = {
  inputDir: string;
  title?: string;
};
