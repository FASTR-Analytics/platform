import { createContext, useContext, createSignal, type ParentProps } from "solid-js";
import type { AIProjectContextValue, DraftContent } from "./types";

const AIProjectContext = createContext<AIProjectContextValue>();

export function AIProjectContextProvider(props: ParentProps) {
  const [draftContent, setDraftContent] = createSignal<DraftContent>(null);

  const value: AIProjectContextValue = {
    draftContent,
    setDraftContent,
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
