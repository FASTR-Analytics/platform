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
import type {
  AIToolWithMetadata,
  ApprovalPolicy,
  ToolUIMetadata,
} from "./tool_helpers.ts";

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
  //   controller — bound to that controller's view ids AND its registry
  private boundController:
    | { _viewIds(): string[]; _registry(): unknown }
    | null
    | undefined = undefined;
  private boundViewIds: Set<string> | null = null;
  private boundRegistry: unknown = undefined;

  // Approval-policy binding (Feature 4): null = bound with no policy;
  // undefined = unbound (standalone registry).
  private boundPolicy: ApprovalPolicy | null | undefined = undefined;

  // Called by createAIChat before tools register, so both construction-time
  // registration and post-construction register() calls run the same
  // availableIn validation (a bad tool fails the app's boot or its smoke
  // test, never a live conversation).
  bindViewController(
    controller: { _viewIds(): string[]; _registry(): unknown } | null,
  ): void {
    this.boundController = controller;
    this.boundViewIds = controller === null
      ? null
      : new Set(controller._viewIds());
    this.boundRegistry = controller === null
      ? undefined
      : controller._registry();
    for (const tool of this.tools.values()) {
      this.validateAvailableIn(tool);
    }
  }

  // Same contract as bindViewController: bound before registration by
  // createAIChat/validateAIChatConfig, and re-validated on every dynamic
  // register() — a write tool without approval can never slip in after boot.
  bindApprovalPolicy(policy: ApprovalPolicy | null): void {
    this.boundPolicy = policy;
    for (const tool of this.tools.values()) {
      this.validateApprovalPolicy(tool);
    }
  }

  private validateApprovalPolicy<TInput>(
    tool: AIToolWithMetadata<TInput>,
  ): void {
    if (!this.boundPolicy) return;
    const name = tool.sdkTool.name;
    const meta = tool.metadata;
    if (this.boundPolicy.requireKind && meta.kind === undefined) {
      throw new Error(
        `Tool "${name}": approvalPolicy.requireKind is set but the tool declares no kind. Every registered tool must declare kind ("read" | "write" | "nav") so write tools cannot bypass the approval policy by omission.`,
      );
    }
    if (
      meta.kind === this.boundPolicy.requireForKind &&
      meta.approval === undefined &&
      !(this.boundPolicy.exempt ?? []).includes(name)
    ) {
      throw new Error(
        `Tool "${name}" is kind "${meta.kind}" but declares no approval and is not in approvalPolicy.exempt — the approval policy requires confirm-before-apply for every write tool.`,
      );
    }
  }

  private validateAvailableIn<TInput>(tool: AIToolWithMetadata<TInput>): void {
    if (this.boundController === undefined) return;
    const name = tool.sdkTool.name;
    const source = tool.metadata._viewRegistry;
    // Order matters: with NO controller, boundRegistry is undefined, so the
    // pairing check below would also fire — and tell the consumer to fix a
    // registry mismatch when the real problem is a missing controller.
    // A views-typed tool's handler is called with the live view state the
    // engine injects from the bound controller. Without a controller there
    // is nothing to inject, and the handler would read undefined — same
    // class of silent breakage as an ungated availableIn, so it fails the
    // same way, at construction.
    if (source !== undefined && this.boundController === null) {
      throw new Error(
        `Tool "${name}" declares a views registry but the chat has no viewController — there would be no live view state to inject into its handler.`,
      );
    }
    // Registry pairing, not just ids: a tool typed against registry A
    // declares handler types for A's params/context. Registered on a chat
    // gating against registry B, a coincidentally-matching view id would
    // pass the gate and hand the handler a differently-shaped view. Note
    // this compares the INERT registries — two CONTROLLERS over the same
    // registry are fine, because handlers close over neither.
    if (source !== undefined && source !== this.boundRegistry) {
      throw new Error(
        `Tool "${name}" was typed against a DIFFERENT view registry than this chat's viewController tracks. Pass the same defineAIViews registry to createAITool's \`views\` and to createAIViewController.`,
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
    this.validateApprovalPolicy(tool);
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

// Consumer label callbacks run in the turn's extent — a throw must degrade
// to the fallback, never reject the loop (a rejection there escapes with no
// tool_result appended and the finally-only save persists a dangling
// tool_use; hardened alongside Phase 4 review H1).
function safeLabel(
  source: string | ((input: unknown) => string) | undefined,
  input: unknown,
  fallback: string | undefined,
): string | undefined {
  if (source === undefined) return fallback;
  if (typeof source === "string") return source;
  try {
    return source(input);
  } catch (err) {
    console.error(
      "AI tool label callback threw; using the default label. A label callback must never fail a turn.",
      err,
    );
    return fallback;
  }
}

// One block's in-progress item. Used by getInProgressItems for the upfront
// batch and by the chat loop for awaitsUserAction tools at block start.
export function buildInProgressItem(
  block: { name: string; input: unknown },
  toolRegistry: ToolRegistry,
): DisplayItem {
  const metadata = toolRegistry.getMetadata(block.name);
  const label = safeLabel(
    metadata?.inProgressLabel,
    block.input,
    // Fall back to built-in tool labels
    SERVER_TOOL_LABELS[block.name],
  );

  return {
    type: "tool_in_progress" as const,
    toolName: block.name,
    toolInput: block.input,
    label,
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

  return toolUseBlocks
    // awaitsUserAction tools (approval, ask_user_questions) are excluded
    // from the upfront batch: their card is created when their block STARTS
    // executing, so an interactive card never renders before its resolver
    // is wired and never shows alongside a generic spinner.
    .filter((block) =>
      toolRegistry.getMetadata(block.name)?.awaitsUserAction !== true
    )
    .map((block) => buildInProgressItem(block, toolRegistry));
}

export async function processToolUses(
  content: ContentBlock[],
  toolRegistry: ToolRegistry,
  // Live view accessor from the chat's controller, injected into every
  // handler at execution (undefined for a chat with no view controller).
  // Handlers see a snapshot: createAITool calls it once, at handler entry.
  getView?: () => unknown,
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
        // Prefer the engine entry point (carries the live view); a
        // hand-constructed consumer tool that only has run() still works.
        const sdk = toolWithMetadata.sdkTool;
        const result = sdk.runWithView
          ? await sdk.runWithView(block.input, getView)
          : await sdk.run(block.input);
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

      const errorLabel = safeLabel(
        metadata?.errorMessage,
        toolBlock.input,
        `Tool feedback: ${toolBlock.name}`,
      )!;

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
      const message = safeLabel(
        metadata?.successMessage ?? metadata?.completionMessage,
        toolBlock.input,
        `Tool success: ${toolBlock.name}`,
      )!;

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
