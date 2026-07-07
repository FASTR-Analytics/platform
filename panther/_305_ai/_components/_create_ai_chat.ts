// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";
import { Anthropic } from "../deps.ts";
import type {
  AnthropicModelConfig,
  ContentBlock,
  DocumentContentBlock,
  MessageParam,
  Usage,
} from "../deps.ts";
import {
  buildCancelledToolResults,
  buildToolResultUserMessage,
  classifyTurnContinuation,
  getUserFacingAIErrorMessage,
  lastMessageHasUnresolvedToolUse,
  resolveOutputConfig,
  resolveThinkingConfig,
  sanitizePersistedSettings,
  shapeCachedPayload,
  shapeEphemeralSystemMessages,
  stripEphemeralContext,
  supportsDynamicWebTools,
  supportsMidConversationSystem,
  trimDanglingServerToolUse,
  wrapWithEphemeralContext,
} from "../deps.ts";
import {
  ANTHROPIC_BETA_HEADER,
  getBetaHeaders,
  hasWebFetchTool,
} from "../_core/beta_headers.ts";
import { supportsSamplingParams } from "../deps.ts";
import { resolveBuiltInTools } from "../_core/builtin_tools.ts";
import {
  clearConversationStore,
  getOrCreateConversationStore,
} from "../_core/conversation_store.ts";
import { saveConversation } from "../_core/persistence.ts";
import { getDisplayItemsFromMessage } from "../_core/display_items.ts";
import { SERVER_TOOL_LABELS } from "../deps.ts";
import {
  getInProgressItems,
  processToolUses,
  ToolRegistry,
  type ToolResult,
} from "../_core/tool_engine.ts";
import type { AIChatConfig, DisplayItem } from "../_core/types.ts";
import type { AIChatSettingsValues } from "./ai_chat_settings_panel.tsx";
import { ConversationsContext } from "./use_conversations.ts";

const SETTINGS_KEY_PREFIX = "panther-ai-settings";

// Safety cap on turn continuations (client tool loops and server-tool
// pause_turn resumptions) so a pathological loop can't run unbounded.
const MAX_TURN_CONTINUATIONS = 24;

// Turn-flow decision logic (ephemeral-context wrap/strip, stop-reason
// classification, cancelled-tool-result synthesis, error classification)
// lives in _110_ai_types/turn_logic.ts as pure functions, covered by
// tests/ai_turn_logic_test.ts.

