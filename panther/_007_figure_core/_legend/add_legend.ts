// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Coordinates,
  getColor,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredLegend } from "./measure_legend.ts";

export function addLegend(
  rc: RenderContext,
  coords: Coordinates,
  mLegend: MeasuredLegend,
): void {
  let currentX = coords.x();
  let currentY = coords.y();
  let overallItemIndex = 0;
  const colorBoxWidthOrPointWidth = mLegend.colorBoxWidthOrPointWidth;
  mLegend.groups.forEach(
    ({ allMeasuredLines, legendItemsThisGroup, wThisGroupLabels }) => {
      allMeasuredLines.forEach((mText, i_legendItem) => {
        rc.rText(
          mText,
          [
            currentX + colorBoxWidthOrPointWidth + mLegend.s.legendLabelGap,
            currentY,
          ],
          "left",
        );
        const pointStyle = legendItemsThisGroup[i_legendItem]!.pointStyle;
        const lineStrokeWidthScaleFactor =
          legendItemsThisGroup[i_legendItem]!.lineStrokeWidthScaleFactor ?? 1;
        const lineDash = legendItemsThisGroup[i_legendItem]!.lineDash ??
          "solid";
        const rcd = new RectCoordsDims([
          currentX,
          currentY,
          colorBoxWidthOrPointWidth,
          mText.dims.h(),
        ]);
        const color = legendItemsThisGroup[i_legendItem]!.color;
        if (pointStyle === undefined || pointStyle === "as-block") {
          rc.rRect(
            [currentX, currentY, colorBoxWidthOrPointWidth, mText.dims.h()],
            {
              fillColor: color,
            },
          );
        } else if (pointStyle === "as-line") {
          rc.rLine([rcd.leftCenterCoords(), rcd.rightCenterCoords()], {
            show: true,
            strokeWidth: mLegend.s.legendLineStrokeWidth *
              lineStrokeWidthScaleFactor,
            strokeColor: color,
            lineDash,
          });
        } else {
          rc.rPoint(
            [
              currentX + colorBoxWidthOrPointWidth / 2,
              currentY + mText.dims.h() / 2,
            ],
            {
              show: true,
              pointStyle,
              radius: mLegend.s.legendPointRadius,
              color,
              strokeWidth: mLegend.s.legendPointStrokeWidth,
              innerColorStrategy: mLegend.s.legendPointInnerColorStrategy,
              dataLabelPosition: "top", // This doesn't matter because we're only renderering the point
            },
          );
        }
        currentY += mText.dims.h() + mLegend.s.legendItemVerticalGap;
        overallItemIndex++;
      });
      currentX += colorBoxWidthOrPointWidth +
        mLegend.s.legendLabelGap +
        wThisGroupLabels +
        2 * mLegend.s.legendLabelGap;
      currentY = coords.y();
    },
  );
}
