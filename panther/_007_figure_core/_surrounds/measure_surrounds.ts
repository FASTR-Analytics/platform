// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type CustomFigureStyle,
  type DataAxis,
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
import { isArrayOfLegendItems } from "../_legend/types.ts";
import {
  isConcreteScaleLegendConfig,
  type LegendInput,
} from "../_legend/scale_legend_types.ts";
import type { LegendItem } from "../types.ts";

export function estimateMinSurroundsWidth(
  rc: RenderContext,
  cs: CustomFigureStyle,
  legendLabels: LegendInput | undefined,
  series?: DataAxis,
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

  const legendItems = getLegendItems(
    legendLabels,
    sSurrounds.legend,
    series,
  );
  if (!legendItems) {
    return sSurrounds.padding.totalPx();
  }

  // Laid out as measureSurrounds lays out a right legend: no available
  // width, so the legend wraps into columns at maxLegendItemsInOneColumn.
  const mLegend = measureLegend(rc, legendItems, sSurrounds.legend);
  return sSurrounds.padding.totalPx() + mLegend.dimensions.w() +
    sSurrounds.legendGap;
}

export type MeasuredSurroundsLegend =
  | {
    type: "items";
    rcd: RectCoordsDims;
    mLegend: MeasuredLegend;
    // The dimension of the series its entries' ids name.
    seriesDimension: string | undefined;
  }
  | { type: "scale"; rcd: RectCoordsDims; mScaleLegend: MeasuredScaleLegend };

export type MeasuredSurrounds = {
  caption?: {
    rcd: RectCoordsDims;
    mCaption: MeasuredText;
  };
  subCaption?: {
    rcd: RectCoordsDims;
    mSubCaption: MeasuredText;
  };
  footnote?: {
    rcd: RectCoordsDims;
    mFootnotes: MeasuredText[];
  };
  contentRcd: RectCoordsDims;
  outerRcd: RectCoordsDims;
  extraHeightDueToSurrounds: number;
  legend?: MeasuredSurroundsLegend;
  s: MergedSurroundsStyle;
};

