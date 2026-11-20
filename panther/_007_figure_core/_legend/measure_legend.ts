// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Dimensions,
  type MeasuredText,
  type MergedLegendStyle,
  type RenderContext,
  type TextInfoUnkeyed,
} from "../deps.ts";
import type { LegendEntry } from "./types.ts";
import { getLegendEntriesInGroups, getNColumnsNeeded } from "./utils.ts";

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

type MeasuredLegendEntry = { legendEntry: LegendEntry; mLabel: MeasuredText };

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

  // A label's size depends on its text style alone, so the labels are measured
  // once per style and every column layout tried reuses them.
  function measureLegendEntries(
    textStyle: TextInfoUnkeyed,
  ): MeasuredLegendEntry[] {
    return orderedEntries.map((legendEntry) => ({
      legendEntry,
      mLabel: rc.mText(legendEntry.label, textStyle, Number.POSITIVE_INFINITY),
    }));
  }

  function measureWithEntriesPerColumn(
    entriesPerColumn: number | number[],
    measuredLegendEntries: MeasuredLegendEntry[],
  ) {
    const legendEntriesInGroups = getLegendEntriesInGroups(
      measuredLegendEntries,
      entriesPerColumn,
    );
    let legendW = 0;
    let legendH = 0;
    const groups = legendEntriesInGroups.map((entriesThisGroup) => {
      let wThisGroupLabels = 0;
      let hThisGroup = 0;
      for (const { mLabel } of entriesThisGroup) {
        wThisGroupLabels = Math.max(wThisGroupLabels, mLabel.dims.w());
        hThisGroup += mLabel.dims.h();
      }
      hThisGroup += (entriesThisGroup.length - 1) * s.legendEntryVerticalGap;
      legendW += colorBoxWidthOrPointWidth + s.legendLabelGap +
        wThisGroupLabels;
      legendH = Math.max(legendH, hThisGroup);
      return {
        allMeasuredLines: entriesThisGroup.map((e) => e.mLabel),
        legendEntriesThisGroup: entriesThisGroup.map((e) => e.legendEntry),
        wThisGroupLabels,
      };
    });
    legendW += (groups.length - 1) * (2 * s.legendLabelGap);
    return { legendW, legendH, groups };
  }

  const measuredLegendEntries = measureLegendEntries(s.text);

  // Initial measurement
  let result = measureWithEntriesPerColumn(
    s.maxLegendEntriesInOneColumn,
    measuredLegendEntries,
  );

  // If width constraint provided and exceeded, and max is a number (not array), try to fit
  if (
    availableWidth !== undefined &&
    result.legendW > availableWidth &&
    typeof s.maxLegendEntriesInOneColumn === "number"
  ) {
    let entriesPerColumn = s.maxLegendEntriesInOneColumn;
    let nColumns = getNColumnsNeeded(legendEntries.length, entriesPerColumn);
    while (
      result.legendW > availableWidth &&
      entriesPerColumn < legendEntries.length
    ) {
      entriesPerColumn++;
      const nColumnsTried = nColumns;
      nColumns = getNColumnsNeeded(legendEntries.length, entriesPerColumn);
      // Entries per column change the layout only through the columns they
      // need, so a count that needs the columns just tried is not laid out
      // again.
      if (nColumns !== nColumnsTried) {
        result = measureWithEntriesPerColumn(
          entriesPerColumn,
          measuredLegendEntries,
        );
      }
    }

    // If still exceeds width even with all entries in one column, shrink text to fit
    if (result.legendW > availableWidth) {
      const scaleFactor = availableWidth / result.legendW;
      const scaledTextStyle = {
        ...s.text,
        fontSize: s.text.fontSize * scaleFactor,
      };
      result = measureWithEntriesPerColumn(
        entriesPerColumn,
        measureLegendEntries(scaledTextStyle),
      );
    }
  }

  return {
    dimensions: new Dimensions({ w: result.legendW, h: result.legendH }),
    groups: result.groups,
    colorBoxWidthOrPointWidth,
    s,
  };
}
