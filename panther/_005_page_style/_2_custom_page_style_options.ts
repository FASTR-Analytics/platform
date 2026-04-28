// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlignH,
  type AlignV,
  assert,
  type ColorKeyOrString,
  type PaddingOptions,
} from "./deps.ts";
import type { PageTextStyleOptions } from "./text_style_keys.ts";
import type {
  LogosPlacementOptions,
  LogosSizingOptions,
  PageBackgroundStyle,
  PageNumberBackground,
  SplitConfig,
} from "./types.ts";

export type CoverStyleOptions = {
  padding?: PaddingOptions;
  background?: PageBackgroundStyle;
  split?: SplitConfig;
  logosSizing?: LogosSizingOptions;
  logosPlacement?: LogosPlacementOptions;
  titleBottomPadding?: number;
  subTitleBottomPadding?: number;
  authorBottomPadding?: number;
  alignH?: AlignH;
  alignV?: AlignV;
};

export type SectionStyleOptions = {
  padding?: PaddingOptions;
  background?: PageBackgroundStyle;
  split?: SplitConfig;
  sectionTitleBottomPadding?: number;
  alignH?: AlignH;
  alignV?: AlignV;
};

export type HeaderStyleOptions = {
  padding?: PaddingOptions;
  background?: PageBackgroundStyle;
  logosSizing?: LogosSizingOptions;
  headerBottomPadding?: number;
  subHeaderBottomPadding?: number;
  bottomBorderStrokeWidth?: number;
  bottomBorderColor?: ColorKeyOrString;
  alignH?: AlignH;
};

export type FooterStyleOptions = {
  padding?: PaddingOptions;
  logosSizing?: LogosSizingOptions;
  background?: PageBackgroundStyle;
  alignH?: AlignH;
};

export type ContentStyleOptions = {
  padding?: PaddingOptions;
  background?: PageBackgroundStyle;
  gapX?: number;
  gapY?: number;
};

export type LayoutContainersStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
  borderColor?: ColorKeyOrString;
  borderWidth?: number;
  rectRadius?: number;
};

export type FreeformStyleOptions = {
  split?: SplitConfig;
  header?: HeaderStyleOptions;
  footer?: FooterStyleOptions;
  content?: ContentStyleOptions;
  layoutContainers?: LayoutContainersStyleOptions;
};

export type PageNumberStyleOptions = {
  placement?: "bottom-right" | "bottom-left" | "bottom-center";
  padding?: PaddingOptions;
  background?: PageNumberBackground;
  backgroundColor?: ColorKeyOrString;
};

export type CustomPageStyleOptions = {
  scale?: number;
  text?: PageTextStyleOptions;
  cover?: CoverStyleOptions;
  section?: SectionStyleOptions;
  freeform?: FreeformStyleOptions;
  pageNumber?: PageNumberStyleOptions;
};

let _GS: CustomPageStyleOptions | undefined = undefined;

export function setGlobalPageStyle(gs: CustomPageStyleOptions): void {
  assert(_GS === undefined, "Global page styles have already been set");
  _GS = gs;
}

export function getGlobalPageStyle(): CustomPageStyleOptions {
  return _GS ?? {};
}
