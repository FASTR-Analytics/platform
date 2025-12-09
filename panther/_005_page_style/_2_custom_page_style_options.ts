// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { assert, type ColorKeyOrString, type PaddingOptions } from "./deps.ts";
import type { PageTextStyleOptions } from "./text_style_keys.ts";

export type CustomPageStyleOptions = {
  scale?: number;
  text?: PageTextStyleOptions;
  cover?: {
    backgroundColor?: ColorKeyOrString;
    logoHeight?: number;
    logoGapX?: number;
    gapY?: number;
  };
  section?: {
    backgroundColor?: ColorKeyOrString;
    gapY?: number;
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
  };
  footer?: {
    padding?: PaddingOptions;
    logoHeight?: number;
    logoGapX?: number;
    backgroundColor?: ColorKeyOrString;
  };
  content?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString;
    gapX?: number;
    gapY?: number;
    nColumns?: number;
  };
  layoutContainers?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString;
    borderColor?: ColorKeyOrString;
    borderWidth?: number;
    borderRadius?: number;
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
