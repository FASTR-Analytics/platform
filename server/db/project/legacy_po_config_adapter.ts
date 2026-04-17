import type { PresentationObjectConfig, VizPreset } from "lib";

// =============================================================================
// Runtime adapter for legacy PresentationObject config shapes.
//
// Add new transforms here when PO config shapes change. See DOC_legacy_handling.md.
//
// Applies to both:
// - `presentation_objects.config` JSON (stored PO configs)
// - `metrics.viz_presets` JSON (module-defined presets snapshotted at install)
//
// Current transforms:
// - `d.periodOpt` → `d.timeseriesGrouping` (renamed 2026-04)
// - Strip fabricated bounds from relative periodFilters
// - Normalize `filterType: undefined` on stored filters → "custom"
// - On vizPresets: drop legacy `defaultPeriodFilterForDefaultVisualizations`
//   (authors now put filters directly on config.d.periodFilter)
// =============================================================================

const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_12_months", // old name, further normalized downstream in get_fetch_config_from_po.ts
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

function adaptLegacyConfigD(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d };

  // Rename: periodOpt → timeseriesGrouping
  if ("periodOpt" in out) {
    if (!("timeseriesGrouping" in out)) {
      out.timeseriesGrouping = out.periodOpt;
    }
    delete out.periodOpt;
  }

  // Normalize periodFilter
  if (out.periodFilter && typeof out.periodFilter === "object") {
    const pf = { ...(out.periodFilter as Record<string, unknown>) };
    // Legacy: filterType undefined was treated as "custom"
    if (pf.filterType === undefined) {
      pf.filterType = "custom";
    }
    // Strip fabricated bounds from relative filters
    if (
      typeof pf.filterType === "string" &&
      RELATIVE_FILTER_TYPES.has(pf.filterType)
    ) {
      delete pf.periodOption;
      delete pf.min;
      delete pf.max;
    }
    out.periodFilter = pf;
  }

  return out;
}

export function adaptLegacyPresentationObjectConfig(
  raw: unknown,
): PresentationObjectConfig {
  const input = raw as { d?: Record<string, unknown>; s?: unknown; t?: unknown };
  const d = adaptLegacyConfigD(input.d ?? {});
  return { ...(input as object), d } as PresentationObjectConfig;
}

export function adaptLegacyVizPresets(raw: unknown): VizPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((rawPreset) => {
    const preset = { ...(rawPreset as Record<string, unknown>) };
    // Drop the old side-channel field entirely
    delete preset.defaultPeriodFilterForDefaultVisualizations;
    if (preset.config && typeof preset.config === "object") {
      const config = { ...(preset.config as Record<string, unknown>) };
      if (config.d && typeof config.d === "object") {
        config.d = adaptLegacyConfigD(config.d as Record<string, unknown>);
      }
      preset.config = config;
    }
    return preset as unknown as VizPreset;
  });
}
