// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomMarkdownStyleOptions, Document, ImageMap } from "./deps.ts";
import { parseMarkdown } from "./deps.ts";
import { buildWordDocument } from "./word_builder.ts";
import type { WordSpecificConfig } from "./word_specific_config.ts";

export type PageBreakRules = {
  h1AlwaysNewPage?: boolean;
  h2AlwaysNewPage?: boolean;
  h3AlwaysNewPage?: boolean;
};

export type ConvertMarkdownToWordOptions = {
  markdownStyle?: CustomMarkdownStyleOptions;
  wordConfig?: WordSpecificConfig;
  images?: ImageMap;
  pageBreakRules?: PageBreakRules;
};

export function coreMarkdownToWord(
  markdownContent: string,
  options?: ConvertMarkdownToWordOptions,
): Document {
  const parsedDocument = parseMarkdown(markdownContent);

  if (options?.images) {
    for (const element of parsedDocument.elements) {
      if (element.type === "image" && element.imageData) {
        const imageInfo = options.images.get(element.imageData);
        if (imageInfo) {
          element.imageData = imageInfo.dataUrl;
          element.imageWidth = imageInfo.width;
          element.imageHeight = imageInfo.height;
        }
      }
    }
  }

  return buildWordDocument(parsedDocument, options);
}
