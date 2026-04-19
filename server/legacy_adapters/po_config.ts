import {
  flattenCf,
  LEGACY_CF_PRESETS,
  type LegacyCfPresetId,
  presentationObjectConfigSchema,
  type APIResponseWithData,
  type ConditionalFormatting,
  type ConditionalFormattingScale,
  type PresentationObjectConfig,
  type PresentationObjectDetail,
  type VizPreset,
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
// - legacy `s.conditionalFormatting` string preset → ConditionalFormatting object
// - legacy map color fields (mapColorPreset/From/To/Reverse, mapScaleType,
//   mapDiscreteSteps, mapDomain*) → ConditionalFormatting object; drop old fields
// - On vizPresets: drop legacy `defaultPeriodFilterForDefaultVisualizations`
//   (authors now put filters directly on config.d.periodFilter)
// =============================================================================

const MAP_COLOR_PRESET_STOPS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

const MAP_NO_DATA_COLOR = "#f0f0f0";

function buildCfFromLegacyMapFields(
  s: Record<string, unknown>,
): ConditionalFormattingScale | undefined {
  const preset = (s.mapColorPreset as string | undefined) ?? "red-green";
  const reverse = Boolean(s.mapColorReverse);
  const [rawFrom, rawTo] =
    preset === "custom"
      ? [
          (s.mapColorFrom as string | undefined) ?? "#fee0d2",
          (s.mapColorTo as string | undefined) ?? "#de2d26",
        ]
      : MAP_COLOR_PRESET_STOPS[preset] ?? MAP_COLOR_PRESET_STOPS["red-green"];
  const [from, to] = reverse ? [rawTo, rawFrom] : [rawFrom, rawTo];

  const scaleType = (s.mapScaleType as string | undefined) ?? "continuous";
  const steps =
    scaleType === "discrete"
      ? (s.mapDiscreteSteps as number | undefined) ?? 5
      : undefined;

  const domainType = (s.mapDomainType as string | undefined) ?? "auto";
  const domain: ConditionalFormattingScale["domain"] =
    domainType === "fixed"
      ? {
          kind: "fixed",
          min: (s.mapDomainMin as number | undefined) ?? 0,
          max: (s.mapDomainMax as number | undefined) ?? 1,
        }
      : { kind: "auto" };

  return {
    type: "scale",
    scale: { min: from, max: to },
    steps,
    domain,
    noDataColor: MAP_NO_DATA_COLOR,
  };
}

function isLegacyCfPresetId(v: unknown): v is LegacyCfPresetId {
  return typeof v === "string" && v in LEGACY_CF_PRESETS;
}

function adaptLegacyConfigS(
  s: Record<string, unknown>,
  isMap: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  const cfRaw = out.conditionalFormatting;

  // Transform A: legacy string preset → ConditionalFormatting union
  let cf: ConditionalFormatting;
  if (isLegacyCfPresetId(cfRaw)) {
    cf = LEGACY_CF_PRESETS[cfRaw].value;
  } else {
    cf = { type: "none" };
  }

  // Transform B: legacy map color fields → scale CF, only when CF is "none"
  // after A (so we never clobber a real CF preset that the user set)
  if (isMap && cf.type === "none") {
    const mapHasLegacyFields =
      "mapColorPreset" in out ||
      "mapColorFrom" in out ||
      "mapColorTo" in out ||
      "mapColorReverse" in out ||
      "mapScaleType" in out ||
      "mapDiscreteSteps" in out ||
      "mapDomainType" in out ||
      "mapDomainMin" in out ||
      "mapDomainMax" in out;
    if (mapHasLegacyFields) {
      const scaleCf = buildCfFromLegacyMapFields(out);
      if (scaleCf) cf = scaleCf;
    }
  }

  // Project the union into flat cf* storage fields on s
  delete out.conditionalFormatting;
  Object.assign(out, flattenCf(cf));

  // Transform C: legacy diffAreas → specialDisruptionsChart (Pattern 3
  // migration per DOC_legacy_handling.md). Fill specialDisruptionsChart from
  // diffAreas when missing; keep diffAreas in place because Pattern 3
  // dual-check read sites still reference it.
  if (!("specialDisruptionsChart" in out)) {
    out.specialDisruptionsChart = out.diffAreas === true;
  }

  // Strip legacy map color fields (self-heal on next save)
  delete out.mapColorPreset;
  delete out.mapColorFrom;
  delete out.mapColorTo;
  delete out.mapColorReverse;
  delete out.mapScaleType;
  delete out.mapDiscreteSteps;
  delete out.mapDomainType;
  delete out.mapDomainMin;
  delete out.mapDomainMax;

  return out;
}

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
  const input = raw as {
    d?: Record<string, unknown>;
    s?: Record<string, unknown>;
    t?: unknown;
  };
  const d = adaptLegacyConfigD(input.d ?? {});
  const isMap = d.type === "map";
  const s = adaptLegacyConfigS(input.s ?? {}, isMap);
  const adapted = { ...(input as object), d, s };

  // Permissive-read: Zod-validate the adapter's output. On success return the
  // validated config. On failure log a structured warning and fall back to the
  // pass-through shape so existing views continue rendering while bad rows
  // surface in logs for targeted fixes. Strict-write (on save) rejects bad
  // configs — see presentationObjectConfigSchema.parse calls in
  // server/db/project/presentation_objects.ts.
  const parsed = presentationObjectConfigSchema.safeParse(adapted);
  if (parsed.success) {
    return parsed.data;
  }
  console.warn(
    "[adaptLegacyPresentationObjectConfig] Zod validation failed after adapter run; falling back to raw shape. Issues:",
    parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  );
  return adapted as PresentationObjectConfig;
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
    delete preset.defaultPeriodFilterForDefaultVisualizations;
    if (preset.config && typeof preset.config === "object") {
      const config = { ...(preset.config as Record<string, unknown>) };
      if (config.d && typeof config.d === "object") {
        config.d = adaptLegacyConfigD(config.d as Record<string, unknown>);
      }
      if (config.s && typeof config.s === "object") {
        const isMap =
          (config.d as Record<string, unknown> | undefined)?.type === "map";
        config.s = adaptLegacyConfigS(
          config.s as Record<string, unknown>,
          isMap,
        );
      }
      preset.config = config;
    }
    return preset as unknown as VizPreset;
  });
}
