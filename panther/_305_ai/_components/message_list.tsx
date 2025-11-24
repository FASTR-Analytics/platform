// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, For, Match, Show, Switch } from "solid-js";
import type { ToolRegistry } from "../_core/tool_engine.ts";
import type {
  DisplayItem,
  DisplayRegistry,
  MessageStyle,
} from "../_core/types.ts";
import { DefaultRenderer } from "./_renderers/default_renderer.tsx";
import { SpinningCursor } from "./_renderers/spinning_cursor.tsx";
import { StreamingTextRenderer } from "./_renderers/streaming_text_renderer.tsx";
import { TextRenderer } from "./_renderers/text_renderer.tsx";
import { ToolErrorRenderer } from "./_renderers/tool_error_renderer.tsx";
import { ToolLoadingRenderer } from "./_renderers/tool_loading_renderer.tsx";

type Props = {
  displayItems: DisplayItem[];
  isLoading: boolean;
  isStreaming?: boolean;
  currentStreamingText?: string | undefined;
  customRenderers?: DisplayRegistry;
  fallbackContent?: Component;
  toolRegistry: ToolRegistry;
  renderMarkdown?: boolean;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
};

export const MessageList: Component<Props> = (props) => {
  const renderItem = (item: DisplayItem) => {
    const registry = props.customRenderers ?? {};

    switch (item.type) {
      case "text": {
        const Renderer = registry.text ?? TextRenderer;
        return (
          <Renderer
            item={item}
            renderMarkdown={props.renderMarkdown}
            userMessageStyle={props.userMessageStyle}
            assistantMessageStyle={props.assistantMessageStyle}
          />
        );
      }
      case "tool_in_progress": {
        const Renderer = registry.toolLoading ?? ToolLoadingRenderer;
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
            <StreamingTextRenderer
              text={props.currentStreamingText!}
              isComplete={false}
              renderMarkdown={props.renderMarkdown}
              assistantMessageStyle={props.assistantMessageStyle}
            />
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
