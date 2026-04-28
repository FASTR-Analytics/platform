// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  CustomPageStyleOptions,
  FigureInputs,
  ImageInputs,
  LayoutGap,
  LayoutNode,
  LineStyle,
  MarkdownRendererInput,
  Measured,
  MeasuredImage,
  MeasuredLayoutNode,
  MeasuredText,
  MergedCoverStyle,
  MergedFreeformStyle,
  MergedSectionStyle,
  PageBackgroundStyle,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";

// =============================================================================
// Page Primitives (for rendering page decoration elements)
// =============================================================================

export type PagePrimitive =
  | PagePrimitiveBackground
  | PagePrimitiveText
  | PagePrimitiveImage
  | PagePrimitiveLine;

export type PagePrimitiveBackground = {
  type: "background";
  id: string;
  rcd: RectCoordsDims;
  background: PageBackgroundStyle;
};

export type PagePrimitiveText = {
  type: "text";
  id: string; // e.g., "coverTitle", "headerText", "footerText"
  mText: MeasuredText;
  x: number;
  y: number;
  alignH: "left" | "center" | "right";
  alignV?: "top" | "middle" | "bottom";
  maxWidth?: number; // Available width constraint (for full-width hit areas)
};

export type PagePrimitiveImage = {
  type: "image";
  id: string; // e.g., "coverOverlay", "headerLogo1"
  image: HTMLImageElement;
  rcd: RectCoordsDims;
};

export type PagePrimitiveLine = {
  type: "line";
  id: string; // e.g., "headerBorder"
  points: [[number, number], [number, number]];
  style: LineStyle;
};

// =============================================================================
// Page Content Items
// =============================================================================

// Image content for pages
export type PageImageInputs = ImageInputs;

// Spacer content for pages (inline renderer)
export type PageSpacerInputs = {
  spacer: true;
  minH?: number;
  maxH?: number;
};

// Union of all content types that can appear in a page
export type PageContentItem =
  | MarkdownRendererInput
  | FigureInputs
  | PageImageInputs
  | PageSpacerInputs;

// =============================================================================
// Page Annotations
// =============================================================================

export type PageAnnotation = PageAnnotationRect;

export type PageAnnotationRect = {
  rect: string;
  borderWidth?: number;
  borderColor?: ColorKeyOrString;
  rectRadius?: number;
};

export function isRectAnnotation(
  ann: PageAnnotation,
): ann is PageAnnotationRect {
  return "rect" in ann;
}

// =============================================================================
// Page Input Types
// =============================================================================

// Base properties shared by all page input types
export type PageInputsBase = {
  overlay?: HTMLImageElement;
  watermark?: string;
  style?: CustomPageStyleOptions;
  annotations?: PageAnnotation[];
  pageNumber?: string;
  splitImage?: HTMLImageElement;
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
  content: LayoutNode<PageContentItem>;
};

// Discriminated union of all page input types
export type PageInputs =
  | CoverPageInputs
  | SectionPageInputs
  | FreeformPageInputs;

export type PageRenderContext = { rc: RenderContext; s: MergedFreeformStyle };

// =============================================================================
// Measured Page Types
// =============================================================================

// Base type for all measured pages (shared fields, no style - each page type has its own)
type MeasuredPageBase = Measured<PageInputs> & {
  responsiveScale?: number;
  overflow: boolean;
  fullPageBounds: RectCoordsDims;
  mWatermark?: MeasuredText;
  measuredSplitImage?: MeasuredImage;
  splitImageBounds?: RectCoordsDims;
  splitBackground?: PageBackgroundStyle;
};

// Cover page specific measured data
export type MeasuredCoverPage = MeasuredPageBase & {
  type: "cover";
  item: CoverPageInputs;
  style: MergedCoverStyle;
  primitives: PagePrimitive[];
  mTitle?: MeasuredText;
  mSubTitle?: MeasuredText;
  mAuthor?: MeasuredText;
  mDate?: MeasuredText;
};

// Section page specific measured data
export type MeasuredSectionPage = MeasuredPageBase & {
  type: "section";
  item: SectionPageInputs;
  style: MergedSectionStyle;
  primitives: PagePrimitive[];
  mSectionTitle?: MeasuredText;
  mSectionSubTitle?: MeasuredText;
};

// Freeform page specific measured data
export type MeasuredFreeformPage = MeasuredPageBase & {
  type: "freeform";
  item: FreeformPageInputs;
  style: MergedFreeformStyle;
  primitives: PagePrimitive[];
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
  mLayout: MeasuredLayoutNode<PageContentItem>;
  rcdContentOuter: RectCoordsDims;
  rcdContentInner: RectCoordsDims;
  gaps: LayoutGap[];
};

// Discriminated union of all measured page types
export type MeasuredPage =
  | MeasuredCoverPage
  | MeasuredSectionPage
  | MeasuredFreeformPage;

// =============================================================================
// Content Item Type Detection
// =============================================================================

export type PageContentItemType = "markdown" | "figure" | "image" | "spacer";

export function isSpacerItem(item: PageContentItem): item is PageSpacerInputs {
  return (
    typeof item === "object" &&
    item !== null &&
    "spacer" in item &&
    (item as PageSpacerInputs).spacer === true
  );
}
