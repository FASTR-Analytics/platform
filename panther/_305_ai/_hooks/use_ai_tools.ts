// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, useContext } from "solid-js";
import { ToolRegistry } from "../_core/tool_engine.ts";
import type { AITool } from "../_core/types.ts";

export const ToolRegistryContext = createContext<ToolRegistry>();

export function useAITools() {
  const registry = useContext(ToolRegistryContext);

  if (!registry) {
    throw new Error(
      "useAITools must be used within an AIChatProvider or you must create your own ToolRegistry",
    );
  }

  return {
    registerTool: (tool: AITool) => registry.register(tool),
    unregisterTool: (toolName: string) => registry.unregister(toolName),
    getTool: (toolName: string) => registry.get(toolName),
    getAllTools: () => registry.getAll(),
    clearTools: () => registry.clear(),
    getToolDefinitions: () => registry.getDefinitions(),
  };
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
