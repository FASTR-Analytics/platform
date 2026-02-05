import { createContext, useContext, createSignal, type ParentProps } from "solid-js";
import type { InstanceDetail } from "lib";
import type { AIContext, AIProjectContextValue, AIUserInteraction, DraftContent } from "./types";

const AIProjectContext = createContext<AIProjectContextValue>();

type AIProjectContextProviderProps = ParentProps<{
  instanceDetail: InstanceDetail;
}>;

export function AIProjectContextProvider(props: AIProjectContextProviderProps) {
  const [aiContext, setAIContextInternal] = createSignal<AIContext>({ mode: "default" });
  const [draftContent, setDraftContent] = createSignal<DraftContent>(null);
  const [pendingInteractions, setPendingInteractions] = createSignal<AIUserInteraction[]>([]);

  const notifyAI = (interaction: AIUserInteraction) => {
    setPendingInteractions((prev) => [...prev, interaction]);
  };

  const setAIContext = (ctx: AIContext) => {
    const prev = aiContext();
    setAIContextInternal(ctx);

    // Auto-notify on mode changes
    if (ctx.mode !== prev.mode) {
      if (ctx.mode === "deck") {
        notifyAI({ type: "switched_to_deck", deckId: ctx.deckId, deckLabel: ctx.deckLabel });
      } else if (ctx.mode === "viz-editor") {
        notifyAI({ type: "switched_to_viz_editor", vizId: ctx.vizId ?? "temp", vizLabel: ctx.vizLabel });
      } else if (ctx.mode === "report") {
        notifyAI({ type: "custom", message: `Opened report editor "${ctx.reportLabel}"` });
      } else if (ctx.mode === "default") {
        notifyAI({ type: "switched_to_default" });
      }
    }
  };

  const getPendingInteractionsMessage = (): string | null => {
    const interactions = pendingInteractions();
    if (interactions.length === 0) return null;

    const lines = interactions.map(formatInteraction);
    return `[User actions since last message:\n${lines.join("\n")}]`;
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

function formatInteraction(interaction: AIUserInteraction): string {
  switch (interaction.type) {
    case "switched_to_deck":
      return `- Opened slide deck "${interaction.deckLabel}"`;
    case "switched_to_viz_editor":
      return `- Opened visualization editor for "${interaction.vizLabel}"`;
    case "switched_to_default":
      return `- Returned to project view`;
    case "navigated_to_tab":
      return `- Navigated to ${interaction.tabName} tab`;
    case "added_slide":
      return `- Added new slide (${interaction.slideId})`;
    case "edited_slide":
      return `- Edited slide ${interaction.slideId}`;
    case "deleted_slides":
      return `- Deleted slides: ${interaction.slideIds.join(", ")}`;
    case "duplicated_slides":
      return `- Duplicated slides: ${interaction.slideIds.join(", ")}`;
    case "moved_slides":
      return `- Moved slides: ${interaction.slideIds.join(", ")}`;
    case "selected_slides":
      return `- Selected slides: ${interaction.slideIds.join(", ")}`;
    case "edited_viz_config":
      return `- Changed visualization ${interaction.field}`;
    case "selected_visualization":
      return `- Selected visualization "${interaction.vizLabel}"`;
    case "custom":
      return `- ${interaction.message}`;
  }
}
