// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  getAdjustedText,
  getColor,
  isShapePrimitive,
  RectCoordsDims,
  Z_INDEX,
} from "./deps.ts";
import type {
  AlignH,
  AlignV,
  Arrowhead,
  ColorKeyOrString,
  MeasuredText,
  MergedSceneStyle,
  Primitive,
  Pt,
  RenderContext,
  ShapePathPrimitive,
  ShapeRectPrimitive,
  ShapeTextPrimitive,
} from "./deps.ts";
import type {
  BoxElement,
  ConnectorElement,
  CustomElement,
  RegionElement,
  Scene,
  SceneElement,
  Side,
  TextElement,
} from "./types.ts";
import {
  arrowheadAt,
  boundsOfPoints,
  closedRingSegments,
  insetRect,
  insetRectilinearRing,
  openPathSegments,
  pointAlong,
  pullBack,
  roundedRectSegments,
  scalePt,
  scaleRect,
} from "./_internal/geometry.ts";
import {
  boxGeometry,
  boxTextStyles,
  measureBoxContent,
  rowHeight,
  rowWidth,
  TEXT_WIDTH_EPS,
} from "./_internal/box_layout.ts";

// Maps every element into the content rect (x' = origin.x + x × sf, sizes ×
// sf, text re-measured at sf) and emits shapes sub-keyed under the element,
// back to front, each carrying the element's z.
export function lowerScene(
  rc: RenderContext,
  scene: Scene,
  sf: number,
  origin: Pt,
  style: MergedSceneStyle,
): Primitive[] {
  const ctx: LowerContext = { rc, sf, origin, style };
  return scene.elements.flatMap((element) => lowerElement(ctx, element));
}

type LowerContext = {
  rc: RenderContext;
  sf: number;
  origin: Pt;
  style: MergedSceneStyle;
};

// An element's opacity lands on every primitive it lowers to, with the
// element's key as the group, so the renderer composites them as one layer; a
// custom draw's and a badge's own opacities multiply into it. At opacity 0 it
// lowers to nothing, so it is neither painted nor hit, and its rect still holds
// its place in the frame.
function lowerElement(ctx: LowerContext, element: SceneElement): Primitive[] {
  const alpha = element.opacity;
  if (alpha === 0) {
    return [];
  }
  const out = lowerKind(ctx, element);
  if (alpha === undefined) {
    return out;
  }
  return out.map((p) => ({
    ...p,
    group: element.key,
    opacity: alpha * (p.opacity ?? 1),
  }));
}

function lowerKind(ctx: LowerContext, element: SceneElement): Primitive[] {
  switch (element.kind) {
    case "box":
      return lowerBox(ctx, element);
    case "custom":
      return lowerCustom(ctx, element);
    case "connector":
      return lowerConnector(ctx, element);
    case "region":
      return lowerRegion(ctx, element);
    case "text":
      return lowerText(ctx, element);
  }
}

////////////////////////////////////////////////////////////////////////////////
//    Boxes
////////////////////////////////////////////////////////////////////////////////

