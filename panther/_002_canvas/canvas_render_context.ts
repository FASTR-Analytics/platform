// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { addArea } from "./_internal/drawing/add_area.ts";
import { addLine } from "./_internal/drawing/add_line.ts";
import { addPoint } from "./_internal/drawing/add_point.ts";
import { addRect } from "./_internal/drawing/add_rect.ts";
import {
  type AreaStyle,
  Coordinates,
  type CoordinatesOptions,
  getRectAlignmentCoords,
  type LineStyle,
  type MeasuredText,
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
import {
  DEFAULT_TEXT_RENDERING_OPTIONS,
  type TextRenderingOptions,
} from "./text_rendering_options.ts";

export class CanvasRenderContext implements RenderContext {
  _ctx: CanvasRenderingContext2D;
  private _textRenderingOptions: TextRenderingOptions;

  constructor(
    ctx: CanvasRenderingContext2D,
    textRenderingOptions?: TextRenderingOptions,
  ) {
    this._ctx = ctx;
    this._textRenderingOptions = textRenderingOptions ??
      DEFAULT_TEXT_RENDERING_OPTIONS;
  }

  mText(
    text: string,
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
        this._textRenderingOptions,
      );
    }
    return measureText(
      this._ctx,
      text,
      ti,
      maxWidth,
      this._textRenderingOptions,
    );
  }

  rText(
    mText: MeasuredText,
    coordsOrBounds: CoordinatesOptions | RectCoordsDimsOptions,
    hAlign: "center" | "left" | "right",
    vAlign?: "top" | "center" | "bottom",
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
        hAlign,
        vAlign ?? "top",
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
        vAlign ?? "top",
        hAlign,
      );
      return;
    }
    if (vAlign === "center") {
      writeText(this._ctx, mText, c.x(), c.y() - mText.dims.h() / 2, hAlign);
      return;
    }
    if (vAlign === "bottom") {
      writeText(this._ctx, mText, c.x(), c.y() - mText.dims.h(), hAlign);
      return;
    }
    writeText(this._ctx, mText, c.x(), c.y(), hAlign);
  }

  rLine(coordArray: CoordinatesOptions[], s: LineStyle) {
    addLine(this._ctx, coordArray, s);
  }

  rArea(coordArray: CoordinatesOptions[], s: AreaStyle) {
    addArea(this._ctx, coordArray, s);
  }

  rRect(rcd: RectCoordsDimsOptions, s: RectStyle) {
    const r = new RectCoordsDims(rcd);
    addRect(this._ctx, r, s);
  }

  rPoint(coords: CoordinatesOptions, s: PointStyle) {
    const c = new Coordinates(coords);
    addPoint(this._ctx, c, s);
  }

  rImage(image: HTMLImageElement | HTMLCanvasElement, ...args: number[]): void {
    // Check if this is our custom @gfx/canvas wrapper
    let actualImage = image;
    if (
      image &&
      typeof image === "object" &&
      "_isGfxCanvas" in (image as any)
    ) {
      actualImage = (image as any)._gfxCanvasImage;
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
}
