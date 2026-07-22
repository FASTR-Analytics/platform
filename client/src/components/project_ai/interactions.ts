import type { ProjectAIViewState } from "./ai_views";
import type { AIUserInteraction } from "./types";

// currentView replaces the pre-views AIContext parameter (deleted in Rung 3,
// PLAN_FUTURE_AI_ADOPTIONS.md) — same per-view reduction rules, read through
// the view controller's state shape instead. This function itself (and the
// pendingInteractions queue feeding it) is unchanged Rung-4 territory
// (feature 3, defineAIInteractions); only its input type moved.
export function reduceInteractions(
  interactions: AIUserInteraction[],
  currentView: ProjectAIViewState,
): AIUserInteraction[] {
  const reduced: AIUserInteraction[] = [];

  const editedSlides = new Set<string>();
  let hasDeckStructureChanged = false;
  let latestSelection: AIUserInteraction | null = null;
  let latestSelectedViz: AIUserInteraction | null = null;
  let hasEditedVizLocally = false;
  let hasEditedSlideLocally = false;
  let hasEditedReportLocally = false;
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
      case "edited_report_locally":
        hasEditedReportLocally = true;
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

  if (currentView.id === "editing_slide_deck") {
    const deckSlideIds = new Set(currentView.context.getSlideIds());

    if (hasDeckStructureChanged) {
      reduced.push({ type: "deck_structure_changed" });
    }

    for (const slideId of editedSlides) {
      if (deckSlideIds.has(slideId)) {
        reduced.push({ type: "edited_slide", slideId });
      }
    }
  }

  if (currentView.id === "editing_slide") {
    if (hasEditedSlideLocally) {
      reduced.push({ type: "edited_slide_locally" });
    }
    if (editedSlides.has(currentView.params.slideId)) {
      reduced.push({ type: "edited_slide", slideId: currentView.params.slideId });
    }
  }

  if (currentView.id === "editing_visualization") {
    if (hasEditedVizLocally) {
      reduced.push({ type: "edited_viz_locally" });
    }
  }

  if (currentView.id === "editing_report") {
    if (hasEditedReportLocally) {
      reduced.push({ type: "edited_report_locally" });
    }
  }

  if (currentView.id === "viewing_slide_decks") {
    if (latestSelection) {
      reduced.push(latestSelection);
    }
  }

  if (currentView.id === "viewing_visualizations") {
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
    case "edited_report_locally":
      return `- User edited the report body (re-read with get_report_editor before proposing edits)`;
    case "custom":
      return `- ${interaction.message}`;
    default: {
      const _exhaustive: never = interaction;
      return _exhaustive;
    }
  }
}
