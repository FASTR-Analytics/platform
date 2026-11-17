// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { addArea } from "./_internal/drawing/add_area.ts";
import { addLine } from "./_internal/drawing/add_line.ts";
import { addPoint } from "./_internal/drawing/add_point.ts";
import { addRect } from "./_internal/drawing/add_rect.ts";
import { isGfxCanvasImage } from "./gfx_canvas_image.ts";
import {
  type AlignH,
  type AlignV,
  type AreaStyle,
  Coordinates,
  type CoordinatesOptions,
  getColor,
  getRectAlignmentCoords,
  type LineStyle,
  type MeasuredText,
  type PathSegment,
  type PathStyle,
  type PointStyle,
  RectCoordsDims,
  type RectCoordsDimsOptions,
  type RectStyle,
  type RenderContext,
  type TextInfoUnkeyed,
} from "./deps.ts";
import {
  measureText,
  measureVerticalText,
} from "./_internal/text/measure_text.ts";
import { writeText, writeVerticalText } from "./_internal/text/write_text.ts";

// The canvas a withOpacity layer paints into, the size of the target's
// backing store: document.createElement("canvas") in the browser, @gfx/canvas's
// createCanvas in Deno (cast at the site, as its context is).
export type CreateCanvas = (width: number, height: number) => HTMLCanvasElement;

export class CanvasRenderContext implements RenderContext {
  // The context the ops paint into: the target's, or the open layer's inside
  // withOpacity.
  _ctx: CanvasRenderingContext2D;
  private readonly _createCanvas: CreateCanvas;
  // One layer canvas per nesting depth, kept across withOpacity calls so a
  // tween's frames allocate none.
  private readonly _layers: HTMLCanvasElement[] = [];
  private _depth = 0;

  constructor(ctx: CanvasRenderingContext2D, createCanvas: CreateCanvas) {
    this._ctx = ctx;
    this._createCanvas = createCanvas;
  }

  mText(
    text: string | null | undefined,
    ti: TextInfoUnkeyed,
    maxWidth: number,
    opts?: {
      rotation?: "horizontal" | "anticlockwise" | "clockwise";
    },
  ) {
    if (opts?.rotation === "anticlockwise" || opts?.rotation === "clockwise") {
      return measureVerticalText(
        this._ctx,
        text,
        ti,
        maxWidth,
        opts.rotation,
      );
    }
    return measureText(this._ctx, text, ti, maxWidth);
  }

  rText(
    mText: MeasuredText,
    coordsOrBounds: CoordinatesOptions | RectCoordsDimsOptions,
    alignH: AlignH,
    alignV?: AlignV,
    _link?: string,
  ) {
    // Check if it's a RectCoordsDims
    let coords: CoordinatesOptions;
    if (
      coordsOrBounds instanceof RectCoordsDims ||
      (typeof coordsOrBounds === "object" &&
        !Array.isArray(coordsOrBounds) &&
        "w" in coordsOrBounds &&
        "h" in coordsOrBounds)
    ) {
      coords = getRectAlignmentCoords(
        coordsOrBounds as RectCoordsDimsOptions,
        alignH,
        alignV ?? "top",
      );
    } else {
      coords = coordsOrBounds as CoordinatesOptions;
    }

    const c = new Coordinates(coords);
    if (mText.rotation === "anticlockwise" || mText.rotation === "clockwise") {
      writeVerticalText(
        this._ctx,
        mText,
        c.x(),
        c.y(),
        alignV ?? "top",
        alignH,
      );
      return;
    }
    if (alignV === "middle") {
      writeText(this._ctx, mText, c.x(), c.y() - mText.dims.h() / 2, alignH);
      return;
    }
    if (alignV === "bottom") {
      writeText(this._ctx, mText, c.x(), c.y() - mText.dims.h(), alignH);
      return;
    }
    writeText(this._ctx, mText, c.x(), c.y(), alignH);
  }

  rLine(coordArray: CoordinatesOptions[], s: LineStyle) {
    addLine(this._ctx, coordArray, s);
  }

