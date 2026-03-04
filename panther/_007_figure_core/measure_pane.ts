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
import { Coordinates, Padding, RectCoordsDims, Z_INDEX } from "./deps.ts";
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

  const maxTierHeaderWidth = config.geometry.contentRcd.w() *
    baseStyle.tiers.maxHeaderWidthAsPctOfChart;

  const {
    value: tierHeaderAndLabelGapWidth,
    measuredTexts: measuredTierHeaders,
  } = baseStyle.tiers.hideHeaders
    ? { value: 0, measuredTexts: [] }
    : measureTierHeaders(
      rc,
      nTiers,
      tierHeaders,
      baseStyle.text.tierHeaders,
      config.yAxisConfig.type === "scale"
        ? config.yAxisConfig.axisStyle.labelGap
        : 0,
      maxTierHeaderWidth,
    );

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
  );

  const { value: topHeightForLaneHeaders, measuredTexts: measuredLaneHeaders } =
    baseStyle.lanes.hideHeaders
      ? { value: 0, measuredTexts: [] }
      : measureLaneHeaders(
        rc,
        subChartAreaWidth,
        laneHeaders,
        baseStyle,
      );

  const { yAxisRcd, subChartAreaHeight } = measureYAxisLayout(
    topHeightForLaneHeaders,
    xAxisMeasuredInfo.xAxisRcd.h(),
    yAxisWidthInfo,
    baseStyle.tiers,
    config.geometry.contentRcd,
    nTiers,
  );

  const measured = {
    yAxisWidthInfo,
    xAxisMeasuredInfo,
    yAxisRcd,
    subChartAreaHeight,
    subChartAreaWidth,
    topHeightForLaneHeaders,
  };

  const labelPrimitives: Primitive[] = [];

  if (config.paneHeader) {
    const panePadding = new Padding(baseStyle.panes.padding);
    const position = new Coordinates([
      baseStyle.panes.headerAlignH === "left"
        ? config.geometry.outerRcd.x() + panePadding.pl()
        : config.geometry.outerRcd.centerX(),
      config.geometry.outerRcd.y() + panePadding.pt(),
    ]);
    labelPrimitives.push({
      type: "chart-label",
      key: `pane-header-${i_pane}`,
      bounds: config.geometry.outerRcd,
      zIndex: Z_INDEX.LABEL,
      meta: { labelType: "pane", paneIndex: i_pane },
      mText: config.paneHeader,
      position,
      alignment: { h: baseStyle.panes.headerAlignH, v: "top" },
    });
  }

  labelPrimitives.push(
    ...tierHeaderLabelPrimitives(
      measuredTierHeaders,
      yAxisWidthInfo,
      yAxisRcd,
      subChartAreaHeight,
      baseStyle.tiers,
      i_pane,
    ),
  );

  const laneHeaderRcd = new RectCoordsDims({
    x: xAxisMeasuredInfo.xAxisRcd.x(),
    y: config.geometry.contentRcd.y(),
    w: config.geometry.contentRcd.rightX() - xAxisMeasuredInfo.xAxisRcd.x(),
    h: topHeightForLaneHeaders,
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
  tiers: {
    paddingTop: number;
    gapY: number;
    headerAlignH: "left" | "center" | "right";
    headerAlignV: "top" | "middle";
  },
  i_pane: number,
): ChartLabelPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const primitives: ChartLabelPrimitive[] = [];
  let currentY = yAxisRcd.y() + tiers.paddingTop;

  for (let i_tier = 0; i_tier < measuredTexts.length; i_tier++) {
    const y = tiers.headerAlignV === "middle"
      ? currentY + subChartAreaHeight / 2
      : currentY - yAxisWidthInfo.halfYAxisTickLabelH;
    primitives.push({
      type: "chart-label",
      key: `tier-header-${i_pane}-${i_tier}`,
      bounds: yAxisRcd,
      zIndex: Z_INDEX.LABEL,
      meta: { labelType: "tier", paneIndex: i_pane, tierIndex: i_tier },
      mText: measuredTexts[i_tier],
      position: new Coordinates([yAxisRcd.x(), y]),
      alignment: { h: tiers.headerAlignH, v: tiers.headerAlignV },
    });
    currentY += subChartAreaHeight + tiers.gapY;
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
    const x = headerAlignH === "left"
      ? currentX
      : headerAlignH === "right"
      ? currentX + subChartAreaWidth
      : currentX + subChartAreaWidth / 2;
    primitives.push({
      type: "chart-label",
      key: `lane-header-${i_pane}-${i_lane}`,
      bounds: laneHeaderRcd,
      zIndex: Z_INDEX.LABEL,
      meta: { labelType: "lane", paneIndex: i_pane, laneIndex: i_lane },
      mText: measuredTexts[i_lane],
      position: new Coordinates([x, laneHeaderRcd.bottomY()]),
      alignment: { h: headerAlignH, v: "bottom" },
    });
    currentX += subChartAreaWidth + laneGapX;
  }

  return primitives;
}
