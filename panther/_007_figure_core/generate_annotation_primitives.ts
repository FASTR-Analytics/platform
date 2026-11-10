// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildItem,
  type ColorKeyOrString,
  Coordinates,
  Padding,
  type Primitive,
  type PrimitiveItem,
  RectCoordsDims,
  type RenderContext,
  type TextInfoUnkeyed,
  unionRectCoordsDims,
  Z_INDEX,
} from "./deps.ts";
import type {
  AnnotationRectStyle,
  AnnotationRectTextPlacement,
  FigureAnnotation,
} from "./types.ts";

export function generateAnnotationPrimitives(
  rc: RenderContext,
  annotations: FigureAnnotation[],
  primitives: Primitive[],
  sf: number,
): Primitive[] {
  const groups = collectAnnotationGroups(primitives);
  const result: Primitive[] = [];

  for (const ann of annotations) {
    if (!ann.rect) continue;
    const targets = groups.get(ann.group);
    if (!targets || targets.length === 0) continue;

    const unionBounds = unionRectCoordsDims(targets.map((t) => t.bounds));
    const pad = new Padding(ann.rect.padding ?? 0);
    const paddedBounds = new RectCoordsDims({
      x: unionBounds.x() - pad.pl() * sf,
      y: unionBounds.y() - pad.pt() * sf,
      w: unionBounds.w() + (pad.pl() + pad.pr()) * sf,
      h: unionBounds.h() + (pad.pt() + pad.pb()) * sf,
    });

    const text = ann.rect.text && ann.rect.textStyle
      ? measureAnnotationText(
        rc,
        ann.rect.text,
        ann.rect.textStyle,
        ann.rect.textPlacement ?? "center",
        paddedBounds,
        sf,
      )
      : undefined;

    result.push({
      type: "annotation-rect",
      key: `annotation-rect-${ann.group}`,
      item: sharedItem(targets.map((t) => t.item)),
      bounds: paddedBounds,
      zIndex: Z_INDEX.ANNOTATION_RECT,
      meta: { group: ann.group },
      style: resolveAnnotationRectStyle(ann.rect, sf),
      text,
    });
  }

  return result;
}

function measureAnnotationText(
  rc: RenderContext,
  text: string,
  textStyle: TextInfoUnkeyed,
  placement: AnnotationRectTextPlacement,
  rectBounds: RectCoordsDims,
  sf: number,
): {
  mText: ReturnType<RenderContext["mText"]>;
  position: Coordinates;
  alignH: "left" | "center" | "right";
  alignV: "top" | "middle" | "bottom";
} {
  const scaledTi: TextInfoUnkeyed = {
    ...textStyle,
    fontSize: textStyle.fontSize * sf,
  };
  const mText = rc.mText(text, scaledTi, rectBounds.w());

  const centerX = rectBounds.x() + rectBounds.w() / 2;

  let position: Coordinates;
  let alignV: "top" | "middle" | "bottom";

  switch (placement) {
    case "center":
      position = new Coordinates([
        centerX,
        rectBounds.y() + rectBounds.h() / 2,
      ]);
      alignV = "middle";
      break;
    case "above":
      position = new Coordinates([
        centerX,
        rectBounds.y() - 4 * sf,
      ]);
      alignV = "bottom";
      break;
    case "below":
      position = new Coordinates([
        centerX,
        rectBounds.bottomY() + 4 * sf,
      ]);
      alignV = "top";
      break;
  }

  return { mText, position, alignH: "center", alignV };
}

type AnnotationTarget = {
  bounds: RectCoordsDims;
  item: PrimitiveItem | undefined;
};

function collectAnnotationGroups(
  primitives: Primitive[],
): Map<string, AnnotationTarget[]> {
  const groups = new Map<string, AnnotationTarget[]>();
  for (const p of primitives) {
    if (p.annotationGroup) {
      const arr = groups.get(p.annotationGroup) ?? [];
      arr.push({ bounds: p.annotationBounds ?? p.bounds, item: p.item });
      groups.set(p.annotationGroup, arr);
    }
  }
  return groups;
}

// The dimensions every target names with one and the same member; a target
// with no item shares none.
function sharedItem(
  items: (PrimitiveItem | undefined)[],
): PrimitiveItem | undefined {
  const [first, ...rest] = items;
  if (first === undefined || rest.some((item) => item === undefined)) {
    return undefined;
  }
  return buildItem(
    Object.entries(first).filter(([dimension, id]) =>
      rest.every((item) => item?.[dimension] === id)
    ),
  );
}

function resolveAnnotationRectStyle(
  rect: AnnotationRectStyle,
  sf: number,
): {
  fillColor: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  rectRadius?: number;
} {
  return {
    fillColor: rect.fillColor ?? "transparent",
    strokeColor: rect.strokeColor ?? "red",
    strokeWidth: (rect.strokeWidth ?? 2) * sf,
    rectRadius: rect.rectRadius !== undefined
      ? rect.rectRadius * sf
      : undefined,
  };
}
