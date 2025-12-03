// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  getDefaultMarkdownStyle,
  type MarkdownBlockquoteStyle,
  type MarkdownHorizontalRuleStyle,
  type MarkdownLinkStyle,
  type MarkdownListStyle,
  type MarkdownTextStyle,
} from "./_1_default_markdown_style.ts";

export {
  type CustomMarkdownBlockquoteStyleOptions,
  type CustomMarkdownHorizontalRuleStyleOptions,
  type CustomMarkdownLinkStyleOptions,
  type CustomMarkdownListStyleOptions,
  type CustomMarkdownStyleOptions,
  type CustomMarkdownTextStyleOptions,
  getGlobalMarkdownStyle,
  setGlobalMarkdownStyle,
} from "./_2_custom_markdown_style_options.ts";

export { CustomMarkdownStyle } from "./_3_style_class.ts";

export type {
  MergedMarkdownBlockquoteStyle,
  MergedMarkdownHorizontalRuleStyle,
  MergedMarkdownLinkStyle,
  MergedMarkdownListLevelStyle,
  MergedMarkdownListStyle,
  MergedMarkdownSpacingStyle,
  MergedMarkdownStyle,
  MergedMarkdownTextStyle,
} from "./_3_merged_style_return_types.ts";

export type { MergedMarkdownStyle as MarkdownStyleConfig } from "./_3_merged_style_return_types.ts";
