// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CanvasRenderContext,
  type FigureInputs,
  FigureRenderer,
  getExportDevicePxPerDu,
  RectCoordsDims,
  REFERENCE_WIDTH_DU,
} from "./deps.ts";

// Browser figure export. A file always renders the canonical REFERENCE_WIDTH_DU
// frame; `outputWidthPx` is the file's pixel width (the supersample). Layout is
// independent of it. `outputHeightPx` is optional — otherwise the figure's
// ideal height in the reference frame is used. The background is the figure's
// own `surrounds.backgroundColor` (transparent by default); set it on the
// figure inputs to export white, exactly like on-screen and PDF rendering.
export function getFigureAsCanvas(
  figureInputs: FigureInputs,
  outputWidthPx: number,
  outputHeightPx?: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context");
  }

  const rc = new CanvasRenderContext(ctx);
  const devicePxPerDu = getExportDevicePxPerDu(outputWidthPx);

  let frameHDu: number;
  if (outputHeightPx === undefined) {
    frameHDu = FigureRenderer.getIdealHeight(
      rc,
      REFERENCE_WIDTH_DU,
      figureInputs,
    ).idealH;
  } else {
    frameHDu = outputHeightPx / devicePxPerDu;
  }

  canvas.width = Math.round(REFERENCE_WIDTH_DU * devicePxPerDu); // === outputWidthPx
  canvas.height = Math.round(frameHDu * devicePxPerDu);

  // Supersample: draw the DU-space picture into the device-pixel backing buffer.
  // No background fill — the figure's surrounds.backgroundColor governs it.
  ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);

  const bounds = new RectCoordsDims([0, 0, REFERENCE_WIDTH_DU, frameHDu]);
  FigureRenderer.measureAndRender(rc, bounds, figureInputs);

  return canvas;
}

export function getFigureAsBase64(
  figureInputs: FigureInputs,
  outputWidthPx: number,
  outputHeightPx?: number,
): string {
  const canvas = getFigureAsCanvas(figureInputs, outputWidthPx, outputHeightPx);
  return canvas.toDataURL("image/png");
}

export async function getFigureAsDataUrlBrowser(
  figureInputs: FigureInputs,
  outputWidthPx: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const canvas = getFigureAsCanvas(figureInputs, outputWidthPx);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}
