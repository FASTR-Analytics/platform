// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { applyContainerDefaults } from "./apply_container_defaults.ts";
export { buildPageLayout } from "./build_page_layout.ts";
export type { LayoutInput } from "./build_page_layout.ts";
export { measureHeaderFooterHeights } from "./measure_header_footer_heights.ts";
export type {
  HeaderFooterInputs,
  MeasuredHeaderFooterHeights,
} from "./measure_header_footer_heights.ts";
export { PageRenderer } from "./page_renderer.ts";
export type {
  CoverPageInputs,
  FreeformPageInputs,
  MeasuredCoverPage,
  MeasuredFreeformPage,
  MeasuredPage,
  MeasuredSectionPage,
  PageContentItem,
  PageContentItemType,
  PageImageInputs,
  PageInputs,
  PageInputsBase,
  PageSpacerInputs,
  SectionPageInputs,
} from "./types.ts";
export { isSpacerItem } from "./types.ts";

export { buildFreeformPages } from "./build_freeform_pages.ts";
export type { FreeformPagesConfig } from "./build_freeform_pages.ts";

export { buildHitRegions, findHitTarget } from "./hit_regions.ts";
export type {
  PageHitTarget,
  PageHitTargetColDivider,
  PageHitTargetColGap,
  PageHitTargetCover,
  PageHitTargetFooter,
  PageHitTargetHeader,
  PageHitTargetLayoutItem,
  PageHitTargetRowGap,
  PageHitTargetSection,
} from "./hit_regions.ts";