  rArea(coordArray: CoordinatesOptions[], s: AreaStyle) {
    addArea(this._ctx, coordArray, s);
  }

  rRect(rcd: RectCoordsDimsOptions, s: RectStyle) {
    addRect(this._ctx, new RectCoordsDims(rcd), s);
  }

  rPoint(coords: CoordinatesOptions, s: PointStyle) {
    addPoint(this._ctx, new Coordinates(coords), s);
  }

  rImage(
    image: HTMLImageElement | HTMLCanvasElement | string,
    ...args: number[]
  ): void {
    if (typeof image === "string") {
      throw new Error("Data URL strings not supported in CanvasRenderContext");
    }

    // Check if this is our custom @gfx/canvas wrapper
    let actualImage: CanvasImageSource = image;
    if (isGfxCanvasImage(image)) {
      actualImage = image._gfxCanvasImage;
    }

    if (args.length === 4) {
      // 5-parameter version: drawImage(image, dx, dy, dw, dh)
      const [dx, dy, dw, dh] = args;
      this._ctx.drawImage(actualImage, dx, dy, dw, dh);
    } else if (args.length === 8) {
      // 9-parameter version: drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      this._ctx.drawImage(actualImage, sx, sy, sw, sh, dx, dy, dw, dh);
    } else {
      throw new Error(
        `Invalid number of arguments for rImage: ${args.length + 1}`,
      );
    }
  }

  rPath(segments: PathSegment[], style: PathStyle): void {
    if (!style.fill && !style.stroke) {
      return;
    }

    const ctx = this._ctx;
    ctx.beginPath();

    for (const seg of segments) {
      switch (seg.type) {
        case "moveTo":
          ctx.moveTo(seg.x, seg.y);
          break;
        case "lineTo":
          ctx.lineTo(seg.x, seg.y);
          break;
        case "bezierCurveTo":
          ctx.bezierCurveTo(
            seg.cp1x,
            seg.cp1y,
            seg.cp2x,
            seg.cp2y,
            seg.x,
            seg.y,
          );
          break;
      }
    }

    if (style.fill) {
      const fillStr = getColor(style.fill.color);
      if (fillStr !== "none") {
        ctx.fillStyle = fillStr;
        ctx.fill(style.fill.fillRule ?? "nonzero");
      }
    }

    if (style.stroke) {
      const strokeStr = getColor(style.stroke.color);
      if (strokeStr !== "none") {
        ctx.strokeStyle = strokeStr;
        ctx.lineWidth = style.stroke.width;
        if (style.stroke.lineDash === "dashed") {
          ctx.setLineDash([style.stroke.width * 5, style.stroke.width * 4]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  withClip(bounds: RectCoordsDimsOptions, fn: () => void): void {
    const ctx = this._ctx;
    const r = new RectCoordsDims(bounds);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x(), r.y(), r.w(), r.h());
    ctx.clip();
    fn();
    ctx.restore();
  }

  // fn paints into an offscreen layer under the target's transform; the layer
  // then composites onto the target at alpha, so what fn paints over itself
  // (a box's text over its fill) is not tinted by what is beneath it. The skia
  // canvas honours globalAlpha for drawImage alone, which is all a layer needs.
  withOpacity(alpha: number, fn: () => void): void {
    const target = this._ctx;
    const layer = this.openLayer(target);
    this._ctx = layer;
    try {
      fn();
    } finally {
      this._ctx = target;
      this._depth--;
    }
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = alpha;
    target.drawImage(layer.canvas, 0, 0);
    target.restore();
  }

  private openLayer(
    target: CanvasRenderingContext2D,
  ): CanvasRenderingContext2D {
    const { width, height } = target.canvas;
    let canvas = this._layers[this._depth];
    if (
      canvas === undefined || canvas.width !== width ||
      canvas.height !== height
    ) {
      canvas = this._createCanvas(width, height);
      this._layers[this._depth] = canvas;
    }
    this._depth++;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("Failed to get a 2D context for the opacity layer");
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(target.getTransform());
    return ctx;
  }
}
