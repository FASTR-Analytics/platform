// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  HeaderItem,
  MeasuredText,
  MergedChartStyleBase,
  Primitive,
  RenderContext,
  TextInfoUnkeyed,
} from "./deps.ts";
import { Padding, RectCoordsDims, Z_INDEX } from "./deps.ts";
import type {
  MeasurePaneConfig,
  PaneBandLayout,
  PaneLayout,
} from "./measure_types.ts";
import { generatePaneContentPrimitives } from "./generate_pane_content_primitives.ts";
import { NO_DISAGGREGATION_HEADER_ID } from "./common_data_transform.ts";

// "above-plot-area-if-no-lanes" self-resolves at measure time (this is the
// only point where both the style choice and the axis data are in scope):
// above-plot-area when this axis has no real lane disaggregation (a chart
// with tiers but no lanes gains nothing from reserving a left-hand gutter
// for tier headers), left otherwise so lane headers and tier headers don't
// compete for the same horizontal band.
function resolveTierHeaderPosition(
  headerPosition: MergedChartStyleBase["tiers"]["headerPosition"],
  laneHeaders: HeaderItem[],
): "left" | "above-axis" | "above-plot-area" {
  if (headerPosition !== "above-plot-area-if-no-lanes") {
    return headerPosition;
  }
  const hasNoLanes = laneHeaders.length === 1 &&
    laneHeaders[0].id === NO_DISAGGREGATION_HEADER_ID;
  return hasNoLanes ? "above-plot-area" : "left";
}

// Proportional band layout: solve the pane-local slot thickness from the
// pane's free plot extent (unless a chart-global slotT is threaded in) and
// size each band as nInd_b × slotT (+ inter-slot strokes in sides mode —
// mirrors ohPerSubChartPlotH / calculate_mapped_coordinates; omit the stroke
// term and every slot is ≈stroke/n too short). Σ_b (nInd_b + 1) strokes =
// totalSlots + nBands.
function solveBandLayout(
  bandAxis: "tier" | "lane",
  bandIndices: number[],
  bandMasks: number[][],
  freePlotExtent: number,
  centered: boolean,
  gridStrokeWidth: number,
  slotTOverride: number | undefined,
): PaneBandLayout {
  const visibleIndicators = bandIndices.map((b) => bandMasks[b] ?? []);
  const counts = visibleIndicators.map((v) => v.length);
  const totalSlots = counts.reduce((a, b) => a + b, 0);
  const strokeTerms = centered
    ? 0
    : gridStrokeWidth * (totalSlots + bandIndices.length);
  const slotT = slotTOverride ??
    Math.max(0, (freePlotExtent - strokeTerms) / Math.max(1, totalSlots));
  const bandExtents = counts.map((n) =>
    n * slotT + (centered ? 0 : gridStrokeWidth * (n + 1))
  );
  return { bandAxis, bandIndices, visibleIndicators, slotT, bandExtents };
}

