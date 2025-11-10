// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Document } from "./deps.ts";
import { parseMarkdown } from "./parser.ts";
import { STYLE_CONFIGS, type StyleConfigId } from "./style_config.ts";
import { buildWordDocument } from "./word_builder.ts";

export function convertMarkdownToWordDocument(
  markdownContent: string,
  styleConfigId?: StyleConfigId,
): Document {
  const parsedDocument = parseMarkdown(markdownContent);
  const config = styleConfigId ? STYLE_CONFIGS[styleConfigId] : undefined;
  return buildWordDocument(parsedDocument, config);
}
