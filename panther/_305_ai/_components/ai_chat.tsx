// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Component,
  createEffect,
  createSignal,
  type JSX,
  Show,
  useContext,
} from "solid-js";
import type {
  AnthropicModel,
  CustomMarkdownStyleOptions,
  MessageParam,
} from "../deps.ts";
import { createScrollManager } from "./_scroll_manager.ts";
import { AIChatConfigContext, createAIChat } from "./_create_ai_chat.ts";
import type { DisplayRegistry } from "../_core/types.ts";
import { MessageInput } from "./message_input.tsx";
import { MessageList } from "./message_list.tsx";
import { UsageDisplay } from "./usage_display.tsx";

type Props = {
  customRenderers?: DisplayRegistry;
  placeholder?: string;
  submitLabel?: string;
  inputHeight?: string;
  containerClass?: string;
  messagesClass?: string;
  inputClass?: string;
  fallbackContent?: Component;
  headerContent?: JSX.Element;
  footerContent?: JSX.Element;
  autoScroll?: boolean;
  showUsage?: boolean;
  showCost?: boolean;
  model?: AnthropicModel;
  markdownStyle?: CustomMarkdownStyleOptions;
  onBeforeSubmit?: (userMessage: string) => string;
};

export const AIChat: Component<Props> = (props) => {
  const config = useContext(AIChatConfigContext);
  const {
    messages,
    displayItems,
    isLoading,
    isStreaming,
    isProcessingTools,
    currentStreamingText,
    serverToolLabel,
    usage,
    sendMessage,
    sendMessages,
    toolRegistry,
    processMessageForDisplay,
  } = createAIChat();
  const [inputValue, setInputValue] = createSignal("");
  const [queuedMessages, setQueuedMessages] = createSignal<string[]>([]);

  let scrollContainer: HTMLDivElement | undefined;

  const { checkScrollPosition, scrollToBottom } = createScrollManager(
    () => scrollContainer,
    () => [displayItems(), isLoading(), currentStreamingText()],
    { enabled: props.autoScroll ?? true },
  );

  // Auto-send queued messages when loading completes (but not during tool processing)
  createEffect(() => {
    const loading = isLoading();
    const processingTools = isProcessingTools();
    const queue = queuedMessages();
    const msgs = messages();

    // Check if last message has unresolved tool_use
    const lastMsg = msgs[msgs.length - 1];
    const hasUnresolvedTools = msgs.length > 0 &&
      lastMsg?.role === "assistant" &&
      Array.isArray(lastMsg.content) &&
      lastMsg.content.some((block: any) => block.type === "tool_use");

    if (!loading && !processingTools && queue.length > 0) {
      if (hasUnresolvedTools) {
        // Don't send yet, keep in queue until tools are resolved
        return;
      }
      setQueuedMessages([]);
      sendMessages(queue);
    }
  });

  const handleSubmit = async () => {
    let message = inputValue().trim();
    if (!message) return;

    setInputValue("");

    // Call onBeforeSubmit if provided (allows prepending context)
    if (props.onBeforeSubmit) {
      message = props.onBeforeSubmit(message);
    }

    // Check if we should queue (loading, processing tools, or unresolved tools)
    const msgs = messages();
    const lastMsg = msgs[msgs.length - 1];
    const hasUnresolvedTools = msgs.length > 0 &&
      lastMsg?.role === "assistant" &&
      Array.isArray(lastMsg.content) &&
      lastMsg.content.some((block: any) => block.type === "tool_use");

    if (isLoading() || isProcessingTools() || hasUnresolvedTools) {
      // Queue the message and display it immediately
      setQueuedMessages([...queuedMessages(), message]);

      // Display as user message immediately
      const userMsg: MessageParam = { role: "user", content: message };
      processMessageForDisplay(userMsg);
    } else {
      sendMessage(message); // Don't await - scroll should happen after user message displays, not after assistant responds
    }

    // Force scroll to bottom - immediate and after DOM updates
    scrollToBottom(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    });
  };

  return (
    <div class={props.containerClass ?? "flex h-full w-full flex-col"}>
      {props.headerContent}
      <div
        ref={scrollContainer}
        class={props.messagesClass ??
          "ui-pad h-0 w-full flex-1 overflow-y-auto"}
        onScroll={checkScrollPosition}
      >
        <MessageList
          displayItems={displayItems()}
          isLoading={isLoading()}
          isStreaming={isStreaming()}
          currentStreamingText={currentStreamingText()}
          serverToolLabel={serverToolLabel()}
          customRenderers={props.customRenderers}
          fallbackContent={props.fallbackContent}
          toolRegistry={toolRegistry}
          userMessageStyle={config?.messageStyles?.user}
          assistantMessageStyle={config?.messageStyles?.assistant}
          markdownStyle={props.markdownStyle}
        />
      </div>
      <Show when={props.showUsage && usage() && props.model}>
        <div class="ui-pad-sm border-base-300 border-t">
          <UsageDisplay
            usage={usage()}
            model={props.model!}
            showCost={props.showCost}
            compact={true}
          />
        </div>
      </Show>
      {props.footerContent}
      <MessageInput
        value={inputValue()}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        placeholder={props.placeholder}
        submitLabel={props.submitLabel}
        height={props.inputHeight}
      />
    </div>
  );
};
