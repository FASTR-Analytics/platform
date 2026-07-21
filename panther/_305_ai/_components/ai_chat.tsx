// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Component,
  createSignal,
  type JSX,
  onMount,
  Show,
  useContext,
} from "solid-js";
import {
  type AnthropicModel,
  type CustomMarkdownStyleOptions,
  lastMessageHasUnresolvedToolUse,
  t3,
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
  onScrollReady?: (scrollToBottom: (force?: boolean) => void) => void;
};

export function AIChat(p: Props) {
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
    stopGeneration,
    toolRegistry,
    enqueueMessage,
    clearQueue,
    queuedMessages,
    pendingUserAction,
    decideApproval,
    clearInProgressItems,
  } = createAIChat();
  const [inputValue, setInputValue] = createSignal("");

  const handleStop = () => {
    clearQueue();
    stopGeneration();
  };

  let scrollContainer: HTMLDivElement | undefined;

  const { checkScrollPosition, scrollToBottom } = createScrollManager(
    () => scrollContainer,
    () => [
      displayItems(),
      isLoading(),
      currentStreamingText(),
      queuedMessages(),
    ],
    { enabled: p.autoScroll ?? true },
  );

  onMount(() => {
    if (p.onScrollReady) {
      p.onScrollReady(scrollToBottom);
    }
  });

  const handleSubmit = () => {
    let message = inputValue().trim();
    if (!message) return;

    setInputValue("");

    // Call onBeforeSubmit if provided (allows prepending context)
    if (p.onBeforeSubmit) {
      message = p.onBeforeSubmit(message);
    }

    // Check if we should queue (loading, processing tools, or unresolved tools)
    const msgs = messages();
    const hasUnresolvedTools = lastMessageHasUnresolvedToolUse(msgs);

    if (isLoading() || isProcessingTools() || hasUnresolvedTools) {
      enqueueMessage(message);
      if (isProcessingTools()) clearInProgressItems();
    } else {
      sendMessage(message);
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
    <div class={p.containerClass ?? "flex h-full w-full flex-col"}>
      {p.headerContent}
      <div
        ref={scrollContainer}
        data-ai-messages-container
        class={p.messagesClass ??
          "ui-pad h-0 w-full flex-1 overflow-y-auto"}
        onScroll={checkScrollPosition}
      >
        <MessageList
          displayItems={displayItems()}
          isLoading={isLoading()}
          isStreaming={isStreaming()}
          currentStreamingText={currentStreamingText()}
          serverToolLabel={serverToolLabel()}
          queuedTexts={queuedMessages()}
          customRenderers={p.customRenderers}
          fallbackContent={p.fallbackContent}
          toolRegistry={toolRegistry}
          onApprovalDecide={decideApproval}
          userMessageStyle={config?.messageStyles?.user}
          assistantMessageStyle={config?.messageStyles?.assistant}
          markdownStyle={p.markdownStyle}
        />
      </div>
      <Show when={p.showUsage && usage() && p.model}>
        <div class="ui-pad-sm border-t">
          <UsageDisplay
            usage={usage()}
            model={p.model!}
            showCost={p.showCost}
            compact
          />
        </div>
      </Show>
      {p.footerContent}
      <Show when={pendingUserAction()}>
        {
          /* Queue-behind's one failure mode is the user TYPING consent
            instead of clicking Accept — their message then waits behind a
            decision that waits for them. The hint carries the mitigation;
            correctness never depends on it. */
        }
        <div
          class="text-base-content-muted px-4 pb-1 text-xs italic"
          data-ai-pending-decision-hint
        >
          {t3({
            en:
              "Waiting for your decision above — new messages will be answered after you decide.",
            fr:
              "En attente de votre décision ci-dessus — les nouveaux messages seront traités après votre décision.",
            pt:
              "A aguardar a sua decisão acima — as novas mensagens serão respondidas depois de decidir.",
          })}
        </div>
      </Show>
      <MessageInput
        value={inputValue()}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        onStop={handleStop}
        isGenerating={isLoading()}
        placeholder={p.placeholder}
        submitLabel={p.submitLabel}
        height={p.inputHeight}
      />
    </div>
  );
}
