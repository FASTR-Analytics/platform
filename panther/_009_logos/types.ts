// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, AlignV, LogosSizing } from "./deps.ts";

export type LogosInput<T extends { width: number; height: number }> = {
  images: T[];
  // style.maxWidth caps each logo.
  style: LogosSizing;
  alignH: AlignH;
  alignV: AlignV;
  // The widest the row may be, its bounds' width when absent. A wider row
  // shrinks to it by one factor, logos and gaps alike, and never grows.
  rowMaxWidth?: number;
};

export type MeasuredLogo<T extends { width: number; height: number }> = {
  image: T;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MeasuredLogos<T extends { width: number; height: number }> = {
  items: MeasuredLogo<T>[];
  totalWidth: number;
  totalHeight: number;
};
