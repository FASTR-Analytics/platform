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
  availableWidth?: number,
): MeasuredLegend {
  const orderedItems = s.reverseOrder ? legendItems.toReversed() : legendItems;
  const anyPoints = legendItems.some(
    (li) =>
      li.pointStyle !== undefined &&
      li.pointStyle !== "as-block" &&
      li.pointStyle !== "as-line",
  );
  const colorBoxWidthOrPointWidth = anyPoints
    ? s.legendPointRadius * 2 + s.legendPointStrokeWidth
    : s.legendColorBoxWidth;

  // Helper function to measure with a specific items per column value and text style
  function measureWithItemsPerColumn(
    itemsPerColumn: number | number[],
    textStyle = s.text,
  ) {
    const legendItemsInGroups = getLegendItemsInGroups(
      orderedItems,
      itemsPerColumn,
    );
    let legendW = 0;
    let legendH = 0;
    const groups = legendItemsInGroups.map((legendItemsThisGroup) => {
      let wThisGroupLabels = 0;
      let hThisGroup = 0;
      const allMeasuredLines = legendItemsThisGroup.map((legendItem) => {
        const m = rc.mText(
          legendItem.label,
          textStyle,
          Number.POSITIVE_INFINITY,
        );
        wThisGroupLabels = Math.max(wThisGroupLabels, m.dims.w());
        hThisGroup += m.dims.h();
        return m;
      });
      hThisGroup += (legendItemsThisGroup.length - 1) * s.legendItemVerticalGap;
      legendW += colorBoxWidthOrPointWidth + s.legendLabelGap +
        wThisGroupLabels;
      legendH = Math.max(legendH, hThisGroup);
      return { allMeasuredLines, legendItemsThisGroup, wThisGroupLabels };
    });
    legendW += (groups.length - 1) * (2 * s.legendLabelGap);
    return { legendW, legendH, groups };
  }

  // Initial measurement
  let result = measureWithItemsPerColumn(s.maxLegendItemsInOneColumn);

  // If width constraint provided and exceeded, and max is a number (not array), try to fit
  if (
    availableWidth !== undefined &&
    result.legendW > availableWidth &&
    typeof s.maxLegendItemsInOneColumn === "number"
  ) {
    let itemsPerColumn = s.maxLegendItemsInOneColumn;
    while (
      result.legendW > availableWidth &&
      itemsPerColumn < legendItems.length
    ) {
      itemsPerColumn++;
      result = measureWithItemsPerColumn(itemsPerColumn);
    }

    // If still exceeds width even with all items in one column, shrink text to fit
    if (result.legendW > availableWidth) {
      const scaleFactor = availableWidth / result.legendW;
      const scaledTextStyle = {
        ...s.text,
        fontSize: s.text.fontSize * scaleFactor,
        lineHeight: s.text.lineHeight * scaleFactor,
      };
      result = measureWithItemsPerColumn(itemsPerColumn, scaledTextStyle);
    }
  }

  return {
    dimensions: new Dimensions({ w: result.legendW, h: result.legendH }),
    groups: result.groups,
    colorBoxWidthOrPointWidth,
    s,
  };
}
