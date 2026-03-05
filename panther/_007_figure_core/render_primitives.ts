// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AreaStyle,
  ArrowPrimitive,
  BoxPrimitive,
  CascadeArrowPrimitive,
  ChartAxisPrimitive,
  ChartCaptionPrimitive,
  ChartGridPrimitive,
  ChartLabelPrimitive,
  ChartLegendPrimitive,
  LineStyle,
  MapLabelPrimitive,
  Primitive,
  RenderContext,
  SankeyLinkPrimitive,
  SankeyNodePrimitive,
} from "./deps.ts";
import { Coordinates, RectCoordsDims, resolvePosition } from "./deps.ts";
import type { MeasuredSurrounds } from "./_surrounds/measure_surrounds.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Main Rendering Functions                                                //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function renderFigureBackground(
  rc: RenderContext,
  measuredSurrounds: MeasuredSurrounds,
): void {
  if (measuredSurrounds.s.backgroundColor !== "none") {
    rc.rRect(measuredSurrounds.outerRcd, {
      fillColor: measuredSurrounds.s.backgroundColor,
    });
  }
}

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
        const alignH = "dx" in primitive.dataLabel.relativePosition &&
            primitive.dataLabel.relativePosition.dx < 0
          ? "right"
          : "dx" in primitive.dataLabel.relativePosition &&
              primitive.dataLabel.relativePosition.dx > 0
          ? "left"
          : "center";
        const alignV = "dy" in primitive.dataLabel.relativePosition &&
            primitive.dataLabel.relativePosition.dy < 0
          ? "bottom"
          : "dy" in primitive.dataLabel.relativePosition &&
              primitive.dataLabel.relativePosition.dy > 0
          ? "top"
          : "middle";
        rc.rText(primitive.dataLabel.mText, labelPos, alignH, alignV);
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

    case "chart-error-bar": {
      // Draw vertical line from lower bound to upper bound
      rc.rLine(
        [
          new Coordinates([primitive.centerX, primitive.ubY]),
          new Coordinates([primitive.centerX, primitive.lbY]),
        ],
        {
          strokeColor: primitive.strokeColor,
          strokeWidth: primitive.strokeWidth,
          lineDash: "solid",
        },
      );

      // Draw top cap
      const halfCapWidth = primitive.capWidth / 2;
      rc.rLine(
        [
          new Coordinates([primitive.centerX - halfCapWidth, primitive.ubY]),
          new Coordinates([primitive.centerX + halfCapWidth, primitive.ubY]),
        ],
        {
          strokeColor: primitive.strokeColor,
          strokeWidth: primitive.strokeWidth,
          lineDash: "solid",
        },
      );

      // Draw bottom cap
      rc.rLine(
        [
          new Coordinates([primitive.centerX - halfCapWidth, primitive.lbY]),
          new Coordinates([primitive.centerX + halfCapWidth, primitive.lbY]),
        ],
        {
          strokeColor: primitive.strokeColor,
          strokeWidth: primitive.strokeWidth,
          lineDash: "solid",
        },
      );
      break;
    }

    case "chart-confidence-band":
      rc.rArea(primitive.coords, primitive.style as AreaStyle);
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

    case "sankey-node":
      renderSankeyNodePrimitive(rc, primitive);
      break;

    case "sankey-link":
      renderSankeyLinkPrimitive(rc, primitive);
      break;

    case "cascade-arrow":
      renderCascadeArrowPrimitive(rc, primitive);
      break;

    case "map-region":
      rc.rPath(primitive.pathSegments, primitive.pathStyle);
      break;

    case "map-label":
      renderMapLabelPrimitive(rc, primitive);
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

  if (primitive.style.backgroundColor !== "none") {
    rc.rRect(primitive.plotAreaRcd, {
      fillColor: primitive.style.backgroundColor,
    });
  }

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
      case "line":
        rc.rLine(item.symbol.coords, item.symbol.style);
        break;
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
    rc.rText(primitive.text.mText, primitive.text.position, "center", "middle");
  }

  if (primitive.secondaryText) {
    rc.rText(
      primitive.secondaryText.mText,
      primitive.secondaryText.position,
      "center",
      "middle",
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

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Sankey Node Rendering                                                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderSankeyNodePrimitive(
  rc: RenderContext,
  primitive: SankeyNodePrimitive,
): void {
  rc.rRect(primitive.rcd, {
    fillColor: primitive.fillColor,
  });

  if (primitive.label) {
    rc.rText(
      primitive.label.mText,
      primitive.label.position,
      primitive.label.alignH,
      "middle",
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Sankey Link Rendering                                                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderSankeyLinkPrimitive(
  rc: RenderContext,
  primitive: SankeyLinkPrimitive,
): void {
  rc.rPath(primitive.pathSegments, primitive.pathStyle);
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Cascade Arrow Rendering                                                 //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderCascadeArrowPrimitive(
  rc: RenderContext,
  primitive: CascadeArrowPrimitive,
): void {
  rc.rPath(primitive.pathSegments, primitive.pathStyle);

  if (primitive.arrowhead) {
    const lineStyle: LineStyle = {
      strokeColor: primitive.pathStyle.stroke?.color ?? "black",
      strokeWidth: primitive.pathStyle.stroke?.width ?? 1,
      lineDash: "solid",
    };
    renderArrowhead(
      rc,
      primitive.arrowhead,
      lineStyle,
      primitive.arrowhead.size,
    );
  }

  if (primitive.label) {
    rc.rText(primitive.label.mText, primitive.label.position, "center", "top");
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Map Label Rendering                                                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderMapLabelPrimitive(
  rc: RenderContext,
  primitive: MapLabelPrimitive,
): void {
  if (primitive.leaderLine) {
    const { from, to, strokeColor, strokeWidth, gap } = primitive.leaderLine;
    const dx = to.x() - from.x();
    const dy = to.y() - from.y();
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > gap) {
      const ratio = gap / dist;
      const shortenedTo = new Coordinates([
        to.x() - dx * ratio,
        to.y() - dy * ratio,
      ]);
      rc.rLine([from, shortenedTo], {
        strokeColor,
        strokeWidth,
        lineDash: "solid",
      });
    }
  }

  if (primitive.halo && primitive.halo.width > 0) {
    const haloW = primitive.halo.width;
    const textW = primitive.mText.dims.w();
    const textH = primitive.mText.dims.h();
    const pos = primitive.position;

    let x = pos.x();
    let y = pos.y();
    if (primitive.alignment.h === "center") x -= textW / 2;
    else if (primitive.alignment.h === "right") x -= textW;
    if (primitive.alignment.v === "middle") y -= textH / 2;
    else if (primitive.alignment.v === "bottom") y -= textH;

    rc.rRect(
      new RectCoordsDims({
        x: x - haloW,
        y: y - haloW,
        w: textW + haloW * 2,
        h: textH + haloW * 2,
      }),
      { fillColor: primitive.halo.color },
    );
  }

  rc.rText(
    primitive.mText,
    primitive.position,
    primitive.alignment.h,
    primitive.alignment.v,
  );
}
