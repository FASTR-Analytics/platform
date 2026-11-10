// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  HeaderItem,
  MergedGridStyle,
  MergedYTextAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { SIZING_SAMPLE } from "../../dimension_helpers.ts";
import type { YTextAxisWidthInfo } from "./types.ts";

function measureYTextAxisWidth(
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
  tickLabelW: number,
  tierHeaderAndLabelGapWidth: number,
): number {
  return tierHeaderAndLabelGapWidth + tickLabelW + sy.tickLabelGap +
    sy.tickWidth + sg.axisStrokeWidth;
}

export function estimateMinYTextAxisWidth(
  rc: RenderContext,
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
  tierHeaderAndLabelGapWidth: number,
): number {
  const sample = rc.mText(
    SIZING_SAMPLE.textTick,
    sy.text.yTextAxisTickLabels,
    Infinity,
  );
  return measureYTextAxisWidth(
    sy,
    sg,
    sample.dims.w(),
    tierHeaderAndLabelGapWidth,
  );
}

export function measureYTextAxisWidthInfo(
  rc: RenderContext,
  indicatorHeaders: HeaderItem[],
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
  contentRcd: RectCoordsDims,
  tierHeaderAndLabelGapWidth: number,
): YTextAxisWidthInfo {
  const maxWidth = contentRcd.w() * sy.maxTickLabelWidthAsPctOfChart;
  let maxTickLabelW = 0;
  let maxTickLabelH = 0;
  for (const h of indicatorHeaders) {
    const m = rc.mText(h.label, sy.text.yTextAxisTickLabels, maxWidth);
    if (m.dims.w() > maxTickLabelW) maxTickLabelW = m.dims.w();
    if (m.dims.h() > maxTickLabelH) maxTickLabelH = m.dims.h();
  }
  const widthIncludingYAxisStrokeWidth = measureYTextAxisWidth(
    sy,
    sg,
    maxTickLabelW,
    tierHeaderAndLabelGapWidth,
  );

  return {
    widthIncludingYAxisStrokeWidth,
    halfYAxisTickLabelH: maxTickLabelH / 2,
    maxTickLabelW,
    nIndicators: indicatorHeaders.length,
  };
}
