import {
  PresentationObjectConfig,
  PresentationOption,
  VIZ_TYPE_CONFIG,
} from "./types/presentation_objects.ts";
import type { ResultsValue } from "./types/module_definitions.ts";

export function convertVisualizationType(
  config: PresentationObjectConfig,
  newType: PresentationOption,
  disaggregationOptions: ResultsValue["disaggregationOptions"],
): PresentationObjectConfig {
  if (config.d.type === newType) return config;

  const typeConfig = VIZ_TYPE_CONFIG[newType];
  const validOpts = typeConfig.disaggregationDisplayOptions;

  for (const entry of config.d.disaggregateBy) {
    const disOptDef = disaggregationOptions.find((d) => d.value === entry.disOpt);
    if (
      disOptDef?.allowedPresentationOptions &&
      !disOptDef.allowedPresentationOptions.includes(newType)
    ) {
      throw new Error(
        `Disaggregation "${entry.disOpt}" is not allowed for presentation type "${newType}"`,
      );
    }
  }

  const usedOpts = new Set<string>();
  usedOpts.add(typeConfig.defaultValuesDisDisplayOpt);

  const newDisaggregateBy = config.d.disaggregateBy.map((entry) => {
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
