// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomPageStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import { measureCover } from "./cover/measure_cover.ts";
import { measureFreeform } from "./freeform/measure_freeform.ts";
import { measureSection } from "./section/measure_section.ts";
import type { MeasuredPage, PageInputs } from "../types.ts";

export function measurePage(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: PageInputs,
  responsiveScale?: number,
): MeasuredPage {
  const mergedPageStyle = new CustomPageStyle(
    item.style,
    responsiveScale,
  ).getMergedPageStyle();
  const s = mergedPageStyle;

  switch (item.type) {
    case "cover":
      return measureCover(rc, bounds, item, s, responsiveScale);
    case "section":
      return measureSection(rc, bounds, item, s, responsiveScale);
    case "freeform":
      return measureFreeform(rc, bounds, item, s, responsiveScale);
    default: {
      const _exhaustive: never = item;
      throw new Error(`Unknown page type: ${_exhaustive}`);
    }
  }
}
