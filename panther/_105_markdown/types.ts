// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Coordinates,
  CustomMarkdownStyleOptions,
  Dimensions,
  FigureInputs,
  LineStyle,
  Measured,
  MeasuredText,
  RectCoordsDims,
  TextInfoUnkeyed,
} from "./deps.ts";

// =============================================================================
// Markdown-it Token Type
// =============================================================================

export type MarkdownItToken = {
  type: string;
  tag?: string;
  level?: number;
  content?: string;
  children: MarkdownItToken[] | null;
  attrs: [string, string][] | null;
};

// =============================================================================
// Image Map
// =============================================================================

export type ImageMap = Map<string, {
  dataUrl: string;
  width: number;
  height: number;
}>;

// =============================================================================
// Figure Map (for dynamic rendering)
// =============================================================================

export type FigureMap = Map<string, FigureInputs>;

// =============================================================================
// Renderer Input
// =============================================================================

export type MarkdownRendererInput = {
  markdown: string;
  style?: CustomMarkdownStyleOptions;
  images?: ImageMap;
};

// =============================================================================
// Parser Intermediate Representation
// =============================================================================

export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "bold-italic"; text: string }
  | { type: "link"; text: string; url: string }
  | { type: "break" }
  | { type: "code-inline"; text: string }
  | { type: "math-inline"; latex: string };

export type ParsedMarkdownItem =
  | { type: "paragraph"; content: MarkdownInline[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: MarkdownInline[] }
  | {
    type: "list-item";
    listType: "bullet" | "numbered";
    level: 0 | 1 | 2;
    listIndex?: number;
    isFirstInList: boolean;
    isLastInList: boolean;
    content: MarkdownInline[];
  }
  | { type: "blockquote"; content: MarkdownInline[] }
  | { type: "horizontal-rule" }
  | { type: "code-block"; code: string }
  | { type: "math-block"; latex: string };

export type ParsedMarkdown = {
  items: ParsedMarkdownItem[];
};

// =============================================================================
// FormattedText System
// =============================================================================

export type FormattedRunStyle = "normal" | "bold" | "italic" | "bold-italic";

export type FormattedRun = {
  text: string;
  style: FormattedRunStyle;
  link?: { url: string };
  isCode?: boolean;
};

export type FormattedText = {
  runs: FormattedRun[];
  baseStyle: TextInfoUnkeyed;
};

export type MeasuredFormattedRun = {
  mText: MeasuredText;
  x: number;
  underline?: {
    yOffset: number;
    color: string;
  };
};

export type MeasuredFormattedLine = {
  runs: MeasuredFormattedRun[];
  y: number;
  totalWidth: number;
  maxBaseline: number;
};

export type MeasuredFormattedText = {
  lines: MeasuredFormattedLine[];
  dims: Dimensions;
  baseStyle: TextInfoUnkeyed;
  linkUnderline: boolean;
  maxWidth: number;
  align: "left" | "center" | "right";
};

// =============================================================================
// Measured Markdown Items
// =============================================================================

export type MeasuredMarkdownItem =
  | MeasuredMarkdownParagraph
  | MeasuredMarkdownHeading
  | MeasuredMarkdownListItem
  | MeasuredMarkdownBlockquote
  | MeasuredMarkdownHorizontalRule
  | MeasuredMarkdownCodeBlock;

export type MeasuredMarkdownParagraph = {
  type: "paragraph";
  bounds: RectCoordsDims;
  mFormattedText: MeasuredFormattedText;
  position: Coordinates;
};

export type MeasuredMarkdownHeading = {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  bounds: RectCoordsDims;
  mFormattedText: MeasuredFormattedText;
  position: Coordinates;
};

export type MeasuredMarkdownListItem = {
  type: "list-item";
  listType: "bullet" | "numbered";
  level: 0 | 1 | 2;
  listIndex?: number;
  bounds: RectCoordsDims;
  marker: {
    mText: MeasuredText;
    position: Coordinates;
  };
  content: {
    mFormattedText: MeasuredFormattedText;
    position: Coordinates;
  };
};

export type MeasuredMarkdownBlockquote = {
  type: "blockquote";
  bounds: RectCoordsDims;
  border: {
    line: { start: Coordinates; end: Coordinates };
    style: { strokeColor: string; strokeWidth: number };
  };
  background?: {
    rcd: RectCoordsDims;
    color: string;
  };
  paragraphs: {
    mFormattedText: MeasuredFormattedText;
    position: Coordinates;
  }[];
};

export type MeasuredMarkdownHorizontalRule = {
  type: "horizontal-rule";
  bounds: RectCoordsDims;
  line: { start: Coordinates; end: Coordinates };
  style: LineStyle;
};

export type MeasuredMarkdownCodeBlock = {
  type: "code-block";
  bounds: RectCoordsDims;
  background: {
    rcd: RectCoordsDims;
    color: string;
  };
  lines: {
    mText: MeasuredText;
    y: number;
  }[];
  contentPosition: Coordinates;
};

// =============================================================================
// Measured Markdown (Renderer output)
// =============================================================================

export type MeasuredMarkdown = Measured<MarkdownRendererInput> & {
  markdownItems: MeasuredMarkdownItem[];
};
