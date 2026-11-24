// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assertNoDataConfigIssues,
  buildDataDimension,
  calculateChartValueAxisLimits,
  createArray,
  createEmptyValuesArray,
  type DataDimension,
  getDimensionMembers,
  getMemberIndex,
  getValidNumberOrUndefined,
  type MemberSortConfig,
  trimReferenceLineLabels,
  trimSubChartTexts,
} from "./deps.ts";
import { getScatterDataConfigIssues } from "./scatter_data_config_issues.ts";
import {
  isScatterDataTransformed,
  type ScatterData,
  type ScatterDataJson,
  type ScatterDataTransformed,
  scatterReferenceLinesOn,
} from "./types.ts";

export function getScatterDataTransformed(
  d: ScatterData,
): ScatterDataTransformed {
  return isScatterDataTransformed(d) ? d : transformScatterData(d);
}

function transformScatterData(d: ScatterDataJson): ScatterDataTransformed {
  const { jsonArray, jsonDataConfig } = d;
  const { xValueProp, yValueProp, labelReplacements, sort } = jsonDataConfig;

  assertNoDataConfigIssues(getScatterDataConfigIssues(d));

  const buildDimension = (
    prop: string | undefined,
    sortConfig: MemberSortConfig | undefined,
  ) => buildDataDimension(jsonArray, prop, [], labelReplacements, sortConfig);
  const indicator = buildDimension(
    jsonDataConfig.indicatorProp,
    sort?.indicator,
  );
  const series = buildDimension(jsonDataConfig.seriesProp, sort?.series);
  const lane = buildDimension(jsonDataConfig.laneProp, sort?.lane);
  const tier = buildDimension(jsonDataConfig.tierProp, sort?.tier);
  const pane = buildDimension(jsonDataConfig.paneProp, sort?.pane);

  const counts = {
    nPanes: getDimensionMembers(pane).length,
    nTiers: getDimensionMembers(tier).length,
    nLanes: getDimensionMembers(lane).length,
    nValues: getDimensionMembers(indicator).length,
  };
  const nSerieses = getDimensionMembers(series).length;
  const emptyValues = () =>
    createEmptyValuesArray(
      counts.nPanes,
      counts.nTiers,
      counts.nLanes,
      nSerieses,
      counts.nValues,
    );
  const xValues = emptyValues();
  const yValues = emptyValues();

  for (const row of jsonArray) {
    const x = getValidNumberOrUndefined(row[xValueProp]);
    const y = getValidNumberOrUndefined(row[yValueProp]);
    if (x === undefined || y === undefined) {
      continue;
    }
    const indexIn = (dimension: DataDimension | undefined) =>
      getMemberIndex(dimension, xValueProp, row);
    const i_pane = indexIn(pane);
    const i_tier = indexIn(tier);
    const i_lane = indexIn(lane);
    const i_series = indexIn(series);
    const i_indicator = indexIn(indicator);
    xValues[i_pane][i_tier][i_lane][i_series][i_indicator] = x;
    yValues[i_pane][i_tier][i_lane][i_series][i_indicator] = y;
  }

  const everySeries = createArray(nSerieses);
  const { referenceLines } = jsonDataConfig;
  const subChartDimensions = { pane, tier, lane };
  return {
    isTransformed: true,
    indicator,
    series,
    lane,
    tier,
    pane,
    xValues,
    yValues,
    xValueAxisLimits: calculateChartValueAxisLimits(
      { values: xValues },
      counts,
      false,
      everySeries,
      scatterReferenceLinesOn(referenceLines, "x"),
      subChartDimensions,
    ),
    yValueAxisLimits: calculateChartValueAxisLimits(
      { values: yValues },
      counts,
      false,
      everySeries,
      scatterReferenceLinesOn(referenceLines, "y"),
      subChartDimensions,
    ),
    xValueAxisLabel: jsonDataConfig.xValueAxisLabel?.trim(),
    yValueAxisLabel: jsonDataConfig.yValueAxisLabel?.trim(),
    referenceLines: trimReferenceLineLabels(referenceLines),
    subChartTexts: trimSubChartTexts(jsonDataConfig.subChartTexts),
  };
}
