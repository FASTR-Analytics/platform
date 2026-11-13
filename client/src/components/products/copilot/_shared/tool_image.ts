import { type AIToolImage, createCanvasBrowser } from "panther";

// The subjects one look takes in a call. Panther caps the images of a turn,
// which bounds the rest.
export const MAX_LOOK_SUBJECTS = 10;

// At 1024 px, Sonnet 5 and Haiku 5.5 read every cell of a 16-column table
// with 9 px text, as they did from a PNG and at 1568 px, at under half the
// tokens of 1568 px (measured 2026-11-13).
const WIDTH_PX = 1024;
const JPEG_QUALITY = 0.85;
// A taller drawing is drawn once more at the width that brings it to the
// bound, then scaled to it, so a long table is shrunk and the result's size
// line says so.
const MAX_HEIGHT_PX = 2048;

export type ToolImage = {
  image: AIToolImage;
  widthPx: number;
  heightPx: number;
};

// `draw` draws the subject at the width it is given, at the height the
// subject takes there. `ground` is the colour the user sees behind it, since
// a JPEG has no transparency.
export function encodeToolImage(
  draw: (widthPx: number) => HTMLCanvasElement,
  ground: string,
): ToolImage {
  let drawn = draw(WIDTH_PX);
  if (drawn.height > MAX_HEIGHT_PX) {
    drawn = draw(Math.floor(drawn.width * MAX_HEIGHT_PX / drawn.height));
  }
  const scale = Math.min(1, MAX_HEIGHT_PX / drawn.height);
  const canvas = createCanvasBrowser(
    Math.round(drawn.width * scale),
    Math.round(drawn.height * scale),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D canvas context");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(drawn, 0, 0, canvas.width, canvas.height);
  return {
    image: {
      mediaType: "image/jpeg",
      data: canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1],
    },
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}

export function describeToolImage(subject: string, image: ToolImage): string {
  return `${subject} (${image.widthPx}×${image.heightPx} px)`;
}
