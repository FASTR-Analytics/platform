import { resolveTS, type Language } from "./translate/mod.ts";
import type { VizPreset } from "./types/_metric_installed.ts";
import {
  presentationObjectConfigSchema,
  type PresentationObjectConfig,
} from "./types/_presentation_object_config.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./types/presentation_object_defaults.ts";

// THE preset→config derivation (PLAN_RESULTS_RUNS item 5b). Default
// visualizations are pure projections of the attached run's manifest — no
// presentation_objects rows — and the AI deck figure path builds from the
// same presets, so both consumers derive through here and cannot drift.

export function deriveConfigFromVizPreset(
  preset: VizPreset,
  language: Language,
): PresentationObjectConfig {
  return presentationObjectConfigSchema.parse({
    d: { ...preset.config.d },
    s: { ...DEFAULT_S_CONFIG, ...preset.config.s },
    t: {
      caption: preset.config.t.caption
        ? resolveTS(preset.config.t.caption, language)
        : DEFAULT_T_CONFIG.caption,
      captionRelFontSize: preset.config.t.captionRelFontSize ??
        DEFAULT_T_CONFIG.captionRelFontSize,
      subCaption: preset.config.t.subCaption
        ? resolveTS(preset.config.t.subCaption, language)
        : DEFAULT_T_CONFIG.subCaption,
      subCaptionRelFontSize: preset.config.t.subCaptionRelFontSize ??
        DEFAULT_T_CONFIG.subCaptionRelFontSize,
      footnote: preset.config.t.footnote
        ? resolveTS(preset.config.t.footnote, language)
        : DEFAULT_T_CONFIG.footnote,
      footnoteRelFontSize: preset.config.t.footnoteRelFontSize ??
        DEFAULT_T_CONFIG.footnoteRelFontSize,
    },
  });
}

export type DerivedDefaultVisualization = {
  id: string;
  metricId: string;
  label: string;
  sortOrder: number;
  config: PresentationObjectConfig;
};

// One module's default visualizations: every metric preset carrying
// createDefaultVisualizationOnInstall, in catalog order, sortOrder counted
// per module (exactly what installModule materialized as rows before 5b).
export function deriveDefaultVisualizationsForModule(
  metrics: { id: string; vizPresets: VizPreset[] }[],
  language: Language,
): DerivedDefaultVisualization[] {
  const results: DerivedDefaultVisualization[] = [];
  let sortOrder = 0;
  for (const metric of metrics) {
    for (const preset of metric.vizPresets) {
      if (!preset.createDefaultVisualizationOnInstall) continue;
      results.push({
        id: preset.createDefaultVisualizationOnInstall,
        metricId: metric.id,
        label: resolveTS(preset.label, language),
        sortOrder: sortOrder++,
        config: deriveConfigFromVizPreset(preset, language),
      });
    }
  }
  return results;
}
