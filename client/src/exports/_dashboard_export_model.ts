import type { FigureInputs } from "panther";
import type {
  PublicDashboardBundle,
  PublicDashboardEntryGroup,
  PublicDashboardItem,
} from "lib";
import { buildFigureInputs } from "~/generate_visualization/mod";

export function itemFigureInputs(item: PublicDashboardItem): FigureInputs {
  return buildFigureInputs(item.bundle);
}

export function replicantLabel(
  group: PublicDashboardEntryGroup,
  member: PublicDashboardItem,
): string {
  return (
    group.replicants.find((r) => r.value === member.replicantValue)?.label ??
    member.label
  );
}

const DOWNLOAD_MARGIN_DU = 20;

// Background and margin are baked into the figure's surrounds so the plain
// panther export helper renders them — no manual canvas compositing.
export function figureInputsForDownload(
  fi: FigureInputs,
  transparent: boolean,
  padding: boolean,
): FigureInputs {
  return {
    ...fi,
    style: {
      ...fi.style,
      surrounds: {
        ...fi.style?.surrounds,
        backgroundColor: transparent ? "none" : "#ffffff",
        padding: padding ? DOWNLOAD_MARGIN_DU : 0,
      },
    },
  };
}

export type DashboardExportFigure = {
  id: string;
  label: string;
  figureInputs: FigureInputs;
};

export type DashboardExportModel = {
  title: string;
  summary: string;
  about: string;
  figures: DashboardExportFigure[];
};

export type DashboardExportScope = "all" | "current";

// The shared, format-agnostic export model. Both the PDF and PPTX renderers
// consume this — one place owns ordering, fetch-free hydration, group-member
// labelling, and About text. `scope: "current"` yields a single-figure model.
export function buildDashboardExportModel(
  bundle: PublicDashboardBundle,
  scope: DashboardExportScope,
  currentItemId?: string,
): DashboardExportModel {
  const base = {
    title: bundle.title,
    summary: bundle.about.summary,
    about: bundle.about.body,
  };

  if (scope === "current") {
    const item = currentItemId
      ? bundle.items.find((i) => i.id === currentItemId)
      : undefined;
    return {
      ...base,
      figures: item
        ? [
            {
              id: item.id,
              label: item.label,
              figureInputs: itemFigureInputs(item),
            },
          ]
        : [],
    };
  }

  const figures: DashboardExportFigure[] = [];
  for (const entry of bundle.entries) {
    if (entry.kind === "item") {
      figures.push({
        id: entry.item.id,
        label: entry.item.label,
        figureInputs: itemFigureInputs(entry.item),
      });
    } else {
      for (const member of entry.members) {
        figures.push({
          id: member.id,
          label: `${entry.group.label} — ${replicantLabel(entry.group, member)}`,
          figureInputs: itemFigureInputs(member),
        });
      }
    }
  }
  return { ...base, figures };
}

// Filename from a title/label: keep unicode letters/numbers (FR/AR titles),
// collapse everything else (slashes, colons, emoji, RTL marks) to underscores.
export function sanitizeFilename(s: string, fallback = "dashboard"): string {
  const cleaned = s
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}
