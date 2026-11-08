// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AreaStyle,
  Arrowhead,
  ChartAxisPrimitive,
  ChartCascadeArrowPrimitive,
  ChartConnectorPrimitive,
  ChartGridPrimitive,
  ChartLabelPrimitive,
  DataLabel,
  FigureCaptionPrimitive,
  FigureLabelPrimitive,
  FigureLegendPrimitive,
  FigureScaleLegendGradientPrimitive,
  FigureScaleLegendSteppedPrimitive,
  LabelHalo,
  LineStyle,
  MeasuredText,
  PieSlicePrimitive,
  Primitive,
  RenderContext,
  SankeyLinkPrimitive,
  SankeyNodePrimitive,
  ShapePathPrimitive,
  ShapePrimitive,
  TableBorderPrimitive,
  TableGridPrimitive,
  TableHeaderAxisPrimitive,
} from "./deps.ts";
import { Coordinates, labelBoxRcd, RectCoordsDims } from "./deps.ts";
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

// Sorted by zIndex alone (a stable sort, so an element's primitives, emitted
// together at one z, stay together). A run of consecutive primitives sharing
// a group and an opacity below 1 paints inside one withOpacity scope, so the
// run composites as one layer where the context can (DOC_SCENE.md "Opacity").
export function renderFigurePrimitives(
  rc: RenderContext,
  primitives: Primitive[],
): void {
  const sorted = primitives.slice().sort((a, b) => {
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
  let i = 0;
  while (i < sorted.length) {
    const first = sorted[i];
    const alpha = first.opacity ?? 1;
    if (alpha >= 1) {
      renderPrimitive(rc, first);
      i++;
      continue;
    }
    let end = i + 1;
    while (
      first.group !== undefined && end < sorted.length &&
      sorted[end].group === first.group && sorted[end].opacity === alpha
    ) {
      end++;
    }
    const run = sorted.slice(i, end);
    rc.withOpacity(alpha, () => {
      for (const primitive of run) {
        renderPrimitive(rc, primitive);
      }
    });
    i = end;
  }
}

function renderLabelBackground(
  rc: RenderContext,
  mText: MeasuredText,
  position: Coordinates,
  alignH: "left" | "center" | "right",
  alignV: "top" | "middle" | "bottom",
  halo: LabelHalo,
): void {
  rc.rRect(
    labelBoxRcd(mText, position, alignH, alignV, halo.padding),
    {
      fillColor: halo.fillColor ?? "transparent",
      strokeColor: halo.borderColor,
      strokeWidth: halo.borderWidth,
      rectRadius: halo.rectRadius,
    },
  );
}

// Where the segment a→b first meets `box`, as a parameter in [0, 1]. Returns 1
// when it never enters — including the case that matters most, a segment that
// only touches the box at its own endpoint, so the caller can hand back `b`
// untouched rather than recomputing it and drifting by an ulp.
function segmentEntryParam(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: RectCoordsDims,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  let tEnter = 0;
  let tExit = 1;
  // Liang–Barsky: p < 0 is an entering boundary, p > 0 a leaving one.
  const slab = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > tExit) return false;
      if (r > tEnter) tEnter = r;
    } else {
      if (r < tEnter) return false;
      if (r < tExit) tExit = r;
    }
    return true;
  };
  if (!slab(-dx, ax - box.x())) return 1;
  if (!slab(dx, box.x() + box.w() - ax)) return 1;
  if (!slab(-dy, ay - box.y())) return 1;
  if (!slab(dy, box.y() + box.h() - ay)) return 1;
  return tEnter;
}

function renderDataLabel(rc: RenderContext, dl: DataLabel): void {
  if (dl.halo) {
    renderLabelBackground(
      rc,
      dl.mText,
      dl.position,
      dl.alignH,
      dl.alignV,
      dl.halo,
    );
  }

  rc.rText(dl.mText, dl.position, dl.alignH, dl.alignV);
}