// layoutOnly skips content-primitive generation (bars/points/lines/labels) —
// the expensive part of a measure. Used by getIdealHeight/fitReport probes,
// which only consume the returned layout geometry. Header/axis text is still
// measured (it determines the layout); only the plot contents are skipped.
export function measurePane<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  layoutOnly?: boolean,
): { primitives: Primitive[]; layout: PaneLayout } {
  const i_pane = config.indices.pane;
  const baseStyle = config.baseStyle;
  const tierHeaders = config.dataProps.tierHeaders;
  const laneHeaders = config.dataProps.laneHeaders;
  const nTiers = tierHeaders.length;
  const headerPosition = resolveTierHeaderPosition(
    baseStyle.tiers.headerPosition,
    laneHeaders,
  );

  // Unbalanced tier/lane membership: this pane's visible band subsets
  // (global indices). Space divisions and header-label placement iterate the
  // subset; extent measures (header column width/row height) and every data
  // lookup keep the global set/indices.
  const visibleTiers = config.dataProps.visibleTiersByPane?.[i_pane];
  const visibleLanes = config.dataProps.visibleLanesByPane?.[i_pane];

  // Proportional band layout: this pane's per-(band) visible indicator
  // masks. The band iteration list drops bands with no visible indicators
  // in this pane (empty-band policy — legitimate data, never asserted).
  const bandMasks = config.dataProps.visibleIndicatorsByPaneBand?.[i_pane];
  const tierBandIndices = bandMasks && config.orientation === "horizontal" &&
      config.yAxisConfig.type === "text"
    ? (visibleTiers ?? tierHeaders.map((_, i) => i)).filter((t) =>
      (bandMasks[t]?.length ?? 0) > 0
    )
    : undefined;
  const laneBandIndices = bandMasks && config.orientation === "vertical" &&
      config.xAxisConfig.type === "text"
    ? (visibleLanes ?? config.dataProps.laneHeaders.map((_, i) => i)).filter(
      (l) => (bandMasks[l]?.length ?? 0) > 0,
    )
    : undefined;

  const nTierBands = tierBandIndices
    ? Math.max(1, tierBandIndices.length)
    : visibleTiers
    ? Math.max(1, visibleTiers.length)
    : nTiers;

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
  const nLaneBands = laneBandIndices
    ? Math.max(1, laneBandIndices.length)
    : visibleLanes
    ? Math.max(1, visibleLanes.length)
    : nLanes;
  const lanes = baseStyle.lanes;
  const xAxisW = config.geometry.contentRcd.w() -
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;
  const subChartAreaWidth = (xAxisW -
    (lanes.paddingLeft + Math.max(0, nLaneBands - 1) * lanes.gapX +
      lanes.paddingRight)) /
    Math.max(1, nLaneBands);

  // Proportional lane bands (OV): solve slotT from the free width — exactly
  // the equal-split numerator, reconstructed as subChartAreaWidth × nBands.
  const laneBands =
    laneBandIndices && bandMasks && config.xAxisConfig.type === "text"
      ? solveBandLayout(
        "lane",
        laneBandIndices,
        bandMasks,
        subChartAreaWidth * laneBandIndices.length,
        config.xAxisConfig.axisStyle.tickPosition === "center",
        baseStyle.grid.gridStrokeWidth,
        config.slotT,
      )
      : undefined;

  // Unbalanced indicator membership: this pane's visible subset (x-text axis
  // only — slot layout goes per-pane, axis extent stays global).
  const xAxisConfig = config.xAxisConfig;
  const visibleIndicators = config.dataProps.visibleIndicatorsByPane?.[i_pane];
  const visibleXTextHeaders =
    visibleIndicators !== undefined && xAxisConfig.type === "text"
      ? visibleIndicators.map((i) => xAxisConfig.indicatorHeaders[i])
      : undefined;

  const xAxisMeasuredInfo = measureXAxis(
    rc,
    config.geometry.contentRcd,
    yAxisWidthInfo,
    subChartAreaWidth,
    config.xAxisConfig,
    baseStyle.grid,
    i_pane,
    nLanes,
    visibleXTextHeaders,
    laneBands?.slotT,
  );

  const {
    value: laneHeaderTextHeight,
    measuredTexts: measuredLaneHeaders,
  } = baseStyle.lanes.hideHeaders
    ? { value: 0, measuredTexts: [] }
    : laneBands
    ? measureLaneHeadersProportional(rc, laneBands, laneHeaders, baseStyle)
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
    nTierBands,
    tierHeaderAndLabelGapHeight,
  );

  // Proportional tier bands (OH): solve slotT from the free height — exactly
  // the equal-split numerator, reconstructed as subChartAreaHeight × nBands.
  const tierBands =
    tierBandIndices && bandMasks && config.yAxisConfig.type === "text"
      ? solveBandLayout(
        "tier",
        tierBandIndices,
        bandMasks,
        subChartAreaHeight * tierBandIndices.length,
        config.yAxisConfig.axisStyle.tickPosition === "center",
        baseStyle.grid.gridStrokeWidth,
        config.slotT,
      )
      : undefined;
  const paneBands = laneBands ?? tierBands;

  const measured = {
    yAxisWidthInfo,
    xAxisMeasuredInfo,
    yAxisRcd,
    subChartAreaHeight,
    subChartAreaWidth,
    topHeightForLaneHeaders,
    tierHeaderAndLabelGapHeight,
    paneBands,
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

  // How far the y-axis's topmost tick label pokes above each tier's plot
  // area (left-positioned, top-aligned tier headers line up with it). With
  // overhang clearance, scale-axis top labels stay inside the plot except
  // for the half-grid-stroke rendering convention; inset labels hang fully
  // inside.
  const tierHeaderTopNudge = config.yAxisConfig.type === "scale"
    ? (config.yAxisConfig.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.min(
        yAxisWidthInfo.halfYAxisTickLabelH,
        baseStyle.grid.gridStrokeWidth / 2,
      ))
    : yAxisWidthInfo.halfYAxisTickLabelH;

  labelPrimitives.push(
    ...tierHeaderLabelPrimitives(
      measuredTierHeaders,
      tierBands?.bandIndices ?? visibleTiers ?? tierHeaders.map((_, i) => i),
      tierHeaderTopNudge,
      yAxisRcd,
      subChartAreaHeight,
      tierHeaderAndLabelGapWidth,
      tierHeaderAndLabelGapHeight,
      { ...baseStyle.tiers, headerPosition },
      config.geometry.contentRcd,
      i_pane,
      tierBands?.bandExtents,
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
      laneBands?.bandIndices ?? visibleLanes ?? laneHeaders.map((_, i) => i),
      laneHeaderRcd,
      subChartAreaWidth,
      lanes.paddingLeft,
      lanes.gapX,
      lanes.headerAlignH,
      i_pane,
      laneBands?.bandExtents,
    ),
  );

  return {
    primitives: layoutOnly ? [] : [
      ...labelPrimitives,
      ...generatePaneContentPrimitives(rc, config, measured),
    ],
    layout: {
      subChartAreaHeight: measured.subChartAreaHeight,
      subChartAreaWidth: measured.subChartAreaWidth,
      topHeightForLaneHeaders: measured.topHeightForLaneHeaders,
      tierHeaderAndLabelGapHeight: measured.tierHeaderAndLabelGapHeight,
      yAxisWidth: measured.yAxisWidthInfo.widthIncludingYAxisStrokeWidth,
      paneContentWidth: config.geometry.contentRcd.w(),
      proportionalSlotTotal: paneBands
        ? paneBands.visibleIndicators.reduce((a, v) => a + v.length, 0)
        : undefined,
      proportionalBandCount: paneBands
        ? paneBands.bandIndices.length
        : undefined,
    },
  };
}

