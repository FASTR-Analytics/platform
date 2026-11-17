// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getAdjustedText, Padding, RectCoordsDims } from "./deps.ts";
import type {
  AlignH,
  AlignV,
  ColorKeyOrString,
  MeasuredText,
  MergedSceneStyle,
  PaddingOptions,
  Pt,
  Rect,
  RenderContext,
  ShapeImagePrimitive,
  TextAdjustmentOptions,
} from "./deps.ts";
import type {
  BoxContent,
  ConnectorHeads,
  CustomDraw,
  DiagramCustomNode,
  DiagramData,
  Scene,
  SceneBoxStyle,
  SceneElement,
  Side,
} from "./types.ts";
import { translateElement } from "./_internal/adapter.ts";
import { diagramSource } from "./_internal/diagram.ts";
import {
  boxGeometry,
  boxTextStyles,
  measureBoxContent,
} from "./_internal/box_layout.ts";
import {
  boundsOfPoints,
  edgePointOf,
  unionRects,
} from "./_internal/geometry.ts";

type RectLike = Rect | RectCoordsDims;

type Keyed = {
  key?: string;
  z?: number;
  opacity?: number;
};

type Chrome = {
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  rectRadius?: number;
  dashed?: boolean;
};

export type SceneTextOptions = Keyed & {
  style?: TextAdjustmentOptions;
  alignH?: AlignH;
  alignV?: AlignV;
};

export type SceneRectOptions = Keyed & Chrome;

export type ScenePanelOptions = SceneRectOptions & {
  label?: string;
  labelStyle?: TextAdjustmentOptions;
};

export type SceneBoxOptions = Keyed & Chrome & BoxContent & {
  x: number;
  y: number;
  w: number;
  h?: number;
  padding?: PaddingOptions;
  textColor?: ColorKeyOrString;
  titleStyle?: TextAdjustmentOptions;
  subStyle?: TextAdjustmentOptions;
  alignH?: AlignH;
  anchor?: "top-left" | "top-center" | "center" | "center-left";
};

export type SceneBoxItem = Omit<SceneBoxOptions, "x" | "y" | "w">;

export type ScenePillOptions = Keyed & {
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  textColor?: ColorKeyOrString;
  style?: TextAdjustmentOptions;
  padding?: PaddingOptions;
  anchor?: "center" | "top-left" | "top-center";
  maxW?: number;
};

export type SceneArrowOptions = Keyed & {
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  dashed?: boolean;
  heads?: ConnectorHeads;
  headSize?: number;
  cornerRadius?: number;
  label?: { text: string; t?: number; style?: TextAdjustmentOptions };
};

export type SceneConnectOptions = SceneArrowOptions & {
  from?: Side;
  to?: Side;
  fromT?: number;
  toT?: number;
  route?: "straight" | "elbow";
  // The elbow corridor: x for a horizontal flow, y for a vertical one.
  mid?: number;
  gap?: number;
};

export type SceneBracketOptions = Keyed & {
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  dashed?: boolean;
  depth?: number;
  label?: string;
  labelStyle?: TextAdjustmentOptions;
};

export type SceneCustomOptions = Keyed & {
  transition?: "redraw" | "crossfade";
};

export type SceneDiagramOptions = {
  key?: string;
  customNode?: DiagramCustomNode;
};

const DEFAULT_LABEL_T = 0.5;

// Builds a scene in the DU of a frame `w` wide at scale 1. Every call that
// makes an element takes an optional key (else `auto:<n>`) and returns the
// element's rect; `scene()` closes the frame at the declared height `h`, or
// without one at the drawn extent.
export class SceneBuilder {
  readonly w: number;
  private readonly _h: number | undefined;
  private readonly _rc: RenderContext;
  private readonly _s: MergedSceneStyle;
  private readonly _elements: SceneElement[] = [];
  private readonly _keys = new Set<string>();
  private _maxY = 0;
  private _nextAuto = 0;

  constructor(
    rc: RenderContext,
    style: MergedSceneStyle,
    w: number,
    h?: number,
  ) {
    this._rc = rc;
    this._s = style;
    this.w = w;
    this._h = h;
  }

