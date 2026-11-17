// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Dimensions,
  type MeasuredText,
  type MergedLegendStyle,
  type RenderContext,
} from "../deps.ts";
import type { LegendEntry } from "./types.ts";
import { getLegendEntriesInGroups } from "./utils.ts";

export type MeasuredLegend = {
  dimensions: Dimensions;
  groups: {
    allMeasuredLines: MeasuredText[];
    legendEntriesThisGroup: LegendEntry[];
    wThisGroupLabels: number;
  }[];
  colorBoxWidthOrPointWidth: number;
  s: MergedLegendStyle;
};

export function measureLegend(
  rc: RenderContext,
  legendEntries: LegendEntry[],
  s: MergedLegendStyle,
  availableWidth?: number,
): MeasuredLegend {
  const orderedEntries = s.reverseOrder
    ? legendEntries.toReversed()
    : legendEntries;
  const anyPoints = legendEntries.some(
    (entry) =>
      entry.pointStyle !== undefined &&
      entry.pointStyle !== "as-block" &&
      entry.pointStyle !== "as-line",
  );
  const colorBoxWidthOrPointWidth = anyPoints
    ? s.legendPointRadius * 2 + s.legendPointStrokeWidth
    : s.legendColorBoxWidth;

  // Helper function to measure with a specific entries per column value and text style
  function measureWithEntriesPerColumn(
    entriesPerColumn: number | number[],
    textStyle = s.text,
  ) {
    const legendEntriesInGroups = getLegendEntriesInGroups(
      orderedEntries,
      entriesPerColumn,
    );
    let legendW = 0;
    let legendH = 0;
    const groups = legendEntriesInGroups.map((legendEntriesThisGroup) => {
      let wThisGroupLabels = 0;
      let hThisGroup = 0;
      const allMeasuredLines = legendEntriesThisGroup.map((legendEntry) => {
        const m = rc.mText(
          legendEntry.label,
          textStyle,
          Number.POSITIVE_INFINITY,
        );
        wThisGroupLabels = Math.max(wThisGroupLabels, m.dims.w());
        hThisGroup += m.dims.h();
        return m;
      });
      hThisGroup += (legendEntriesThisGroup.length - 1) *
        s.legendEntryVerticalGap;
      legendW += colorBoxWidthOrPointWidth + s.legendLabelGap +
        wThisGroupLabels;
      legendH = Math.max(legendH, hThisGroup);
      return { allMeasuredLines, legendEntriesThisGroup, wThisGroupLabels };
    });
    legendW += (groups.length - 1) * (2 * s.legendLabelGap);
    return { legendW, legendH, groups };
  }

  // Initial measurement
  let result = measureWithEntriesPerColumn(s.maxLegendEntriesInOneColumn);

  // If width constraint provided and exceeded, and max is a number (not array), try to fit
  if (
    availableWidth !== undefined &&
    result.legendW > availableWidth &&
    typeof s.maxLegendEntriesInOneColumn === "number"
  ) {
    let entriesPerColumn = s.maxLegendEntriesInOneColumn;
    while (
      result.legendW > availableWidth &&
      entriesPerColumn < legendEntries.length
    ) {
      entriesPerColumn++;
      result = measureWithEntriesPerColumn(entriesPerColumn);
    }

    // If still exceeds width even with all entries in one column, shrink text to fit
    if (result.legendW > availableWidth) {
      const scaleFactor = availableWidth / result.legendW;
      const scaledTextStyle = {
        ...s.text,
        fontSize: s.text.fontSize * scaleFactor,
      };
      result = measureWithEntriesPerColumn(entriesPerColumn, scaledTextStyle);
    }
  }

  return {
    dimensions: new Dimensions({ w: result.legendW, h: result.legendH }),
    groups: result.groups,
    colorBoxWidthOrPointWidth,
    s,
  };
}
