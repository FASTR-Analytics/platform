import { createContext, useContext, createSignal, type ParentProps } from "solid-js";
import type { InstanceDetail } from "lib";
import type { AIContext, AIProjectContextValue, AIUserInteraction, DraftContent } from "./types";
import { reduceInteractions, formatInteraction } from "./interactions";

const AIProjectContext = createContext<AIProjectContextValue>();

type AIProjectContextProviderProps = ParentProps<{
  instanceDetail: InstanceDetail;
}>;

export function AIProjectContextProvider(props: AIProjectContextProviderProps) {
  const [aiContext, setAIContextInternal] = createSignal<AIContext>({ mode: "viewing_visualizations" });
  const [draftContent, setDraftContent] = createSignal<DraftContent>(null);
  const [pendingInteractions, setPendingInteractions] = createSignal<AIUserInteraction[]>([]);

  const notifyAI = (interaction: AIUserInteraction) => {
    setPendingInteractions((prev) => [...prev, interaction]);
  };

  const setAIContext = (ctx: AIContext) => {
    setAIContextInternal(ctx);
  };

  const getPendingInteractionsMessage = (): string | null => {
    const interactions = pendingInteractions();
    if (interactions.length === 0) return null;

    const reduced = reduceInteractions(interactions, aiContext());
    if (reduced.length === 0) return null;

    const lines = reduced.map(formatInteraction);
    return `User actions since last message:\n${lines.join("\n")}`;
  };

  const clearPendingInteractions = () => {
    setPendingInteractions([]);
  };

  const value: AIProjectContextValue = {
    aiContext,
    setAIContext,
    draftContent,
    setDraftContent,
    notifyAI,
    getPendingInteractionsMessage,
    clearPendingInteractions,
    instanceDetail: props.instanceDetail,
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
