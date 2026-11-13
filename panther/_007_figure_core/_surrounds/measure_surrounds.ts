// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type CustomFigureStyle,
  type DataDimension,
  type MeasuredText,
  type MergedLegendStyle,
  type MergedSurroundsStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import {
  type MeasuredLegend,
  measureLegend,
} from "../_legend/measure_legend.ts";
import {
  type MeasuredScaleLegend,
  measureScaleLegend,
} from "../_legend/measure_scale_legend.ts";
import { isArrayOfLegendEntries } from "../_legend/types.ts";
import {
  isConcreteScaleLegendConfig,
  type LegendInput,
} from "../_legend/scale_legend_types.ts";
import type { LegendEntry } from "../types.ts";

export function estimateMinSurroundsWidth(
  rc: RenderContext,
  cs: CustomFigureStyle,
  legendLabels: LegendInput | undefined,
  series?: DataDimension,
): number {
  const sSurrounds = cs.getMergedSurroundsStyle();

  const isRightLegend = ["right-top", "right-center", "right-bottom"].includes(
    sSurrounds.legendPosition,
  );
  if (!isRightLegend) {
    return sSurrounds.padding.totalPx();
  }

  if (!legendLabels || sSurrounds.legendPosition === "none") {
    return sSurrounds.padding.totalPx();
  }

  if (isConcreteScaleLegendConfig(legendLabels)) {
    const sScaleLegend = cs.getMergedScaleLegendStyle();
    const mScaleLegend = measureScaleLegend(rc, legendLabels, sScaleLegend);
    return sSurrounds.padding.totalPx() + mScaleLegend.dimensions.w() +
      sSurrounds.legendGap;
  }

  const legendEntries = getLegendEntries(
    legendLabels,
    sSurrounds.legend,
    series,
  );
  if (!legendEntries) {
    return sSurrounds.padding.totalPx();
  }

  // Laid out as measureSurrounds lays out a right legend: no available
  // width, so the legend wraps into columns at maxLegendEntriesInOneColumn.
  const mLegend = measureLegend(rc, legendEntries, sSurrounds.legend);
  return sSurrounds.padding.totalPx() + mLegend.dimensions.w() +
    sSurrounds.legendGap;
}

export type MeasuredSurroundsLegend =
  | {
    type: "entries";
    rcd: RectCoordsDims;
    mLegend: MeasuredLegend;
    // The dimension of the series its entries' ids name.
    seriesDimension: string | undefined;
  }
  | { type: "scale"; rcd: RectCoordsDims; mScaleLegend: MeasuredScaleLegend };

export type MeasuredSurrounds = {
  title?: {
    rcd: RectCoordsDims;
    mTitle: MeasuredText;
  };
  subtitle?: {
    rcd: RectCoordsDims;
    mSubtitle: MeasuredText;
  };
  footnote?: {
    rcd: RectCoordsDims;
    mFootnotes: MeasuredText[];
  };
  bodyRcd: RectCoordsDims;
  bounds: RectCoordsDims;
  extraHeightDueToSurrounds: number;
  legend?: MeasuredSurroundsLegend;
  s: MergedSurroundsStyle;
};

