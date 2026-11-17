// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildItem,
  Coordinates,
  itemCoordinate,
  labelBoxRcd,
  RectCoordsDims,
  unionRectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import type { FigureLegendPrimitive, NestedIdentity } from "../deps.ts";
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
  seriesDimension: string | undefined,
): FigureLegendPrimitive {
  const entries: FigureLegendPrimitive["entries"] = [];

  let currentX = coords.x();
  let currentY = coords.y();
  const colorBoxWidthOrPointWidth = mLegend.colorBoxWidthOrPointWidth;

  mLegend.groups.forEach(
    ({ allMeasuredLines, legendEntriesThisGroup, wThisGroupLabels }) => {
      allMeasuredLines.forEach((mText, i_legendEntry) => {
        const entry = legendEntriesThisGroup[i_legendEntry]!;
        const pointStyle = entry.pointStyle;
        const lineStrokeWidthScaleFactor = entry.lineStrokeWidthScaleFactor ??
          1;
        const lineDash = entry.lineDash ?? "solid";
        const color = entry.color;

        // Label position (to the right of symbol)
        const labelPosition = new Coordinates([
          currentX + colorBoxWidthOrPointWidth + mLegend.s.legendLabelGap,
          currentY,
        ]);

        // Symbol configuration (discriminated union)
        let symbol: FigureLegendPrimitive["entries"][number]["symbol"];

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
          const lineY = currentY + mText.dims.h() / 2;
          symbol = {
            type: "line",
            style: {
              show: true,
              strokeWidth: mLegend.s.legendLineStrokeWidth *
                lineStrokeWidthScaleFactor,
              strokeColor: color,
              lineDash,
            },
            coords: [
              new Coordinates([currentX, lineY]),
              new Coordinates([currentX + colorBoxWidthOrPointWidth, lineY]),
            ],
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

        const seriesMember = entry.id === undefined
          ? undefined
          : { id: entry.id, label: entry.label };
        entries.push({
          seriesMember,
          mText,
          labelPosition,
          symbol,
          ...entryIdentity(
            seriesDimension,
            seriesMember,
            unionRectCoordsDims([
              new RectCoordsDims([
                currentX,
                currentY,
                colorBoxWidthOrPointWidth,
                mText.dims.h(),
              ]),
              labelBoxRcd(mText, labelPosition, "left", "top"),
            ]),
          ),
        });

        currentY += mText.dims.h() + mLegend.s.legendEntryVerticalGap;
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
    type: "figure-legend",
    key: "legend",
    bounds,
    meta: {
      // Figure-level legend - no i_pane
    },
    entries,
    zIndex: Z_INDEX.LEGEND,
  };
}

// An entry that names a series stands for it, and is hit on its symbol's
// slot and its label.
function entryIdentity(
  seriesDimension: string | undefined,
  seriesMember: FigureLegendPrimitive["entries"][number]["seriesMember"],
  hitBounds: RectCoordsDims,
): NestedIdentity {
  const item = buildItem([itemCoordinate(seriesDimension, seriesMember)]);
  return item === undefined ? {} : { item, part: "header", hitBounds };
}
