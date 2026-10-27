// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
import { measureContentBox } from "./content_box.ts";
import { buildFooterPrimitives, type MeasuredFooter } from "./footer.ts";
import { buildHeaderPrimitives, type MeasuredHeader } from "./header.ts";
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
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredFreeformPage {
  const box = measureContentBox(rc, rcdOuter, inputs, style);
  const content = measureContent(rc, box.rcdContentInner, inputs, style);
  const primitives = buildFreeformPrimitives(
    box.header,
    box.footer,
    inputs,
    style,
  );

  return {
    type: "freeform",
    item: inputs,
    bounds: rcdOuter,
    style,
    overflow: content.overflow,
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    header: box.header,
    footer: box.footer,
    rcdContentOuter: box.rcdContentOuter,
    rcdContentInner: box.rcdContentInner,
    mLayout: content.mLayout,
    gaps: content.gaps,
  };
}

function buildFreeformPrimitives(
  header: MeasuredHeader | undefined,
  footer: MeasuredFooter | undefined,
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
