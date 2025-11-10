// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Dimensions,
  type MeasuredText,
  type MergedLegendStyle,
  type RenderContext,
} from "../deps.ts";
import type { LegendItem } from "./types.ts";
import { getLegendItemsInGroups } from "./utils.ts";

export type MeasuredLegend = {
  dimensions: Dimensions;
  groups: {
    allMeasuredLines: MeasuredText[];
    legendItemsThisGroup: LegendItem[];
    wThisGroupLabels: number;
  }[];
  colorBoxWidthOrPointWidth: number;
  s: MergedLegendStyle;
};

export function measureLegend(
  rc: RenderContext,
  legendItems: LegendItem[],
  s: MergedLegendStyle,
): MeasuredLegend {
  const legendItemsInGroups = getLegendItemsInGroups(
    s.reverseOrder ? legendItems.toReversed() : legendItems,
    s.maxLegendItemsInOneColumn,
  );
  let legendW = 0;
  let legendH = 0;
  const anyPoints = legendItems.some(
    (li) =>
      li.pointStyle !== undefined &&
      li.pointStyle !== "as-block" &&
      li.pointStyle !== "as-line",
  );
  const colorBoxWidthOrPointWidth = anyPoints
    ? s.legendPointRadius * 2 + s.legendPointStrokeWidth
    : s.legendColorBoxWidth;
  const groups = legendItemsInGroups.map((legendItemsThisGroup) => {
    let wThisGroupLabels = 0;
    let hThisGroup = 0;
    const allMeasuredLines = legendItemsThisGroup.map((legendItem) => {
      const m = rc.mText(legendItem.label, s.text, Number.POSITIVE_INFINITY);
      wThisGroupLabels = Math.max(wThisGroupLabels, m.dims.w());
      hThisGroup += m.dims.h();
      return m;
    });
    hThisGroup += (legendItemsThisGroup.length - 1) * s.legendItemVerticalGap;
    legendW += colorBoxWidthOrPointWidth + s.legendLabelGap + wThisGroupLabels;
    legendH = Math.max(legendH, hThisGroup);
    return { allMeasuredLines, legendItemsThisGroup, wThisGroupLabels };
  });
  legendW += (groups.length - 1) * (2 * s.legendLabelGap);
  return {
    dimensions: new Dimensions({ w: legendW, h: legendH }),
    groups,
    colorBoxWidthOrPointWidth,
    s,
  };
}
