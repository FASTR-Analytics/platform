// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCanvas,
  type jsPDF,
  PdfRenderContext,
  RectCoordsDims,
} from "./deps.ts";

export type CreatePdfRenderContextResult = {
  pdf: jsPDF;
  rc: PdfRenderContext;
  rcd: RectCoordsDims;
};

export async function createPdfRenderContext(
  width: number,
  height: number,
): Promise<CreatePdfRenderContextResult> {
  const { jsPDF } = await import("jspdf");
  const orientation = width > height ? "landscape" : "portrait";

  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [width, height],
    compress: true,
  }) as jsPDF;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const rc = new PdfRenderContext(pdf, ctx as any, createCanvas);
  const rcd = new RectCoordsDims([0, 0, width, height]);
  return { pdf, rc, rcd };
}
