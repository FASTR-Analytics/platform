import { createContext, useContext, createSignal, type ParentProps } from "solid-js";
import type { InstanceDetail } from "lib";
import type { AIContext, AIProjectContextValue, AIUserInteraction, DraftContent } from "./types";

const _SHOW_UI_INTERACTIONS = false

const AIProjectContext = createContext<AIProjectContextValue>();

type AIProjectContextProviderProps = ParentProps<{
  instanceDetail: InstanceDetail;
}>;

// Reduce redundant interactions to essential information
// Only keeps interactions relevant to the current context
function reduceInteractions(interactions: AIUserInteraction[], currentContext: AIContext): AIUserInteraction[] {
  const reduced: AIUserInteraction[] = [];

  // Track edited slides (deduplicate)
  const editedSlides = new Set<string>();

  // Track slide operations
  const addedSlides = new Set<string>();
  const deletedSlideIds = new Set<string>();
  const duplicatedSlideIds = new Set<string>();
  const movedSlideIds = new Set<string>();

  // Track latest selection
  let latestSelection: AIUserInteraction | null = null;

  // Track other events
  const editedVizFields = new Map<string, Set<string>>(); // vizId -> Set<field>
  let latestSelectedViz: AIUserInteraction | null = null;
  const customMessages: string[] = [];

  for (const interaction of interactions) {
    switch (interaction.type) {
      case "edited_slide":
        // If slide was added in this batch, skip edit (implied by add)
        if (!addedSlides.has(interaction.slideId)) {
          editedSlides.add(interaction.slideId);
        }
        break;

      case "added_slide":
        addedSlides.add(interaction.slideId);
        // Remove from edited if it was there
        editedSlides.delete(interaction.slideId);
        break;

      case "deleted_slides":
        interaction.slideIds.forEach(id => {
          deletedSlideIds.add(id);
          // Remove from other sets (deleted trumps all)
          addedSlides.delete(id);
          editedSlides.delete(id);
          duplicatedSlideIds.delete(id);
          movedSlideIds.delete(id);
        });
        break;

      case "duplicated_slides":
        interaction.slideIds.forEach(id => duplicatedSlideIds.add(id));
        break;

      case "moved_slides":
        interaction.slideIds.forEach(id => movedSlideIds.add(id));
        break;

      case "selected_slides":
        latestSelection = interaction;
        break;

      case "edited_viz_config":
        if (!editedVizFields.has(interaction.vizId)) {
          editedVizFields.set(interaction.vizId, new Set());
        }
        editedVizFields.get(interaction.vizId)!.add(interaction.field);
        break;

      case "selected_visualizations":
        latestSelectedViz = interaction;
        break;

      case "custom":
        customMessages.push(interaction.message);
        break;
    }
  }

  // Build final reduced list in logical order, filtered by context

  // In editing_slide_deck mode: include slide operations and selections (filtered to current deck)
  if (currentContext.mode === "editing_slide_deck") {
    const deckSlideIds = new Set(currentContext.getSlideIds());

    // Only include operations on slides in the current deck
    for (const slideId of addedSlides) {
      if (deckSlideIds.has(slideId)) {
        reduced.push({ type: "added_slide", slideId });
      }
    }

    for (const slideId of editedSlides) {
      if (deckSlideIds.has(slideId)) {
        reduced.push({ type: "edited_slide", slideId });
      }
    }

    const relevantDeleted = Array.from(deletedSlideIds).filter(id => deckSlideIds.has(id));
    if (relevantDeleted.length > 0) {
      reduced.push({ type: "deleted_slides", slideIds: relevantDeleted });
    }

    const relevantDuplicated = Array.from(duplicatedSlideIds).filter(id => deckSlideIds.has(id));
    if (relevantDuplicated.length > 0) {
      reduced.push({ type: "duplicated_slides", slideIds: relevantDuplicated });
    }

    const relevantMoved = Array.from(movedSlideIds).filter(id => deckSlideIds.has(id));
    if (relevantMoved.length > 0) {
      reduced.push({ type: "moved_slides", slideIds: relevantMoved });
    }

    if (latestSelection && latestSelection.type === "selected_slides") {
      // Filter selection to current deck
      const relevantSelected = latestSelection.slideIds.filter(id => deckSlideIds.has(id));
      if (relevantSelected.length > 0) {
        reduced.push({ type: "selected_slides", slideIds: relevantSelected });
      }
    }
  }

  // In editing_visualization mode: include viz operations (for current viz only)
  if (currentContext.mode === "editing_visualization") {
    const currentVizId = currentContext.vizId;

    // Include edits for current viz (or all if ephemeral/create mode with null vizId)
    for (const [vizId, fields] of editedVizFields) {
      if (vizId === currentVizId || currentVizId === null) {
        for (const field of fields) {
          reduced.push({ type: "edited_viz_config", vizId, field });
        }
      }
    }
  }

  // In viewing_visualizations mode: include viz selections (browsing viz list)
  if (currentContext.mode === "viewing_visualizations") {
    if (latestSelectedViz) {
      reduced.push(latestSelectedViz);
    }
  }

  // Custom messages always relevant
  for (const message of customMessages) {
    reduced.push({ type: "custom", message });
  }

  return reduced;
}

function formatInteraction(interaction: AIUserInteraction): string {
  switch (interaction.type) {
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
      return `- Changed ${interaction.field} in viz ${interaction.vizId}`;
    case "selected_visualizations":
      return `- Selected visualizations: ${interaction.vizIds.join(", ")}`;
    case "custom":
      return `- ${interaction.message}`;
  }
}

export function AIProjectContextProvider(props: AIProjectContextProviderProps) {
  const [aiContext, setAIContextInternal] = createSignal<AIContext>({ mode: "viewing_visualizations" });
  const [draftContent, setDraftContent] = createSignal<DraftContent>(null);
  const [pendingInteractions, setPendingInteractions] = createSignal<AIUserInteraction[]>([]);

  const notifyAI = (interaction: AIUserInteraction) => {
    setPendingInteractions((prev) => [...prev, interaction]);
  };

  const setAIContext = (ctx: AIContext) => {
    setAIContextInternal(ctx);
    // Context changes are implicit - no need to notify as interactions
    // The context itself tells the AI where the user is
  };

  const getPendingInteractionsMessage = (): string | null => {
    const interactions = pendingInteractions();
    if (interactions.length === 0) return null;

    const reduced = reduceInteractions(interactions, aiContext());
    const lines = reduced.map(formatInteraction);
    if (_SHOW_UI_INTERACTIONS) {
      return `User actions since last message:\n${lines.join("\n")}`;
    }
    return `<<<[User actions since last message:\n${lines.join("\n")}]>>>`;
  };

  const clearPendingInteractions = () => {
    // Clear all interactions after message is sent
    // Filtered-out interactions are also cleared to prevent stale data
    // (e.g., deck A edits shouldn't suddenly appear when switching back to deck A later)
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