export function measureSurrounds(
  rc: RenderContext,
  rcd: RectCoordsDims,
  cs: CustomFigureStyle,
  title: string | undefined,
  subtitle: string | undefined,
  footnote: string | string[] | undefined,
  legendLabels: LegendInput | undefined,
  series?: DataDimension,
): MeasuredSurrounds {
  const sSurrounds = cs.getMergedSurroundsStyle();
  const paddedRcd = rcd.getPadded(sSurrounds.padding);

  // Title
  let titleAndGapHeight = 0;
  let mTitle = undefined;
  let titleRcd = undefined;

  if (title?.trim()) {
    mTitle = rc.mText(title.trim(), sSurrounds.text.title, paddedRcd.w());
    titleAndGapHeight = mTitle.dims.h();
    titleRcd = paddedRcd.getAdjusted({ h: mTitle.dims.h() });
  }

  // Sub-title
  let subtitleAndTopPaddingHeight = 0;
  let mSubtitle = undefined;
  let subtitleRcd = undefined;

  if (subtitle?.trim()) {
    const subtitleTopPadding = mTitle ? sSurrounds.subtitleTopPadding : 0;
    mSubtitle = rc.mText(
      subtitle.trim(),
      sSurrounds.text.subtitle,
      paddedRcd.w(),
    );
    subtitleAndTopPaddingHeight = mSubtitle.dims.h() + subtitleTopPadding;
    subtitleRcd = paddedRcd.getAdjusted({
      y: paddedRcd.y() +
        (titleRcd && mTitle ? mTitle.dims.h() : 0) +
        subtitleTopPadding,
      h: mSubtitle.dims.h(),
    });
  }

  if (mTitle || mSubtitle) {
    titleAndGapHeight += sSurrounds.titleGap;
  }

  // Footnote
  let footnoteTotalH = 0;
  let footnoteAndGapHeight = 0;
  const mFootnotes: MeasuredText[] = [];
  let footnoteRcd = undefined;

  if (footnote) {
    const goodFootnoteArray = footnote instanceof Array ? footnote : [footnote];
    for (const goodFootnote of goodFootnoteArray) {
      const mFootnote = rc.mText(
        goodFootnote.trim(),
        sSurrounds.text.footnote,
        paddedRcd.w(),
      );
      const footnoteH = mFootnote.dims.h();
      mFootnotes.push(mFootnote);
      footnoteTotalH += footnoteH;
    }
    footnoteAndGapHeight = footnoteTotalH + sSurrounds.footnoteGap;
    footnoteRcd = paddedRcd.getAdjusted((prev) => {
      return { h: footnoteTotalH, y: prev.bottomY() - footnoteTotalH };
    });
  }

  const bodyAndLegendRcd = paddedRcd.getAdjusted((prev) => ({
    y: prev.y() + titleAndGapHeight + subtitleAndTopPaddingHeight,
    h: prev.h() -
      (titleAndGapHeight +
        subtitleAndTopPaddingHeight +
        footnoteAndGapHeight),
  }));

  // Legend
  let legendAndLegendGapW = 0;
  let legendAndLegendGapH = 0;
  let legend: MeasuredSurroundsLegend | undefined = undefined;

  if (legendLabels && sSurrounds.legendPosition !== "none") {
    const isBottom = ["bottom-left", "bottom-center", "bottom-right"].includes(
      sSurrounds.legendPosition,
    );
    const isRight = ["right-top", "right-center", "right-bottom"].includes(
      sSurrounds.legendPosition,
    );
    const legendEntries = getLegendEntries(
      legendLabels,
      sSurrounds.legend,
      series,
    );

    if (isConcreteScaleLegendConfig(legendLabels)) {
      const sScaleLegend = cs.getMergedScaleLegendStyle();
      const mScaleLegend = measureScaleLegend(
        rc,
        legendLabels,
        sScaleLegend,
        isBottom ? bodyAndLegendRcd.w() : undefined,
      );

      legendAndLegendGapH = isBottom
        ? mScaleLegend.dimensions.h() + sSurrounds.legendGap
        : 0;
      legendAndLegendGapW = isRight
        ? mScaleLegend.dimensions.w() + sSurrounds.legendGap
        : 0;

      const { x, y } = positionLegend(
        bodyAndLegendRcd,
        mScaleLegend.dimensions,
        sSurrounds.legendPosition,
        isBottom,
        isRight,
      );
      const legendRcd = mScaleLegend.dimensions.asRectCoordsDims(
        new Coordinates({ x, y }),
      );
      legend = { type: "scale", rcd: legendRcd, mScaleLegend };
    } else if (legendEntries) {
      const mLegend = measureLegend(
        rc,
        legendEntries,
        sSurrounds.legend,
        isBottom ? bodyAndLegendRcd.w() : undefined,
      );

      legendAndLegendGapH = isBottom
        ? mLegend.dimensions.h() + sSurrounds.legendGap
        : 0;
      legendAndLegendGapW = isRight
        ? mLegend.dimensions.w() + sSurrounds.legendGap
        : 0;

      const { x, y } = positionLegend(
        bodyAndLegendRcd,
        mLegend.dimensions,
        sSurrounds.legendPosition,
        isBottom,
        isRight,
      );
      const legendRcd = mLegend.dimensions.asRectCoordsDims(
        new Coordinates({ x, y }),
      );
      legend = {
        type: "entries",
        rcd: legendRcd,
        mLegend,
        seriesDimension: series?.name,
      };
    }
  }

  const bodyRcd = bodyAndLegendRcd.getAdjusted((prev) => ({
    h: prev.h() - legendAndLegendGapH,
    w: prev.w() - legendAndLegendGapW,
  }));

  return {
    title: titleRcd && mTitle
      ? {
        rcd: titleRcd,
        mTitle,
      }
      : undefined,
    subtitle: subtitleRcd && mSubtitle
      ? {
        rcd: subtitleRcd,
        mSubtitle,
      }
      : undefined,
    footnote: footnoteRcd && mFootnotes.length > 0
      ? {
        rcd: footnoteRcd,
        mFootnotes,
      }
      : undefined,
    bodyRcd,
    bounds: rcd,
    extraHeightDueToSurrounds: rcd.h() - bodyRcd.h(),
    legend,
    s: sSurrounds,
  };
}

