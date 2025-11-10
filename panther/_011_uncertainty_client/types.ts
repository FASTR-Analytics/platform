// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// R Uncertainty Server - TypeScript Type Definitions
// Comprehensive type-safe interface for the uncertainty server

// ============================================================================
// Distribution Types
// ============================================================================

export type NormalDistribution = {
  type: "normal";
  params: {
    mean: number;
    sd: number;
  };
};

export type LognormalDistribution = {
  type: "lognormal";
  params: {
    meanlog: number;
    sdlog: number;
  };
};

export type BetaDistribution = {
  type: "beta";
  params: {
    shape1: number;
    shape2: number;
  };
};

export type GammaDistribution = {
  type: "gamma";
  params: {
    shape: number;
    rate: number;
  };
};

export type UniformDistribution = {
  type: "uniform";
  params: {
    min: number;
    max: number;
  };
};

export type Distribution =
  | NormalDistribution
  | LognormalDistribution
  | BetaDistribution
  | GammaDistribution
  | UniformDistribution;

export type ParameterDistributions = Record<string, Distribution>;

// ============================================================================
// Request Types
// ============================================================================

export type UncertaintyRequestBase = {
  modelFunction: string;
  paramDistributions: ParameterDistributions;
  iterations?: number;
};

export type UncertaintyRequestWithDatasetId = UncertaintyRequestBase & {
  datasetId: string;
  fixedData?: never;
};

export type UncertaintyRequestWithFixedData = UncertaintyRequestBase & {
  datasetId?: never;
  fixedData: Record<string, unknown>;
};

export type UncertaintyRequest =
  | UncertaintyRequestWithDatasetId
  | UncertaintyRequestWithFixedData;

// ============================================================================
// Response Types
// ============================================================================

export type OutputStatistics = {
  mean: number;
  median: number;
  sd: number;
  quantiles: [number, number, number, number]; // 2.5%, 25%, 75%, 97.5%
  distribution: number[];
};

export type UncertaintyResults = Record<string, OutputStatistics>;

export type UploadDataResponse = {
  dataset_id: string;
  files: string[];
  uploaded_at: string;
};

export type HealthResponse = {
  status: string;
  timestamp: string;
};

export type DeleteDataResponse = {
  status: "deleted" | "not_found";
};

export type ErrorResponse = {
  error: true;
  message: string;
};

// ============================================================================
// Client Types
// ============================================================================

export type ClientConfig = {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
};

// ============================================================================
// Helper Types for Distribution Creation
// ============================================================================

export type NormalParams = {
  mean: number;
  sd: number;
};

export type LognormalParams = {
  meanlog: number;
  sdlog: number;
};

export type BetaParams = {
  shape1: number;
  shape2: number;
};

export type GammaParams = {
  shape: number;
  rate: number;
};

export type UniformParams = {
  min: number;
  max: number;
};

// ============================================================================
// Type Guards
// ============================================================================

export function isErrorResponse(
  response: unknown,
): response is ErrorResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    (response as ErrorResponse).error === true
  );
}

export function isUncertaintyResults(
  response: unknown,
): response is UncertaintyResults {
  if (typeof response !== "object" || response === null) {
    return false;
  }

  const results = response as Record<string, unknown>;

  return Object.values(results).every(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "mean" in value &&
      "median" in value &&
      "sd" in value &&
      "quantiles" in value &&
      "distribution" in value,
  );
}

// ============================================================================
// Distribution Builder Helpers
// ============================================================================

export const Distributions = {
  normal: (params: NormalParams): NormalDistribution => ({
    type: "normal",
    params,
  }),

  lognormal: (params: LognormalParams): LognormalDistribution => ({
    type: "lognormal",
    params,
  }),

  beta: (params: BetaParams): BetaDistribution => ({
    type: "beta",
    params,
  }),

  gamma: (params: GammaParams): GammaDistribution => ({
    type: "gamma",
    params,
  }),

  uniform: (params: UniformParams): UniformDistribution => ({
    type: "uniform",
    params,
  }),
};

// ============================================================================
// Statistical Helper Types
// ============================================================================

export type ConfidenceInterval = {
  lower: number;
  upper: number;
  level: number; // e.g., 0.95 for 95% CI
};

export type SummaryStatistics = {
  mean: number;
  median: number;
  sd: number;
  ci95: ConfidenceInterval;
  ci50: ConfidenceInterval;
};

// ============================================================================
// Utility Functions for Working with Results
// ============================================================================

export function extractSummary(
  stats: OutputStatistics,
): SummaryStatistics {
  return {
    mean: stats.mean,
    median: stats.median,
    sd: stats.sd,
    ci95: {
      lower: stats.quantiles[0],
      upper: stats.quantiles[3],
      level: 0.95,
    },
    ci50: {
      lower: stats.quantiles[1],
      upper: stats.quantiles[2],
      level: 0.5,
    },
  };
}

export function formatStatistics(
  stats: OutputStatistics,
  decimals: number = 2,
): string {
  return `${stats.mean.toFixed(decimals)} (95% CI: ${
    stats.quantiles[0].toFixed(decimals)
  }-${stats.quantiles[3].toFixed(decimals)})`;
}
