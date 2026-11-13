// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ImageContentBlock, ToolResultContent } from "./deps.ts";
import { type AIToolImage, validateAIToolImage } from "./tool_image.ts";

// What a tool call answers with: text, and images for the model to look at.
// A handler, or an approval's commit, returns one to send images; any other
// return is its text (resolveAIToolReturn).
export class AIToolOutput {
  readonly text: string;
  readonly images: readonly AIToolImage[];
  // Type-only: it makes the class nominal, so every AIToolOutput came
  // through the constructor and holds only images the API takes.
  declare private readonly checked: true;

  constructor(parts: { text: string; images?: readonly AIToolImage[] }) {
    this.text = parts.text;
    this.images = (parts.images ?? []).map((image, i) => {
      validateAIToolImage(image, `AIToolOutput image ${i + 1}`);
      return { mediaType: image.mediaType, data: image.data };
    });
  }
}

// What one run of a tool yields. `structured` is what the handler or the
// commit returned, set exactly when the tool declares an outputSchema and
// something was returned: the MCP surface sends it as structuredContent.
export type AIToolRun = { output: AIToolOutput; structured?: unknown };

// The one reading of what a handler or a commit returns, on every surface.
export function resolveAIToolReturn(
  returned: unknown,
  declaresOutputSchema: boolean,
): AIToolRun {
  if (returned instanceof AIToolOutput) {
    if (declaresOutputSchema) {
      throw new Error(
        "A tool that declares an outputSchema returned an AIToolOutput, which has no structured form to send beside it. Return the value the schema describes, or drop the outputSchema.",
      );
    }
    return { output: returned };
  }
  // JSON.stringify(undefined) is the VALUE undefined, not a string — a
  // handler or a commit that mutates and returns nothing must still produce
  // text.
  const text = typeof returned === "string"
    ? returned
    : (JSON.stringify(returned) ?? "Done");
  const output = new AIToolOutput({ text });
  return declaresOutputSchema && returned !== undefined
    ? { output, structured: returned }
    : { output };
}

// The content of the call's tool_result, which is also what the SDK's tool
// runner takes from run(): the text, then each image. The API refuses an
// empty text block, so a blank text is left out of the blocks.
export function buildToolResultContent(
  output: AIToolOutput,
): ToolResultContent {
  if (output.images.length === 0) {
    return output.text;
  }
  return [
    ...(output.text.trim() === ""
      ? []
      : [{ type: "text" as const, text: output.text }]),
    ...output.images.map((image): ImageContentBlock => ({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data,
      },
    })),
  ];
}

const TEXT_BLOCK_SEPARATOR = "\n\n";

// The output a run()'s content stands for: a tool built by hand has only
// run(), and the engines read its content back through this.
export function parseToolResultContent(
  content: ToolResultContent,
): AIToolOutput {
  if (typeof content === "string") {
    return new AIToolOutput({ text: content });
  }
  const texts: string[] = [];
  const images: AIToolImage[] = [];
  for (const block of content) {
    if (block.type === "text") {
      texts.push(block.text);
    } else if (block.type === "image") {
      images.push({
        mediaType: block.source.media_type,
        data: block.source.data,
      });
    } else {
      const unhandled: never = block;
      throw new Error(
        `A tool's run() returned a block that is neither text nor an image (type ${
          JSON.stringify((unhandled as { type?: unknown }).type)
        })`,
      );
    }
  }
  return new AIToolOutput({
    text: texts.join(TEXT_BLOCK_SEPARATOR),
    images,
  });
}
