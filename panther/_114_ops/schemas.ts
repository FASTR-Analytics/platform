// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Zod schemas for _114's own wire-visible types: a module that puts a type
// on the wire owns its schema, so a consumer registry can declare catalog
// and provenance outputs (its listOps / listActivity ops) without restating
// the shapes. Each schema is annotated against the type it serializes —
// drift between the two is a compile error, never a runtime surprise.

import { z } from "./deps.ts";
import type { zType } from "./deps.ts";
import type { OpCatalogEntry, OpProvenanceRecord } from "./types.ts";

const zOpExposure = z.object({
  ui: z.boolean(),
  ai: z.boolean(),
  headless: z.union([z.literal(true), z.object({ excluded: z.string() })]),
});

export const zOpCatalogEntry: zType.ZodType<OpCatalogEntry> = z.object({
  name: z.string(),
  kind: z.enum(["read", "write", "nav"]),
  title: z.string(),
  description: z.string(),
  auth: z.string(),
  exposure: zOpExposure,
  approval: z.boolean(),
  streaming: z.boolean(),
  redact: z.array(z.string()),
  scope: z.string().optional(),
  inputSchema: z.unknown(),
  outputSchema: z.unknown().optional(),
});

export const zOpProvenanceRecord: zType.ZodType<OpProvenanceRecord> = z.object({
  id: z.string(),
  at: z.string(),
  identityKey: z.string(),
  op: z.string(),
  kind: z.enum(["read", "write"]),
  surface: z.enum(["ui", "ai", "mcp"]),
  // Optional, deliberately: denied/invalid records carry no args (nothing
  // unvalidated is ever recorded), and JSON serialization drops the
  // undefined-valued key — a required `args` would break the advertised
  // schema on every wire that carries a denial.
  args: z.unknown().optional(),
  scope: z.string().optional(),
  outcome: z.union([
    z.literal("ok"),
    z.literal("proposed"),
    z.templateLiteral(["denied:", z.string()]),
    z.templateLiteral(["invalid:", z.string()]),
    z.templateLiteral(["failed:", z.string()]),
  ]),
  durationMs: z.number(),
});
