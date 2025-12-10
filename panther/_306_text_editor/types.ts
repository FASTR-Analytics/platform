// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type TextEditorSelection = {
  from: number;
  to: number;
  fromLine: number;
  toLine: number;
  text: string;
} | null;

export type TextEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  onSelectionChange?: (selection: TextEditorSelection) => void;
  readonly?: boolean;
  language?: "markdown" | "plain";
  showLineNumbers?: boolean;
  height?: string;
  fullHeight?: boolean;
  lineWrapping?: boolean;
};

export type TextEditorDiffProps = {
  original: string;
  modified: string;
  readonly?: boolean;
};

export type StrReplaceResult = {
  success: boolean;
  content: string;
  error?: string;
};
