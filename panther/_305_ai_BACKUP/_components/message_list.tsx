// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, For, Show } from "solid-js";
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
  currentStreamingText?: string | null;
  customRenderers?: DisplayRegistry;
  fallbackContent?: Component;
  toolRegistry: ToolRegistry;
  renderMarkdown?: boolean;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
  scrollSentinelRef?: (el: HTMLDivElement) => void;
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
        const tool = props.toolRegistry.get(item.toolName);
        if (tool?.displayComponent) {
          return <>{tool.displayComponent({ input: item.input })}</>;
        }
        return null;
      }
      default: {
        const Renderer = registry.default ?? DefaultRenderer;
        return <Renderer item={item} />;
      }
    }
  };

  return (
    <div class="ui-gap flex flex-col">
      <Show
        when={props.displayItems.length > 0 || props.isStreaming}
        fallback={props.fallbackContent ? props.fallbackContent({}) : null}
      >
        <For each={props.displayItems}>{(item) => renderItem(item)}</For>
        <Show when={props.isStreaming}>
          <Show
            when={props.currentStreamingText}
            fallback={
              <div class="text-neutral italic">
                <SpinningCursor class="mr-1 inline-block" />
                Thinking...
              </div>
            }
          >
            <StreamingTextRenderer
              text={props.currentStreamingText!}
              isComplete={false}
              renderMarkdown={props.renderMarkdown}
              assistantMessageStyle={props.assistantMessageStyle}
            />
          </Show>
        </Show>
      </Show>
      <Show
        when={props.isLoading &&
          !props.isStreaming &&
          props.displayItems.every((item) => item.type !== "tool_in_progress")}
      >
        <div class="text-neutral italic">
          <SpinningCursor class="mr-1 inline-block" />
          Thinking...
        </div>
      </Show>
      <div ref={props.scrollSentinelRef} />
    </div>
  );
};
