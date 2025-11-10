// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Image } from "./deps.ts";

/**
 * Load an image from a file path and return it as an HTMLImageElement-compatible object
 * that can be used with both Canvas and PDF render contexts.
 */
export async function loadImage(
  imagePath: string,
): Promise<HTMLImageElement | null> {
  try {
    // Load image from file using @gfx/canvas Image class
    const img = await Image.load(imagePath);

    // Create a wrapper object that provides the necessary properties
    // This ensures compatibility with both Canvas and PDF contexts
    const imageWrapper = {
      width: img.width,
      height: img.height,
      _gfxCanvasImage: img, // Store the original image
      _isGfxCanvas: true, // Flag to identify this type
    };

    // Return as HTMLImageElement type for API compatibility
    return imageWrapper as unknown as HTMLImageElement;
  } catch (error) {
    console.error(
      `Failed to load image: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
