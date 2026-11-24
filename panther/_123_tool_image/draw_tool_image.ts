// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AIToolImage,
  buildCanvasRenderContext,
  type CreateCanvas,
  type FigureInputs,
  FigureRenderer,
  type PageInputs,
  PageRenderer,
  type RectCoordsDims,
  REFERENCE_WIDTH_DU,
  type RenderContext,
  runWithDarkKeyColors,
  type SlideExportSizeOptions,
} from "./deps.ts";

// At 1024 px, Sonnet 5 and Haiku 5.5 read every cell of a 16-column table
// with 9 px text, as they did from a PNG and at 1568 px, at under half the
// tokens of 1568 px (measured in wb-fastr, 2026-11-13).
export const TOOL_IMAGE_DRAWING = {
  WIDTH_PX: 1024,
  MAX_HEIGHT_PX: 2048,
  JPEG_QUALITY: 0.85,
} as const;

export type DrawnToolImage = {
  image: AIToolImage;
  widthPx: number;
  heightPx: number;
};

// What a runtime gives the drawing: its canvas, and that canvas encoded as a
// JPEG at a quality from 0 to 1, as bare base64.
export type ToolImageSurface = {
  createCanvas: CreateCanvas;
  encodeJpeg: (canvas: HTMLCanvasElement, quality: number) => string;
};

export type PageFrame = Pick<
  SlideExportSizeOptions,
  "pageWidthDu" | "pageHeightDu"
>;

// The one scale that holds a subject to both bounds, so a tall subject is
// drawn narrower and never resampled.
export function getToolImageDevicePxPerDu(
  widthDu: number,
  heightDu: number,
): number {
  return Math.min(
    TOOL_IMAGE_DRAWING.WIDTH_PX / widthDu,
    TOOL_IMAGE_DRAWING.MAX_HEIGHT_PX / heightDu,
  );
}

export function drawPageAsToolImage(
  surface: ToolImageSurface,
  inputs: PageInputs,
  frame: PageFrame,
  ground: string,
): DrawnToolImage {
  return drawToolImage(
    surface,
    frame.pageWidthDu,
    frame.pageHeightDu,
    ground,
    (rc, rcd) => PageRenderer.measureAndRender(rc, rcd, inputs),
  );
}

// In the reference frame at its ideal height there, as the figure holder's
// zoom sizing lays a figure out, and in the key colours of the scheme it is
// drawn in: a figure holder that follows the screen draws a dark screen's
// figure in dark key colours, which resolve while the figure is measured.
// Only the figure is drawn in the scope: an app that remaps near-black on
// dark would otherwise remap a near-black ground the caller named.
export function drawFigureAsToolImage(
  surface: ToolImageSurface,
  inputs: FigureInputs,
  ground: string,
  scheme: "light" | "dark",
): DrawnToolImage {
  const scoped = scheme === "dark" ? runWithDarkKeyColors : runUnscoped;
  const { rc } = buildCanvasRenderContext(
    surface.createCanvas,
    REFERENCE_WIDTH_DU,
    1,
    1,
  );
  const { idealH } = scoped(() =>
    FigureRenderer.getIdealHeight(rc, REFERENCE_WIDTH_DU, inputs)
  );
  return drawToolImage(
    surface,
    REFERENCE_WIDTH_DU,
    idealH,
    ground,
    (rc, rcd) => scoped(() => FigureRenderer.measureAndRender(rc, rcd, inputs)),
  );
}

const runUnscoped = <T>(fn: () => T): T => fn();

export function describeDrawnToolImage(
  subject: string,
  drawn: DrawnToolImage,
): string {
  return `${subject} (${drawn.widthPx}×${drawn.heightPx} px)`;
}

function drawToolImage(
  surface: ToolImageSurface,
  widthDu: number,
  heightDu: number,
  ground: string,
  render: (rc: RenderContext, rcd: RectCoordsDims) => void,
): DrawnToolImage {
  const devicePxPerDu = getToolImageDevicePxPerDu(widthDu, heightDu);
  const { canvas, rc, rcd } = buildCanvasRenderContext(
    surface.createCanvas,
    widthDu,
    heightDu,
    devicePxPerDu,
  );
  // The canvas's sides are rounded to whole pixels, so the ground fills the
  // canvas rather than the frame: a pixel the frame only partly covers would
  // otherwise be encoded against black.
  rc.rRect(
    [0, 0, canvas.width / devicePxPerDu, canvas.height / devicePxPerDu],
    { fillColor: ground },
  );
  render(rc, rcd);
  return {
    image: {
      mediaType: "image/jpeg",
      data: surface.encodeJpeg(canvas, TOOL_IMAGE_DRAWING.JPEG_QUALITY),
    },
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}
