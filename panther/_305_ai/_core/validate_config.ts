// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AIChatConfig } from "./types.ts";
import { ToolRegistry } from "./tool_engine.ts";

// One-line committed-test guard for consumers (PLAN_AI_VIEWS_AND_APPROVAL
// Feature 2, validation #5): runs the chat's construction-time tool checks —
// duplicate tool names, availableIn↔viewController consistency, and the
// approval policy (requireForKind/requireKind, Feature 4) — without mounting
// anything. The zod-level checks (strict-schema ban, empty availableIn,
// handler/approval XOR, session×modal) already threw inside createAITool
// when the tools array was built, and controller construction ran its own
// fallback checks, so passing here means createAIChat construction cannot
// throw for this config's tools.
export function validateAIChatConfig(
  config: Pick<
    AIChatConfig,
    "tools" | "viewController" | "textEditorHandler" | "approvalPolicy"
  >,
): void {
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