function lowerBox(ctx: LowerContext, el: BoxElement): Primitive[] {
  const { rc, sf, style } = ctx;
  const z = el.z ?? Z_INDEX.SCENE_ELEMENT;
  const outer = scaleRect(el.rect, sf, ctx.origin);
  const border = el.style.strokeWidth * sf;
  const padding = el.style.padding.toScaled(sf);
  const out: Primitive[] = [
    chromePrimitive(el.key, `${el.key}/rect`, z, outer, {
      fillColor: el.style.fillColor,
      strokeColor: el.style.strokeColor,
      strokeWidth: border,
      rectRadius: el.style.rectRadius * sf,
      dashed: el.style.dashed === true,
    }),
  ];

  const innerW = outer.w() - padding.totalPx() - border;
  const innerH = outer.h() - padding.totalPy() - border;
  const content = measureBoxContent(
    rc,
    el.content,
    innerW,
    boxTextStyles(style, el),
    boxGeometry(style),
    el.style.badges,
  );

  const alignH = el.style.alignH ?? style.boxes.alignH;
  const innerX = outer.x() + border / 2 + padding.pl();
  const anchorX = alignH === "left"
    ? innerX
    : alignH === "right"
    ? innerX + innerW
    : innerX + innerW / 2;
  let y = outer.y() + border / 2 + padding.pt() +
    Math.max(0, (innerH - content.h) / 2);

  const pushText = (part: string, mText: MeasuredText) => {
    out.push(
      textPrimitive(el.key, `${el.key}/${part}`, z, mText, {
        position: new Coordinates([anchorX, y]),
        alignH,
        alignV: "top",
      }),
    );
    y += mText.dims.h();
  };
  pushText("title", content.title);
  if (content.sub !== undefined) {
    y += style.boxes.textGap;
    pushText("sub", content.sub);
  }
  content.lines.forEach((line, i) => {
    y += style.boxes.textGap;
    pushText(`line:${i}`, line);
  });

  let badgeIndex = 0;
  content.badgeRows.forEach((row, i) => {
    y += i === 0 ? style.boxes.textGap : style.badges.gap;
    const rowW = rowWidth(row, style.badges.gap);
    const rowH = rowHeight(row);
    let x = alignH === "left"
      ? anchorX
      : alignH === "right"
      ? anchorX - rowW
      : anchorX - rowW / 2;
    for (const badge of row) {
      const pill = new RectCoordsDims({
        x,
        y: y + (rowH - badge.h) / 2,
        w: badge.w,
        h: badge.h,
      });
      const prefix = `${el.key}/badge:${badgeIndex}`;
      const own = el.style.badges?.[badgeIndex];
      if (own?.opacity !== 0) {
        const alpha = own?.opacity === undefined
          ? {}
          : { opacity: own.opacity, group: prefix };
        out.push(
          {
            ...chromePrimitive(el.key, `${prefix}/rect`, z, pill, {
              fillColor: own?.fillColor ?? style.badges.fillColor,
              strokeColor: own?.strokeColor ?? style.badges.strokeColor,
              strokeWidth: style.badges.strokeWidth,
              rectRadius: pill.h() / 2,
              dashed: false,
            }),
            ...alpha,
          },
          {
            ...textPrimitive(el.key, `${prefix}/text`, z, badge.mText, {
              position: pill.centerCoords(),
              alignH: "center",
              alignV: "middle",
            }),
            ...alpha,
          },
        );
      }
      x += badge.w + style.badges.gap;
      badgeIndex++;
    }
    y += rowH;
  });
  return out;
}

////////////////////////////////////////////////////////////////////////////////
//    Connectors
////////////////////////////////////////////////////////////////////////////////

function lowerConnector(ctx: LowerContext, el: ConnectorElement): Primitive[] {
  const { rc, sf, style } = ctx;
  const z = el.z ?? Z_INDEX.SCENE_CONNECTOR;
  const width = el.style.strokeWidth * sf;
  const headSize = el.style.headSize * sf;
  const scaled = el.path.points.map((p) => scalePt(p, sf, ctx.origin));
  // The arrowhead V is round-joined, so its paint reaches half the stroke
  // past the vertex: pull the shaft end back by that so the painted tip sits
  // on the authored endpoint.
  const withEnd = el.heads === "end" || el.heads === "both";
  const withStart = el.heads === "start" || el.heads === "both";
  let pts = scaled;
  if (withEnd) {
    pts = pullBack(pts, width / 2, "end");
  }
  if (withStart) {
    pts = pullBack(pts, width / 2, "start");
  }
  const arrowheads: { start?: Arrowhead; end?: Arrowhead } = {};
  if (withEnd) {
    arrowheads.end = arrowheadAt(pts, headSize, "end");
  }
  if (withStart) {
    arrowheads.start = arrowheadAt(pts, headSize, "start");
  }
  const headPad = withEnd || withStart ? headSize / 2 : 0;
  const path: ShapePathPrimitive = {
    type: "shape-path",
    key: `${el.key}/path`,
    bounds: boundsOfPoints(pts, width / 2 + headPad),
    zIndex: z,
    meta: { element: el.key },
    pathSegments: openPathSegments({
      points: pts,
      corners: el.path.corners.map((r) => r * sf),
    }),
    pathStyle: {
      stroke: {
        color: getColor(el.style.strokeColor),
        width,
        lineDash: el.style.dashed === true ? "dashed" : "solid",
      },
    },
    arrowheads: withEnd || withStart ? arrowheads : undefined,
  };
  if (el.label === undefined) {
    return [path];
  }
  const at = pointAlong(scaled, el.label.t);
  const mText = rc.mText(
    el.label.text,
    getAdjustedText(style.text.connectorLabel, el.label.style),
    Number.POSITIVE_INFINITY,
  );
  const pad = style.connectors.labelPadding;
  const halo = new RectCoordsDims({
    x: at.x - mText.dims.w() / 2 - pad.pl(),
    y: at.y - mText.dims.h() / 2 - pad.pt(),
    w: mText.dims.w() + pad.totalPx(),
    h: mText.dims.h() + pad.totalPy(),
  });
  return [
    path,
    chromePrimitive(el.key, `${el.key}/label/rect`, z, halo, {
      fillColor: style.connectors.labelFillColor,
      strokeColor: "none",
      strokeWidth: 0,
      rectRadius: 0,
      dashed: false,
    }),
    textPrimitive(el.key, `${el.key}/label/text`, z, mText, {
      position: new Coordinates([at.x, at.y]),
      alignH: "center",
      alignV: "middle",
    }),
  ];
}

