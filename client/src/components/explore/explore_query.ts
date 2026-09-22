import {
  deriveConfigFromVizPreset,
  MODULE_FAMILY_ORDER,
  type DatasetType,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type RunAuthoringContext,
  type VizPreset,
} from "lib";
import { getLanguage } from "panther";
import { unwrap } from "solid-js/store";

export type FamilyPrimary = {
  family: DatasetType;
  module: InstalledModuleSummary;
  // The family's one default: the primary module's first ready metric by id,
  // or its first metric by id when none is ready, so the stamped reason shows.
  metric: MetricWithStatus | undefined;
};

// The families offered: those whose primary module is in the package, in
// family order.
export function familiesInPackage(ctx: RunAuthoringContext): FamilyPrimary[] {
  return MODULE_FAMILY_ORDER.flatMap((family) => {
    const module = ctx.modules.find((m) =>
      m.family === family && m.tier === "primary"
    );
    if (module === undefined) return [];
    const metrics = ctx.metrics
      .filter((m) => m.moduleId === module.id)
      .toSorted((a, b) => a.id.localeCompare(b.id));
    return [{
      family,
      module,
      metric: metrics.find((m) => m.status === "ready") ?? metrics[0],
    }];
  });
}

// A preset's config as the picker derives it, cloned to plain data first
// because the authoring context may be a Solid store.
export function presetConfig(preset: VizPreset): PresentationObjectConfig {
  return deriveConfigFromVizPreset(
    structuredClone(unwrap(preset)),
    getLanguage(),
  );
}
