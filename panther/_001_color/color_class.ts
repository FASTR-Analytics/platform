// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  assertNumberBetween0And1,
  createArray,
  divideOrZero,
} from "./deps.ts";

export type ColorRgb = {
  r: number;
  g: number;
  b: number;
};

export type ColorRgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type ColorHsl = {
  h: number;
  s: number;
  l: number;
};

export type ColorXyz = {
  x: number;
  y: number;
  z: number;
};

export type ColorLab = {
  l: number;
  a: number;
  b: number;
};

export type ColorLch = {
  l: number;
  c: number;
  h: number;
};

// From https://css-tricks.com/converting-color-spaces-in-javascript/
const _REGEX_RGB =
  /^rgb\((((((((1?[1-9]?\d)|10\d|(2[0-4]\d)|25[0-5]),\s?)){2}|((((1?[1-9]?\d)|10\d|(2[0-4]\d)|25[0-5])\s)){2})((1?[1-9]?\d)|10\d|(2[0-4]\d)|25[0-5]))|((((([1-9]?\d(\.\d+)?)|100|(\.\d+))%,\s?){2}|((([1-9]?\d(\.\d+)?)|100|(\.\d+))%\s){2})(([1-9]?\d(\.\d+)?)|100|(\.\d+))%))\)$/i;
const _REGEX_RGBA =
  /^rgba\((((((((1?[1-9]?\d)|10\d|(2[0-4]\d)|25[0-5]),\s?)){3})|(((([1-9]?\d(\.\d+)?)|100|(\.\d+))%,\s?){3}))|(((((1?[1-9]?\d)|10\d|(2[0-4]\d)|25[0-5])\s){3})|(((([1-9]?\d(\.\d+)?)|100|(\.\d+))%\s){3}))\/\s)((0?\.\d+)|[01]|(([1-9]?\d(\.\d+)?)|100|(\.\d+))%)\)$/i;
const _REGEX_HEX = /^#([\da-f]{3}){1,2}$/i;
const _REGEX_HEX_ALPHA = /^#([\da-f]{4}){1,2}$/i;

