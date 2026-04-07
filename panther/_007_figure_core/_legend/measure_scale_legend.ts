// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Dimensions,
  getColor,
  type MeasuredText,
  type MergedScaleLegendStyle,
  type RenderContext,
} from "../deps.ts";
import type {
  ConcreteScaleLegendConfig,
  ScaleLegendGradientConfig,
  ScaleLegendSteppedConfig,
} from "./scale_legend_types.ts";

export type MeasuredScaleLegendGradient = {
  type: "gradient";
  dimensions: Dimensions;
  config: ScaleLegendGradientConfig;
  barWidth: number;
  leftOverhang: number;
  tickMeasurements: MeasuredText[];
  noDataMeasurement?: MeasuredText;
  s: MergedScaleLegendStyle;
};

export type MeasuredScaleLegendStepped = {
  type: "stepped";
  dimensions: Dimensions;
  config: ScaleLegendSteppedConfig;
  totalBlocksWidth: number;
  leftOverhang: number;
  labelMeasurements: MeasuredText[];
  noDataMeasurement?: MeasuredText;
  s: MergedScaleLegendStyle;
};

export type MeasuredScaleLegend =
  | MeasuredScaleLegendGradient
  | MeasuredScaleLegendStepped;

export function measureScaleLegend(
  rc: RenderContext,
  config: ConcreteScaleLegendConfig,
  s: MergedScaleLegendStyle,
  availableWidth?: number,
): MeasuredScaleLegend {
  if (config.type === "gradient") {
    return measureGradient(rc, config, s, availableWidth);
  }
  return measureStepped(rc, config, s, availableWidth);
}

function formatLabel(
  value: number,
  formatter: ((v: number) => string) | undefined,
): string {
  if (formatter) return formatter(value);
  return String(value);
}

function measureGradient(
  rc: RenderContext,
  config: ScaleLegendGradientConfig,
  s: MergedScaleLegendStyle,
  availableWidth?: number,
): MeasuredScaleLegendGradient {
  const tickMeasurements = config.ticks.map((tick) =>
    rc.mText(
      formatLabel(tick, config.labelFormatter),
      s.text,
      Number.POSITIVE_INFINITY,
    )
  );

  const maxTickLabelW = tickMeasurements.reduce(
    (max, m) => Math.max(max, m.dims.w()),
    0,
  );
  const maxTickLabelH = tickMeasurements.reduce(
    (max, m) => Math.max(max, m.dims.h()),
    0,
  );

  const firstLabelW = tickMeasurements.length > 0
    ? tickMeasurements[0].dims.w()
    : 0;
  const lastLabelW = tickMeasurements.length > 0
    ? tickMeasurements[tickMeasurements.length - 1].dims.w()
    : 0;
  const leftOverhang = firstLabelW / 2;
  const rightOverhang = lastLabelW / 2;

  const minBarWidth = Math.max(
    (config.ticks.length - 1) * (maxTickLabelW + s.labelGap),
    100 * s.alreadyScaledValue,
  );
  const barWidth = availableWidth !== undefined
    ? Math.min(availableWidth - leftOverhang - rightOverhang, minBarWidth)
    : minBarWidth;

  const noDataMeasurement = config.noData
    ? rc.mText(config.noData.label, s.text, Number.POSITIVE_INFINITY)
    : undefined;

  let totalW = leftOverhang + barWidth + rightOverhang;
  if (noDataMeasurement) {
    totalW += s.noDataGap + s.noDataSwatchWidth + s.labelGap +
      noDataMeasurement.dims.w();
  }

  const totalH = s.barHeight + s.tickLength + s.labelGap + maxTickLabelH;

  return {
    type: "gradient",
    dimensions: new Dimensions({ w: totalW, h: totalH }),
    config,
    barWidth,
    leftOverhang,
    tickMeasurements,
    noDataMeasurement,
    s,
  };
}

function measureStepped(
  rc: RenderContext,
  config: ScaleLegendSteppedConfig,
  s: MergedScaleLegendStyle,
  availableWidth?: number,
): MeasuredScaleLegendStepped {
  const boundaries: number[] = [];
  for (const step of config.steps) {
    if (
      boundaries.length === 0 || boundaries[boundaries.length - 1] !== step.min
    ) {
      boundaries.push(step.min);
    }
    boundaries.push(step.max);
  }

  const labelMeasurements = boundaries.map((val) =>
    rc.mText(
      formatLabel(val, config.labelFormatter),
      s.text,
      Number.POSITIVE_INFINITY,
    )
  );

  const maxLabelW = labelMeasurements.reduce(
    (max, m) => Math.max(max, m.dims.w()),
    0,
  );
  const maxLabelH = labelMeasurements.reduce(
    (max, m) => Math.max(max, m.dims.h()),
    0,
  );

  const firstLabelW = labelMeasurements.length > 0
    ? labelMeasurements[0].dims.w()
    : 0;
  const lastLabelW = labelMeasurements.length > 0
    ? labelMeasurements[labelMeasurements.length - 1].dims.w()
    : 0;
  const leftOverhang = firstLabelW / 2;
  const rightOverhang = lastLabelW / 2;

  const nSteps = config.steps.length;
  const minBlockWidth = maxLabelW + s.labelGap;
  const minTotalBlocksWidth = nSteps * minBlockWidth +
    (nSteps - 1) * s.blockGap;
  const totalBlocksWidth = availableWidth !== undefined
    ? Math.min(
      availableWidth - leftOverhang - rightOverhang,
      minTotalBlocksWidth,
    )
    : minTotalBlocksWidth;

  const noDataMeasurement = config.noData
    ? rc.mText(config.noData.label, s.text, Number.POSITIVE_INFINITY)
    : undefined;

  let totalW = leftOverhang + totalBlocksWidth + rightOverhang;
  if (noDataMeasurement) {
    totalW += s.noDataGap + s.noDataSwatchWidth + s.labelGap +
      noDataMeasurement.dims.w();
  }

  const totalH = s.barHeight + s.labelGap + maxLabelH;

  return {
    type: "stepped",
    dimensions: new Dimensions({ w: totalW, h: totalH }),
    config,
    totalBlocksWidth,
    leftOverhang,
    labelMeasurements,
    noDataMeasurement,
    s,
  };
}
