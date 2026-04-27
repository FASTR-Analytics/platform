// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, AlignV, LogosSizing } from "./deps.ts";

export type LogosInput<T extends { width: number; height: number }> = {
  images: T[];
  style: LogosSizing;
  alignH: AlignH;
  alignV: AlignV;
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
