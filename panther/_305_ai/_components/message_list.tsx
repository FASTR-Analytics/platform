// Copyright 2023-2025, Tim Roberton, All rights reserved.
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
  customRenderers?: DisplayRegistry;
  fallbackContent?: Component;
  toolRegistry: ToolRegistry;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
};

export const MessageList: Component<Props> = (props) => {
  const renderItem = (item: DisplayItem) => {
    const registry = props.customRenderers ?? {};

    switch (item.type) {
      case "user_text": {
        const Renderer = registry.userText ?? UserTextRenderer;
        return (
          <Renderer
            item={item}
            messageStyle={props.userMessageStyle}
            markdownStyle={props.markdownStyle}
          />
        );
      }
      case "assistant_text": {
        const Renderer = registry.assistantCompletedText ??
          AssistantCompletedTextRenderer;
        return (
          <Renderer
            item={item}
            messageStyle={props.assistantMessageStyle}
            markdownStyle={props.markdownStyle}
          />
        );
      }
      case "tool_in_progress": {
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
      case "tool_display": {
        const toolWithMetadata = props.toolRegistry.get(item.toolName);
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
    props.displayItems.filter((item) => item.type !== "tool_in_progress");
  const toolInProgressItems = () =>
    props.displayItems.filter((item) => item.type === "tool_in_progress");

  return (
    <div class="ui-gap flex flex-col">
      <Show
        when={props.displayItems.length > 0 || props.isStreaming}
        fallback={props.fallbackContent ? props.fallbackContent({}) : null}
      >
        <For each={regularItems()}>{(item) => renderItem(item)}</For>

        <Switch>
          <Match
            when={props.isStreaming && props.currentStreamingText !== undefined}
          >
            {(() => {
              const Renderer = props.customRenderers?.assistantStreamingText ??
                AssistantStreamingTextRenderer;
              return (
                <Renderer
                  text={props.currentStreamingText!}
                  messageStyle={props.assistantMessageStyle}
                  markdownStyle={props.markdownStyle}
                />
              );
            })()}
          </Match>
          <Match when={props.serverToolLabel}>
            <div class="text-neutral italic">
              <SpinningCursor class="mr-1 inline-block" />
              {props.serverToolLabel}
            </div>
          </Match>
          <Match
            when={(props.isStreaming || props.isLoading) &&
              toolInProgressItems().length === 0}
          >
            <div class="text-neutral italic">
              <SpinningCursor class="mr-1 inline-block" />
              Thinking...
            </div>
          </Match>
        </Switch>

        <For each={toolInProgressItems()}>{(item) => renderItem(item)}</For>
      </Show>
    </div>
  );
};
