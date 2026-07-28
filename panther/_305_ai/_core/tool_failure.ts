// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Zero-import on purpose: this file holds the pure failure-channel logic so
// tests/ai_tool_failure_test.ts can load it without the module's UI deps
// graph (same pattern as display_items.ts).

// Anticipated failure — the message is the complete, user-presentable
// record. Covers BOTH model-correctable input failures (bad id, missing
// referent, precondition not met — the model should self-correct) AND
// anticipated operational failures (a failed server call, an unavailable
// resource — the model should report, not retry blindly; a client-side
// stack would point at the `throw` site, not the cause, and is noise).
// Reaches the model as is_error with the message; the timeline renders a
// clean failure row — no stack, not styled as a crash. Rule of thumb: if
// you anticipated the failure and wrote a user-complete message for it, it
// is AIToolFailure — whatever the cause. Assertion/invariant throws
// ("should never happen") are NOT anticipated failures: they are bug
// detectors and stay plain Error so the stack surfaces. Everything else
// thrown keeps the full tool_error treatment: an unexpected throw IS a bug
// and the stack is the honest record — the noisy default is deliberate so
// unclassified failures surface instead of being masked.
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
