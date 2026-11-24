// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims, RenderContext } from "./deps.ts";

// A canvas for a picture `width` by `height` DU drawn at `devicePxPerDu`
// device pixels per DU: the canvas is `round(width × devicePxPerDu)` by
// `round(height × devicePxPerDu)` pixels, its context carries that scale, and
// `rcd` is the DU frame `[0, 0, width, height]`.
export type CreateCanvasRenderContext = (
  width: number,
  height: number,
  devicePxPerDu: number,
) => {
  canvas: { toDataURL(format: "png" | "jpeg" | "webp"): string };
  rc: RenderContext;
  rcd: RectCoordsDims;
};

export type PptxGenJSInstance = {
  readonly version: string;
  layout: string;
  author: string;
  title: string;
  subject: string;
  addSlide: () => PptxSlide;
  defineLayout: (
    props: { name: string; width: number; height: number },
  ) => void;
  write: (props?: { outputType?: string }) => Promise<unknown>;
  stream: (props?: { outputType?: string }) => Promise<unknown>;
};

export type PptxSlide = {
  addText: (
    text: string | unknown[],
    options?: Record<string, unknown>,
  ) => void;
  addShape: (type: string, options?: Record<string, unknown>) => void;
  addImage: (options: Record<string, unknown>) => void;
};
