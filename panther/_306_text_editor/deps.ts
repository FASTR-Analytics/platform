// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type { CustomMarkdownStyleOptions } from "../_004_markdown_style/mod.ts";
export type { ImageMap } from "../_105_markdown/mod.ts";
export {
  DOCUMENT_MARKDOWN_DEFAULTS,
  MarkdownPresentation,
  MarkdownPresentationJsx,
} from "../_303_components/mod.ts";
export type { MarkdownImageRenderer } from "../_303_components/mod.ts";
export {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
export { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
export { markdown } from "@codemirror/lang-markdown";
export {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
export { lintKeymap } from "@codemirror/lint";
export { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
export { EditorState } from "@codemirror/state";
export type { Extension } from "@codemirror/state";
export {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
export { createEffect, Match, on, onCleanup, onMount, Switch } from "solid-js";
