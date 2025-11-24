// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, useContext } from "solid-js";
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
  DisplayItem,
  MessageParam,
  Usage,
} from "../_core/types.ts";

export const AIChatConfigContext = createContext<AIChatConfig>();

export function createAIChat(configOverride?: Partial<AIChatConfig>) {
  const contextConfig = useContext(AIChatConfigContext);
  const configMaybe = configOverride
    ? { ...contextConfig, ...configOverride }
    : contextConfig;

  if (!configMaybe || !configMaybe.sdkClient || !configMaybe.modelConfig) {
    throw new Error(
      "createAIChat requires sdkClient and modelConfig. Either pass them directly or use AIChatProvider.",
    );
  }

  const config = configMaybe as
    & Required<
      Pick<AIChatConfig, "sdkClient" | "modelConfig">
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
  const [currentStreamingText, setCurrentStreamingText] = store
    .currentStreamingText;
  const [usageHistory, setUsageHistory] = store.usageHistory;

  const toolRegistry = new ToolRegistry();
  if (config.tools) {
    config.tools.forEach((tool) => toolRegistry.register(tool));
  }

  // Merge custom tools (SDK betaZodTools) with built-in tools (web_search, bash, etc.)
  const allTools = [
    ...toolRegistry.getSDKTools(),
    ...(config.builtInTools || []),
  ];

  const addDisplayItems = (items: DisplayItem[]) => {
    setDisplayItems([...displayItems(), ...items]);
  };

  const processMessageForDisplay = (message: MessageParam) => {
    const items = getDisplayItemsFromMessage(message, toolRegistry);
    addDisplayItems(items);
  };

  async function sendMessageBlocking(
    userMessage: string | undefined,
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
    setIsProcessingTools(true);

    try {
      // Use SDK's toolRunner - it handles the entire tool loop automatically
      const result = await config.sdkClient.beta.messages.toolRunner({
        model: config.modelConfig.model,
        max_tokens: config.modelConfig.max_tokens,
        temperature: config.modelConfig.temperature,
        messages: messages(),
        tools: allTools,
        system: config.system,
      });

      // Update usage
      if (result.usage) {
        setUsage(result.usage);
        setUsageHistory([...usageHistory(), result.usage]);
      }

      // Add assistant message to conversation
      const assistantMsg: MessageParam = {
        role: "assistant",
        // Cast SDK content blocks to our ContentBlock type
        // SDK may include additional block types (thinking, image) we don't handle
        content: result.content as any,
      };

      setMessages([...messages(), assistantMsg]);
      processMessageForDisplay(assistantMsg);
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
    setIsStreaming(true);
    setCurrentStreamingText(undefined);

    try {
      await streamWithToolLoop(messages());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsStreaming(false);
      setCurrentStreamingText(undefined);
      addDisplayItems([
        {
          type: "tool_error",
          toolName: "system",
          errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setCurrentStreamingText(undefined);
      setIsProcessingTools(false);
    }
  }

  async function streamWithToolLoop(
    currentMessages: MessageParam[],
  ): Promise<void> {
    // Use SDK's streaming
    const stream = config.sdkClient.messages.stream({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      messages: currentMessages,
      tools: allTools,
      system: config.system,
    });

    // Subscribe to text events
    stream.on("text", (text) => {
      setCurrentStreamingText((prev) => (prev ?? "") + text);
    });

    // Wait for completion
    const finalMessage = await stream.finalMessage();

    // Update usage
    if (finalMessage.usage) {
      setUsage(finalMessage.usage);
      setUsageHistory([...usageHistory(), finalMessage.usage]);
    }

    // Add assistant message
    const assistantMsg: MessageParam = {
      role: "assistant",
      content: finalMessage.content as any,
    };

    const updatedMessages = [...currentMessages, assistantMsg];
    setMessages(updatedMessages);
    processMessageForDisplay(assistantMsg);

    // Clear streaming state immediately after message is processed
    setIsStreaming(false);
    setCurrentStreamingText(undefined);

    // Handle tool execution manually since streaming doesn't support toolRunner
    if (finalMessage.stop_reason === "tool_use") {
      setIsProcessingTools(true);

      // Show in-progress items
      const inProgressItems = getInProgressItems(
        finalMessage.content as any,
        toolRegistry,
      );
      addDisplayItems(inProgressItems);

      // Execute tools
      const { results, errorItems } = await processToolUses(
        finalMessage.content as any,
        toolRegistry,
      );

      // Add error items to display
      if (errorItems.length > 0) {
        addDisplayItems(errorItems);
      }

      // Add tool results to messages
      const toolResultMsg: MessageParam = {
        role: "user",
        content: results,
      };

      const messagesWithToolResults = [...updatedMessages, toolResultMsg];
      setMessages(messagesWithToolResults);

      // Continue streaming with tool results (recursive call)
      setIsStreaming(true);
      setCurrentStreamingText(undefined);
      await streamWithToolLoop(messagesWithToolResults);
    }
  }

  async function sendMessage(userMessage: string | undefined): Promise<void> {
    if (config.enableStreaming) {
      return sendMessageStreaming(userMessage);
    } else {
      return sendMessageBlocking(userMessage);
    }
  }

  async function sendMessages(userMessages: string[]): Promise<void> {
    if (userMessages.length === 0) return;

    // Add all user messages to conversation
    const messagesToAdd: MessageParam[] = userMessages.map((text) => ({
      role: "user",
      content: text,
    }));

    const newMessages = [...messages(), ...messagesToAdd];
    setMessages(newMessages);
    setError(null);

    if (config.enableStreaming) {
      return sendMessageStreaming(undefined);
    } else {
      return sendMessageBlocking(undefined);
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
