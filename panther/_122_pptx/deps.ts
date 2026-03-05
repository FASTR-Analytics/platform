// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { sum } from "../_000_utils/mod.ts";
export { Color, getColor } from "../_001_color/mod.ts";
export { Padding, RectCoordsDims } from "../_001_geometry/mod.ts";
export type { MeasuredText, RenderContext } from "../_001_render_system/mod.ts";
export type { MergedPageStyle } from "../_005_page_style/mod.ts";
export { walkLayout } from "../_008_layouter/mod.ts";
export type { MeasuredLayoutNode } from "../_008_layouter/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type { FigureInputs } from "../_011_figure_renderer/mod.ts";
export { ImageRenderer } from "../_012_image_renderer/mod.ts";
export type { ImageInputs } from "../_012_image_renderer/mod.ts";
export { MarkdownRenderer } from "../_105_markdown/mod.ts";
export type {
  FormattedRunStyle,
  MeasuredFormattedText,
  MeasuredMarkdown,
  MeasuredMarkdownItem,
} from "../_105_markdown/mod.ts";
export { PageRenderer } from "../_121_page/mod.ts";
export type {
  MeasuredCoverPage,
  MeasuredFreeformPage,
  MeasuredPage,
  MeasuredSectionPage,
  PageContentItem,
  PageInputs,
} from "../_121_page/mod.ts";
export { default as PptxGenJS } from "pptxgenjs";
