// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomMarkdownStyleOptions,
  DocsManifest,
  NavItem,
  NavSection,
  ParsedGitHubUrl,
} from "./deps.ts";

// ================================================================================
// COMPONENT PROPS
// ================================================================================

export type DocsViewerProps = {
  manifestUrl: string;
  basePath?: string;
  isGithub?: boolean;
  title?: string;
  style?: CustomMarkdownStyleOptions;
};

export type DocsSidebarProps = {
  rootItems: NavItem[];
  navigation: NavSection[];
  currentSlug: string;
  onNavigate: (slug: string) => void;
};

export type DocsContentProps = {
  currentSlug: string;
  pages: DocsManifest["pages"];
  basePath?: string;
  isGithub?: boolean;
  parsedGitHubUrl?: ParsedGitHubUrl;
  style?: CustomMarkdownStyleOptions;
};

export type DocsBreadcrumbsProps = {
  navigation: NavSection[];
  currentSlug: string;
};

// ================================================================================
// RE-EXPORTS
// ================================================================================

export type { DocsManifest, NavItem, NavSection, ParsedGitHubUrl };
