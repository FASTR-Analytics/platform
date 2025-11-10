// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Dimensions, TextInfoUnkeyed } from "./deps.ts";

export type RichTextSegment = {
  text: string;
  style?: {
    bold?: boolean;
    italic?: boolean;
  };
};

export type RichText = {
  segments: RichTextSegment[];
  baseStyle: TextInfoUnkeyed;
};

export type MeasuredRichTextSegment = {
  text: string;
  x: number;
  w: number;
  ti: TextInfoUnkeyed;
};

export type MeasuredRichTextLine = {
  segments: MeasuredRichTextSegment[];
  y: number;
  totalWidth: number;
};

export type MeasuredRichText = {
  lines: MeasuredRichTextLine[];
  dims: Dimensions;
  baseStyle: TextInfoUnkeyed;
  rotation: "horizontal" | "anticlockwise" | "clockwise";
};
