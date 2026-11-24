import {
  type ConversionFailure,
  type ConversionNote,
  convertStoredConfig,
  type FigureBundle,
  figureBundleSchema,
  getSingleValueDimsFromItems,
} from "lib";
import type { FigureConversionMetric } from "../../../runs/figure_metric_data.ts";

type StoredFigureBlock = { type: string; bundle?: unknown };

export type FigureBlockConversion =
  | { outcome: "unchanged"; block: StoredFigureBlock }
  | { outcome: "unreadable"; block: StoredFigureBlock; issue: string }
  | {
    outcome: "converted";
    block: StoredFigureBlock;
    notes: ConversionNote[];
    metricSource: FigureConversionMetric["source"];
  }
  | {
    outcome: "emptied";
    block: { type: "figure" };
    failure: ConversionFailure;
    notes: ConversionNote[];
  };

function holdsStoredConfig(bundle: unknown): boolean {
  if (bundle === null || typeof bundle !== "object") return false;
  const config = (bundle as { config?: unknown }).config;
  return config !== null && typeof config === "object" && "d" in config;
}

// The last of the figure transforms: a stored figure block whose bundle holds
// a `{ d, s, t }` config gets the figure config, converted with the metric
// data `metricOf` gives for its bundle. A block with no bundle, or whose
// config is already a figure config, is passed through. A block whose config
// the conversion fails on (a map with no admin-level area, and every other
// `ConversionFailure`) is emptied and the failure returned for the migration
// log. A bundle that does not parse is returned with its issue and left as it
// is.
export function convertStoredFigureBlock(
  block: StoredFigureBlock,
  metricOf: (bundle: FigureBundle) => FigureConversionMetric,
): FigureBlockConversion {
  const raw = block.bundle;
  if (raw === undefined || raw === null || !holdsStoredConfig(raw)) {
    return { outcome: "unchanged", block };
  }
  const parsed = figureBundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      outcome: "unreadable",
      block,
      issue: `${issue?.path.join(".")}: ${issue?.message}`,
    };
  }
  const bundle = parsed.data;
  const metric = metricOf(bundle);
  const conversion = convertStoredConfig(bundle.config, {
    valueProps: metric.valueProps,
    canRollUp: metric.canRollUp,
    yearly: metric.yearly,
    singleValueDims: getSingleValueDimsFromItems(bundle.config, bundle.items),
  });
  if (!conversion.ok) {
    return {
      outcome: "emptied",
      block: { type: "figure" },
      failure: conversion.failure,
      notes: conversion.notes,
    };
  }
  return {
    outcome: "converted",
    block: {
      ...block,
      bundle: {
        ...(raw as Record<string, unknown>),
        config: conversion.config,
      },
    },
    notes: conversion.notes,
    metricSource: metric.source,
  };
}
