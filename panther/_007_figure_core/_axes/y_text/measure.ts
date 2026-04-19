// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedYTextAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YTextAxisWidthInfo } from "./types.ts";

export function estimateMinYTextAxisWidth(
  rc: RenderContext,
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
): number {
  const sample = rc.mText("Category", sy.text.yTextAxisTickLabels, Infinity);
  return sample.dims.w() + sy.tickLabelGap + sy.tickWidth + sg.axisStrokeWidth;
}

export function measureYTextAxisWidthInfo(
  rc: RenderContext,
  indicatorHeaders: string[],
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
  contentRcd: RectCoordsDims,
  tierHeaderAndLabelGapWidth: number,
): YTextAxisWidthInfo {
  const maxWidth = contentRcd.w() * sy.maxTickLabelWidthAsPctOfChart;
  let maxTickLabelW = 0;
  let maxTickLabelH = 0;
  for (const h of indicatorHeaders) {
    const m = rc.mText(h, sy.text.yTextAxisTickLabels, maxWidth);
    if (m.dims.w() > maxTickLabelW) maxTickLabelW = m.dims.w();
    if (m.dims.h() > maxTickLabelH) maxTickLabelH = m.dims.h();
  }
  const widthIncludingYAxisStrokeWidth = tierHeaderAndLabelGapWidth +
    maxTickLabelW +
    sy.tickLabelGap +
    sy.tickWidth +
    sg.axisStrokeWidth;

  return {
    widthIncludingYAxisStrokeWidth,
    halfYAxisTickLabelH: maxTickLabelH / 2,
    maxTickLabelW,
    nIndicators: indicatorHeaders.length,
  };
}
