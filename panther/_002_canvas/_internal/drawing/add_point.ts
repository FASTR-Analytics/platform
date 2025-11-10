// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ColorKeyOrString,
  type Coordinates,
  getAdjustedColor,
  getColor,
  type PointStyle,
  type PointType,
} from "../../deps.ts";

const _COSINE_45 = 0.7071067811865476;
const _SINE_60 = 0.8660254037844386;
const _COSINE_60 = 0.5;

export function getPointStyle(
  pointStyles: PointType[],
  pointIndex: number,
): PointType {
  if (pointIndex < pointStyles.length - 1) {
    return pointStyles[pointIndex];
  }
  const goodPointIndex = pointIndex % pointStyles.length;
  return pointStyles[goodPointIndex];
}

export function addPoint(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  coords: Coordinates,
  s: PointStyle,
) {
  if (s.show === false) {
    return;
  }
  const fill = getAdjustedColor(s.color, s.innerColorStrategy);
  switch (s.pointStyle) {
    case "circle":
      drawCircle(
        ctx,
        coords.x(),
        coords.y(),
        s.radius,
        fill,
        s.color,
        s.strokeWidth,
      );
      return;
    case "cross":
      drawCross(ctx, coords.x(), coords.y(), s.radius, s.color, s.strokeWidth);
      return;
    case "rect":
      drawRect(
        ctx,
        coords.x(),
        coords.y(),
        s.radius,
        fill,
        s.color,
        s.strokeWidth,
      );
      return;
    case "crossRot":
      drawCrossRot(
        ctx,
        coords.x(),
        coords.y(),
        s.radius,
        s.color,
        s.strokeWidth,
      );
      return;
    case "rectRot":
      drawRectRot(
        ctx,
        coords.x(),
        coords.y(),
        s.radius,
        fill,
        s.color,
        s.strokeWidth,
      );
      return;
    case "triangle":
      drawTriangle(
        ctx,
        coords.x(),
        coords.y(),
        s.radius,
        fill,
        s.color,
        s.strokeWidth,
      );
      return;
  }
}

export function drawCircle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: ColorKeyOrString,
  stroke: ColorKeyOrString,
  strokeWidth: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  const fillStr = getColor(fill);
  if (fillStr !== "none") {
    ctx.fillStyle = fillStr;
    ctx.fill();
  }
  const strokeStr = getColor(stroke);
  if (strokeStr !== "none") {
    ctx.strokeStyle = strokeStr;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

export function drawCrossRot(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stroke: ColorKeyOrString,
  strokeWidth: number,
) {
  const strokeStr = getColor(stroke);
  if (strokeStr !== "none") {
    const sideGivenRadius = radius * _COSINE_45;
    ctx.strokeStyle = strokeStr;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(x - sideGivenRadius, y - sideGivenRadius);
    ctx.lineTo(x + sideGivenRadius, y + sideGivenRadius);
    ctx.moveTo(x + sideGivenRadius, y - sideGivenRadius);
    ctx.lineTo(x - sideGivenRadius, y + sideGivenRadius);
    ctx.stroke();
  }
}

export function drawRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: ColorKeyOrString,
  stroke: ColorKeyOrString,
  strokeWidth: number,
) {
  const sideGivenRadius = radius * _COSINE_45;
  ctx.beginPath();
  ctx.rect(
    x - sideGivenRadius,
    y - sideGivenRadius,
    sideGivenRadius * 2,
    sideGivenRadius * 2,
  );
  const fillStr = getColor(fill);
  if (fillStr !== "none") {
    ctx.fillStyle = fillStr;
    ctx.fill();
  }
  const strokeStr = getColor(stroke);
  if (strokeStr !== "none") {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeStr;
    ctx.stroke();
  }
}

export function drawCross(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stroke: ColorKeyOrString,
  strokeWidth: number,
) {
  const strokeStr = getColor(stroke);
  if (strokeStr !== "none") {
    ctx.strokeStyle = strokeStr;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x, y + radius);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x - radius, y);
    ctx.stroke();
  }
}

export function drawRectRot(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: ColorKeyOrString,
  stroke: ColorKeyOrString,
  strokeWidth: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  const fillStr = getColor(fill);
  if (fillStr !== "none") {
    ctx.fillStyle = fillStr;
    ctx.fill();
  }
  const strokeStr = getColor(stroke);
  if (strokeStr !== "none") {
    ctx.strokeStyle = strokeStr;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

export function drawTriangle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: ColorKeyOrString,
  stroke: ColorKeyOrString,
  strokeWidth: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius * _SINE_60, y + radius * _COSINE_60);
  ctx.lineTo(x - radius * _SINE_60, y + radius * _COSINE_60);
  ctx.closePath();
  const fillStr = getColor(fill);
  if (fillStr !== "none") {
    ctx.fillStyle = fillStr;
    ctx.fill();
  }
  const strokeStr = getColor(stroke);
  if (strokeStr !== "none") {
    ctx.strokeStyle = strokeStr;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}
