// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Shared JSON transform for ChartOV and ChartOH. The two
// figures are mirror images: the tier-or-lane dimension (the ragged categorical-direction
// dimension) is "lane" on ChartOV and "tier" on ChartOH, and the forbidden
// membership dimension is whichever one carries the value axis limits. Everything else
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
  calculateChartValueAxisLimits,
  type ChartOVOrOHProportional,
  checkValuePropsAssignment,
  type DataDimensions,
  deriveVisibleIndicatorsByPane,
  deriveVisibleIndicatorsByPaneTierOrLane,
  deriveVisibleLanesByPane,
  deriveVisibleTiersByPane,
  fillValuesWithDuplicateCheck,
  getMemberIndex,
  orderVisibleByPane,
  orderVisibleByPaneTierOrLane,
  resolveChartProportional,
  validateChartMembership,
  validateChartProportional,
  validateDataInput,
  validateDimensionProps,
} from "./common_data_transform.ts";
import {
  type ChartValueAxisLimits,
  isRowBasedUncertainty,
  type JsonArray,
  type UncertaintyConfig,
  validateUncertaintyConfig,
} from "./types.ts";

export type TierOrLaneDimension = "lane" | "tier";

export type ChartOVOrOHTransformSpec = {
  figureName: string; // "ChartOV" | "ChartOH" — validation messages only
  tierOrLaneDimension: TierOrLaneDimension; // the ragged categorical-direction dimension
};

// The config core shared by ChartOVJsonDataConfig and ChartOHJsonDataConfig.
// membership is the union of both shapes; validateChartMembership rejects the
// value-direction key at runtime with the figure-specific message.
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
  sortIndicatorValues?: "ascending" | "descending" | "none";
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
  visibleIndicatorsByPane?: number[][];
  visibleTiersOrLanesByPane?: number[][]; // → visibleLanesByPane / visibleTiersByPane
  visibleIndicatorsByPaneTierOrLane?: number[][][];
  proportionalPanes?: boolean;
};

function createEmptyValuesArray(
  nPanes: number,
  nTiers: number,
  nLanes: number,
  nSerieses: number,
  nValues: number,
): (number | undefined)[][][][][] {
  return createArray(
    nPanes,
    () =>
      createArray(
        nTiers,
        () =>
          createArray(nLanes, () =>
            createArray(nSerieses, () =>
              createArray(nValues, () => undefined))),
      ),
  );
}

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
  } = cfg;

  const forbiddenDimension = spec.tierOrLaneDimension === "lane"
    ? "tier"
    : "lane";
  validateChartMembership(
    membership,
    ["indicator", spec.tierOrLaneDimension],
    forbiddenDimension,
    spec.figureName,
  );
  const tierOrLaneKey = spec.tierOrLaneDimension === "lane" ? "lanes" : "tiers";
  validateChartProportional(proportional, tierOrLaneKey, spec.figureName);
  const proportionalFlags = resolveChartProportional(
    proportional,
    tierOrLaneKey,
  );

  if (uncertainty) {
    validateUncertaintyConfig(uncertainty, valueProps, [
      indicatorProp,
      seriesProp,
      laneProp,
      tierProp,
      paneProp,
    ]);
  }

  const sourceRows = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray.filter((obj) =>
      String(obj[uncertainty.uncertaintyProp]) === uncertainty.peMemberId
    )
    : jsonArray;

  validateDataInput(sourceRows, valueProps);

  const membersSource = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray
    : sourceRows;

  const dimensionProps = {
    indicator: indicatorProp,
    series: seriesProp,
    lane: laneProp,
    tier: tierProp,
    pane: paneProp,
  };
  validateDimensionProps(jsonArray, dimensionProps);
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

  checkValuePropsAssignment(valueProps, {
    indicatorProp,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
  });

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

  fillValuesWithDuplicateCheck(
    values,
    sourceRows,
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
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.ubMemberId
      );
      const lbRows = jsonArray.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.lbMemberId
      );

      fillValuesWithDuplicateCheck(
        ubValues,
        ubRows,
        valueProps,
        dimensions,
        getIndicatorIndex,
      );
      fillValuesWithDuplicateCheck(
        lbValues,
        lbRows,
        valueProps,
        dimensions,
        getIndicatorIndex,
      );
    } else {
      fillValuesWithDuplicateCheck(
        ubValues,
        jsonArray,
        uncertainty.ubValueProps,
        dimensions,
        getIndicatorIndex,
      );
      fillValuesWithDuplicateCheck(
        lbValues,
        jsonArray,
        uncertainty.lbValueProps,
        dimensions,
        getIndicatorIndex,
      );
    }

    uncertaintyValues = { ub: ubValues, lb: lbValues };
  }

  const counts = {
    nPanes,
    nTiers,
    nLanes,
    nSerieses,
    nValues: nIndicators,
  };

  const valueAxisLimits = calculateChartValueAxisLimits(
    values,
    counts,
    stacked,
  );

  if (uncertaintyValues) {
    const ubLimits = calculateChartValueAxisLimits(
      uncertaintyValues.ub,
      counts,
      false,
    );
    const lbLimits = calculateChartValueAxisLimits(
      uncertaintyValues.lb,
      counts,
      false,
    );
    const main = valueAxisLimits.paneLimits;
    const ub = ubLimits.paneLimits;
    const lb = lbLimits.paneLimits;
    for (let i = 0; i < nPanes; i++) {
      main[i].valueMin = Math.min(
        main[i].valueMin,
        ub[i].valueMin,
        lb[i].valueMin,
      );
      main[i].valueMax = Math.max(
        main[i].valueMax,
        ub[i].valueMax,
        lb[i].valueMax,
      );
      for (let j = 0; j < nTiers; j++) {
        main[i].tierLimits[j].valueMin = Math.min(
          main[i].tierLimits[j].valueMin,
          ub[i].tierLimits[j].valueMin,
          lb[i].tierLimits[j].valueMin,
        );
        main[i].tierLimits[j].valueMax = Math.max(
          main[i].tierLimits[j].valueMax,
          ub[i].tierLimits[j].valueMax,
          lb[i].tierLimits[j].valueMax,
        );
      }
      for (let k = 0; k < nLanes; k++) {
        main[i].laneLimits[k].valueMin = Math.min(
          main[i].laneLimits[k].valueMin,
          ub[i].laneLimits[k].valueMin,
          lb[i].laneLimits[k].valueMin,
        );
        main[i].laneLimits[k].valueMax = Math.max(
          main[i].laneLimits[k].valueMax,
          ub[i].laneLimits[k].valueMax,
          lb[i].laneLimits[k].valueMax,
        );
      }
    }
  }

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
    valueAxisLimits: valueAxisLimits,
    visibleIndicatorsByPane,
    visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneTierOrLane,
    proportionalPanes: proportionalFlags.panes ? true : undefined,
  };
}
