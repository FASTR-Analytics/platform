// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, For, Match, Show, Switch } from "solid-js";
import type { CustomMarkdownStyleOptions } from "../deps.ts";
import type { ToolRegistry } from "../_core/tool_engine.ts";
import type {
  DisplayItem,
  DisplayRegistry,
  MessageStyle,
} from "../_core/types.ts";
import { AssistantCompletedTextRenderer } from "./_renderers/assistant_completed_text_renderer.tsx";
import { AssistantStreamingTextRenderer } from "./_renderers/assistant_streaming_text_renderer.tsx";
import { DefaultRenderer } from "./_renderers/default_renderer.tsx";
import { SpinningCursor } from "./_renderers/spinning_cursor.tsx";
import { SystemNoticeRenderer } from "./_renderers/system_notice_renderer.tsx";
import { ThinkingSummaryRenderer } from "./_renderers/thinking_summary_renderer.tsx";
import { ToolErrorRenderer } from "./_renderers/tool_error_renderer.tsx";
import { ToolLoadingRenderer } from "./_renderers/tool_loading_renderer.tsx";
import { ToolSuccessRenderer } from "./_renderers/tool_success_renderer.tsx";
import { UserTextRenderer } from "./_renderers/user_text_renderer.tsx";

type Props = {
  displayItems: DisplayItem[];
  isLoading: boolean;
  isStreaming?: boolean;
  currentStreamingText?: string | undefined;
  serverToolLabel?: string | undefined;
  // Queued-but-unsent user texts, rendered as a derived tail below the
  // display items — they come straight from the conversation's queue signal,
  // so clearing the queue clears the bubbles by construction and nothing
  // unsent can persist.
  queuedTexts?: string[];
  customRenderers?: DisplayRegistry;
  fallbackContent?: Component;
  toolRegistry: ToolRegistry;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
};

export function MessageList(p: Props) {
  const renderItem = (item: DisplayItem) => {
    const registry = p.customRenderers ?? {};

    switch (item.type) {
      case "user_text": {
        const Renderer = registry.userText ?? UserTextRenderer;
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
          AssistantCompletedTextRenderer;
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
        const Renderer = registry.toolLoading ?? ToolLoadingRenderer;
        return <Renderer item={item} />;
      }
      case "tool_success": {
        const Renderer = registry.toolSuccess ?? ToolSuccessRenderer;
        return <Renderer item={item} />;
      }
      case "tool_error": {
        const Renderer = registry.toolError ?? ToolErrorRenderer;
        return <Renderer item={item} />;
      }
      case "system_notice": {
        const Renderer = registry.systemNotice ?? SystemNoticeRenderer;
        return <Renderer item={item} />;
      }
      case "thinking_summary": {
        const Renderer = registry.thinkingSummary ?? ThinkingSummaryRenderer;
        return <Renderer item={item} />;
      }
      case "tool_display": {
        const toolWithMetadata = p.toolRegistry.get(item.toolName);
        if (toolWithMetadata?.metadata.displayComponent) {
          const DisplayComponent = toolWithMetadata.metadata.displayComponent;
          return <DisplayComponent input={item.input} />;
        }
        return null;
      }
      default: {
        const Renderer = registry.default ?? DefaultRenderer;
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
                AssistantStreamingTextRenderer;
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
              toolInProgressItems().length === 0}
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
