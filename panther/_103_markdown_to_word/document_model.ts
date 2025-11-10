// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export interface DocElement {
  type: "heading" | "paragraph" | "list-item";
  level?: 1 | 2 | 3 | 4 | 5; // For headings (H1, H2, H3, H4, H5)
  listType?: "bullet" | "numbered";
  listLevel?: 0 | 1 | 2; // For nested list levels (0=top, 1=first nested, 2=second nested)
  listIndex?: number; // For numbered lists
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
