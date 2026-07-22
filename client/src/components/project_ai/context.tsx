import { createContext, useContext, createSignal, type ParentProps } from "solid-js";
import type { AIProjectContextValue, AIUserInteraction, DraftContent } from "./types";
import { reduceInteractions, formatInteraction } from "./interactions";
import { projectAIViewController } from "./ai_views";

const AIProjectContext = createContext<AIProjectContextValue>();

export function AIProjectContextProvider(props: ParentProps) {
  const [draftContent, setDraftContent] = createSignal<DraftContent>(null);
  const [pendingInteractions, setPendingInteractions] = createSignal<AIUserInteraction[]>([]);

  const notifyAI = (interaction: AIUserInteraction) => {
    setPendingInteractions((prev) => [...prev, interaction]);
  };

  const getPendingInteractionsMessage = (): string | null => {
    const interactions = pendingInteractions();
    if (interactions.length === 0) return null;

    // reduceInteractions still keys off the CURRENT view state (unchanged
    // rung-4 territory, PLAN_FUTURE_AI_ADOPTIONS.md feature 3) — read from the
    // view controller instead of the deleted aiContext signal.
    const reduced = reduceInteractions(
      interactions,
      projectAIViewController.current(),
    );
    if (reduced.length === 0) return null;

    const lines = reduced.map(formatInteraction);
    return `User actions since last message:\n${lines.join("\n")}`;
  };

  const clearPendingInteractions = () => {
    setPendingInteractions([]);
  };

  const value: AIProjectContextValue = {
    draftContent,
    setDraftContent,
    notifyAI,
    getPendingInteractionsMessage,
    clearPendingInteractions,
  };

  return (
    <AIProjectContext.Provider value={value}>
      {props.children}
    </AIProjectContext.Provider>
  );
}

export function useAIProjectContext(): AIProjectContextValue {
  const ctx = useContext(AIProjectContext);
  if (!ctx) {
    throw new Error("useAIProjectContext must be used within AIProjectContextProvider");
  }
  return ctx;
}
