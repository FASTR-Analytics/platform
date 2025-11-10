// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Coordinates } from "./coordinates.ts";
import type { Padding } from "./padding.ts";
import { RectCoordsDims } from "./rect_coords_dims.ts";

export type DimensionsOptions =
  | {
    w: number;
    h: number;
  }
  | {
    width: number;
    height: number;
  }
  | number[];

export class Dimensions {
  private _w: number;
  private _h: number;

  constructor(dims: Dimensions | DimensionsOptions) {
    if (dims instanceof Dimensions) {
      this._w = dims.w();
      this._h = dims.h();
      return;
    }
    if (dims instanceof Array) {
      if (dims.length === 2) {
        this._w = dims[0];
        this._h = dims[1];
        return;
      }
      throw new Error("Bad inputs for Dimensions constructor");
    }
    if (typeof dims === "object") {
      if (
        (
            dims as {
              w: number;
            }
          ).w !== undefined &&
        (
            dims as {
              h: number;
            }
          ).h !== undefined
      ) {
        this._w = (
          dims as {
            w: number;
          }
        ).w;
        this._h = (
          dims as {
            h: number;
          }
        ).h;
        return;
      }
      if (
        (
            dims as {
              width: number;
            }
          ).width !== undefined &&
        (
            dims as {
              height: number;
            }
          ).height !== undefined
      ) {
        this._w = (
          dims as {
            width: number;
          }
        ).width;
        this._h = (
          dims as {
            height: number;
          }
        ).height;
        return;
      }
    }
    throw new Error("Bad inputs for Dimensions constructor");
  }

  w(): number {
    return this._w;
  }

  h(): number {
    return this._h;
  }

  asArray(): [number, number] {
    return [this._w, this._h];
  }

  asObject(): {
    w: number;
    h: number;
  } {
    return { w: this._w, h: this._h };
  }

  asRectCoordsDims(coords: Coordinates): RectCoordsDims {
    return new RectCoordsDims({
      x: coords.x(),
      y: coords.y(),
      w: this._w,
      h: this._h,
    });
  }

  getTransposed(transpose?: boolean): Dimensions {
    if (transpose === false) {
      return new Dimensions({ w: this._w, h: this._h });
    } else {
      return new Dimensions({ w: this._h, h: this._w });
    }
  }

  getPadded(pad: Padding): Dimensions {
    return new Dimensions({
      w: this._w - pad.totalPx(),
      h: this._h - pad.totalPy(),
    });
  }

  getHeightToWidthRatio(): number {
    return this._h / this._w;
  }

  getWidthToHeightRatio(): number {
    return this._w / this._h;
  }
}
