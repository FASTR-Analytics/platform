// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildAvailabilityHint, z } from "../deps.ts";
import type { Component, zType } from "../deps.ts";
import { AIToolFailure } from "./tool_failure.ts";

export { AIToolFailure } from "./tool_failure.ts";

// "write" drives approval policy (PLAN_AI_VIEWS_AND_APPROVAL Feature 4);
// "read"/"nav" are forward metadata (actions-registry stamping, catalog
// grouping) with no engine behavior today.
export type AIToolKind = "read" | "write" | "nav";

export interface ToolUIMetadata<TInput = unknown> {
  displayComponent?: Component<{ input: TInput }>;

  inProgressComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);

  successMessage?: string | ((input: TInput) => string);

  errorMessage?: string | ((input: TInput) => string);

  // View ids where this tool may EXECUTE (soft gating — the tool is always
  // sent to the API; out-of-view calls get a standardized is_error result
  // before the handler runs). Absent = available everywhere. Validated
  // against the configured view registry when the tool is registered.
  availableIn?: string[];

  kind?: AIToolKind;

  // Engine-internal: the controller instance that created this tool via
  // viewController.createTool. Registration verifies it is the SAME instance
  // as the chat's configured controller — the handler's narrowed view state
  // reads THIS controller's signal, so a chat gating on a different
  // controller would pass the gate while the handler sees another view
  // (proven in the Phase 1+2 review). Never set by consumers.
  _viewController?: unknown;
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

  // See ToolUIMetadata.availableIn. On the plain createAITool this is
  // string[]; the typed variant (viewController.createTool) constrains it to
  // the registry's view ids at compile time.
  availableIn?: string[];

  kind?: AIToolKind;
}

// Construction-time guard: a tool input schema must ACCEPT unknown keys
// everywhere in its tree (Claude sometimes emits underscore-prefixed
// metadata keys; a strict schema then errors on every call). Detection is
// empirical and pinned by tests/ai_tool_schema_test.ts: under
// z.toJSONSchema(schema, { io: "input" }), plain z.object omits
// additionalProperties while z.strictObject and .catchall(z.never()) emit
// `additionalProperties: false` — including at nested nodes and inside
// $defs (reused: "ref"). z.record emits an object there, never false.
// Keywords whose values are DATA, not schemas — a default/example payload
// may legitimately contain {additionalProperties: false} as a literal (e.g.
// tools that edit JSON-schema-shaped config) and must not trip the guard.
const NON_SCHEMA_KEYWORDS = new Set(["default", "examples", "const", "enum"]);
// Keywords whose value is a map of arbitrary NAME → subschema: the names
// themselves are data (a property may be called "default"), the values are
// schema positions.
const SCHEMA_MAP_KEYWORDS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);

function findUnknownKeyRejectingPath(
  node: unknown,
  path: string,
): string | null {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findUnknownKeyRejectingPath(node[i], `${path}[${i}]`);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (node === null || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.additionalProperties === false) return path;
  // Keyed records (z.record(z.enum(...)) / regex-keyed) emit no `false`
  // marker but still reject unknown keys at parse — the constraint lives on
  // propertyNames instead.
  const pn = obj.propertyNames;
  if (
    pn !== null && typeof pn === "object" && !Array.isArray(pn) &&
    ("enum" in pn || "const" in pn || "pattern" in pn)
  ) {
    return `${path}.propertyNames`;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (NON_SCHEMA_KEYWORDS.has(key)) continue;
    if (
      SCHEMA_MAP_KEYWORDS.has(key) && value !== null &&
      typeof value === "object" && !Array.isArray(value)
    ) {
      for (const [name, sub] of Object.entries(value)) {
        const hit = findUnknownKeyRejectingPath(sub, `${path}.${key}.${name}`);
        if (hit !== null) return hit;
      }
      continue;
    }
    const hit = findUnknownKeyRejectingPath(value, `${path}.${key}`);
    if (hit !== null) return hit;
  }
  return null;
}

function assertSchemaAcceptsUnknownKeys(
  toolName: string,
  schema: zType.ZodType,
): void {
  const inputSchema = z.toJSONSchema(schema, { io: "input", reused: "ref" });
  const hit = findUnknownKeyRejectingPath(inputSchema, "$");
  if (hit !== null) {
    throw new Error(
      `createAITool("${toolName}"): input schema rejects unknown keys at ${hit} (z.strictObject, .catchall(z.never()), or an enum/pattern-keyed z.record). Tool schemas must accept unknown keys — Claude sometimes emits extra metadata keys, and a rejecting schema then errors on every call.`,
    );
  }
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

function parseToolInput<TInput>(
  schema: zType.ZodType<TInput>,
  input: unknown,
): TInput {
  try {
    return schema.parse(input) as TInput;
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new AIToolFailure(`Invalid input:\n${z.prettifyError(e)}`);
    }
    throw e;
  }
}

export function createAITool<TInput, TOutput = string>(
  config: CreateAIToolConfig<TInput, TOutput>,
): AIToolWithMetadata<TInput> {
  assertSchemaAcceptsUnknownKeys(config.name, config.inputSchema);
  if (config.availableIn !== undefined && config.availableIn.length === 0) {
    throw new Error(
      `createAITool("${config.name}"): availableIn is empty — the tool would be executable nowhere. Omit the field for an everywhere-available tool.`,
    );
  }

  // Static availability hint: the cheapest cache-stable channel to the model
  // (per-tool, byte-stable across navigation) — it learns the view map from
  // the tool definitions it reads when choosing tools, before its first
  // refusal. Derived from declared metadata, no opt-out (like the gate
  // message).
  const description = config.availableIn
    ? `${config.description}\n\n${buildAvailabilityHint(config.availableIn)}`
    : config.description;

  const sdkTool: SDKTool<TInput> = {
    name: config.name,
    description,
    input_schema: zodToJsonSchema(config.inputSchema),
    parse: (content: unknown) => parseToolInput(config.inputSchema, content),
    run: async (input: TInput) => {
      // Validate here too — the manual chat loop calls run() directly
      // without going through parse().
      const validated = parseToolInput(config.inputSchema, input);
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
    availableIn: config.availableIn,
    kind: config.kind,
  };

  return {
    sdkTool,
    metadata,
  };
}
