// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  measureYAxisLayout,
  measureYAxisWidthInfo,
} from "./_axes/measure_y_axis.ts";
import { measureXAxis } from "./_axes/measure_x_axis.ts";
import type {
  ChartLabelPrimitive,
  MeasuredText,
  MergedChartStyleBase,
  Primitive,
  RenderContext,
  TextInfoUnkeyed,
} from "./deps.ts";
import { Padding, RectCoordsDims, Z_INDEX } from "./deps.ts";
import type { MeasurePaneConfig } from "./measure_types.ts";
import type { YAxisWidthInfoBase } from "./types.ts";
import { generatePaneContentPrimitives } from "./generate_pane_content_primitives.ts";

export function measurePane<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
): Primitive[] {
  const i_pane = config.indices.pane;
  const baseStyle = config.baseStyle;
  const tierHeaders = config.dataProps.tierHeaders;
  const laneHeaders = config.dataProps.laneHeaders;
  const nTiers = tierHeaders.length;
  const headerPosition = baseStyle.tiers.headerPosition;

  const maxTierHeaderWidth = config.geometry.contentRcd.w() *
    baseStyle.tiers.maxHeaderWidthAsPctOfChart;

  const headerGap = baseStyle.tiers.headerGap;

  const {
    value: measuredTierHeaderGapWidth,
    measuredTexts: measuredTierHeaders,
  } = baseStyle.tiers.hideHeaders
    ? { value: 0, measuredTexts: [] }
    : measureTierHeaders(
      rc,
      nTiers,
      tierHeaders,
      baseStyle.text.tierHeaders,
      headerGap,
      maxTierHeaderWidth,
    );

  const tierHeaderAndLabelGapWidth = headerPosition !== "left"
    ? 0
    : measuredTierHeaderGapWidth;

  let tierHeaderAndLabelGapHeight = 0;
  if (headerPosition !== "left" && measuredTierHeaders.length > 0) {
    let maxH = 0;
    for (const mt of measuredTierHeaders) {
      maxH = Math.max(maxH, mt.dims.h());
    }
    tierHeaderAndLabelGapHeight = maxH + headerGap;
  }

  const yAxisWidthInfo = measureYAxisWidthInfo(
    rc,
    config.yAxisConfig,
    baseStyle.grid,
    config.geometry.contentRcd,
    i_pane,
    tierHeaderAndLabelGapWidth,
    nTiers,
  );

  const nLanes = laneHeaders.length;
  const lanes = baseStyle.lanes;
  const xAxisW = config.geometry.contentRcd.w() -
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;
  const subChartAreaWidth = (xAxisW -
    (lanes.paddingLeft + Math.max(0, nLanes - 1) * lanes.gapX +
      lanes.paddingRight)) /
    Math.max(1, nLanes);

  const xAxisMeasuredInfo = measureXAxis(
    rc,
    config.geometry.contentRcd,
    yAxisWidthInfo,
    subChartAreaWidth,
    config.xAxisConfig,
    baseStyle.grid,
    i_pane,
    nLanes,
  );

  const {
    value: laneHeaderTextHeight,
    measuredTexts: measuredLaneHeaders,
  } = baseStyle.lanes.hideHeaders
    ? { value: 0, measuredTexts: [] }
    : measureLaneHeaders(
      rc,
      subChartAreaWidth,
      laneHeaders,
      baseStyle,
    );
  const topHeightForLaneHeaders = laneHeaderTextHeight > 0
    ? laneHeaderTextHeight + baseStyle.lanes.headerGap
    : 0;

  const { yAxisRcd, subChartAreaHeight } = measureYAxisLayout(
    topHeightForLaneHeaders,
    xAxisMeasuredInfo.xAxisRcd.h(),
    yAxisWidthInfo,
    baseStyle.tiers,
    config.geometry.contentRcd,
    nTiers,
    tierHeaderAndLabelGapHeight,
  );

  const measured = {
    yAxisWidthInfo,
    xAxisMeasuredInfo,
    yAxisRcd,
    subChartAreaHeight,
    subChartAreaWidth,
    topHeightForLaneHeaders,
    tierHeaderAndLabelGapHeight,
  };

  const labelPrimitives: Primitive[] = [];

  if (config.paneHeader) {
    const panePadding = new Padding(baseStyle.panes.padding);
    const paneHeaderBounds = new RectCoordsDims({
      x: config.geometry.outerRcd.x() + panePadding.pl(),
      y: config.geometry.outerRcd.y() + panePadding.pt(),
      w: config.geometry.outerRcd.w() - panePadding.pl() - panePadding.pr(),
      h: config.paneHeader.dims.h(),
    });
    labelPrimitives.push({
      type: "chart-label",
      key: `pane-header-${i_pane}`,
      bounds: paneHeaderBounds,
      zIndex: Z_INDEX.LABEL,
      meta: { labelType: "pane", paneIndex: i_pane },
      mText: config.paneHeader,
      alignment: { h: baseStyle.panes.headerAlignH, v: "top" },
    });
  }

  labelPrimitives.push(
    ...tierHeaderLabelPrimitives(
      measuredTierHeaders,
      yAxisWidthInfo,
      yAxisRcd,
      subChartAreaHeight,
      tierHeaderAndLabelGapWidth,
      tierHeaderAndLabelGapHeight,
      baseStyle.tiers,
      config.geometry.contentRcd,
      i_pane,
    ),
  );

  const laneHeaderRcd = new RectCoordsDims({
    x: xAxisMeasuredInfo.xAxisRcd.x(),
    y: config.geometry.contentRcd.y(),
    w: config.geometry.contentRcd.rightX() - xAxisMeasuredInfo.xAxisRcd.x(),
    h: laneHeaderTextHeight,
  });
  labelPrimitives.push(
    ...laneHeaderLabelPrimitives(
      measuredLaneHeaders,
      laneHeaderRcd,
      subChartAreaWidth,
      lanes.paddingLeft,
      lanes.gapX,
      lanes.headerAlignH,
      i_pane,
    ),
  );

  return [
    ...labelPrimitives,
    ...generatePaneContentPrimitives(rc, config, measured),
  ];
}

