// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock } from "../deps.ts";
import type { DisplayItem } from "./types.ts";
import type { AIToolWithMetadata, ToolUIMetadata } from "./tool_helpers.ts";

////////////////////////////////////////////////////////////////////////////////
// SERVER TOOL LABELS (for built-in tools like web_search)
////////////////////////////////////////////////////////////////////////////////

export const SERVER_TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web...",
  str_replace_based_edit_tool: "Editing document...",
};

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

type ToolResultInternal = ToolResult & {
  _fullError?: string;
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

  getSDKTools(): Array<AIToolWithMetadata["sdkTool"]> {
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
    } else if (SERVER_TOOL_LABELS[block.name]) {
      // Fall back to built-in tool labels
      label = SERVER_TOOL_LABELS[block.name];
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
  successItems: DisplayItem[];
}> {
  const toolUseBlocks = content.filter(
    (block): block is ContentBlock & { type: "tool_use" } =>
      block.type === "tool_use",
  );

  const inProgressItems = getInProgressItems(content, toolRegistry);

  const toolPromises = toolUseBlocks.map(
    async (block): Promise<ToolResultInternal> => {
      const toolWithMetadata = toolRegistry.get(block.name);

      if (!toolWithMetadata) {
        console.error(`Unknown tool: ${block.name}`);
        const errorMsg = `Unknown tool "${block.name}"`;
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: errorMsg,
          is_error: true,
          _fullError: errorMsg,
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
        // Clean message for Claude API (no stack, no "Error:" prefix)
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        const cleanMessage = errorMessage.replace(/^Error:\s*/i, "");

        // Full error details for UI (includes stack)
        const fullError = error instanceof Error && error.stack
          ? error.stack
          : cleanMessage;

        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: cleanMessage,
          is_error: true,
          _fullError: fullError,
        };
      }
    },
  );

  const resultsInternal = await Promise.all(toolPromises);

  // Strip _fullError before returning to API
  const results: ToolResult[] = resultsInternal.map(({ _fullError, ...rest }) =>
    rest
  );

  const errorItems: DisplayItem[] = resultsInternal
    .filter((r) => r.is_error)
    .map((result) => {
      const toolBlock = toolUseBlocks.find((b) => b.id === result.tool_use_id)!;
      const metadata = toolRegistry.getMetadata(toolBlock.name);

      const errorLabel = metadata?.errorMessage
        ? (typeof metadata.errorMessage === "function"
          ? metadata.errorMessage(toolBlock.input)
          : metadata.errorMessage)
        : `Tool error: ${toolBlock.name}`;

      return {
        type: "tool_error" as const,
        toolName: toolBlock.name,
        errorMessage: errorLabel,
        errorDetails: result.content,
        errorStack: result._fullError !== result.content
          ? result._fullError
          : undefined,
        toolInput: toolBlock.input,
      };
    });

  const successItems: DisplayItem[] = resultsInternal
    .filter((r) => !r.is_error)
    .map((result) => {
      const toolBlock = toolUseBlocks.find((b) => b.id === result.tool_use_id)!;
      const metadata = toolRegistry.getMetadata(toolBlock.name);

      // Use successMessage if provided, fall back to completionMessage (backwards compat), then default
      const messageSource = metadata?.successMessage ??
        metadata?.completionMessage;
      const message = messageSource
        ? (typeof messageSource === "function"
          ? messageSource(toolBlock.input)
          : messageSource)
        : `Tool success: ${toolBlock.name}`;

      return {
        type: "tool_success" as const,
        toolName: toolBlock.name,
        toolInput: toolBlock.input,
        message,
        result: result.content,
      };
    });

  return {
    results,
    inProgressItems,
    errorItems,
    successItems,
  };
}

export function getInProgressLabel(toolName: string, _input: unknown): string {
  return `Processing ${toolName}...`;
}
