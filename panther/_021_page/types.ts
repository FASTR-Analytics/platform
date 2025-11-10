// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ADTItem,
  CustomPageStyleOptions,
  ItemOrContainerForLayout,
  ItemOrContainerWithLayout,
  LayoutWarning,
  Measured,
  MeasuredText,
  MergedPageStyle,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";

// Base properties shared by all page input types
export type PageInputsBase = {
  overlay?: HTMLImageElement;
  watermark?: string;
  style?: CustomPageStyleOptions;
};

// Cover page specific inputs
export type CoverPageInputs = PageInputsBase & {
  type: "cover";
  title?: string;
  subTitle?: string;
  author?: string;
  date?: string;
  titleLogos?: HTMLImageElement[];
};

// Section page specific inputs
export type SectionPageInputs = PageInputsBase & {
  type: "section";
  sectionTitle?: string;
  sectionSubTitle?: string;
};

// Freeform page specific inputs
export type FreeformPageInputs = PageInputsBase & {
  type: "freeform";
  header?: string;
  subHeader?: string;
  date?: string;
  footer?: string;
  headerLogos?: HTMLImageElement[];
  footerLogos?: HTMLImageElement[];
  content: ItemOrContainerForLayout<ADTItem>;
  pageNumber?: string;
};

// Discriminated union of all page input types
export type PageInputs =
  | CoverPageInputs
  | SectionPageInputs
  | FreeformPageInputs;

export type PageRenderContext = { rc: RenderContext; s: MergedPageStyle };

// Base type for all measured pages
type MeasuredPageBase = Measured<PageInputs> & {
  mergedPageStyle: MergedPageStyle;
  responsiveScale?: number;
  warnings: LayoutWarning[];
};

// Cover page specific measured data
export type MeasuredCoverPage = MeasuredPageBase & {
  type: "cover";
  item: CoverPageInputs;
  mTitle?: MeasuredText;
  mSubTitle?: MeasuredText;
  mAuthor?: MeasuredText;
  mDate?: MeasuredText;
};

// Section page specific measured data
export type MeasuredSectionPage = MeasuredPageBase & {
  type: "section";
  item: SectionPageInputs;
  mSectionTitle?: MeasuredText;
  mSectionSubTitle?: MeasuredText;
};

// Freeform page specific measured data
export type MeasuredFreeformPage = MeasuredPageBase & {
  type: "freeform";
  item: FreeformPageInputs;
  header?: {
    mHeader?: MeasuredText;
    mSubHeader?: MeasuredText;
    mDate?: MeasuredText;
    rcdHeaderOuter: RectCoordsDims;
    yOffsetHeader: number;
    yOffsetRightPlacementLogos: number;
  };
  footer?: {
    mFooter?: MeasuredText;
    rcdFooterOuter: RectCoordsDims;
  };
  mLayout: ItemOrContainerWithLayout<ADTItem>;
  rcdContentOuter: RectCoordsDims;
  rcdContentInner: RectCoordsDims;
};

// Discriminated union of all measured page types
export type MeasuredPage =
  | MeasuredCoverPage
  | MeasuredSectionPage
  | MeasuredFreeformPage;