function measureTierHeaders(
  rc: RenderContext,
  nTiers: number,
  tierHeaders: HeaderItem[],
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
    const mText = rc.mText(
      tierHeaders[i_tier].label,
      tierHeadersTextStyle,
      maxWidth,
    );
    measuredTexts.push(mText);
    maxMeasuredWidth = Math.max(maxMeasuredWidth, mText.dims.w());
  }
  return { value: maxMeasuredWidth + labelGap, measuredTexts };
}

function measureLaneHeaders(
  rc: RenderContext,
  subChartAreaWidth: number,
  laneHeaders: HeaderItem[],
  s: MergedChartStyleBase,
): { value: number; measuredTexts: MeasuredText[] } {
  if (laneHeaders.length < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxHeight = 0;
  for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
    const mText = rc.mText(
      laneHeaders[i_lane].label,
      s.text.laneHeaders,
      subChartAreaWidth,
    );
    measuredTexts.push(mText);
    maxHeight = Math.max(maxHeight, mText.dims.h());
  }
  return { value: maxHeight, measuredTexts };
}

// Proportional lane bands (OV): each visible lane's header wraps at its own
// band extent (bands are unequal, so a single shared wrap width is wrong).
// measuredTexts stays indexed by GLOBAL lane index; lanes dropped for this
// pane are measured at slotT only to keep the array dense (they are never
// placed) and are excluded from the reserved height.
function measureLaneHeadersProportional(
  rc: RenderContext,
  laneBands: PaneBandLayout,
  laneHeaders: HeaderItem[],
  s: MergedChartStyleBase,
): { value: number; measuredTexts: MeasuredText[] } {
  if (laneHeaders.length < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxHeight = 0;
  for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
    const bandOrdinal = laneBands.bandIndices.indexOf(i_lane);
    const wrapW = bandOrdinal >= 0
      ? laneBands.bandExtents[bandOrdinal]
      : laneBands.slotT;
    const mText = rc.mText(
      laneHeaders[i_lane].label,
      s.text.laneHeaders,
      wrapW,
    );
    measuredTexts.push(mText);
    if (bandOrdinal >= 0) {
      maxHeight = Math.max(maxHeight, mText.dims.h());
    }
  }
  return { value: maxHeight, measuredTexts };
}

