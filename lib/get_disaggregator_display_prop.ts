import {
  get_DISAGGREGATION_DISPLAY_OPTIONS,
  type DisaggregationDisplayOption,
  type DisaggregationOption,
} from "./types/presentation_objects.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { ResultsValueForVisualization } from "./types/modules.ts";

// These functions expect an effective config (via getEffectivePOConfig from
// lib/normalize_po_config.ts) where single-value disaggregations have been
// stripped. See DOC_DISAGGREGATION_OPTION_HANDLING.md for details.

export function getDisaggregatorDisplayProp(
  _resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  props: DisaggregationDisplayOption[],
  effectiveValueProps: string[]
): DisaggregationOption | "--v" | undefined {
  if (effectiveValueProps.length > 1) {
    if (props.includes(config.d.valuesDisDisplayOpt)) {
      return "--v";
    }
  }
  for (const dis of config.d.disaggregateBy) {
    if (props.includes(dis.disDisplayOpt)) {
      return dis.disOpt;
    }
  }
  return undefined;
}

export function getReplicateByProp(
  config: PresentationObjectConfig
): DisaggregationOption | undefined {
  for (const dis of config.d.disaggregateBy) {
    if (dis.disDisplayOpt === "replicant") {
      return dis.disOpt;
    }
  }
  return undefined;
}

export function hasDuplicateDisaggregatorDisplayOptions(
  _resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[]
) {
  const disDisplayOpts: DisaggregationDisplayOption[] = [];
  if (effectiveValueProps.length > 1) {
    disDisplayOpts.push(config.d.valuesDisDisplayOpt);
  }
  for (const dis of config.d.disaggregateBy) {
    if (disDisplayOpts.includes(dis.disDisplayOpt)) {
      return true;
    }
    disDisplayOpts.push(dis.disDisplayOpt);
  }
  return false;
}

export function getNextAvailableDisaggregationDisplayOption(
  _resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption,
  effectiveValueProps: string[]
): DisaggregationDisplayOption {
  const otherExistingOpts = config.d.disaggregateBy
    .filter((d) => d.disOpt !== disOpt)
    .map((d) => d.disDisplayOpt);
  const possibleOpts = get_DISAGGREGATION_DISPLAY_OPTIONS()[config.d.type];
  for (const possibleOpt of possibleOpts) {
    if (
      !otherExistingOpts.includes(possibleOpt.value) &&
      (effectiveValueProps.length <= 1 ||
        possibleOpt.value !== config.d.valuesDisDisplayOpt)
    ) {
      return possibleOpt.value;
    }
  }
  return possibleOpts.at(0)!.value;
}