////////////////////////////////////////////////////////////////////////////////
//    Regions
////////////////////////////////////////////////////////////////////////////////

function lowerRegion(ctx: LowerContext, el: RegionElement): Primitive[] {
  const { rc, sf, style } = ctx;
  const z = el.z ?? Z_INDEX.SCENE_REGION;
  const outer = scaleRect(el.rect, sf, ctx.origin);
  const border = el.style.strokeWidth * sf;
  const chrome = {
    fillColor: el.style.fillColor,
    strokeColor: el.style.strokeColor,
    strokeWidth: border,
    rectRadius: el.style.rectRadius * sf,
    dashed: el.style.dashed === true,
  };
  const inset = style.regions.labelInset;
  const out: Primitive[] = [];
  const labelStyle = getAdjustedText(style.text.regionLabel, el.label?.style);
  const label = (
    mText: MeasuredText,
    position: Coordinates | RectCoordsDims,
    alignH: AlignH,
    alignV: AlignV,
  ) => {
    out.push(
      textPrimitive(el.key, `${el.key}/label`, z, mText, {
        position,
        alignH,
        alignV,
      }),
    );
  };

  if (el.shape === "bracket") {
    const depth = el.style.depth === undefined
      ? style.regions.bracket.depth
      : el.style.depth * sf;
    const side = el.side ?? "right";
    const pts = bracketPoints(outer, side, depth);
    out.push({
      type: "shape-path",
      key: `${el.key}/bracket`,
      bounds: boundsOfPoints(pts, border / 2),
      zIndex: z,
      meta: { element: el.key },
      pathSegments: openPathSegments({ points: pts, corners: [0, 0] }),
      pathStyle: {
        stroke: {
          color: getColor(el.style.strokeColor),
          width: border,
          lineDash: el.style.dashed === true ? "dashed" : "solid",
        },
      },
    });
    if (el.label !== undefined) {
      const mText = rc.mText(
        el.label.text,
        labelStyle,
        labelBudget(outer, side),
      );
      const off = depth + inset;
      switch (side) {
        case "right":
          label(
            mText,
            outer.rightCenterCoords().getOffsetted({ right: off }),
            "left",
            "middle",
          );
          break;
        case "left":
          label(
            mText,
            outer.leftCenterCoords().getOffsetted({ left: off }),
            "right",
            "middle",
          );
          break;
        case "bottom":
          label(
            mText,
            outer.bottomCenterCoords().getOffsetted({ bottom: off }),
            "center",
            "top",
          );
          break;
        case "top":
          label(
            mText,
            outer.topCenterCoords().getOffsetted({ top: off }),
            "center",
            "bottom",
          );
          break;
      }
    }
    return out;
  }

  if (
    el.shape === "ring" && el.outline !== undefined && el.outline.length > 0
  ) {
    el.outline.forEach((ring, i) => {
      const pts = insetRectilinearRing(
        ring.points.map((p) => scalePt(p, sf, ctx.origin)),
        border / 2,
      );
      out.push({
        type: "shape-path",
        key: `${el.key}/ring:${i}`,
        bounds: boundsOfPoints(pts, border / 2),
        zIndex: z,
        meta: { element: el.key },
        pathSegments: closedRingSegments({
          points: pts,
          corners: ring.corners.map((r) => r * sf),
        }),
        pathStyle: pathStyleOf(chrome),
      });
    });
  } else {
    out.push(chromePrimitive(el.key, `${el.key}/rect`, z, outer, chrome));
  }

  if (el.label === undefined) {
    return out;
  }
  if (el.label.at !== undefined) {
    const at = scaleRect(el.label.at, sf, ctx.origin);
    const mText = rc.mText(
      el.label.text,
      labelStyle,
      at.w() - 2 * inset + TEXT_WIDTH_EPS,
    );
    label(
      mText,
      new Coordinates([at.x() + inset, at.centerY()]),
      "left",
      "middle",
    );
    return out;
  }
  if (el.shape === "band") {
    const side = el.side ?? "left";
    if (side === "left" || side === "right") {
      const mText = rc.mText(el.label.text, labelStyle, outer.h() - 2 * inset, {
        rotation: side === "left" ? "anticlockwise" : "clockwise",
      });
      const x = side === "left" ? outer.x() + inset : outer.rightX() - inset;
      label(
        mText,
        new Coordinates([x, outer.centerY()]),
        side === "left" ? "left" : "right",
        "middle",
      );
    } else {
      const mText = rc.mText(el.label.text, labelStyle, outer.w() - 2 * inset);
      const y = side === "top" ? outer.y() + inset : outer.bottomY() - inset;
      label(
        mText,
        new Coordinates([outer.centerX(), y]),
        "center",
        side === "top" ? "top" : "bottom",
      );
    }
    return out;
  }
  const mText = rc.mText(el.label.text, labelStyle, outer.w() - 2 * inset);
  label(
    mText,
    new Coordinates([outer.x() + inset, outer.y() + inset]),
    "left",
    "top",
  );
  return out;
}

