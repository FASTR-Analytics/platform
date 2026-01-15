// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCanvasRenderContext,
  type PageInputs,
  pagesToPptx,
  PptxGenJS,
  type PptxGenJSInstance,
} from "./deps.ts";

// deno-lint-ignore no-explicit-any
const PptxGenJSConstructor = PptxGenJS as any;

export function pagesToPptxDeno(
  pages: PageInputs[],
  width: number,
  height: number,
): PptxGenJSInstance {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const pptx = new PptxGenJSConstructor() as PptxGenJSInstance;
  const { rc } = createCanvasRenderContext(100, 100);

  return pagesToPptx(pptx, rc, pages, createCanvasRenderContext, width, height);
}
