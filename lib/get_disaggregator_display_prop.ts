import {
  getFilteredValueProps,
  hasOnlyOneFilteredValue,
} from "./get_fetch_config_from_po.ts";
import {
  DisaggregationDisplayOption,
  DisaggregationOption,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  get_DISAGGREGATION_DISPLAY_OPTIONS,
} from "./types/mod.ts";

export function getDisaggregatorDisplayProp(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  props: DisaggregationDisplayOption[]
): DisaggregationOption | "--v" | undefined {
  const filteredValueProps = getFilteredValueProps(
    resultsValue.valueProps,
    config
  );
  if (filteredValueProps.length > 1) {
    if (props.includes(config.d.valuesDisDisplayOpt)) {
      return "--v";
    }
  }
  for (const dis of config.d.disaggregateBy) {
    if (props.includes(dis.disDisplayOpt)) {
      const onlyOneFilteredItem = hasOnlyOneFilteredValue(config, dis.disOpt);
      if (!onlyOneFilteredItem) {
        return dis.disOpt;
      }
    }
  }
  return undefined;
}

export function getReplicateByProp(
  config: PresentationObjectConfig
): DisaggregationOption | undefined {
  for (const dis of config.d.disaggregateBy) {
    if (dis.disDisplayOpt === "replicant") {
      const onlyOneFilteredItem = hasOnlyOneFilteredValue(config, dis.disOpt);
      if (!onlyOneFilteredItem) {
        return dis.disOpt;
      }
    }
  }
  return undefined;
}

export function hasDuplicateDisaggregatorDisplayOptions(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig
) {
  const disDisplayOpts: DisaggregationDisplayOption[] = [];
  const filteredValueProps = getFilteredValueProps(
    resultsValue.valueProps,
    config
  );
  if (filteredValueProps.length > 1) {
    disDisplayOpts.push(config.d.valuesDisDisplayOpt);
  }
  for (const dis of config.d.disaggregateBy) {
    const onlyOneFilteredItem = hasOnlyOneFilteredValue(config, dis.disOpt);
    if (!onlyOneFilteredItem) {
      if (disDisplayOpts.includes(dis.disDisplayOpt)) {
        return true;
      }
      disDisplayOpts.push(dis.disDisplayOpt);
    }
  }
  return false;
}

export function getNextAvailableDisaggregationDisplayOption(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption
): DisaggregationDisplayOption {
  const otherExistingOpts = config.d.disaggregateBy
    .filter((d) => d.disOpt !== disOpt)
    .map((d) => d.disDisplayOpt);
  const possibleOpts = get_DISAGGREGATION_DISPLAY_OPTIONS()[config.d.type];
  for (const possibleOpt of possibleOpts) {
    if (
      !otherExistingOpts.includes(possibleOpt.value) &&
      (resultsValue.valueProps.length === 1 ||
        possibleOpt.value !== config.d.valuesDisDisplayOpt)
    ) {
      return possibleOpt.value;
    }
  }
  return possibleOpts.at(0)!.value;
}
