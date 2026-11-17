// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  type Component,
  createSignal,
  type JSX,
  onMount,
  Show,
  useContext,
} from "solid-js";
import { type CustomMarkdownStyleOptions, t3 } from "../deps.ts";
import { createScrollManager } from "./_scroll_manager.ts";
import {
  AIChatConfigContext,
  type AIChatInstance,
  createAIChat,
} from "./_create_ai_chat.ts";
import type { AIChatDisplayRegistry } from "../_core/types.ts";
import { MessageInput } from "./message_input.tsx";
import { MessageList } from "./message_list.tsx";

type Props = {
  // Read once at setup. A pane that needs updateConfig or sendMessage builds
  // the instance itself and passes it here, so the pane and the chat share
  // one registry, one settings copy, one watcher and one queue drain.
  chat?: AIChatInstance;
  customRenderers?: AIChatDisplayRegistry;
  placeholder?: string;
  submitLabel?: string;
  inputHeight?: string;
  containerClass?: string;
  messagesClass?: string;
  inputClass?: string;
  fallbackContent?: Component;
  headerContent?: JSX.Element;
  footerContent?: JSX.Element;
  markdownStyle?: CustomMarkdownStyleOptions;
  onBeforeSubmit?: (userMessage: string) => string;
  onScrollReady?: (scrollToBottom: (force?: boolean) => void) => void;
};

export function AIChat(p: Props) {
  const config = useContext(AIChatConfigContext);
  const {
    displayItems,
    isLoading,
    isStreaming,
    isProcessingTools,
    streamingItems,
    sendMessage,
    stopGeneration,
    toolRegistry,
    enqueueMessage,
    clearQueue,
    queuedMessages,
    pendingUserAction,
    decideApproval,
    clearInProgressItems,
  } = p.chat ?? createAIChat();
  const [inputValue, setInputValue] = createSignal("");

  const handleStop = () => {
    batch(() => {
      clearQueue();
      stopGeneration();
    });
  };

  const { ref, scrollToBottom } = createScrollManager(() => [
    displayItems(),
    isLoading(),
    isStreaming(),
    pendingUserAction(),
    streamingItems(),
    queuedMessages(),
  ]);

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

    if (isLoading() || isProcessingTools()) {
      batch(() => {
        enqueueMessage(message);
        if (isProcessingTools()) clearInProgressItems();
      });
    } else {
      sendMessage(message);
    }

    scrollToBottom(true);
  };

  return (
    <div class={p.containerClass ?? "flex h-full w-full flex-col"}>
      {p.headerContent}
      <div
        ref={ref}
        data-ai-messages-container
        class={p.messagesClass ??
          "ui-pad h-0 w-full flex-1 overflow-y-auto"}
      >
        <MessageList
          displayItems={displayItems()}
          isLoading={isLoading()}
          isStreaming={isStreaming()}
          awaitingDecision={pendingUserAction()}
          streamingItems={streamingItems()}
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
            th:
              "กำลังรอการตัดสินใจของคุณด้านบน ข้อความใหม่จะได้รับการตอบหลังจากคุณตัดสินใจแล้ว",
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
