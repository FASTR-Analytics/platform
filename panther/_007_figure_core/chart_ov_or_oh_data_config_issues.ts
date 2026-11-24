// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartOVOrOHJsonConfigCore,
  ChartOVOrOHTransformSpec,
} from "./chart_ov_or_oh_transform.ts";
import { getTierOrLaneKey } from "./common_data_transform.ts";
import {
  type DataConfigIssue,
  getEverySeriesOnSecondValueAxisIssues,
  getNoRowsIssues,
  getProportionalConflictIssues,
  getValuePropsDataConfigIssues,
  indexRows,
} from "./data_config_issues.ts";
import type { JsonArray } from "./types.ts";

export function getChartOVOrOHDataConfigIssues(
  jsonArray: JsonArray,
  cfg: ChartOVOrOHJsonConfigCore,
  spec: ChartOVOrOHTransformSpec,
): DataConfigIssue[] {
  const dimensionProps = {
    indicatorProp: cfg.indicatorProp,
    seriesProp: cfg.seriesProp,
    laneProp: cfg.laneProp,
    tierProp: cfg.tierProp,
    paneProp: cfg.paneProp,
  };
  return [
    ...getNoRowsIssues(jsonArray),
    ...getValuePropsDataConfigIssues(
      jsonArray,
      {
        valueProps: cfg.valueProps,
        dimensionProps,
        uncertainty: cfg.uncertainty,
      },
      () => true,
    ),
    ...getProportionalConflictIssues(
      cfg.proportional,
      getTierOrLaneKey(spec.tierOrLaneDimension),
    ),
    ...getEverySeriesOnSecondValueAxisIssues(
      indexRows(jsonArray),
      cfg.seriesProp,
      cfg.valueProps,
      cfg.secondValueAxis,
    ),
  ];
}
