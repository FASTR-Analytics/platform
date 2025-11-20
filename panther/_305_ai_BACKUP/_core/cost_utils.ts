// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnthropicModel, CostEstimate, Usage } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// PRICING
////////////////////////////////////////////////////////////////////////////////

type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
  cacheWritePer1M: number;
  cacheReadPer1M: number;
};

const PRICING: Record<string, ModelPricing> = {
  // Claude 4.x models (2025)
  "claude-sonnet-4.5-20250929": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-sonnet-4-20250522": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-opus-4.1-20250522": {
    inputPer1M: 20.00,
    outputPer1M: 80.00,
    cacheWritePer1M: 25.00,
    cacheReadPer1M: 2.00,
  },
  "claude-opus-4-20250522": {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.50,
  },
  "claude-3.7-sonnet-20250224": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-haiku-4.5-20250122": {
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.10,
  },
  // Claude 3.x models (2024)
  "claude-3-5-sonnet-20241022": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-5-sonnet-20240620": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-5-haiku-20241022": {
    inputPer1M: 0.80,
    outputPer1M: 4.00,
    cacheWritePer1M: 1.00,
    cacheReadPer1M: 0.08,
  },
  "claude-3-opus-20240229": {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.50,
  },
  "claude-3-sonnet-20240229": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-haiku-20240307": {
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cacheWritePer1M: 0.31,
    cacheReadPer1M: 0.03,
  },
};

const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 3.00,
  outputPer1M: 15.00,
  cacheWritePer1M: 3.75,
  cacheReadPer1M: 0.30,
};

////////////////////////////////////////////////////////////////////////////////
// COST CALCULATION
////////////////////////////////////////////////////////////////////////////////

export function calculateCost(
  usage: Usage,
  model: AnthropicModel,
): CostEstimate {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const regularInputTokens = inputTokens - cacheReadTokens;

  const inputCost = (regularInputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cacheCost = (cacheCreationTokens / 1_000_000) *
    pricing.cacheWritePer1M;
  const cacheReadCost = (cacheReadTokens / 1_000_000) *
    pricing.cacheReadPer1M;

  return {
    inputCost,
    outputCost,
    cacheCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheCost + cacheReadCost,
    currency: "USD",
  };
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(4)}¢`;
  }
  return `$${cost.toFixed(4)}`;
}

export function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  return `${(count / 1000).toFixed(1)}K`;
}

////////////////////////////////////////////////////////////////////////////////
// USAGE AGGREGATION
////////////////////////////////////////////////////////////////////////////////

export function aggregateUsage(usages: Usage[]): Usage {
  return usages.reduce(
    (acc, usage) => ({
      input_tokens: acc.input_tokens + (usage.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (usage.output_tokens ?? 0),
      cache_creation_input_tokens: (acc.cache_creation_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens: (acc.cache_read_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0),
    }),
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  );
}
