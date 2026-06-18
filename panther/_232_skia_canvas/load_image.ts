// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type GfxCanvasImage, Image } from "./deps.ts";

/**
 * Load an image from a file path and return it as an HTMLImageElement-compatible object
 * that can be used with Canvas, PDF, and PPTX render contexts.
 */
export async function loadImage(
  imagePath: string,
): Promise<HTMLImageElement | null> {
  try {
    // Load image from file using @gfx/canvas Image class
    const img = await Image.load(imagePath);

    // Read the file and convert to data URL for PPTX compatibility
    const imageData = await Deno.readFile(imagePath);
    const chunks: string[] = [];
    for (let i = 0; i < imageData.length; i += 8192) {
      chunks.push(String.fromCharCode(...imageData.subarray(i, i + 8192)));
    }
    const base64 = btoa(chunks.join(""));
    const ext = imagePath.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    const dataUrl = `data:image/${ext};base64,${base64}`;

    // Create a wrapper object that provides the necessary properties
    // This ensures compatibility with Canvas, PDF, and PPTX contexts
    const imageWrapper: GfxCanvasImage = {
      width: img.width,
      height: img.height,
      src: dataUrl, // For PPTX which uses image.src
      // skia Image isn't a DOM CanvasImageSource nominally, but the skia ctx
      // draws it at runtime; this is the one bridging cast for the wrapper.
      _gfxCanvasImage: img as unknown as CanvasImageSource,
      _isGfxCanvas: true,
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
