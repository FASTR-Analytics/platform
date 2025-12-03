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
    | "table";
  level?: 1 | 2 | 3 | 4 | 5 | 6; // For headings (H1-H6)
  listType?: "bullet" | "numbered";
  listLevel?: 0 | 1 | 2; // For nested list levels (0=top, 1=first nested, 2=second nested)
  listIndex?: number; // For numbered lists
  imageData?: string; // For images - base64 data URL
  imageAlt?: string; // For images - alt text
  tableHeader?: InlineContent[][][]; // For tables - array of header rows, each row is array of cells, each cell is array of inline content
  tableRows?: InlineContent[][][]; // For tables - array of body rows, each row is array of cells, each cell is array of inline content
  content: InlineContent[];
}

export interface InlineContent {
  type: "text" | "bold" | "italic" | "link" | "email" | "break";
  text: string;
  url?: string; // For links and emails
}

export interface ParsedDocument {
  elements: DocElement[];
}
