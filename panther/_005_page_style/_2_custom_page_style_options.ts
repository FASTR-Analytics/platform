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

export type CustomPageStyleOptions = {
  scale?: number;
  text?: PageTextStyleOptions;
  cover?: {
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
  section?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString;
    sectionTitleBottomPadding?: number;
    alignH?: AlignH;
    alignV?: AlignV;
  };
  header?: {
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
  footer?: {
    padding?: PaddingOptions;
    logoHeight?: number;
    logoGapX?: number;
    backgroundColor?: ColorKeyOrString;
    alignH?: AlignH;
  };
  content?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString;
    gapX?: number;
    gapY?: number;
  };
  layoutContainers?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString;
    borderColor?: ColorKeyOrString;
    borderWidth?: number;
    rectRadius?: number;
  };
  pageNumber?: {
    placement?: "bottom-right" | "bottom-left" | "bottom-center";
    padding?: PaddingOptions;
    background?: PageNumberBackground;
    backgroundColor?: ColorKeyOrString;
  };
};

let _GS: CustomPageStyleOptions | undefined = undefined;

export function setGlobalPageStyle(gs: CustomPageStyleOptions): void {
  assert(_GS === undefined, "Global page styles have already been set");
  _GS = gs;
}

export function getGlobalPageStyle(): CustomPageStyleOptions {
  return _GS ?? {};
}
