// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "../deps.ts";
import type { Component, zType } from "../deps.ts";

export interface ToolUIMetadata<TInput = unknown> {
  displayComponent?: Component<{ input: TInput }>;

  inProgressComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);

  successMessage?: string | ((input: TInput) => string);

  errorMessage?: string | ((input: TInput) => string);
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
  // Matches the SDK's BetaRunnableTool contract — the tool runner calls
  // parse() (when present) before run(). Optional so hand-constructed tools
  // in consumer apps keep compiling; createAITool always provides it.
  parse?: (content: unknown) => TInput;
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

  inProgressComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);

  successMessage?: string | ((input: TInput) => string);

  errorMessage?: string | ((input: TInput) => string);
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
    parse: (content: unknown) => config.inputSchema.parse(content) as TInput,
    run: async (input: TInput) => {
      // Validate here too — the manual chat loop calls run() directly
      // without going through parse().
      const validated = config.inputSchema.parse(input) as TInput;
      const result = await Promise.resolve(config.handler(validated));
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  };

  const metadata: ToolUIMetadata<TInput> = {
    displayComponent: config.displayComponent,
    inProgressComponent: config.inProgressComponent,
    inProgressLabel: config.inProgressLabel,
    completionMessage: config.completionMessage,
    successMessage: config.successMessage,
    errorMessage: config.errorMessage,
  };

  return {
    sdkTool,
    metadata,
  };
}
