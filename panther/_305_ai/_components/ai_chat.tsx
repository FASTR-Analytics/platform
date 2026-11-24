// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  type Component,
  createMemo,
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
import {
  getRecallDirection,
  getRecallHistory,
  getRecallStep,
  type RecallCaret,
  type RecallKey,
  type RecallWalk,
} from "./_input_recall.ts";
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
  contentWidth?: string;
  containerClass?: string;
  messagesClass?: string;
  inputClass?: string;
  fallbackContent?: Component;
  headerContent?: JSX.Element;
  footerContent?: JSX.Element;
  markdownStyle?: CustomMarkdownStyleOptions;
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
  const recallHistory = createMemo(() => getRecallHistory(messages()));
  let recallWalk: RecallWalk | undefined;
  let input: HTMLTextAreaElement | undefined;

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

  // Chromium and WebKit scroll the caret into view when the input gains
  // focus, not when its selection moves, so a focused input is blurred
  // first.
  const showInInput = (text: string, caret: number) => {
    setInputValue(text);
    if (!input) {
      return;
    }
    input.blur();
    input.setSelectionRange(caret, caret);
    input.focus();
  };

  // clearQueue resolves the queued senders' promises: their attempt is over.
  const takeBack = () => {
    const taken = queuedMessages().join("\n\n");
    const draft = inputValue();
    clearQueue();
    recallWalk = undefined;
    showInInput(
      draft.trim() === "" ? taken : `${taken}\n\n${draft}`,
      taken.length,
    );
  };

  const handleRecallKey = (
    key: RecallKey,
    composing: boolean,
    caret: RecallCaret,
  ): boolean => {
    const direction = getRecallDirection(
      key,
      composing,
      caret,
      recallHistory(),
      recallWalk,
    );
    if (!direction) {
      return false;
    }
    if (direction === "older" && queuedMessages().length > 0) {
      takeBack();
      return true;
    }
    const step = getRecallStep(
      recallHistory(),
      recallWalk,
      inputValue(),
      direction,
    );
    if (step) {
      recallWalk = step.walk;
      showInInput(step.text, step.caret);
    }
    return true;
  };

  const handleSubmit = () => {
    const message = inputValue().trim();
    if (!message) return;

    setInputValue("");
    recallWalk = undefined;

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
    <div
      class={p.containerClass ?? "flex h-full w-full flex-col"}
      style={{ "--ai-chat-content-width": p.contentWidth ?? "48rem" }}
    >
      {p.headerContent}
      <div
        ref={ref}
        data-ai-messages-container
        class={p.messagesClass ??
          "ui-pad-y ui-pad-x-beside-side-controls h-0 w-full flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"}
      >
        <MessageList
          displayItems={displayItems()}
          isLoading={isLoading()}
          isStreaming={isStreaming()}
          awaitingDecision={pendingUserAction()}
          streamingItems={streamingItems()}
          queuedTexts={queuedMessages()}
          onTakeBack={takeBack}
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
          class="ui-pad-x-beside-side-controls pb-1"
          data-ai-pending-decision-hint
        >
          <div class="text-base-content-muted mx-auto max-w-(--ai-chat-content-width) text-xs italic">
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
        </div>
      </Show>
      <MessageInput
        ref={(el) => (input = el)}
        value={inputValue()}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        onRecallKey={handleRecallKey}
        onStop={stopGeneration}
        isGenerating={isLoading()}
        placeholder={p.placeholder}
        submitLabel={p.submitLabel}
        height={p.inputHeight}
      />
    </div>
  );
}
