// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ArrowPrimitive,
  BoxPrimitive,
  ChartAxisPrimitive,
  ChartCaptionPrimitive,
  ChartGridPrimitive,
  ChartLabelPrimitive,
  ChartLegendPrimitive,
  Coordinates,
  DataLabel,
  LineStyle,
  Primitive,
  RenderContext,
} from "./deps.ts";
import { RectCoordsDims, resolvePosition } from "./deps.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Main Rendering Functions                                                //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function renderFigurePrimitives(
  rc: RenderContext,
  primitives: Primitive[],
): void {
  // Sort by zIndex only
  const sorted = primitives.slice().sort((a, b) => {
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });

  // Render each primitive
  for (const primitive of sorted) {
    renderPrimitive(rc, primitive);
  }
}

function renderPrimitive(rc: RenderContext, primitive: Primitive): void {
  switch (primitive.type) {
    case "chart-data-point":
      rc.rPoint(primitive.coords, primitive.style);
      if (primitive.dataLabel) {
        const labelPos = resolvePosition(
          primitive.dataLabel.relativePosition,
          primitive.bounds,
        );
        const hAlign = "dx" in primitive.dataLabel.relativePosition &&
            primitive.dataLabel.relativePosition.dx < 0
          ? "right"
          : "dx" in primitive.dataLabel.relativePosition &&
              primitive.dataLabel.relativePosition.dx > 0
          ? "left"
          : "center";
        const vAlign = "dy" in primitive.dataLabel.relativePosition &&
            primitive.dataLabel.relativePosition.dy < 0
          ? "bottom"
          : "dy" in primitive.dataLabel.relativePosition &&
              primitive.dataLabel.relativePosition.dy > 0
          ? "top"
          : "center";
        rc.rText(primitive.dataLabel.mText, labelPos, hAlign, vAlign);
      }
      break;

    case "chart-line-series":
      rc.rLine(primitive.coords, primitive.style);
      if (primitive.pointLabels) {
        for (const pointLabel of primitive.pointLabels) {
          const coords = primitive.coords[pointLabel.coordIndex];
          if (coords) {
            const pointBounds = new RectCoordsDims({
              x: coords.x(),
              y: coords.y(),
              w: 0,
              h: 0,
            });
            const labelPos = resolvePosition(
              pointLabel.dataLabel.relativePosition,
              pointBounds,
            );
            rc.rText(pointLabel.dataLabel.mText, labelPos, "center", "bottom");
          }
        }
      }
      break;

    case "chart-area-series":
      rc.rArea(primitive.coords, primitive.style);
      break;

    case "chart-bar":
      rc.rRect(primitive.bounds, primitive.style);
      if (primitive.dataLabel) {
        const labelPos = resolvePosition(
          primitive.dataLabel.relativePosition,
          primitive.bounds,
        );
        rc.rText(primitive.dataLabel.mText, labelPos, "center", "bottom");
      }
      break;

    case "chart-grid":
      renderGridPrimitive(rc, primitive);
      break;

    case "chart-axis":
      renderAxisPrimitive(rc, primitive);
      break;

    case "chart-legend":
      renderLegendPrimitive(rc, primitive);
      break;

    case "chart-caption":
      renderCaptionPrimitive(rc, primitive);
      break;

    case "chart-label":
      renderLabelPrimitive(rc, primitive);
      break;

    case "simpleviz-box":
      renderBoxPrimitive(rc, primitive);
      break;

    case "simpleviz-arrow":
      renderArrowPrimitive(rc, primitive);
      break;

    default: {
      const _exhaustive: never = primitive;
      throw new Error(`Unknown primitive type: ${(primitive as any).type}`);
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Grid Rendering                                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderGridPrimitive(
  rc: RenderContext,
  primitive: ChartGridPrimitive,
): void {
  if (!primitive.style.show) return;

  primitive.horizontalLines.forEach((line) => {
    rc.rLine(
      [
        [primitive.plotAreaRcd.x(), line.y],
        [primitive.plotAreaRcd.rightX(), line.y],
      ],
      {
        strokeColor: primitive.style.strokeColor,
        strokeWidth: primitive.style.strokeWidth,
        lineDash: "solid",
      },
    );
  });

  primitive.verticalLines.forEach((line) => {
    rc.rLine(
      [
        [line.x, primitive.plotAreaRcd.y()],
        [line.x, primitive.plotAreaRcd.bottomY()],
      ],
      {
        strokeColor: primitive.style.strokeColor,
        strokeWidth: primitive.style.strokeWidth,
        lineDash: "solid",
      },
    );
  });
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Axis Rendering (Pure Data - No .render() method)                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderAxisPrimitive(
  rc: RenderContext,
  primitive: ChartAxisPrimitive,
): void {
  // Draw axis line
  if (primitive.axisLine) {
    rc.rLine(primitive.axisLine.coords, primitive.axisLine.style);
  }

  // Draw ticks and labels
  for (const tick of primitive.ticks) {
    // Draw tick line (if present)
    if (tick.tickLine) {
      rc.rLine([tick.tickLine.start, tick.tickLine.end], {
        strokeColor: "black",
        strokeWidth: 1,
        lineDash: "solid",
      });
    }

    // Draw tick label
    if (tick.label) {
      rc.rText(
        tick.label.mText,
        tick.label.position,
        tick.label.alignment.h,
        tick.label.alignment.v,
      );
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Legend Rendering (Pure Data - No .render() method)                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderLegendPrimitive(
  rc: RenderContext,
  primitive: ChartLegendPrimitive,
): void {
  for (const item of primitive.items) {
    // Draw label text
    rc.rText(item.mText, item.labelPosition, "left");

    // Draw symbol
    switch (item.symbol.type) {
      case "point":
        rc.rPoint(item.symbol.position, item.symbol.style);
        break;
      case "line": {
        const lineStart = item.symbol.position.getOffsetted({ left: -10 });
        const lineEnd = item.symbol.position.getOffsetted({ right: 10 });
        rc.rLine([lineStart, lineEnd], item.symbol.style);
        break;
      }
      case "rect":
        rc.rRect(item.symbol.position, item.symbol.style);
        break;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Caption Rendering (Pure Data - No .render() method)                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderCaptionPrimitive(
  rc: RenderContext,
  primitive: ChartCaptionPrimitive,
): void {
  rc.rText(
    primitive.mText,
    primitive.position,
    primitive.alignment.h,
    primitive.alignment.v,
  );
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Label Rendering (Pure Data - No .render() method)                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderLabelPrimitive(
  rc: RenderContext,
  primitive: ChartLabelPrimitive,
): void {
  rc.rText(
    primitive.mText,
    primitive.position,
    primitive.alignment.h,
    primitive.alignment.v,
  );
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    SimpleViz Box Rendering                                                 //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderBoxPrimitive(rc: RenderContext, primitive: BoxPrimitive): void {
  rc.rRect(primitive.rcd, primitive.rectStyle);

  if (primitive.text) {
    rc.rText(primitive.text.mText, primitive.text.position, "center", "center");
  }

  if (primitive.secondaryText) {
    rc.rText(
      primitive.secondaryText.mText,
      primitive.secondaryText.position,
      "center",
      "center",
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    SimpleViz Arrow Rendering                                               //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderArrowPrimitive(
  rc: RenderContext,
  primitive: ArrowPrimitive,
): void {
  if (primitive.pathCoords.length < 2) return;

  // Strokes are centered on the path, so we need to shorten the line by half
  // the stroke width at each end where there's an arrowhead
  const halfStroke = (primitive.lineStyle.strokeWidth ?? 1) / 2;
  let pathCoords = [...primitive.pathCoords];

  // Shorten the path at the start if there's a start arrowhead
  if (primitive.arrowheads?.start) {
    const angle = primitive.arrowheads.start.angle;
    pathCoords[0] = pathCoords[0].getOffsetted({
      right: Math.cos(angle) * halfStroke,
      bottom: Math.sin(angle) * halfStroke,
    });
  }

  // Shorten the path at the end if there's an end arrowhead
  if (primitive.arrowheads?.end) {
    const angle = primitive.arrowheads.end.angle;
    const lastIdx = pathCoords.length - 1;
    pathCoords[lastIdx] = pathCoords[lastIdx].getOffsetted({
      right: -Math.cos(angle) * halfStroke,
      bottom: -Math.sin(angle) * halfStroke,
    });
  }

  // Render the adjusted line
  rc.rLine(pathCoords, primitive.lineStyle);

  // Render arrowheads at original endpoints
  if (primitive.arrowheads?.start) {
    renderArrowhead(
      rc,
      primitive.arrowheads.start,
      primitive.lineStyle,
      primitive.arrowheadSize,
    );
  }

  if (primitive.arrowheads?.end) {
    renderArrowhead(
      rc,
      primitive.arrowheads.end,
      primitive.lineStyle,
      primitive.arrowheadSize,
    );
  }
}

function renderArrowhead(
  rc: RenderContext,
  arrowhead: { position: Coordinates; angle: number },
  lineStyle: LineStyle,
  arrowheadSize: number,
): void {
  // Skip rendering if arrowhead size is 0
  if (arrowheadSize === 0) return;

  // Wings extend backward from tip at ±150° from forward direction
  // This is equivalent to ±30° from the backward direction
  const backwardAngle = arrowhead.angle + Math.PI;
  const wingAngle = Math.PI / 6; // 30 degrees

  const angle1 = backwardAngle + wingAngle;
  const angle2 = backwardAngle - wingAngle;

  const tip = arrowhead.position;
  const p1 = tip.getOffsetted({
    right: Math.cos(angle1) * arrowheadSize,
    bottom: Math.sin(angle1) * arrowheadSize,
  });
  const p2 = tip.getOffsetted({
    right: Math.cos(angle2) * arrowheadSize,
    bottom: Math.sin(angle2) * arrowheadSize,
  });

  rc.rLine([p1, tip, p2], lineStyle);
}
