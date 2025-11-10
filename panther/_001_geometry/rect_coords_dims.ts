// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates } from "./coordinates.ts";
import type { Dimensions } from "./dimensions.ts";
import type { Padding } from "./padding.ts";

export type RectCoordsDimsOptions =
  | {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  | RectCoordsDims
  | number[];

export class RectCoordsDims {
  private _x: number;
  private _y: number;
  private _w: number;
  private _h: number;

  constructor(rcd: RectCoordsDimsOptions) {
    if (rcd instanceof RectCoordsDims) {
      this._x = rcd._x;
      this._y = rcd._y;
      this._w = rcd._w;
      this._h = rcd._h;
      return;
    }
    if (rcd instanceof Array) {
      if (rcd.length === 4) {
        this._x = rcd[0];
        this._y = rcd[1];
        this._w = rcd[2];
        this._h = rcd[3];
        return;
      }
      throw new Error("Bad inputs for RectCoordsDims constructor");
    }
    if (typeof rcd === "object") {
      this._x = rcd.x;
      this._y = rcd.y;
      this._w = rcd.w;
      this._h = rcd.h;
      return;
    }
    throw new Error("Bad inputs for RectCoordsDims constructor");
  }

  x(): number {
    return this._x;
  }

  y(): number {
    return this._y;
  }

  w(): number {
    return this._w;
  }

  h(): number {
    return this._h;
  }

  centerX(): number {
    return this._x + this._w / 2;
  }

  rightX(): number {
    return this._x + this._w;
  }

  centerY(): number {
    return this._y + this._h / 2;
  }

  bottomY(): number {
    return this._y + this._h;
  }

  topLeftCoords(): Coordinates {
    return new Coordinates([this.x(), this.y()]);
  }

  topCenterCoords(): Coordinates {
    return new Coordinates([this.centerX(), this.y()]);
  }

  topRightCoords(): Coordinates {
    return new Coordinates([this.rightX(), this.y()]);
  }

  bottomLeftCoords(): Coordinates {
    return new Coordinates([this.x(), this.bottomY()]);
  }

  bottomCenterCoords(): Coordinates {
    return new Coordinates([this.centerX(), this.bottomY()]);
  }

  bottomRightCoords(): Coordinates {
    return new Coordinates([this.rightX(), this.bottomY()]);
  }

  leftCenterCoords(): Coordinates {
    return new Coordinates([this.x(), this.centerY()]);
  }

  rightCenterCoords(): Coordinates {
    return new Coordinates([this.rightX(), this.centerY()]);
  }

  centerCoords(): Coordinates {
    return new Coordinates([this.centerX(), this.centerY()]);
  }

  asArray(): number[] {
    return [this._x, this._y, this._w, this._h];
  }

  asObject(): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    return { x: this._x, y: this._y, w: this._w, h: this._h };
  }

  contains(x: number, y: number): boolean {
    return (
      x >= this._x && y >= this._y && x <= this.rightX() && y <= this.bottomY()
    );
  }

  getHeightToWidthRatio(): number {
    return this._h / this._w;
  }

  getWidthToHeightRatio(): number {
    return this._w / this._h;
  }

  getCopy(): RectCoordsDims {
    return new RectCoordsDims({
      x: this._x,
      y: this._y,
      w: this._w,
      h: this._h,
    });
  }

  getPadded(pad: Padding): RectCoordsDims {
    return new RectCoordsDims({
      x: this._x + pad.pl(),
      y: this._y + pad.pt(),
      w: this._w - pad.totalPx(),
      h: this._h - pad.totalPy(),
    });
  }

  getAdjusted(
    adjustments:
      | { x?: number; y?: number; w?: number; h?: number }
      | ((prev: RectCoordsDims) => {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
      }),
  ): RectCoordsDims {
    const goodAdjs = typeof adjustments === "function"
      ? adjustments(this)
      : adjustments;
    return new RectCoordsDims({
      x: goodAdjs.x ?? this._x,
      y: goodAdjs.y ?? this._y,
      w: goodAdjs.w ?? this._w,
      h: goodAdjs.h ?? this._h,
    });
  }

  getScaledAndCenteredInnerDimsAsRcd(dims: Dimensions): RectCoordsDims {
    if (dims.getHeightToWidthRatio() > this.getHeightToWidthRatio()) {
      const innerW = dims.getWidthToHeightRatio() * this._h;
      const innerX = this._x + (this._w - innerW) / 2;
      return new RectCoordsDims({
        x: innerX,
        y: this._y,
        w: innerW,
        h: this._h,
      });
    }
    const innerH = dims.getHeightToWidthRatio() * this._w;
    const innerY = this._y + (this._h - innerH) / 2;
    return new RectCoordsDims({
      x: this._x,
      y: innerY,
      w: this._w,
      h: innerH,
    });
  }

  getInnerPositionedRcd1Arg(
    innerDims: Dimensions,
    position:
      | "center"
      | "left"
      | "right"
      | "top"
      | "bottom"
      | "top-left"
      | "top-center"
      | "top-right"
      | "bottom-left"
      | "bottom-center"
      | "bottom-right",
  ): RectCoordsDims {
    switch (position) {
      case "center":
        return this.getInnerPositionedRcd2Args(innerDims, "center", "center");
      case "left":
        return this.getInnerPositionedRcd2Args(innerDims, "left", "center");
      case "right":
        return this.getInnerPositionedRcd2Args(innerDims, "right", "center");
      case "top":
        return this.getInnerPositionedRcd2Args(innerDims, "center", "top");
      case "bottom":
        return this.getInnerPositionedRcd2Args(innerDims, "center", "bottom");
      case "top-left":
        return this.getInnerPositionedRcd2Args(innerDims, "left", "top");
      case "top-center":
        return this.getInnerPositionedRcd2Args(innerDims, "center", "top");
      case "top-right":
        return this.getInnerPositionedRcd2Args(innerDims, "right", "top");
      case "bottom-left":
        return this.getInnerPositionedRcd2Args(innerDims, "left", "bottom");
      case "bottom-center":
        return this.getInnerPositionedRcd2Args(innerDims, "center", "bottom");
      case "bottom-right":
        return this.getInnerPositionedRcd2Args(innerDims, "right", "bottom");
    }
    throw new Error("Should not be possible");
  }

  getInnerPositionedRcd2Args(
    innerDims: Dimensions,
    horizontalPosition: "center" | "left" | "right",
    verticalPosition: "center" | "top" | "bottom",
  ): RectCoordsDims {
    if (this.w() < innerDims.w() || this.h() < innerDims.h()) {
      throw new Error("Outer RPD is smaller than inner RPD");
    }
    const xOffest = horizontalPosition === "center"
      ? (this.w() - innerDims.w()) / 2
      : horizontalPosition === "right"
      ? this.w() - innerDims.w()
      : 0;
    const yOffest = verticalPosition === "center"
      ? (this.h() - innerDims.h()) / 2
      : verticalPosition === "bottom"
      ? this.h() - innerDims.h()
      : 0;
    return new RectCoordsDims({
      x: this.x() + xOffest,
      y: this.y() + yOffest,
      w: innerDims.w(),
      h: innerDims.h(),
    });
  }
}
