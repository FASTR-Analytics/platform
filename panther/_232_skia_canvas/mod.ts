// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Main exports - simplified API surface
export {
  getFigureAsCanvas,
  getFigureAsDataUrl,
  writeFigure,
  writeFigures,
} from "./write_figure.ts";
export { writeSlide, writeSlides } from "./write_slide.ts";

// Utility exports for advanced usage
export { createCanvasRenderContext, writeCanvas } from "./utils.ts";
export { registerFontWithSkiaIfNeeded } from "./register_font.ts";
export { loadImage } from "./load_image.ts";

// Error types for better error handling
export {
  CanvasCreationError,
  FileWriteError,
  InvalidDimensionsError,
} from "./errors.ts";
