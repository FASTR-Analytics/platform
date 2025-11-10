// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartAxis,
  ChartGrid,
  ChartLegend,
  ChartSurround,
  Coordinates,
  DataLabel,
  LineStyle,
  PointStyle,
  Primitive,
  PrimitiveLayer,
  RectStyle,
  RenderContext,
} from "./deps.ts";
import { RectCoordsDims } from "./deps.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Layer Ordering                                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

const LAYER_ORDER: Record<PrimitiveLayer, number> = {
  "background": 0,
  "grid": 1,
  "axis": 2,
  "content-area": 3,
  "content-line": 4,
  "content-bar": 5,
  "content-point": 6,
  "label": 7,
  "legend": 8,
  "surround": 9,
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Main Rendering Functions                                                //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function renderChartPrimitives(
  rc: RenderContext,
  primitives: Primitive[],
): void {
  // Sort by layer and zIndex
  const sorted = primitives.slice().sort((a, b) => {
    const layerOrder = LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
    if (layerOrder !== 0) return layerOrder;
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });

  // Render each primitive
  for (const primitive of sorted) {
    renderPrimitive(rc, primitive);
  }
}

function renderPrimitive(
  rc: RenderContext,
  primitive: Primitive,
): void {
  switch (primitive.type) {
    case "chart-data-point":
      rc.rPoint(primitive.coords, primitive.style);
      if (primitive.dataLabel) {
        renderDataLabel(
          rc,
          primitive.coords,
          primitive.dataLabel,
          primitive.style.radius,
        );
      }
      break;

    case "chart-line-series":
      rc.rLine(primitive.coords, primitive.style);
      if (primitive.pointLabels) {
        for (const pointLabel of primitive.pointLabels) {
          const coords = primitive.coords[pointLabel.coordIndex];
          if (coords) {
            renderDataLabel(rc, coords, pointLabel.dataLabel, 0);
          }
        }
      }
      break;

    case "chart-area-series":
      rc.rArea(primitive.coords, primitive.style);
      break;

    case "chart-bar":
      rc.rRect(primitive.rcd, primitive.style);
      // Only render data label if:
      // - Label exists
      // - Not stacked, OR is top of stack
      if (
        primitive.dataLabel &&
        (primitive.stackingMode !== "stacked" ||
          primitive.stackInfo?.isTopOfStack)
      ) {
        const labelCoords = primitive.orientation === "vertical"
          ? primitive.rcd.topCenterCoords()
          : primitive.rcd.rightCenterCoords();
        renderDataLabel(rc, labelCoords, primitive.dataLabel, 0);
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

    case "chart-surround":
      renderSurroundPrimitive(rc, primitive);
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
  primitive: ChartGrid,
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
  primitive: ChartAxis,
): void {
  // Draw axis line
  if (primitive.axisLine) {
    rc.rLine(primitive.axisLine.coords, primitive.axisLine.style);
  }

  // Draw ticks and labels
  for (const tick of primitive.ticks) {
    // Draw tick line
    rc.rLine(
      [tick.tickLine.start, tick.tickLine.end],
      { strokeColor: "black", strokeWidth: 1, lineDash: "solid" },
    );

    // Draw tick label
    if (tick.label) {
      rc.rText(tick.label.mText, tick.label.position, "center", "top");
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
  primitive: ChartLegend,
): void {
  for (const item of primitive.items) {
    // Draw symbol
    switch (item.symbol.type) {
      case "point":
        rc.rPoint(item.position, item.symbol.style as PointStyle);
        break;
      case "line": {
        const lineStart = item.position.getOffsetted({ left: 10 });
        const lineEnd = item.position.getOffsetted({ right: 10 });
        rc.rLine([lineStart, lineEnd], item.symbol.style as LineStyle);
        break;
      }
      case "rect": {
        const rcd = new RectCoordsDims([
          item.position.x() - 10,
          item.position.y() - 5,
          20,
          10,
        ]);
        rc.rRect(rcd, item.symbol.style as RectStyle);
        break;
      }
    }

    // Draw label text next to symbol
    // TODO: Implement label rendering (need label position/style in primitive)
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Surround Rendering (Pure Data - No .render() method)                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderSurroundPrimitive(
  rc: RenderContext,
  primitive: ChartSurround,
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
//    Data Label Rendering                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function renderDataLabel(
  rc: RenderContext,
  elementCoords: Coordinates,
  dataLabel: DataLabel,
  elementRadius: number,
): void {
  const offset = dataLabel.offsetFromElement + elementRadius;

  let coords: Coordinates;
  let hAlign: "center" | "left" | "right" = "center";
  let vAlign: "top" | "center" | "bottom" | undefined;

  switch (dataLabel.position) {
    case "top":
      coords = elementCoords.getOffsetted({ top: offset });
      vAlign = "bottom";
      break;
    case "bottom":
      coords = elementCoords.getOffsetted({ bottom: offset });
      vAlign = "top";
      break;
    case "left":
      coords = elementCoords.getOffsetted({ left: offset });
      hAlign = "right";
      vAlign = "center";
      break;
    case "right":
      coords = elementCoords.getOffsetted({ right: offset });
      hAlign = "left";
      vAlign = "center";
      break;
    case "center":
      coords = elementCoords;
      vAlign = "center";
      break;
  }

  rc.rText(dataLabel.mText, coords, hAlign, vAlign);
}
