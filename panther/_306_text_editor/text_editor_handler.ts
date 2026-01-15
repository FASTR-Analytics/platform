// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  applyInsert,
  applyStrReplace,
  getContentWithLineNumbers,
  getViewRange,
} from "./utils.ts";
import type { TextEditorSelection } from "./types.ts";

export type TextEditorCommand = {
  command: "view" | "str_replace" | "insert" | "create" | "view_selection";
  path: string;
  view_range?: [number, number];
  old_str?: string;
  new_str?: string;
  insert_line?: number;
  file_text?: string;
};

export function createTextEditorHandler(
  getContent: () => string,
  setContent: (content: string) => void,
  getSelection?: () => TextEditorSelection,
): (input: unknown) => string {
  return (rawInput) => {
    const input = rawInput as TextEditorCommand;
    const content = getContent();

    switch (input.command) {
      case "view": {
        if (input.view_range) {
          return getViewRange(
            content,
            input.view_range[0],
            input.view_range[1],
          );
        }
        return getContentWithLineNumbers(content);
      }
      case "str_replace": {
        if (!input.old_str || input.new_str === undefined) {
          return "Error: old_str and new_str required";
        }
        const result = applyStrReplace(content, input.old_str, input.new_str);
        if (result.success) {
          setContent(result.content);
          return "Successfully replaced text.";
        }
        return `Error: ${result.error}`;
      }
      case "insert": {
        if (input.insert_line === undefined || input.new_str === undefined) {
          return "Error: insert_line and new_str required";
        }
        const newContent = applyInsert(
          content,
          input.insert_line,
          input.new_str,
        );
        setContent(newContent);
        return "Successfully inserted text.";
      }
      case "create": {
        if (input.file_text === undefined) {
          return "Error: file_text required";
        }
        setContent(input.file_text);
        return "Successfully created document.";
      }
      case "view_selection": {
        const sel = getSelection?.();
        if (!sel) {
          return "No text is currently selected.";
        }
        const lineInfo = sel.fromLine === sel.toLine
          ? `Line ${sel.fromLine}`
          : `Lines ${sel.fromLine}-${sel.toLine}`;
        return `Selected text (${lineInfo}):\n${sel.text}`;
      }
      default:
        return `Error: Unknown command "${
          (input as TextEditorCommand).command
        }"`;
    }
  };
}
