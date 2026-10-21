import { type Language, resolveTS } from "./translate/mod.ts";
import type { VizPreset } from "./types/_metric_installed.ts";
import {
  type PresentationObjectConfig,
  presentationObjectConfigSchema,
} from "./types/_presentation_object_config.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./types/presentation_object_defaults.ts";

// THE preset→config derivation. Presets are pure projections of a package's
// manifest, and the AI deck figure path builds from the same presets, so both
// consumers derive through here and cannot drift.

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

export type DerivedPreset = {
  id: string;
  metricId: string;
  label: string;
  sortOrder: number;
  config: PresentationObjectConfig;
};

// Every preset of a module's metrics, in catalog order, sortOrder counted per
// module. The id is the metric's and the preset's, which the modules build
// keeps unique within a metric.
export function derivePresetsForModule(
  metrics: { id: string; vizPresets: VizPreset[] }[],
  language: Language,
): DerivedPreset[] {
  const results: DerivedPreset[] = [];
  let sortOrder = 0;
  for (const metric of metrics) {
    for (const preset of metric.vizPresets) {
      results.push({
        id: `${metric.id}/${preset.id}`,
        metricId: metric.id,
        label: resolveTS(preset.label, language),
        sortOrder: sortOrder++,
        config: deriveConfigFromVizPreset(preset, language),
      });
    }
  }
  return results;
}
