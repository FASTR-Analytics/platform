import type { LayoutNode } from "@timroberton/panther";
import type { Sql } from "postgres";
import type { ReportItemConfig, ReportItemContentItem } from "lib";

// =============================================================================
// Runtime adapter for legacy report formats
//
// Handles conversion of old report data to new format:
// 1. Layout: 2D array → LayoutNode tree
// 2. Fields: moduleId → metricId (looks up from presentation_objects)
// =============================================================================

type LegacyReportItemConfig = Omit<ReportItemConfig, "freeform"> & {
  freeform: {
    useHeader?: boolean;
    headerText?: string;
    subHeaderText?: string;
    dateText?: string;
    headerLogos?: string[];
    useFooter?: boolean;
    footerText?: string;
    footerLogos?: string[];
    content: ReportItemContentItem[][] | ReportItemConfig["freeform"]["content"];
  };
};

export async function adaptLegacyReportItemConfig(
  config: LegacyReportItemConfig,
  projectDb: Sql
): Promise<ReportItemConfig> {
  // Adapter 1: Convert old 2D array → LayoutNode (if needed)
  let content: LayoutNode<ReportItemContentItem>;

  if (Array.isArray(config.freeform?.content)) {
    content = {
      type: "rows" as const,
      id: crypto.randomUUID(),
      children: config.freeform.content.map((row) => ({
        type: "cols" as const,
        id: crypto.randomUUID(),
        children: row.map((item) => ({
          type: "item" as const,
          id: crypto.randomUUID(),
          data: item,
          span: item.span,
        })),
      })),
    };
  } else {
    content = config.freeform.content;
  }

  // Adapter 2: Convert moduleId → metricId (if needed)
  await walkLayoutTreeAsync(content, async (item: ReportItemContentItem) => {
    const poInfo = item.presentationObjectInReportInfo as
      | { id: string; moduleId: string; metricId?: string }
      | { id: string; metricId: string; moduleId?: string }
      | undefined;

    if (poInfo && "moduleId" in poInfo && poInfo.moduleId && !poInfo.metricId) {
      // Look up metricId from presentation_objects
      const po = await projectDb<{ metric_id: string }[]>`
        SELECT metric_id FROM presentation_objects WHERE id = ${poInfo.id}
      `;

      if (po[0]) {
        // Replace moduleId with metricId
        delete poInfo.moduleId;
        poInfo.metricId = po[0].metric_id;
      }
    }
  });

  return {
    ...config,
    freeform: {
      ...config.freeform,
      content,
    },
  } as ReportItemConfig;
}

async function walkLayoutTreeAsync<T>(
  node: LayoutNode<T>,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (node.type === "item") {
    await fn(node.data);
  } else {
    for (const child of node.children) {
      await walkLayoutTreeAsync(child, fn);
    }
  }
}
