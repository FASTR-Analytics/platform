// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GateView, MessageParam, Usage } from "../deps.ts";
import { batch, createSignal } from "solid-js";
import type { ChatState, DisplayItem } from "./types.ts";
import type { ProposalPreview } from "../deps.ts";
import {
  clearConversationPersistence,
  loadConversation,
} from "./persistence.ts";

// The in-flight turn, reified as a small private record owned by the
// conversation store (one turn per conversation, engine-enforced). Created
// synchronously at send time by the chat loop and threaded as a parameter
// through every helper that touches conversation state, so a turn started in
// conversation A finishes in conversation A regardless of what is active.
// Instance disposal is inert: a detached turn keeps running into its pinned
// store and its finally lands. Not exported from the public barrel.
export type ActiveTurn = {
  conversationId: string;
  store: ConversationStore;
  // Replaces the old per-instance activeStream/abortRequested mutables. Stop
  // aborts this controller; the tool loop races handler awaits against the
  // signal so Stop ALWAYS releases the conversation (a never-resolving
  // handler cannot hold the turn open).
  abort: AbortController;
  activeStream: { abort: () => void } | null;
  // Code-execution container id — turn-scoped (an expired id errors, so it
  // must never outlive the turn).
  containerId: string | undefined;
  // Resolvers for sendMessage/sendMessages promises whose texts this turn
  // carried (direct sends, drained queue entries, mid-turn injections) and
  // for whenIdle() waiters, resolved in the turn's finally after its record
  // is saved — await means "the attempt finished", not "it succeeded"
  // (errors surface via error()).
  resolveOnFinish: Array<() => void>;
  // The view of the latest view line this turn sent: what the model was last
  // told. Every view-limited call gates against it, so a move of the view's
  // identity under the turn refuses the call instead of running it against
  // what the user moved to. Set with the turn's first message; never
  // persisted. Null without a view controller.
  viewReference: GateView | null;
  // Cancels THIS turn's currently-executing promise-blocking card
  // (ask_user_questions), set by the loop around the block's await and
  // called by stopGeneration. Turn-scoped ON PURPOSE: a
  // registry-wide sweep cancelled another conversation's pending question
  // when two chats shared the same tool instance.
  cancelPendingInteraction: (() => void) | null;
  // The index of this turn's first message, null until it is appended, and
  // of the model's last reply this turn (-1 when none; the synthetic
  // "[Stopped]" repair never counts): the release at the turn's end strips
  // the sections of every carrier after the last reply, and an approval
  // lifecycle, which runs only after a reply landed, can never see a restore.
  firstIndex: number | null;
  lastModelReplyIndex: number;
  // Every message this turn built sections for, with the restore of the
  // interaction drain it carried: each released carrier's drain is restored,
  // latest first.
  carriers: Array<{ index: number; restore: (() => void) | null }>;
};

export type QueuedMessage = {
  text: string;
  resolve: () => void;
};

// The pending approval decision (Feature 4), owned by the CONVERSATION —
// never by UI mount (decision log #6): the card is a pure view over this
// signal plus a display item; unmount and instance disposal are inert, and
// only explicit paths resolve it (user decision, Stop, auto-decline when the
// live view leaves availableIn or its identity moves under the decision,
// staleness at accept). Decision lifetime ⊆ turn lifetime.
export type PendingDecisionOutcome =
  | { kind: "accepted"; alwaysThisSession: boolean }
  | { kind: "declined" }
  // View exit and a move of identity under the decision both record as
  // auto_declined; message is the standardized result: the view-exit string
  // naming the view the user left, or the moved string naming both views.
  | { kind: "auto_declined"; message: string }
  // Stop/halt — the block resolves through the cancelled-result machinery.
  | { kind: "interrupted" };

export type PendingDecision = {
  toolName: string;
  preview: ProposalPreview;
  // Whether the inline card offers "don't ask again in this conversation".
  sessionCheckbox: boolean;
  // The tool's availableIn, for the auto-decline watcher (absent = the tool
  // declared view-independence and opted out).
  availableIn?: string[];
  // The view the lifecycle started in, read once before propose's await:
  // the watcher gates the live view against it (id in availableIn, identity
  // equal), and its id names the view the user LEFT in the decline message.
  viewAtCreation?: GateView;
  // Idempotent — the first resolution wins, later calls are no-ops.
  resolve: (outcome: PendingDecisionOutcome) => void;
};

export type ConversationStore = {
  messages: ReturnType<typeof createSignal<MessageParam[]>>;
  displayItems: ReturnType<typeof createSignal<DisplayItem[]>>;
  isLoading: ReturnType<typeof createSignal<boolean>>;
  isStreaming: ReturnType<typeof createSignal<boolean>>;
  isProcessingTools: ReturnType<typeof createSignal<boolean>>;
  error: ReturnType<typeof createSignal<string | null>>;
  usage: ReturnType<typeof createSignal<Usage | null>>;
  currentStreamingText: ReturnType<typeof createSignal<string | undefined>>;
  usageHistory: ReturnType<typeof createSignal<Usage[]>>;
  serverToolLabel: ReturnType<typeof createSignal<string | undefined>>;
  activeTurn: ReturnType<typeof createSignal<ActiveTurn | null>>;
  pendingDecision: ReturnType<typeof createSignal<PendingDecision | null>>;
  queuedMessages: ReturnType<typeof createSignal<QueuedMessage[]>>;
  // Tool names session-approved via the "don't ask again in this
  // conversation" checkbox (approval mode "session"). Persisted with the
  // conversation record; hydrated with it.
  approvedTools: ReturnType<typeof createSignal<string[]>>;
  // The hash of the request prefix (system text and tools) the stored
  // thinking blocks were minted under (hashRequestPrefix). Written by every
  // turn, persisted and hydrated with the record; undefined only on a record
  // saved before the hash existed, which the next turn reads as a changed
  // prefix.
  prefixHash: ReturnType<typeof createSignal<string | undefined>>;
  // Resolves once the initial IndexedDB hydration attempt has settled
  // (hydrated, skipped, or persistence disabled). Sends await this before
  // claiming a turn — a send that appended before hydration resolved would
  // permanently skip it, and the turn's whole-record save would then
  // overwrite persisted history with just the new exchange.
  ready: Promise<void>;
};

