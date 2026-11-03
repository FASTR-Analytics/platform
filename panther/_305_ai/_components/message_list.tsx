// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, For, Match, Show, Switch } from "solid-js";
import type { CustomMarkdownStyleOptions } from "../deps.ts";
import type { ToolRegistry } from "../_core/tool_engine.ts";
import type {
  AIChatDisplayRegistry,
  DisplayItem,
  MessageStyle,
} from "../_core/types.ts";
import {
  AIChatApprovalDecision,
  AIChatApprovalPending,
} from "./_renderers/approval.tsx";
import { AIChatAssistantCompletedText } from "./_renderers/assistant_completed_text.tsx";
import { AIChatAssistantStreamingText } from "./_renderers/assistant_streaming_text.tsx";
import { AIChatDefaultItem } from "./_renderers/default_item.tsx";
import { SpinningCursor } from "./_renderers/spinning_cursor.tsx";
import { AIChatSystemNotice } from "./_renderers/system_notice.tsx";
import { AIChatThinkingSummary } from "./_renderers/thinking_summary.tsx";
import { AIChatToolError } from "./_renderers/tool_error.tsx";
import { AIChatToolLoading } from "./_renderers/tool_loading.tsx";
import { AIChatToolSuccess } from "./_renderers/tool_success.tsx";
import { AIChatUserText } from "./_renderers/user_text.tsx";

type Props = {
  displayItems: DisplayItem[];
  isLoading: boolean;
  isStreaming?: boolean;
  // True while the turn is parked on a pending approval decision — the
  // engine is waiting on the USER, so the "Thinking..." fallback must not
  // show (the card/dialog already communicates what is being waited for).
  awaitingDecision?: boolean;
  currentStreamingText?: string | undefined;
  serverToolLabel?: string | undefined;
  // Queued-but-unsent user texts, rendered as a derived tail below the
  // display items — they come straight from the conversation's queue signal,
  // so clearing the queue clears the bubbles by construction and nothing
  // unsent can persist.
  queuedTexts?: string[];
  customRenderers?: AIChatDisplayRegistry;
  fallbackContent?: Component;
  toolRegistry: ToolRegistry;
  // Resolves the ACTIVE conversation's pending approval decision (Feature
  // 4). The card is a pure view — this callback is a no-op once the
  // decision is already resolved.
  onApprovalDecide?: (accepted: boolean, alwaysThisSession?: boolean) => void;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
};

export function MessageList(p: Props) {
  const renderItem = (item: DisplayItem) => {
    const registry = p.customRenderers ?? {};

    switch (item.type) {
      case "user_text": {
        const Renderer = registry.userText ?? AIChatUserText;
        return (
          <Renderer
            item={item}
            messageStyle={p.userMessageStyle}
            markdownStyle={p.markdownStyle}
          />
        );
      }
      case "assistant_text": {
        const Renderer = registry.assistantCompletedText ??
          AIChatAssistantCompletedText;
        return (
          <Renderer
            item={item}
            messageStyle={p.assistantMessageStyle}
            markdownStyle={p.markdownStyle}
          />
        );
      }
      case "tool_in_progress": {
        // Tool-specific inProgressComponent takes priority over global toolLoading renderer
        const toolWithMetadata = p.toolRegistry.get(item.toolName);
        if (toolWithMetadata?.metadata.inProgressComponent) {
          const InProgressComponent =
            toolWithMetadata.metadata.inProgressComponent;
          return <InProgressComponent input={item.toolInput} />;
        }
        const Renderer = registry.toolLoading ?? AIChatToolLoading;
        return <Renderer item={item} />;
      }
      case "tool_success": {
        const Renderer = registry.toolSuccess ?? AIChatToolSuccess;
        return <Renderer item={item} />;
      }
      case "tool_error": {
        const Renderer = registry.toolError ?? AIChatToolError;
        return <Renderer item={item} />;
      }
      case "system_notice": {
        const Renderer = registry.systemNotice ?? AIChatSystemNotice;
        return <Renderer item={item} />;
      }
      case "thinking_summary": {
        const Renderer = registry.thinkingSummary ?? AIChatThinkingSummary;
        return <Renderer item={item} />;
      }
      case "approval_pending": {
        const Renderer = registry.approvalPending ?? AIChatApprovalPending;
        return (
          <Renderer
            item={item}
            onDecide={p.onApprovalDecide ?? (() => {})}
          />
        );
      }
      case "approval_decision": {
        const Renderer = registry.approvalDecision ?? AIChatApprovalDecision;
        return <Renderer item={item} />;
      }
      case "tool_display": {
        const toolWithMetadata = p.toolRegistry.get(item.toolName);
        if (toolWithMetadata?.metadata.displayComponent) {
          const DisplayComponent = toolWithMetadata.metadata.displayComponent;
          return <DisplayComponent input={item.input} view={item.view} />;
        }
        return null;
      }
      default: {
        const Renderer = registry.default ?? AIChatDefaultItem;
        return <Renderer item={item} />;
      }
    }
  };

  const regularItems = () =>
    p.displayItems.filter((item) => item.type !== "tool_in_progress");
  const toolInProgressItems = () =>
    p.displayItems.filter((item) => item.type === "tool_in_progress");

  return (
    <div class="ui-gap flex flex-col">
      <Show
        when={p.displayItems.length > 0 || p.isStreaming ||
          (p.queuedTexts?.length ?? 0) > 0}
        fallback={p.fallbackContent ? p.fallbackContent({}) : null}
      >
        <For each={regularItems()}>{(item) => renderItem(item)}</For>

        <Switch>
          <Match
            when={p.isStreaming && p.currentStreamingText !== undefined}
          >
            {(() => {
              const Renderer = p.customRenderers?.assistantStreamingText ??
                AIChatAssistantStreamingText;
              return (
                <Renderer
                  text={p.currentStreamingText!}
                  messageStyle={p.assistantMessageStyle}
                  markdownStyle={p.markdownStyle}
                />
              );
            })()}
          </Match>
          <Match when={p.serverToolLabel}>
            <div class="text-base-content-muted text-sm italic">
              <SpinningCursor class="mr-1 inline-block" />
              {p.serverToolLabel}
            </div>
          </Match>
          <Match
            when={(p.isStreaming || p.isLoading) &&
              toolInProgressItems().length === 0 && !p.awaitingDecision}
          >
            <div class="text-base-content-muted text-sm italic">
              <SpinningCursor class="mr-1 inline-block" />
              Thinking...
            </div>
          </Match>
        </Switch>

        <For each={toolInProgressItems()}>{(item) => renderItem(item)}</For>

        <For each={p.queuedTexts ?? []}>
          {(text) => renderItem({ type: "user_text", text } as DisplayItem)}
        </For>
      </Show>
    </div>
  );
}
