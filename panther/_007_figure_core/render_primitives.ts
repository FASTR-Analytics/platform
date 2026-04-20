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
  DataLabel,
  LineStyle,
  MapLabelPrimitive,
  Primitive,
  RenderContext,
  SankeyLinkPrimitive,
  SankeyNodePrimitive,
  ScaleLegendGradientPrimitive,
  ScaleLegendSteppedPrimitive,
  TableBorderPrimitive,
  TableGridPrimitive,
  TableHeaderAxisPrimitive,
} from "./deps.ts";
import { Coordinates, Padding, RectCoordsDims } from "./deps.ts";
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

function renderDataLabel(rc: RenderContext, dl: DataLabel): void {
  if (dl.style) {
    const textW = dl.mText.dims.w();
    const textH = dl.mText.dims.h();
    const pad = dl.style.padding ?? new Padding(0);

    let bgX = dl.position.x() - pad.pl();
    let bgY = dl.position.y() - pad.pt();
    const bgW = textW + pad.pl() + pad.pr();
    const bgH = textH + pad.pt() + pad.pb();

    if (dl.alignH === "center") bgX -= textW / 2;
    else if (dl.alignH === "right") bgX -= textW;
    if (dl.alignV === "middle") bgY -= textH / 2;
    else if (dl.alignV === "bottom") bgY -= textH;

    const bgRcd = new RectCoordsDims({
      x: bgX,
      y: bgY,
      w: bgW,
      h: bgH,
    });

    if (dl.style.backgroundColor || dl.style.border) {
      rc.rRect(bgRcd, {
        fillColor: dl.style.backgroundColor ?? "transparent",
        ...(dl.style.border
          ? {
            strokeColor: dl.style.border.color,
            strokeWidth: dl.style.border.width,
          }
          : {}),
        rectRadius: dl.style.rectRadius,
      });
    }
  }

  rc.rText(dl.mText, dl.position, dl.alignH, dl.alignV);
}

