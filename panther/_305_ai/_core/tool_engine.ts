// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, DisplayItem } from "./types.ts";
import type { AIToolWithMetadata, ToolUIMetadata } from "./tool_helpers.ts";

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export class ToolRegistry {
  private tools = new Map<string, AIToolWithMetadata>();

  
  register(tool: AIToolWithMetadata): void {
    this.tools.set(tool.sdkTool.name, tool);
  }

  
  unregister(toolName: string): void {
    this.tools.delete(toolName);
  }

  
  get(toolName: string): AIToolWithMetadata | undefined {
    return this.tools.get(toolName);
  }

  
  getMetadata(toolName: string): ToolUIMetadata | undefined {
    return this.tools.get(toolName)?.metadata;
  }

  
  getAll(): AIToolWithMetadata[] {
    return Array.from(this.tools.values());
  }

  
  getSDKTools(): Array<ReturnType<AIToolWithMetadata["sdkTool"]>> {
    return this.getAll().map((tool) => tool.sdkTool);
  }

  
  clear(): void {
    this.tools.clear();
  }
}

export function getInProgressItems(
  content: ContentBlock[],
  toolRegistry: ToolRegistry,
): DisplayItem[] {
  const toolUseBlocks = content.filter(
    (block): block is ContentBlock & { type: "tool_use" } =>
      block.type === "tool_use",
  );

  return toolUseBlocks.map((block) => {
    const metadata = toolRegistry.getMetadata(block.name);
    let label: string | undefined;

    if (metadata?.inProgressLabel) {
      label = typeof metadata.inProgressLabel === "function"
        ? metadata.inProgressLabel(block.input)
        : metadata.inProgressLabel;
    }

    return {
      type: "tool_in_progress" as const,
      toolName: block.name,
      toolInput: block.input,
      label,
    };
  });
}

export async function processToolUses(
  content: ContentBlock[],
  toolRegistry: ToolRegistry,
): Promise<{
  results: ToolResult[];
  inProgressItems: DisplayItem[];
  errorItems: DisplayItem[];
}> {
  const toolUseBlocks = content.filter(
    (block): block is ContentBlock & { type: "tool_use" } =>
      block.type === "tool_use",
  );

  const inProgressItems = getInProgressItems(content, toolRegistry);

  const toolPromises = toolUseBlocks.map(async (block) => {
    const toolWithMetadata = toolRegistry.get(block.name);

    if (!toolWithMetadata) {
      console.error(`Unknown tool: ${block.name}`);
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: `Error: Unknown tool "${block.name}"`,
        is_error: true,
      };
    }

    try {
      // SDK tools have a run() method that executes the handler
      const result = await toolWithMetadata.sdkTool.run(block.input);
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: result, // SDK tool already returns string
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: `Error: ${errorMessage}`,
        is_error: true,
      };
    }
  });

  const results = await Promise.all(toolPromises);

  const errorItems: DisplayItem[] = results
    .filter((r) => r.is_error)
    .map((result) => {
      const toolBlock = toolUseBlocks.find((b) => b.id === result.tool_use_id)!;
      return {
        type: "tool_error" as const,
        toolName: toolBlock.name,
        errorMessage: result.content,
        toolInput: toolBlock.input,
      };
    });

  return {
    results,
    inProgressItems,
    errorItems,
  };
}

export function getInProgressLabel(toolName: string, _input: unknown): string {
  return `Processing ${toolName}...`;
}
