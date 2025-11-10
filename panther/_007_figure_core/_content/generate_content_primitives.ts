// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type DataLabel,
  type GenericSeriesInfo,
  type GenericValueInfo,
  getColor,
  type MergedContentStyle,
  type Primitive,
  RectCoordsDims,
  type RenderContext,
  type TextInfoUnkeyed,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";

export type ContentPrimitiveGenerationParams = {
  rc: RenderContext; // For measuring data label text
  mappedSeriesCoordinates: MappedValueCoordinate[][];
  subChartRcd: RectCoordsDims;
  subChartInfo: {
    nSerieses: number;
    seriesValArrays: (number | undefined)[][];
    i_pane: number;
    nPanes: number;
    i_tier: number;
    nTiers: number;
    i_lane: number;
    nLanes: number;
  };
  incrementWidth: number;
  gridStrokeWidth: number;
  nVals: number;
  transformedData: { seriesHeaders: string[] };
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
};

const _PROP_INDICATOR = 0.8;
const _PROP_SERIES = 0.9;

export function generateContentPrimitives(
  params: ContentPrimitiveGenerationParams,
): Primitive[] {
  const {
    rc,
    mappedSeriesCoordinates,
    subChartRcd,
    subChartInfo,
    incrementWidth,
    gridStrokeWidth,
    nVals,
    transformedData: d,
    contentStyle: s,
  } = params;

  const allPrimitives: Primitive[] = [];
  const nSeries = mappedSeriesCoordinates.length;

  // Track line and area data for series-level primitives
  const lineSeriesData: Map<
    number,
    {
      coords: Coordinates[];
      values: number[];
      valueIndices: number[];
      pointLabels?: Array<{ coordIndex: number; dataLabel: DataLabel }>;
    }
  > = new Map();

  const areaSeriesData: Map<
    number,
    {
      coords: Coordinates[];
      values: number[];
      valueIndices: number[];
    }
  > = new Map();

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //    Loop through all values and determine data label priority               //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  for (let i_val = 0; i_val < nVals; i_val++) {
    for (let i_series = 0; i_series < nSeries; i_series++) {
      const mappedVal = mappedSeriesCoordinates[i_series][i_val];
      if (mappedVal === undefined) {
        continue;
      }

      const seriesInfo: GenericSeriesInfo = {
        ...subChartInfo,
        i_series,
        seriesHeader: d.seriesHeaders[i_series],
        nVals: mappedSeriesCoordinates[i_series].length,
      };

      const valueInfo: GenericValueInfo = {
        ...seriesInfo,
        val: mappedVal.val,
        i_val: i_val,
      };

      ////////////////////////////////////////////////////////
      //  Determine which content type gets the data label
      //  Priority: Points > Bars > Lines
      ////////////////////////////////////////////////////////

      let dataLabelOwner: "points" | "bars" | "lines" | "none" = "none";

      const pointStyle = s.points.getStyle(valueInfo);
      if (pointStyle.show) {
        dataLabelOwner = "points";
      } else {
        const barStyle = s.bars.getStyle(valueInfo);
        if (barStyle.show) {
          dataLabelOwner = "bars";
        } else {
          const lineStyle = s.lines.getStyle(seriesInfo);
          if (lineStyle.show) {
            dataLabelOwner = "lines";
          }
        }
      }

      ////////////////////////////////////////////////////////
      //  Render Points
      ////////////////////////////////////////////////////////

      if (pointStyle.show) {
        let dataLabel: DataLabel | undefined;

        if (dataLabelOwner === "points") {
          const labelStr = s.dataLabelFormatter(valueInfo);
          if (labelStr?.trim()) {
            const mText = rc.mText(labelStr, params.dataLabelsTextStyle, 9999);
            dataLabel = {
              text: labelStr,
              mText,
              position: pointStyle.dataLabelPosition,
              offsetFromElement: mText.ti.fontSize * 0.3,
            };
          }
        }

        allPrimitives.push({
          type: "chart-data-point",
          key:
            `point-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}-${i_val}`,
          layer: "content-point",
          seriesIndex: i_series,
          valueIndex: i_val,
          value: mappedVal.val,
          coords: mappedVal.coords,
          style: pointStyle,
          dataLabel,
          paneIndex: subChartInfo.i_pane,
          tierIndex: subChartInfo.i_tier,
          laneIndex: subChartInfo.i_lane,
        });
      }

      ////////////////////////////////////////////////////////
      //  Render Bars
      ////////////////////////////////////////////////////////

      const barStyle = s.bars.getStyle(valueInfo);
      if (barStyle.show) {
        // Calculate bar geometry based on stacking mode
        const indicatorColWidth = incrementWidth * _PROP_INDICATOR;
        const indicatorColAreaX = mappedVal.coords.x() - indicatorColWidth / 2;

        let barRcd: RectCoordsDims;
        let isTopOfStack = false;
        let stackTotal = 0;
        let positionInStack = 0;

        if (s.bars.stacking === "stacked") {
          const seriesColWidth = Math.min(
            indicatorColWidth * _PROP_SERIES,
            s.bars.maxBarWidth,
          );
          const seriesColX = indicatorColAreaX +
            (indicatorColWidth - seriesColWidth) / 2;

          // Calculate accumulated height from all series
          let accumulatedHeight = 0;
          for (let s_idx = 0; s_idx < i_series; s_idx++) {
            const mv = mappedSeriesCoordinates[s_idx][i_val];
            if (mv !== undefined) {
              accumulatedHeight += mv.barHeight;
            }
          }

          barRcd = new RectCoordsDims({
            x: seriesColX,
            y: subChartRcd.y() +
              (subChartRcd.h() - accumulatedHeight - mappedVal.barHeight),
            w: seriesColWidth,
            h: mappedVal.barHeight + (i_series === 0 ? gridStrokeWidth / 2 : 0),
          });

          isTopOfStack = i_series === nSeries - 1;

          // Calculate stack total
          for (let s_idx = 0; s_idx <= nSeries - 1; s_idx++) {
            const mv = mappedSeriesCoordinates[s_idx][i_val];
            if (mv !== undefined) {
              stackTotal += mv.val;
            }
          }
          positionInStack = i_series;
        } else if (s.bars.stacking === "imposed") {
          const seriesColWidth = Math.min(
            indicatorColWidth * _PROP_SERIES,
            s.bars.maxBarWidth,
          );
          const seriesColX = indicatorColAreaX +
            (indicatorColWidth - seriesColWidth) / 2;

          barRcd = new RectCoordsDims({
            x: seriesColX,
            y: mappedVal.coords.y(),
            w: seriesColWidth,
            h: subChartRcd.bottomY() +
              gridStrokeWidth / 2 -
              mappedVal.coords.y(),
          });
        } else {
          // Grouped bars
          const seriesOuterAreaWidth = indicatorColWidth / nSeries;
          const seriesOuterAreaX = indicatorColAreaX +
            seriesOuterAreaWidth * i_series;
          const seriesColWidth = Math.min(
            seriesOuterAreaWidth * _PROP_SERIES,
            s.bars.maxBarWidth,
          );
          const seriesColX = seriesOuterAreaX +
            (seriesOuterAreaWidth - seriesColWidth) / 2;

          barRcd = new RectCoordsDims({
            x: seriesColX,
            y: mappedVal.coords.y(),
            w: seriesColWidth,
            h: subChartRcd.bottomY() +
              gridStrokeWidth / 2 -
              mappedVal.coords.y(),
          });
        }

        // Data label only if bars have priority AND (top of stack for stacked OR always for other modes)
        let dataLabel: DataLabel | undefined;
        const shouldShowLabel =
          (s.bars.stacking === "stacked" ? isTopOfStack : true) &&
          dataLabelOwner === "bars";

        if (shouldShowLabel) {
          const labelStr = s.dataLabelFormatter(valueInfo);
          if (labelStr?.trim()) {
            const mText = rc.mText(
              labelStr,
              params.dataLabelsTextStyle,
              barRcd.w(),
            );
            dataLabel = {
              text: labelStr,
              mText,
              position: "top",
              offsetFromElement: mText.ti.fontSize * 0.3,
            };
          }
        }

        allPrimitives.push({
          type: "chart-bar",
          key:
            `bar-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}-${i_val}`,
          layer: "content-bar",
          seriesIndex: i_series,
          valueIndex: i_val,
          value: mappedVal.val,
          stackingMode: s.bars.stacking === "stacked"
            ? "stacked"
            : s.bars.stacking === "imposed"
            ? "imposed"
            : "grouped",
          stackInfo: s.bars.stacking === "stacked"
            ? {
              isTopOfStack,
              stackTotal,
              positionInStack,
            }
            : undefined,
          orientation: "vertical",
          rcd: barRcd,
          style: {
            fillColor: getColor(barStyle.fillColor),
          },
          dataLabel,
          paneIndex: subChartInfo.i_pane,
          tierIndex: subChartInfo.i_tier,
          laneIndex: subChartInfo.i_lane,
        });
      }

      ////////////////////////////////////////////////////////
      //  Collect Lines data
      ////////////////////////////////////////////////////////

      const lineStyle = s.lines.getStyle(seriesInfo);
      if (lineStyle.show) {
        // Collect data for line series
        if (!lineSeriesData.has(i_series)) {
          lineSeriesData.set(i_series, {
            coords: [],
            values: [],
            valueIndices: [],
            pointLabels: [],
          });
        }

        const lineData = lineSeriesData.get(i_series)!;
        lineData.coords.push(mappedVal.coords);
        lineData.values.push(mappedVal.val);
        lineData.valueIndices.push(i_val);

        // Add data label only if lines have priority
        if (dataLabelOwner === "lines") {
          const labelStr = s.dataLabelFormatter(valueInfo);
          if (labelStr?.trim()) {
            const mText = rc.mText(labelStr, params.dataLabelsTextStyle, 9999);
            lineData.pointLabels!.push({
              coordIndex: lineData.coords.length - 1,
              dataLabel: {
                text: labelStr,
                mText,
                position: "top",
                offsetFromElement: mText.ti.fontSize * 0.3,
              },
            });
          }
        }
      }

      ////////////////////////////////////////////////////////
      //  Collect Areas data (no labels on areas)
      ////////////////////////////////////////////////////////

      const areaStyle = s.areas?.getStyle(seriesInfo);
      if (areaStyle?.show) {
        // Collect data for area series
        if (!areaSeriesData.has(i_series)) {
          areaSeriesData.set(i_series, {
            coords: [],
            values: [],
            valueIndices: [],
          });
        }

        const areaData = areaSeriesData.get(i_series)!;

        // Add primary coords
        areaData.coords.push(mappedVal.coords);
        areaData.values.push(mappedVal.val);
        areaData.valueIndices.push(i_val);

        // Areas are built by adding mirror coords in reverse after primary coords
        // This is handled after the loop when generating area primitives
      }
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //    Generate series-level primitives (lines and areas)                      //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  // Generate line primitives
  for (const [i_series, lineData] of lineSeriesData.entries()) {
    const seriesInfo: GenericSeriesInfo = {
      ...subChartInfo,
      i_series,
      seriesHeader: d.seriesHeaders[i_series],
      nVals: lineData.coords.length,
    };

    const lineStyle = s.lines.getStyle(seriesInfo);

    allPrimitives.push({
      type: "chart-line-series",
      key:
        `line-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}`,
      layer: "content-line",
      seriesIndex: i_series,
      valueIndices: lineData.valueIndices,
      values: lineData.values,
      coords: lineData.coords,
      style: lineStyle,
      pointLabels: lineData.pointLabels,
      paneIndex: subChartInfo.i_pane,
      tierIndex: subChartInfo.i_tier,
      laneIndex: subChartInfo.i_lane,
    });
  }

  // Generate area primitives
  for (const [i_series, areaData] of areaSeriesData.entries()) {
    const seriesInfo: GenericSeriesInfo = {
      ...subChartInfo,
      i_series,
      seriesHeader: d.seriesHeaders[i_series],
      nVals: areaData.coords.length,
    };

    const areaStyle = s.areas?.getStyle(seriesInfo);
    if (!areaStyle) continue;

    // Build complete area coords with mirrors
    const completeCoords: Coordinates[] = [...areaData.coords];

    // Add mirror coords in reverse
    for (let i = areaData.coords.length - 1; i >= 0; i--) {
      let mirrorCoords: Coordinates | undefined;

      if (areaStyle.to === "zero-line") {
        mirrorCoords = new Coordinates({
          x: areaData.coords[i].x(),
          y: subChartRcd.bottomY() + gridStrokeWidth / 2,
        });
      } else if (areaStyle.to === "previous-series-or-zero" && i_series > 0) {
        const prevMappedVal =
          mappedSeriesCoordinates[i_series - 1][areaData.valueIndices[i]];
        if (prevMappedVal) {
          mirrorCoords = prevMappedVal.coords;
        } else {
          mirrorCoords = new Coordinates({
            x: areaData.coords[i].x(),
            y: subChartRcd.bottomY() + gridStrokeWidth / 2,
          });
        }
      } else if (areaStyle.to === "previous-series-or-skip" && i_series > 0) {
        const prevMappedVal =
          mappedSeriesCoordinates[i_series - 1][areaData.valueIndices[i]];
        if (prevMappedVal) {
          mirrorCoords = prevMappedVal.coords;
        }
        // If no previous value, mirrorCoords stays undefined and coord is not added
      } else {
        mirrorCoords = new Coordinates({
          x: areaData.coords[i].x(),
          y: subChartRcd.bottomY() + gridStrokeWidth / 2,
        });
      }

      if (mirrorCoords) {
        completeCoords.push(mirrorCoords);
      }
    }

    allPrimitives.push({
      type: "chart-area-series",
      key:
        `area-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}`,
      layer: "content-area",
      seriesIndex: i_series,
      valueIndices: areaData.valueIndices,
      values: areaData.values,
      coords: completeCoords,
      style: areaStyle,
      paneIndex: subChartInfo.i_pane,
      tierIndex: subChartInfo.i_tier,
      laneIndex: subChartInfo.i_lane,
    });
  }

  return allPrimitives;
}
