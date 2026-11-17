// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  getValueAxisValueRange,
  getXValueAxisValueRange,
} from "./_axes/measure_y_axis.ts";
import {
  getXAxisRenderConfig,
  getYAxisRenderConfig,
} from "./_axes/axis_rendering_config.ts";
import {
  calculateXAxisGridLines,
  calculateYAxisGridLines,
} from "./_axes/grid_lines.ts";
import {
  generateXPeriodAxisPrimitive,
  generateXTextAxisPrimitive,
  generateXValueAxisPrimitive,
  generateYTextAxisPrimitive,
  generateYValueAxisPrimitive,
} from "./_axes/generate_axis_primitives.ts";
import { generateContentPrimitives } from "./_content/generate_content_primitives.ts";
import { measureDataLabelEndClearance } from "./_content/measure_data_label_clearance.ts";
import type { Primitive, RenderContext } from "./deps.ts";
import {
  buildItem,
  getDimensionMembers,
  RectCoordsDims,
  Z_INDEX,
} from "./deps.ts";
import type { ChartItemDataDimensions } from "./chart_items.ts";
import { subChartItemCoordinates } from "./sub_chart_members.ts";
import type {
  MeasurePaneConfig,
  PaneTierOrLaneLayout,
} from "./measure_types.ts";
import type { OverhangClearance } from "./types.ts";
import { clampOverhangClearance, NO_OVERHANG_CLEARANCE } from "./types.ts";
import type { XTextAxisMeasuredInfo } from "./_axes/x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./_axes/x_period/types.ts";
import type { XValueAxisMeasuredInfo } from "./_axes/x_value/types.ts";
import type { YTextAxisWidthInfo } from "./_axes/y_text/types.ts";
import type { YValueAxisWidthInfo } from "./types.ts";
import type { XAxisMeasuredInfo } from "./_axes/measure_x_axis.ts";
import type { YAxisWidthInfo } from "./types.ts";

