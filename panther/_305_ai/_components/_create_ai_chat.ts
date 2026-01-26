// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, useContext } from "solid-js";
import type {
  Anthropic,
  ContentBlock,
  DocumentContentBlock,
  MessageParam,
} from "../deps.ts";
import { getBetaHeaders, hasWebFetchTool } from "../_core/beta_headers.ts";
import { resolveBuiltInTools } from "../_core/builtin_tools.ts";
import {
  clearConversationStore,
  getOrCreateConversationStore,
} from "../_core/conversation_store.ts";
import { saveConversation } from "../_core/persistence.ts";
import { getDisplayItemsFromMessage } from "../_core/display_items.ts";
import {
  getInProgressItems,
  processToolUses,
  SERVER_TOOL_LABELS,
  ToolRegistry,
  type ToolResult,
} from "../_core/tool_engine.ts";
import type { AIChatConfig, DisplayItem } from "../_core/types.ts";

// SDK tool union type for API calls
type SDKToolUnion = Anthropic.Messages.ToolUnion;

// Type for tool_use blocks from SDK responses
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

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
  const store = getOrCreateConversationStore(
    conversationId,
    config.enablePersistence ?? true,
  );

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
  const [serverToolLabel, setServerToolLabel] = store.serverToolLabel;

  const toolRegistry = new ToolRegistry();
  if (config.tools) {
    config.tools.forEach((tool) => toolRegistry.register(tool));
  }

  // Merge custom tools (SDK betaZodTools) with built-in tools (web_search, bash, etc.)
  // Cast to SDK's ToolUnion type - built-in tools like web_search have different shapes
  // but are valid for the API
  const allTools = [
    ...toolRegistry.getSDKTools(),
    ...resolveBuiltInTools(config.builtInTools),
  ] as SDKToolUnion[];

  const addDisplayItems = (items: DisplayItem[]) => {
    setDisplayItems([...displayItems(), ...items]);
  };

  const clearInProgressItems = () => {
    setDisplayItems(
      displayItems().filter((item) => item.type !== "tool_in_progress"),
    );
  };

  const messagesContainDocuments = (): boolean => {
    return messages().some((msg) => {
      if (typeof msg.content === "string") return false;
      return msg.content.some((block) => block.type === "document");
    });
  };

  const createUserMessage = (text: string): MessageParam => {
    // Include documents if we have them AND they're not already in the message array
    const shouldIncludeDocuments = !messagesContainDocuments();
    const documentRefs = shouldIncludeDocuments
      ? (config.getDocumentRefs?.() || [])
      : [];
    if (documentRefs.length === 0) {
      return { role: "user", content: text };
    }

    const documentBlocks: DocumentContentBlock[] = documentRefs.map((ref) => ({
      type: "document" as const,
      source: { type: "file" as const, file_id: ref.file_id },
      title: ref.title,
      cache_control: { type: "ephemeral" as const },
    }));

    return {
      role: "user",
      content: [
        ...documentBlocks,
        { type: "text" as const, text },
      ],
    };
  };

  const processMessageForDisplay = (message: MessageParam) => {
    const items = getDisplayItemsFromMessage(message, toolRegistry);
    addDisplayItems(items);
  };

  async function sendMessageStreaming(
    userMessage: string | undefined,
  ): Promise<void> {
    setError(null);

    // Only add user message if provided (undefined means messages already in state)
    if (userMessage !== undefined) {
      const userMsg = createUserMessage(userMessage);
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
      setServerToolLabel(undefined);
      addDisplayItems([
        {
          type: "tool_error",
          toolName: "system",
          errorMessage,
          result: errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setCurrentStreamingText(undefined);
      setServerToolLabel(undefined);
      setIsProcessingTools(false);

      // Save conversation state after turn completes
      if (config.enablePersistence ?? true) {
        saveConversation(conversationId, messages(), displayItems());
      }
    }
  }

  async function streamWithToolLoop(
    currentMessages: MessageParam[],
  ): Promise<void> {
    // Use SDK's beta streaming
    const betas = getBetasArray(
      allTools.length > 0,
      hasWebFetchTool(config.builtInTools),
      messagesContainDocuments(),
    );
    const stream = config.sdkClient.beta.messages.stream({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      messages: currentMessages,
      tools: allTools,
      system: config.system(),
      betas,
    });

    // Subscribe to text events
    stream.on("text", (text) => {
      // Clear server tool label when text starts streaming
      setServerToolLabel(undefined);
      setCurrentStreamingText((prev) => (prev ?? "") + text);
    });

    // Subscribe to stream events to detect server tool usage and text block boundaries
    stream.on("streamEvent", (event) => {
      const streamEvent = event as unknown as {
        type: string;
        content_block?: { type: string; name?: string };
      };
      if (streamEvent.type === "content_block_start") {
        // Handle server tool usage (e.g., web_search)
        if (streamEvent.content_block?.type === "server_tool_use") {
          const toolName = streamEvent.content_block.name;
          const label = toolName ? SERVER_TOOL_LABELS[toolName] : undefined;
          if (label) {
            setServerToolLabel(label);
          }
        }
        // Handle new text block - add paragraph break if we already have text
        if (streamEvent.content_block?.type === "text") {
          const current = currentStreamingText();
          if (current && current.length > 0) {
            setCurrentStreamingText(current + "\n\n");
          }
        }
      }
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
      content: finalMessage.content as ContentBlock[],
    };

    const updatedMessages = [...currentMessages, assistantMsg];
    setMessages(updatedMessages);
    processMessageForDisplay(assistantMsg);

    // Clear streaming state immediately after message is processed
    setIsStreaming(false);
    setCurrentStreamingText(undefined);
    setServerToolLabel(undefined);

    // Handle tool execution manually since streaming doesn't support toolRunner
    if (finalMessage.stop_reason === "tool_use") {
      setIsProcessingTools(true);

      // Show in-progress items
      const inProgressItems = getInProgressItems(
        finalMessage.content as ContentBlock[],
        toolRegistry,
      );
      addDisplayItems(inProgressItems);

      // Filter tool_use blocks
      const toolUseBlocks = (finalMessage.content as ContentBlock[]).filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );

      // Process tools - handle text editor tool specially
      const allResults: ToolResult[] = [];
      const allErrorItems: DisplayItem[] = [];
      const allSuccessItems: DisplayItem[] = [];

      for (const block of toolUseBlocks) {
        // Handle built-in text editor tool locally
        if (
          block.name === "str_replace_based_edit_tool" &&
          config.textEditorHandler
        ) {
          setServerToolLabel(SERVER_TOOL_LABELS[block.name]);
          const result = config.textEditorHandler(block.input);
          setServerToolLabel(undefined);
          const isError = result.startsWith("Error:");
          allResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
            is_error: isError,
          });
          if (isError) {
            allErrorItems.push({
              type: "tool_error",
              toolName: block.name,
              errorMessage: result,
              toolInput: block.input,
              result,
            });
          }
        } else {
          // Use existing tool processing for custom tools
          const { results, errorItems, successItems } = await processToolUses(
            [block],
            toolRegistry,
          );
          allResults.push(...results);
          allErrorItems.push(...errorItems);
          allSuccessItems.push(...successItems);
        }
      }

      // Clear in-progress items now that tools are done
      clearInProgressItems();

      // Add success items to display
      if (allSuccessItems.length > 0) {
        addDisplayItems(allSuccessItems);
      }

      // Add error items to display
      if (allErrorItems.length > 0) {
        addDisplayItems(allErrorItems);
      }

      // Add tool results to messages
      const toolResultMsg: MessageParam = {
        role: "user",
        content: allResults,
      };

      const messagesWithToolResults = [...updatedMessages, toolResultMsg];
      setMessages(messagesWithToolResults);

      // Continue streaming with tool results (recursive call)
      setIsStreaming(true);
      setCurrentStreamingText(undefined);
      await streamWithToolLoop(messagesWithToolResults);
    }
  }

  const sendMessage = sendMessageStreaming;

  function sendMessages(userMessages: string[]): Promise<void> {
    if (userMessages.length === 0) return Promise.resolve();

    // Add all user messages to conversation
    // Include documents only in the first message of batch if not already in conversation
    const shouldIncludeDocsOnFirst = !messagesContainDocuments();
    const messagesToAdd: MessageParam[] = userMessages.map((text, index) => {
      if (index === 0 && shouldIncludeDocsOnFirst) {
        return createUserMessage(text);
      }
      // For subsequent messages in batch, just create plain text message
      return { role: "user" as const, content: text };
    });

    const newMessages = [...messages(), ...messagesToAdd];
    setMessages(newMessages);
    setError(null);

    return sendMessageStreaming(undefined);
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
    serverToolLabel,
    sendMessage,
    sendMessages,
    clearConversation,
    toolRegistry,
    processMessageForDisplay,
  };
}

function getBetasArray(
  hasTools: boolean,
  hasWebFetch: boolean,
  hasDocuments: boolean,
): string[] | undefined {
  const headers = getBetaHeaders({ hasTools, hasWebFetch, hasDocuments });
  if (!headers) return undefined;
  return headers["anthropic-beta"].split(",");
}
