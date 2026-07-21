// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, createEffect, createMemo, useContext } from "solid-js";
import { Anthropic } from "../deps.ts";
import type {
  AnthropicModelConfig,
  ContentBlock,
  DocumentContentBlock,
  EphemeralSection,
  MessageParam,
} from "../deps.ts";
import {
  assembleTurnSections,
  buildCancelledToolResults,
  buildToolResultUserMessage,
  classifyTurnContinuation,
  demoteStaleCarriers,
  getUserFacingAIErrorMessage,
  lastMessageHasUnresolvedToolUse,
  renderOutgoingMessages,
  resolveOutputConfig,
  resolveThinkingConfig,
  sanitizePersistedSettings,
  shapeCachedPayload,
  supportsDynamicWebTools,
  trimDanglingServerToolUse,
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
import type {
  ActiveTurn,
  ConversationStore,
} from "../_core/conversation_store.ts";
import { saveConversation } from "../_core/persistence.ts";
import { getDisplayItemsFromMessage } from "../_core/display_items.ts";
import { SERVER_TOOL_LABELS } from "../deps.ts";
import {
  checkViewGate,
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

// Turn-flow decision logic (ephemeral-section wire rendering, stop-reason
// classification, cancelled-tool-result synthesis, error classification)
// lives in _110_ai_types/turn_logic.ts as pure functions, covered by
// tests/ai_turn_logic_test.ts. Ephemeral context is typed DATA on the stored
// turn (ephemeralSections, attached at turn creation); the wire format is
// derived per request by renderOutgoingMessages and never parsed back.

// Prompt-cache breakpoint placement lives in _110_ai_types/request_shaping.ts
// (shapeCachedPayload) — it strips any breakpoints persisted in history by
// older library versions and places a bounded set on the outgoing payload
// only. Covered by tests/ai_request_shaping_test.ts.

// Turn ownership: the in-flight turn is an ActiveTurn record on the
// CONVERSATION STORE (one turn per conversation, engine-enforced), claimed
// synchronously at send time and threaded as a parameter through the whole
// loop — every read/write in the turn's extent targets turn.store, never the
// live store() memo, so a turn started in conversation A finishes in
// conversation A regardless of what is active. createAIChat instances are
// per-mount subscriptions; instance disposal is inert (a detached turn keeps
// running into its pinned store). A send while the conversation's turn is
// active ENQUEUES behind it. Stop aborts the turn's controller and the tool
// loop races handler awaits against the signal, so Stop always releases the
// conversation — even under a never-resolving handler.

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

// Race a handler await against the turn's abort signal. On abort the engine
// stops waiting and synthesizes cancelled results — the abandoned handler's
// late resolution is discarded (its side effects may still land, the same
// class as any post-Stop side effect). This is what guarantees Stop always
// finalizes the turn.
function raceAbort<T>(
  signal: AbortSignal,
  promise: Promise<T>,
): Promise<{ aborted: true } | { aborted: false; value: T }> {
  if (signal.aborted) {
    return Promise.resolve({ aborted: true });
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve({ aborted: true });
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve({ aborted: false, value });
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

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

  // Live accessors for the UI — always the ACTIVE conversation's store. The
  // turn loop never uses these: it reads/writes through its ActiveTurn's
  // pinned store exclusively.
  const messages = () => store().messages[0]();
  const displayItems = () => store().displayItems[0]();
  const isLoading = () => store().isLoading[0]();
  const isStreaming = () => store().isStreaming[0]();
  const isProcessingTools = () => store().isProcessingTools[0]();
  const error = () => store().error[0]();
  const usage = () => store().usage[0]();
  const currentStreamingText = () => store().currentStreamingText[0]();
  const usageHistory = () => store().usageHistory[0]();
  const serverToolLabel = () => store().serverToolLabel[0]();

  // Bind BEFORE registering so construction-time tools and later dynamic
  // register() calls run the same availableIn validation (Feature 2
  // colleague-proofing: a bad binding fails the app's boot, never a live
  // conversation).
  const toolRegistry = new ToolRegistry();
  toolRegistry.bindViewController(config.viewController ?? null);
  if (config.tools) {
    config.tools.forEach((tool) => toolRegistry.register(tool));
  }
  // A registered custom tool with the text editor's reserved name would be
  // silently shadowed by the built-in branch in the tool loop (handler AND
  // gate both bypassed) — fail the boot instead.
  if (
    config.textEditorHandler &&
    toolRegistry.get("str_replace_based_edit_tool")
  ) {
    throw new Error(
      `Tool name "str_replace_based_edit_tool" is reserved by the built-in text editor (config.textEditorHandler is set) — the registered tool would never run. Rename the custom tool.`,
    );
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

  // Queue API — conversation-scoped (the queue lives on ConversationStore).
  // enqueueMessage never materializes a display item: queued bubbles derive
  // from the queue signal itself, so clearing the queue clears the bubbles
  // by construction and nothing unsent can persist.
  function enqueueMessage(text: string) {
    const s = store();
    const [queued, setQueued] = s.queuedMessages;
    setQueued([...queued(), { text, resolve: () => {} }]);
  }

  function clearQueue() {
    const s = store();
    const [queued, setQueued] = s.queuedMessages;
    const entries = queued();
    setQueued([]);
    for (const entry of entries) entry.resolve();
  }

  const queuedMessages = () => store().queuedMessages[0]().map((q) => q.text);

  // Reactive: true while the ACTIVE conversation's turn is blocked on a user
  // decision (Phase 4 gives this meaning; the slot is wired from 0A).
  const pendingUserAction = () => store().pendingDecision[0]() !== null;

  const addDisplayItemsTo = (s: ConversationStore, items: DisplayItem[]) => {
    const [displayItems, setDisplayItems] = s.displayItems;
    setDisplayItems([...displayItems(), ...items]);
  };

  const clearInProgressItemsIn = (s: ConversationStore) => {
    const [displayItems, setDisplayItems] = s.displayItems;
    setDisplayItems(
      displayItems().filter((item) => item.type !== "tool_in_progress"),
    );
  };

  const clearInProgressItems = () => clearInProgressItemsIn(store());

  const messagesContainDocuments = (msgs: MessageParam[]): boolean => {
    return msgs.some((msg) => {
      if (typeof msg.content === "string") return false;
      return msg.content.some((block) => block.type === "document");
    });
  };

  const documentFileIdsInMessages = (msgs: MessageParam[]): Set<string> => {
    const ids = new Set<string>();
    for (const msg of msgs) {
      if (typeof msg.content === "string") continue;
      for (const block of msg.content) {
        if (block.type === "document" && block.source.type === "file") {
          ids.add(block.source.file_id);
        }
      }
    }
    return ids;
  };

  const createUserMessage = (
    text: string,
    existingMessages: MessageParam[],
  ): MessageParam => {
    // Attach every configured document the conversation hasn't seen yet.
    // Gating on "history has no documents at all" meant a document added
    // mid-conversation was shown as attached but never reached the model.
    const alreadySent = documentFileIdsInMessages(existingMessages);
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

  const processMessageForDisplayTo = (
    s: ConversationStore,
    message: MessageParam,
  ) => {
    const items = getDisplayItemsFromMessage(message);
    addDisplayItemsTo(s, items);
  };

  // Synchronous claim of the conversation's turn lock. Callers must check
  // activeTurn is null in the same synchronous section (two mounted
  // instances' drain effects can otherwise race past an idle check
  // together).
  function claimTurn(s: ConversationStore, id: string): ActiveTurn {
    const turn: ActiveTurn = {
      conversationId: id,
      store: s,
      abort: new AbortController(),
      activeStream: null,
      containerId: undefined,
      modelAssistantAppended: false,
      resolveOnFinish: [],
    };
    s.activeTurn[1](turn);
    return turn;
  }

  // The turn's ephemeral sections, resolved at turn creation (inside the
  // protected region — a consumer callback throw surfaces through the normal
  // error path). With a view controller, sections ride EVERY turn-creating
  // path — direct sends, batches, queue drains — and the consumer hook's
  // delivery upgrades with them (intended, documented). Without one, the
  // hook keeps its historical direct-send-only delivery (the 0B parity
  // guarantee); directSend encodes that.
  //
  // The interaction drain is TRANSACTIONAL: restoreInteractions is invoked
  // by runTurn's finally iff the turn ends with no assistant message from
  // the model (failed or stopped send) — entries are never lost on failure
  // and never double-delivered (the failed carrier's sections are demoted at
  // the next turn's creation; restored entries ride the retry's fresh
  // digest). The consumer hook runs BEFORE the drain so a hook throw cannot
  // strand already-drained entries.
  function buildTurnSections(directSend: boolean, conversationId: string): {
    sections: EphemeralSection[];
    restoreInteractions: (() => void) | null;
  } {
    const vc = config.viewController;
    if (vc) {
      const consumer = config.getEphemeralContext?.() ?? null;
      const parts = vc._turnSectionParts();
      const drained = vc._drainForSend(conversationId);
      return {
        sections: assembleTurnSections({
          view: parts.view,
          viewPrompt: parts.viewPrompt,
          digest: drained?.digest ?? null,
          consumer,
        }),
        restoreInteractions: drained?.restore ?? null,
      };
    }
    if (!directSend) return { sections: [], restoreInteractions: null };
    const consumer = config.getEphemeralContext?.() ?? null;
    return {
      sections: consumer ? [{ kind: "consumer", text: consumer }] : [],
      restoreInteractions: null,
    };
  }

  // One turn per CONVERSATION, engine-enforced: a send while the
  // conversation's turn is active enqueues behind it (from ANY instance)
  // instead of interleaving a second turn into the store. The returned
  // promise resolves when the message's turn completes on BOTH paths —
  // immediate send and queue-drain.
  function startOrEnqueue(
    texts: string[],
    directSend: boolean,
  ): Promise<void> {
    const s = store();
    const id = conversationId();
    if (s.activeTurn[0]() !== null) {
      return new Promise<void>((resolve) => {
        const [queued, setQueued] = s.queuedMessages;
        const entries = texts.map((text, i) => ({
          text,
          resolve: i === texts.length - 1 ? resolve : () => {},
        }));
        setQueued([...queued(), ...entries]);
      });
    }
    const turn = claimTurn(s, id);
    return runTurn(turn, texts, directSend, []);
  }

  function sendMessage(userMessage: string): Promise<void> {
    return startOrEnqueue([userMessage], true);
  }

  function sendMessages(userMessages: string[]): Promise<void> {
    if (userMessages.length === 0) return Promise.resolve();
    // No ephemeral context on the batch path — parity with the historical
    // sendMessages behavior (context rides direct sends only).
    return startOrEnqueue(userMessages, false);
  }

  async function runTurn(
    turn: ActiveTurn,
    texts: string[],
    directSend: boolean,
    queueResolvers: Array<() => void>,
  ): Promise<void> {
    const ts = turn.store;
    const [tMessages, setTMessages] = ts.messages;
    const [tCurrentStreamingText, setTCurrentStreamingText] =
      ts.currentStreamingText;
    turn.resolveOnFinish.push(...queueResolvers);
    ts.error[1](null);
    let restoreInteractions: (() => void) | null = null;

    // PROTECTED REGION: everything from here to the finally runs under the
    // turn lock, and the lock is released on EVERY exit — including a
    // synchronous throw from a consumer callback (getEphemeralContext,
    // getDocumentRefs) in the prologue below. A throw surfaces through the
    // normal error path (error() + tool_error item); the send promise still
    // resolves (await means "the attempt finished"). Later phases run more
    // consumer callbacks in the turn's extent (view labels, approval
    // prepare) — they must stay inside this region.
    try {
      // Storage normalization at turn creation: demote a FAILED prior
      // turn's carrier so its stale sections can never re-render on this
      // turn's wire (the render rule alone cannot distinguish that history
      // from a multi-message batch — see demoteStaleCarriers).
      const demoted = demoteStaleCarriers(tMessages());
      if (demoted !== tMessages()) {
        setTMessages(demoted);
      }

      if (texts.length > 0) {
        const isFirstMessage = tMessages().length === 0;
        const built: MessageParam[] = [];
        const displayMessages: MessageParam[] = [];
        // createUserMessage attaches only not-yet-sent documents, so the
        // first message of a batch carries any new ones and the rest stay
        // plain text. Sections attach to the batch's FIRST message at turn
        // creation, storage-only; the wire renders them per request
        // (renderOutgoingMessages tolerates trailing batch messages).
        const firstMsg = createUserMessage(texts[0], tMessages());
        const turnSections = buildTurnSections(
          directSend,
          turn.conversationId,
        );
        restoreInteractions = turnSections.restoreInteractions;
        if (turnSections.sections.length > 0) {
          firstMsg.ephemeralSections = turnSections.sections;
        }
        built.push(firstMsg);
        if (texts[0].trim()) displayMessages.push(firstMsg);
        for (const text of texts.slice(1)) {
          const userMsg: MessageParam = { role: "user", content: text };
          built.push(userMsg);
          if (text.trim()) displayMessages.push(userMsg);
        }

        setTMessages([...tMessages(), ...built]);
        for (const msg of displayMessages) {
          processMessageForDisplayTo(ts, msg);
        }

        // Update title from first message
        if (isFirstMessage && texts[0]?.trim() && conversationsContext) {
          conversationsContext.updateTitleFromFirstMessage(
            turn.conversationId,
            texts[0],
          );
        }
      }

      ts.isLoading[1](true);
      ts.isStreaming[1](true);
      setTCurrentStreamingText(undefined);

      await streamWithToolLoop(turn, tMessages());
      if (turn.abort.signal.aborted) {
        const partialText = tCurrentStreamingText();
        if (partialText?.trim()) {
          addDisplayItemsTo(ts, [
            { type: "assistant_text", text: partialText.trim() },
          ]);
        }
      }
    } catch (err) {
      if (turn.abort.signal.aborted) {
        const partialText = tCurrentStreamingText();
        if (partialText?.trim()) {
          addDisplayItemsTo(ts, [
            { type: "assistant_text", text: partialText.trim() },
          ]);
        }
      } else {
        const errorDetails = err instanceof Error ? err.message : String(err);
        ts.error[1](errorDetails);
        ts.isStreaming[1](false);
        setTCurrentStreamingText(undefined);
        ts.serverToolLabel[1](undefined);
        addDisplayItemsTo(ts, [
          {
            type: "tool_error",
            toolName: "system",
            errorMessage: getUserFacingErrorMessage(err),
            errorDetails,
          },
        ]);
      }
    } finally {
      if (turn.abort.signal.aborted) {
        const msgs = tMessages();
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === "user") {
          setTMessages([
            ...msgs,
            { role: "assistant", content: "[Stopped]" },
          ]);
        }
      }

      // Transactional interaction drain (Phase 3): a turn that ends without
      // any assistant message FROM THE MODEL (failed or stopped before/
      // during the stream — the synthetic "[Stopped]" repair above doesn't
      // count) never delivered its digest. Restore the drained entries; they
      // ride the retry's fresh digest, and the failed carrier's stored
      // sections are demoted at the next turn's creation, so nothing
      // double-delivers.
      if (restoreInteractions && !turn.modelAssistantAppended) {
        restoreInteractions();
      }
      turn.activeStream = null;
      ts.isLoading[1](false);
      ts.isStreaming[1](false);
      setTCurrentStreamingText(undefined);
      ts.serverToolLabel[1](undefined);
      ts.isProcessingTools[1](false);

      // Save conversation state after turn completes — the finally-only
      // save is load-bearing for the no-dangling-tool_use invariant (never
      // add mid-turn saves).
      if (config.enablePersistence ?? true) {
        saveConversation(
          turn.conversationId,
          tMessages(),
          ts.displayItems[0](),
        );
      }

      // Update conversation metadata
      if (conversationsContext) {
        conversationsContext.updateLastMessageTime(turn.conversationId);
      }

      // Release the conversation's turn lock, then resolve the senders'
      // promises for every text this turn carried.
      ts.activeTurn[1](null);
      for (const resolve of turn.resolveOnFinish) resolve();
    }
  }

  async function streamWithToolLoop(
    turn: ActiveTurn,
    currentMessages: MessageParam[],
    depth: number = 0,
  ): Promise<void> {
    const ts = turn.store;
    // Use SDK's beta streaming. The web-fetch beta header is only needed
    // for the basic web_fetch variant used on pre-4.6 models.
    const allTools = getAllTools();
    const betas = getBetasArray(
      hasWebFetchTool(config.builtInTools) &&
        !supportsDynamicWebTools(modelConfig.model),
      messagesContainDocuments(currentMessages),
    );
    const shaped = shapeCachedPayload(
      config.system(),
      renderOutgoingMessages(currentMessages),
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
      // The _20260209 web tools run through a code-execution container
      // (dynamic filtering). A continuation request whose history holds a
      // pending code-execution-generated tool use is rejected without the
      // container id from the previous response — turn-scoped on the
      // ActiveTurn (an expired id errors, so it must never outlive the
      // turn).
      container: turn.containerId,
      betas,
    });
    turn.activeStream = stream;

    // Subscribe to text events
    stream.on("text", (text) => {
      // Clear server tool label when text starts streaming
      ts.serverToolLabel[1](undefined);
      const prev = ts.currentStreamingText[0]();
      ts.currentStreamingText[1]((prev ?? "") + text);
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
            ts.serverToolLabel[1](label);
          }
        }
      }
    });

    // Wait for completion
    const finalMessage = await stream.finalMessage();
    turn.activeStream = null;
    if (turn.abort.signal.aborted) return;

    // Update usage
    if (finalMessage.usage) {
      ts.usage[1](finalMessage.usage);
      ts.usageHistory[1]([...ts.usageHistory[0](), finalMessage.usage]);
    }

    // Carry the latest container id forward — a continuation response may
    // return a fresh container, or none (keep the current one then).
    turn.containerId = finalMessage.container?.id ?? turn.containerId;

    // Add assistant message
    const assistantMsg: MessageParam = {
      role: "assistant",
      content: finalMessage.content as ContentBlock[],
    };

    const updatedMessages = [...currentMessages, assistantMsg];
    ts.messages[1](updatedMessages);
    turn.modelAssistantAppended = true;
    processMessageForDisplayTo(ts, assistantMsg);

    // Clear streaming state immediately after message is processed
    ts.isStreaming[1](false);
    ts.currentStreamingText[1](undefined);
    ts.serverToolLabel[1](undefined);

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
        ts.messages[1]([
          ...updatedMessages,
          { role: "user", content: cancelled },
        ]);
      }
      addDisplayItemsTo(ts, [
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
      ts.isStreaming[1](true);
      ts.currentStreamingText[1](undefined);
      await streamWithToolLoop(turn, updatedMessages, depth + 1);
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
        ts.messages[1]([
          ...currentMessages,
          {
            role: "assistant",
            content: trimmed.length > 0
              ? trimmed
              : "[Stopped: too many turn continuations]",
          },
        ]);
      }
      addDisplayItemsTo(ts, [
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
      ts.messages[1]([
        ...updatedMessages,
        {
          role: "user",
          content: buildCancelledToolResults(
            finalMessage.content as ContentBlock[],
            "Tool execution stopped: too many tool calls in one turn",
          ),
        },
      ]);
      addDisplayItemsTo(ts, [
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
      ts.isProcessingTools[1](true);

      // Show in-progress items
      const inProgressItems = getInProgressItems(
        finalMessage.content as ContentBlock[],
        toolRegistry,
      );
      addDisplayItemsTo(ts, inProgressItems);

      // Process tools - handle text editor tool specially
      const allResults: ToolResult[] = [];
      const allErrorItems: DisplayItem[] = [];
      const allSuccessItems: DisplayItem[] = [];

      for (const block of toolUseBlocks) {
        if (turn.abort.signal.aborted) {
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
          ts.serverToolLabel[1](SERVER_TOOL_LABELS[block.name]);
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
          ts.serverToolLabel[1](undefined);
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
          // Soft gate (Feature 2): refuse an out-of-view execution before
          // the handler runs — checked per block against the LIVE view, so
          // a nav tool changing the view mid-turn is seen by the very next
          // block's check.
          const vc = config.viewController;
          const gated = vc
            ? checkViewGate(block, toolRegistry, String(vc.current().id))
            : null;
          if (gated) {
            allResults.push(gated.result);
            allErrorItems.push(gated.errorItem);
            continue;
          }

          // Use existing tool processing for custom tools — raced against
          // the turn's abort signal so Stop finalizes the turn even when a
          // handler never resolves.
          const outcome = await raceAbort(
            turn.abort.signal,
            processToolUses([block], toolRegistry),
          );
          if (outcome.aborted) {
            allResults.push(
              ...buildCancelledToolResults(
                toolUseBlocks.slice(toolUseBlocks.indexOf(block)),
                "Tool execution cancelled by user",
              ),
            );
            break;
          }
          const { results, errorItems, successItems } = outcome.value;
          allResults.push(...results);
          allErrorItems.push(...errorItems);
          allSuccessItems.push(...successItems);

          // Add display component for successful tools
          if (errorItems.length === 0) {
            const metadata = toolRegistry.getMetadata(block.name);
            if (metadata?.displayComponent) {
              addDisplayItemsTo(ts, [{
                type: "tool_display",
                toolName: block.name,
                input: block.input,
              }]);
            }
          }
        }
      }

      // Clear in-progress items now that tools are done
      clearInProgressItemsIn(ts);

      // Add success items to display
      if (allSuccessItems.length > 0) {
        addDisplayItemsTo(ts, allSuccessItems);
      }

      // Add error items to display
      if (allErrorItems.length > 0) {
        addDisplayItemsTo(ts, allErrorItems);
      }

      // Check the turn's own conversation queue for user messages to inject
      // alongside tool results. Their display bubbles materialize here (they
      // rendered from the queue signal until now) and their senders'
      // promises resolve when this turn finishes.
      const queueEntries = ts.queuedMessages[0]();
      const queuedTexts = queueEntries.map((q) => q.text);
      if (queueEntries.length > 0) {
        ts.queuedMessages[1]([]);
        turn.resolveOnFinish.push(...queueEntries.map((q) => q.resolve));
        addDisplayItemsTo(
          ts,
          queuedTexts
            .filter((text) => text.trim())
            .map((text) => ({ type: "user_text", text: text.trim() })),
        );
      }

      const toolResultMsg = buildToolResultUserMessage(allResults, queuedTexts);

      const messagesWithToolResults = [...updatedMessages, toolResultMsg];
      ts.messages[1](messagesWithToolResults);

      if (turn.abort.signal.aborted) return;

      // Continue streaming with tool results (recursive call)
      ts.isStreaming[1](true);
      ts.currentStreamingText[1](undefined);
      await streamWithToolLoop(turn, messagesWithToolResults, depth + 1);
    }
  }

  // Drain the ACTIVE conversation's queue when its own turn lock is free.
  // The synchronous claim inside the effect makes a second mounted
  // instance's drain a no-op, not a second turn.
  createEffect(() => {
    const s = store();
    const id = conversationId();
    const turn = s.activeTurn[0]();
    const queue = s.queuedMessages[0]();
    const msgs = s.messages[0]();

    if (turn !== null || queue.length === 0) return;
    // A persisted conversation stranded on unresolved tool_use would 400 on
    // any send — hold the queue (matches the historical drain guard).
    if (lastMessageHasUnresolvedToolUse(msgs)) return;

    s.queuedMessages[1]([]);
    const claimed = claimTurn(s, id);
    runTurn(
      claimed,
      queue.map((q) => q.text),
      false,
      queue.map((q) => q.resolve),
    );
  });

  // Stop operates on the ACTIVE conversation's turn — any instance's Stop
  // aborts it regardless of which instance started it. The abort signal
  // guarantees finalization (see raceAbort): Stop always releases the
  // conversation.
  function stopGeneration() {
    const s = store();
    const turn = s.activeTurn[0]();
    if (!turn) return;
    turn.abort.abort();
    if (turn.activeStream) {
      try {
        turn.activeStream.abort();
      } catch { /* swallow */ }
      turn.activeStream = null;
    }
    clearInProgressItemsIn(turn.store);
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
    pendingUserAction,
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
