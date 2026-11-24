// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Shared JSON transform for ChartOV and ChartOH. The two
// figures are mirror images: the tier-or-lane dimension (the ragged categorical-direction
// dimension) is "lane" on ChartOV and "tier" on ChartOH. Everything else
// is identical, so the whole transform lives here, parameterized by a spec.
// The result uses the neutral key `visibleTiersOrLanesByPane`; each module's thin
// wrapper destructures it out into its own key name (visibleLanesByPane /
// visibleTiersByPane) so the neutral key never leaks into stored shapes.
import {
  createArray,
  type DataDimension,
  type DimensionMembership,
  getDimensionMembers,
  type MemberSortConfig,
} from "./deps.ts";
import {
  buildDataDimension,
  calculateChartValueAxes,
  type ChartOVOrOHProportional,
  createEmptyValuesArray,
  type DataDimensions,
  deriveVisibleIndicatorsByPane,
  deriveVisibleIndicatorsByPaneTierOrLane,
  deriveVisibleLanesByPane,
  deriveVisibleTiersByPane,
  fillValues,
  getMemberIndex,
  getTierOrLaneKey,
  orderVisibleByPane,
  orderVisibleByPaneTierOrLane,
  resolveChartProportional,
  trimReferenceLineLabels,
  trimSubChartTexts,
  type ValueSort,
} from "./common_data_transform.ts";
import { getChartOVOrOHDataConfigIssues } from "./chart_ov_or_oh_data_config_issues.ts";
import {
  assertNoDataConfigIssues,
  getUncertaintyMemberId,
} from "./data_config_issues.ts";
import {
  type ChartValueAxisLimits,
  isRowBasedUncertainty,
  type JsonArray,
  type ReferenceLineDataConfig,
  type SecondValueAxisDataConfig,
  type SecondValueAxisDataTransformed,
  type SubChartTextDataConfig,
  type UncertaintyConfig,
} from "./types.ts";

export type TierOrLaneDimension = "lane" | "tier";

export type ChartOVOrOHTransformSpec = {
  tierOrLaneDimension: TierOrLaneDimension; // the ragged categorical-direction dimension
};

// The config core shared by ChartOVJsonDataConfig and ChartOHJsonDataConfig.
// membership is the union of both shapes; each figure's own type leaves out
// the key of the dimension that carries its value axis limits.
export type ChartOVOrOHJsonConfigCore = {
  valueProps: string[];
  indicatorProp: string | "--v";
  seriesProp?: string | "--v";
  laneProp?: string | "--v";
  tierProp?: string | "--v";
  paneProp?: string | "--v";
  uncertainty?: UncertaintyConfig;
  membership?: {
    indicator?: DimensionMembership;
    lane?: DimensionMembership;
    tier?: DimensionMembership;
  };
  proportional?: ChartOVOrOHProportional;
  labelReplacements?: Record<string, string>;
  sort?: {
    indicator?: MemberSortConfig;
    series?: MemberSortConfig;
    lane?: MemberSortConfig;
    tier?: MemberSortConfig;
    pane?: MemberSortConfig;
  };
  sortIndicatorValues?: ValueSort;
  secondValueAxis?: SecondValueAxisDataConfig;
  referenceLines?: ReferenceLineDataConfig[];
  subChartTexts?: SubChartTextDataConfig[];
};

export type ChartOVOrOHTransformResult = {
  isTransformed: true;
  indicator: DataDimension;
  series?: DataDimension;
  lane?: DataDimension;
  tier?: DataDimension;
  pane?: DataDimension;
  values: (number | undefined)[][][][][];
  uncertaintyValues?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  valueAxisLimits: ChartValueAxisLimits;
  secondValueAxis?: SecondValueAxisDataTransformed;
  referenceLines?: ReferenceLineDataConfig[];
  subChartTexts?: SubChartTextDataConfig[];
  visibleIndicatorsByPane?: number[][];
  visibleTiersOrLanesByPane?: number[][]; // → visibleLanesByPane / visibleTiersByPane
  visibleIndicatorsByPaneTierOrLane?: number[][][];
  proportionalPanes?: boolean;
};

