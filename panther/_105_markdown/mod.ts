// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  FigureMap,
  FormattedRun,
  FormattedRunStyle,
  ImageMap,
  MarkdownInline,
  MarkdownRendererInput,
  MeasuredFormattedLine,
  MeasuredFormattedText,
  MeasuredMarkdown,
  MeasuredMarkdownBlockquote,
  MeasuredMarkdownCodeBlock,
  MeasuredMarkdownHeading,
  MeasuredMarkdownHorizontalRule,
  MeasuredMarkdownItem,
  MeasuredMarkdownListItem,
  MeasuredMarkdownParagraph,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "./types.ts";

export { MarkdownRenderer } from "./markdown_renderer.ts";
export {
  createMarkdownIt,
  parseEmailsInText,
  parseMarkdown,
} from "./parser.ts";

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
