// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MergedFreeformStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "../../deps.ts";
import { type MeasuredFooter, measureFooter } from "./footer.ts";
import { type MeasuredHeader, measureHeader } from "./header.ts";
import type { HeaderFooterInputs } from "../../types.ts";

export type MeasuredContentBox = {
  header: MeasuredHeader | undefined;
  footer: MeasuredFooter | undefined;
  rcdContentOuter: RectCoordsDims;
  rcdContentInner: RectCoordsDims;
};

export function measureContentBox(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: HeaderFooterInputs,
  s: MergedFreeformStyle,
): MeasuredContentBox {
  const header = measureHeader(rc, rcdOuter, inputs, s);
  const footer = measureFooter(rc, rcdOuter, inputs, s);
  const headerHeight = header?.rcdHeaderOuter.h() ?? 0;
  const footerHeight = footer?.rcdFooterOuter.h() ?? 0;

  const rcdContentOuter = new RectCoordsDims([
    rcdOuter.x(),
    rcdOuter.y() + headerHeight,
    rcdOuter.w(),
    rcdOuter.h() - headerHeight - footerHeight,
  ]);

  return {
    header,
    footer,
    rcdContentOuter,
    rcdContentInner: rcdContentOuter.getPadded(new Padding(s.content.padding)),
  };
}
