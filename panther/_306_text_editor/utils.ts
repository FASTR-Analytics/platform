// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { StrReplaceResult } from "./types.ts";

export function getContentWithLineNumbers(content: string): string {
  const lines = content.split("\n");
  return lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
}

export function applyStrReplace(
  content: string,
  oldStr: string,
  newStr: string,
): StrReplaceResult {
  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    return { success: false, content, error: "No match found" };
  }
  if (count > 1) {
    return { success: false, content, error: `Found ${count} matches` };
  }
  return { success: true, content: content.replace(oldStr, newStr) };
}

export function applyInsert(
  content: string,
  insertLine: number,
  newStr: string,
): string {
  const lines = content.split("\n");
  lines.splice(insertLine, 0, newStr);
  return lines.join("\n");
}

export function getViewRange(
  content: string,
  startLine: number,
  endLine: number,
): string {
  const lines = content.split("\n");
  const start = Math.max(0, startLine - 1);
  const end = endLine === -1 ? lines.length : Math.min(lines.length, endLine);
  return lines
    .slice(start, end)
    .map((line, i) => `${start + i + 1}: ${line}`)
    .join("\n");
}
