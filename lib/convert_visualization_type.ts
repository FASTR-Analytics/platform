import {
  PresentationObjectConfig,
  PresentationOption,
  VIZ_TYPE_CONFIG,
} from "./types/presentation_objects.ts";
import type { ResultsValue } from "./types/modules.ts";

export function convertVisualizationType(
  config: PresentationObjectConfig,
  newType: PresentationOption,
  disaggregationOptions: ResultsValue["disaggregationOptions"],
): PresentationObjectConfig {
  if (config.d.type === newType) return config;

  const typeConfig = VIZ_TYPE_CONFIG[newType];
  const validOpts = typeConfig.disaggregationDisplayOptions;

  // Remove disaggregations not allowed for the new type
  const allowedDisaggregateBy = config.d.disaggregateBy.filter((entry) => {
    const disOptDef = disaggregationOptions.find((d) => d.value === entry.disOpt);
    if (
      disOptDef?.allowedPresentationOptions &&
      !disOptDef.allowedPresentationOptions.includes(newType)
    ) {
      return false;
    }
    return true;
  });

  const usedOpts = new Set<string>();
  usedOpts.add(typeConfig.defaultValuesDisDisplayOpt);

  const newDisaggregateBy = allowedDisaggregateBy.map((entry) => {
    let newDisplayOpt = entry.disDisplayOpt;

    if (!validOpts.includes(newDisplayOpt)) {
      newDisplayOpt = typeConfig.disDisplayOptFallbacks[newDisplayOpt] ?? validOpts[0];
    }

    if (usedOpts.has(newDisplayOpt)) {
      const available = validOpts.find((o) => !usedOpts.has(o));
      if (available) {
        newDisplayOpt = available;
      }
    }

    usedOpts.add(newDisplayOpt);
    return { disOpt: entry.disOpt, disDisplayOpt: newDisplayOpt };
  });

  // Add required disaggregations that are allowed for the new type but missing
  for (const disOpt of disaggregationOptions) {
    if (
      disOpt.isRequired &&
      (!disOpt.allowedPresentationOptions ||
        disOpt.allowedPresentationOptions.includes(newType)) &&
      !newDisaggregateBy.some((d) => d.disOpt === disOpt.value)
    ) {
      const available = validOpts.find((o) => !usedOpts.has(o));
      const disDisplayOpt = available ?? validOpts[0];
      usedOpts.add(disDisplayOpt);
      newDisaggregateBy.push({ disOpt: disOpt.value, disDisplayOpt });
    }
  }

  return {
    d: {
      ...config.d,
      type: newType,
      valuesDisDisplayOpt: typeConfig.defaultValuesDisDisplayOpt,
      disaggregateBy: newDisaggregateBy,
    },
    s: {
      ...config.s,
      content: typeConfig.defaultContent,
      ...typeConfig.styleResets,
    },
    t: config.t,
  };
}
