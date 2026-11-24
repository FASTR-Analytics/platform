import type { SlideTableOrImage } from "../slide_text_offsets.ts";

// What the model is told of slide text holding a table or an image: by the
// write that refuses its own text, and by every measure of a slide whose text
// panther cannot draw, whose own error names functions the model cannot call.
// No closing full stop, so a caller can go on with the sentence.
export function describeSlideTableOrImageForAI(
  subject: string,
  found: SlideTableOrImage,
): string {
  const held = `${subject} holds a markdown ${found.kind} at line ${
    found.line + 1
  }, which slide text cannot draw.`;
  return found.kind === "table"
    ? `${held} To show tabular data, use a from_metric block with a table preset`
    : `${held} To show an image, use an image block naming one of the instance's image assets (get_image_assets lists them)`;
}
