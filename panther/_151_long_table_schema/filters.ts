// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Imports zod and nothing else, against the deps.ts rule, so that an app can
// copy this file into a repo that has no panther. schema.ts binds each schema
// to its hand-written type.
import { z } from "zod";

export const zPeriodUnit = z.enum(["period", "month", "quarter", "year"]);

export const zFullPeriodUnit = z.enum(["quarter", "year"]);

const zPeriodCount = z.int().min(1);

export const zPeriodFilter = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("range"),
    min: z.number(),
    max: z.number(),
  }),
  z.strictObject({ type: z.literal("from"), min: z.number() }),
  z.strictObject({
    type: z.literal("last"),
    n: zPeriodCount,
    unit: zPeriodUnit,
  }),
  z.strictObject({
    type: z.literal("lastFull"),
    n: zPeriodCount,
    unit: zFullPeriodUnit,
  }),
]);

export const zStringsOrNumbers = z.array(z.union([z.string(), z.number()]));

export const zLongTableFilter = z.strictObject({
  dim: z.string(),
  values: zStringsOrNumbers,
});
