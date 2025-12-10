// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export interface DocElement {
  type:
    | "heading"
    | "paragraph"
    | "list-item"
    | "image"
    | "horizontal-rule"
    | "blockquote"
    | "table"
    | "code-block"
    | "math-block";
  level?: 1 | 2 | 3 | 4 | 5 | 6; // For headings (H1-H6)
  listType?: "bullet" | "numbered";
  listLevel?: 0 | 1 | 2; // For nested list levels (0=top, 1=first nested, 2=second nested)
  listIndex?: number; // For numbered lists
  isFirstInList?: boolean; // For list items - true if first item in a list
  isLastInList?: boolean; // For list items - true if last item in a list
  imageData?: string; // For images - base64 data URL
  imageAlt?: string; // For images - alt text
  imageWidth?: number; // For images - actual width in pixels
  imageHeight?: number; // For images - actual height in pixels
  tableHeader?: InlineContent[][][]; // For tables - array of header rows, each row is array of cells, each cell is array of inline content
  tableRows?: InlineContent[][][]; // For tables - array of body rows, each row is array of cells, each cell is array of inline content
  codeContent?: string; // For code blocks - raw code content
  mathLatex?: string; // For math blocks - LaTeX source
  content: InlineContent[];
}

export interface InlineContent {
  type:
    | "text"
    | "bold"
    | "italic"
    | "link"
    | "email"
    | "break"
    | "code-inline"
    | "math-inline";
  text: string;
  url?: string; // For links and emails
}

export interface ParsedDocument {
  elements: DocElement[];
}