export function renderPrimitive(
  rc: RenderContext,
  primitive: Primitive,
): void {
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

    case "chart-connector":
      renderConnectorPrimitive(rc, primitive);
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

    case "figure-legend":
      renderLegendPrimitive(rc, primitive);
      break;

    case "figure-caption":
      renderCaptionPrimitive(rc, primitive);
      break;

    case "chart-label":
      renderLabelPrimitive(rc, primitive);
      break;

    case "sankey-node":
      renderSankeyNodePrimitive(rc, primitive);
      break;

    case "sankey-link":
      renderSankeyLinkPrimitive(rc, primitive);
      break;

    case "chart-cascade-arrow":
      renderCascadeArrowPrimitive(rc, primitive);
      break;

    case "map-region":
      rc.rPath(primitive.pathSegments, primitive.pathStyle);
      break;

    case "pie-slice":
      renderPieSlicePrimitive(rc, primitive);
      break;

    case "figure-label":
      renderFigureLabelPrimitive(rc, primitive);
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

    case "figure-scale-legend-gradient":
      renderScaleLegendGradientPrimitive(rc, primitive);
      break;

    case "figure-scale-legend-stepped":
      renderScaleLegendSteppedPrimitive(rc, primitive);
      break;

    case "shape-rect":
    case "shape-text":
    case "shape-path":
    case "shape-image":
      renderShapePrimitive(rc, primitive);
      break;

    default: {
      const _exhaustive: never = primitive;
      throw new Error(
        `Unknown primitive type: ${(primitive as { type: string }).type}`,
      );
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Shape Rendering                                                         //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderShapePrimitive(rc: RenderContext, primitive: ShapePrimitive) {
  switch (primitive.type) {
    case "shape-rect":
      rc.rRect(primitive.rcd, primitive.style);
      break;
    case "shape-text":
      rc.rText(
        primitive.mText,
        primitive.position,
        primitive.alignH,
        primitive.alignV,
      );
      break;
    case "shape-path":
      renderShapePathPrimitive(rc, primitive);
      break;
    case "shape-image":
      rc.rImage(
        primitive.image,
        primitive.rcd.x(),
        primitive.rcd.y(),
        primitive.rcd.w(),
        primitive.rcd.h(),
      );
      break;
  }
}

function renderShapePathPrimitive(
  rc: RenderContext,
  primitive: ShapePathPrimitive,
): void {
  rc.rPath(primitive.pathSegments, primitive.pathStyle);
  const stroke = primitive.pathStyle.stroke;
  if (stroke === undefined) {
    return;
  }
  const lineStyle: LineStyle = {
    strokeWidth: stroke.width,
    strokeColor: stroke.color,
    // Solid even when the shaft is dashed: a dashed arrowhead reads as broken.
    lineDash: "solid",
  };
  if (primitive.arrowheads?.start) {
    renderArrowhead(rc, primitive.arrowheads.start, lineStyle);
  }
  if (primitive.arrowheads?.end) {
    renderArrowhead(rc, primitive.arrowheads.end, lineStyle);
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
  primitive: FigureLegendPrimitive,
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
  primitive: FigureScaleLegendGradientPrimitive,
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
        new Coordinates({
          x: barX + tick.pixelOffset,
          y: barY + barH + primitive.tickLength,
        }),
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
  primitive: FigureScaleLegendSteppedPrimitive,
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
  primitive: FigureCaptionPrimitive,
): void {
  rc.rText(
    primitive.mText,
    primitive.anchorRcd,
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
    primitive.anchorRcd,
    primitive.alignment.h,
    primitive.alignment.v,
  );
}

function renderConnectorPrimitive(
  rc: RenderContext,
  primitive: ChartConnectorPrimitive,
): void {
  renderLineWithArrowheads(
    rc,
    primitive.coords,
    primitive.style,
    primitive.arrowheads,
  );
}

export function renderLineWithArrowheads(
  rc: RenderContext,
  pathCoords: Coordinates[],
  lineStyle: LineStyle,
  arrowheads: { start?: Arrowhead; end?: Arrowhead } | undefined,
): void {
  if (pathCoords.length < 2) return;

  // Strokes are centered on the path, so we need to shorten the line by half
  // the stroke width at each end where there's an arrowhead
  const halfStroke = (lineStyle.strokeWidth ?? 1) / 2;
  const adjustedCoords = [...pathCoords];

  if (arrowheads?.start) {
    const angle = arrowheads.start.angle;
    adjustedCoords[0] = adjustedCoords[0].getOffsetted({
      right: Math.cos(angle) * halfStroke,
      bottom: Math.sin(angle) * halfStroke,
    });
  }

  if (arrowheads?.end) {
    const angle = arrowheads.end.angle;
    const lastIdx = adjustedCoords.length - 1;
    adjustedCoords[lastIdx] = adjustedCoords[lastIdx].getOffsetted({
      right: -Math.cos(angle) * halfStroke,
      bottom: -Math.sin(angle) * halfStroke,
    });
  }

  rc.rLine(adjustedCoords, lineStyle);

  if (arrowheads?.start) {
    renderArrowhead(rc, arrowheads.start, lineStyle);
  }
  if (arrowheads?.end) {
    renderArrowhead(rc, arrowheads.end, lineStyle);
  }
}

function renderArrowhead(
  rc: RenderContext,
  arrowhead: Arrowhead,
  lineStyle: LineStyle,
): void {
  if (arrowhead.size === 0) return;

  // Wings extend backward from tip at ±150° from forward direction
  // This is equivalent to ±30° from the backward direction
  const backwardAngle = arrowhead.angle + Math.PI;
  const wingAngle = Math.PI / 6; // 30 degrees

  const angle1 = backwardAngle + wingAngle;
  const angle2 = backwardAngle - wingAngle;

  const tip = arrowhead.position;
  const p1 = tip.getOffsetted({
    right: Math.cos(angle1) * arrowhead.size,
    bottom: Math.sin(angle1) * arrowhead.size,
  });
  const p2 = tip.getOffsetted({
    right: Math.cos(angle2) * arrowhead.size,
    bottom: Math.sin(angle2) * arrowhead.size,
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
  primitive: ChartCascadeArrowPrimitive,
): void {
  rc.rPath(primitive.pathSegments, primitive.pathStyle);

  if (primitive.arrowhead) {
    const lineStyle: LineStyle = {
      strokeColor: primitive.pathStyle.stroke?.color ?? "black",
      strokeWidth: primitive.pathStyle.stroke?.width ?? 1,
      lineDash: "solid",
    };
    renderArrowhead(rc, primitive.arrowhead, lineStyle);
  }

  if (primitive.dataLabel) {
    renderDataLabel(rc, primitive.dataLabel);
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Pie Slice Rendering                                                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderPieSlicePrimitive(
  rc: RenderContext,
  primitive: PieSlicePrimitive,
): void {
  rc.rPath(primitive.pathSegments, primitive.pathStyle);
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Figure Label Rendering                                                  //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderFigureLabelPrimitive(
  rc: RenderContext,
  primitive: FigureLabelPrimitive,
): void {
  if (primitive.leaderLine) {
    const { from, via, to, strokeColor, strokeWidth, gap } =
      primitive.leaderLine;
    const style = {
      strokeColor,
      strokeWidth,
      lineDash: "solid" as const,
    };
    // The gap shortening runs along the FINAL segment (via → to when an
    // elbow is present), so the stub always backs away from the label.
    //
    // `to` is only reliably on the OUTSIDE of the label for the flank placer,
    // whose `to` is the padded near edge approached horizontally. A
    // nearest-point leader ends at the padded box's own point nearest the
    // silhouette, which can be any corner — and where the shape has pushed a
    // label sideways, the straight run from the anchor reaches the box's near
    // edge well before that corner. So clamp to where the segment first meets
    // the padded box and measure the stub from there. A segment that only
    // touches the box at `to` yields `to` itself, which is why flank leaders
    // come out pixel-identical.
    const tail = via ?? from;
    const box = labelBoxRcd(
      primitive.mText,
      primitive.position,
      primitive.alignment.h,
      primitive.alignment.v,
      primitive.halo?.padding,
    );
    const tEnter = segmentEntryParam(
      tail.x(),
      tail.y(),
      to.x(),
      to.y(),
      box,
    );
    const end = tEnter >= 1 ? to : new Coordinates([
      tail.x() + (to.x() - tail.x()) * tEnter,
      tail.y() + (to.y() - tail.y()) * tEnter,
    ]);
    const dx = end.x() - tail.x();
    const dy = end.y() - tail.y();
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > gap) {
      const ratio = gap / dist;
      const shortenedTo = new Coordinates([
        end.x() - dx * ratio,
        end.y() - dy * ratio,
      ]);
      rc.rLine(via ? [from, via, shortenedTo] : [from, shortenedTo], style);
    } else if (via) {
      // The elbow's horizontal run is shorter than the stub gap (a tight
      // calloutMargin): keep the radial part and stop at the elbow rather
      // than dropping the whole leader.
      rc.rLine([from, via], style);
    }
  }

  if (primitive.halo) {
    renderLabelBackground(
      rc,
      primitive.mText,
      primitive.position,
      primitive.alignment.h,
      primitive.alignment.v,
      primitive.halo,
    );
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
