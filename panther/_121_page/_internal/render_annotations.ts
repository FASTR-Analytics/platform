// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims, type RenderContext } from "../deps.ts";
import { isRectAnnotation, type PageAnnotation } from "../types.ts";

function parseToken(token: string, reference: number): number {
  if (token.endsWith("%")) {
    return (parseFloat(token) / 100) * reference;
  }
  if (token.endsWith("px")) {
    return parseFloat(token);
  }
  const n = parseFloat(token);
  if (isNaN(n)) {
    throw new Error(`Invalid annotation length: "${token}"`);
  }
  return n;
}

function parseRect(
  rect: string,
  bounds: RectCoordsDims,
): { x: number; y: number; w: number; h: number } {
  const parts = rect.trim().split(/\s+/);
  if (parts.length !== 4) {
    throw new Error(
      `Annotation rect must have 4 values (x y w h), got ${parts.length}: "${rect}"`,
    );
  }
  return {
    x: bounds.x() + parseToken(parts[0], bounds.w()),
    y: bounds.y() + parseToken(parts[1], bounds.h()),
    w: parseToken(parts[2], bounds.w()),
    h: parseToken(parts[3], bounds.h()),
  };
}

export function renderPageAnnotations(
  rc: RenderContext,
  bounds: RectCoordsDims,
  annotations: PageAnnotation[],
  sf: number,
): void {
  for (const ann of annotations) {
    if (isRectAnnotation(ann)) {
      const resolved = parseRect(ann.rect, bounds);
      rc.rRect(resolved, {
        fillColor: "transparent",
        strokeColor: ann.borderColor ?? "red",
        strokeWidth: (ann.borderWidth ?? 2) * sf,
        rectRadius: (ann.rectRadius ?? 0) * sf,
      });
    }
  }
}
