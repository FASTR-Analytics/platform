// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CanvasRenderContext,
  type CreateCanvasRenderContext,
  type PageInputs,
  pagesToPptx,
  PptxGenJS,
  type PptxGenJSInstance,
  RectCoordsDims,
} from "./deps.ts";

// deno-lint-ignore no-explicit-any
const PptxGenJSConstructor = PptxGenJS as any;

export function pagesToPptxBrowser(
  pages: PageInputs[],
  width: number,
  height: number,
): PptxGenJSInstance {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const createCanvasRenderContext: CreateCanvasRenderContext = (
    w: number,
    h: number,
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    const rc = new CanvasRenderContext(ctx);
    const rcd = new RectCoordsDims([0, 0, canvas.width, canvas.height]);
    return { canvas, rc, rcd };
  };

  const pptx = new PptxGenJSConstructor() as PptxGenJSInstance;
  const { rc } = createCanvasRenderContext(100, 100);

  return pagesToPptx(pptx, rc, pages, createCanvasRenderContext, width, height);
}
