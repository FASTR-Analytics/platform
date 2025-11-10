// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type CustomFigureStyle,
  type MeasuredText,
  type MergedSurroundsStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import {
  isArrayOfLegendItems,
  type MeasuredLegend,
  measureLegend,
} from "../mod.ts";
import type { LegendItem } from "../types.ts";

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
  legend?: {
    rcd: RectCoordsDims;
    mLegend: MeasuredLegend;
  };
  s: MergedSurroundsStyle;
};

export function measureSurrounds(
  rc: RenderContext,
  rcd: RectCoordsDims,
  cs: CustomFigureStyle,
  caption: string | undefined,
  subCaption: string | undefined,
  footnote: string | string[] | undefined,
  legendLabels: LegendItem[] | string[] | undefined,
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
  let mLegend = undefined;
  let legendRcd = undefined;

  if (
    legendLabels &&
    legendLabels.length > 0 &&
    !(legendLabels.length === 1 && legendLabels[0] === "default") &&
    sSurrounds.legendPosition !== "none"
  ) {
    const sLegend = sSurrounds.legend;
    const legendItems: LegendItem[] = isArrayOfLegendItems(legendLabels)
      ? legendLabels
      : legendLabels.map((label, i_label, arr_label) => {
        return {
          label,
          color: sLegend.seriesColorFunc({
            i_series: i_label,
            seriesHeader: label,
            nSerieses: arr_label.length,
            // Other required properties with dummy/undefined values
            seriesValArrays: [],
            nVals: 0,
            i_lane: 0,
            nLanes: 0,
            i_tier: 0,
            nTiers: 0,
            i_pane: 0,
            nPanes: 0,
          }),
        };
      });

    mLegend = measureLegend(rc, legendItems, sLegend);

    const isBottom = ["bottom-left", "bottom-center", "bottom-right"].includes(
      sSurrounds.legendPosition,
    );
    const isRight = ["right-top", "right-center", "right-bottom"].includes(
      sSurrounds.legendPosition,
    );

    legendAndLegendGapH = isBottom
      ? mLegend.dimensions.h() + sSurrounds.legendGap
      : 0;
    legendAndLegendGapW = isRight
      ? mLegend.dimensions.w() + sSurrounds.legendGap
      : 0;

    const x = chartAndLegendRcd.x() +
      (isRight
        ? chartAndLegendRcd.w() - mLegend.dimensions.w()
        : sSurrounds.legendPosition === "bottom-left"
        ? 0
        : sSurrounds.legendPosition === "bottom-center"
        ? (chartAndLegendRcd.w() - mLegend.dimensions.w()) / 2
        : chartAndLegendRcd.w() - mLegend.dimensions.w());
    const y = chartAndLegendRcd.y() +
      (isBottom
        ? chartAndLegendRcd.h() - mLegend.dimensions.h()
        : sSurrounds.legendPosition === "right-top"
        ? 0
        : sSurrounds.legendPosition === "right-center"
        ? (chartAndLegendRcd.h() - mLegend.dimensions.h()) / 2
        : chartAndLegendRcd.h() - mLegend.dimensions.h());

    legendRcd = mLegend.dimensions.asRectCoordsDims(new Coordinates({ x, y }));
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
    legend: legendRcd && mLegend
      ? {
        rcd: legendRcd,
        mLegend,
      }
      : undefined,
    s: sSurrounds,
  };
}
