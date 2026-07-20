// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildViewGateMessage,
  type ContentBlock,
  SERVER_TOOL_LABELS,
} from "../deps.ts";
import type { DisplayItem } from "./types.ts";
import { toolThrowToResultParts } from "./tool_failure.ts";
import type { AIToolWithMetadata, ToolUIMetadata } from "./tool_helpers.ts";

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

type ToolResultInternal = ToolResult & {
  _fullError?: string;
  _expected?: boolean;
};

export class ToolRegistry {
  private tools = new Map<string, AIToolWithMetadata>();

  // View-binding state for availableIn validation:
  //   undefined — unbound (standalone registry; no validation possible)
  //   null      — bound with NO view controller (availableIn is an error)
  //   controller — bound to that controller's view ids AND identity
  private boundController: { _viewIds(): string[] } | null | undefined =
    undefined;
  private boundViewIds: Set<string> | null = null;

  // Called by createAIChat before tools register, so both construction-time
  // registration and post-construction register() calls run the same
  // availableIn validation (a bad tool fails the app's boot or its smoke
  // test, never a live conversation).
  bindViewController(controller: { _viewIds(): string[] } | null): void {
    this.boundController = controller;
    this.boundViewIds = controller === null
      ? null
      : new Set(controller._viewIds());
    for (const tool of this.tools.values()) {
      this.validateAvailableIn(tool);
    }
  }

  private validateAvailableIn<TInput>(tool: AIToolWithMetadata<TInput>): void {
    if (this.boundController === undefined) return;
    const name = tool.sdkTool.name;
    // Identity, not just ids: a viewController.createTool handler reads ITS
    // controller's live state — gating against a different controller
    // instance (even one built from the same registry shape) would pass the
    // gate while the handler sees another view's params/context.
    const source = tool.metadata._viewController;
    if (source !== undefined && source !== this.boundController) {
      throw new Error(
        `Tool "${name}" was created by viewController.createTool on a DIFFERENT controller instance than this chat's viewController. Pass the same controller instance to both, or create the tool with plain createAITool.`,
      );
    }
    const availableIn = tool.metadata.availableIn;
    if (!availableIn) return;
    if (this.boundViewIds === null) {
      throw new Error(
        `Tool "${name}" declares availableIn but the chat has no viewController — gating needs a view registry to check against.`,
      );
    }
    for (const id of availableIn) {
      if (!this.boundViewIds.has(id)) {
        throw new Error(
          `Tool "${name}": availableIn references view id "${id}", which is not in the configured view registry.`,
        );
      }
    }
  }

  // Generic so typed tools assign without a cast (AIToolWithMetadata<T> is
  // not assignable to AIToolWithMetadata<unknown> — run()'s input is
  // contravariant).
  register<TInput>(tool: AIToolWithMetadata<TInput>): void {
    const name = tool.sdkTool.name;
    if (this.tools.has(name)) {
      throw new Error(
        `Duplicate tool name "${name}" — a second registration would silently shadow the first. Tool names must be unique per chat.`,
      );
    }
    this.validateAvailableIn(tool);
    // Stored type-erased; execution goes through sdkTool.run, which
    // re-parses its input through the tool's own schema.
    this.tools.set(name, tool as AIToolWithMetadata);
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

// Soft gating (PLAN_AI_VIEWS_AND_APPROVAL Feature 2): every tool is always
// sent to the API (tool definitions live in the cached prompt prefix), but an
// out-of-view EXECUTION is refused before the handler runs. Returns null when
// the block may execute (tool unknown/ungated or the view matches); the loop
// calls this per block against the LIVE view id, so a nav tool changing the
// view mid-turn is seen by the very next check.
export function checkViewGate(
  block: { id: string; name: string; input: unknown },
  toolRegistry: ToolRegistry,
  currentViewId: string,
): { result: ToolResult; errorItem: DisplayItem } | null {
  const availableIn = toolRegistry.getMetadata(block.name)?.availableIn;
  if (!availableIn || availableIn.includes(currentViewId)) return null;
  const message = buildViewGateMessage(availableIn, currentViewId);
  return {
    result: {
      type: "tool_result",
      tool_use_id: block.id,
      content: message,
      is_error: true,
    },
    // Expected-failure display (the AIToolFailure treatment): the refusal is
    // model feedback, not an app bug — no stack, quiet styling.
    errorItem: {
      type: "tool_error",
      toolName: block.name,
      errorMessage: `Tool feedback: ${block.name}`,
      errorDetails: message,
      expected: true,
      toolInput: block.input,
    },
  };
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
        const parts = toolThrowToResultParts(error);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: parts.content,
          is_error: true,
          _fullError: parts.fullError,
          _expected: parts.expected || undefined,
        };
      }
    },
  );

  const resultsInternal = await Promise.all(toolPromises);

  // Strip _fullError/_expected before returning to API
  const results: ToolResult[] = resultsInternal.map(
    ({ _fullError, _expected, ...rest }) => rest,
  );

  const errorItems: DisplayItem[] = resultsInternal
    .filter((r) => r.is_error)
    .map((result) => {
      const toolBlock = toolUseBlocks.find((b) => b.id === result.tool_use_id)!;
      const metadata = toolRegistry.getMetadata(toolBlock.name);

      const errorLabel = metadata?.errorMessage
        ? typeof metadata.errorMessage === "function"
          ? metadata.errorMessage(toolBlock.input)
          : metadata.errorMessage
        : `Tool feedback: ${toolBlock.name}`;

      return {
        type: "tool_error" as const,
        toolName: toolBlock.name,
        errorMessage: errorLabel,
        errorDetails: result.content,
        errorStack: result._fullError !== result.content
          ? result._fullError
          : undefined,
        expected: result._expected,
        toolInput: toolBlock.input,
      };
    });

  const successItems: DisplayItem[] = resultsInternal
    .filter((r) => !r.is_error)
    .filter((r) => {
      const toolBlock = toolUseBlocks.find((b) => b.id === r.tool_use_id)!;
      const metadata = toolRegistry.getMetadata(toolBlock.name);
      return !metadata?.displayComponent;
    })
    .map((result) => {
      const toolBlock = toolUseBlocks.find((b) => b.id === result.tool_use_id)!;
      const metadata = toolRegistry.getMetadata(toolBlock.name);

      // Use successMessage if provided, fall back to completionMessage (backwards compat), then default
      const messageSource = metadata?.successMessage ??
        metadata?.completionMessage;
      const message = messageSource
        ? typeof messageSource === "function"
          ? messageSource(toolBlock.input)
          : messageSource
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
