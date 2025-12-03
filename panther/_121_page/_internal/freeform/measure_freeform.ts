// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedPageStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { measureContent } from "./content.ts";
import { measureFooter } from "./footer.ts";
import { measureHeader } from "./header.ts";
import type { FreeformPageInputs, MeasuredFreeformPage } from "../../types.ts";

export function measureFreeform(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
  responsiveScale?: number,
): MeasuredFreeformPage {
  // Measure header
  const header = measureHeader(rc, rcdOuter, inputs, s);

  // Measure footer
  const footer = measureFooter(rc, rcdOuter, inputs, s);

  // Measure content (needs to know header and footer heights)
  const content = measureContent(
    rc,
    rcdOuter,
    inputs,
    s,
    header?.rcdHeaderOuter.h() ?? 0,
    footer?.rcdFooterOuter.h() ?? 0,
  );

  return {
    type: "freeform",
    item: inputs,
    bounds: rcdOuter,
    mergedPageStyle: s,
    responsiveScale,
    warnings: content.warnings,
    header,
    footer,
    rcdContentOuter: content.rcdContentOuter,
    rcdContentInner: content.rcdContentInner,
    mLayout: content.mLayout,
  };
}
