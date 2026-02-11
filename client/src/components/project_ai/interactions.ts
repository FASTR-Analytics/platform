import type { AIContext, AIUserInteraction } from "./types";

export function reduceInteractions(
  interactions: AIUserInteraction[],
  currentContext: AIContext,
): AIUserInteraction[] {
  const reduced: AIUserInteraction[] = [];

  const editedSlides = new Set<string>();
  let hasDeckStructureChanged = false;
  let latestSelection: AIUserInteraction | null = null;
  let latestSelectedViz: AIUserInteraction | null = null;
  let hasEditedVizLocally = false;
  let hasEditedSlideLocally = false;
  const customMessages: string[] = [];

  for (const interaction of interactions) {
    switch (interaction.type) {
      case "edited_slide":
        editedSlides.add(interaction.slideId);
        break;
      case "deck_structure_changed":
        hasDeckStructureChanged = true;
        break;
      case "selected_slides":
        latestSelection = interaction;
        break;
      case "selected_visualizations":
        latestSelectedViz = interaction;
        break;
      case "edited_viz_locally":
        hasEditedVizLocally = true;
        break;
      case "edited_slide_locally":
        hasEditedSlideLocally = true;
        break;
      case "custom":
        customMessages.push(interaction.message);
        break;
      default: {
        const _exhaustive: never = interaction;
        return _exhaustive;
      }
    }
  }

  if (currentContext.mode === "editing_slide_deck") {
    const deckSlideIds = new Set(currentContext.getSlideIds());

    if (hasDeckStructureChanged) {
      reduced.push({ type: "deck_structure_changed" });
    }

    for (const slideId of editedSlides) {
      if (deckSlideIds.has(slideId)) {
        reduced.push({ type: "edited_slide", slideId });
      }
    }

    if (latestSelection && latestSelection.type === "selected_slides") {
      const relevantSelected = latestSelection.slideIds.filter((id) =>
        deckSlideIds.has(id)
      );
      if (relevantSelected.length > 0) {
        reduced.push({ type: "selected_slides", slideIds: relevantSelected });
      }
    }
  }

  if (currentContext.mode === "editing_slide") {
    if (hasEditedSlideLocally) {
      reduced.push({ type: "edited_slide_locally" });
    }
    if (editedSlides.has(currentContext.slideId)) {
      reduced.push({ type: "edited_slide", slideId: currentContext.slideId });
    }
  }

  if (currentContext.mode === "editing_visualization") {
    if (hasEditedVizLocally) {
      reduced.push({ type: "edited_viz_locally" });
    }
  }

  if (currentContext.mode === "viewing_visualizations") {
    if (latestSelectedViz) {
      reduced.push(latestSelectedViz);
    }
  }

  for (const message of customMessages) {
    reduced.push({ type: "custom", message });
  }

  return reduced;
}

export function formatInteraction(interaction: AIUserInteraction): string {
  switch (interaction.type) {
    case "edited_slide":
      return `- Edited slide ${interaction.slideId}`;
    case "deck_structure_changed":
      return `- Slide deck structure changed (slides added, removed, or reordered)`;
    case "selected_slides":
      return `- Selected slides: ${interaction.slideIds.join(", ")}`;
    case "selected_visualizations":
      return `- Selected visualizations: ${interaction.vizIds.join(", ")}`;
    case "edited_viz_locally":
      return `- User made local changes to the visualization config (unsaved)`;
    case "edited_slide_locally":
      return `- User made local changes to the slide content (unsaved)`;
    case "custom":
      return `- ${interaction.message}`;
    default: {
      const _exhaustive: never = interaction;
      return _exhaustive;
    }
  }
}
