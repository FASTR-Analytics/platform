// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { betaZodTool, z } from "../deps.ts";
import type { Component, zType } from "../deps.ts";

export interface ToolUIMetadata<TInput = unknown> {
  displayComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);
}

export interface AIToolWithMetadata<TInput = unknown> {
  sdkTool: ReturnType<typeof betaZodTool<zType.ZodType<TInput>, string>>;

  metadata: ToolUIMetadata<TInput>;
}

export interface CreateAIToolConfig<TInput, TOutput = string> {
  name: string;

  description: string;

  inputSchema: zType.ZodType<TInput>;

  handler: (input: TInput) => Promise<TOutput> | TOutput;

  displayComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);
}

export function createAITool<TInput, TOutput = string>(
  config: CreateAIToolConfig<TInput, TOutput>,
): AIToolWithMetadata<TInput> {
  const sdkTool = betaZodTool({
    name: config.name,
    description: config.description,
    schema: config.inputSchema,
    run: async (input: TInput) => {
      const result = await Promise.resolve(config.handler(input));
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  });

  const metadata: ToolUIMetadata<TInput> = {
    displayComponent: config.displayComponent,
    inProgressLabel: config.inProgressLabel,
  };

  return {
    sdkTool,
    metadata,
  };
}
