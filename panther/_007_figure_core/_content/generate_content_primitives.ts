// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartSeriesInfo,
  type ChartValueInfo,
  Coordinates,
  type DataLabel,
  getColor,
  type MergedContentStyle,
  type Primitive,
  RectCoordsDims,
  type RenderContext,
  type TextInfoUnkeyed,
  Z_INDEX,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";

// Helper function for line intersection (from old render_chart_content.ts)
function getLineIntersection(
  p1: Coordinates,
  p2: Coordinates,
  p3: Coordinates,
  p4: Coordinates,
): { x: number; y: number } | false {
  const x1 = p1.x();
  const y1 = p1.y();
  const x2 = p2.x();
  const y2 = p2.y();
  const x3 = p3.x();
  const y3 = p3.y();
  const x4 = p4.x();
  const y4 = p4.y();

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denom === 0) {
    return false; // Lines are parallel
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    const x = x1 + t * (x2 - x1);
    const y = y1 + t * (y2 - y1);
    return { x, y };
  }

  return false;
}

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

      const seriesInfo: ChartSeriesInfo = {
        ...subChartInfo,
        i_series,
        seriesHeader: d.seriesHeaders[i_series],
        nVals: mappedSeriesCoordinates[i_series].length,
      };

      const valueInfo: ChartValueInfo = {
        ...seriesInfo,
        val: mappedVal.val,
        i_val: i_val,
      };

      ////////////////////////////////////////////////////////
      //  Determine which content type gets the data label
      //  Priority: Points > Bars > Lines
      //  Only if withDataLabels is enabled
      ////////////////////////////////////////////////////////

      let dataLabelOwner: "points" | "bars" | "lines" | "none" = "none";

      if (s.withDataLabels) {
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
      }

      ////////////////////////////////////////////////////////
      //  Render Points
      ////////////////////////////////////////////////////////

      const pointStyle = s.points.getStyle(valueInfo);
      if (pointStyle.show) {
        let dataLabel: DataLabel | undefined;

        if (dataLabelOwner === "points") {
          const labelStr = s.dataLabelFormatter(valueInfo);
          if (labelStr?.trim()) {
            const mText = rc.mText(labelStr, params.dataLabelsTextStyle, 9999);
            const offset = mText.ti.fontSize * 0.3;
            const relPos = pointStyle.dataLabelPosition === "top"
              ? { rx: 0.5, dy: -(pointStyle.radius + offset) }
              : pointStyle.dataLabelPosition === "bottom"
              ? { rx: 0.5, dy: pointStyle.radius + offset }
              : pointStyle.dataLabelPosition === "left"
              ? { dx: -(pointStyle.radius + offset), ry: 0.5 }
              : pointStyle.dataLabelPosition === "right"
              ? { dx: pointStyle.radius + offset, ry: 0.5 }
              : { rx: 0.5, ry: 0.5 };
            dataLabel = {
              text: labelStr,
              mText,
              relativePosition: relPos,
            };
          }
        }

        const pointBounds = new RectCoordsDims({
          x: mappedVal.coords.x() - pointStyle.radius,
          y: mappedVal.coords.y() - pointStyle.radius,
          w: pointStyle.radius * 2,
          h: pointStyle.radius * 2,
        });

        allPrimitives.push({
          type: "chart-data-point",
          key:
            `point-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}-${i_val}`,
          bounds: pointBounds,
          zIndex: Z_INDEX.CONTENT_POINT,
          meta: {
            value: valueInfo,
          },
          coords: mappedVal.coords,
          style: pointStyle,
          dataLabel,
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
        } else if (s.bars.stacking === "uncertainty") {
          // Only render bar for series 0 (point estimate)
          if (i_series !== 0) {
            continue;
          }

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

          // Add error bar if both bounds are available
          const bound1 = mappedSeriesCoordinates[1]?.[i_val];
          const bound2 = mappedSeriesCoordinates[2]?.[i_val];

          if (bound1 && bound2) {
            // Auto-detect which is upper/lower by comparing values
            const ubY = bound1.val > bound2.val
              ? bound1.coords.y()
              : bound2.coords.y();
            const lbY = bound1.val < bound2.val
              ? bound1.coords.y()
              : bound2.coords.y();

            const errorBarBounds = new RectCoordsDims({
              x: mappedVal.coords.x() - seriesColWidth * 0.2,
              y: Math.min(ubY, lbY),
              w: seriesColWidth * 0.4,
              h: Math.abs(ubY - lbY),
            });

            allPrimitives.push({
              type: "chart-error-bar",
              key:
                `errorbar-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_val}`,
              bounds: errorBarBounds,
              zIndex: Z_INDEX.CONTENT_BAR + 1,
              meta: {
                value: valueInfo,
              },
              centerX: mappedVal.coords.x(),
              ubY,
              lbY,
              strokeColor: getColor({ key: "baseContent" }),
              strokeWidth: 3,
              capWidth: seriesColWidth * 0.4,
            });
          }
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
            const offset = mText.ti.fontSize * 0.3;

            // For uncertainty bars, position label to right of error bar cap
            if (s.bars.stacking === "uncertainty") {
              // Recalculate seriesColWidth (same logic as above)
              const seriesColWidth = Math.min(
                indicatorColWidth * _PROP_SERIES,
                s.bars.maxBarWidth,
              );
              const errorBarCapHalfWidth = seriesColWidth * 0.2;
              // Position left edge of label at: right edge of error bar cap + 8px gap
              // Since rendering uses "center" alignment, shift position right by half label width
              const horizontalOffset = barRcd.w() / 2 + errorBarCapHalfWidth +
                8 +
                mText.dims.w() / 2;

              dataLabel = {
                text: labelStr,
                mText,
                relativePosition: { dx: horizontalOffset, dy: -offset },
              };
            } else {
              dataLabel = {
                text: labelStr,
                mText,
                relativePosition: { rx: 0.5, dy: -offset },
              };
            }
          }
        }

        allPrimitives.push({
          type: "chart-bar",
          key:
            `bar-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}-${i_val}`,
          bounds: barRcd,
          zIndex: Z_INDEX.CONTENT_BAR,
          meta: {
            value: valueInfo,
          },
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
          style: {
            fillColor: getColor(barStyle.fillColor),
          },
          dataLabel,
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
            const offset = mText.ti.fontSize * 0.3;
            lineData.pointLabels!.push({
              coordIndex: lineData.coords.length - 1,
              dataLabel: {
                text: labelStr,
                mText,
                relativePosition: { rx: 0.5, dy: -offset },
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
    const seriesInfo: ChartSeriesInfo = {
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
      bounds: new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 }), // TODO: Compute proper bounds
      zIndex: Z_INDEX.CONTENT_LINE,
      meta: {
        series: seriesInfo,
        valueIndices: lineData.valueIndices,
      },
      coords: lineData.coords,
      style: lineStyle,
      pointLabels: lineData.pointLabels,
    });
  }

  // Generate area primitives
  if (s.areas && !s.areas.diff.enabled) {
    //////////////////////////
    //                      //
    //    NOT DIFF AREAS    //
    //                      //
    //////////////////////////
    for (const [i_series, areaData] of areaSeriesData.entries()) {
      const seriesInfo: ChartSeriesInfo = {
        ...subChartInfo,
        i_series,
        seriesHeader: d.seriesHeaders[i_series],
        nVals: areaData.coords.length,
      };

      const areaStyle = s.areas.getStyle(seriesInfo);
      if (!areaStyle.show) {
        continue;
      }

      const areas: {
        coords: Coordinates[];
      }[] = [];
      let currentCoords: Coordinates[] = [];

      for (let i_val = 0; i_val < areaData.coords.length; i_val++) {
        const mappedValThisSeries =
          mappedSeriesCoordinates[i_series][areaData.valueIndices[i_val]];
        if (mappedValThisSeries === undefined) {
          if (!s.lines.joinAcrossGaps && currentCoords.length > 0) {
            areas.push({ coords: currentCoords });
            currentCoords = [];
          }
          continue;
        }

        let mirrorCoords: Coordinates | undefined;
        if (areaStyle.to === "zero-line") {
          mirrorCoords = new Coordinates([
            mappedValThisSeries.coords.x(),
            subChartRcd.bottomY() + gridStrokeWidth / 2,
          ]);
        } else if (areaStyle.to === "previous-series-or-zero") {
          const otherSeries = mappedSeriesCoordinates[i_series - 1];
          if (!otherSeries) {
            mirrorCoords = new Coordinates([
              mappedValThisSeries.coords.x(),
              subChartRcd.bottomY() + gridStrokeWidth / 2,
            ]);
          } else if (otherSeries[areaData.valueIndices[i_val]]) {
            mirrorCoords = otherSeries[areaData.valueIndices[i_val]]!.coords;
          }
        } else if (areaStyle.to === "previous-series-or-skip") {
          const otherSeries = mappedSeriesCoordinates[i_series - 1];
          if (otherSeries?.[areaData.valueIndices[i_val]]) {
            mirrorCoords = otherSeries[areaData.valueIndices[i_val]]!.coords;
          }
        } else {
          throw new Error("Should not be possible");
        }

        if (mirrorCoords === undefined) {
          if (currentCoords.length > 0) {
            areas.push({ coords: currentCoords });
            currentCoords = [];
          }
          continue;
        }

        currentCoords.unshift(mappedValThisSeries.coords);
        currentCoords.push(mirrorCoords);
      }

      if (currentCoords.length > 0) {
        areas.push({ coords: currentCoords });
        currentCoords = [];
      }

      for (let i_area = 0; i_area < areas.length; i_area++) {
        if (areas[i_area].coords.length === 0) {
          continue;
        }

        const lineCoordArray: Coordinates[] = [];
        lineCoordArray.push(areas[i_area].coords[0]);
        for (
          // Start at 1
          let i_coord = 1;
          i_coord < areas[i_area].coords.length;
          i_coord++
        ) {
          lineCoordArray.push(areas[i_area].coords[i_coord]);
        }
        lineCoordArray.push(areas[i_area].coords[0]);

        allPrimitives.push({
          type: "chart-area-series",
          key:
            `area-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${i_series}-${i_area}`,
          bounds: new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 }), // TODO: Compute proper bounds
          zIndex: Z_INDEX.CONTENT_AREA,
          meta: {
            series: seriesInfo,
            valueIndices: areaData.valueIndices,
          },
          coords: lineCoordArray,
          style: areaStyle,
        });
      }
    }
  } else if (s.areas && s.areas.diff.enabled) {
    /////////////////////////
    //                     //
    //    IS DIFF AREAS    //
    //                     //
    /////////////////////////
    const areas: {
      order: "over" | "under";
      coords: Coordinates[];
    }[] = [];
    let currentCoords: Coordinates[] = [];

    let prevOrderOfSeries_1: undefined | "over" | "under" | "equal" = undefined;
    let prevMappedVal_1:
      | {
        coords: Coordinates;
        val: number;
        barHeight: number;
      }
      | undefined = undefined;
    let prevMappedVal_2:
      | {
        coords: Coordinates;
        val: number;
        barHeight: number;
      }
      | undefined = undefined;

    for (let i_val = 0; i_val < mappedSeriesCoordinates[0].length; i_val++) {
      const mappedValThisSeries_1 = mappedSeriesCoordinates[0][i_val];
      const mappedValThisSeries_2 = mappedSeriesCoordinates[1][i_val];
      if (
        mappedValThisSeries_1 === undefined ||
        mappedValThisSeries_2 === undefined
      ) {
        if (
          currentCoords.length > 0 &&
          (prevOrderOfSeries_1 === "over" || prevOrderOfSeries_1 === "under")
        ) {
          areas.push({
            coords: currentCoords,
            order: prevOrderOfSeries_1,
          });
          currentCoords = [];
        }
        prevOrderOfSeries_1 = undefined;
        prevMappedVal_1 = undefined;
        prevMappedVal_2 = undefined;
        continue;
      }
      const thisOrder = mappedValThisSeries_1.val === mappedValThisSeries_2.val
        ? "equal"
        : mappedValThisSeries_1.val > mappedValThisSeries_2.val
        ? "over"
        : "under";

      if (prevOrderOfSeries_1 === undefined) {
        if (thisOrder === "equal") {
          // Do nothing
        } else {
          currentCoords.unshift(mappedValThisSeries_1.coords);
          currentCoords.push(mappedValThisSeries_2.coords);
        }
      } else if (thisOrder === "equal") {
        if (prevOrderOfSeries_1 === "equal") {
          // Do nothing
        } else {
          currentCoords.push(mappedValThisSeries_1.coords);
          if (currentCoords.length > 0) {
            areas.push({ coords: currentCoords, order: prevOrderOfSeries_1 });
            currentCoords = [];
          }
        }
      } else if (prevOrderOfSeries_1 === "equal") {
        currentCoords.push(new Coordinates(prevMappedVal_1!.coords));
        currentCoords.unshift(mappedValThisSeries_1.coords);
        currentCoords.push(mappedValThisSeries_2.coords);
      } else if (thisOrder === prevOrderOfSeries_1) {
        currentCoords.unshift(mappedValThisSeries_1.coords);
        currentCoords.push(mappedValThisSeries_2.coords);
      } else {
        const interception = getLineIntersection(
          prevMappedVal_1!.coords,
          mappedValThisSeries_1.coords,
          prevMappedVal_2!.coords,
          mappedValThisSeries_2.coords,
        );
        if (interception === false) {
          throw new Error("Bad interception when diffing areas");
        }
        currentCoords.push(new Coordinates(interception));
        areas.push({ coords: currentCoords, order: prevOrderOfSeries_1 });
        currentCoords = [];
        currentCoords.push(new Coordinates(interception));
        currentCoords.unshift(mappedValThisSeries_1.coords);
        currentCoords.push(mappedValThisSeries_2.coords);
      }
      prevOrderOfSeries_1 = thisOrder;
      prevMappedVal_1 = mappedValThisSeries_1;
      prevMappedVal_2 = mappedValThisSeries_2;
    }

    if (
      currentCoords.length > 0 &&
      (prevOrderOfSeries_1 === "over" || prevOrderOfSeries_1 === "under")
    ) {
      areas.push({ coords: currentCoords, order: prevOrderOfSeries_1 });
      currentCoords = [];
    }

    for (let i_area = 0; i_area < areas.length; i_area++) {
      if (areas[i_area].coords.length === 0) {
        continue;
      }
      const seriesInfo: ChartSeriesInfo = {
        ...subChartInfo,
        i_series: areas[i_area].order === "over" ? 0 : 1,
        seriesHeader: d.seriesHeaders[0],
        nVals: 0,
      };
      const areaStyle = s.areas.getStyle(seriesInfo);
      const lineCoordArray: Coordinates[] = [];
      lineCoordArray.push(areas[i_area].coords[0]);
      for (
        // Start at 1
        let i_coord = 1;
        i_coord < areas[i_area].coords.length;
        i_coord++
      ) {
        lineCoordArray.push(areas[i_area].coords[i_coord]);
      }
      lineCoordArray.push(areas[i_area].coords[0]);

      allPrimitives.push({
        type: "chart-area-series",
        key:
          `area-diff-${subChartInfo.i_pane}-${subChartInfo.i_tier}-${subChartInfo.i_lane}-${
            areas[i_area].order
          }-${i_area}`,
        bounds: new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 }), // TODO: Compute proper bounds
        zIndex: Z_INDEX.CONTENT_AREA,
        meta: {
          series: seriesInfo,
          valueIndices: [], // Not applicable for diff areas
        },
        coords: lineCoordArray,
        style: areaStyle,
      });
    }
  }

  return allPrimitives;
}
