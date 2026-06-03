import {
  createItemNode,
  type FreeformPageInputs,
  getFigureAsCanvas,
  type PageContentItem,
  type PageInputs,
} from "panther";
import { t3 } from "lib";
import {
  aboutMarkdown,
  type DashboardExportFigure,
  type DashboardExportModel,
  figureInputsForDownload,
} from "./_dashboard_export_model";

export type DashboardPagesOpts = {
  includeCover: boolean;
  includeAbout: boolean;
};

// Small render used only to detect a figure that throws (bad data / missing
// geoData) so we can substitute a placeholder page instead of aborting.
const VALIDATION_WIDTH_PX = 200;

// Build the shared PageInputs[] that drives BOTH the PDF and PPTX renderers:
// optional cover + About frontmatter, then one freeform page per figure (or a
// placeholder page for any figure that fails to render). Yields per figure so
// the modal's progress bar can advance.
export async function buildDashboardPages(
  model: DashboardExportModel,
  opts: DashboardPagesOpts,
  onProgress?: (frac: number) => void,
): Promise<PageInputs[]> {
  const pages: PageInputs[] = [];

  if (opts.includeCover) {
    pages.push({ type: "cover", title: model.title });
  }

  if (opts.includeAbout) {
    const md = aboutMarkdown(model);
    if (md.trim()) {
      pages.push({
        type: "freeform",
        content: createItemNode<PageContentItem>({ markdown: md }),
      });
    }
  }

  const n = model.figures.length;
  for (let i = 0; i < n; i++) {
    pages.push(figurePage(model.figures[i]));
    onProgress?.((i + 1) / n);
    await new Promise((res) => setTimeout(res, 0));
  }

  return pages;
}

function figurePage(fig: DashboardExportFigure): FreeformPageInputs {
  try {
    getFigureAsCanvas(fig.figureInputs, VALIDATION_WIDTH_PX);
  } catch {
    return placeholderPage(fig.label);
  }
  const fi = figureInputsForDownload(fig.figureInputs, false, true);
  return {
    type: "freeform",
    header: fig.label,
    content: createItemNode<PageContentItem>(fi as PageContentItem),
  };
}

function placeholderPage(label: string): FreeformPageInputs {
  return {
    type: "freeform",
    header: label,
    content: createItemNode<PageContentItem>({
      markdown: t3({
        en: "_This figure could not be rendered._",
        fr: "_Cette figure n'a pas pu être affichée._",
      }),
    }),
  };
}

// Filename basis: a single-figure export uses that figure's label; a collection
// uses the dashboard title.
export function exportFilenameBasis(model: DashboardExportModel): string {
  return model.figures.length === 1 ? model.figures[0].label : model.title;
}
