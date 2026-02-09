// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MeasuredText,
  MergedPageStyle,
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

  const mWatermark = inputs.watermark?.trim()
    ? rc.mText(inputs.watermark.trim(), s.text.watermark, rcdOuter.w())
    : undefined;

  const primitives = buildFreeformPrimitives(
    header,
    footer,
    inputs,
    s,
    rcdOuter,
    mWatermark,
  );

  return {
    type: "freeform",
    item: inputs,
    bounds: rcdOuter,
    mergedPageStyle: s,
    responsiveScale,
    overflow: content.overflow,
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
  s: MergedPageStyle,
  bounds: RectCoordsDims,
  mWatermark?: MeasuredText,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];

  if (header) {
    primitives.push(...buildHeaderPrimitives(header, inputs, s));
  }

  if (footer) {
    primitives.push(...buildFooterPrimitives(footer, inputs, s));
  }

  if (mWatermark) {
    primitives.push({
      type: "text",
      id: "freeformWatermark",
      mText: mWatermark,
      x: bounds.centerX(),
      y: bounds.centerY(),
      hAlign: "center",
      vAlign: "center",
    });
  }

  return primitives;
}
