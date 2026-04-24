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

export type PageNumberBackground = "none" | "triangle" | "circle" | "rect";

export type CoverStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
  logoHeight?: number;
  logoGapX?: number;
  logoBottomPadding?: number;
  titleBottomPadding?: number;
  subTitleBottomPadding?: number;
  authorBottomPadding?: number;
  alignH?: AlignH;
  alignV?: AlignV;
};

export type SectionStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
  sectionTitleBottomPadding?: number;
  alignH?: AlignH;
  alignV?: AlignV;
};

export type HeaderStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
  logoHeight?: number;
  logoGapX?: number;
  logoPlacement?: "left" | "right";
  logoBottomPadding?: number;
  headerBottomPadding?: number;
  subHeaderBottomPadding?: number;
  bottomBorderStrokeWidth?: number;
  bottomBorderColor?: ColorKeyOrString;
  alignH?: AlignH;
};

export type FooterStyleOptions = {
  padding?: PaddingOptions;
  logoHeight?: number;
  logoGapX?: number;
  backgroundColor?: ColorKeyOrString;
  alignH?: AlignH;
};

export type ContentStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
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
