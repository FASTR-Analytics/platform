// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  measureSecondYValueAxis,
  measureYAxisLayout,
  measureYCategoryAxis,
  measureYValueAxis,
} from "./_axes/measure_y_axis.ts";
import {
  measureSecondXValueAxis,
  measureXCategoryAxis,
  measureXValueAxis,
} from "./_axes/measure_x_axis.ts";
import { computeTotalGridLineStrokeWidth } from "./_axes/slot_layout.ts";
import type {
  ChartHeaderPrimitive,
  DataDimension,
  MeasuredText,
  MergedChartStyleBase,
  Primitive,
  RenderContext,
  TextInfoUnkeyed,
} from "./deps.ts";
import {
  buildItem,
  getDimensionMembers,
  itemCoordinate,
  Padding,
  RectCoordsDims,
  textBoxInAlignRcd,
  Z_INDEX,
} from "./deps.ts";
import type {
  MeasuredAxes,
  MeasurePaneConfig,
  PaneLayout,
  PaneTierOrLaneLayout,
} from "./measure_types.ts";
import type { ChartItemDataDimensions } from "./chart_items.ts";
import { generatePaneContentPrimitives } from "./generate_pane_content_primitives.ts";
import { buildSubCharts } from "./sub_charts.ts";

// The "-if-no-lanes" variants self-resolve at measure time (this is the only
// point where both the style choice and the data dimensions are in scope): the
// named position when this chart has no real lane disaggregation (a chart
// with tiers but no lanes gains nothing from reserving a left-hand gutter
// for tier headers), left otherwise so lane headers and tier headers don't
// compete for the same horizontal strip.
function resolveTierHeaderPosition(
  headerPosition: MergedChartStyleBase["tiers"]["headerPosition"],
  lane: DataDimension | undefined,
): "left" | "above-axis" | "above-sub-chart" {
  if (
    headerPosition !== "above-axis-if-no-lanes" &&
    headerPosition !== "above-sub-chart-if-no-lanes"
  ) {
    return headerPosition;
  }
  if (lane !== undefined) {
    return "left";
  }
  return headerPosition === "above-axis-if-no-lanes"
    ? "above-axis"
    : "above-sub-chart";
}

// Proportional tier-or-lane layout: solve the pane-local slot thickness from the
// pane's free category-axis extent (unless a chart-global slotExtent is threaded in) and
// size each tier or lane as nInd_b × slotExtent (+ inter-slot strokes in sides mode —
// mirrors ohSubChartHeight / calculate_mapped_coordinates; omit the stroke
// term and every slot is ≈stroke/n too short). Σ_b (nInd_b + 1) strokes =
// nSlots + nTiersOrLanes.
function solveTierOrLaneLayout(
  tierOrLaneDimension: "tier" | "lane",
  tierOrLaneIndices: number[],
  tierOrLaneMasks: number[][],
  freeCategoryAxisExtent: number,
  centered: boolean,
  gridLineStrokeWidth: number,
  slotExtentOverride: number | undefined,
): PaneTierOrLaneLayout {
  const visibleIndicators = tierOrLaneIndices.map((b) =>
    tierOrLaneMasks[b] ?? []
  );
  const counts = visibleIndicators.map((v) => v.length);
  const nSlots = counts.reduce((a, b) => a + b, 0);
  const strokeTerms = computeTotalGridLineStrokeWidth(
    nSlots,
    tierOrLaneIndices.length,
    centered,
    gridLineStrokeWidth,
  );
  const slotExtent = slotExtentOverride ??
    Math.max(
      0,
      (freeCategoryAxisExtent - strokeTerms) / Math.max(1, nSlots),
    );
  const tierOrLaneExtents = counts.map((n) =>
    n * slotExtent +
    computeTotalGridLineStrokeWidth(n, 1, centered, gridLineStrokeWidth)
  );
  return {
    tierOrLaneDimension,
    tierOrLaneIndices,
    visibleIndicators,
    slotExtent,
    tierOrLaneExtents,
  };
}

