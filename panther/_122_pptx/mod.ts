// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { pagesToPptx } from "./pages_to_pptx.ts";
export type { CreateCanvasRenderContext } from "./types.ts";
export {
  pixelsToInches,
  pixelsToPoints,
  rcdToSlidePosition,
} from "./pptx_units.ts";
export type { SlidePosition } from "./pptx_units.ts";
export { default as PptxGenJS } from "pptxgenjs";
export type { PptxGenJSInstance } from "./types.ts";
