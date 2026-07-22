// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Accessor } from "solid-js";
import type {
  Anthropic,
  AnthropicModelConfig,
  CacheControl,
  Component,
  CustomMarkdownStyleOptions,
  MessageParam,
  SystemNoticeType,
  Usage,
} from "../deps.ts";
import type { BuiltInToolsConfig } from "./builtin_tools.ts";
import type {
  AIToolWithMetadata,
  ApprovalPolicy,
  ProposalPreview,
} from "./tool_helpers.ts";
import type { AIViewController } from "./views.ts";

////////////////////////////////////////////////////////////////////////////////
// TOOL TYPES (UI-SPECIFIC)
////////////////////////////////////////////////////////////////////////////////

export type AIToolHandler<TInput = unknown, TOutput = string> = (
  input: TInput,
) => Promise<TOutput>;

export type AITool<TInput = unknown, TOutput = string> = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
    [key: string]: unknown;
  };
  handler: AIToolHandler<TInput, TOutput>;
  displayComponent?: Component<{ input: TInput }>;
  inProgressLabel?: string | ((input: TInput) => string);
};

////////////////////////////////////////////////////////////////////////////////
// DISPLAY ITEM TYPES
////////////////////////////////////////////////////////////////////////////////

export type DisplayItem =
  | {
    type: "user_text";
    text: string;
  }
  | {
    type: "assistant_text";
    text: string;
  }
  | {
    type: "tool_in_progress";
    toolName: string;
    toolInput: unknown;
    label?: string;
  }
  | {
    type: "tool_success";
    toolName: string;
    toolInput: unknown;
    message: string;
    result: string;
  }
  | {
    type: "tool_error";
    toolName: string;
    errorMessage: string;
    errorDetails: string;
    errorStack?: string;
    // True when the handler threw AIToolFailure (expected, model-correctable).
    expected?: boolean;
    toolInput?: unknown;
  }
  | {
    type: "tool_display";
    toolName: string;
    input: unknown;
  }
  // Non-error turn outcomes surfaced by the API (refusal, truncation,
  // context exceeded, continuation caps) — distinct from tool_error, which
  // is reserved for genuine tool/API failures.
  | {
    type: "system_notice";
    noticeType: SystemNoticeType;
    message: string;
    details: string;
  }
  // Thinking summary returned when thinking: {type: "adaptive",
  // display: "summarized"} is configured — rendered collapsed by default.
  | {
    type: "thinking_summary";
    text: string;
  }
  // The pending-approval card (Feature 4): engine-managed, created when its
  // block starts executing, removed in the lifecycle's finally on every
  // exit. NEVER persisted (saveConversation strips it as a backstop). The
  // card is a pure view — the resolver lives on the conversation store's
  // pendingDecision signal, so unmount/remount is inert and deciding works
  // from any instance.
  | {
    type: "approval_pending";
    toolName: string;
    preview: ProposalPreview;
    sessionCheckbox: boolean;
  }
  // The decision record (persisted): auto_declined covers view-exit and
  // stale — the tool result string carries the distinction; the timeline
  // records that the user did not decide.
  | {
    type: "approval_decision";
    toolName: string;
    title: string;
    decision: "approved" | "declined" | "auto_approved" | "auto_declined";
  };

////////////////////////////////////////////////////////////////////////////////
// RENDERER TYPES
////////////////////////////////////////////////////////////////////////////////

export type DisplayItemRenderer<T = unknown> = Component<{ item: T }>;