// layoutOnly skips content-primitive generation (bars/points/lines/labels) —
// the expensive part of a measure. Used by getIdealHeight/fitReport probes,
// which only consume the returned layout geometry. Header/axis text is still
// measured (it determines the layout); only the sub-chart contents are skipped.
export function measurePane<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  layoutOnly?: boolean,
): { primitives: Primitive[]; layout: PaneLayout } {
  const i_pane = config.i_pane;
  const { mergedStyle, axes, masks } = config.chart;
  const xTextAxisConfig = axes.kind === "category-and-value" &&
      axes.orientation === "vertical" && axes.x.type === "text"
    ? axes.x
    : undefined;
  const yTextAxisConfig = axes.kind === "category-and-value" &&
      axes.orientation === "horizontal"
    ? axes.y
    : undefined;
  const { pane, tier, lane } = config.chart.dataDimensions;
  const paneMember = pane?.members[i_pane];
  const allTiers = getDimensionMembers(tier).map((_, i) => i);
  const allLanes = getDimensionMembers(lane).map((_, i) => i);
  const nTiers = allTiers.length;
  const headerPosition = resolveTierHeaderPosition(
    mergedStyle.tiers.headerPosition,
    lane,
  );

  // Unbalanced tier/lane membership: this pane's visible tier-or-lane subsets
  // (global indices). Space divisions and header-label placement iterate the
  // subset; extent measures (header column width/row height) and every data
  // lookup keep the global set/indices.
  const visibleTiers = masks?.visibleTiersByPane?.[i_pane];
  const visibleLanes = masks?.visibleLanesByPane?.[i_pane];

  // Proportional tier-or-lane layout: this pane's per-(tier or lane) visible indicator
  // masks. The tier-or-lane iteration list drops tiers or lanes with no visible indicators
  // in this pane (empty tier-or-lane policy — legitimate data, never asserted).
  const tierOrLaneMasks = masks?.visibleIndicatorsByPaneTierOrLane?.[i_pane];
  const proportionalTierIndices = tierOrLaneMasks && yTextAxisConfig
    ? (visibleTiers ?? allTiers).filter((t) =>
      (tierOrLaneMasks[t]?.length ?? 0) > 0
    )
    : undefined;
  const proportionalLaneIndices = tierOrLaneMasks && xTextAxisConfig
    ? (visibleLanes ?? allLanes).filter((l) =>
      (tierOrLaneMasks[l]?.length ?? 0) > 0
    )
    : undefined;

  const nLaidOutTiers = proportionalTierIndices
    ? Math.max(1, proportionalTierIndices.length)
    : visibleTiers
    ? Math.max(1, visibleTiers.length)
    : nTiers;

  const maxTierHeaderWidth = config.geometry.innerRcd.w() *
    mergedStyle.tiers.maxHeaderWidthFractionOfPane;

  const headerGap = mergedStyle.tiers.headerGap;

  const {
    value: measuredTierHeaderGapWidth,
    measuredTexts: measuredTierHeaders,
  } = mergedStyle.tiers.hideHeaders
    ? { value: 0, measuredTexts: [] }
    : measureTierHeaders(
      rc,
      tier,
      mergedStyle.text.tierHeaders,
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

  const nLanes = allLanes.length;
  const nLaidOutLanes = proportionalLaneIndices
    ? Math.max(1, proportionalLaneIndices.length)
    : visibleLanes
    ? Math.max(1, visibleLanes.length)
    : nLanes;
  const lanes = mergedStyle.lanes;
  const uniformSubChartWidthFor = (yAxesWidth: number) => {
    const xAxisW = config.geometry.innerRcd.w() - yAxesWidth;
    return (xAxisW -
      (lanes.paddingLeft + Math.max(0, nLaidOutLanes - 1) * lanes.gapX +
        lanes.paddingRight)) /
      Math.max(1, nLaidOutLanes);
  };

  // This pane's indicator order (a subset under unbalanced membership, a
  // permutation under a value sort); x-text axis only — slot layout goes
  // per-pane, axis extent stays global.
  const visibleIndicators = masks?.visibleIndicatorsByPane?.[i_pane];
  const visibleXTextMembers = visibleIndicators !== undefined && xTextAxisConfig
    ? visibleIndicators.map((i) => xTextAxisConfig.indicatorMembers[i])
    : undefined;

  const measureAxes = (): {
    measuredAxes: MeasuredAxes;
    yAxisWidth: number;
    secondYAxisWidth: number;
    uniformSubChartWidth: number;
    laneLayout?: PaneTierOrLaneLayout;
  } => {
    if (axes.kind === "none") {
      const yAxisWidth = tierHeaderAndLabelGapWidth;
      return {
        measuredAxes: {
          kind: "none",
          xAxisRcd: new RectCoordsDims({
            x: config.geometry.innerRcd.x() + yAxisWidth,
            y: config.geometry.innerRcd.bottomY(),
            w: config.geometry.innerRcd.w() - yAxisWidth,
            h: 0,
          }),
        },
        yAxisWidth,
        secondYAxisWidth: 0,
        uniformSubChartWidth: uniformSubChartWidthFor(yAxisWidth),
      };
    }
    if (axes.kind === "value-and-value") {
      const y = measureYValueAxis(
        rc,
        axes.y,
        mergedStyle.grid,
        config.geometry.innerRcd,
        i_pane,
        tierHeaderAndLabelGapWidth,
        nTiers,
      );
      const yAxisWidth = y.info.widthIncludingYAxisStrokeWidth;
      const x = measureXValueAxis(
        rc,
        config.geometry.innerRcd,
        y.info,
        axes.x,
        mergedStyle.grid,
        i_pane,
        nLanes,
      );
      return {
        measuredAxes: { kind: "value-and-value", x, y },
        yAxisWidth,
        secondYAxisWidth: 0,
        uniformSubChartWidth: uniformSubChartWidthFor(yAxisWidth),
      };
    }
    switch (axes.orientation) {
      case "vertical": {
        const y = measureYValueAxis(
          rc,
          axes.y,
          mergedStyle.grid,
          config.geometry.innerRcd,
          i_pane,
          tierHeaderAndLabelGapWidth,
          nTiers,
        );
        const secondY = axes.secondY === undefined
          ? undefined
          : measureSecondYValueAxis(
            rc,
            axes.secondY,
            mergedStyle.grid,
            y,
            i_pane,
          );
        const yAxisWidth = y.info.widthIncludingYAxisStrokeWidth;
        const secondYAxisWidth = secondY?.info.widthIncludingYAxisStrokeWidth ??
          0;
        const uniformSubChartWidth = uniformSubChartWidthFor(
          yAxisWidth + secondYAxisWidth,
        );
        // Proportional lanes (OV): solve slotExtent from the free width — exactly
        // the equal-split numerator, reconstructed as uniformSubChartWidth × nTiersOrLanes.
        const laneLayout = proportionalLaneIndices && tierOrLaneMasks &&
            xTextAxisConfig
          ? solveTierOrLaneLayout(
            "lane",
            proportionalLaneIndices,
            tierOrLaneMasks,
            uniformSubChartWidth * proportionalLaneIndices.length,
            xTextAxisConfig.axisStyle.tickPosition === "center",
            mergedStyle.grid.gridLineStrokeWidth,
            config.slotExtent,
          )
          : undefined;
        const innerRcdLeftOfSecondYAxis = config.geometry.innerRcd.getAdjusted(
          (prev) => ({ w: prev.w() - secondYAxisWidth }),
        );
        const x = measureXCategoryAxis(
          rc,
          innerRcdLeftOfSecondYAxis,
          y.info,
          uniformSubChartWidth,
          axes.x,
          mergedStyle.grid,
          visibleXTextMembers,
          laneLayout?.slotExtent,
        );
        return {
          measuredAxes: {
            kind: "category-and-value",
            orientation: "vertical",
            x,
            y,
            secondY,
          },
          yAxisWidth,
          secondYAxisWidth,
          uniformSubChartWidth,
          laneLayout,
        };
      }
      case "horizontal": {
        const y = measureYCategoryAxis(
          rc,
          axes.y,
          mergedStyle.grid,
          config.geometry.innerRcd,
          tierHeaderAndLabelGapWidth,
        );
        const yAxisWidth = y.info.widthIncludingYAxisStrokeWidth;
        const uniformSubChartWidth = uniformSubChartWidthFor(yAxisWidth);
        const x = measureXValueAxis(
          rc,
          config.geometry.innerRcd,
          y.info,
          axes.x,
          mergedStyle.grid,
          i_pane,
          nLanes,
        );
        return {
          measuredAxes: {
            kind: "category-and-value",
            orientation: "horizontal",
            x,
            y,
          },
          yAxisWidth,
          secondYAxisWidth: 0,
          uniformSubChartWidth,
        };
      }
    }
  };
  const {
    measuredAxes: measuredAxesBeforeLaneHeaders,
    yAxisWidth,
    secondYAxisWidth,
    uniformSubChartWidth,
    laneLayout,
  } = measureAxes();
  const xAxisRcd = measuredAxesBeforeLaneHeaders.kind === "none"
    ? measuredAxesBeforeLaneHeaders.xAxisRcd
    : measuredAxesBeforeLaneHeaders.x.info.xAxisRcd;

  const {
    value: laneHeaderTextHeight,
    measuredTexts: measuredLaneHeaders,
  } = mergedStyle.lanes.hideHeaders
    ? { value: 0, measuredTexts: [] }
    : laneLayout
    ? measureLaneHeadersProportional(rc, laneLayout, lane, mergedStyle)
    : measureLaneHeaders(rc, uniformSubChartWidth, lane, mergedStyle);
  const topHeightForLaneHeaders = laneHeaderTextHeight > 0
    ? laneHeaderTextHeight + mergedStyle.lanes.headerGap
    : 0;

  // The second x value axis stands below the lane headers, so its strip is
  // placed once their height is known.
  const measuredAxes: MeasuredAxes =
    measuredAxesBeforeLaneHeaders.kind === "category-and-value" &&
      measuredAxesBeforeLaneHeaders.orientation === "horizontal" &&
      axes.kind === "category-and-value" &&
      axes.orientation === "horizontal" && axes.secondX !== undefined
      ? {
        ...measuredAxesBeforeLaneHeaders,
        secondX: measureSecondXValueAxis(
          rc,
          config.geometry.innerRcd,
          measuredAxesBeforeLaneHeaders.y.info,
          axes.secondX,
          mergedStyle.grid,
          measuredAxesBeforeLaneHeaders.x,
          i_pane,
          config.geometry.innerRcd.y() + topHeightForLaneHeaders,
        ),
      }
      : measuredAxesBeforeLaneHeaders;
  const secondXAxisHeight = measuredAxes.kind === "category-and-value" &&
      measuredAxes.orientation === "horizontal" &&
      measuredAxes.secondX !== undefined
    ? measuredAxes.secondX.info.xAxisRcd.h()
    : 0;

  const { yAxisRcd, uniformSubChartHeight } = measureYAxisLayout(
    topHeightForLaneHeaders,
    secondXAxisHeight,
    xAxisRcd.h(),
    yAxisWidth,
    mergedStyle.tiers,
    config.geometry.innerRcd,
    nLaidOutTiers,
    tierHeaderAndLabelGapHeight,
  );

  // Proportional tiers (OH): solve slotExtent from the free height — exactly
  // the equal-split numerator, reconstructed as uniformSubChartHeight × nTiersOrLanes.
  const tierLayout = proportionalTierIndices && tierOrLaneMasks &&
      yTextAxisConfig
    ? solveTierOrLaneLayout(
      "tier",
      proportionalTierIndices,
      tierOrLaneMasks,
      uniformSubChartHeight * proportionalTierIndices.length,
      yTextAxisConfig.axisStyle.tickPosition === "center",
      mergedStyle.grid.gridLineStrokeWidth,
      config.slotExtent,
    )
    : undefined;
  const tierOrLaneLayout = laneLayout ?? tierLayout;

  const secondYAxisRcd = measuredAxes.kind === "category-and-value" &&
      measuredAxes.orientation === "vertical" &&
      measuredAxes.secondY !== undefined
    ? new RectCoordsDims({
      x: config.geometry.innerRcd.rightX() - secondYAxisWidth,
      y: yAxisRcd.y(),
      w: secondYAxisWidth,
      h: yAxisRcd.h(),
    })
    : undefined;

  const measured = {
    axes: measuredAxes,
    yAxisRcd,
    secondYAxisRcd,
    uniformSubChartHeight,
    uniformSubChartWidth,
    topHeightForLaneHeaders,
    tierHeaderAndLabelGapHeight,
    tierOrLaneLayout,
  };

  const labelPrimitives: Primitive[] = [];

  if (config.paneHeader) {
    const panePadding = new Padding(mergedStyle.panes.padding);
    // The header hugs its sub-chart: the row's header strip may be taller than
    // this header, and the slack belongs above it, not between it and the
    // chart it names.
    const paneHeaderRcd = new RectCoordsDims({
      x: config.geometry.outerRcd.x() + panePadding.pl(),
      y: config.geometry.innerRcd.y() - mergedStyle.panes.headerGap -
        config.paneHeader.dims.h(),
      w: config.geometry.outerRcd.w() - panePadding.pl() - panePadding.pr(),
      h: config.paneHeader.dims.h(),
    });
    labelPrimitives.push({
      type: "chart-header",
      key: `pane-header-${i_pane}`,
      item: buildItem([itemCoordinate(pane?.name, paneMember)]),
      part: "header",
      hitBounds: paneHeaderRcd,
      bounds: textBoxInAlignRcd(
        config.paneHeader,
        paneHeaderRcd,
        mergedStyle.panes.headerAlignH,
        "top",
      ),
      alignRcd: paneHeaderRcd,
      zIndex: Z_INDEX.LABEL,
      meta: { headerType: "pane", i_pane, paneMember },
      mText: config.paneHeader,
      alignH: mergedStyle.panes.headerAlignH,
      alignV: "top",
    });
  }

  // How far the y-axis's topmost tick label pokes above each tier's sub-chart
  // area (left-positioned, top-aligned tier headers line up with it). With
  // overhang clearance, value-axis top labels stay inside the sub-chart except
  // for the half-grid-stroke rendering convention; inset labels hang fully
  // inside.
  const tierHeaderTopNudge = measuredAxes.kind === "none"
    ? 0
    : measuredAxes.kind === "value-and-value" ||
        measuredAxes.orientation === "vertical"
    ? (measuredAxes.y.config.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.min(
        measuredAxes.y.info.halfYAxisTickLabelH,
        mergedStyle.grid.gridLineStrokeWidth / 2,
      ))
    : measuredAxes.y.info.halfYAxisTickLabelH;

  labelPrimitives.push(
    ...tierHeaderLabelPrimitives(
      measuredTierHeaders,
      tierLayout?.tierOrLaneIndices ?? visibleTiers ?? allTiers,
      tierHeaderTopNudge,
      yAxisRcd,
      uniformSubChartHeight,
      tierHeaderAndLabelGapWidth,
      tierHeaderAndLabelGapHeight,
      { ...mergedStyle.tiers, headerPosition },
      config.geometry.innerRcd,
      secondYAxisWidth,
      i_pane,
      pane,
      tier,
      tierLayout?.tierOrLaneExtents,
    ),
  );

  const laneHeaderStripRcd = new RectCoordsDims({
    x: xAxisRcd.x(),
    y: config.geometry.innerRcd.y(),
    w: config.geometry.innerRcd.rightX() - secondYAxisWidth - xAxisRcd.x(),
    h: laneHeaderTextHeight,
  });
  labelPrimitives.push(
    ...laneHeaderLabelPrimitives(
      measuredLaneHeaders,
      laneLayout?.tierOrLaneIndices ?? visibleLanes ?? allLanes,
      laneHeaderStripRcd,
      uniformSubChartWidth,
      lanes.paddingLeft,
      lanes.gapX,
      lanes.headerAlignH,
      i_pane,
      pane,
      lane,
      laneLayout?.tierOrLaneExtents,
    ),
  );

  const layout: PaneLayout = {
    uniformSubChartHeight: measured.uniformSubChartHeight,
    uniformSubChartWidth: measured.uniformSubChartWidth,
    topHeightForLaneHeaders: measured.topHeightForLaneHeaders,
    tierHeaderAndLabelGapHeight: measured.tierHeaderAndLabelGapHeight,
    yAxesWidth: yAxisWidth + secondYAxisWidth,
    paneInnerWidth: config.geometry.innerRcd.w(),
    nProportionalSlots: tierOrLaneLayout
      ? tierOrLaneLayout.visibleIndicators.reduce((a, v) => a + v.length, 0)
      : undefined,
    nProportionalTiersOrLanes: tierOrLaneLayout
      ? tierOrLaneLayout.tierOrLaneIndices.length
      : undefined,
  };
  if (layoutOnly) {
    return { primitives: [], layout };
  }

  const itemDataDimensions: ChartItemDataDimensions = {
    pane,
    tier,
    lane,
    series: config.chart.dataDimensions.series,
    indicator: config.chart.dataDimensions.indicator,
    period: axes.kind === "category-and-value" &&
        axes.orientation === "vertical" && axes.x.type === "period"
      ? {
        name: axes.x.dimension,
        periodType: axes.x.periodType,
        timeMin: axes.x.timeMin,
      }
      : undefined,
  };
  return {
    primitives: [
      ...labelPrimitives,
      ...generatePaneContentPrimitives(
        rc,
        config,
        measured,
        buildSubCharts(rc, config, measured, itemDataDimensions),
        itemDataDimensions,
      ),
    ],
    layout,
  };
}

export function estimateTierHeaderAndLabelGapWidth(
  rc: RenderContext,
  tier: DataDimension | undefined,
  lane: DataDimension | undefined,
  s: MergedChartStyleBase,
): number {
  if (s.tiers.hideHeaders) return 0;
  if (resolveTierHeaderPosition(s.tiers.headerPosition, lane) !== "left") {
    return 0;
  }
  return measureTierHeaders(
    rc,
    tier,
    s.text.tierHeaders,
    s.tiers.headerGap,
    Number.POSITIVE_INFINITY,
  ).value;
}

function measureTierHeaders(
  rc: RenderContext,
  tier: DataDimension | undefined,
  tierHeadersTextStyle: TextInfoUnkeyed,
  labelGap: number,
  maxWidth: number,
): { value: number; measuredTexts: MeasuredText[] } {
  if (tier === undefined || tier.members.length < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxMeasuredWidth = 0;
  for (const tierMember of tier.members) {
    const mText = rc.mText(
      tierMember.label,
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
  uniformSubChartWidth: number,
  lane: DataDimension | undefined,
  s: MergedChartStyleBase,
): { value: number; measuredTexts: MeasuredText[] } {
  if (lane === undefined || lane.members.length < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxHeight = 0;
  for (const laneMember of lane.members) {
    const mText = rc.mText(
      laneMember.label,
      s.text.laneHeaders,
      uniformSubChartWidth,
    );
    measuredTexts.push(mText);
    maxHeight = Math.max(maxHeight, mText.dims.h());
  }
  return { value: maxHeight, measuredTexts };
}

// Proportional lanes (OV): each visible lane's header wraps at its own
// lane extent (lanes are unequal, so a single shared wrap width is wrong).
// measuredTexts stays indexed by GLOBAL lane index; lanes dropped for this
// pane are measured at slotExtent only to keep the array dense (they are never
// placed) and are excluded from the reserved height.
function measureLaneHeadersProportional(
  rc: RenderContext,
  laneLayout: PaneTierOrLaneLayout,
  lane: DataDimension | undefined,
  s: MergedChartStyleBase,
): { value: number; measuredTexts: MeasuredText[] } {
  if (lane === undefined || lane.members.length < 2) {
    return { value: 0, measuredTexts: [] };
  }
  const measuredTexts: MeasuredText[] = [];
  let maxHeight = 0;
  for (let i_lane = 0; i_lane < lane.members.length; i_lane++) {
    const tierOrLaneOrdinal = laneLayout.tierOrLaneIndices.indexOf(i_lane);
    const wrapW = tierOrLaneOrdinal >= 0
      ? laneLayout.tierOrLaneExtents[tierOrLaneOrdinal]
      : laneLayout.slotExtent;
    const mText = rc.mText(
      lane.members[i_lane].label,
      s.text.laneHeaders,
      wrapW,
    );
    measuredTexts.push(mText);
    if (tierOrLaneOrdinal >= 0) {
      maxHeight = Math.max(maxHeight, mText.dims.h());
    }
  }
  return { value: maxHeight, measuredTexts };
}

function tierHeaderLabelPrimitives(
  measuredTexts: MeasuredText[],
  // Global tier indices to place, in tier order (the visible subset under
  // unbalanced membership; all tiers when balanced). Positions run by tier
  // ordinal; keys/meta keep the global index.
  tierIndices: number[],
  tierHeaderTopNudge: number,
  yAxisRcd: RectCoordsDims,
  uniformSubChartHeight: number,
  tierHeaderAndLabelGapWidth: number,
  tierHeaderAndLabelGapHeight: number,
  tiers: {
    paddingTop: number;
    gapY: number;
    headerGap: number;
    headerAlignH: "left" | "center" | "right";
    headerAlignV: "top" | "middle";
    headerPosition: "left" | "above-axis" | "above-sub-chart";
  },
  innerRcd: RectCoordsDims,
  secondYAxisWidth: number,
  i_pane: number,
  pane: DataDimension | undefined,
  tier: DataDimension | undefined,
  // Proportional tier layout: per-tier extents parallel to tierIndices.
  // Absent = uniform uniformSubChartHeight per tier.
  tierOrLaneExtents?: number[],
): ChartHeaderPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const paneMember = pane?.members[i_pane];
  const tierIdentity = (i_tier: number, tierHeaderRcd: RectCoordsDims) => ({
    item: buildItem([
      itemCoordinate(pane?.name, paneMember),
      itemCoordinate(tier?.name, tier?.members[i_tier]),
    ]),
    part: "header" as const,
    hitBounds: tierHeaderRcd,
  });
  const primitives: ChartHeaderPrimitive[] = [];

  if (tiers.headerPosition !== "left") {
    // A header above the axis spans the second y axis too; one above the
    // sub-chart ends where the sub-charts end.
    const [boundsX, boundsRightX] = tiers.headerPosition === "above-axis"
      ? [yAxisRcd.x(), innerRcd.rightX()]
      : [yAxisRcd.rightX(), innerRcd.rightX() - secondYAxisWidth];
    const boundsW = boundsRightX - boundsX;
    let currentY = yAxisRcd.y() + tiers.paddingTop;

    for (
      let tierOrLaneOrdinal = 0;
      tierOrLaneOrdinal < tierIndices.length;
      tierOrLaneOrdinal++
    ) {
      const i_tier = tierIndices[tierOrLaneOrdinal];
      const tierOrLaneExtent = tierOrLaneExtents?.[tierOrLaneOrdinal] ??
        uniformSubChartHeight;
      const tierHeaderRcd = new RectCoordsDims({
        x: boundsX,
        y: currentY,
        w: boundsW,
        h: tierHeaderAndLabelGapHeight,
      });
      primitives.push({
        type: "chart-header",
        key: `tier-header-${i_pane}-${i_tier}`,
        ...tierIdentity(i_tier, tierHeaderRcd),
        bounds: textBoxInAlignRcd(
          measuredTexts[i_tier],
          tierHeaderRcd,
          tiers.headerAlignH,
          "top",
        ),
        alignRcd: tierHeaderRcd,
        zIndex: Z_INDEX.LABEL,
        meta: {
          headerType: "tier",
          i_pane,
          i_tier,
          paneMember,
          tierMember: tier?.members[i_tier],
        },
        mText: measuredTexts[i_tier],
        alignH: tiers.headerAlignH,
        alignV: "top",
      });
      currentY += tierHeaderAndLabelGapHeight + tierOrLaneExtent + tiers.gapY;
    }
  } else {
    let currentY = yAxisRcd.y() + tiers.paddingTop;

    for (
      let tierOrLaneOrdinal = 0;
      tierOrLaneOrdinal < tierIndices.length;
      tierOrLaneOrdinal++
    ) {
      const i_tier = tierIndices[tierOrLaneOrdinal];
      const tierOrLaneExtent = tierOrLaneExtents?.[tierOrLaneOrdinal] ??
        uniformSubChartHeight;
      const tierY = tiers.headerAlignV === "top"
        ? currentY - tierHeaderTopNudge
        : currentY;
      const tierHeaderRcd = new RectCoordsDims({
        x: yAxisRcd.x(),
        y: tierY,
        w: tierHeaderAndLabelGapWidth - tiers.headerGap,
        h: tierOrLaneExtent,
      });
      primitives.push({
        type: "chart-header",
        key: `tier-header-${i_pane}-${i_tier}`,
        ...tierIdentity(i_tier, tierHeaderRcd),
        bounds: textBoxInAlignRcd(
          measuredTexts[i_tier],
          tierHeaderRcd,
          tiers.headerAlignH,
          tiers.headerAlignV,
        ),
        alignRcd: tierHeaderRcd,
        zIndex: Z_INDEX.LABEL,
        meta: {
          headerType: "tier",
          i_pane,
          i_tier,
          paneMember,
          tierMember: tier?.members[i_tier],
        },
        mText: measuredTexts[i_tier],
        alignH: tiers.headerAlignH,
        alignV: tiers.headerAlignV,
      });
      currentY += tierOrLaneExtent + tiers.gapY;
    }
  }

  return primitives;
}

function laneHeaderLabelPrimitives(
  measuredTexts: MeasuredText[],
  // Global lane indices to place, in lane order (the visible subset under
  // unbalanced membership; all lanes when balanced). Positions run by lane
  // ordinal; keys/meta keep the global index.
  laneIndices: number[],
  laneHeaderStripRcd: RectCoordsDims,
  uniformSubChartWidth: number,
  lanePaddingLeft: number,
  laneGapX: number,
  headerAlignH: "left" | "center" | "right",
  i_pane: number,
  pane: DataDimension | undefined,
  lane: DataDimension | undefined,
  // Proportional lane layout: per-lane extents parallel to laneIndices.
  // Absent = uniform uniformSubChartWidth per lane.
  tierOrLaneExtents?: number[],
): ChartHeaderPrimitive[] {
  if (measuredTexts.length === 0) return [];

  const paneMember = pane?.members[i_pane];
  const primitives: ChartHeaderPrimitive[] = [];
  let currentX = laneHeaderStripRcd.x() + lanePaddingLeft;

  for (
    let tierOrLaneOrdinal = 0;
    tierOrLaneOrdinal < laneIndices.length;
    tierOrLaneOrdinal++
  ) {
    const i_lane = laneIndices[tierOrLaneOrdinal];
    const tierOrLaneExtent = tierOrLaneExtents?.[tierOrLaneOrdinal] ??
      uniformSubChartWidth;
    const laneHeaderRcd = new RectCoordsDims({
      x: currentX,
      y: laneHeaderStripRcd.y(),
      w: tierOrLaneExtent,
      h: laneHeaderStripRcd.h(),
    });
    const laneMember = lane?.members[i_lane];
    primitives.push({
      type: "chart-header",
      key: `lane-header-${i_pane}-${i_lane}`,
      item: buildItem([
        itemCoordinate(pane?.name, paneMember),
        itemCoordinate(lane?.name, laneMember),
      ]),
      part: "header",
      hitBounds: laneHeaderRcd,
      bounds: textBoxInAlignRcd(
        measuredTexts[i_lane],
        laneHeaderRcd,
        headerAlignH,
        "bottom",
      ),
      alignRcd: laneHeaderRcd,
      zIndex: Z_INDEX.LABEL,
      meta: {
        headerType: "lane",
        i_pane,
        i_lane,
        paneMember,
        laneMember,
      },
      mText: measuredTexts[i_lane],
      alignH: headerAlignH,
      alignV: "bottom",
    });
    currentX += tierOrLaneExtent + laneGapX;
  }

  return primitives;
}
