// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, PatternConfig } from "./deps.ts";

export type PageBackgroundStyle = ColorKeyOrString | PatternConfig;

export type SplitPlacement = "left" | "right" | "top" | "bottom";

export type SplitConfig = {
  placement?: SplitPlacement | "none";
  sizeAsPct?: number;
  background?: PageBackgroundStyle | "none";
};

export type LogosPlacementPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "above-content"
  | "below-content";

export type LogosPlacementOptions = {
  position?: LogosPlacementPosition;
  gap?: number;
};

export type LogosPlacement = {
  position: LogosPlacementPosition;
  gap: number;
};


export type PageNumberBackground = "none" | "triangle" | "circle" | "rect";

export type LogosSizingOptions = {
  targetArea?: number;
  maxHeight?: number;
  maxWidth?: number;
  gapX?: number;
};

export type LogosSizing = {
  targetArea: number;
  maxHeight: number;
  maxWidth: number;
  gapX: number;
};
