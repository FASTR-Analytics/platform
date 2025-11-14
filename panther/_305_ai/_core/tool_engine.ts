// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AITool, ContentBlock, DisplayItem } from "./types.ts";

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export class ToolRegistry {
  private tools = new Map<string, AITool>();

  register(tool: AITool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName);
  }

  get(toolName: string): AITool | undefined {
    return this.tools.get(toolName);
  }

  getAll(): AITool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): Array<{
    name: string;
    description: string;
    input_schema: AITool["input_schema"];
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
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
    const tool = toolRegistry.get(block.name);
    let label: string | undefined;

    if (tool?.inProgressLabel) {
      label = typeof tool.inProgressLabel === "function"
        ? tool.inProgressLabel(block.input)
        : tool.inProgressLabel;
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
    const tool = toolRegistry.get(block.name);

    if (!tool) {
      console.error(`Unknown tool: ${block.name}`);
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: `Error: Unknown tool "${block.name}"`,
        is_error: true,
      };
    }

    try {
      const result = await tool.handler(block.input);
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
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
