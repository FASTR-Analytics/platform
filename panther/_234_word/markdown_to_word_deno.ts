// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  coreMarkdownToWord,
  type CustomMarkdownStyleOptions,
  DEFAULT_WORD_SPECIFIC_CONFIG,
  type Document,
  type FigureMap,
  getFigureAsDataUrl,
  type ImageMap,
  type WordSpecificConfig,
} from "./deps.ts";

export type MarkdownToWordDenoConfig = {
  style?: CustomMarkdownStyleOptions;
  wordConfig?: WordSpecificConfig;
  images?: ImageMap;
  figures?: FigureMap;
  pageBreakRules?: {
    h1AlwaysNewPage?: boolean;
    h2AlwaysNewPage?: boolean;
    h3AlwaysNewPage?: boolean;
  };
};

const DEFAULT_FIGURE_DPI = 150;

export async function markdownToWordDeno(
  markdown: string,
  config?: MarkdownToWordDenoConfig,
): Promise<Document> {
  const mergedImages: ImageMap = new Map(config?.images ?? []);

  if (config?.figures) {
    const maxWidthInches = config?.wordConfig?.image?.maxWidthInches ??
      DEFAULT_WORD_SPECIFIC_CONFIG.image?.maxWidthInches ??
      6.9;
    const figureWidthPx = Math.round(maxWidthInches * DEFAULT_FIGURE_DPI);

    for (const [key, figureInputs] of config.figures) {
      const rendered = await getFigureAsDataUrl(
        figureInputs,
        figureWidthPx,
        undefined,
      );
      mergedImages.set(key, rendered);
    }
  }

  return coreMarkdownToWord(markdown, {
    style: config?.style,
    wordConfig: config?.wordConfig,
    images: mergedImages.size > 0 ? mergedImages : undefined,
    pageBreakRules: config?.pageBreakRules,
  });
}