function bracketPoints(r: RectCoordsDims, side: Side, depth: number): Pt[] {
  const x1 = r.x();
  const y1 = r.y();
  const x2 = r.rightX();
  const y2 = r.bottomY();
  switch (side) {
    case "right":
      return [{ x: x2, y: y1 }, { x: x2 + depth, y: y1 }, {
        x: x2 + depth,
        y: y2,
      }, { x: x2, y: y2 }];
    case "left":
      return [{ x: x1, y: y1 }, { x: x1 - depth, y: y1 }, {
        x: x1 - depth,
        y: y2,
      }, { x: x1, y: y2 }];
    case "bottom":
      return [{ x: x1, y: y2 }, { x: x1, y: y2 + depth }, {
        x: x2,
        y: y2 + depth,
      }, { x: x2, y: y2 }];
    case "top":
      return [{ x: x1, y: y1 }, { x: x1, y: y1 - depth }, {
        x: x2,
        y: y1 - depth,
      }, { x: x2, y: y1 }];
  }
}

// A bracket's label wraps at the rect's extent along the bracket.
function labelBudget(r: RectCoordsDims, side: Side): number {
  return side === "left" || side === "right" ? r.h() : r.w();
}

////////////////////////////////////////////////////////////////////////////////
//    Texts and custom elements
////////////////////////////////////////////////////////////////////////////////

function lowerText(ctx: LowerContext, el: TextElement): Primitive[] {
  const rect = scaleRect(el.rect, ctx.sf, ctx.origin);
  const mText = ctx.rc.mText(
    el.text,
    getAdjustedText(ctx.style.text.text, el.style),
    (el.rotation === undefined ? rect.w() : rect.h()) + TEXT_WIDTH_EPS,
    el.rotation === undefined ? undefined : { rotation: el.rotation },
  );
  return [
    textPrimitive(
      el.key,
      `${el.key}/text`,
      el.z ?? Z_INDEX.SCENE_ELEMENT,
      mText,
      { position: rect, alignH: el.alignH, alignV: el.alignV },
    ),
  ];
}