const _NAMED_COLORS: Record<string, ColorRgba> = {
  //
  transparent: { r: 255, g: 255, b: 255, a: 0 },
  //
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  //
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 255, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  //
  tomato: { r: 255, g: 99, b: 71, a: 1 },
  lightgreen: { r: 144, g: 238, b: 144, a: 1 },
  lightblue: { r: 173, g: 216, b: 230, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
};

export type ColorOptions =
  | ColorRgb
  | ColorRgba
  | ColorHsl
  | ColorLch
  | Color
  | string
  | number[];

export class Color {
  private _r: number;
  private _g: number;
  private _b: number;
  private _a: number;

  // ================================================================================
  // CONSTRUCTOR
  // ================================================================================

  constructor(opts: ColorOptions) {
    if (opts instanceof Color) {
      this._r = opts._r;
      this._g = opts._g;
      this._b = opts._b;
      this._a = opts._a;
      this.validate();
      return;
    }
    if (opts instanceof Array) {
      assert(opts.length === 3 || opts.length === 4, "Bad array for color");
      this._r = opts[0];
      this._g = opts[1];
      this._b = opts[2];
      this._a = opts[3] ?? 1;
      this.validate();
      return;
    }
    if (typeof opts === "string") {
      const rgba = Color.strToRgba(opts);
      this._r = rgba.r;
      this._g = rgba.g;
      this._b = rgba.b;
      this._a = rgba.a;
      this.validate();
      return;
    }
    if (Color.isRgb(opts)) {
      this._r = opts.r;
      this._g = opts.g;
      this._b = opts.b;
      this._a = (opts as ColorRgba).a ?? 1;
      this.validate();
      return;
    }
    if (Color.isLch(opts)) {
      const rgb = Color.lchToRgb(opts);
      this._r = rgb.r;
      this._g = rgb.g;
      this._b = rgb.b;
      this._a = 1;
      this.validate();
      return;
    }
    if (Color.isHsl(opts)) {
      const rgb = Color.hslToRgb(opts);
      this._r = rgb.r;
      this._g = rgb.g;
      this._b = rgb.b;
      this._a = 1;
      this.validate();
      return;
    }
    throw new Error("Bad options for color constructor");
  }

  copy(): Color {
    return new Color(this);
  }

  rgb(): ColorRgb {
    return { r: this._r, g: this._g, b: this._b };
  }

  rgba(): ColorRgba {
    return { r: this._r, g: this._g, b: this._b, a: this._a };
  }

  hsl(): ColorHsl {
    return Color.rgbToHsl({ r: this._r, g: this._g, b: this._b });
  }

  lch(): ColorLch {
    return Color.rgbToLch({ r: this._r, g: this._g, b: this._b });
  }

  css(): string {
    if (this._a === 1) {
      let r = this._r.toString(16);
      let g = this._g.toString(16);
      let b = this._b.toString(16);
      if (r.length == 1) r = "0" + r;
      if (g.length == 1) g = "0" + g;
      if (b.length == 1) b = "0" + b;
      return "#" + r + g + b;
    }
    return `rgba(${this._r.toFixed(0)},${this._g.toFixed(0)},${
      this._b.toFixed(
        0,
      )
    },${this._a.toFixed(3)})`;
  }

  MUTATE_setRgb(rgb: ColorRgb): void {
    this._r = rgb.r;
    this._g = rgb.g;
    this._b = rgb.b;
  }

  MUTATE_opacity(opacity: number): void {
    assertNumberBetween0And1(
      opacity,
      "Opacity must be a number between 0 and 1",
    );
    this._a = opacity * this._a;
  }

  opacity(opacity: number): Color {
    const n = this.copy();
    n.MUTATE_opacity(opacity);
    return n;
  }

  MUTATE_lighten(amount0To1: number): void {
    const { l: ol, s, h } = this.hsl();
    const rgb = new Color({ h, s, l: ol + (100 - ol) * amount0To1 }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  lighten(amount0To1: number): Color {
    const n = this.copy();
    n.MUTATE_lighten(amount0To1);
    return n;
  }

  MUTATE_darken(amount0To1: number): void {
    const { l: ol, s, h } = this.hsl();
    const rgb = new Color({ h, s, l: ol * (1 - amount0To1) }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  darken(amount0To1: number): Color {
    const n = this.copy();
    n.MUTATE_darken(amount0To1);
    return n;
  }

  MUTATE_rotateHue(rot360: number): void {
    const { l, c, h: oh } = this.lch();
    const rgb = new Color({ l, c, h: (oh + rot360) % 360 }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  rotateHue(rot360: number): Color {
    const n = this.copy();
    n.MUTATE_rotateHue(rot360);
    return n;
  }

  MUTATE_matchHue(colorOpts: ColorOptions): void {
    const hueColor = new Color(colorOpts);
    if (hueColor.isBlack() || hueColor.isWhite()) {
      return;
    }
    const { h } = hueColor.lch();
    const { l, c } = this.lch();
    const rgb = new Color({ l, c, h }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  matchHue(colorOpts: ColorOptions): Color {
    const n = this.copy();
    n.MUTATE_matchHue(colorOpts);
    return n;
  }

  MUTATE_rotateHueHsl(rot360: number): void {
    const { h: oh, s, l } = this.hsl();
    const rgb = new Color({ h: (oh + rot360) % 360, s, l }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  rotateHueHsl(rot360: number): Color {
    const n = this.copy();
    n.MUTATE_rotateHueHsl(rot360);
    return n;
  }

  MUTATE_matchHueHsl(colorOpts: ColorOptions): void {
    const hueColor = new Color(colorOpts);
    if (hueColor.isBlack() || hueColor.isWhite()) {
      return;
    }
    const { h } = hueColor.hsl();
    const { s, l } = this.hsl();
    const rgb = new Color({ h, s, l }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  matchHueHsl(colorOpts: ColorOptions): Color {
    const n = this.copy();
    n.MUTATE_matchHueHsl(colorOpts);
    return n;
  }

  isWhite(): boolean {
    return this._r === 255 && this._g === 255 && this._b === 255;
  }

  isBlack(): boolean {
    return this._r === 0 && this._g === 0 && this._b === 0;
  }

  validate(): void {
    assert(typeof this._r === "number" && this._r >= 0 && this._r <= 255);
    assert(typeof this._g === "number" && this._g >= 0 && this._g <= 255);
    assert(typeof this._b === "number" && this._b >= 0 && this._b <= 255);
    assert(typeof this._a === "number" && this._a >= 0 && this._a <= 1);
  }

  // ================================================================================
  // STATIC
  // ================================================================================

  static scale(a: ColorOptions, b: ColorOptions, n: number): string[] {
    assert(n >= 1, "Scale n must be at least one");
    const func = Color.scaleFunc(a, b);
    return createArray(n, (i) => {
      const pct = divideOrZero(i, n - 1);
      return func(pct);
    });
  }

  static scaleFunc(a: ColorOptions, b: ColorOptions): (pct: number) => string {
    const ca = new Color(a);
    const cb = new Color(b);
    const caLch = ca.isWhite()
      ? { l: 100, c: 0, h: cb.lch().h }
      : ca.isBlack()
      ? { l: 0, c: 0, h: cb.lch().h }
      : ca.lch();
    const cbLch = cb.isWhite()
      ? { l: 100, c: 0, h: ca.lch().h }
      : cb.isBlack()
      ? { l: 0, c: 0, h: ca.lch().h }
      : cb.lch();
    const { l: al, c: ac, h: ah } = caLch;
    const { l: bl, c: bc, h: bh } = cbLch;
    if (Math.abs(bh - ah) <= 180) {
      return (pct: number) => {
        return new Color({
          l: al + pct * (bl - al),
          c: ac + pct * (bc - ac),
          h: ah + pct * (bh - ah),
        }).css();
      };
    } else {
      return (pct: number) => {
        return new Color({
          l: al + pct * (bl - al),
          c: ac + pct * (bc - ac),
          h: (ah - pct * (ah - (bh - 360)) + 360) % 360,
        }).css();
      };
    }
  }

  static scaledPct(a: ColorOptions, b: ColorOptions, pct: number): string {
    const ca = new Color(a);
    const cb = new Color(b);
    const caLch = ca.isWhite()
      ? { l: 100, c: 0, h: cb.lch().h }
      : ca.isBlack()
      ? { l: 0, c: 0, h: cb.lch().h }
      : ca.lch();
    const cbLch = cb.isWhite()
      ? { l: 100, c: 0, h: ca.lch().h }
      : cb.isBlack()
      ? { l: 0, c: 0, h: ca.lch().h }
      : cb.lch();
    const { l: al, c: ac, h: ah } = caLch;
    const { l: bl, c: bc, h: bh } = cbLch;
    if (Math.abs(bh - ah) <= 180) {
      return new Color({
        l: al + pct * (bl - al),
        c: ac + pct * (bc - ac),
        h: ah + pct * (bh - ah),
      }).css();
    } else {
      return new Color({
        l: al + pct * (bl - al),
        c: ac + pct * (bc - ac),
        h: (ah - pct * (ah - (bh - 360)) + 360) % 360,
      }).css();
    }
  }

  static qualScale(a: ColorOptions, n: number, rot360?: number): string[] {
    assert(n >= 1, "Scale n must be at least one");
    const incr = divideOrZero(rot360 ?? 360, n);
    const { l, c, h: oh } = new Color(a).lch();
    return createArray(n, (i) => {
      return new Color({ l, c, h: (360 + oh + i * incr) % 360 }).css();
    });
  }

  static qualScaleHsl(a: ColorOptions, n: number, rot360?: number): string[] {
    assert(n >= 1, "Scale n must be at least one");
    const incr = divideOrZero(rot360 ?? 360, n);
    const { h: oh, s, l } = new Color(a).hsl();
    return createArray(n, (i) => {
      return new Color({ h: (360 + oh + i * incr) % 360, s, l }).css();
    });
  }

  // ================================================================================
  // STATIC CONV
  // ================================================================================

  static strToRgba(str: string): ColorRgba {
    if (_REGEX_HEX.test(str)) {
      if (str.length == 4) {
        const r = parseInt(str[1] + str[1], 16);
        const g = parseInt(str[2] + str[2], 16);
        const b = parseInt(str[3] + str[3], 16);
        return { r, g, b, a: 1 };
      }
      if (str.length == 7) {
        const r = parseInt(str[1] + str[2], 16);
        const g = parseInt(str[3] + str[4], 16);
        const b = parseInt(str[5] + str[6], 16);
        return { r, g, b, a: 1 };
      }
    }
    if (_REGEX_HEX_ALPHA.test(str)) {
      if (str.length == 5) {
        const r = parseInt(str[1] + str[1], 16);
        const g = parseInt(str[2] + str[2], 16);
        const b = parseInt(str[3] + str[3], 16);
        const a = parseInt(str[4] + str[4], 16) / 255;
        return { r, g, b, a };
      }
      if (str.length == 9) {
        const r = parseInt(str[1] + str[2], 16);
        const g = parseInt(str[3] + str[4], 16);
        const b = parseInt(str[5] + str[6], 16);
        const a = parseInt(str[7] + str[8], 16) / 255;
        return { r, g, b, a };
      }
    }
    if (_REGEX_RGB.test(str)) {
      const sep = str.indexOf(",") > -1 ? "," : " ";
      const arr = str.substring(4).split(")")[0].split(sep);
      const r = Number(arr[0]);
      const g = Number(arr[1]);
      const b = Number(arr[2]);
      return { r, g, b, a: 1 };
    }
    if (_REGEX_RGBA.test(str)) {
      const sep = str.indexOf(",") > -1 ? "," : " ";
      const arr = str.substring(5).split(")")[0].split(sep);
      const r = Number(arr[0]);
      const g = Number(arr[1]);
      const b = Number(arr[2]);
      const a = Number(arr[3]);
      return { r, g, b, a };
    }
    if (_NAMED_COLORS[str]) {
      return _NAMED_COLORS[str];
    }
    throw new Error("Bad string for color: " + str);
  }

  static rgbToHsl(rgb: ColorRgb): ColorHsl {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;
    if (max == min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    h *= 360;
    s *= 100;
    l *= 100;
    return { h, s, l };
  }

  static hslToRgb(hsl: ColorHsl): ColorRgb {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;
    let r, g, b;
    if (s == 0) {
      r = g = b = l; // achromatic
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = this.hue2rgb(p, q, h + 1 / 3);
      g = this.hue2rgb(p, q, h);
      b = this.hue2rgb(p, q, h - 1 / 3);
    }
    r *= 255;
    g *= 255;
    b *= 255;
    r = Math.max(0, Math.min(255, Math.round(r))); // Tim added this to clamp appropriately
    g = Math.max(0, Math.min(255, Math.round(g))); // Tim added this to clamp appropriately
    b = Math.max(0, Math.min(255, Math.round(b))); // Tim added this to clamp appropriately
    return { r, g, b };
  }

  static hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  static rgbToXyz(rgb: ColorRgb): ColorXyz {
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    if (r > 0.04045) {
      r = Math.pow((r + 0.055) / 1.055, 2.4);
    } else {
      r = r / 12.92;
    }

    if (g > 0.04045) {
      g = Math.pow((g + 0.055) / 1.055, 2.4);
    } else {
      g = g / 12.92;
    }

    if (b > 0.04045) {
      b = Math.pow((b + 0.055) / 1.055, 2.4);
    } else {
      b = b / 12.92;
    }

    r *= 100;
    g *= 100;
    b *= 100;

    // Observer = 2°, Illuminant = D65
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    return { x, y, z };
  }

  static xyzToLab(xyz: ColorXyz): ColorLab {
    // Observer = 2°, Illuminant = D65
    let x = xyz.x / 95.047;
    let y = xyz.y / 100.0;
    let z = xyz.z / 108.883;

    if (x > 0.008856) {
      x = Math.pow(x, 0.333333333);
    } else {
      x = 7.787 * x + 0.137931034;
    }

    if (y > 0.008856) {
      y = Math.pow(y, 0.333333333);
    } else {
      y = 7.787 * y + 0.137931034;
    }

    if (z > 0.008856) {
      z = Math.pow(z, 0.333333333);
    } else {
      z = 7.787 * z + 0.137931034;
    }

    const l = 116 * y - 16;
    const a = 500 * (x - y);
    const b = 200 * (y - z);

    return { l, a, b };
  }

  static labToLch(lab: ColorLab): ColorLch {
    const { l, a, b } = lab;

    const c = Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2));

    let h = Math.atan2(b, a); //Quadrant by signs
    if (h > 0) {
      h = (h / Math.PI) * 180;
    } else {
      h = 360 - (Math.abs(h) / Math.PI) * 180;
    }

    return { l, c, h };
  }

  static lchToLab(lch: ColorLch): ColorLab {
    const { l, c, h } = lch;

    const a = Math.cos(h * 0.01745329251) * c;
    const b = Math.sin(h * 0.01745329251) * c;

    return { l, a, b };
  }

  static labToXyz(lab: ColorLab): ColorXyz {
    const { l, a, b } = lab;

    let y = (l + 16) / 116;
    let x = a / 500 + y;
    let z = y - b / 200;

    if (Math.pow(y, 3) > 0.008856) {
      y = Math.pow(y, 3);
    } else {
      y = (y - 0.137931034) / 7.787;
    }

    if (Math.pow(x, 3) > 0.008856) {
      x = Math.pow(x, 3);
    } else {
      x = (x - 0.137931034) / 7.787;
    }

    if (Math.pow(z, 3) > 0.008856) {
      z = Math.pow(z, 3);
    } else {
      z = (z - 0.137931034) / 7.787;
    }

    // Observer = 2°, Illuminant = D65
    x = 95.047 * x;
    y = 100.0 * y;
    z = 108.883 * z;

    return { x, y, z };
  }

  static xyzToRgb(xyz: ColorXyz): ColorRgb {
    // Observer = 2°, Illuminant = D65
    const x = xyz.x / 100; // X from 0 to 95.047
    const y = xyz.y / 100; // Y from 0 to 100.000
    const z = xyz.z / 100; // Z from 0 to 108.883

    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let b = x * 0.0557 + y * -0.204 + z * 1.057;

    if (r > 0.0031308) {
      r = 1.055 * Math.pow(r, 0.41666667) - 0.055;
    } else {
      r = 12.92 * r;
    }

    if (g > 0.0031308) {
      g = 1.055 * Math.pow(g, 0.41666667) - 0.055;
    } else {
      g = 12.92 * g;
    }

    if (b > 0.0031308) {
      b = 1.055 * Math.pow(b, 0.41666667) - 0.055;
    } else {
      b = 12.92 * b;
    }

    r *= 255;
    g *= 255;
    b *= 255;

    r = Math.max(0, Math.min(255, Math.round(r))); // Tim added this to clamp appropriately
    g = Math.max(0, Math.min(255, Math.round(g))); // Tim added this to clamp appropriately
    b = Math.max(0, Math.min(255, Math.round(b))); // Tim added this to clamp appropriately

    return { r, g, b };
  }

  static rgbToLch(rgb: ColorRgb): ColorLch {
    const xyz = Color.rgbToXyz(rgb);
    const lab = Color.xyzToLab(xyz);
    const lch = Color.labToLch(lab);
    return lch;
  }

  static lchToRgb(lch: ColorLch): ColorRgb {
    const lab = Color.lchToLab(lch);
    const xyz = Color.labToXyz(lab);
    const rgb = Color.xyzToRgb(xyz);
    return rgb;
  }

  // ================================================================================
  // STATIC ASSERT
  // ================================================================================

  static isRgb(c: ColorOptions): c is ColorRgb | ColorRgba {
    return (
      (c as ColorRgb).r !== undefined &&
      (c as ColorRgb).g !== undefined &&
      (c as ColorRgb).b !== undefined
    );
  }

  static isHsl(c: ColorOptions): c is ColorHsl {
    return (
      (c as ColorHsl).h !== undefined &&
      (c as ColorHsl).s !== undefined &&
      (c as ColorHsl).l !== undefined
    );
  }

  static isLch(c: ColorOptions): c is ColorLch {
    return (
      (c as ColorLch).l !== undefined &&
      (c as ColorLch).c !== undefined &&
      (c as ColorLch).h !== undefined
    );
  }
}