export function transformChartOVOrOHJson(
  jsonArray: JsonArray,
  cfg: ChartOVOrOHJsonConfigCore,
  stacked: boolean,
  spec: ChartOVOrOHTransformSpec,
): ChartOVOrOHTransformResult {
  const {
    valueProps,
    indicatorProp,
    seriesProp,
    laneProp,
    paneProp,
    tierProp,
    uncertainty,
    membership,
    proportional,
    labelReplacements,
    sort,
    sortIndicatorValues,
    secondValueAxis,
    referenceLines,
    subChartTexts,
  } = cfg;

  assertNoDataConfigIssues(
    getChartOVOrOHDataConfigIssues(jsonArray, cfg, spec),
  );

  const tierOrLaneKey = getTierOrLaneKey(spec.tierOrLaneDimension);
  const proportionalFlags = resolveChartProportional(
    proportional,
    tierOrLaneKey,
  );

  const sourceRows = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray.filter((obj) =>
      getUncertaintyMemberId(obj, uncertainty.uncertaintyProp) ===
        uncertainty.peMemberId
    )
    : jsonArray;

  const membersSource = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray
    : sourceRows;

  const buildDimension = (
    prop: string | undefined,
    sortConfig?: MemberSortConfig,
  ) =>
    buildDataDimension(
      membersSource,
      prop,
      valueProps,
      labelReplacements,
      sortConfig,
    );
  const indicator = buildDataDimension(
    membersSource,
    indicatorProp,
    valueProps,
    labelReplacements,
    sort?.indicator,
  );
  const series = buildDimension(seriesProp, sort?.series);
  const lane = buildDimension(laneProp, sort?.lane);
  const tier = buildDimension(tierProp, sort?.tier);
  const pane = buildDimension(paneProp, sort?.pane);

  const nPanes = getDimensionMembers(pane).length;
  const nTiers = getDimensionMembers(tier).length;
  const nLanes = getDimensionMembers(lane).length;
  const nSerieses = getDimensionMembers(series).length;
  const nIndicators = indicator.members.length;

  const values = createEmptyValuesArray(
    nPanes,
    nTiers,
    nLanes,
    nSerieses,
    nIndicators,
  );

  const dimensions: DataDimensions = { series, lane, tier, pane };

  const getIndicatorIndex = (
    obj: { [key: string]: string | number | undefined | null },
    valueProp: string,
  ) => getMemberIndex(indicator, valueProp, obj);

  fillValues(
    values,
    sourceRows,
    valueProps,
    valueProps,
    dimensions,
    getIndicatorIndex,
  );

  let uncertaintyValues: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  } | undefined;

  if (uncertainty) {
    const ubValues = createEmptyValuesArray(
      nPanes,
      nTiers,
      nLanes,
      nSerieses,
      nIndicators,
    );
    const lbValues = createEmptyValuesArray(
      nPanes,
      nTiers,
      nLanes,
      nSerieses,
      nIndicators,
    );

    if (isRowBasedUncertainty(uncertainty)) {
      const ubRows = jsonArray.filter((obj) =>
        getUncertaintyMemberId(obj, uncertainty.uncertaintyProp) ===
          uncertainty.ubMemberId
      );
      const lbRows = jsonArray.filter((obj) =>
        getUncertaintyMemberId(obj, uncertainty.uncertaintyProp) ===
          uncertainty.lbMemberId
      );

      fillValues(
        ubValues,
        ubRows,
        valueProps,
        valueProps,
        dimensions,
        getIndicatorIndex,
      );
      fillValues(
        lbValues,
        lbRows,
        valueProps,
        valueProps,
        dimensions,
        getIndicatorIndex,
      );
    } else {
      fillValues(
        ubValues,
        jsonArray,
        valueProps,
        uncertainty.ubValueProps,
        dimensions,
        getIndicatorIndex,
      );
      fillValues(
        lbValues,
        jsonArray,
        valueProps,
        uncertainty.lbValueProps,
        dimensions,
        getIndicatorIndex,
      );
    }

    uncertaintyValues = { ub: ubValues, lb: lbValues };
  }

  const valueAxes = calculateChartValueAxes(
    { values, uncertaintyValues },
    { nPanes, nTiers, nLanes, nValues: nIndicators },
    stacked,
    dimensions,
    secondValueAxis,
    referenceLines,
  );

  // The value sort is a presentation order: it permutes the masks, never the
  // storage, so every data lookup keeps sort.indicator's global index. A
  // balanced chart under a value sort gets a full-permutation mask per pane.
  const valueSort = sortIndicatorValues === "none"
    ? undefined
    : sortIndicatorValues;
  const raggedIndicators = membership?.indicator === "unbalanced" ||
    proportionalFlags.tiersOrLanes;
  const visibleIndicatorsByPane = raggedIndicators || valueSort !== undefined
    ? orderVisibleByPane(
      raggedIndicators
        ? deriveVisibleIndicatorsByPane(values, uncertaintyValues, nIndicators)
        : createArray(nPanes, () => indicator.members.map((_, i) => i)),
      values,
      valueAxes.firstValueAxisSeriesIndices,
      indicator.members,
      spec.tierOrLaneDimension,
      valueSort,
    )
    : undefined;
  const nTiersOrLanes = spec.tierOrLaneDimension === "lane" ? nLanes : nTiers;
  const deriveVisibleTiersOrLanesByPane = spec.tierOrLaneDimension === "lane"
    ? deriveVisibleLanesByPane
    : deriveVisibleTiersByPane;
  const visibleTiersOrLanesByPane =
    membership?.[spec.tierOrLaneDimension] === "unbalanced"
      ? deriveVisibleTiersOrLanesByPane(
        values,
        uncertaintyValues,
        nTiersOrLanes,
      )
      : undefined;
  const visibleIndicatorsByPaneTierOrLane = proportionalFlags.tiersOrLanes
    ? orderVisibleByPaneTierOrLane(
      deriveVisibleIndicatorsByPaneTierOrLane(
        values,
        uncertaintyValues,
        nIndicators,
        spec.tierOrLaneDimension,
      ),
      values,
      valueAxes.firstValueAxisSeriesIndices,
      indicator.members,
      spec.tierOrLaneDimension,
      valueSort,
    )
    : undefined;

  return {
    isTransformed: true,
    indicator,
    series,
    lane,
    tier,
    pane,
    values,
    uncertaintyValues,
    valueAxisLimits: valueAxes.valueAxisLimits,
    secondValueAxis: valueAxes.secondValueAxis,
    referenceLines: trimReferenceLineLabels(referenceLines),
    subChartTexts: trimSubChartTexts(subChartTexts),
    visibleIndicatorsByPane,
    visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneTierOrLane,
    proportionalPanes: proportionalFlags.panes ? true : undefined,
  };
}
