// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PageNumberBackground } from "./_2_custom_page_style_options.ts";
import type { AlignH, AlignV, Padding, TextInfoUnkeyed } from "./deps.ts";

export type MergedPageNumberStyle = {
  placement: "bottom-right" | "bottom-left" | "bottom-center";
  padding: Padding;
  background: PageNumberBackground;
  backgroundColor: string;
};

export type MergedFreeformHeaderStyle = {
  padding: Padding;
  logoHeight: number;
  logoGapX: number;
  logoPlacement: "left" | "right";
  backgroundColor: string;
  logoBottomPadding: number;
  headerBottomPadding: number;
  subHeaderBottomPadding: number;
  bottomBorderStrokeWidth: number;
  bottomBorderColor: string;
  alignH: AlignH;
};

export type MergedFreeformFooterStyle = {
  padding: Padding;
  logoHeight: number;
  logoGapX: number;
  backgroundColor: string;
  alignH: AlignH;
};

export type MergedFreeformContentStyle = {
  padding: Padding;
  backgroundColor: string;
  gapX: number;
  gapY: number;
};

export type MergedFreeformLayoutContainersStyle = {
  padding: Padding;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  rectRadius: number;
};

export type MergedCoverStyle = {
  alreadyScaledValue: number;
  padding: Padding;
  backgroundColor: string;
  logoHeight: number;
  logoGapX: number;
  logoBottomPadding: number;
  titleBottomPadding: number;
  subTitleBottomPadding: number;
  authorBottomPadding: number;
  alignH: AlignH;
  alignV: AlignV;
  text: {
    coverTitle: TextInfoUnkeyed;
    coverSubTitle: TextInfoUnkeyed;
    coverAuthor: TextInfoUnkeyed;
    coverDate: TextInfoUnkeyed;
    pageNumber: TextInfoUnkeyed;
    watermark: TextInfoUnkeyed;
  };
  pageNumber: MergedPageNumberStyle;
};

export type MergedSectionStyle = {
  alreadyScaledValue: number;
  padding: Padding;
  backgroundColor: string;
  sectionTitleBottomPadding: number;
  alignH: AlignH;
  alignV: AlignV;
  text: {
    sectionTitle: TextInfoUnkeyed;
    sectionSubTitle: TextInfoUnkeyed;
    pageNumber: TextInfoUnkeyed;
    watermark: TextInfoUnkeyed;
  };
  pageNumber: MergedPageNumberStyle;
};

export type MergedFreeformStyle = {
  alreadyScaledValue: number;
  header: MergedFreeformHeaderStyle;
  footer: MergedFreeformFooterStyle;
  content: MergedFreeformContentStyle;
  layoutContainers: MergedFreeformLayoutContainersStyle;
  text: {
    header: TextInfoUnkeyed;
    subHeader: TextInfoUnkeyed;
    date: TextInfoUnkeyed;
    footer: TextInfoUnkeyed;
    pageNumber: TextInfoUnkeyed;
    watermark: TextInfoUnkeyed;
  };
  pageNumber: MergedPageNumberStyle;
};
