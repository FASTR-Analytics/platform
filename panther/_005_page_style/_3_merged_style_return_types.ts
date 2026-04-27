// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, AlignV, Padding, TextInfoUnkeyed } from "./deps.ts";
import type {
  LogosPlacement,
  LogosSizing,
  PageNumberBackground,
} from "./types.ts";

export type { LogosSizing };

export type MergedPageNumberStyle = {
  placement: "bottom-right" | "bottom-left" | "bottom-center";
  padding: Padding;
  background: PageNumberBackground;
  backgroundColor: string;
};

export type MergedFreeformHeaderStyle = {
  padding: Padding;
  logosSizing: LogosSizing;
  background: string;
  headerBottomPadding: number;
  subHeaderBottomPadding: number;
  bottomBorderStrokeWidth: number;
  bottomBorderColor: string;
  alignH: AlignH;
};

export type MergedFreeformFooterStyle = {
  padding: Padding;
  logosSizing: LogosSizing;
  background: string;
  alignH: AlignH;
};

export type MergedFreeformContentStyle = {
  padding: Padding;
  background: string;
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

export type MergedSplitConfig = {
  placement: "none" | "left" | "right" | "top" | "bottom";
  sizeAsPct: number;
  background: string;
};

export type MergedCoverStyle = {
  alreadyScaledValue: number;
  padding: Padding;
  background: string;
  split: MergedSplitConfig;
  logosSizing: LogosSizing;
  logosPlacement: LogosPlacement;
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
  background: string;
  split: MergedSplitConfig;
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
  split: MergedSplitConfig;
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
