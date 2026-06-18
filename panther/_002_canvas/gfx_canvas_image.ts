// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// A file-loaded image wrapped by `_232_skia_canvas/loadImage` so it can travel
// through the Canvas / PDF / PPTX render contexts. It masquerades as an
// HTMLImageElement (loadImage returns it cast as one), so the render contexts
// detect it structurally via this guard rather than by nominal type.
export type GfxCanvasImage = {
  width: number;
  height: number;
  src: string;
  _isGfxCanvas: true;
  _gfxCanvasImage: CanvasImageSource;
};

export function isGfxCanvasImage(image: unknown): image is GfxCanvasImage {
  return (
    typeof image === "object" &&
    image !== null &&
    "_isGfxCanvas" in image &&
    image._isGfxCanvas === true
  );
}
