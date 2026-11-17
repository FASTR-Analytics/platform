// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AIChatConfig } from "./types.ts";
import { ToolRegistry } from "./tool_engine.ts";

// Safety cap on turn continuations (client tool loops and server-tool
// pause_turn resumptions) so a pathological loop can't run unbounded. The
// default of AIChatConfig.maxTurnContinuations.
const MAX_TURN_CONTINUATIONS = 100;

// The cap a config asks for. Only a positive integer is one: zero ends a turn
// at its first tool call, and NaN or Infinity is never reached, which lifts
// the cap.
export function resolveMaxTurnContinuations(
  configured: number | undefined,
): number {
  if (configured === undefined) {
    return MAX_TURN_CONTINUATIONS;
  }
  if (!Number.isInteger(configured) || configured < 1) {
    throw new Error(
      `maxTurnContinuations must be a positive integer, got ${configured}.`,
    );
  }
  return configured;
}

// One-line committed-test guard for consumers: runs the chat's
// construction-time checks (the continuation cap, duplicate tool names,
// availableIn↔viewController consistency, and the approval policy:
// requireForKind/requireKind) without mounting anything. createAITool's own
// checks (empty availableIn, handler/approval XOR, session×modal) already
// threw when the tools array was built, and controller construction ran its
// own fallback checks, so passing here means createAIChat construction
// cannot throw for this config's tools or its cap.
export function validateAIChatConfig(
  config: Pick<
    AIChatConfig,
    | "tools"
    | "viewController"
    | "textEditorHandler"
    | "approvalPolicy"
    | "maxTurnContinuations"
  >,
): void {
  resolveMaxTurnContinuations(config.maxTurnContinuations);
  const registry = new ToolRegistry();
  registry.bindViewController(config.viewController ?? null);
  registry.bindApprovalPolicy(config.approvalPolicy ?? null);
  for (const tool of config.tools ?? []) {
    registry.register(tool);
  }
  if (
    config.textEditorHandler && registry.get("str_replace_based_edit_tool")
  ) {
    throw new Error(
      `Tool name "str_replace_based_edit_tool" is reserved by the built-in text editor (config.textEditorHandler is set) — the registered tool would never run. Rename the custom tool.`,
    );
  }
}
