// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Zero-import on purpose: this file holds the pure failure-channel logic so
// tests/ai_tool_failure_test.ts can load it without the module's UI deps
// graph (same pattern as display_items.ts).

// Expected, model-correctable failure. Throw from a handler to reach the
// model as is_error (it should self-correct) while the timeline renders a
// clean failure row — no stack, not styled as a crash. Anything else thrown
// keeps the full tool_error treatment: an unexpected throw IS a bug and the
// stack is the honest record.
export class AIToolFailure extends Error {
  override readonly name = "AIToolFailure";
}

// Maps a thrown value to the wire/display parts of an error tool result.
// fullError === content is the signal that suppresses the stack section in
// the timeline (tool_engine sets errorStack only when they differ).
export function toolThrowToResultParts(error: unknown): {
  content: string;
  fullError: string;
  expected: boolean;
} {
  if (error instanceof AIToolFailure) {
    return { content: error.message, fullError: error.message, expected: true };
  }

  // Clean message for Claude API (no stack, no "Error:" prefix)
  const errorMessage = error instanceof Error ? error.message : String(error);
  const cleanMessage = errorMessage.replace(/^Error:\s*/i, "");

  // Full error details for UI (includes stack)
  const fullError = error instanceof Error && error.stack
    ? error.stack
    : cleanMessage;

  return { content: cleanMessage, fullError, expected: false };
}