function tierHeaderLabelPrimitives(
  measuredTexts: MeasuredText[],
  // Global tier indices to place, in band order (the visible subset under
  // unbalanced membership; all tiers when balanced). Positions run by band
  // ordinal; keys/meta keep the global index.
  tierIndices: number[],
  tierHeaderTopNudge: number,
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
  // Proportional band layout: per-band extents parallel to tierIndices.
  // Absent = uniform subChartAreaHeight per band.
  bandExtents?: number[],
): ChartLabelPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const primitives: ChartLabelPrimitive[] = [];

  if (tiers.headerPosition !== "left") {
    const boundsX = tiers.headerPosition === "above-axis"
      ? yAxisRcd.x()
      : yAxisRcd.rightX();
    const boundsW = contentRcd.rightX() - boundsX;
    let currentY = yAxisRcd.y() + tiers.paddingTop;

    for (let bandOrdinal = 0; bandOrdinal < tierIndices.length; bandOrdinal++) {
      const i_tier = tierIndices[bandOrdinal];
      const bandExtent = bandExtents?.[bandOrdinal] ?? subChartAreaHeight;
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
      currentY += tierHeaderAndLabelGapHeight + bandExtent + tiers.gapY;
    }
  } else {
    let currentY = yAxisRcd.y() + tiers.paddingTop;

    for (let bandOrdinal = 0; bandOrdinal < tierIndices.length; bandOrdinal++) {
      const i_tier = tierIndices[bandOrdinal];
      const bandExtent = bandExtents?.[bandOrdinal] ?? subChartAreaHeight;
      const tierY = tiers.headerAlignV === "top"
        ? currentY - tierHeaderTopNudge
        : currentY;
      const tierBounds = new RectCoordsDims({
        x: yAxisRcd.x(),
        y: tierY,
        w: tierHeaderAndLabelGapWidth - tiers.headerGap,
        h: bandExtent,
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
      currentY += bandExtent + tiers.gapY;
    }
  }

  return primitives;
}

function laneHeaderLabelPrimitives(
  measuredTexts: MeasuredText[],
  // Global lane indices to place, in band order (the visible subset under
  // unbalanced membership; all lanes when balanced). Positions run by band
  // ordinal; keys/meta keep the global index.
  laneIndices: number[],
  laneHeaderRcd: RectCoordsDims,
  subChartAreaWidth: number,
  lanePaddingLeft: number,
  laneGapX: number,
  headerAlignH: "left" | "center" | "right",
  i_pane: number,
  // Proportional band layout: per-band extents parallel to laneIndices.
  // Absent = uniform subChartAreaWidth per band.
  bandExtents?: number[],
): ChartLabelPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const primitives: ChartLabelPrimitive[] = [];
  let currentX = laneHeaderRcd.x() + lanePaddingLeft;

  for (let bandOrdinal = 0; bandOrdinal < laneIndices.length; bandOrdinal++) {
    const i_lane = laneIndices[bandOrdinal];
    const bandExtent = bandExtents?.[bandOrdinal] ?? subChartAreaWidth;
    const laneBounds = new RectCoordsDims({
      x: currentX,
      y: laneHeaderRcd.y(),
      w: bandExtent,
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
    currentX += bandExtent + laneGapX;
  }

  return primitives;
}
