// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims, RenderContext } from "./deps.ts";

export type CreateCanvasRenderContext = (
  width: number,
  height: number,
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
