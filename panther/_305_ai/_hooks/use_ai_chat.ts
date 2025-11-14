// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, useContext } from "solid-js";
import { callAIAPI } from "../_core/api_client.ts";
import { callAIAPIStreaming } from "../_core/api_client_streaming.ts";
import {
  clearConversationStore,
  getOrCreateConversationStore,
} from "../_core/conversation_store.ts";
import { getDisplayItemsFromMessage } from "../_core/display_items.ts";
import {
  getInProgressItems,
  processToolUses,
  ToolRegistry,
} from "../_core/tool_engine.ts";
import type {
  AIChatConfig,
  AnthropicResponse,
  DisplayItem,
  MessageParam,
  StreamEvent,
  Usage,
} from "../_core/types.ts";

export const AIChatConfigContext = createContext<AIChatConfig>();

export function useAIChat(configOverride?: Partial<AIChatConfig>) {
  const contextConfig = useContext(AIChatConfigContext);
  const configMaybe = configOverride
    ? { ...contextConfig, ...configOverride }
    : contextConfig;

  if (!configMaybe || !configMaybe.apiConfig || !configMaybe.modelConfig) {
    throw new Error(
      "useAIChat requires apiConfig and modelConfig. Either pass them directly or use AIChatProvider.",
    );
  }

  const config = configMaybe as
    & Required<
      Pick<AIChatConfig, "apiConfig" | "modelConfig">
    >
    & AIChatConfig;

  const conversationId = config.conversationId ?? "default";
  const store = getOrCreateConversationStore(conversationId);

  const [messages, setMessages] = store.messages;
  const [displayItems, setDisplayItems] = store.displayItems;
  const [isLoading, setIsLoading] = store.isLoading;
  const [isStreaming, setIsStreaming] = store.isStreaming;
  const [error, setError] = store.error;
  const [usage, setUsage] = store.usage;
  const [currentStreamingText, setCurrentStreamingText] = store
    .currentStreamingText;
  const [usageHistory, setUsageHistory] = store.usageHistory;

  const toolRegistry = new ToolRegistry();
  if (config.tools) {
    config.tools.forEach((tool) => toolRegistry.register(tool));
  }

  const addDisplayItems = (items: DisplayItem[]) => {
    setDisplayItems([...displayItems(), ...items]);
  };

  const processMessageForDisplay = (message: MessageParam) => {
    const items = getDisplayItemsFromMessage(message, toolRegistry);
    addDisplayItems(items);
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      ...config.modelConfig,
    };

    if (config.system) {
      payload.system = config.system;
    }

    return payload;
  };

  async function sendMessageBlocking(
    userMessage: string,
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    const userMsg: MessageParam = {
      role: "user",
      content: userMessage,
    };

    const newMessages = [...messages(), userMsg];
    setMessages(newMessages);
    setError(null);

    if (userMessage.trim()) {
      processMessageForDisplay(userMsg);
    }

    setIsLoading(true);

    try {
      const payload = {
        ...buildPayload(),
        ...additionalPayload,
      };

      const response = await callAIAPI(
        config.apiConfig,
        newMessages,
        toolRegistry.getDefinitions(),
        conversationId,
        payload,
      );

      if (response.usage) {
        setUsage(response.usage);
        setUsageHistory([...usageHistory(), response.usage]);
      }

      const assistantMsg: MessageParam = {
        role: "assistant",
        content: response.content,
      };

      setMessages([...messages(), assistantMsg]);
      processMessageForDisplay(assistantMsg);

      if (response.stop_reason === "tool_use") {
        await handleToolUse(response, payload);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      addDisplayItems([
        {
          type: "tool_error",
          toolName: "system",
          errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessageStreaming(
    userMessage: string,
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    const userMsg: MessageParam = {
      role: "user",
      content: userMessage,
    };

    const newMessages = [...messages(), userMsg];
    setMessages(newMessages);
    setError(null);

    if (userMessage.trim()) {
      processMessageForDisplay(userMsg);
    }

    setIsLoading(true);
    setIsStreaming(true);
    setCurrentStreamingText("");

    try {
      const payload = {
        ...buildPayload(),
        ...additionalPayload,
      };

      await callAIAPIStreaming(
        config.apiConfig,
        newMessages,
        toolRegistry.getDefinitions(),
        conversationId,
        payload,
        (event: StreamEvent) => {
          handleStreamEvent(event);
        },
        async (response: AnthropicResponse) => {
          setIsStreaming(false);
          setCurrentStreamingText(null);

          if (response.usage) {
            setUsage(response.usage);
            setUsageHistory([...usageHistory(), response.usage]);
          }

          const assistantMsg: MessageParam = {
            role: "assistant",
            content: response.content,
          };

          setMessages([...messages(), assistantMsg]);
          processMessageForDisplay(assistantMsg);

          if (response.stop_reason === "tool_use") {
            await handleToolUse(response, payload);
          }
        },
        (err: Error) => {
          setIsStreaming(false);
          setCurrentStreamingText(null);
          const errorMessage = err.message;
          setError(errorMessage);
          addDisplayItems([
            {
              type: "tool_error",
              toolName: "system",
              errorMessage,
            },
          ]);
        },
      );
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setCurrentStreamingText(null);
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        setCurrentStreamingText(
          (currentStreamingText() ?? "") + event.delta.text,
        );
      }
    }
  }

  async function handleToolUse(
    response: AnthropicResponse,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const inProgressItems = getInProgressItems(
      response.content,
      toolRegistry,
    );

    addDisplayItems(inProgressItems);

    const { results, errorItems } = await processToolUses(
      response.content,
      toolRegistry,
    );

    setDisplayItems(
      displayItems().filter((item: DisplayItem) =>
        item.type !== "tool_in_progress"
      ),
    );

    if (errorItems.length > 0) {
      addDisplayItems(errorItems);
    }

    if (results.length > 0) {
      setMessages([...messages(), { role: "user", content: results }]);
      return sendMessage("", payload);
    }
  }

  async function sendMessage(
    userMessage: string,
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    if (config.enableStreaming) {
      return sendMessageStreaming(userMessage, additionalPayload);
    } else {
      return sendMessageBlocking(userMessage, additionalPayload);
    }
  }

  function clearConversation() {
    clearConversationStore(conversationId);
  }

  return {
    messages,
    displayItems,
    isLoading,
    isStreaming,
    error,
    usage,
    currentStreamingText,
    usageHistory,
    sendMessage,
    clearConversation,
    toolRegistry,
  };
}
