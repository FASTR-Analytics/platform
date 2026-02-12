// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, createMemo, useContext } from "solid-js";
import type {
  Anthropic,
  AnthropicModelConfig,
  ContentBlock,
  DocumentContentBlock,
  MessageParam,
  Usage,
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
import type { AIChatSettingsValues } from "./ai_chat_settings_panel.tsx";
import { ConversationsContext } from "./use_conversations.ts";

const SETTINGS_KEY_PREFIX = "panther-ai-settings";

const EPHEMERAL_OPEN = "<<<[";
const EPHEMERAL_CLOSE = "]>>>";
const EPHEMERAL_REGEX = /<<<\[[\s\S]*?\]>>>\n?\n?/g;

function stripEphemeralContext(messages: MessageParam[]): MessageParam[] {
  const lastUserIndex = findLastUserMessageIndex(messages);
  return messages.map((msg, i) => {
    if (msg.role !== "user" || i === lastUserIndex) return msg;
    if (typeof msg.content === "string") {
      const stripped = msg.content.replace(EPHEMERAL_REGEX, "");
      return stripped === msg.content ? msg : { ...msg, content: stripped };
    }
    const newContent = msg.content.map((block) => {
      if (block.type !== "text") return block;
      const stripped = block.text.replace(EPHEMERAL_REGEX, "");
      return stripped === block.text ? block : { ...block, text: stripped };
    });
    return { ...msg, content: newContent };
  });
}

function findLastUserMessageIndex(messages: MessageParam[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

function loadSettings(key: string): AIChatSettingsValues | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as AIChatSettingsValues;
  } catch {
    return undefined;
  }
}

function saveSettings(key: string, values: AIChatSettingsValues) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // storage full or unavailable
  }
}

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

  const settingsKey = config.scope
    ? `${SETTINGS_KEY_PREFIX}-${config.scope}`
    : SETTINGS_KEY_PREFIX;
  const persisted = loadSettings(settingsKey);
  if (persisted) {
    Object.assign(config.modelConfig, persisted);
  }

  const conversationsContext = useContext(ConversationsContext);

  const conversationId = createMemo(() => {
    if (conversationsContext) {
      return conversationsContext.activeConversationId() ?? "default";
    }
    return config.conversationId ?? "default";
  });

  const store = createMemo(() =>
    getOrCreateConversationStore(
      conversationId(),
      config.enablePersistence ?? true,
    )
  );

  const messages = () => store().messages[0]();
  const setMessages = (m: MessageParam[]) => store().messages[1](m);
  const displayItems = () => store().displayItems[0]();
  const setDisplayItems = (d: DisplayItem[]) => store().displayItems[1](d);
  const isLoading = () => store().isLoading[0]();
  const setIsLoading = (v: boolean) => store().isLoading[1](v);
  const isStreaming = () => store().isStreaming[0]();
  const setIsStreaming = (v: boolean) => store().isStreaming[1](v);
  const isProcessingTools = () => store().isProcessingTools[0]();
  const setIsProcessingTools = (v: boolean) => store().isProcessingTools[1](v);
  const error = () => store().error[0]();
  const setError = (e: string | null) => store().error[1](e);
  const usage = () => store().usage[0]();
  const setUsage = (u: Usage | null) => store().usage[1](u);
  const currentStreamingText = () => store().currentStreamingText[0]();
  const setCurrentStreamingText = (t: string | undefined) =>
    store().currentStreamingText[1](t);
  const usageHistory = () => store().usageHistory[0]();
  const setUsageHistory = (h: Usage[]) => store().usageHistory[1](h);
  const serverToolLabel = () => store().serverToolLabel[0]();
  const setServerToolLabel = (l: string | undefined) =>
    store().serverToolLabel[1](l);

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

  let activeStream: { abort: () => void } | null = null;
  let abortRequested = false;

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
      ? config.getDocumentRefs?.() || []
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
      content: [...documentBlocks, { type: "text" as const, text }],
    };
  };

  const processMessageForDisplay = (message: MessageParam) => {
    const items = getDisplayItemsFromMessage(message);
    addDisplayItems(items);
  };

  async function sendMessageStreaming(
    userMessage: string | undefined,
  ): Promise<void> {
    setError(null);

    // Only add user message if provided (undefined means messages already in state)
    if (userMessage !== undefined) {
      const ephemeralContext = config.getEphemeralContext?.() ?? null;
      const fullMessage = ephemeralContext
        ? `${EPHEMERAL_OPEN}${ephemeralContext}${EPHEMERAL_CLOSE}\n\n${userMessage}`
        : userMessage;
      const userMsg = createUserMessage(fullMessage);
      const isFirstMessage = messages().length === 0;
      setMessages([...messages(), userMsg]);

      if (userMessage.trim()) {
        processMessageForDisplay(userMsg);

        // Update title from first message
        if (isFirstMessage && conversationsContext) {
          conversationsContext.updateTitleFromFirstMessage(
            conversationId(),
            userMessage,
          );
        }
      }
    }

    setIsLoading(true);
    setIsStreaming(true);
    setCurrentStreamingText(undefined);

    try {
      await streamWithToolLoop(messages());
      if (abortRequested) {
        const partialText = currentStreamingText();
        if (partialText?.trim()) {
          addDisplayItems([
            { type: "assistant_text", text: partialText.trim() },
          ]);
        }
      }
    } catch (err) {
      if (abortRequested) {
        const partialText = currentStreamingText();
        if (partialText?.trim()) {
          addDisplayItems([
            { type: "assistant_text", text: partialText.trim() },
          ]);
        }
      } else {
        const errorDetails = err instanceof Error ? err.message : String(err);
        setError(errorDetails);
        setIsStreaming(false);
        setCurrentStreamingText(undefined);
        setServerToolLabel(undefined);
        addDisplayItems([
          {
            type: "tool_error",
            toolName: "system",
            errorMessage: getUserFacingErrorMessage(err),
            errorDetails,
          },
        ]);
      }
    } finally {
      if (abortRequested) {
        const msgs = messages();
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === "user") {
          setMessages([
            ...msgs,
            { role: "assistant", content: "[Stopped]" },
          ]);
        }
      }
      abortRequested = false;
      activeStream = null;
      setIsLoading(false);
      setIsStreaming(false);
      setCurrentStreamingText(undefined);
      setServerToolLabel(undefined);
      setIsProcessingTools(false);

      // Save conversation state after turn completes
      if (config.enablePersistence ?? true) {
        saveConversation(conversationId(), messages(), displayItems());
      }

      // Update conversation metadata
      if (conversationsContext) {
        conversationsContext.updateLastMessageTime(conversationId());
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
      config.modelConfig.context1M,
    );
    const messagesForAPI = stripEphemeralContext(currentMessages);
    const stream = config.sdkClient.beta.messages.stream({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      messages: messagesForAPI,
      tools: allTools,
      system: config.system(),
      betas,
    });
    activeStream = stream;

    // Subscribe to text events
    stream.on("text", (text) => {
      // Clear server tool label when text starts streaming
      setServerToolLabel(undefined);
      const prev = currentStreamingText();
      setCurrentStreamingText((prev ?? "") + text);
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
      }
    });

    // Wait for completion
    const finalMessage = await stream.finalMessage();
    activeStream = null;
    if (abortRequested) return;

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
        if (abortRequested) {
          for (
            const remaining of toolUseBlocks.slice(
              toolUseBlocks.indexOf(block),
            )
          ) {
            allResults.push({
              type: "tool_result",
              tool_use_id: remaining.id,
              content: "Tool execution cancelled by user",
              is_error: true,
            });
          }
          break;
        }

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
              errorMessage: `Tool feedback: ${block.name}`,
              errorDetails: result,
              toolInput: block.input,
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

          // Add display component for successful tools
          if (errorItems.length === 0) {
            const metadata = toolRegistry.getMetadata(block.name);
            if (metadata?.displayComponent) {
              addDisplayItems([{
                type: "tool_display",
                toolName: block.name,
                input: block.input,
              }]);
            }
          }
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

      if (abortRequested) return;

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
    clearConversationStore(conversationId());
  }

  function updateConfig(updates: Partial<AnthropicModelConfig>) {
    Object.assign(config.modelConfig, updates);
    const mc = config.modelConfig;
    saveSettings(settingsKey, {
      model: mc.model,
      max_tokens: mc.max_tokens,
      temperature: mc.temperature,
      context1M: mc.context1M,
    });
  }

  function getConfig(): AnthropicModelConfig {
    return { ...config.modelConfig };
  }

  return {
    updateConfig,
    getConfig,
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
    clearInProgressItems,
    conversationId,
  };
}

function getUserFacingErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("context") && lower.includes("exceed")) {
    return "Conversation too long — context window exceeded";
  }
  if (lower.includes("overloaded")) {
    return "Anthropic API is overloaded — try again in a moment";
  }
  if (lower.includes("rate_limit") || lower.includes("rate limit")) {
    return "Rate limit reached — try again in a moment";
  }
  if (lower.includes("authentication") || lower.includes("unauthorized")) {
    return "Authentication failed — check your API key";
  }
  if (lower.includes("insufficient") && lower.includes("credit")) {
    return "Insufficient credits — check your Anthropic billing";
  }
  return "System error";
}

function getBetasArray(
  hasTools: boolean,
  hasWebFetch: boolean,
  hasDocuments: boolean,
  context1M?: boolean,
): string[] | undefined {
  const headers = getBetaHeaders({
    hasTools,
    hasWebFetch,
    hasDocuments,
    context1M,
  });
  if (!headers) return undefined;
  return headers["anthropic-beta"].split(",");
}
