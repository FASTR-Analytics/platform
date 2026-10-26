import { type PackageScope, type RunAuthoringContext, t3 } from "lib";
import { type MenuItem, openComponent, showMenu } from "panther";
import { InsertExistingFigureModal } from "./insert_existing_figure";
import { InsertFigureModal, type InsertFigureResult } from "./insert_figure";

// Where an inserted figure comes from: a new one built in the wizard, or a
// copy of a saved visualization. Every insert and replace button in decks and
// reports offers both, through this one menu, and both hand back
// `{ metric, config }` for the host to resolve under its own pair.
export type FigureSource = "new" | "existing";

export type FigurePickerProps = {
  scope: PackageScope;
  context: Pick<RunAuthoringContext, "metrics" | "modules">;
};

export function openFigurePicker(
  source: FigureSource,
  props: FigurePickerProps,
): Promise<InsertFigureResult | undefined> {
  return source === "new"
    ? openComponent({
      element: InsertFigureModal,
      props: { ...props, preselectedMetricId: null },
    })
    : openComponent({ element: InsertExistingFigureModal, props });
}

export function figureSourceLabel(source: FigureSource): string {
  return source === "new"
    ? t3({
      en: "New visualization…",
      fr: "Nouvelle visualisation…",
      pt: "Nova visualização…",
    })
    : t3({
      en: "Existing visualization…",
      fr: "Visualisation existante…",
      pt: "Visualização existente…",
    });
}

export function figureSourceMenuItems(
  onPick: (source: FigureSource) => void,
): MenuItem[] {
  return [
    {
      label: figureSourceLabel("new"),
      icon: "plus",
      onClick: () => onPick("new"),
    },
    {
      label: figureSourceLabel("existing"),
      icon: "chart",
      onClick: () => onPick("existing"),
    },
  ];
}

// The dropdown under an insert or replace button.
export function showFigureSourceMenu(
  e: MouseEvent,
  onPick: (source: FigureSource) => void,
): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  showMenu({
    anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    position: "bottom-start",
    items: figureSourceMenuItems(onPick),
  });
}