export function generatePaneContentPrimitives<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  measured: {
    yAxisWidthInfo: YAxisWidthInfo;
    xAxisMeasuredInfo: XAxisMeasuredInfo;
    yAxisRcd: RectCoordsDims;
    uniformSubChartHeight: number;
    uniformSubChartWidth: number;
    topHeightForLaneHeaders: number;
    tierHeaderAndLabelGapHeight: number;
    // Proportional tier-or-lane layout for this pane (tiers on OH, lanes on    // OV). Absent = uniform tier-or-lane extents (the shipped paths).
    tierOrLaneLayout?: PaneTierOrLaneLayout;
  },
): Primitive[] {
  const allPrimitives: Primitive[] = [];
  const i_pane = config.indices.pane;
  const baseStyle = config.baseStyle;
  const xAxisConfig = config.xAxisConfig;
  const yAxisConfig = config.yAxisConfig;
  const tierMembers = getDimensionMembers(config.dataDimensions.tier);
  const laneMembers = getDimensionMembers(config.dataDimensions.lane);
  const seriesMembers = getDimensionMembers(config.dataDimensions.series);
  const paneMembers = getDimensionMembers(config.dataDimensions.pane);
  const orientation = config.orientation;
  const itemDataDimensions: ChartItemDataDimensions = {
    pane: config.dataDimensions.pane,
    tier: config.dataDimensions.tier,
    lane: config.dataDimensions.lane,
    series: config.dataDimensions.series,
    indicator: config.dataDimensions.indicator,
    period: xAxisConfig.type === "period"
      ? {
        name: xAxisConfig.dimension,
        periodType: xAxisConfig.periodType,
        timeMin: xAxisConfig.timeMin,
      }
      : undefined,
  };

  // sub-chart loop (tier × lane)
  const generatedYAxes = new Set<string>();
  const generatedXAxes = new Set<string>();
  const chartData = config.data as TData & {
    values: (number | undefined)[][][][][];
    uncertaintyValues?: {
      ub: (number | undefined)[][][][][];
      lb: (number | undefined)[][][][][];
    };
  };

  const subChartInfoFor = (i_tier: number, i_lane: number) => ({
    nSerieses: seriesMembers.length,
    seriesValueArrays: chartData.values[i_pane][i_tier][i_lane],
    i_pane,
    nPanes: paneMembers.length,
    paneMember: paneMembers[i_pane],
    i_tier,
    nTiers: tierMembers.length,
    tierMember: tierMembers[i_tier],
    i_lane,
    nLanes: laneMembers.length,
    laneMember: laneMembers[i_lane],
  });

  // Unbalanced tier/lane membership: this pane's visible tier-or-lane subsets
  // (global indices). The tier×lane loop iterates the subset — dropped tiers or lanes
  // are whole sub-charts — while every index used inside stays global. Under
  // Proportional tier-or-lane layout the tier-or-lane list comes from tierOrLaneLayout (which also
  // drops tiers or lanes with no visible indicators in this pane).
  const tierOrLaneLayout = measured.tierOrLaneLayout;
  const visibleTiersOfPane = config.dataDimensions.visibleTiersByPane?.[i_pane];
  const visibleLanesOfPane = config.dataDimensions.visibleLanesByPane?.[i_pane];
  const tierIndices = tierOrLaneLayout?.tierOrLaneDimension === "tier"
    ? tierOrLaneLayout.tierOrLaneIndices
    : visibleTiersOfPane ?? tierMembers.map((_, i) => i);
  const laneIndices = tierOrLaneLayout?.tierOrLaneDimension === "lane"
    ? tierOrLaneLayout.tierOrLaneIndices
    : visibleLanesOfPane ?? laneMembers.map((_, i) => i);

  // This pane's indicator order along the text axis (a subset under
  // unbalanced membership, a permutation under a value sort). Positions
  // (slots, ticks, grid lines) follow it; every data lookup (dense loops,
  // i_value, info callbacks) keeps the GLOBAL index.
  const visibleIndicators = config.dataDimensions.visibleIndicatorsByPane
    ?.[i_pane];
  const textAxisMembers = xAxisConfig.type === "text"
    ? xAxisConfig.indicatorMembers
    : yAxisConfig.type === "text"
    ? yAxisConfig.indicatorMembers
    : undefined;
  const visibleTextAxisMembers =
    visibleIndicators !== undefined && textAxisMembers !== undefined
      ? visibleIndicators.map((i) => textAxisMembers[i])
      : undefined;
  const nVisibleTextIndicators = visibleTextAxisMembers?.length;

  // Proportional tier-or-lane layout: per-TIER-OR-LANE slot orders, visible members, slot
  // counts, and extents (parallel to tierOrLaneLayout.tierOrLaneIndices). These refine
  // the per-pane order above — each tier or lane draws only its own slots at its
  // own extent; data lookups keep the GLOBAL index.
  const perTierOrLane = tierOrLaneLayout && textAxisMembers !== undefined
    ? tierOrLaneLayout.visibleIndicators.map((vis, tierOrLaneOrdinal) => ({
      visibleMembers: vis.map((i) => textAxisMembers[i]),
      nSlots: vis.length,
      extent: tierOrLaneLayout.tierOrLaneExtents[tierOrLaneOrdinal],
    }))
    : undefined;

  // The slot order of one sub-chart's unit: its tier or lane's under proportional
  // layout, else the pane's, else the identity. Measurement and generation
  // both take it, so the style funcs see the same isFirstValue / isLastValue.
  const slotOrderFor = (i_tier: number, i_lane: number, nValues: number) => {
    if (tierOrLaneLayout) {
      const ordinal = tierOrLaneLayout.tierOrLaneIndices.indexOf(
        tierOrLaneLayout.tierOrLaneDimension === "tier" ? i_tier : i_lane,
      );
      if (ordinal >= 0) return tierOrLaneLayout.visibleIndicators[ordinal];
    }
    return visibleIndicators ?? Array.from({ length: nValues }, (_, i) => i);
  };

  // Overhang clearances: inset the value axis's value range
  // within each sub-chart so extreme tick labels and edge data labels stay
  // inside the sub-chart rect. start-side overhang can be absorbed by the
  // adjacent axis (lane 0 left / last tier bottom); end-side aggregates
  // the tick label overhang with the data label requirement. Every consumer
  // of value-axis positions below must receive these same values.
  const sg = baseStyle.grid;
  const hasContent = xAxisConfig.type !== "none" && yAxisConfig.type !== "none";

  let xClearances: OverhangClearance[] | undefined;
  if (xAxisConfig.type === "value") {
    const mx = measured.xAxisMeasuredInfo as XValueAxisMeasuredInfo;
    const xOverhang = xAxisConfig.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.max(
        0,
        (mx.xValueAxisHeightInfo.maxTickLabelW - sg.gridLineStrokeWidth) / 2,
      );
    const yAxisWidth = measured.yAxisWidthInfo.widthIncludingYAxisStrokeWidth;
    xClearances = laneMembers.map((_, i_lane) => {
      const start = i_lane === 0
        ? Math.max(0, xOverhang - yAxisWidth)
        : xOverhang;
      let end = xOverhang;
      if (
        orientation === "horizontal" && hasContent &&
        yAxisConfig.type === "text"
      ) {
        const valueRange = getXValueAxisValueRange(
          mx.xValueAxisHeightInfo,
          i_lane,
        );
        const yCfg = getYAxisRenderConfig(
          yAxisConfig,
          measured.yAxisWidthInfo,
        );
        for (let i_tier = 0; i_tier < tierMembers.length; i_tier++) {
          end = Math.max(
            end,
            measureDataLabelEndClearance({
              rc,
              seriesValues: chartData.values[i_pane][i_tier][i_lane],
              valueRange,
              orientation,
              contentStyle: baseStyle.content,
              dataLabelsTextStyle: baseStyle.text.dataLabels,
              valueAxisExtent: measured.uniformSubChartWidth,
              startClearance: start,
              slotExtent: 0,
              nValues: yCfg.nValues,
              slotOrder: slotOrderFor(i_tier, i_lane, yCfg.nValues),
              subChartInfo: subChartInfoFor(i_tier, i_lane),
              itemDataDimensions,
            }),
          );
        }
      }
      return clampOverhangClearance(
        { start, end },
        measured.uniformSubChartWidth,
      );
    });
  }

  let yClearances: OverhangClearance[] | undefined;
  if (yAxisConfig.type === "value") {
    const my = measured.yAxisWidthInfo as YValueAxisWidthInfo;
    const yOverhang = yAxisConfig.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.max(0, my.halfYAxisTickLabelH - sg.gridLineStrokeWidth / 2);
    const xAxisHeight = measured.xAxisMeasuredInfo.xAxisRcd.h();
    yClearances = tierMembers.map((_, i_tier) => {
      const start = i_tier === tierMembers.length - 1
        ? Math.max(0, yOverhang - xAxisHeight)
        : yOverhang;
      let end = yOverhang;
      if (
        orientation === "vertical" && hasContent &&
        (xAxisConfig.type === "text" || xAxisConfig.type === "period")
      ) {
        const valueRange = getValueAxisValueRange(
          measured.yAxisWidthInfo,
          i_tier,
        );
        const xCfg = getXAxisRenderConfig(
          xAxisConfig,
          measured.xAxisMeasuredInfo,
        );
        for (let i_lane = 0; i_lane < laneMembers.length; i_lane++) {
          end = Math.max(
            end,
            measureDataLabelEndClearance({
              rc,
              seriesValues: chartData.values[i_pane][i_tier][i_lane],
              valueRange,
              orientation,
              contentStyle: baseStyle.content,
              dataLabelsTextStyle: baseStyle.text.dataLabels,
              valueAxisExtent: measured.uniformSubChartHeight,
              startClearance: start,
              slotExtent: xCfg.slotExtent,
              nValues: xCfg.nValues,
              slotOrder: slotOrderFor(i_tier, i_lane, xCfg.nValues),
              subChartInfo: subChartInfoFor(i_tier, i_lane),
              itemDataDimensions,
            }),
          );
        }
      }
      return clampOverhangClearance(
        { start, end },
        measured.uniformSubChartHeight,
      );
    });
  }

  let currentSubChartY = measured.yAxisRcd.y() + baseStyle.tiers.paddingTop +
    measured.tierHeaderAndLabelGapHeight;

  for (let tierOrdinal = 0; tierOrdinal < tierIndices.length; tierOrdinal++) {
    const i_tier = tierIndices[tierOrdinal];
    // Proportional tier-or-lane layout: the tier or lane's own slot subset + extent (the tier or lane =
    // tier on OH, lane on OV). Absent = uniform shipped geometry.
    const proportionalTier = tierOrLaneLayout?.tierOrLaneDimension === "tier"
      ? perTierOrLane?.[tierOrdinal]
      : undefined;
    const subChartHeight = proportionalTier?.extent ??
      measured.uniformSubChartHeight;
    let currentSubChartX = measured.yAxisRcd.rightX() +
      baseStyle.lanes.paddingLeft;

    for (let laneOrdinal = 0; laneOrdinal < laneIndices.length; laneOrdinal++) {
      const i_lane = laneIndices[laneOrdinal];
      const proportionalLane = tierOrLaneLayout?.tierOrLaneDimension === "lane"
        ? perTierOrLane?.[laneOrdinal]
        : undefined;
      const tierOrLane = proportionalTier ?? proportionalLane;
      const subChartWidth = proportionalLane?.extent ??
        measured.uniformSubChartWidth;
      const rcd = new RectCoordsDims({
        x: currentSubChartX,
        y: currentSubChartY,
        w: subChartWidth,
        h: subChartHeight,
      });

      const xClearance = xClearances?.[i_lane] ?? NO_OVERHANG_CLEARANCE;
      const yClearance = yClearances?.[i_tier] ?? NO_OVERHANG_CLEARANCE;

      // Grid lines
      const horizontalGridLines = calculateYAxisGridLines(
        i_tier,
        rcd,
        baseStyle.grid.gridLineStrokeWidth,
        yAxisConfig,
        measured.yAxisWidthInfo,
        yClearance,
        tierOrLane?.nSlots ?? nVisibleTextIndicators,
      );
      const verticalGridLines = calculateXAxisGridLines(
        i_lane,
        rcd,
        xAxisConfig,
        measured.xAxisMeasuredInfo,
        baseStyle.grid.gridLineStrokeWidth,
        xClearance,
        tierOrLane?.nSlots ?? nVisibleTextIndicators,
      );

      // Grid primitive
      allPrimitives.push({
        type: "chart-grid",
        key: `grid-${i_pane}-${i_tier}-${i_lane}`,
        item: buildItem(
          subChartItemCoordinates(itemDataDimensions, {
            paneMember: paneMembers[i_pane],
            tierMember: tierMembers[i_tier],
            laneMember: laneMembers[i_lane],
          }),
        ),
        bounds: rcd,
        zIndex: Z_INDEX.GRID,
        meta: {
          i_pane,
          i_tier,
          i_lane,
          paneMember: paneMembers[i_pane],
          tierMember: tierMembers[i_tier],
          laneMember: laneMembers[i_lane],
        },
        horizontalLines: horizontalGridLines,
        verticalLines: verticalGridLines,
        style: {
          show: baseStyle.grid.showGridLines,
          strokeColor: baseStyle.grid.gridLineColor,
          strokeWidth: baseStyle.grid.gridLineStrokeWidth,
          backgroundColor: baseStyle.grid.backgroundColor,
        },
      });

      // Y-axis primitive — per (pane, tier).
      // For scale: one per tier (shared across lanes); guard on generatedYAxes.
      // For text: one per tier drawn only on lane 0 (mirror of X-text in vertical).
      const yAxisKey = `${i_pane}-${i_tier}`;
      if (!generatedYAxes.has(yAxisKey)) {
        switch (yAxisConfig.type) {
          case "value": {
            allPrimitives.push(
              generateYValueAxisPrimitive(
                rc,
                itemDataDimensions,
                i_pane,
                i_tier,
                measured.yAxisWidthInfo as YValueAxisWidthInfo,
                measured.yAxisRcd,
                rcd.y(),
                measured.uniformSubChartHeight,
                yClearance,
                yAxisConfig.axisLabel,
                yAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedYAxes.add(yAxisKey);
            break;
          }
          case "text":
            // First ITERATED lane (mirror of the tierOrdinal === 0 guard).
            if (laneOrdinal === 0) {
              allPrimitives.push(
                generateYTextAxisPrimitive(
                  rc,
                  itemDataDimensions,
                  i_pane,
                  i_tier,
                  measured.yAxisWidthInfo as YTextAxisWidthInfo,
                  measured.yAxisRcd,
                  rcd.y(),
                  subChartHeight,
                  tierOrLane?.visibleMembers ?? visibleTextAxisMembers ??
                    yAxisConfig.indicatorMembers,
                  yAxisConfig.axisStyle,
                  baseStyle.grid,
                ),
              );
              generatedYAxes.add(yAxisKey);
            }
            break;
          case "none":
            break;
        }
      }

      // X-axis primitive — per (pane, lane).
      // For text/period: drawn once per lane on the first iterated tier (at
      // the bottom of the pane). For scale: same; range varies per lane.
      // First ITERATED tier, not global tier 0 — under unbalanced tier
      // membership a pane's first visible tier may have a global index > 0.
      const xAxisKey = `${i_pane}-${i_lane}`;
      if (!generatedXAxes.has(xAxisKey) && tierOrdinal === 0) {
        switch (xAxisConfig.type) {
          case "text": {
            allPrimitives.push(
              generateXTextAxisPrimitive(
                rc,
                itemDataDimensions,
                i_pane,
                i_lane,
                rcd.x(),
                measured.xAxisMeasuredInfo as XTextAxisMeasuredInfo,
                tierOrLane?.visibleMembers ?? visibleTextAxisMembers ??
                  xAxisConfig.indicatorMembers,
                xAxisConfig.axisStyle,
                baseStyle.grid,
                proportionalLane ? subChartWidth : undefined,
              ),
            );
            generatedXAxes.add(xAxisKey);
            break;
          }
          case "period": {
            allPrimitives.push(
              generateXPeriodAxisPrimitive(
                rc,
                itemDataDimensions,
                i_pane,
                i_lane,
                rcd.x(),
                measured.xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
                {
                  name: xAxisConfig.dimension,
                  periodType: xAxisConfig.periodType,
                  timeMin: xAxisConfig.timeMin,
                  nTimePoints: xAxisConfig.nTimePoints,
                },
                xAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedXAxes.add(xAxisKey);
            break;
          }
          case "value": {
            const mx = measured.xAxisMeasuredInfo as XValueAxisMeasuredInfo;
            allPrimitives.push(
              generateXValueAxisPrimitive(
                rc,
                itemDataDimensions,
                i_pane,
                i_lane,
                mx.xValueAxisHeightInfo,
                mx.xAxisRcd,
                rcd.x(),
                measured.uniformSubChartWidth,
                xClearance,
                xAxisConfig.axisLabel,
                xAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedXAxes.add(xAxisKey);
            break;
          }
          case "none":
            break;
        }
      }

      // Content primitives (skipped when either axis is "none" — maps
      // generate their own primitives).
      if (xAxisConfig.type !== "none" && yAxisConfig.type !== "none") {
        const seriesValues = chartData.values[i_pane][i_tier][i_lane];

        let valueRange;
        let slotExtent: number;
        let isCentered: boolean;
        let nValues: number;
        if (orientation === "horizontal") {
          const mx = measured.xAxisMeasuredInfo as XValueAxisMeasuredInfo;
          valueRange = getXValueAxisValueRange(mx.xValueAxisHeightInfo, i_lane);
          const yCfg = getYAxisRenderConfig(
            yAxisConfig,
            measured.yAxisWidthInfo,
          );
          // nValues stays GLOBAL (dense-array loop bound); only the row-height
          // divisor uses the visible slot count (per tier or lane under proportional
          // layout, per pane otherwise) with the tier or lane's own extent.
          nValues = yCfg.nValues;
          isCentered = yCfg.isCentered;
          const nSlots = tierOrLane?.nSlots ?? nVisibleTextIndicators ??
            nValues;
          // Per-indicator row height inside the sub-chart.
          slotExtent = isCentered
            ? subChartHeight / Math.max(1, nSlots)
            : (subChartHeight -
              baseStyle.grid.gridLineStrokeWidth * (nSlots + 1)) /
              Math.max(1, nSlots);
        } else {
          valueRange = getValueAxisValueRange(measured.yAxisWidthInfo, i_tier);
          const xCfg = getXAxisRenderConfig(
            xAxisConfig,
            measured.xAxisMeasuredInfo,
          );
          slotExtent = xCfg.slotExtent;
          isCentered = xCfg.isCentered;
          nValues = xCfg.nValues;
        }

        allPrimitives.push(
          ...generateContentPrimitives({
            rc,
            subChartRcd: rcd,
            subChartInfo: subChartInfoFor(i_tier, i_lane),
            seriesValues,
            valueRange,
            valueClearance: orientation === "horizontal"
              ? xClearance
              : yClearance,
            isCentered,
            slotExtent,
            gridLineStrokeWidth: baseStyle.grid.gridLineStrokeWidth,
            nValues,
            orientation,
            itemDataDimensions,
            contentStyle: baseStyle.content,
            dataLabelsTextStyle: baseStyle.text.dataLabels,
            uncertaintyUbSeriesValues: chartData.uncertaintyValues
              ?.ub[i_pane][i_tier][i_lane],
            uncertaintyLbSeriesValues: chartData.uncertaintyValues
              ?.lb[i_pane][i_tier][i_lane],
            slotOrder: slotOrderFor(i_tier, i_lane, nValues),
          }),
        );
      }

      currentSubChartX += subChartWidth + baseStyle.lanes.gapX;
    }

    currentSubChartY += subChartHeight + baseStyle.tiers.gapY +
      measured.tierHeaderAndLabelGapHeight;
  }

  return allPrimitives;
}
