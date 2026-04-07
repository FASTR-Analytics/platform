// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, getColor, RectCoordsDims, Z_INDEX } from "../deps.ts";
import type {
  Primitive,
  RectStyle,
  ScaleLegendGradientPrimitive,
  ScaleLegendSteppedPrimitive,
} from "../deps.ts";
import type {
  MeasuredScaleLegend,
  MeasuredScaleLegendGradient,
  MeasuredScaleLegendStepped,
} from "./measure_scale_legend.ts";

export function generateScaleLegendPrimitive(
  coords: Coordinates,
  mScaleLegend: MeasuredScaleLegend,
  bounds: RectCoordsDims,
): Primitive {
  if (mScaleLegend.type === "gradient") {
    return generateGradientPrimitive(coords, mScaleLegend, bounds);
  }
  return generateSteppedPrimitive(coords, mScaleLegend, bounds);
}

function generateGradientPrimitive(
  coords: Coordinates,
  m: MeasuredScaleLegendGradient,
  bounds: RectCoordsDims,
): ScaleLegendGradientPrimitive {
  const s = m.s;
  const config = m.config;
  const barX = coords.x() + m.leftOverhang;
  const barY = coords.y();

  const barRect = new RectCoordsDims({
    x: barX,
    y: barY,
    w: m.barWidth,
    h: s.barHeight,
  });

  const valueMin = config.stops[0].value;
  const valueMax = config.stops[config.stops.length - 1].value;
  const valueRange = valueMax - valueMin;

  const colorStops = config.stops.map((stop) => ({
    t: valueRange === 0 ? 0 : (stop.value - valueMin) / valueRange,
    color: getColor(stop.color),
  }));

  const ticks = config.ticks.map((tick, i) => {
    const t = valueRange === 0 ? 0 : (tick - valueMin) / valueRange;
    const pixelOffset = t * m.barWidth;
    const labelY = barY + s.barHeight + s.tickLength + s.labelGap;
    return {
      pixelOffset,
      mText: m.tickMeasurements[i],
      labelPosition: new Coordinates({
        x: barX + pixelOffset,
        y: labelY,
      }),
    };
  });

  let noData: ScaleLegendGradientPrimitive["noData"] = undefined;
  if (config.noData && m.noDataMeasurement) {
    const lastLabelW = m.tickMeasurements.length > 0
      ? m.tickMeasurements[m.tickMeasurements.length - 1].dims.w()
      : 0;
    const noDataX = barX + m.barWidth + lastLabelW / 2 + s.noDataGap;
    const swatchRect = new RectCoordsDims({
      x: noDataX,
      y: barY,
      w: s.noDataSwatchWidth,
      h: s.barHeight,
    });
    noData = {
      rect: swatchRect,
      style: { fillColor: getColor(config.noData.color) },
      mText: m.noDataMeasurement,
      labelPosition: new Coordinates({
        x: noDataX + s.noDataSwatchWidth + s.labelGap,
        y: barY,
      }),
    };
  }

  return {
    type: "scale-legend-gradient",
    key: "scale-legend-gradient",
    bounds,
    zIndex: Z_INDEX.LEGEND,
    colorStops,
    barRect,
    ticks,
    noData,
  };
}

function generateSteppedPrimitive(
  coords: Coordinates,
  m: MeasuredScaleLegendStepped,
  bounds: RectCoordsDims,
): ScaleLegendSteppedPrimitive {
  const s = m.s;
  const config = m.config;
  const startX = coords.x() + m.leftOverhang;
  const startY = coords.y();

  const nSteps = config.steps.length;
  const totalGaps = (nSteps - 1) * s.blockGap;
  const blockWidth = (m.totalBlocksWidth - totalGaps) / nSteps;

  const steps: { rect: RectCoordsDims; style: RectStyle }[] = [];
  for (let i = 0; i < nSteps; i++) {
    const x = startX + i * (blockWidth + s.blockGap);
    steps.push({
      rect: new RectCoordsDims({
        x,
        y: startY,
        w: blockWidth,
        h: s.barHeight,
      }),
      style: { fillColor: getColor(config.steps[i].color) },
    });
  }

  const boundaries: number[] = [];
  for (const step of config.steps) {
    if (
      boundaries.length === 0 || boundaries[boundaries.length - 1] !== step.min
    ) {
      boundaries.push(step.min);
    }
    boundaries.push(step.max);
  }

  const labelY = startY + s.barHeight + s.labelGap;
  const labels = boundaries.map((_, i) => {
    let x: number;
    if (i === 0) {
      x = startX;
    } else if (i === boundaries.length - 1) {
      x = startX + m.totalBlocksWidth;
    } else {
      x = startX + i * (blockWidth + s.blockGap) - s.blockGap / 2;
    }
    return {
      mText: m.labelMeasurements[i],
      position: new Coordinates({ x, y: labelY }),
    };
  });

  let noData: ScaleLegendSteppedPrimitive["noData"] = undefined;
  if (config.noData && m.noDataMeasurement) {
    const lastLabelW = m.labelMeasurements.length > 0
      ? m.labelMeasurements[m.labelMeasurements.length - 1].dims.w()
      : 0;
    const noDataX = startX + m.totalBlocksWidth + lastLabelW / 2 + s.noDataGap;
    const swatchRect = new RectCoordsDims({
      x: noDataX,
      y: startY,
      w: s.noDataSwatchWidth,
      h: s.barHeight,
    });
    noData = {
      rect: swatchRect,
      style: { fillColor: getColor(config.noData.color) },
      mText: m.noDataMeasurement,
      labelPosition: new Coordinates({
        x: noDataX + s.noDataSwatchWidth + s.labelGap,
        y: startY,
      }),
    };
  }

  return {
    type: "scale-legend-stepped",
    key: "scale-legend-stepped",
    bounds,
    zIndex: Z_INDEX.LEGEND,
    steps,
    labels,
    noData,
  };
}
