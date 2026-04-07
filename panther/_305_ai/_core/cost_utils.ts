// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnthropicModel, Usage } from "../deps.ts";
import { DEFAULT_PRICING, MODEL_PRICING } from "../deps.ts";
import type { CostEstimate } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// COST CALCULATION
////////////////////////////////////////////////////////////////////////////////

export function calculateCost(
  usage: Usage,
  model: AnthropicModel,
): CostEstimate {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;

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
    return `${(cost * 100).toFixed(2)}¢`;
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
