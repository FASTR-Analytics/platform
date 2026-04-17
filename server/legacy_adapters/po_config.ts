import type {
  APIResponseWithData,
  PresentationObjectConfig,
  PresentationObjectDetail,
  VizPreset,
} from "lib";
import { adaptLegacyPeriodFilter } from "./period_filter.ts";

// =============================================================================
// Runtime adapter for legacy PresentationObject config shapes.
//
// Add new transforms here when PO config shapes change. See DOC_legacy_handling.md.
//
// Applies to both:
// - `presentation_objects.config` JSON (stored PO configs)
// - `metrics.viz_presets` JSON (installed-time snapshot of module presets)
//
// Current transforms:
// - `d.periodOpt` → `d.timeseriesGrouping` (renamed 2026-04)
// - periodFilter normalization (delegated to adaptLegacyPeriodFilter)
// - On vizPresets: drop legacy `defaultPeriodFilterForDefaultVisualizations`
//   (authors now put filters directly on config.d.periodFilter)
// =============================================================================

function adaptLegacyConfigD(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d };

  // Rename: periodOpt → timeseriesGrouping
  if ("periodOpt" in out) {
    if (!("timeseriesGrouping" in out)) {
      out.timeseriesGrouping = out.periodOpt;
    }
    delete out.periodOpt;
  }

  // Normalize periodFilter via dedicated adapter
  if (out.periodFilter && typeof out.periodFilter === "object") {
    out.periodFilter = adaptLegacyPeriodFilter(
      out.periodFilter as Record<string, unknown>,
    );
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

// Idempotent wrapper that adapts the config inside an API response.
// Used at cache-hit boundaries to normalize pre-deploy cached entries.
export function adaptLegacyPODetailResponse(
  res: APIResponseWithData<PresentationObjectDetail>,
): APIResponseWithData<PresentationObjectDetail> {
  if (!res.success) return res;
  return {
    ...res,
    data: {
      ...res.data,
      config: adaptLegacyPresentationObjectConfig(res.data.config),
    },
  };
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