export function measureSurrounds(
  rc: RenderContext,
  rcd: RectCoordsDims,
  cs: CustomFigureStyle,
  caption: string | undefined,
  subCaption: string | undefined,
  footnote: string | string[] | undefined,
  legendLabels: LegendInput | undefined,
  series?: DataAxis,
): MeasuredSurrounds {
  const sSurrounds = cs.getMergedSurroundsStyle();
  const innerRcd = rcd.getPadded(sSurrounds.padding);

  // Caption
  let captionAndCaptionGapH = 0;
  let mCaption = undefined;
  let captionRcd = undefined;

  if (caption?.trim()) {
    mCaption = rc.mText(caption.trim(), sSurrounds.text.caption, innerRcd.w());
    captionAndCaptionGapH = mCaption.dims.h();
    captionRcd = innerRcd.getAdjusted({ h: mCaption.dims.h() });
  }

  // Sub-caption
  let subCaptionAndSubCaptionGapH = 0;
  let mSubCaption = undefined;
  let subCaptionRcd = undefined;

  if (subCaption?.trim()) {
    const subCaptionTopPadding = mCaption ? sSurrounds.subCaptionTopPadding : 0;
    mSubCaption = rc.mText(
      subCaption.trim(),
      sSurrounds.text.subCaption,
      innerRcd.w(),
    );
    subCaptionAndSubCaptionGapH = mSubCaption.dims.h() + subCaptionTopPadding;
    subCaptionRcd = innerRcd.getAdjusted({
      y: innerRcd.y() +
        (captionRcd && mCaption ? mCaption.dims.h() : 0) +
        subCaptionTopPadding,
      h: mSubCaption.dims.h(),
    });
  }

  if (mCaption || mSubCaption) {
    captionAndCaptionGapH += sSurrounds.captionGap;
  }

  // Footnote
  let footnoteTotalH = 0;
  let footnoteTotalHAndFootnoteGapH = 0;
  const mFootnotes: MeasuredText[] = [];
  let footnoteRcd = undefined;

  if (footnote) {
    const goodFootnoteArray = footnote instanceof Array ? footnote : [footnote];
    for (const goodFootnote of goodFootnoteArray) {
      const mFootnote = rc.mText(
        goodFootnote.trim(),
        sSurrounds.text.footnote,
        innerRcd.w(),
      );
      const footnoteH = mFootnote.dims.h();
      mFootnotes.push(mFootnote);
      footnoteTotalH += footnoteH;
    }
    footnoteTotalHAndFootnoteGapH = footnoteTotalH + sSurrounds.footnoteGap;
    footnoteRcd = innerRcd.getAdjusted((prev) => {
      return { h: footnoteTotalH, y: prev.bottomY() - footnoteTotalH };
    });
  }

  const chartAndLegendRcd = innerRcd.getAdjusted((prev) => ({
    y: prev.y() + captionAndCaptionGapH + subCaptionAndSubCaptionGapH,
    h: prev.h() -
      (captionAndCaptionGapH +
        subCaptionAndSubCaptionGapH +
        footnoteTotalHAndFootnoteGapH),
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
    const legendItems = getLegendItems(
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
        isBottom ? chartAndLegendRcd.w() : undefined,
      );

      legendAndLegendGapH = isBottom
        ? mScaleLegend.dimensions.h() + sSurrounds.legendGap
        : 0;
      legendAndLegendGapW = isRight
        ? mScaleLegend.dimensions.w() + sSurrounds.legendGap
        : 0;

      const { x, y } = positionLegend(
        chartAndLegendRcd,
        mScaleLegend.dimensions,
        sSurrounds.legendPosition,
        isBottom,
        isRight,
      );
      const legendRcd = mScaleLegend.dimensions.asRectCoordsDims(
        new Coordinates({ x, y }),
      );
      legend = { type: "scale", rcd: legendRcd, mScaleLegend };
    } else if (legendItems) {
      const mLegend = measureLegend(
        rc,
        legendItems,
        sSurrounds.legend,
        isBottom ? chartAndLegendRcd.w() : undefined,
      );

      legendAndLegendGapH = isBottom
        ? mLegend.dimensions.h() + sSurrounds.legendGap
        : 0;
      legendAndLegendGapW = isRight
        ? mLegend.dimensions.w() + sSurrounds.legendGap
        : 0;

      const { x, y } = positionLegend(
        chartAndLegendRcd,
        mLegend.dimensions,
        sSurrounds.legendPosition,
        isBottom,
        isRight,
      );
      const legendRcd = mLegend.dimensions.asRectCoordsDims(
        new Coordinates({ x, y }),
      );
      legend = {
        type: "items",
        rcd: legendRcd,
        mLegend,
        seriesDimension: series?.dimension,
      };
    }
  }

  const contentRcd = chartAndLegendRcd.getAdjusted((prev) => ({
    h: prev.h() - legendAndLegendGapH,
    w: prev.w() - legendAndLegendGapW,
  }));

  return {
    caption: captionRcd && mCaption
      ? {
        rcd: captionRcd,
        mCaption,
      }
      : undefined,
    subCaption: subCaptionRcd && mSubCaption
      ? {
        rcd: subCaptionRcd,
        mSubCaption,
      }
      : undefined,
    footnote: footnoteRcd && mFootnotes.length > 0
      ? {
        rcd: footnoteRcd,
        mFootnotes,
      }
      : undefined,
    contentRcd,
    outerRcd: rcd,
    extraHeightDueToSurrounds: rcd.h() - contentRcd.h(),
    legend,
    s: sSurrounds,
  };
}

function positionLegend(
  chartAndLegendRcd: RectCoordsDims,
  legendDims: { w: () => number; h: () => number },
  legendPosition: string,
  isBottom: boolean,
  isRight: boolean,
): { x: number; y: number } {
  const x = chartAndLegendRcd.x() +
    (isRight
      ? chartAndLegendRcd.w() - legendDims.w()
      : legendPosition === "bottom-left"
      ? 0
      : legendPosition === "bottom-center"
      ? (chartAndLegendRcd.w() - legendDims.w()) / 2
      : chartAndLegendRcd.w() - legendDims.w());
  const y = chartAndLegendRcd.y() +
    (isBottom
      ? chartAndLegendRcd.h() - legendDims.h()
      : legendPosition === "right-top"
      ? 0
      : legendPosition === "right-center"
      ? (chartAndLegendRcd.h() - legendDims.h()) / 2
      : chartAndLegendRcd.h() - legendDims.h());
  return { x, y };
}

// undefined when the input draws no item legend: a scale legend or no labels.
function getLegendItems(
  legendLabels: LegendInput,
  sLegend: MergedLegendStyle,
  series: DataAxis | undefined,
): LegendItem[] | undefined {
  if (!Array.isArray(legendLabels) || legendLabels.length === 0) {
    return undefined;
  }
  if (isArrayOfLegendItems(legendLabels)) {
    return legendLabels;
  }
  return legendLabels.map((label, i_label, arr_label) => ({
    id: series?.headers[i_label]?.id,
    label,
    color: sLegend.seriesColorFunc({
      i_series: i_label,
      isFirstSeries: i_label === 0,
      isLastSeries: i_label === arr_label.length - 1,
      seriesHeader: series?.headers[i_label] ?? { id: label, label },
      nSerieses: arr_label.length,
      seriesValArrays: [],
      nVals: 0,
      i_lane: 0,
      nLanes: 0,
      laneHeader: undefined,
      i_tier: 0,
      nTiers: 0,
      tierHeader: undefined,
      i_pane: 0,
      nPanes: 0,
      paneHeader: undefined,
    }),
  }));
}
