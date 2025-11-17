// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, RectCoordsDims, Z_INDEX } from "../deps.ts";
import type {
  ChartLegendPrimitive,
  LineStyle,
  PointStyle,
  RectStyle,
} from "../deps.ts";
import type { MeasuredLegend } from "./measure_legend.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Legend Primitive Generation                                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateLegendPrimitive(
  coords: Coordinates,
  mLegend: MeasuredLegend,
  bounds: RectCoordsDims,
): ChartLegendPrimitive {
  const items: ChartLegendPrimitive["items"] = [];

  let currentX = coords.x();
  let currentY = coords.y();
  const colorBoxWidthOrPointWidth = mLegend.colorBoxWidthOrPointWidth;

  mLegend.groups.forEach(
    ({ allMeasuredLines, legendItemsThisGroup, wThisGroupLabels }) => {
      allMeasuredLines.forEach((mText, i_legendItem) => {
        const item = legendItemsThisGroup[i_legendItem]!;
        const pointStyle = item.pointStyle;
        const lineStrokeWidthScaleFactor = item.lineStrokeWidthScaleFactor ?? 1;
        const lineDash = item.lineDash ?? "solid";
        const color = item.color;

        // Label position (to the right of symbol)
        const labelPosition = new Coordinates([
          currentX + colorBoxWidthOrPointWidth + mLegend.s.legendLabelGap,
          currentY,
        ]);

        // Symbol configuration (discriminated union)
        let symbol: ChartLegendPrimitive["items"][number]["symbol"];

        if (pointStyle === undefined || pointStyle === "as-block") {
          // Rectangle symbol
          symbol = {
            type: "rect",
            style: {
              fillColor: color,
            },
            position: new RectCoordsDims([
              currentX,
              currentY,
              colorBoxWidthOrPointWidth,
              mText.dims.h(),
            ]),
          };
        } else if (pointStyle === "as-line") {
          // Line symbol
          symbol = {
            type: "line",
            style: {
              show: true,
              strokeWidth: mLegend.s.legendLineStrokeWidth *
                lineStrokeWidthScaleFactor,
              strokeColor: color,
              lineDash,
            },
            // Center position for line (will be offset in render function)
            position: new Coordinates([
              currentX + colorBoxWidthOrPointWidth / 2,
              currentY + mText.dims.h() / 2,
            ]),
          };
        } else {
          // Point symbol
          symbol = {
            type: "point",
            style: {
              show: true,
              pointStyle,
              radius: mLegend.s.legendPointRadius,
              color,
              strokeWidth: mLegend.s.legendPointStrokeWidth,
              innerColorStrategy: mLegend.s.legendPointInnerColorStrategy,
              dataLabelPosition: "top", // Doesn't matter for legend rendering
            },
            position: new Coordinates([
              currentX + colorBoxWidthOrPointWidth / 2,
              currentY + mText.dims.h() / 2,
            ]),
          };
        }

        items.push({
          mText,
          labelPosition,
          symbol,
        });

        currentY += mText.dims.h() + mLegend.s.legendItemVerticalGap;
      });

      // Move to next column
      currentX += colorBoxWidthOrPointWidth +
        mLegend.s.legendLabelGap +
        wThisGroupLabels +
        2 * mLegend.s.legendLabelGap;
      currentY = coords.y();
    },
  );

  return {
    type: "chart-legend",
    key: "legend",
    bounds,
    meta: {
      // Figure-level legend - no paneIndex
    },
    items,
    zIndex: Z_INDEX.LEGEND,
  };
}
