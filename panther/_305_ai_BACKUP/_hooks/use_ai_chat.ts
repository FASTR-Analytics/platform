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
  const [isProcessingTools, setIsProcessingTools] = store.isProcessingTools;
  const [error, setError] = store.error;
  const [usage, setUsage] = store.usage;
  const [currentStreamingText, setCurrentStreamingText] =
    store.currentStreamingText;
  const [usageHistory, setUsageHistory] = store.usageHistory;

  let activeStreamId = 0;

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
    userMessage: string | undefined,
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    setError(null);

    // Only add user message if provided (undefined means messages already in state)
    if (userMessage !== undefined) {
      const userMsg: MessageParam = {
        role: "user",
        content: userMessage,
      };

      setMessages([...messages(), userMsg]);

      if (userMessage.trim()) {
        processMessageForDisplay(userMsg);
      }
    }

    setIsLoading(true);

    try {
      const payload = {
        ...buildPayload(),
        ...additionalPayload,
      };

      const response = await callAIAPI(
        config.apiConfig,
        messages(),
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
        setIsProcessingTools(true);
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
      setIsProcessingTools(false);
    }
  }

  async function sendMessageStreaming(
    userMessage: string | undefined,
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    const streamId = ++activeStreamId;
    setError(null);

    // Only add user message if provided (undefined means messages already in state)
    if (userMessage !== undefined) {
      const userMsg: MessageParam = {
        role: "user",
        content: userMessage,
      };

      setMessages([...messages(), userMsg]);

      if (userMessage.trim()) {
        processMessageForDisplay(userMsg);
      }
    }

    setIsLoading(true);
    setIsStreaming(true);
    setCurrentStreamingText(undefined);

    try {
      const payload = {
        ...buildPayload(),
        ...additionalPayload,
      };

      await callAIAPIStreaming(
        config.apiConfig,
        messages(),
        toolRegistry.getDefinitions(),
        conversationId,
        payload,
        (event: StreamEvent) => {
          handleStreamEvent(event);
        },
        async (response: AnthropicResponse) => {
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

          // Clear streaming state immediately after message is processed
          setIsStreaming(false);
          setCurrentStreamingText(undefined);

          if (response.stop_reason === "tool_use") {
            setIsProcessingTools(true);
            await handleToolUse(response, payload);
          }
        },
        (err: Error) => {
          if (streamId !== activeStreamId) {
            return;
          }
          setIsStreaming(false);
          setCurrentStreamingText(undefined);
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
      // Check activeStreamId before each state update to prevent race conditions
      if (streamId === activeStreamId) {
        setIsLoading(false);
      }
      if (streamId === activeStreamId) {
        setIsStreaming(false);
      }
      if (streamId === activeStreamId) {
        setCurrentStreamingText(undefined);
      }
      if (streamId === activeStreamId) {
        setIsProcessingTools(false);
      }
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        const current = currentStreamingText() ?? "";
        const newText = current + event.delta.text;
        setCurrentStreamingText(newText);
      }
    }
  }

  async function handleToolUse(
    response: AnthropicResponse,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const inProgressItems = getInProgressItems(response.content, toolRegistry);

    addDisplayItems(inProgressItems);

    const { results, errorItems } = await processToolUses(
      response.content,
      toolRegistry,
    );

    setDisplayItems(
      displayItems().filter(
        (item: DisplayItem) => item.type !== "tool_in_progress",
      ),
    );

    if (errorItems.length > 0) {
      addDisplayItems(errorItems);
    }

    if (results.length > 0) {
      setMessages([...messages(), { role: "user", content: results }]);
      await sendMessage(undefined, payload);
    }
  }

  async function sendMessage(
    userMessage: string | undefined,
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    if (config.enableStreaming) {
      return sendMessageStreaming(userMessage, additionalPayload);
    } else {
      return sendMessageBlocking(userMessage, additionalPayload);
    }
  }

  async function sendMessages(
    userMessages: string[],
    additionalPayload?: Record<string, unknown>,
  ): Promise<void> {
    if (userMessages.length === 0) return;

    // Add all user messages to conversation
    const messagesToAdd: MessageParam[] = userMessages.map((text) => ({
      role: "user",
      content: text,
    }));

    const newMessages = [...messages(), ...messagesToAdd];
    setMessages(newMessages);
    setError(null);

    // Note: Display happens via processMessageForDisplay in component
    // when messages are queued, so we don't call it here

    if (config.enableStreaming) {
      return sendMessageStreaming(undefined, additionalPayload);
    } else {
      return sendMessageBlocking(undefined, additionalPayload);
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
    isProcessingTools,
    error,
    usage,
    currentStreamingText,
    usageHistory,
    sendMessage,
    sendMessages,
    clearConversation,
    toolRegistry,
    processMessageForDisplay,
  };
}
