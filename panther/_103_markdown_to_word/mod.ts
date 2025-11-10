// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { convertMarkdownToWordDocument } from "./converter.ts";
export { parseMarkdown } from "./parser.ts";
export { buildWordDocument } from "./word_builder.ts";
export {
  createFooter,
  createNumbering,
  createStyles,
  getLinkColor,
  getPageProperties,
} from "./styles.ts";
export {
  COMPACT_STYLE_CONFIG,
  DEFAULT_STYLE_CONFIG,
  STYLE_CONFIG,
  STYLE_CONFIGS,
} from "./style_config.ts";
export { wordDocumentToBlob } from "./utils.ts";
export type {
  DocElement,
  InlineContent,
  ParsedDocument,
} from "./document_model.ts";
export type { StyleConfig, StyleConfigId } from "./style_config.ts";
