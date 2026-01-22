// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "../deps.ts";
import type { Component, zType } from "../deps.ts";

export interface ToolUIMetadata<TInput = unknown> {
  displayComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);
}

export interface SDKTool<TInput = unknown> {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  run: (input: TInput) => Promise<string>;
}

export interface AIToolWithMetadata<TInput = unknown> {
  sdkTool: SDKTool<TInput>;

  metadata: ToolUIMetadata<TInput>;
}

export interface CreateAIToolConfig<TInput, TOutput = string> {
  name: string;

  description: string;

  inputSchema: zType.ZodType<TInput>;

  handler: (input: TInput) => Promise<TOutput> | TOutput;

  displayComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);
}

function zodToJsonSchema(zodSchema: zType.ZodType): {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
} {
  const jsonSchema = z.toJSONSchema(zodSchema, { reused: "ref" });

  if (jsonSchema.type !== "object") {
    throw new Error(`Zod schema must be an object, but got ${jsonSchema.type}`);
  }

  return jsonSchema as {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export function createAITool<TInput, TOutput = string>(
  config: CreateAIToolConfig<TInput, TOutput>,
): AIToolWithMetadata<TInput> {
  const sdkTool: SDKTool<TInput> = {
    name: config.name,
    description: config.description,
    input_schema: zodToJsonSchema(config.inputSchema),
    run: async (input: TInput) => {
      const result = await Promise.resolve(config.handler(input));
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  };

  const metadata: ToolUIMetadata<TInput> = {
    displayComponent: config.displayComponent,
    inProgressLabel: config.inProgressLabel,
    completionMessage: config.completionMessage,
  };

  return {
    sdkTool,
    metadata,
  };
}
