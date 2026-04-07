// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "../deps.ts";
import type { LegendItem } from "./types.ts";

export type ScaleLegendGradientConfig = {
  type: "gradient";
  stops: { value: number; color: ColorKeyOrString }[];
  ticks: number[];
  labelFormatter?: (value: number) => string;
  noData?: { color: ColorKeyOrString; label: string };
};

export type ScaleLegendSteppedConfig = {
  type: "stepped";
  steps: { min: number; max: number; color: ColorKeyOrString }[];
  labelFormatter?: (value: number) => string;
  noData?: { color: ColorKeyOrString; label: string };
};

export type ScaleLegendGradientAutoConfig = {
  type: "gradient-auto";
  nTicks?: number;
  domain?: { min: number; max: number };
  format?: "number" | "percent";
  labelFormatter?: (value: number) => string;
  noData?: { color: ColorKeyOrString; label: string };
};

export type ScaleLegendSteppedAutoConfig = {
  type: "stepped-auto";
  nSteps: number;
  domain?: { min: number; max: number };
  format?: "number" | "percent";
  labelFormatter?: (value: number) => string;
  noData?: { color: ColorKeyOrString; label: string };
};

export type ScaleLegendConfig =
  | ScaleLegendGradientConfig
  | ScaleLegendSteppedConfig
  | ScaleLegendGradientAutoConfig
  | ScaleLegendSteppedAutoConfig;

export type LegendInput = LegendItem[] | string[] | ScaleLegendConfig;

export type ConcreteScaleLegendConfig =
  | ScaleLegendGradientConfig
  | ScaleLegendSteppedConfig;

export function isScaleLegendConfig(
  v: unknown,
): v is ScaleLegendConfig {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    (v.type === "gradient" || v.type === "stepped" ||
      v.type === "gradient-auto" || v.type === "stepped-auto")
  );
}

export function isConcreteScaleLegendConfig(
  v: unknown,
): v is ConcreteScaleLegendConfig {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    (v.type === "gradient" || v.type === "stepped")
  );
}

export function isAutoScaleLegendConfig(
  v: unknown,
): v is ScaleLegendGradientAutoConfig | ScaleLegendSteppedAutoConfig {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    (v.type === "gradient-auto" || v.type === "stepped-auto")
  );
}
