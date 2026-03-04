// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartSeriesInfo,
  computeBoundsForPath,
  Coordinates,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  type ContentGenerationContext,
} from "./content_generation_types.ts";

export function generateAreaPrimitives(
  mapped: MappedValueCoordinate[][],
  ctx: ContentGenerationContext,
): Primitive[] {
  const s = ctx.contentStyle;

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

      const seriesInfo = buildSeriesInfo(ctx, i_series, mapped);
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
        ...buildSeriesInfo(ctx, i_series, mapped),
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
          mirrorCoords = new Coordinates([
            mappedValThisSeries.coords.x(),
            ctx.subChartRcd.bottomY() + ctx.gridStrokeWidth / 2,
          ]);
        } else if (areaStyle.to === "previous-series-or-zero") {
          const otherSeries = mapped[i_series - 1];
          if (!otherSeries) {
            mirrorCoords = new Coordinates([
              mappedValThisSeries.coords.x(),
              ctx.subChartRcd.bottomY() + ctx.gridStrokeWidth / 2,
            ]);
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
          coords: lineCoordArray,
          style: areaStyle,
        });
      }
    }
  } else if (s.areas && s.areas.diff.enabled) {
    const areas: {
      order: "over" | "under";
      coords: Coordinates[];
    }[] = [];
    let currentCoords: Coordinates[] = [];

    let prevOrderOfSeries_1: undefined | "over" | "under" | "equal" = undefined;
    let prevMappedVal_1:
      | { coords: Coordinates; val: number; barExtent: number }
      | undefined = undefined;
    let prevMappedVal_2:
      | { coords: Coordinates; val: number; barExtent: number }
      | undefined = undefined;

    for (let i_val = 0; i_val < mapped[0].length; i_val++) {
      const mappedValThisSeries_1 = mapped[0][i_val];
      const mappedValThisSeries_2 = mapped[1][i_val];
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
        let interception = getLineIntersection(
          prevMappedVal_1!.coords,
          mappedValThisSeries_1.coords,
          prevMappedVal_2!.coords,
          mappedValThisSeries_2.coords,
        );
        if (interception === false) {
          const x1 = prevMappedVal_1!.coords.x();
          const y1 = prevMappedVal_1!.coords.y();
          const x2 = mappedValThisSeries_1.coords.x();
          const y2 = mappedValThisSeries_1.coords.y();
          const x3 = prevMappedVal_2!.coords.x();
          const y3 = prevMappedVal_2!.coords.y();
          const x4 = mappedValThisSeries_2.coords.x();
          const y4 = mappedValThisSeries_2.coords.y();
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
    }

    for (let i_area = 0; i_area < areas.length; i_area++) {
      if (areas[i_area].coords.length === 0) continue;
      const i_series = areas[i_area].order === "over" ? 0 : 1;
      const seriesInfo: ChartSeriesInfo = {
        ...ctx.subChartInfo,
        i_series,
        isFirstSeries: i_series === 0,
        isLastSeries: i_series === ctx.subChartInfo.nSerieses - 1,
        seriesHeader: ctx.seriesHeaders[0],
        nVals: 0,
      };
      const areaStyle = s.areas.getStyle(seriesInfo);
      const lineCoordArray = [...areas[i_area].coords, areas[i_area].coords[0]];

      primitives.push({
        type: "chart-area-series",
        key:
          `area-diff-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${
            areas[i_area].order
          }-${i_area}`,
        bounds: computeBoundsForPath(lineCoordArray),
        zIndex: Z_INDEX.CONTENT_AREA,
        meta: {
          series: seriesInfo,
          valueIndices: [],
        },
        coords: lineCoordArray,
        style: areaStyle,
      });
    }
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
