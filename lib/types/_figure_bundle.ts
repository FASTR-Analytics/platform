// =============================================================================
// FigureBundle — the captured, self-contained figure artifact
// =============================================================================
//
// A FigureBundle freezes everything `buildFigureInputs` needs: config, queried
// items, resultsValue projection, metadata, localization, and provenance. After
// P2 cutover, slides/dashboards/reports store this instead of FigureInputs.
//
// Phase 2 (current): stored schemas use this bundle shape; boot-time backfill
// converts old figureInputs/source rows; sentinel layer deleted.
//
// =============================================================================

import { z } from "zod";
import type { IndicatorMetadata } from "./indicators.ts";
import type { PeriodBounds } from "./presentation_objects.ts";
import type { ResultsValueForVisualization } from "./modules.ts";
import { presentationObjectConfigSchema } from "./_presentation_object_config.ts";
import { ALL_INSTANCE_FISCAL_YEARS } from "./instance.ts";

// ── Sub-schemas (matching existing lib types exactly) ────────────────────────
// Runtime locks: parse a Required<T> so a new field in the source type causes
// a compile error (Required forces the literal) and a parse failure here.

// P2: z.strictObject — stored shape; unknown keys in a stored sub-object would
// pass the skip-gate and be silently stripped on read (PROTOCOL_APP_MIGRATIONS
// skip-gate gotcha). Strict mode catches that drift at boot.
// geo.data stays z.unknown(): GeoJSON is an external stable spec, low drift risk.
export const periodBoundsSchema = z.strictObject({
  min: z.number(),
  max: z.number(),
});
const _pb: Required<PeriodBounds> = { min: 0, max: 0 };
periodBoundsSchema.parse(_pb);

export const indicatorMetadataSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  format_as: z.enum(["percent", "number", "rate_per_10k"]).optional(),
  threshold_direction: z.enum(["higher_is_better", "lower_is_better"])
    .optional(),
  threshold_green: z.number().optional(),
  threshold_yellow: z.number().optional(),
  group_label: z.string().optional(),
  sort_order: z.number().optional(),
});
const _im: Required<IndicatorMetadata> = {
  id: "",
  label: "",
  format_as: "number",
  threshold_direction: "higher_is_better",
  threshold_green: 0,
  threshold_yellow: 0,
  group_label: "",
  sort_order: 0,
};
indicatorMetadataSchema.parse(_im);

export const resultsValueForVisualizationSchema = z.strictObject({
  formatAs: z.enum(["percent", "number", "indicator"]),
  valueProps: z.array(z.string()),
  valueLabelReplacements: z.record(z.string(), z.string()).optional(),
});
const _rv: Required<ResultsValueForVisualization> = {
  formatAs: "number",
  valueProps: [],
  valueLabelReplacements: {},
};
resultsValueForVisualizationSchema.parse(_rv);

// Discriminated union: live editor passes level (derives GeoJSON from sync
// cache); stored bundles (dashboards/slides/reports) embed the full GeoJSON.
// family selects the registry's map; optional and additive — stored
// {kind:"level"} bundles without it default to hmis at resolution (same
// ruling as ResultsValue.datasetFamily absence), no force block needed.
export const geoRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("level"),
    level: z.number(),
    family: z.enum(["hmis", "hfa"]).optional(),
  }),
  z.object({ kind: z.literal("data"), data: z.unknown() }),
]);

// ── Localization (extracted so callers can type function params) ─────────────
// countryIso3 is required (use "" when the instance has no country set) so
// a stored bundle always carries a definite string — no silent omission.

export const figureLocalizationSchema = z.strictObject({
  language: z.enum(["en", "fr", "pt"]),
  calendar: z.enum(["gregorian", "ethiopian"]),
  countryIso3: z.string(),
  // Defaulted rather than required so bundles stored before this field existed
  // still validate — they predate FY entirely, so "none" is the correct
  // reading, not a guess.
  fiscalYear: z.enum(ALL_INSTANCE_FISCAL_YEARS).default("none"),
});

export type FigureLocalization = z.infer<typeof figureLocalizationSchema>;

// ── Item grid ────────────────────────────────────────────────────────────────
// One query-result row. A cell is whatever SQL returns for that column: text →
// string, period_id/count → number, missing aggregate → null. Mirrors panther's
// JsonArrayItem (undefined isn't representable in stored JSON). Renderers coerce
// at use (Number()/String()), so we store the natural value and validate its
// shape here rather than forcing string.
export const jsonArrayItemSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]),
);

export type JsonArrayItem = z.infer<typeof jsonArrayItemSchema>;

// ── Bundle schema ────────────────────────────────────────────────────────────

// `scope` and `provenance.runId` are the pair the bundle was RESOLVED under
// (PLAN_PRODUCTS_RESTRUCTURE D4). Both are required — a figure whose pair does
// not match its product's is STALE and offers an "Update to <package>" action;
// a bundle that could not say which pair it came from could not be judged. 080
// stamps them into every live and version-snapshot figure block, so a missing
// key is a fail-loud parse error, never something to default.
//
// The pair lives HERE and not in `config`: it is a data-plane fact, so it must
// stay out of the fetch hash (SYSTEM_09). `getRollupRowLabel` reads
// `bundle.scope`, never a global store — which is what makes an export label
// its roll-up row correctly outside any authoring shell.
export const figureBundleSchema = z.strictObject({
  config: presentationObjectConfigSchema,
  items: z.array(jsonArrayItemSchema),
  resultsValue: resultsValueForVisualizationSchema,
  indicatorMetadata: z.array(indicatorMetadataSchema),
  dateRange: periodBoundsSchema.optional(),
  geo: geoRefSchema.optional(),
  localization: figureLocalizationSchema,
  metricId: z.string(),
  scope: z.strictObject({
    adminArea2: z.string().nullable(),
  }),
  snapshotAt: z.string(),
  provenance: z.strictObject({
    runId: z.string(),
    moduleLastRun: z.string(),
    datasetsVersion: z.string(),
  }),
});

export type FigureBundle = z.infer<typeof figureBundleSchema>;

// ── Stored FigureBlock schema ─────────────────────────────────────────────────

export const figureBlockSchema = z.strictObject({
  type: z.literal("figure"),
  bundle: figureBundleSchema.optional(),
});

export type FigureBlock = z.infer<typeof figureBlockSchema>;