export type DisplayRegistry = {
  userText?: DisplayItemRenderer<Extract<DisplayItem, { type: "user_text" }>>;
  assistantCompletedText?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "assistant_text" }>
  >;
  assistantStreamingText?: Component<{
    text: string;
    markdownStyle?: CustomMarkdownStyleOptions;
    messageStyle?: MessageStyle;
  }>;
  toolLoading?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "tool_in_progress" }>
  >;
  toolSuccess?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "tool_success" }>
  >;
  toolError?: DisplayItemRenderer<Extract<DisplayItem, { type: "tool_error" }>>;
  systemNotice?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "system_notice" }>
  >;
  thinkingSummary?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "thinking_summary" }>
  >;
  // The pending card gets the decide callback alongside the item — it
  // resolves the store-owned decision (accepted/declined [+ session
  // checkbox]); a no-op once the decision is already resolved.
  approvalPending?: Component<{
    item: Extract<DisplayItem, { type: "approval_pending" }>;
    onDecide: (accepted: boolean, alwaysThisSession?: boolean) => void;
  }>;
  approvalDecision?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "approval_decision" }>
  >;
  default?: DisplayItemRenderer<DisplayItem>;
};

////////////////////////////////////////////////////////////////////////////////
// MESSAGE STYLE TYPES
////////////////////////////////////////////////////////////////////////////////

export type MessageBackgroundColor =
  | "bg-primary/10"
  | "bg-base-200"
  | "bg-success/20";

export type MessageTextColor =
  | "text-primary"
  | "text-base-content"
  | "text-success";

export type MessageStyle = {
  background?: MessageBackgroundColor;
  text?: MessageTextColor;
};

export type MessageStyles = {
  user?: MessageStyle;
  assistant?: MessageStyle;
};

////////////////////////////////////////////////////////////////////////////////
// CHAT CONFIGURATION TYPES
////////////////////////////////////////////////////////////////////////////////

export type DocumentRef = {
  file_id: string;
  title?: string;
};

export type DocumentRefsGetter = () => DocumentRef[];

export type AIChatConfig = {
  sdkClient: Anthropic;

  conversationId?: string;

  scope?: string;

  enablePersistence?: boolean;

  // deno-lint-ignore no-explicit-any
  tools?: AIToolWithMetadata<any>[];

  builtInTools?: BuiltInToolsConfig;

  modelConfig: AnthropicModelConfig;

  system: Accessor<
    string | Array<{ type: "text"; text: string; cache_control?: CacheControl }>
  >;

  messageStyles?: MessageStyles;

  // Handler for built-in text editor tool (str_replace_based_edit_tool)
  // Consumer creates this using createTextEditorHandler from _306_text_editor
  textEditorHandler?: (input: unknown) => string;

  getDocumentRefs?: DocumentRefsGetter;

  getEphemeralContext?: () => string | null;

  // View system (createAIViewController). When present, every turn carries a
  // [Current view: …] section (plus the view's ephemeral promptSection and
  // the consumer hook's context) on EVERY turn-creating path — direct sends,
  // batches, and queue drains. Without it, getEphemeralContext keeps its
  // historical direct-send-only delivery.
  // Both generics any: the second (interactions) must be explicit — its
  // default is Record<never, never>, and the invariant TIDefs phantom would
  // otherwise reject any interaction-adopting controller here.
  // deno-lint-ignore no-explicit-any
  viewController?: AIViewController<any, any>;

  // App-level approval policy (Feature 4): construction throws for any tool
  // tagged kind "write" that has neither approval nor an exempt entry;
  // requireKind additionally makes an undeclared kind a boot-time throw.
  // Enforced on dynamic register() too. Strictly opt-in.
  approvalPolicy?: ApprovalPolicy;
};

////////////////////////////////////////////////////////////////////////////////
// CHAT STATE TYPES
////////////////////////////////////////////////////////////////////////////////

export type ChatState = {
  messages: MessageParam[];
  displayItems: DisplayItem[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  usage: Usage | null;
  currentStreamingText: string | undefined;
  serverToolLabel: string | undefined;
};

////////////////////////////////////////////////////////////////////////////////
// COST ESTIMATION TYPES
////////////////////////////////////////////////////////////////////////////////

export type CostEstimate = {
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  cacheReadCost: number;
  totalCost: number;
  currency: "USD";
};
