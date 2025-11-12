// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Component,
  createSignal,
  type JSX,
  Show,
  useContext,
} from "solid-js";
import { useScrollManager } from "../_hooks/use_scroll_manager.ts";
import { AIChatConfigContext, useAIChat } from "../_hooks/use_ai_chat.ts";
import type { AnthropicModel, DisplayRegistry } from "../_core/types.ts";
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
};

export const AIChat: Component<Props> = (props) => {
  const config = useContext(AIChatConfigContext);
  const {
    displayItems,
    isLoading,
    isStreaming,
    currentStreamingText,
    usage,
    sendMessage,
    toolRegistry,
  } = useAIChat();
  const [inputValue, setInputValue] = createSignal("");

  let scrollContainer: HTMLDivElement | undefined;

  const { checkScrollPosition } = useScrollManager(
    () => scrollContainer,
    () => [displayItems(), isLoading(), currentStreamingText()],
    { enabled: props.autoScroll ?? true },
  );

  const handleSubmit = async () => {
    const message = inputValue().trim();
    if (!message || isLoading()) return;

    setInputValue("");
    await sendMessage(message);
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
          customRenderers={props.customRenderers}
          fallbackContent={props.fallbackContent}
          toolRegistry={toolRegistry}
          userMessageClass={config?.userMessageClass}
          assistantMessageClass={config?.assistantMessageClass}
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
        disabled={isLoading()}
        placeholder={props.placeholder}
        submitLabel={props.submitLabel}
        height={props.inputHeight}
      />
    </div>
  );
};