function measureTierHeaders(
  rc: RenderContext,
  nTiers: number,
  tierHeaders: string[],
  tierHeadersTextStyle: TextInfoUnkeyed,
  labelGap: number,
  maxWidth: number,
): { value: number; measuredTexts: MeasuredText[] } {
  if (nTiers < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxMeasuredWidth = 0;
  for (let i_tier = 0; i_tier < tierHeaders.length; i_tier++) {
    const mText = rc.mText(tierHeaders[i_tier], tierHeadersTextStyle, maxWidth);
    measuredTexts.push(mText);
    maxMeasuredWidth = Math.max(maxMeasuredWidth, mText.dims.w());
  }
  return { value: maxMeasuredWidth + labelGap, measuredTexts };
}

function measureLaneHeaders(
  rc: RenderContext,
  subChartAreaWidth: number,
  laneHeaders: string[],
  s: MergedChartStyleBase,
): { value: number; measuredTexts: MeasuredText[] } {
  if (laneHeaders.length < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxHeight = 0;
  for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
    const mText = rc.mText(
      laneHeaders[i_lane],
      s.text.laneHeaders,
      subChartAreaWidth,
    );
    measuredTexts.push(mText);
    maxHeight = Math.max(maxHeight, mText.dims.h());
  }
  return { value: maxHeight, measuredTexts };
}

function tierHeaderLabelPrimitives(
  measuredTexts: MeasuredText[],
  yAxisWidthInfo: YAxisWidthInfoBase,
  yAxisRcd: RectCoordsDims,
  subChartAreaHeight: number,
  tierHeaderAndLabelGapWidth: number,
  tierHeaderAndLabelGapHeight: number,
  tiers: {
    paddingTop: number;
    gapY: number;
    headerGap: number;
    headerAlignH: "left" | "center" | "right";
    headerAlignV: "top" | "middle";
    headerPosition: "left" | "above-axis" | "above-plot-area";
  },
  contentRcd: RectCoordsDims,
  i_pane: number,
): ChartLabelPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const primitives: ChartLabelPrimitive[] = [];

  if (tiers.headerPosition !== "left") {
    const boundsX = tiers.headerPosition === "above-axis"
      ? yAxisRcd.x()
      : yAxisRcd.rightX();
    const boundsW = contentRcd.rightX() - boundsX;
    let currentY = yAxisRcd.y() + tiers.paddingTop;

    for (let i_tier = 0; i_tier < measuredTexts.length; i_tier++) {
      const tierBounds = new RectCoordsDims({
        x: boundsX,
        y: currentY,
        w: boundsW,
        h: tierHeaderAndLabelGapHeight,
      });
      primitives.push({
        type: "chart-label",
        key: `tier-header-${i_pane}-${i_tier}`,
        bounds: tierBounds,
        zIndex: Z_INDEX.LABEL,
        meta: { labelType: "tier", paneIndex: i_pane, tierIndex: i_tier },
        mText: measuredTexts[i_tier],
        alignment: { h: tiers.headerAlignH, v: "top" },
      });
      currentY += tierHeaderAndLabelGapHeight + subChartAreaHeight + tiers.gapY;
    }
  } else {
    let currentY = yAxisRcd.y() + tiers.paddingTop;

    for (let i_tier = 0; i_tier < measuredTexts.length; i_tier++) {
      const tierY = tiers.headerAlignV === "top"
        ? currentY - yAxisWidthInfo.halfYAxisTickLabelH
        : currentY;
      const tierBounds = new RectCoordsDims({
        x: yAxisRcd.x(),
        y: tierY,
        w: tierHeaderAndLabelGapWidth - tiers.headerGap,
        h: subChartAreaHeight,
      });
      primitives.push({
        type: "chart-label",
        key: `tier-header-${i_pane}-${i_tier}`,
        bounds: tierBounds,
        zIndex: Z_INDEX.LABEL,
        meta: { labelType: "tier", paneIndex: i_pane, tierIndex: i_tier },
        mText: measuredTexts[i_tier],
        alignment: { h: tiers.headerAlignH, v: tiers.headerAlignV },
      });
      currentY += subChartAreaHeight + tiers.gapY;
    }
  }

  return primitives;
}

function laneHeaderLabelPrimitives(
  measuredTexts: MeasuredText[],
  laneHeaderRcd: RectCoordsDims,
  subChartAreaWidth: number,
  lanePaddingLeft: number,
  laneGapX: number,
  headerAlignH: "left" | "center" | "right",
  i_pane: number,
): ChartLabelPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const primitives: ChartLabelPrimitive[] = [];
  let currentX = laneHeaderRcd.x() + lanePaddingLeft;

  for (let i_lane = 0; i_lane < measuredTexts.length; i_lane++) {
    const laneBounds = new RectCoordsDims({
      x: currentX,
      y: laneHeaderRcd.y(),
      w: subChartAreaWidth,
      h: laneHeaderRcd.h(),
    });
    primitives.push({
      type: "chart-label",
      key: `lane-header-${i_pane}-${i_lane}`,
      bounds: laneBounds,
      zIndex: Z_INDEX.LABEL,
      meta: { labelType: "lane", paneIndex: i_pane, laneIndex: i_lane },
      mText: measuredTexts[i_lane],
      alignment: { h: headerAlignH, v: "bottom" },
    });
    currentX += subChartAreaWidth + laneGapX;
  }

  return primitives;
}