  scene(): Scene {
    return {
      frame: { w: this.w, h: this._h ?? this._maxY },
      elements: [...this._elements],
    };
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Text
  //////////////////////////////////////////////////////////////////////////////

  measure(
    str: string,
    w: number,
    style?: TextAdjustmentOptions,
  ): MeasuredText {
    return this._rc.mText(str, getAdjustedText(this._s.text.text, style), w);
  }

  text(
    str: string,
    pos: { x: number; y: number; w: number; h?: number },
    o: SceneTextOptions = {},
  ): RectCoordsDims {
    const h = pos.h ?? this.measure(str, pos.w, o.style).dims.h();
    const rect = { x: pos.x, y: pos.y, w: pos.w, h };
    this.add({
      kind: "text",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect,
      text: str,
      style: o.style,
      alignH: o.alignH ?? "left",
      alignV: o.alignV ?? "top",
    }, rect.y + rect.h);
    return new RectCoordsDims(rect);
  }

  // Turned a quarter anticlockwise, read from bottom to top.
  verticalText(
    str: string,
    pos: Rect,
    o: SceneTextOptions = {},
  ): RectCoordsDims {
    this.add({
      kind: "text",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect: { ...pos },
      text: str,
      style: o.style,
      alignH: o.alignH ?? "center",
      alignV: o.alignV ?? "bottom",
      rotation: "anticlockwise",
    }, pos.y + pos.h);
    return new RectCoordsDims(pos);
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Regions
  //////////////////////////////////////////////////////////////////////////////

  // A plain rect in the `regions.rect` chrome: invisible until given a fill or
  // a stroke colour.
  rect(r: RectLike, o: SceneRectOptions = {}): RectCoordsDims {
    const rect = toRect(r);
    const chrome = this._s.regions.rect;
    this.add({
      kind: "region",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect,
      shape: "panel",
      style: {
        fillColor: o.fillColor ?? chrome.fillColor,
        strokeColor: o.strokeColor ?? chrome.strokeColor,
        strokeWidth: o.strokeWidth ?? chrome.strokeWidth,
        rectRadius: o.rectRadius ?? chrome.rectRadius,
        dashed: o.dashed,
      },
    }, rect.y + rect.h);
    return new RectCoordsDims(rect);
  }

  // A background region with a label in its top-left corner. Draw panels
  // before what sits on them.
  panel(r: RectLike, o: ScenePanelOptions = {}): RectCoordsDims {
    const rect = toRect(r);
    const panel = this._s.regions.panel;
    this.add({
      kind: "region",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect,
      shape: "panel",
      label: o.label === undefined
        ? undefined
        : { text: o.label, style: o.labelStyle },
      style: {
        fillColor: o.fillColor ?? panel.fillColor,
        strokeColor: o.strokeColor ?? panel.strokeColor,
        strokeWidth: o.strokeWidth ?? panel.strokeWidth,
        rectRadius: o.rectRadius ?? panel.rectRadius,
        dashed: o.dashed,
      },
    }, rect.y + rect.h);
    return new RectCoordsDims(rect);
  }

  // A thin bracket standing off one side of a rect, grouping what is inside.
  bracket(
    r: RectLike,
    side: Side,
    o: SceneBracketOptions = {},
  ): RectCoordsDims {
    const inner = toRect(r);
    const bracket = this._s.regions.bracket;
    const depth = o.depth ?? bracket.depth;
    this.add({
      kind: "region",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect: inner,
      shape: "bracket",
      side,
      label: o.label === undefined
        ? undefined
        : { text: o.label, style: o.labelStyle },
      style: {
        fillColor: "transparent",
        strokeColor: o.strokeColor ?? bracket.strokeColor,
        strokeWidth: o.strokeWidth ?? bracket.strokeWidth,
        rectRadius: 0,
        dashed: o.dashed,
        depth,
      },
    }, inner.y + inner.h + (side === "bottom" ? depth : 0));
    switch (side) {
      case "right":
        return new RectCoordsDims({ ...inner, w: inner.w + depth });
      case "left":
        return new RectCoordsDims({
          ...inner,
          x: inner.x - depth,
          w: inner.w + depth,
        });
      case "bottom":
        return new RectCoordsDims({ ...inner, h: inner.h + depth });
      case "top":
        return new RectCoordsDims({
          ...inner,
          y: inner.y - depth,
          h: inner.h + depth,
        });
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Boxes
  //////////////////////////////////////////////////////////////////////////////

  boxHeight(o: SceneBoxOptions): number {
    if (o.h !== undefined) {
      return o.h;
    }
    const { content, style } = this.resolveBox(o);
    return this.boxContentHeight(o.w, content, style);
  }

  box(o: SceneBoxOptions): RectCoordsDims {
    const { content, style } = this.resolveBox(o);
    const h = o.h ?? this.boxContentHeight(o.w, content, style);
    const anchor = o.anchor ?? "top-left";
    const x = anchor === "top-center" || anchor === "center"
      ? o.x - o.w / 2
      : o.x;
    const y = anchor === "center" || anchor === "center-left"
      ? o.y - h / 2
      : o.y;
    const rect = { x, y, w: o.w, h };
    this.add({
      kind: "box",
      variant: "box",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect,
      content,
      style,
    }, rect.y + rect.h);
    return new RectCoordsDims(rect);
  }

  // Boxes down a column at one x, sharing a width.
  stack(
    items: SceneBoxItem[],
    pos: { x: number; y: number; w: number; gap?: number },
  ): RectCoordsDims[] {
    const gap = pos.gap ?? this._s.boxes.gap;
    const out: RectCoordsDims[] = [];
    let y = pos.y;
    for (const item of items) {
      const r = this.box({ ...item, x: pos.x, y, w: pos.w });
      out.push(r);
      y = r.bottomY() + gap;
    }
    return out;
  }

  // Boxes across a row at one y, sharing a width and a height.
  row(
    items: SceneBoxItem[],
    pos: { x: number; y: number; w: number; gap?: number; h?: number },
  ): RectCoordsDims[] {
    const gap = pos.gap ?? this._s.boxes.gap;
    const w = (pos.w - gap * (items.length - 1)) / items.length;
    const h = pos.h ??
      Math.max(
        ...items.map((item) => this.boxHeight({ ...item, x: 0, y: 0, w })),
      );
    return items.map((item, i) =>
      this.box({ ...item, h, x: pos.x + i * (w + gap), y: pos.y, w })
    );
  }

  // A small rounded label: a box in the badge chrome and text style, sized
  // to its text.
  pill(str: string, at: Pt, o: ScenePillOptions = {}): RectCoordsDims {
    const s = this._s;
    const padding = new Padding(o.padding ?? s.badges.padding);
    const title = withColor(o.style, o.textColor);
    const mText = this._rc.mText(
      str,
      getAdjustedText(s.text.badge, title),
      o.maxW ?? Number.POSITIVE_INFINITY,
    );
    const strokeWidth = s.badges.strokeWidth;
    const w = mText.dims.w() + padding.totalPx() + strokeWidth;
    const h = mText.dims.h() + padding.totalPy() + strokeWidth;
    const anchor = o.anchor ?? "center";
    const x = anchor === "top-left" ? at.x : at.x - w / 2;
    const y = anchor === "center" ? at.y - h / 2 : at.y;
    const rect = { x, y, w, h };
    this.add({
      kind: "box",
      variant: "pill",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect,
      content: { title: str },
      style: {
        fillColor: o.fillColor ?? s.badges.fillColor,
        strokeColor: o.strokeColor ?? s.badges.strokeColor,
        strokeWidth,
        rectRadius: h / 2,
        padding,
        title,
      },
    }, rect.y + rect.h);
    return new RectCoordsDims(rect);
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Connectors
  //////////////////////////////////////////////////////////////////////////////

  arrow(pts: Pt[], o: SceneArrowOptions = {}): RectCoordsDims {
    if (pts.length < 2) {
      throw new Error("An arrow needs two points");
    }
    const c = this._s.connectors;
    const heads = o.heads ?? "end";
    const headSize = o.headSize ?? c.headSize;
    const strokeWidth = o.strokeWidth ?? c.strokeWidth;
    const points = pts.map((p) => ({ x: p.x, y: p.y }));
    const corners = points.slice(1, -1).map(() =>
      o.cornerRadius ?? c.cornerRadius
    );
    const pad = strokeWidth / 2 + (heads === "none" ? 0 : headSize / 2);
    const bounds = boundsOfPoints(points, pad);
    this.add({
      kind: "connector",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      path: { points, corners },
      heads,
      style: {
        strokeColor: o.strokeColor ?? c.strokeColor,
        strokeWidth,
        dashed: o.dashed ?? c.lineDash === "dashed",
        headSize,
      },
      label: o.label === undefined ? undefined : {
        text: o.label.text,
        t: o.label.t ?? DEFAULT_LABEL_T,
        style: o.label.style,
      },
    }, bounds.bottomY());
    return bounds;
  }

  // An arrow between two rects, from one side to another, each end standing
  // off its edge by the connector gap; `route: "elbow"` goes orthogonally
  // through `mid`.
  connect(
    a: RectLike,
    b: RectLike,
    o: SceneConnectOptions = {},
  ): RectCoordsDims {
    const from = o.from ?? "right";
    const to = o.to ?? "left";
    const gap = o.gap ?? this._s.connectors.gap;
    const p0 = this.edgePoint(a, from, o.fromT);
    const p1 = this.edgePoint(b, to, o.toT);
    const start = offsetOutward(p0, from, gap);
    const end = offsetOutward(p1, to, gap);
    if ((o.route ?? "straight") === "straight") {
      return this.arrow([start, end], o);
    }
    if (from === "left" || from === "right") {
      const mx = o.mid ?? (start.x + end.x) / 2;
      return this.arrow(
        [start, { x: mx, y: start.y }, { x: mx, y: end.y }, end],
        o,
      );
    }
    const my = o.mid ?? (start.y + end.y) / 2;
    return this.arrow(
      [start, { x: start.x, y: my }, { x: end.x, y: my }, end],
      o,
    );
  }

  edgePoint(r: RectLike, side: Side, t = 0.5): Pt {
    return edgePointOf(toRect(r), side, t);
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Layout helpers
  //////////////////////////////////////////////////////////////////////////////

  columns(
    x0: number,
    totalW: number,
    n: number,
    gap: number,
  ): { x: number; w: number }[] {
    const w = (totalW - gap * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w }));
  }

  union(rects: RectLike[]): RectCoordsDims {
    return new RectCoordsDims(unionRects(rects.map(toRect)));
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Custom elements
  //////////////////////////////////////////////////////////////////////////////

  custom(
    r: RectLike,
    draw: CustomDraw,
    o: SceneCustomOptions = {},
  ): RectCoordsDims {
    const rect = toRect(r);
    this.add({
      kind: "custom",
      key: this.key(o.key),
      z: o.z,
      opacity: o.opacity,
      rect,
      draw,
      transition: o.transition,
    }, rect.y + rect.h);
    return new RectCoordsDims(rect);
  }

  // An embedded drawing (a panther figure through embedFigure) crossfades
  // between scenes by default rather than redrawing into an interpolated rect;
  // one that is the same at both passes "redraw" and holds through the change.
  embed(
    r: RectLike,
    draw: CustomDraw,
    o: SceneCustomOptions = {},
  ): RectCoordsDims {
    return this.custom(r, draw, {
      ...o,
      transition: o.transition ?? "crossfade",
    });
  }

  // An image at its own proportions, scaled to fit the rect and centred.
  image(
    r: RectLike,
    image: HTMLImageElement | HTMLCanvasElement,
    o: SceneCustomOptions = {},
  ): RectCoordsDims {
    const draw: CustomDraw = (_rc, rect) => {
      const scale = Math.min(rect.w() / image.width, rect.h() / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      const fitted = new RectCoordsDims({
        x: rect.x() + (rect.w() - w) / 2,
        y: rect.y() + (rect.h() - h) / 2,
        w,
        h,
      });
      const shape: ShapeImagePrimitive = {
        type: "shape-image",
        key: "image",
        bounds: fitted,
        meta: { element: "image" },
        image,
        rcd: fitted,
      };
      return [shape];
    };
    return this.embed(r, draw, o);
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Diagrams
  //////////////////////////////////////////////////////////////////////////////

  // A diagram laid out at the rect's width (a placed layout at its natural
  // extent), its elements added under `<key>/<element key>` so they stay
  // tweenable, and its node rects returned by id so hand-drawn extras can
  // anchor to them.
  diagram(
    data: DiagramData,
    at: { x: number; y: number; w: number },
    o: SceneDiagramOptions = {},
  ): Record<string, RectCoordsDims> {
    const prefix = this.key(o.key);
    const fit = diagramSource(data, o.customNode)(this._rc, this._s)(at.w);
    const bottom = at.y + fit.scene.frame.h;
    for (const el of fit.scene.elements) {
      const moved = translateElement(el, at.x, at.y);
      this.add({ ...moved, key: this.key(`${prefix}/${el.key}`) }, bottom);
    }
    const rects: Record<string, RectCoordsDims> = {};
    for (const [id, r] of Object.entries(fit.geometry.nodes)) {
      rects[id] = new RectCoordsDims({ ...r, x: r.x + at.x, y: r.y + at.y });
    }
    return rects;
  }

  //////////////////////////////////////////////////////////////////////////////
  //    Internals
  //////////////////////////////////////////////////////////////////////////////

  private add(element: SceneElement, bottom: number): void {
    this._elements.push(element);
    this._maxY = Math.max(this._maxY, bottom);
  }

  private key(key: string | undefined): string {
    const resolved = key ?? `auto:${this._nextAuto++}`;
    if (this._keys.has(resolved)) {
      throw new Error(`Scene element key "${resolved}" is already used`);
    }
    this._keys.add(resolved);
    return resolved;
  }

  private resolveBox(
    o: SceneBoxOptions,
  ): { content: BoxContent; style: SceneBoxStyle } {
    const boxes = this._s.boxes;
    return {
      content: {
        title: o.title,
        sub: o.sub,
        lines: o.lines,
        badges: o.badges,
      },
      style: {
        fillColor: o.fillColor ?? boxes.fillColor,
        strokeColor: o.strokeColor ?? boxes.strokeColor,
        strokeWidth: o.strokeWidth ?? boxes.strokeWidth,
        rectRadius: o.rectRadius ?? boxes.rectRadius,
        padding: new Padding(o.padding ?? boxes.padding),
        dashed: o.dashed,
        title: withColor(o.titleStyle, o.textColor),
        sub: withColor(o.subStyle, o.textColor),
        alignH: o.alignH,
      },
    };
  }

  private boxContentHeight(
    w: number,
    content: BoxContent,
    style: SceneBoxStyle,
  ): number {
    const innerW = w - style.padding.totalPx() - style.strokeWidth;
    const measured = measureBoxContent(
      this._rc,
      content,
      innerW,
      boxTextStyles(this._s, { variant: "box", style }),
      boxGeometry(this._s),
      style.badges,
    );
    return measured.h + style.padding.totalPy() + style.strokeWidth;
  }
}

function toRect(r: RectLike): Rect {
  return r instanceof RectCoordsDims ? r.asObject() : { ...r };
}

function offsetOutward(p: Pt, side: Side, gap: number): Pt {
  switch (side) {
    case "right":
      return { x: p.x + gap, y: p.y };
    case "left":
      return { x: p.x - gap, y: p.y };
    case "bottom":
      return { x: p.x, y: p.y + gap };
    case "top":
      return { x: p.x, y: p.y - gap };
  }
}

function withColor(
  style: TextAdjustmentOptions | undefined,
  color: ColorKeyOrString | undefined,
): TextAdjustmentOptions | undefined {
  if (color === undefined) {
    return style;
  }
  return { ...style, color: style?.color ?? color };
}