function renderPrimitive(rc: RenderContext, primitive: Primitive): void {
  switch (primitive.type) {
    case "chart-data-point": {
      rc.rPoint(primitive.coords, primitive.style);
      if (primitive.dataLabel) {
        renderDataLabel(rc, primitive.dataLabel);
      }
      break;
    }

    case "chart-line-series":
      rc.rLine(primitive.coords, primitive.style);
      if (primitive.pointLabels) {
        for (const pointLabel of primitive.pointLabels) {
          renderDataLabel(rc, pointLabel.dataLabel);
        }
      }
      break;

    case "chart-area-series":
      rc.rArea(primitive.coords, primitive.style);
      break;

    case "chart-bar":
      rc.rRect(primitive.bounds, primitive.style);
      if (primitive.dataLabel) {
        renderDataLabel(rc, primitive.dataLabel);
      }
      break;

    case "chart-error-bar": {
      const lineStyle = {
        strokeColor: primitive.strokeColor,
        strokeWidth: primitive.strokeWidth,
        lineDash: "solid" as const,
      };
      const halfCap = primitive.capWidth / 2;
      if (primitive.orientation === "vertical") {
        // Vertical line from lower to upper
        rc.rLine(
          [
            new Coordinates([primitive.centerX, primitive.ubY]),
            new Coordinates([primitive.centerX, primitive.lbY]),
          ],
          lineStyle,
        );
        // Top cap
        rc.rLine(
          [
            new Coordinates([primitive.centerX - halfCap, primitive.ubY]),
            new Coordinates([primitive.centerX + halfCap, primitive.ubY]),
          ],
          lineStyle,
        );
        // Bottom cap
        rc.rLine(
          [
            new Coordinates([primitive.centerX - halfCap, primitive.lbY]),
            new Coordinates([primitive.centerX + halfCap, primitive.lbY]),
          ],
          lineStyle,
        );
      } else {
        // Horizontal line from lb to ub
        rc.rLine(
          [
            new Coordinates([primitive.ubX, primitive.centerY]),
            new Coordinates([primitive.lbX, primitive.centerY]),
          ],
          lineStyle,
        );
        // Upper-bound cap (vertical line at ubX)
        rc.rLine(
          [
            new Coordinates([primitive.ubX, primitive.centerY - halfCap]),
            new Coordinates([primitive.ubX, primitive.centerY + halfCap]),
          ],
          lineStyle,
        );
        // Lower-bound cap (vertical line at lbX)
        rc.rLine(
          [
            new Coordinates([primitive.lbX, primitive.centerY - halfCap]),
            new Coordinates([primitive.lbX, primitive.centerY + halfCap]),
          ],
          lineStyle,
        );
      }
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

    case "table-cell":
      if (primitive.backgroundColor !== "none") {
        rc.rRect(primitive.bounds, { fillColor: primitive.backgroundColor });
      }
      rc.rText(
        primitive.mText,
        primitive.textPosition,
        primitive.textAlignH,
        primitive.textAlignV,
      );
      break;

    case "table-row-header":
      rc.rText(primitive.mText, primitive.textPosition, primitive.textAlignH);
      break;

    case "table-col-header":
      if (primitive.backgroundColor !== "none") {
        rc.rRect(primitive.bounds, { fillColor: primitive.backgroundColor });
      }
      if (primitive.mText && primitive.textPosition) {
        rc.rText(
          primitive.mText,
          primitive.textPosition,
          primitive.textAlignH,
          primitive.textAlignV,
        );
      }
      break;

    case "table-border":
    case "table-grid":
    case "table-header-axis":
      renderTableLinePrimitive(rc, primitive);
      break;

    case "annotation-rect":
      rc.rRect(primitive.bounds, primitive.style);
      if (primitive.text) {
        rc.rText(
          primitive.text.mText,
          primitive.text.position,
          primitive.text.alignH,
          primitive.text.alignV,
        );
      }
      break;

    case "scale-legend-gradient":
      renderScaleLegendGradientPrimitive(rc, primitive);
      break;

    case "scale-legend-stepped":
      renderScaleLegendSteppedPrimitive(rc, primitive);
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
  rc.rLine(primitive.axisLine.coords, primitive.axisLine.style);

  // Draw ticks and labels
  for (const tick of primitive.ticks) {
    // Draw tick line (if present)
    if (tick.tickLine) {
      rc.rLine([tick.tickLine.start, tick.tickLine.end], primitive.tickStyle);
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

  // Draw axis label
  if (primitive.axisLabel) {
    rc.rText(
      primitive.axisLabel.mText,
      primitive.axisLabel.position,
      primitive.axisLabel.alignment.h,
      primitive.axisLabel.alignment.v,
    );
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
//    Scale Legend Rendering                                                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderScaleLegendGradientPrimitive(
  rc: RenderContext,
  primitive: ScaleLegendGradientPrimitive,
): void {
  const N = 50;
  const barX = primitive.barRect.x();
  const barY = primitive.barRect.y();
  const barW = primitive.barRect.w();
  const barH = primitive.barRect.h();
  const sliceW = barW / N;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const color = interpolateColorStops(primitive.colorStops, t);
    rc.rRect(
      new RectCoordsDims({
        x: barX + i * sliceW,
        y: barY,
        w: sliceW + 0.5,
        h: barH,
      }),
      { fillColor: color },
    );
  }

  for (const tick of primitive.ticks) {
    rc.rLine(
      [
        new Coordinates({ x: barX + tick.pixelOffset, y: barY + barH }),
        new Coordinates({ x: barX + tick.pixelOffset, y: barY + barH + 4 }),
      ],
      { strokeColor: "#000000", strokeWidth: 1, lineDash: "solid" },
    );
    rc.rText(tick.mText, tick.labelPosition, "center");
  }

  if (primitive.noData) {
    rc.rRect(primitive.noData.rect, primitive.noData.style);
    rc.rText(primitive.noData.mText, primitive.noData.labelPosition, "left");
  }
}

function renderScaleLegendSteppedPrimitive(
  rc: RenderContext,
  primitive: ScaleLegendSteppedPrimitive,
): void {
  for (const step of primitive.steps) {
    rc.rRect(step.rect, step.style);
  }

  for (const label of primitive.labels) {
    rc.rText(label.mText, label.position, "center");
  }

  if (primitive.noData) {
    rc.rRect(primitive.noData.rect, primitive.noData.style);
    rc.rText(primitive.noData.mText, primitive.noData.labelPosition, "left");
  }
}

function interpolateColorStops(
  stops: { t: number; color: string }[],
  t: number,
): string {
  if (stops.length === 0) return "#000000";
  if (t <= stops[0].t) return stops[0].color;
  if (t >= stops[stops.length - 1].t) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      const segT = (t - stops[i].t) / (stops[i + 1].t - stops[i].t);
      return lerpHex(stops[i].color, stops[i + 1].color, segT);
    }
  }
  return stops[stops.length - 1].color;
}

function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${
    g.toString(16).padStart(2, "0")
  }${bl.toString(16).padStart(2, "0")}`;
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
    primitive.bounds,
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
    primitive.bounds,
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

  if (primitive.dataLabel) {
    renderDataLabel(rc, primitive.dataLabel);
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

  if (primitive.halo) {
    const halo = primitive.halo;
    const hasFill = halo.fillColor !== undefined;
    const hasBorder = halo.borderColor !== undefined &&
      halo.borderWidth !== undefined && halo.borderWidth > 0;
    if (hasFill || hasBorder) {
      const haloW = halo.width;
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
        {
          fillColor: halo.fillColor ?? "transparent",
          strokeColor: halo.borderColor,
          strokeWidth: halo.borderWidth,
          rectRadius: halo.rectRadius,
        },
      );
    }
  }

  rc.rText(
    primitive.mText,
    primitive.position,
    primitive.alignment.h,
    primitive.alignment.v,
  );
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Table Line Rendering                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderTableLinePrimitive(
  rc: RenderContext,
  primitive:
    | TableBorderPrimitive
    | TableGridPrimitive
    | TableHeaderAxisPrimitive,
): void {
  const lineStyle = {
    strokeColor: primitive.style.strokeColor,
    strokeWidth: primitive.style.strokeWidth,
    lineDash: "solid" as const,
  };
  for (const line of primitive.horizontalLines) {
    rc.rLine(
      [
        [line.x1, line.y],
        [line.x2, line.y],
      ],
      lineStyle,
    );
  }
  for (const line of primitive.verticalLines) {
    rc.rLine(
      [
        [line.x, line.y1],
        [line.x, line.y2],
      ],
      lineStyle,
    );
  }
}
