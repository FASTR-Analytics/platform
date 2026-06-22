import { type FigureInputs, getFigureAsCanvas } from "panther";
import {
  type DashboardExportModel,
  figureInputsForDownload,
} from "./_dashboard_export_model";
import { unavailableItemMarkdown } from "./_media_placeholder";

// Small render used only to detect a figure that throws (bad data / missing
// geoData) so the exporters can substitute a placeholder instead of aborting.
const VALIDATION_WIDTH_PX = 200;

export type PreparedFigure = {
  label: string;
  // White/margin-baked figure ready to render, or null if it failed to render.
  figureInputs: FigureInputs | null;
};

// Render-validate and white-bake each figure once. A figure that throws becomes
// { figureInputs: null }, so one bad chart never discards the whole export.
// Yields per figure so the modal's progress bar can advance.
export async function prepareFigures(
  model: DashboardExportModel,
  onProgress?: (frac: number) => void,
): Promise<PreparedFigure[]> {
  const out: PreparedFigure[] = [];
  const n = model.figures.length;
  for (let i = 0; i < n; i++) {
    const fig = model.figures[i];
    let figureInputs: FigureInputs | null = null;
    // fig.figureInputs is null when the figure already failed to build at
    // model-build time — leave it null (placeholder); otherwise render-validate.
    if (fig.figureInputs !== null) {
      try {
        getFigureAsCanvas(fig.figureInputs, VALIDATION_WIDTH_PX);
        // White background, no baked margin — page padding controls the spacing.
        figureInputs = figureInputsForDownload(fig.figureInputs, false, false);
      } catch {
        figureInputs = null;
      }
    }
    out.push({ label: fig.label, figureInputs });
    onProgress?.((i + 1) / n);
    await new Promise((res) => setTimeout(res, 0));
  }
  return out;
}

export function placeholderMarkdown(): string {
  return unavailableItemMarkdown();
}

// Filename basis: a single-figure export uses that figure's label; a collection
// uses the dashboard title.
export function exportFilenameBasis(model: DashboardExportModel): string {
  return model.figures.length === 1 ? model.figures[0].label : model.title;
}
