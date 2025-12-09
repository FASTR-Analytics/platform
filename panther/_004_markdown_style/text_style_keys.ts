// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomStyleTextOptions, TextInfoOptions } from "./deps.ts";

export const MARKDOWN_TEXT_STYLE_KEYS = [
  "base",
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "list",
  "blockquote",
  "code",
] as const;

export type MarkdownTextStyleKey = (typeof MARKDOWN_TEXT_STYLE_KEYS)[number];

export type MarkdownTextStyleOptions = {
  [K in MarkdownTextStyleKey]?: K extends "base" ? TextInfoOptions
    : CustomStyleTextOptions;
};