// Prompt-cache breakpoint placement lives in _110_ai_types/request_shaping.ts
// (shapeCachedPayload) — it strips any breakpoints persisted in history by
// older library versions and places a bounded set on the outgoing payload
// only. Covered by tests/ai_request_shaping_test.ts.

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

  // Per-instance copy — consumers typically pass a shared module-level
  // default object, and mutating it (persisted settings below, updateConfig)
  // would leak one scope's settings into every other scope in the session.
  const modelConfig: AnthropicModelConfig = { ...config.modelConfig };

  const settingsKey = config.scope
    ? `${SETTINGS_KEY_PREFIX}-${config.scope}`
    : SETTINGS_KEY_PREFIX;
  const persisted = loadSettings(settingsKey);
  if (persisted) {
    // Persisted settings can predate the current model catalog (retired
    // model IDs, max_tokens above the model's cap, temperature on models
    // that reject it) — sanitize before applying.
    Object.assign(
      modelConfig,
      sanitizePersistedSettings(persisted, modelConfig.model),
    );
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

  // Merge custom tools (SDK betaZodTools) with built-in tools (web_search,
  // bash, etc.). Computed per request — built-in web tool versions depend on
  // the current model, which can change via updateConfig. Cast to SDK's
  // ToolUnion type - built-in tools like web_search have different shapes
  // but are valid for the API.
  const getAllTools = () =>
    [
      ...toolRegistry.getSDKTools(),
      ...resolveBuiltInTools(config.builtInTools, modelConfig.model),
    ] as SDKToolUnion[];

  const [queuedMessages, setQueuedMessages] = createSignal<string[]>([]);

  function enqueueMessage(text: string) {
    setQueuedMessages([...queuedMessages(), text]);
    processMessageForDisplay({ role: "user", content: text });
  }

  function clearQueue() {
    setQueuedMessages([]);
  }

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

  const documentFileIdsInMessages = (): Set<string> => {
    const ids = new Set<string>();
    for (const msg of messages()) {
      if (typeof msg.content === "string") continue;
      for (const block of msg.content) {
        if (block.type === "document" && block.source.type === "file") {
          ids.add(block.source.file_id);
        }
      }
    }
    return ids;
  };

  const createUserMessage = (text: string): MessageParam => {
    // Attach every configured document the conversation hasn't seen yet.
    // Gating on "history has no documents at all" meant a document added
    // mid-conversation was shown as attached but never reached the model.
    const alreadySent = documentFileIdsInMessages();
    const documentRefs = (config.getDocumentRefs?.() || []).filter(
      (ref) => !alreadySent.has(ref.file_id),
    );
    if (documentRefs.length === 0) {
      return { role: "user", content: text };
    }

    // No cache_control here — stored state never carries breakpoints.
    // shapeCachedPayload places them on the outgoing payload each request.
    const documentBlocks: DocumentContentBlock[] = documentRefs.map((ref) => ({
      type: "document" as const,
      source: { type: "file" as const, file_id: ref.file_id },
      title: ref.title,
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
      // On Opus 4.8 the context travels as a mid-conversation system
      // message (survives tool-loop recursion, no wasted cache writes);
      // other models get the marker-wrapped fallback spliced into the
      // user text.
      const useSystemMessage = ephemeralContext !== null &&
        supportsMidConversationSystem(modelConfig.model);
      const fullMessage = useSystemMessage
        ? userMessage
        : wrapWithEphemeralContext(userMessage, ephemeralContext);
      const userMsg = createUserMessage(fullMessage);
      const isFirstMessage = messages().length === 0;
      setMessages(
        useSystemMessage
          ? [
            ...messages(),
            userMsg,
            { role: "system", content: ephemeralContext },
          ]
          : [...messages(), userMsg],
      );

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
        // A trailing system message (ephemeral context on Opus 4.8) also
        // needs an assistant turn after it so the persisted history stays
        // valid when the next user message arrives.
        if (lastMsg?.role === "user" || lastMsg?.role === "system") {
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
    depth: number = 0,
  ): Promise<void> {
    // Use SDK's beta streaming. The web-fetch beta header is only needed
    // for the basic web_fetch variant used on pre-4.6 models.
    const allTools = getAllTools();
    const betas = getBetasArray(
      hasWebFetchTool(config.builtInTools) &&
        !supportsDynamicWebTools(modelConfig.model),
      messagesContainDocuments(),
    );
    const shaped = shapeCachedPayload(
      config.system(),
      shapeEphemeralSystemMessages(
        stripEphemeralContext(currentMessages),
        modelConfig.model,
      ),
    );
    const stream = config.sdkClient.beta.messages.stream({
      model: modelConfig.model,
      max_tokens: modelConfig.max_tokens,
      // Models from Opus 4.7 onward reject non-default sampling params with
      // a 400 — omit temperature there. Thinking and effort are resolved
      // per model (request_shaping.ts) so unsupported configs are never sent.
      temperature: supportsSamplingParams(modelConfig.model)
        ? modelConfig.temperature
        : undefined,
      thinking: resolveThinkingConfig(
        modelConfig.model,
        modelConfig.thinking,
      ),
      output_config: resolveOutputConfig(
        modelConfig.model,
        modelConfig.output_config,
      ),
      messages: shaped.messages,
      tools: allTools,
      system: shaped.system,
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

    // Stop-reason → next-action mapping is pure logic in turn_logic.ts.
    const continuation = classifyTurnContinuation(
      finalMessage.stop_reason,
      depth,
      MAX_TURN_CONTINUATIONS,
    );

    if (continuation.kind === "halt") {
      // A truncated (or refused) turn can still contain complete tool_use
      // blocks that will now never run — resolve them with error results,
      // exactly like cap-tools, or the persisted conversation ends in an
      // assistant turn with unresolved tool_use and every subsequent send
      // 400s (permanently bricking the conversation).
      const cancelled = buildCancelledToolResults(
        finalMessage.content as ContentBlock[],
        `Tool execution stopped: ${continuation.message}`,
      );
      if (cancelled.length > 0) {
        setMessages([
          ...updatedMessages,
          { role: "user", content: cancelled },
        ]);
      }
      addDisplayItems([
        {
          type: "system_notice",
          noticeType: continuation.noticeType,
          message: continuation.message,
          details: continuation.details,
        },
      ]);
      return;
    }

    // Server-side tools (web search, web fetch) pause when the server's
    // iteration limit is reached — re-send with the assistant turn appended
    // to resume where it left off.
    if (continuation.kind === "resume-pause-turn") {
      setIsStreaming(true);
      setCurrentStreamingText(undefined);
      await streamWithToolLoop(updatedMessages, depth + 1);
      return;
    }

    if (continuation.kind === "cap-pause") {
      // The assistant message may end with server_tool_use blocks whose
      // results never arrived — trim them so the persisted conversation
      // cannot end in a state a later send might reject.
      const trimmed = trimDanglingServerToolUse(
        finalMessage.content as ContentBlock[],
      );
      if (trimmed.length < (finalMessage.content as ContentBlock[]).length) {
        // The API rejects an assistant message with empty content — if every
        // block was a dangling server_tool_use, persist a placeholder text
        // instead (same pattern as the abort "[Stopped]" message).
        setMessages([
          ...currentMessages,
          {
            role: "assistant",
            content: trimmed.length > 0
              ? trimmed
              : "[Stopped: too many turn continuations]",
          },
        ]);
      }
      addDisplayItems([
        {
          type: "system_notice",
          noticeType: continuation.noticeType,
          message: continuation.message,
          details: continuation.details,
        },
      ]);
      return;
    }

    if (continuation.kind === "cap-tools") {
      // Resolve the pending tool_use blocks with error results before
      // stopping — a persisted conversation ending in an assistant turn
      // with unresolved tool_use blocks is rejected by the API on every
      // subsequent send, permanently breaking the conversation.
      setMessages([
        ...updatedMessages,
        {
          role: "user",
          content: buildCancelledToolResults(
            finalMessage.content as ContentBlock[],
            "Tool execution stopped: too many tool calls in one turn",
          ),
        },
      ]);
      addDisplayItems([
        {
          type: "system_notice",
          noticeType: continuation.noticeType,
          message: continuation.message,
          details: continuation.details,
        },
      ]);
      return;
    }

    // Handle tool execution manually since streaming doesn't support toolRunner
    if (continuation.kind === "run-tools") {
      // Filter tool_use blocks
      const toolUseBlocks = (finalMessage.content as ContentBlock[]).filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );
      setIsProcessingTools(true);

      // Show in-progress items
      const inProgressItems = getInProgressItems(
        finalMessage.content as ContentBlock[],
        toolRegistry,
      );
      addDisplayItems(inProgressItems);

      // Process tools - handle text editor tool specially
      const allResults: ToolResult[] = [];
      const allErrorItems: DisplayItem[] = [];
      const allSuccessItems: DisplayItem[] = [];

      for (const block of toolUseBlocks) {
        if (abortRequested) {
          allResults.push(
            ...buildCancelledToolResults(
              toolUseBlocks.slice(toolUseBlocks.indexOf(block)),
              "Tool execution cancelled by user",
            ),
          );
          break;
        }

        // Handle built-in text editor tool locally
        if (
          block.name === "str_replace_based_edit_tool" &&
          config.textEditorHandler
        ) {
          setServerToolLabel(SERVER_TOOL_LABELS[block.name]);
          // The handler contract is "return Error: strings, don't throw" —
          // enforce it here; a throw would propagate after the assistant
          // tool_use message was persisted but before any tool_result,
          // stranding the conversation.
          let result: string;
          try {
            result = config.textEditorHandler(block.input);
          } catch (err) {
            result = `Error: ${
              err instanceof Error ? err.message : String(err)
            }`;
          }
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

      // Check for queued user messages to inject alongside tool results
      const queuedTexts = queuedMessages();
      if (queuedTexts.length > 0) setQueuedMessages([]);

      const toolResultMsg = buildToolResultUserMessage(allResults, queuedTexts);

      const messagesWithToolResults = [...updatedMessages, toolResultMsg];
      setMessages(messagesWithToolResults);

      if (abortRequested) return;

      // Continue streaming with tool results (recursive call)
      setIsStreaming(true);
      setCurrentStreamingText(undefined);
      await streamWithToolLoop(messagesWithToolResults, depth + 1);
    }
  }

  const sendMessage = sendMessageStreaming;

  function sendMessages(userMessages: string[]): Promise<void> {
    if (userMessages.length === 0) return Promise.resolve();

    // Add all user messages to conversation. createUserMessage attaches only
    // not-yet-sent documents, so the first message of the batch carries any
    // new ones and the rest stay plain text.
    const messagesToAdd: MessageParam[] = userMessages.map((text, index) => {
      if (index === 0) {
        return createUserMessage(text);
      }
      return { role: "user" as const, content: text };
    });

    const newMessages = [...messages(), ...messagesToAdd];
    setMessages(newMessages);
    setError(null);

    return sendMessageStreaming(undefined);
  }

  // Drain queued messages when the turn completes (non-tool-loop case)
  createEffect(() => {
    const loading = isLoading();
    const processingTools = isProcessingTools();
    const queue = queuedMessages();
    const msgs = messages();

    const hasUnresolvedTools = lastMessageHasUnresolvedToolUse(msgs);

    if (!loading && !processingTools && queue.length > 0) {
      if (hasUnresolvedTools) return;
      setQueuedMessages([]);
      sendMessages(queue);
    }
  });

  function stopGeneration() {
    if (!isLoading()) return;
    abortRequested = true;
    if (activeStream) {
      try {
        activeStream.abort();
      } catch { /* swallow */ }
      activeStream = null;
    }
    clearInProgressItems();
  }

  function clearConversation() {
    clearConversationStore(conversationId());
  }

  function updateConfig(updates: Partial<AnthropicModelConfig>) {
    Object.assign(modelConfig, updates);
    const mc = modelConfig;
    saveSettings(settingsKey, {
      model: mc.model,
      max_tokens: mc.max_tokens,
      temperature: mc.temperature,
      output_config: mc.output_config,
    });
  }

  function getConfig(): AnthropicModelConfig {
    return { ...modelConfig };
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
    stopGeneration,
    toolRegistry,
    enqueueMessage,
    clearQueue,
    queuedMessages,
    clearInProgressItems,
    conversationId,
  };
}

// Thin instanceof adapter over the SDK error classes — all classification
// logic is pure in turn_logic.ts (getUserFacingAIErrorMessage). err.type is
// the API error body's type field; mid-stream errors (e.g. an
// overloaded_error SSE event) arrive with status undefined but a populated
// type. The pure classifier's status checks and string fallback also cover
// consumer apps bundling a second SDK copy, where instanceof fails.
function getUserFacingErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.APIConnectionError) {
    return getUserFacingAIErrorMessage({
      isConnectionError: true,
      isApiError: true,
      message: err.message,
    });
  }
  if (err instanceof Anthropic.APIError) {
    return getUserFacingAIErrorMessage({
      isConnectionError: false,
      isApiError: true,
      type: err.type,
      status: err.status,
      message: String(err.message),
    });
  }
  return getUserFacingAIErrorMessage({
    isConnectionError: false,
    isApiError: false,
    message: err instanceof Error ? err.message : String(err),
  });
}

function getBetasArray(
  hasBasicWebFetch: boolean,
  hasDocuments: boolean,
): string[] | undefined {
  const headers = getBetaHeaders({
    hasBasicWebFetch,
    hasDocuments,
  });
  if (!headers) return undefined;
  return headers[ANTHROPIC_BETA_HEADER].split(",");
}