const stores = new Map<string, ConversationStore>();

export function getOrCreateConversationStore(
  conversationId: string,
  enablePersistence: boolean = true,
): ConversationStore {
  if (!stores.has(conversationId)) {
    // Create store with empty state (synchronous); hydration from IndexedDB
    // lands asynchronously and `ready` marks when the attempt has settled.
    const messages = createSignal<MessageParam[]>([]);
    const displayItems = createSignal<DisplayItem[]>([]);
    const approvedTools = createSignal<string[]>([]);
    const prefixHash = createSignal<string | undefined>(undefined);

    const ready = enablePersistence
      ? loadConversation(conversationId).then((persisted) => {
        const [currentMessages] = messages;
        if (
          persisted && persisted.messages.length > 0 &&
          currentMessages().length === 0
        ) {
          const [, setMessages] = messages;
          const [, setDisplayItems] = displayItems;
          setMessages(persisted.messages);
          setDisplayItems(persisted.displayItems);
          approvedTools[1](persisted.approvedTools ?? []);
          prefixHash[1](persisted.prefixHash);
        }
      })
      : Promise.resolve();

    const store: ConversationStore = {
      messages,
      displayItems,
      isLoading: createSignal(false),
      isStreaming: createSignal(false),
      isProcessingTools: createSignal(false),
      error: createSignal<string | null>(null),
      usage: createSignal<Usage | null>(null),
      currentStreamingText: createSignal<string | undefined>(undefined),
      usageHistory: createSignal<Usage[]>([]),
      serverToolLabel: createSignal<string | undefined>(undefined),
      activeTurn: createSignal<ActiveTurn | null>(null),
      pendingDecision: createSignal<PendingDecision | null>(null),
      queuedMessages: createSignal<QueuedMessage[]>([]),
      approvedTools,
      prefixHash,
      ready,
    };

    stores.set(conversationId, store);
  }
  return stores.get(conversationId)!;
}

// Non-creating peek for the conversation-UI guard: false for never-created
// stores. NEVER replace with getConversationState — that routes through
// getOrCreateConversationStore and would create and IndexedDB-hydrate every
// conversation a selector lists.
export function hasActiveTurn(conversationId: string): boolean {
  const store = stores.get(conversationId);
  if (!store) return false;
  return store.activeTurn[0]() !== null;
}

export function clearConversationStore(conversationId: string): void {
  const store = stores.get(conversationId);
  if (store) {
    const [, setMessages] = store.messages;
    const [, setDisplayItems] = store.displayItems;
    const [, setIsLoading] = store.isLoading;
    const [, setIsStreaming] = store.isStreaming;
    const [, setIsProcessingTools] = store.isProcessingTools;
    const [, setError] = store.error;
    const [, setUsage] = store.usage;
    const [, setCurrentStreamingText] = store.currentStreamingText;
    const [, setUsageHistory] = store.usageHistory;
    const [, setServerToolLabel] = store.serverToolLabel;

    // Queued messages are dropped; their senders' promises resolve at drop
    // (await means "the attempt finished"). activeTurn is NOT touched — a
    // running turn nulls it in its own finally.
    const [queued, setQueued] = store.queuedMessages;
    const entries = queued();

    batch(() => {
      setMessages([]);
      setDisplayItems([]);
      setIsLoading(false);
      setIsStreaming(false);
      setIsProcessingTools(false);
      setError(null);
      setUsage(null);
      setCurrentStreamingText(undefined);
      setUsageHistory([]);
      setServerToolLabel(undefined);
      store.approvedTools[1]([]);
      store.prefixHash[1](undefined);
      setQueued([]);
    });
    for (const entry of entries) entry.resolve();

    // Also clear persisted data
    clearConversationPersistence(conversationId);
  }
}

export function deleteConversationStore(conversationId: string): void {
  stores.delete(conversationId);
}

export function getConversationState(conversationId: string): ChatState {
  const store = getOrCreateConversationStore(conversationId);
  const [messages] = store.messages;
  const [displayItems] = store.displayItems;
  const [isLoading] = store.isLoading;
  const [isStreaming] = store.isStreaming;
  const [error] = store.error;
  const [usage] = store.usage;
  const [currentStreamingText] = store.currentStreamingText;
  const [serverToolLabel] = store.serverToolLabel;

  return {
    messages: messages(),
    displayItems: displayItems(),
    isLoading: isLoading(),
    isStreaming: isStreaming(),
    error: error(),
    usage: usage(),
    currentStreamingText: currentStreamingText(),
    serverToolLabel: serverToolLabel(),
  };
}