// The draw's primitives all take the element's z, in the draw's own z order,
// so the element paints as a unit: an embedded chart's grid (z 100) would
// otherwise sort under a region (z 470) and vanish.
function lowerCustom(ctx: LowerContext, el: CustomElement): Primitive[] {
  const z = el.z ?? Z_INDEX.SCENE_ELEMENT;
  const rect = scaleRect(el.rect, ctx.sf, ctx.origin);
  const drawn = el.draw(ctx.rc, rect, ctx.sf).slice().sort((a, b) =>
    (a.zIndex ?? 0) - (b.zIndex ?? 0)
  );
  return drawn.map((p) => {
    const rekeyed = { ...p, key: `${el.key}/${p.key}`, zIndex: z };
    return isShapePrimitive(rekeyed)
      ? { ...rekeyed, meta: { element: el.key } }
      : rekeyed;
  });
}

////////////////////////////////////////////////////////////////////////////////
//    Shape constructors
////////////////////////////////////////////////////////////////////////////////

type Chrome = {
  fillColor: ColorKeyOrString;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  rectRadius: number;
  dashed: boolean;
};

// A rect's chrome: the stroke straddles the drawn edge, so the drawn rect is
// inset by half the border and the element's rect stays its painted extent.
// A dashed rect is a path, since RectStyle has no dash.
function chromePrimitive(
  element: string,
  key: string,
  z: number,
  outer: RectCoordsDims,
  chrome: Chrome,
): ShapeRectPrimitive | ShapePathPrimitive {
  const drawn = insetRect(outer, chrome.strokeWidth / 2);
  if (chrome.dashed) {
    return {
      type: "shape-path",
      key,
      bounds: outer,
      zIndex: z,
      meta: { element },
      pathSegments: roundedRectSegments(drawn, chrome.rectRadius),
      pathStyle: pathStyleOf(chrome),
    };
  }
  return {
    type: "shape-rect",
    key,
    bounds: outer,
    zIndex: z,
    meta: { element },
    rcd: drawn,
    style: {
      fillColor: getColor(chrome.fillColor),
      strokeColor: getColor(chrome.strokeColor),
      strokeWidth: chrome.strokeWidth,
      rectRadius: chrome.rectRadius,
    },
  };
}

function pathStyleOf(chrome: Chrome): ShapePathPrimitive["pathStyle"] {
  const stroke = getColor(chrome.strokeColor);
  return {
    fill: { color: getColor(chrome.fillColor) },
    stroke: chrome.strokeWidth > 0 && stroke !== "none"
      ? {
        color: stroke,
        width: chrome.strokeWidth,
        lineDash: chrome.dashed ? "dashed" : "solid",
      }
      : undefined,
  };
}

function textPrimitive(
  element: string,
  key: string,
  z: number,
  mText: MeasuredText,
  placement: {
    position: Coordinates | RectCoordsDims;
    alignH: AlignH;
    alignV: AlignV;
  },
): ShapeTextPrimitive {
  return {
    type: "shape-text",
    key,
    bounds: textBounds(mText, placement),
    zIndex: z,
    meta: { element },
    mText,
    ...placement,
  };
}

function textBounds(
  mText: MeasuredText,
  placement: {
    position: Coordinates | RectCoordsDims;
    alignH: AlignH;
    alignV: AlignV;
  },
): RectCoordsDims {
  if (placement.position instanceof RectCoordsDims) {
    return placement.position;
  }
  const w = mText.dims.w();
  const h = mText.dims.h();
  const x = placement.alignH === "left"
    ? placement.position.x()
    : placement.alignH === "right"
    ? placement.position.x() - w
    : placement.position.x() - w / 2;
  const y = placement.alignV === "top"
    ? placement.position.y()
    : placement.alignV === "bottom"
    ? placement.position.y() - h
    : placement.position.y() - h / 2;
  return new RectCoordsDims({ x, y, w, h });
}
