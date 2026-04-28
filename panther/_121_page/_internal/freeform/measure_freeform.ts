// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MeasuredImage,
  MeasuredText,
  MergedFreeformStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { measureContent } from "./content.ts";
import { buildFooterPrimitives, measureFooter } from "./footer.ts";
import { buildHeaderPrimitives, measureHeader } from "./header.ts";
import type {
  FreeformPageInputs,
  MeasuredFreeformPage,
  PagePrimitive,
} from "../../types.ts";

export function measureFreeform(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: FreeformPageInputs,
  style: MergedFreeformStyle,
  responsiveScale: number | undefined,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredFreeformPage {
  // Measure header
  const header = measureHeader(rc, rcdOuter, inputs, style);

  // Measure footer
  const footer = measureFooter(rc, rcdOuter, inputs, style);

  // Measure content (needs to know header and footer heights)
  const content = measureContent(
    rc,
    rcdOuter,
    inputs,
    style,
    header?.rcdHeaderOuter.h() ?? 0,
    footer?.rcdFooterOuter.h() ?? 0,
  );

  const primitives = buildFreeformPrimitives(header, footer, inputs, style);

  return {
    type: "freeform",
    item: inputs,
    bounds: rcdOuter,
    style,
    responsiveScale,
    overflow: content.overflow,
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    header,
    footer,
    rcdContentOuter: content.rcdContentOuter,
    rcdContentInner: content.rcdContentInner,
    mLayout: content.mLayout,
    gaps: content.gaps,
  };
}

function buildFreeformPrimitives(
  header: ReturnType<typeof measureHeader>,
  footer: ReturnType<typeof measureFooter>,
  inputs: FreeformPageInputs,
  s: MergedFreeformStyle,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];

  if (header) {
    primitives.push(...buildHeaderPrimitives(header, inputs, s));
  }

  if (footer) {
    primitives.push(...buildFooterPrimitives(footer, inputs, s));
  }

  return primitives;
}
