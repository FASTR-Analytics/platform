// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MergedFreeformStyle,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import { measureFooter } from "./_internal/freeform/footer.ts";
import { measureHeader } from "./_internal/freeform/header.ts";
import type { HeaderFooterInputs } from "./types.ts";

export type MeasuredHeaderFooterHeights = {
  headerHeight: number;
  footerHeight: number;
};

export function measureHeaderFooterHeights(
  rc: RenderContext,
  pageWidth: number,
  inputs: HeaderFooterInputs,
  style: MergedFreeformStyle,
): MeasuredHeaderFooterHeights {
  const rcd = new RectCoordsDims([0, 0, pageWidth, 0]);
  return {
    headerHeight: measureHeader(rc, rcd, inputs, style)?.rcdHeaderOuter.h() ??
      0,
    footerHeight: measureFooter(rc, rcd, inputs, style)?.rcdFooterOuter.h() ??
      0,
  };
}