function positionLegend(
  bodyAndLegendRcd: RectCoordsDims,
  legendDims: { w: () => number; h: () => number },
  legendPosition: string,
  isBottom: boolean,
  isRight: boolean,
): { x: number; y: number } {
  const x = bodyAndLegendRcd.x() +
    (isRight
      ? bodyAndLegendRcd.w() - legendDims.w()
      : legendPosition === "bottom-left"
      ? 0
      : legendPosition === "bottom-center"
      ? (bodyAndLegendRcd.w() - legendDims.w()) / 2
      : bodyAndLegendRcd.w() - legendDims.w());
  const y = bodyAndLegendRcd.y() +
    (isBottom
      ? bodyAndLegendRcd.h() - legendDims.h()
      : legendPosition === "right-top"
      ? 0
      : legendPosition === "right-center"
      ? (bodyAndLegendRcd.h() - legendDims.h()) / 2
      : bodyAndLegendRcd.h() - legendDims.h());
  return { x, y };
}

// undefined when the input draws no legend of entries: a scale legend or no labels.
function getLegendEntries(
  legendLabels: LegendInput,
  sLegend: MergedLegendStyle,
  series: DataDimension | undefined,
): LegendEntry[] | undefined {
  if (!Array.isArray(legendLabels) || legendLabels.length === 0) {
    return undefined;
  }
  if (isArrayOfLegendEntries(legendLabels)) {
    return legendLabels;
  }
  return legendLabels.map((label, i_label, arr_label) => ({
    id: series?.members[i_label]?.id,
    label,
    color: sLegend.seriesColorFunc({
      i_series: i_label,
      isFirstSeries: i_label === 0,
      isLastSeries: i_label === arr_label.length - 1,
      seriesMember: series?.members[i_label] ?? { id: label, label },
      nSerieses: arr_label.length,
      seriesValueArrays: [],
      nValues: 0,
      i_lane: 0,
      nLanes: 0,
      laneMember: undefined,
      i_tier: 0,
      nTiers: 0,
      tierMember: undefined,
      i_pane: 0,
      nPanes: 0,
      paneMember: undefined,
    }),
  }));
}
