// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Image } from "./deps.ts";

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
    const base64 = btoa(String.fromCharCode(...imageData));
    const ext = imagePath.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    const dataUrl = `data:image/${ext};base64,${base64}`;

    // Create a wrapper object that provides the necessary properties
    // This ensures compatibility with Canvas, PDF, and PPTX contexts
    const imageWrapper = {
      width: img.width,
      height: img.height,
      src: dataUrl, // For PPTX which uses image.src
      _gfxCanvasImage: img, // Store the original image for Canvas
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
