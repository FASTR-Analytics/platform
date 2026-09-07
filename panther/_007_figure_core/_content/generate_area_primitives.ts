// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AreaDiffPair,
  type ChartSeriesInfo,
  computeBoundsForPath,
  Coordinates,
  type MergedContentStyle,
  type Primitive,
  type RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  type ContentGenerationContext,
} from "./content_generation_types.ts";

function zeroLineMirrorCoords(
  valCoords: Coordinates,
  subChartRcd: RectCoordsDims,
  gridStrokeWidth: number,
  orientation: "vertical" | "horizontal",
  valueClearanceStart: number,
): Coordinates {
  if (orientation === "horizontal") {
    // Horizontal: baseline is the valueMin grid line (left edge of the plot
    // area plus the start-side overhang clearance).
    return new Coordinates([
      subChartRcd.x() + valueClearanceStart - gridStrokeWidth / 2,
      valCoords.y(),
    ]);
  }
  // Vertical: baseline is the valueMin grid line (bottom edge of the plot
  // area minus the start-side overhang clearance).
  return new Coordinates([
    valCoords.x(),
    subChartRcd.bottomY() - valueClearanceStart + gridStrokeWidth / 2,
  ]);
}

export function generateAreaPrimitives(
  mapped: MappedValueCoordinate[][],
  ctx: ContentGenerationContext,
): Primitive[] {
  const s = ctx.contentStyle;

  const seriesInfos = Array.from(
    { length: ctx.nSeries },
    (_, i) => buildSeriesInfo(ctx, i, mapped),
  );

  const areaSeriesData: Map<
    number,
    {
      coords: Coordinates[];
      values: number[];
      valueIndices: number[];
    }
  > = new Map();

  for (let i_val = 0; i_val < ctx.nVals; i_val++) {
    for (let i_series = 0; i_series < ctx.nSeries; i_series++) {
      const mappedVal = mapped[i_series][i_val];
      if (mappedVal === undefined) continue;

      const seriesInfo = seriesInfos[i_series];
      const areaStyle = s.areas?.getStyle(seriesInfo);
      if (!areaStyle?.show) continue;

      if (!areaSeriesData.has(i_series)) {
        areaSeriesData.set(i_series, {
          coords: [],
          values: [],
          valueIndices: [],
        });
      }

      const areaData = areaSeriesData.get(i_series)!;
      areaData.coords.push(mappedVal.coords);
      areaData.values.push(mappedVal.val);
      areaData.valueIndices.push(i_val);
    }
  }

  const primitives: Primitive[] = [];

  if (s.areas && !s.areas.diff.enabled) {
    for (const [i_series, areaData] of areaSeriesData.entries()) {
      const seriesInfo: ChartSeriesInfo = {
        ...seriesInfos[i_series],
        nVals: areaData.coords.length,
      };

      const areaStyle = s.areas.getStyle(seriesInfo);
      if (!areaStyle.show) continue;

      const areas: { coords: Coordinates[] }[] = [];
      let currentCoords: Coordinates[] = [];

      for (let i_val = 0; i_val < areaData.coords.length; i_val++) {
        const mappedValThisSeries =
          mapped[i_series][areaData.valueIndices[i_val]];
        if (mappedValThisSeries === undefined) {
          if (!s.areas.joinAcrossGaps && currentCoords.length > 0) {
            areas.push({ coords: currentCoords });
            currentCoords = [];
          }
          continue;
        }

        let mirrorCoords: Coordinates | undefined;
        if (areaStyle.to === "zero-line") {
          mirrorCoords = zeroLineMirrorCoords(
            mappedValThisSeries.coords,
            ctx.subChartRcd,
            ctx.gridStrokeWidth,
            ctx.orientation,
            ctx.valueClearance.start,
          );
        } else if (areaStyle.to === "previous-series-or-zero") {
          const otherSeries = mapped[i_series - 1];
          if (!otherSeries) {
            mirrorCoords = zeroLineMirrorCoords(
              mappedValThisSeries.coords,
              ctx.subChartRcd,
              ctx.gridStrokeWidth,
              ctx.orientation,
              ctx.valueClearance.start,
            );
          } else if (otherSeries[areaData.valueIndices[i_val]]) {
            mirrorCoords = otherSeries[areaData.valueIndices[i_val]]!.coords;
          }
        } else if (areaStyle.to === "previous-series-or-skip") {
          const otherSeries = mapped[i_series - 1];
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
      }

      for (let i_area = 0; i_area < areas.length; i_area++) {
        if (areas[i_area].coords.length === 0) continue;

        const lineCoordArray = [
          ...areas[i_area].coords,
          areas[i_area].coords[0],
        ];

        primitives.push({
          type: "chart-area-series",
          key:
            `area-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_area}`,
          bounds: computeBoundsForPath(lineCoordArray),
          zIndex: Z_INDEX.CONTENT_AREA,
          meta: {
            series: seriesInfo,
            valueIndices: areaData.valueIndices,
          },
          annotationGroup: areaStyle.annotationGroup,
          coords: lineCoordArray,
          style: areaStyle,
        });
      }
    }
  } else if (s.areas && s.areas.diff.enabled) {
    const areasStyle = s.areas;
    areasStyle.diff.pairs.forEach((pair, i_pair) => {
      // A pair naming an absent series has nothing to diff — degrade rather
      // than dereference.
      if (
        mapped[pair.series[0]] === undefined ||
        mapped[pair.series[1]] === undefined
      ) {
        return;
      }
      primitives.push(
        ...generateDiffPairPrimitives(pair, i_pair, mapped, areasStyle, ctx),
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
  areasStyle: NonNullable<MergedContentStyle["areas"]>,
  ctx: ContentGenerationContext,
): Primitive[] {
  const seriesA = mapped[pair.series[0]];
  const seriesB = mapped[pair.series[1]];

  const areas: {
    order: "over" | "under";
    coords: Coordinates[];
  }[] = [];
  let currentCoords: Coordinates[] = [];

  let prevOrderOfA: undefined | "over" | "under" | "equal" = undefined;
  let prevMappedValA: MappedValueCoordinate | undefined = undefined;
  let prevMappedValB: MappedValueCoordinate | undefined = undefined;

  for (let i_val = 0; i_val < seriesA.length; i_val++) {
    const mappedValA = seriesA[i_val];
    const mappedValB = seriesB[i_val];
    if (mappedValA === undefined || mappedValB === undefined) {
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
      prevMappedValA = undefined;
      prevMappedValB = undefined;
      continue;
    }
    const thisOrder = mappedValA.val === mappedValB.val
      ? "equal"
      : mappedValA.val > mappedValB.val
      ? "over"
      : "under";

    if (prevOrderOfA === undefined) {
      if (thisOrder === "equal") {
        // Do nothing
      } else {
        currentCoords.unshift(mappedValA.coords);
        currentCoords.push(mappedValB.coords);
      }
    } else if (thisOrder === "equal") {
      if (prevOrderOfA === "equal") {
        // Do nothing
      } else {
        currentCoords.push(mappedValA.coords);
        if (currentCoords.length > 0) {
          areas.push({ coords: currentCoords, order: prevOrderOfA });
          currentCoords = [];
        }
      }
    } else if (prevOrderOfA === "equal") {
      currentCoords.push(new Coordinates(prevMappedValA!.coords));
      currentCoords.unshift(mappedValA.coords);
      currentCoords.push(mappedValB.coords);
    } else if (thisOrder === prevOrderOfA) {
      currentCoords.unshift(mappedValA.coords);
      currentCoords.push(mappedValB.coords);
    } else {
      let interception = getLineIntersection(
        prevMappedValA!.coords,
        mappedValA.coords,
        prevMappedValB!.coords,
        mappedValB.coords,
      );
      if (interception === false) {
        const x1 = prevMappedValA!.coords.x();
        const y1 = prevMappedValA!.coords.y();
        const x2 = mappedValA.coords.x();
        const y2 = mappedValA.coords.y();
        const x3 = prevMappedValB!.coords.x();
        const y3 = prevMappedValB!.coords.y();
        const x4 = mappedValB.coords.x();
        const y4 = mappedValB.coords.y();
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
      currentCoords.unshift(mappedValA.coords);
      currentCoords.push(mappedValB.coords);
    }
    prevOrderOfA = thisOrder;
    prevMappedValA = mappedValA;
    prevMappedValB = mappedValB;
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
    const seriesInfo: ChartSeriesInfo = {
      ...ctx.subChartInfo,
      i_series,
      isFirstSeries: i_series === 0,
      isLastSeries: i_series === ctx.subChartInfo.nSerieses - 1,
      seriesHeader: ctx.seriesHeaders[i_series],
      nVals: 0,
    };
    const areaStyle = areasStyle.getStyle(seriesInfo);
    const lineCoordArray = [...areas[i_area].coords, areas[i_area].coords[0]];

    primitives.push({
      type: "chart-area-series",
      key:
        `area-diff-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_pair}-${order}-${i_area}`,
      bounds: computeBoundsForPath(lineCoordArray),
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
