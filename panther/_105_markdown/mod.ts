// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  FigureMap,
  ImageMap,
  MarkdownRendererInput,
  MeasuredMarkdown,
} from "./types.ts";

export { MarkdownRenderer } from "./markdown_renderer.ts";
export { createMarkdownIt } from "./parser.ts";

export { parseEmailsInText, parseMarkdown } from "./parse_to_doc_elements.ts";
export type {
  DocElement,
  InlineContent,
  ParsedDocument,
} from "./doc_element_types.ts";

export {
  contentGroupToPageContentItem,
  docElementToMarkdown,
  docElementToPageContentItem,
  groupDocElementsByContentType,
} from "./convert_to_page_content.ts";
export type {
  ContentGroup,
  ConvertedPageContent,
} from "./convert_to_page_content.ts";

export { paginateMarkdown } from "./paginate_to_pages.ts";
export type { PageBreakRules, PaginationConfig } from "./paginate_to_pages.ts";

export { buildMarkdownPageContents } from "./build_markdown_pages.ts";
export type { MarkdownPagesConfig } from "./build_markdown_pages.ts";
