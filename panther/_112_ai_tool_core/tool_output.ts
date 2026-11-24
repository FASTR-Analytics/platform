// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ImageContentBlock, ToolResultContent } from "./deps.ts";
import { type AIToolImage, validateAIToolImage } from "./tool_image.ts";

// What a tool call answers with: text, and images for the model to look at.
// A handler, or an approval's commit, returns one to send images; any other
// return is its text (resolveAIToolReturn). A tool that declares an
// outputSchema returns its structured output instead, and makes one from it
// in describeForModel.
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

// What one run of a tool yields. `structured` is the structured output: the
// JSON form of what the handler or the commit returned, set exactly when the
// tool declares an outputSchema and something was returned. The MCP surface
// sends it as structuredContent.
export type AIToolRun = { output: AIToolOutput; structured?: unknown };

// What a tool declares about its return, as its metadata holds it.
export type AIToolReturnDeclaration = {
  outputSchema?: unknown;
  describeForModel?: (structured: unknown) => string | AIToolOutput;
};

// The one reading of what a handler or a commit returns, on every surface.
export function resolveAIToolReturn(
  returned: unknown,
  declaration: AIToolReturnDeclaration,
): AIToolRun {
  const declaresOutputSchema = declaration.outputSchema !== undefined;
  if (returned instanceof AIToolOutput) {
    if (declaresOutputSchema) {
      throw new Error(
        "A tool that declares an outputSchema returned an AIToolOutput. Return the value the schema describes; to show the model images, or less than that value, return an AIToolOutput from the tool's describeForModel.",
      );
    }
    return { output: returned };
  }
  if (!declaresOutputSchema || returned === undefined) {
    // JSON.stringify(undefined) is the VALUE undefined, not a string — a
    // handler or a commit that mutates and returns nothing must still
    // produce text.
    return {
      output: new AIToolOutput({
        text: typeof returned === "string"
          ? returned
          : (JSON.stringify(returned) ?? "Done"),
      }),
    };
  }
  const json = JSON.stringify(returned);
  if (json === undefined) {
    throw new Error(
      `A tool that declares an outputSchema returned a ${typeof returned}, which JSON cannot carry. Return the value the schema describes.`,
    );
  }
  const described = declaration.describeForModel?.(returned);
  const output = described instanceof AIToolOutput
    ? described
    : new AIToolOutput({
      text: described ?? (typeof returned === "string" ? returned : json),
    });
  return { output, structured: JSON.parse(json) };
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
