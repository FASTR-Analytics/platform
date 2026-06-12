// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  assertNumberBetween0And1,
  clamp,
  createArray,
  divideOrZero,
  normalizeTo01,
} from "./deps.ts";
import type {
  ContinuousScaleConfig,
  ScaleConfig,
} from "./color_scale_funcs.ts";
import { resolveScale } from "./palettes.ts";

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
const _REGEX_OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

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
  // Remaining standard CSS named colors (the entries above keep their
  // long-standing panther values, e.g. green stays #00ff00).
  aliceblue: { r: 240, g: 248, b: 255, a: 1 },
  antiquewhite: { r: 250, g: 235, b: 215, a: 1 },
  aqua: { r: 0, g: 255, b: 255, a: 1 },
  aquamarine: { r: 127, g: 255, b: 212, a: 1 },
  azure: { r: 240, g: 255, b: 255, a: 1 },
  beige: { r: 245, g: 245, b: 220, a: 1 },
  bisque: { r: 255, g: 228, b: 196, a: 1 },
  blanchedalmond: { r: 255, g: 235, b: 205, a: 1 },
  blueviolet: { r: 138, g: 43, b: 226, a: 1 },
  brown: { r: 165, g: 42, b: 42, a: 1 },
  burlywood: { r: 222, g: 184, b: 135, a: 1 },
  cadetblue: { r: 95, g: 158, b: 160, a: 1 },
  chartreuse: { r: 127, g: 255, b: 0, a: 1 },
  chocolate: { r: 210, g: 105, b: 30, a: 1 },
  coral: { r: 255, g: 127, b: 80, a: 1 },
  cornflowerblue: { r: 100, g: 149, b: 237, a: 1 },
  cornsilk: { r: 255, g: 248, b: 220, a: 1 },
  crimson: { r: 220, g: 20, b: 60, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  darkblue: { r: 0, g: 0, b: 139, a: 1 },
  darkcyan: { r: 0, g: 139, b: 139, a: 1 },
  darkgoldenrod: { r: 184, g: 134, b: 11, a: 1 },
  darkgray: { r: 169, g: 169, b: 169, a: 1 },
  darkgreen: { r: 0, g: 100, b: 0, a: 1 },
  darkgrey: { r: 169, g: 169, b: 169, a: 1 },
  darkkhaki: { r: 189, g: 183, b: 107, a: 1 },
  darkmagenta: { r: 139, g: 0, b: 139, a: 1 },
  darkolivegreen: { r: 85, g: 107, b: 47, a: 1 },
  darkorange: { r: 255, g: 140, b: 0, a: 1 },
  darkorchid: { r: 153, g: 50, b: 204, a: 1 },
  darkred: { r: 139, g: 0, b: 0, a: 1 },
  darksalmon: { r: 233, g: 150, b: 122, a: 1 },
  darkseagreen: { r: 143, g: 188, b: 143, a: 1 },
  darkslateblue: { r: 72, g: 61, b: 139, a: 1 },
  darkslategray: { r: 47, g: 79, b: 79, a: 1 },
  darkslategrey: { r: 47, g: 79, b: 79, a: 1 },
  darkturquoise: { r: 0, g: 206, b: 209, a: 1 },
  darkviolet: { r: 148, g: 0, b: 211, a: 1 },
  deeppink: { r: 255, g: 20, b: 147, a: 1 },
  deepskyblue: { r: 0, g: 191, b: 255, a: 1 },
  dimgray: { r: 105, g: 105, b: 105, a: 1 },
  dimgrey: { r: 105, g: 105, b: 105, a: 1 },
  dodgerblue: { r: 30, g: 144, b: 255, a: 1 },
  firebrick: { r: 178, g: 34, b: 34, a: 1 },
  floralwhite: { r: 255, g: 250, b: 240, a: 1 },
  forestgreen: { r: 34, g: 139, b: 34, a: 1 },
  fuchsia: { r: 255, g: 0, b: 255, a: 1 },
  gainsboro: { r: 220, g: 220, b: 220, a: 1 },
  ghostwhite: { r: 248, g: 248, b: 255, a: 1 },
  gold: { r: 255, g: 215, b: 0, a: 1 },
  goldenrod: { r: 218, g: 165, b: 32, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  greenyellow: { r: 173, g: 255, b: 47, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  honeydew: { r: 240, g: 255, b: 240, a: 1 },
  hotpink: { r: 255, g: 105, b: 180, a: 1 },
  indianred: { r: 205, g: 92, b: 92, a: 1 },
  indigo: { r: 75, g: 0, b: 130, a: 1 },
  ivory: { r: 255, g: 255, b: 240, a: 1 },
  khaki: { r: 240, g: 230, b: 140, a: 1 },
  lavender: { r: 230, g: 230, b: 250, a: 1 },
  lavenderblush: { r: 255, g: 240, b: 245, a: 1 },
  lawngreen: { r: 124, g: 252, b: 0, a: 1 },
  lemonchiffon: { r: 255, g: 250, b: 205, a: 1 },
  lightcoral: { r: 240, g: 128, b: 128, a: 1 },
  lightcyan: { r: 224, g: 255, b: 255, a: 1 },
  lightgoldenrodyellow: { r: 250, g: 250, b: 210, a: 1 },
  lightgray: { r: 211, g: 211, b: 211, a: 1 },
  lightgrey: { r: 211, g: 211, b: 211, a: 1 },
  lightpink: { r: 255, g: 182, b: 193, a: 1 },
  lightsalmon: { r: 255, g: 160, b: 122, a: 1 },
  lightseagreen: { r: 32, g: 178, b: 170, a: 1 },
  lightskyblue: { r: 135, g: 206, b: 250, a: 1 },
  lightslategray: { r: 119, g: 136, b: 153, a: 1 },
  lightslategrey: { r: 119, g: 136, b: 153, a: 1 },
  lightsteelblue: { r: 176, g: 196, b: 222, a: 1 },
  lightyellow: { r: 255, g: 255, b: 224, a: 1 },
  lime: { r: 0, g: 255, b: 0, a: 1 },
  limegreen: { r: 50, g: 205, b: 50, a: 1 },
  linen: { r: 250, g: 240, b: 230, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  maroon: { r: 128, g: 0, b: 0, a: 1 },
  mediumaquamarine: { r: 102, g: 205, b: 170, a: 1 },
  mediumblue: { r: 0, g: 0, b: 205, a: 1 },
  mediumorchid: { r: 186, g: 85, b: 211, a: 1 },
  mediumpurple: { r: 147, g: 112, b: 219, a: 1 },
  mediumseagreen: { r: 60, g: 179, b: 113, a: 1 },
  mediumslateblue: { r: 123, g: 104, b: 238, a: 1 },
  mediumspringgreen: { r: 0, g: 250, b: 154, a: 1 },
  mediumturquoise: { r: 72, g: 209, b: 204, a: 1 },
  mediumvioletred: { r: 199, g: 21, b: 133, a: 1 },
  midnightblue: { r: 25, g: 25, b: 112, a: 1 },
  mintcream: { r: 245, g: 255, b: 250, a: 1 },
  mistyrose: { r: 255, g: 228, b: 225, a: 1 },
  moccasin: { r: 255, g: 228, b: 181, a: 1 },
  navajowhite: { r: 255, g: 222, b: 173, a: 1 },
  navy: { r: 0, g: 0, b: 128, a: 1 },
  oldlace: { r: 253, g: 245, b: 230, a: 1 },
  olive: { r: 128, g: 128, b: 0, a: 1 },
  olivedrab: { r: 107, g: 142, b: 35, a: 1 },
  orangered: { r: 255, g: 69, b: 0, a: 1 },
  orchid: { r: 218, g: 112, b: 214, a: 1 },
  palegoldenrod: { r: 238, g: 232, b: 170, a: 1 },
  palegreen: { r: 152, g: 251, b: 152, a: 1 },
  paleturquoise: { r: 175, g: 238, b: 238, a: 1 },
  palevioletred: { r: 219, g: 112, b: 147, a: 1 },
  papayawhip: { r: 255, g: 239, b: 213, a: 1 },
  peachpuff: { r: 255, g: 218, b: 185, a: 1 },
  peru: { r: 205, g: 133, b: 63, a: 1 },
  pink: { r: 255, g: 192, b: 203, a: 1 },
  plum: { r: 221, g: 160, b: 221, a: 1 },
  powderblue: { r: 176, g: 224, b: 230, a: 1 },
  rebeccapurple: { r: 102, g: 51, b: 153, a: 1 },
  rosybrown: { r: 188, g: 143, b: 143, a: 1 },
  royalblue: { r: 65, g: 105, b: 225, a: 1 },
  saddlebrown: { r: 139, g: 69, b: 19, a: 1 },
  salmon: { r: 250, g: 128, b: 114, a: 1 },
  sandybrown: { r: 244, g: 164, b: 96, a: 1 },
  seagreen: { r: 46, g: 139, b: 87, a: 1 },
  seashell: { r: 255, g: 245, b: 238, a: 1 },
  sienna: { r: 160, g: 82, b: 45, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  skyblue: { r: 135, g: 206, b: 235, a: 1 },
  slateblue: { r: 106, g: 90, b: 205, a: 1 },
  slategray: { r: 112, g: 128, b: 144, a: 1 },
  slategrey: { r: 112, g: 128, b: 144, a: 1 },
  snow: { r: 255, g: 250, b: 250, a: 1 },
  springgreen: { r: 0, g: 255, b: 127, a: 1 },
  steelblue: { r: 70, g: 130, b: 180, a: 1 },
  tan: { r: 210, g: 180, b: 140, a: 1 },
  teal: { r: 0, g: 128, b: 128, a: 1 },
  thistle: { r: 216, g: 191, b: 216, a: 1 },
  turquoise: { r: 64, g: 224, b: 208, a: 1 },
  violet: { r: 238, g: 130, b: 238, a: 1 },
  wheat: { r: 245, g: 222, b: 179, a: 1 },
  whitesmoke: { r: 245, g: 245, b: 245, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  yellowgreen: { r: 154, g: 205, b: 50, a: 1 },
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
      this._r = clamp(Math.round(opts[0]), 0, 255);
      this._g = clamp(Math.round(opts[1]), 0, 255);
      this._b = clamp(Math.round(opts[2]), 0, 255);
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
      this._r = clamp(Math.round(opts.r), 0, 255);
      this._g = clamp(Math.round(opts.g), 0, 255);
      this._b = clamp(Math.round(opts.b), 0, 255);
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

  hexNoHash(): string {
    let r = this._r.toString(16);
    let g = this._g.toString(16);
    let b = this._b.toString(16);
    if (r.length == 1) r = "0" + r;
    if (g.length == 1) g = "0" + g;
    if (b.length == 1) b = "0" + b;
    return r + g + b;
  }

  MUTATE_setRgb(rgb: ColorRgb): void {
    this._r = clamp(Math.round(rgb.r), 0, 255);
    this._g = clamp(Math.round(rgb.g), 0, 255);
    this._b = clamp(Math.round(rgb.b), 0, 255);
  }

  MUTATE_multiplyOpacity(opacity: number): void {
    assertNumberBetween0And1(
      opacity,
      "Opacity must be a number between 0 and 1",
    );
    this._a = opacity * this._a;
  }

  opacity(opacity: number): Color {
    const n = this.copy();
    n.MUTATE_multiplyOpacity(opacity);
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

  MUTATE_desaturate(amount0To1: number): void {
    const { l, s, h } = this.hsl();
    const rgb = new Color({ h, s: s * (1 - amount0To1), l }).rgb();
    this.MUTATE_setRgb(rgb);
  }

  desaturate(amount0To1: number): Color {
    const n = this.copy();
    n.MUTATE_desaturate(amount0To1);
    return n;
  }

  MUTATE_tint(amount0To1: number): void {
    this._r = Math.round(this._r + (255 - this._r) * amount0To1);
    this._g = Math.round(this._g + (255 - this._g) * amount0To1);
    this._b = Math.round(this._b + (255 - this._b) * amount0To1);
  }

  tint(amount0To1: number): Color {
    const n = this.copy();
    n.MUTATE_tint(amount0To1);
    return n;
  }

  MUTATE_tone(amount0To1: number): void {
    this._r = Math.round(this._r + (128 - this._r) * amount0To1);
    this._g = Math.round(this._g + (128 - this._g) * amount0To1);
    this._b = Math.round(this._b + (128 - this._b) * amount0To1);
  }

  tone(amount0To1: number): Color {
    const n = this.copy();
    n.MUTATE_tone(amount0To1);
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

  luminance(): number {
    const rsRGB = this._r / 255;
    const gsRGB = this._g / 255;
    const bsRGB = this._b / 255;
    const r = rsRGB <= 0.03928
      ? rsRGB / 12.92
      : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928
      ? gsRGB / 12.92
      : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928
      ? bsRGB / 12.92
      : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  isLight(): boolean {
    return this.luminance() > 0.179;
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

  static scaleContinuous(
    config: ContinuousScaleConfig,
    val: number,
    min?: number,
    max?: number,
  ): string {
    const { stops, category } = resolveScale(config);
    if (category === "qualitative") {
      throw new Error(
        "Cannot use scaleContinuous with a qualitative palette. Use scaleDiscrete instead.",
      );
    }
    if (stops.length === 1) {
      return stops[0];
    }
    const lo = min ?? 0;
    const hi = max ?? 1;
    const t = lo === hi ? 0.5 : normalizeTo01(val, lo, hi);
    const nSegments = stops.length - 1;
    if (t >= 1) return stops[stops.length - 1];
    const segmentIndex = Math.floor(t * nSegments);
    const segmentT = t * nSegments - segmentIndex;
    return Color.scaledPct(
      stops[segmentIndex],
      stops[segmentIndex + 1],
      segmentT,
    );
  }

  static scaleDiscrete(
    config: ScaleConfig,
    index: number,
    n?: number,
  ): string {
    const { stops, category } = resolveScale(config);
    const i = clamp(index, 0, n !== undefined ? n - 1 : stops.length - 1);
    if (category === "qualitative") {
      return stops[i % stops.length];
    }
    if (stops.length === 1) {
      return stops[0];
    }
    const count = n ?? stops.length;
    const t = count > 1 ? i / (count - 1) : 0.5;
    const nSegments = stops.length - 1;
    if (t >= 1) return stops[stops.length - 1];
    const segmentIndex = Math.floor(t * nSegments);
    const segmentT = t * nSegments - segmentIndex;
    return Color.scaledPct(
      stops[segmentIndex],
      stops[segmentIndex + 1],
      segmentT,
    );
  }

  // ================================================================================
  // STATIC CONV
  // ================================================================================

  static toHexNoHash(color: ColorOptions): string {
    return new Color(color).hexNoHash();
  }

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
    const oklchMatch = str.match(_REGEX_OKLCH);
    if (oklchMatch) {
      const rgb = Color.oklchToRgb({
        l: parseFloat(oklchMatch[1]),
        c: parseFloat(oklchMatch[2]),
        h: parseFloat(oklchMatch[3]),
      });
      return { ...rgb, a: 1 };
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
    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);
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

    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);

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

  static oklchToRgb(oklch: ColorLch): ColorRgb {
    const { l: L, c: C, h: H } = oklch;
    const hRad = H * Math.PI / 180;
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const gamma = (x: number) =>
      x >= 0.0031308 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : 12.92 * x;
    r = clamp(Math.round(gamma(r) * 255), 0, 255);
    g = clamp(Math.round(gamma(g) * 255), 0, 255);
    bl = clamp(Math.round(gamma(bl) * 255), 0, 255);
    return { r, g, b: bl };
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
