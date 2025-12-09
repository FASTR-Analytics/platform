// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { coreMarkdownToWord } from "./converter.ts";
export type { ConvertMarkdownToWordOptions } from "./converter.ts";
export { buildWordDocument } from "./word_builder.ts";
export type { WordSpecificConfig } from "./word_specific_config.ts";
export { DEFAULT_WORD_SPECIFIC_CONFIG } from "./word_specific_config.ts";
export { UnsupportedLatexError } from "./latex_to_math.ts";

export {
  lineHeightToWordSpacing,
  pixelsToHalfPoints,
  pixelsToTwips,
  rgbToHex,
} from "./word_units.ts";

export { wordDocumentToBlob } from "./utils.ts";
