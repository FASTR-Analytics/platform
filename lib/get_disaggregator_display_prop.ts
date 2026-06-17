import {
  get_DISAGGREGATION_DISPLAY_OPTIONS,
  type DisaggregationDisplayOption,
  type DisaggregationOption,
} from "./types/presentation_objects.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { ResultsValueForVisualization } from "./types/modules.ts";

// `getReplicateByProp` below is filter-aware (it consults hasOnlyOneFilteredValue),
// so it is the single source of truth for "is there an active replicant" and is
// safe to call on RAW config everywhere. The OTHER three functions here are
// deliberately NOT filter-aware, for two different reasons:
//   - getDisaggregatorDisplayProp / hasDuplicateDisaggregatorDisplayOptions are
//     fed an already-effective config by their callers (build_figure_inputs, the
//     editor panel) — adding filter-awareness would double-strip.
//   - getNextAvailableDisaggregationDisplayOption takes RAW config but is
//     filter-agnostic by nature (only picks the next free display slot; never
//     consults the replicant/filter). Leave it for THAT reason.
// See DOC_DISAGGREGATION_OPTIONS_HANDLING.md.

// Single source of truth for the structural (context-free) degeneracy check:
// "is this disOpt filtered to exactly one value". Lives here beside its only
// non-trivial consumer (getReplicateByProp); re-exported from
// get_fetch_config_from_po.ts for existing importers.
export function hasOnlyOneFilteredValue(
  config: { d: Pick<PresentationObjectConfig["d"], "filterBy"> },
  disOpt: DisaggregationOption,
): boolean {
  return (
    config.d.filterBy.find((fil) => fil.disOpt === disOpt)?.values.length === 1
  );
}

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

// Returns the replicant disOpt ONLY when it is an *effective* replicant —
// displayed as "replicant" AND not filtered to a single value (a replicant
// filtered to one value is degenerate: one figure, no list, render as a plain
// filter). Context-free (reads disaggregateBy + filterBy) → same answer on raw or
// effective config → safe on raw config everywhere. Does NOT account for temporal
// degeneracy (single_period/single_year); for that use getEffectivePOConfig.
export function getReplicateByProp(
  config: { d: Pick<PresentationObjectConfig["d"], "disaggregateBy" | "filterBy"> }
): DisaggregationOption | undefined {
  for (const dis of config.d.disaggregateBy) {
    if (
      dis.disDisplayOpt === "replicant" &&
      !hasOnlyOneFilteredValue(config, dis.disOpt)
    ) {
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
