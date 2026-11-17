// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  computeSequenceTimeline,
  CustomFigureStyle,
  FigureRenderer,
  getExportDevicePxPerDu,
  RectCoordsDims,
  renderTransitionFrame,
  resolveSequence,
} from "./deps.ts";
import type { SequenceInputs } from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";

export type SequenceExportOptions = { fps: number; outputWidthPx: number };

export type TimedFrame = { path: string; seconds: number };

// A video frame has no alpha (ffmpeg flattens it to black), so a figure
// without a background paints over white.
const VIDEO_BACKGROUND = "#ffffff";

export async function writeSequenceFrames(
  dirPath: string,
  sequence: SequenceInputs,
  opts: SequenceExportOptions,
): Promise<TimedFrame[]> {
  const resolved = resolveSequence(sequence);
  for (const entry of resolved.entries) {
    const style = new CustomFigureStyle(entry.figure.style);
    for (const font of style.getFontsToRegister()) {
      await registerFontWithSkiaIfNeeded(font);
    }
  }
  const { w, h } = sequence.frame;
  const devicePxPerDu = getExportDevicePxPerDu(opts.outputWidthPx, w);
  const { canvas, rc } = createCanvasRenderContext(
    Math.round(w * devicePxPerDu),
    Math.round(h * devicePxPerDu),
  );
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
  const rcd = new RectCoordsDims([0, 0, w, h]);
  const measured = resolved.entries.map((entry) =>
    FigureRenderer.measure(rc, rcd, entry.figure)
  );
  await Deno.mkdir(dirPath, { recursive: true });
  return computeSequenceTimeline(sequence, opts.fps).map((frame, i) => {
    ctx.fillStyle = VIDEO_BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    if (frame.kind === "hold") {
      FigureRenderer.render(rc, measured[frame.entry]);
    } else {
      renderTransitionFrame(
        rc,
        measured[frame.entry - 1],
        measured[frame.entry],
        frame.elapsedMs,
        resolved.entries[frame.entry].transition,
      );
    }
    const path = `${dirPath}/frame_${String(i + 1).padStart(4, "0")}.png`;
    writeCanvas(path, canvas);
    return { path, seconds: frame.seconds };
  });
}
