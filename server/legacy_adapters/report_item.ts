import type { LayoutNode } from "@timroberton/panther";
import type { Sql } from "postgres";
import type { ReportItemConfig, ReportItemContentItem } from "lib";

// =============================================================================
// Runtime adapter for legacy report item configs.
//
// Split into two functions to keep the pure shape transforms separable from
// the DB-dependent FK resolution:
//
// - adaptLegacyReportItemConfigShape(config) — pure shape transforms:
//   * Layout: 2D array → LayoutNode tree
//   * `placeholder` item type → `text` item type (2026-02-07)
//
// - resolveLegacyReportMetricIds(config, projectDb) — DB-dependent:
//   * moduleId → metricId (looks up from presentation_objects)
//
// Callers typically chain: first shape, then resolve.
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

export function adaptLegacyReportItemConfigShape(
  config: LegacyReportItemConfig,
): ReportItemConfig {
  // Legacy: Convert old 2D array → LayoutNode tree
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

  // Legacy: Convert `placeholder` item type → empty `text` item
  walkLayoutTree(content, (item: ReportItemContentItem) => {
    if ((item as any).type === "placeholder") {
      item.type = "text";
      item.markdown = "";
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

export async function resolveLegacyReportMetricIds(
  config: ReportItemConfig,
  projectDb: Sql,
): Promise<ReportItemConfig> {
  await walkLayoutTreeAsync(
    config.freeform.content,
    async (item: ReportItemContentItem) => {
      const poInfo = item.presentationObjectInReportInfo as
        | { id: string; moduleId: string; metricId?: string }
        | { id: string; metricId: string; moduleId?: string }
        | undefined;

      if (poInfo && "moduleId" in poInfo && poInfo.moduleId && !poInfo.metricId) {
        const po = await projectDb<{ metric_id: string }[]>`
          SELECT metric_id FROM presentation_objects WHERE id = ${poInfo.id}
        `;
        if (po[0]) {
          delete poInfo.moduleId;
          poInfo.metricId = po[0].metric_id;
        }
      }
    },
  );
  return config;
}

function walkLayoutTree<T>(node: LayoutNode<T>, fn: (item: T) => void): void {
  if (node.type === "item") {
    fn(node.data);
  } else if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkLayoutTree(child, fn);
    }
  }
}

async function walkLayoutTreeAsync<T>(
  node: LayoutNode<T>,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (node.type === "item") {
    await fn(node.data);
  } else if (Array.isArray(node.children)) {
    for (const child of node.children) {
      await walkLayoutTreeAsync(child, fn);
    }
  }
}
