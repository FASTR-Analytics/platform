// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  findOptimalScale,
  getAutofitHeightConstraints,
  resolveAutofitOptions,
} from "./_internal/autofit.ts";
import { measureMarkdown } from "./_internal/measure_markdown.ts";
import { renderMarkdown } from "./_internal/render_markdown.ts";
import {
  CustomMarkdownStyle,
  type HeightConstraints,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";
import { parseMarkdown } from "./parser.ts";
import type {
  MarkdownInline,
  MarkdownRendererInput,
  MeasuredMarkdown,
  ParsedMarkdownItem,
} from "./types.ts";

function getBaseFontSize(input: MarkdownRendererInput): number {
  const styleInstance = new CustomMarkdownStyle(input.style);
  const merged = styleInstance.getMergedMarkdownStyle();
  return merged.text.paragraph.fontSize;
}

function getMinComfortableWidth(
  rc: RenderContext,
  input: MarkdownRendererInput,
): number {
  const styleInstance = new CustomMarkdownStyle(input.style);
  const style = styleInstance.getMergedMarkdownStyle();
  const parsed = parseMarkdown(input.markdown);

  let maxWordWidth = 0;

  function measureWordsInInline(inline: MarkdownInline, textStyle: Parameters<typeof rc.mText>[1]) {
    if (inline.type === "break") return;
    if (inline.type === "code-inline" || inline.type === "math-inline") {
      // For code/math, measure the whole thing as one "word"
      const text = inline.type === "code-inline" ? inline.text : inline.latex;
      const mText = rc.mText(text, textStyle, Infinity);
      maxWordWidth = Math.max(maxWordWidth, mText.dims.w());
      return;
    }
    const text = inline.text;
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length === 0) continue;
      const mText = rc.mText(word, textStyle, Infinity);
      maxWordWidth = Math.max(maxWordWidth, mText.dims.w());
    }
  }

  function processItem(item: ParsedMarkdownItem) {
    if (item.type === "horizontal-rule") return;
    if (item.type === "code-block") {
      // For code blocks, measure each line
      const lines = item.code.split("\n");
      for (const line of lines) {
        const mText = rc.mText(line, style.text.code, Infinity);
        maxWordWidth = Math.max(maxWordWidth, mText.dims.w());
      }
      return;
    }
    if (item.type === "math-block") {
      // For math blocks, just use a reasonable estimate
      return;
    }
    if (item.type === "image") return;
    if (item.type === "table") {
      // For tables, measure header/cell content
      const processCell = (inlines: MarkdownInline[]) => {
        for (const inline of inlines) {
          measureWordsInInline(inline, style.text.paragraph);
        }
      };
      if (item.header) {
        for (const row of item.header) {
          for (const cell of row) {
            processCell(cell);
          }
        }
      }
      if (item.rows) {
        for (const row of item.rows) {
          for (const cell of row) {
            processCell(cell);
          }
        }
      }
      return;
    }

    // For text content types
    let textStyle = style.text.paragraph;
    if (item.type === "heading") {
      const headingKey = `h${item.level}` as keyof typeof style.text;
      textStyle = style.text[headingKey] || style.text.paragraph;
    } else if (item.type === "blockquote") {
      textStyle = style.text.blockquote;
    }

    for (const inline of item.content) {
      measureWordsInInline(inline, textStyle);
    }
  }

  for (const item of parsed.items) {
    processItem(item);
  }

  // Add some margin for list indentation, blockquote borders, etc.
  const maxListIndent = Math.max(
    style.bulletList.level0.textIndent,
    style.bulletList.level1.textIndent,
    style.bulletList.level2.textIndent,
    style.numberedList.level0.textIndent,
    style.numberedList.level1.textIndent,
    style.numberedList.level2.textIndent,
  );
  const margin = maxListIndent + style.blockquote.leftBorderWidth + style.blockquote.paddingLeft;

  return maxWordWidth + margin;
}

function measureWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  input: MarkdownRendererInput,
): MeasuredMarkdown {
  const autofitOpts = resolveAutofitOptions(input.autofit);
  if (!autofitOpts) {
    return measureMarkdown(rc, bounds, input);
  }

  const baseFontSize = getBaseFontSize(input);
  const optimalScale = findOptimalScale(
    rc,
    bounds.w(),
    bounds.h(),
    input,
    baseFontSize,
    autofitOpts,
  );

  const scaledInput: MarkdownRendererInput = {
    ...input,
    style: {
      ...input.style,
      scale: (input.style?.scale ?? 1) * optimalScale,
    },
  };

  const measured = measureMarkdown(rc, bounds, scaledInput);
  return {
    ...measured,
    item: input,
    autofitScale: optimalScale,
  };
}

export const MarkdownRenderer: Renderer<
  MarkdownRendererInput,
  MeasuredMarkdown
> = {
  isType(item: unknown): item is MarkdownRendererInput {
    return (
      typeof item === "object" &&
      item !== null &&
      "markdown" in item &&
      typeof (item as MarkdownRendererInput).markdown === "string"
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    input: MarkdownRendererInput,
  ): MeasuredMarkdown {
    return measureWithAutofit(rc, bounds, input);
  },

  render(rc: RenderContext, measured: MeasuredMarkdown): void {
    renderMarkdown(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    input: MarkdownRendererInput,
  ): MeasuredMarkdown {
    const measured = measureWithAutofit(rc, bounds, input);
    renderMarkdown(rc, measured);
    return measured;
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    input: MarkdownRendererInput,
    _responsiveScale?: number,
  ): HeightConstraints {
    const autofitOpts = resolveAutofitOptions(input.autofit);

    // Calculate width scaling
    const minComfortableWidth = getMinComfortableWidth(rc, input);
    const neededScalingToFitWidth: "none" | number =
      width >= minComfortableWidth ? 1.0 : width / minComfortableWidth;

    if (autofitOpts) {
      const baseFontSize = getBaseFontSize(input);
      const constraints = getAutofitHeightConstraints(rc, width, input, baseFontSize, autofitOpts);
      return { ...constraints, neededScalingToFitWidth };
    }

    const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 99999 });
    const measured = measureMarkdown(rc, bounds, input);
    const h = measured.bounds.h();
    return { minH: h, idealH: h, maxH: h, neededScalingToFitWidth };
  },
};
