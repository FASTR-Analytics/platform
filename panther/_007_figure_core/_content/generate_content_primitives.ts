// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DimensionMember,
  MergedContentStyle,
  Primitive,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { calculateMappedCoordinates } from "./calculate_mapped_coordinates.ts";
import type { ContentGenerationContext } from "./content_generation_types.ts";
import { generateAreaPrimitives } from "./generate_area_primitives.ts";
import { generateBarPrimitives } from "./generate_bar_primitives.ts";
import { generateConnectorPrimitives } from "./generate_connector_primitives.ts";
import { generateErrorBarPrimitives } from "./generate_error_bar_primitives.ts";
import { generateLinePrimitives } from "./generate_line_primitives.ts";
import { generatePointPrimitives } from "./generate_point_primitives.ts";
import { resolveDataLabelOwnership } from "./resolve_data_label_ownership.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import type { OverhangClearance, ValueRange } from "../types.ts";

export type ContentPrimitiveGenerationParams = {
  rc: RenderContext;
  subChartRcd: RectCoordsDims;
  subChartInfo: {
    nSerieses: number;
    seriesValueArrays: (number | undefined)[][];
    i_pane: number;
    nPanes: number;
    paneMember: DimensionMember | undefined;
    i_tier: number;
    nTiers: number;
    tierMember: DimensionMember | undefined;
    i_lane: number;
    nLanes: number;
    laneMember: DimensionMember | undefined;
  };
  seriesValues: (number | undefined)[][];
  valueRange: ValueRange;
  valueClearance: OverhangClearance;
  isCentered: boolean;
  slotExtent: number;
  gridLineStrokeWidth: number;
  nValues: number;
  orientation: "vertical" | "horizontal";
  itemDataDimensions: ChartItemDataDimensions;
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  uncertaintyUbSeriesValues?: (number | undefined)[][];
  uncertaintyLbSeriesValues?: (number | undefined)[][];
  // This unit's slot order: the global indicator index at each slot.
  slotOrder: number[];
};

// The inverse of slotOrder: global storage index → position ordinal, undefined
// for an indicator this unit does not show.
function buildPositionOrdinals(
  slotOrder: number[],
  nValues: number,
): (number | undefined)[] {
  const ordinals: (number | undefined)[] = Array.from(
    { length: nValues },
    () => undefined,
  );
  slotOrder.forEach((globalIdx, ordinal) => {
    ordinals[globalIdx] = ordinal;
  });
  return ordinals;
}

export function generateContentPrimitives(
  params: ContentPrimitiveGenerationParams,
): Primitive[] {
  const {
    rc,
    subChartRcd,
    subChartInfo,
    seriesValues,
    valueRange,
    valueClearance,
    isCentered,
    slotExtent,
    gridLineStrokeWidth,
    nValues,
    orientation,
    contentStyle: s,
    slotOrder,
  } = params;

  const positionOrdinals = buildPositionOrdinals(slotOrder, nValues);

  const mapped = calculateMappedCoordinates(
    seriesValues,
    subChartRcd,
    slotExtent,
    isCentered,
    gridLineStrokeWidth,
    valueRange,
    valueClearance,
    orientation,
    positionOrdinals,
  );

  const nSerieses = mapped.length;

  const mappedUncertaintyUb = params.uncertaintyUbSeriesValues
    ? calculateMappedCoordinates(
      params.uncertaintyUbSeriesValues,
      subChartRcd,
      slotExtent,
      isCentered,
      gridLineStrokeWidth,
      valueRange,
      valueClearance,
      orientation,
      positionOrdinals,
    )
    : undefined;

  const mappedUncertaintyLb = params.uncertaintyLbSeriesValues
    ? calculateMappedCoordinates(
      params.uncertaintyLbSeriesValues,
      subChartRcd,
      slotExtent,
      isCentered,
      gridLineStrokeWidth,
      valueRange,
      valueClearance,
      orientation,
      positionOrdinals,
    )
    : undefined;

  const ctx: ContentGenerationContext = {
    rc,
    subChartRcd,
    subChartInfo,
    nValues,
    slotOrder,
    nSerieses,
    orientation,
    slotExtent,
    gridLineStrokeWidth,
    itemDataDimensions: params.itemDataDimensions,
    contentStyle: s,
    dataLabelsTextStyle: params.dataLabelsTextStyle,
    valueRange,
    valueClearance,
    mappedUncertaintyUb,
    mappedUncertaintyLb,
  };

  const labelOwner = resolveDataLabelOwnership(seriesValues, ctx);

  const marks = [
    ...generatePointPrimitives(mapped, labelOwner, ctx),
    ...generateBarPrimitives(mapped, labelOwner, ctx),
  ];
  return [
    ...marks,
    ...generateErrorBarPrimitives(marks, ctx),
    ...generateLinePrimitives(mapped, labelOwner, ctx),
    ...generateAreaPrimitives(mapped, ctx),
    ...generateConnectorPrimitives(mapped, ctx),
  ];
}
