// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AIChatConfig } from "./types.ts";
import { ToolRegistry } from "./tool_engine.ts";

// One-line committed-test guard for consumers (PLAN_AI_VIEWS_AND_APPROVAL
// Feature 2, validation #5): runs the chat's construction-time tool checks —
// duplicate tool names and availableIn↔viewController consistency — without
// mounting anything. The zod-level checks (strict-schema ban, empty
// availableIn) already threw inside createAITool when the tools array was
// built, and controller construction ran its own fallback checks, so passing
// here means createAIChat construction cannot throw for this config's tools.
// Phase 4 extends this with the approval-policy checks.
export function validateAIChatConfig(
  config: Pick<
    AIChatConfig,
    "tools" | "viewController" | "textEditorHandler"
  >,
): void {
  const registry = new ToolRegistry();
  registry.bindViewController(config.viewController ?? null);
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
