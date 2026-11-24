// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AreaDiffPair,
  type ChartValueAxis,
  computeBoundsForPath,
  Coordinates,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import { chartSeriesItem } from "../chart_items.ts";
import {
  type MappedValueCoordinate,
  valueRangeOfAxis,
  zeroLineCoord,
} from "./calculate_mapped_coordinates.ts";
import {
  type ContentGenerationContext,
  placeSeriesOnValueAxes,
  type SubChartContent,
} from "./content_generation_types.ts";
import { valueExtendDir, withValueCoord } from "./orientation_helpers.ts";

export function generateAreaPrimitives(
  mapped: MappedValueCoordinate[][],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): Primitive[] {
  const s = ctx.contentStyle;
  const { i_pane, i_tier, i_lane, slotOrder, rcd: subChartRcd } = ctx.subChart;
  // At an axis edge an area lies on one side of the zero line and reaches half
  // a grid stroke past it, covering the edge's grid line; inside the axis an
  // area may lie on both sides, so it closes on the line. Each value axis has
  // its own zero line.
  const halfStroke = valueExtendDir(ctx.orientation) *
    ctx.gridLineStrokeWidth / 2;
  const closingEdgeOf = (valueAxis: ChartValueAxis): number => {
    const valueRange = valueRangeOfAxis(ctx.subChart, valueAxis);
    const zeroLine = zeroLineCoord({
      subChartRcd,
      valueRange,
      valueClearance: ctx.subChart.valueClearance,
      orientation: ctx.orientation,
    });
    return valueRange.valueMin >= 0
      ? zeroLine - halfStroke
      : valueRange.valueMax <= 0
      ? zeroLine + halfStroke
      : zeroLine;
  };
  const seriesPlaces = placeSeriesOnValueAxes(ctx.subChart.seriesValueAxes);

  const primitives: Primitive[] = [];

  if (!s.areas.diff.enabled) {
    for (let i_series = 0; i_series < mapped.length; i_series++) {
      const { info: seriesInfo, area: areaStyle } =
        content.resolvedSeries[i_series];
      if (!areaStyle.show) {
        continue;
      }
      const closingEdge = closingEdgeOf(
        ctx.subChart.seriesValueAxes[i_series],
      );
      const previousOnAxis = seriesPlaces[i_series].previous;
      const otherSeries = previousOnAxis === undefined
        ? undefined
        : mapped[previousOnAxis];
      const valueIndices = slotOrder.filter((i_value) =>
        mapped[i_series][i_value] !== undefined
      );

      const areas: { coords: Coordinates[] }[] = [];
      let currentCoords: Coordinates[] = [];

      for (const i_value of slotOrder) {
        const mappedValueThisSeries = mapped[i_series][i_value];
        if (mappedValueThisSeries === undefined) {
          if (!s.areas.joinAcrossGaps && currentCoords.length > 0) {
            areas.push({ coords: currentCoords });
            currentCoords = [];
          }
          continue;
        }

        let mirrorCoords: Coordinates | undefined;
        if (areaStyle.to === "zero-line") {
          mirrorCoords = withValueCoord(
            mappedValueThisSeries.coords,
            closingEdge,
            ctx.orientation,
          );
        } else if (areaStyle.to === "previous-series-or-zero") {
          if (!otherSeries) {
            mirrorCoords = withValueCoord(
              mappedValueThisSeries.coords,
              closingEdge,
              ctx.orientation,
            );
          } else if (otherSeries[i_value]) {
            mirrorCoords = otherSeries[i_value]!.coords;
          }
        } else if (areaStyle.to === "previous-series-or-skip") {
          if (otherSeries?.[i_value]) {
            mirrorCoords = otherSeries[i_value]!.coords;
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

        currentCoords.unshift(mappedValueThisSeries.coords);
        currentCoords.push(mirrorCoords);
      }

      if (currentCoords.length > 0) {
        areas.push({ coords: currentCoords });
      }

      for (let i_area = 0; i_area < areas.length; i_area++) {
        if (areas[i_area].coords.length === 0) continue;

        const lineCoordArray = [
          ...areas[i_area].coords,
          areas[i_area].coords[0],
        ];
        const bounds = computeBoundsForPath(lineCoordArray);

        primitives.push({
          type: "chart-area-series",
          key: `area-${i_pane}-${i_tier}-${i_lane}-${i_series}-${i_area}`,
          item: chartSeriesItem(ctx.itemDataDimensions, seriesInfo),
          part: "body",
          bounds,
          hitBounds: bounds,
          zIndex: Z_INDEX.CONTENT_AREA,
          meta: {
            series: seriesInfo,
            valueIndices,
          },
          annotationGroup: areaStyle.annotationGroup,
          coords: lineCoordArray,
          style: areaStyle,
        });
      }
    }
  } else {
    s.areas.diff.pairs.forEach((pair, i_pair) => {
      // A pair naming an absent series has nothing to diff — degrade rather
      // than dereference. Nor does a pair of series drawn against different
      // value axes, whose values are in different units.
      if (
        mapped[pair.series[0]] === undefined ||
        mapped[pair.series[1]] === undefined ||
        ctx.subChart.seriesValueAxes[pair.series[0]] !==
          ctx.subChart.seriesValueAxes[pair.series[1]]
      ) {
        return;
      }
      primitives.push(
        ...generateDiffPairPrimitives(pair, i_pair, mapped, content, ctx),
      );
    });
  }

  return primitives;
}

// One diff pair's walk: segment the span into "over"/"under" areas at the
// crossing points of series a and b, then emit those areas the pair asks for,
// attributed per the AreaDiffPair contract (over → a, under → b).
function generateDiffPairPrimitives(
  pair: AreaDiffPair,
  i_pair: number,
  mapped: MappedValueCoordinate[][],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): Primitive[] {
  const { i_pane, i_tier, i_lane, slotOrder } = ctx.subChart;
  const seriesA = mapped[pair.series[0]];
  const seriesB = mapped[pair.series[1]];

  const areas: {
    order: "over" | "under";
    coords: Coordinates[];
  }[] = [];
  let currentCoords: Coordinates[] = [];

  let prevOrderOfA: undefined | "over" | "under" | "equal" = undefined;
  let prevMappedValueA: MappedValueCoordinate | undefined = undefined;
  let prevMappedValueB: MappedValueCoordinate | undefined = undefined;

  for (const i_value of slotOrder) {
    const mappedValueA = seriesA[i_value];
    const mappedValueB = seriesB[i_value];
    if (mappedValueA === undefined || mappedValueB === undefined) {
      if (
        currentCoords.length > 0 &&
        (prevOrderOfA === "over" || prevOrderOfA === "under")
      ) {
        areas.push({
          coords: currentCoords,
          order: prevOrderOfA,
        });
        currentCoords = [];
      }
      prevOrderOfA = undefined;
      prevMappedValueA = undefined;
      prevMappedValueB = undefined;
      continue;
    }
    const thisOrder = mappedValueA.value === mappedValueB.value
      ? "equal"
      : mappedValueA.value > mappedValueB.value
      ? "over"
      : "under";

    if (prevOrderOfA === undefined) {
      if (thisOrder === "equal") {
        // Do nothing
      } else {
        currentCoords.unshift(mappedValueA.coords);
        currentCoords.push(mappedValueB.coords);
      }
    } else if (thisOrder === "equal") {
      if (prevOrderOfA === "equal") {
        // Do nothing
      } else {
        currentCoords.push(mappedValueA.coords);
        if (currentCoords.length > 0) {
          areas.push({ coords: currentCoords, order: prevOrderOfA });
          currentCoords = [];
        }
      }
    } else if (prevOrderOfA === "equal") {
      currentCoords.push(new Coordinates(prevMappedValueA!.coords));
      currentCoords.unshift(mappedValueA.coords);
      currentCoords.push(mappedValueB.coords);
    } else if (thisOrder === prevOrderOfA) {
      currentCoords.unshift(mappedValueA.coords);
      currentCoords.push(mappedValueB.coords);
    } else {
      let interception = getLineIntersection(
        prevMappedValueA!.coords,
        mappedValueA.coords,
        prevMappedValueB!.coords,
        mappedValueB.coords,
      );
      if (interception === false) {
        const x1 = prevMappedValueA!.coords.x();
        const y1 = prevMappedValueA!.coords.y();
        const x2 = mappedValueA.coords.x();
        const y2 = mappedValueA.coords.y();
        const x3 = prevMappedValueB!.coords.x();
        const y3 = prevMappedValueB!.coords.y();
        const x4 = mappedValueB.coords.x();
        const y4 = mappedValueB.coords.y();
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) {
          interception = {
            x: (x1 + x2 + x3 + x4) / 4,
            y: (y1 + y2 + y3 + y4) / 4,
          };
        } else {
          const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
          interception = {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1),
          };
        }
      }
      currentCoords.push(new Coordinates(interception));
      areas.push({ coords: currentCoords, order: prevOrderOfA });
      currentCoords = [];
      currentCoords.push(new Coordinates(interception));
      currentCoords.unshift(mappedValueA.coords);
      currentCoords.push(mappedValueB.coords);
    }
    prevOrderOfA = thisOrder;
    prevMappedValueA = mappedValueA;
    prevMappedValueB = mappedValueB;
  }

  if (
    currentCoords.length > 0 &&
    (prevOrderOfA === "over" || prevOrderOfA === "under")
  ) {
    areas.push({ coords: currentCoords, order: prevOrderOfA });
  }

  const primitives: Primitive[] = [];
  for (let i_area = 0; i_area < areas.length; i_area++) {
    if (areas[i_area].coords.length === 0) continue;
    const order = areas[i_area].order;
    if (pair.emit !== "both" && order !== pair.emit) continue;
    const i_series = order === "over" ? pair.series[0] : pair.series[1];
    const { info: seriesInfo, area: areaStyle } =
      content.resolvedSeries[i_series];
    const lineCoordArray = [...areas[i_area].coords, areas[i_area].coords[0]];
    const bounds = computeBoundsForPath(lineCoordArray);

    primitives.push({
      type: "chart-area-series",
      key:
        `area-diff-${i_pane}-${i_tier}-${i_lane}-${i_pair}-${order}-${i_area}`,
      item: chartSeriesItem(ctx.itemDataDimensions, seriesInfo),
      part: "body",
      bounds,
      hitBounds: bounds,
      zIndex: Z_INDEX.CONTENT_AREA,
      meta: {
        series: seriesInfo,
        valueIndices: [],
      },
      annotationGroup: areaStyle.annotationGroup,
      coords: lineCoordArray,
      style: areaStyle,
    });
  }
  return primitives;
}

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
    return false;
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
