// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildCanvasRenderContext,
  Canvas,
  type CanvasRenderContext,
  type CreateCanvas,
  createCanvas,
  type RectCoordsDims,
  validateFilePath,
} from "./deps.ts";
import {
  CanvasCreationError,
  FileWriteError,
  InvalidDimensionsError,
} from "./errors.ts";

export function createCanvasRenderContext(
  width: number,
  height: number,
  devicePxPerDu = 1,
): { canvas: Canvas; rc: CanvasRenderContext; rcd: RectCoordsDims } {
  if (width <= 0 || height <= 0) {
    throw new InvalidDimensionsError(
      `Canvas dimensions must be positive numbers. Got width: ${width}, height: ${height}`,
    );
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new InvalidDimensionsError(
      `Canvas dimensions must be finite numbers. Got width: ${width}, height: ${height}`,
    );
  }

  try {
    const { canvas, rc, rcd } = buildCanvasRenderContext(
      createCanvas as unknown as CreateCanvas,
      width,
      height,
      devicePxPerDu,
    );
    if (!(canvas instanceof Canvas)) {
      throw new CanvasCreationError("The canvas is not a skia canvas");
    }
    return { canvas, rc, rcd };
  } catch (error) {
    if (
      error instanceof InvalidDimensionsError ||
      error instanceof CanvasCreationError
    ) {
      throw error;
    }
    throw new CanvasCreationError(
      `Failed to create canvas: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function writeCanvas(filePath: string, canvas: Canvas): void {
  try {
    validateFilePath(filePath);
  } catch (error) {
    throw new FileWriteError(
      `Invalid file path: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
    );
  }

  try {
    canvas.save(filePath);
  } catch (error) {
    throw new FileWriteError(
      `Failed to save canvas to file: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
    );
  }
}
