# PLAN 6: Colocate legacy adapters via z.preprocess

Every stored-shape type gets one obvious file. That file contains: the `LegacyStoredX` types (per-level), the pure typed adapters (per-level), the strict Zod schema(s) for the current shape, and the public schema for stored reads formed by `z.preprocess(adapter, strictSchema)`. Preprocess bakes the adapter into the schema — every `.parse()` and `.safeParse()` automatically runs it. Callers can't skip it.

When a type changes, you edit one file: update `LegacyStoredX`, add a transform to the adapter, update the strict schema. When a drift variant is discovered, same file. When auditing legacy for a domain, same file.

DB-dependent legacy resolutions (functions that need a `Sql` connection) stay server-side next to their caller.

This plan is **fully mechanical**. Every file edit is spelled out with exact content. No judgment calls at implementation time. Execute in order.

---

## CF refactor — state this plan assumes

This plan was authored against the state of [lib/types/conditional_formatting.ts](lib/types/conditional_formatting.ts) on 2026-04-19, where `ConditionalFormatting` is stored **flat** on `config.s` as individual `cf*` fields (`cfMode`, `cfScalePaletteKind`, `cfScalePalettePreset`, `cfScaleCustomFrom/Mid/To`, `cfScaleReverse`, `cfScaleSteps`, `cfScaleDomainKind`, `cfScaleDomainMin/Max`, `cfScaleNoDataColor`, `cfThresholdCutoffs`, `cfThresholdBuckets`, `cfThresholdNoDataColor`).

**Implications:**

1. `configS` (used by viz presets) and `presentationObjectConfigSSchema` (used by PO configs) no longer have a `conditionalFormatting` field. Both merge in `cfStorageSchema` via `.merge(cfStorageSchema)` to get the cf* fields at top level on `s`.
2. The adapter at the s-level (`adaptLegacyStoredConfigS`) must **produce flat cf\* fields**, not a nested `ConditionalFormatting` object. It projects any legacy CF shape through `flattenCf` and spreads the result. `CF_STORAGE_DEFAULTS` fills rows that never had CF at all.
3. `LEGACY_CF_PRESETS` and the map-field migration are still required — they detect legacy nested CF and produce a `ConditionalFormatting` union that's then flattened.
4. `flattenCf`, `CF_STORAGE_DEFAULTS`, `cfStorageSchema`, and the `ConditionalFormatting` types are all exported from `lib/types/conditional_formatting.ts` as of that date.

**If the CF refactor lands again before this plan is executed**, re-verify the exports of `conditional_formatting.ts` and update the imports and merge target names in Step 1 / Step 2 accordingly.

---

## Principle

1. **Schemas describe current shape only.** Strict. No `.default()`, `.optional()`-for-drift, `.nullish()` in schemas. Legacy tolerance lives in adapters.
2. **Adapters are pure, typed, idempotent.** Signature `adaptLegacyStoredX(raw: LegacyStoredX): Record<string, unknown>`. Running twice on the same input produces the same output. No network, no DB, no mutation of external state.
3. **Baked in via `z.preprocess`** at the **stored entry points** (the schemas that are `.parse`d at DB-read sites). Callers can't bypass.
4. **Fetch schemas stay strict-all-the-way-down.** Preprocess never leaks into the fetch tree. Authored `definition.json` files must match the current shape exactly — no silent normalization.
5. **Shared structure between fetch and stored** only where the content is structurally identical. Where fetch and stored diverge (translated string labels, install-time enrichments), declare both sides explicitly.
6. **One permissive-read helper per permissive-read domain.** Currently only PO config (per PLAN_5 item D). Implements `safeParse → warn → fallback`. Colocated with the schema.
7. **DB-dependent adapters** stay server-side next to their caller, never in `lib/types/`.

---

## Architecture — layered schemas

The schema tree is split into layers with explicit sharing rules. This is the core of the plan — everything else flows from it.

### Layer 1 — Shared primitives

Single declaration, used everywhere. No preprocess, no variants.

```
translatableString, scriptGenerationType, dataSource (+ variants),
moduleParameter (+ variants), moduleParameterInput, configRequirements,
valueFunc, periodOption, disaggregationOption, postAggregationExpression,
presentationOption, disaggregationDisplayOption,
relativePeriodFilter, boundedPeriodFilter, periodFilterStrict
```

### Layer 2 — Shared content strict schemas

Used by **both** fetch and stored. Strict. No preprocess. These capture the *content* shape that's structurally identical on both sides of the install-flow boundary (viz presets, AI descriptions, text configs, configD, configS).

```
configDStrict, configS, vizPresetTextConfigStrict,
metricAIDescriptionStrict, vizPresetStrict
```

Critically: `vizPresetStrict.config.d` is `configDStrict` (not preprocessed). `vizPresetStrict.config.t` is `vizPresetTextConfigStrict` (not preprocessed). All references in Layer 2 are to Layer 1 or Layer 2 strict — **never to Layer 5 preprocessed**.

### Layer 3 — Fetch-specific strict schemas

Used only at GitHub fetch time. Strict-all-the-way-down. No preprocess anywhere. Composed from Layers 1 and 2.

```
resultsObjectDefinition (no moduleId — fetch shape)
metricDefinitionJSON (uses translatableString labels, metricAIDescriptionStrict,
                      vizPresetStrict — all strict)
ModuleDefinitionJSONSchema (uses metricDefinitionJSON, resultsObjectDefinition)
```

Fetch callers (`load_module.ts:123`) use `ModuleDefinitionJSONSchema.safeParse`. Strict validation — authors get errors for any legacy or incomplete shape.

### Layer 4 — Stored-specific strict schemas

Used only for stored-side parses. Strict composition, but references Layer 5 preprocessed children where drift can occur at that child's level. This lets drift handling stay at its natural level.

```
resultsObjectDefinitionStoredStrict (adds moduleId)
metricDefinitionStoredStrict (plain-string labels, install-strippable fields
                              optional; references metricAIDescriptionStored
                              and vizPresetStored — the Layer 5 preprocessed
                              forms — so child-level drift is handled at
                              child level)
defaultPresentationObjectStoredStrict (config is z.unknown())
moduleDefinitionStoredStrict (install-added fields; uses
                              resultsObjectDefinitionStoredStrict,
                              metricDefinitionStoredStrict,
                              defaultPresentationObjectStoredStrict)
```

### Layer 5 — Stored entry points (preprocess + adapter)

Each = `z.preprocess(adapterForThisLevel, strictInnerFromLayer2Or4)`. These are the only schemas with `z.preprocess`. They are the four standalone DB-read entry points:

```
metricAIDescriptionStored = z.preprocess(adaptLegacyStoredMetricAIDescription,
                                          metricAIDescriptionStrict)
vizPresetStored            = z.preprocess(adaptLegacyStoredVizPreset,
                                          vizPresetStrict)
moduleDefinitionStoredSchema = z.preprocess(adaptLegacyStoredModuleDefinition,
                                             moduleDefinitionStoredStrict)
presentationObjectConfigSchema = z.preprocess(adaptLegacyStoredPresentationObjectConfig,
                                               presentationObjectConfigStrictSchema)
```

### Layer 6 — Convenience and permissive helpers

```
parseStoredModuleDefinition(raw: string): ModuleDefinition
parseStoredPresentationObjectConfig(raw: unknown): PresentationObjectConfig
                                                  (permissive; safeParse + warn + fallback)
```

### Why this layering

**Why share Layer 2 between fetch and stored:** `metricAIDescription`, `vizPreset`, `vizPresetTextConfig`, `configD`, `configS` have *structurally identical content* at both boundaries. The install flow (`load_module.ts:translateMetrics`) passes these through unchanged — `m.aiDescription` and `m.vizPresets` are written to DB without modification. Duplicating them as fetch-vs-stored variants would be pure duplication; drift between the two versions would be inevitable.

**Why NOT share metric/module/resultsObject outer schemas:** these DO differ. Install resolves `translatableString → string` for metric `label`/`variantLabel`/`importantNotes`, strips nulls to undefined on install-strippable fields, adds runtime fields (`id`, `lastScriptUpdate`, `script`, `defaultPresentationObjects`, `moduleId` on resultsObjects). Fetch and stored schemas must capture these different shapes.

**Why preprocess only at the four entry points:** these are the only schemas that are `.parse`d standalone from stored data:
- `metricAIDescriptionStored` at `metric_enricher.ts:54` (standalone ai_description column parse)
- `vizPresetStored` via `z.array(vizPresetStored).parse(...)` at `modules.ts:939` (standalone viz_presets column parse)
- `moduleDefinitionStoredSchema` at the 10 item-C sites (full module blob parse)
- `presentationObjectConfigSchema` at PO config read sites

Every other schema is a child of one of these, so drift at nested levels is handled by the appropriate entry point's adapter OR by a nested Layer 5 schema that's embedded.

**Why Layer 4 `metricDefinitionStoredStrict` references Layer 5 preprocessed children (not Layer 4 strict):** drift in `aiDescription` (missing caveats/importantNotes/relatedMetrics) and drift in `vizPresets[]` (many) both need handling. Rather than the module-level adapter reaching deep into metric→vizPresets→config, each level's adapter handles its own level. At module-level parse, the module adapter fills top-level defaults, then per-element metric validation runs — which triggers the per-child `metricAIDescriptionStored` preprocess (for aiDescription) and `vizPresetStored` preprocess (for each preset). Each adapter small, focused, composable.

**Why fetch schemas never reference Layer 5:** preprocess on Layer 5 normalizes legacy shapes. Fetch should reject them, not fix them silently. The fetch tree (Layer 3) references Layer 2 strict content schemas and Layer 1 primitives only.

### Adapter composition

Adapters are per-level and pure. Each handles its own level's drift. Parents that need their nested shape normalized before strict validation call child adapters explicitly. Helper adapters (for sub-shapes that aren't standalone entry points) are exported so they can be reused.

Per-level adapters defined in `lib/types/module_definition.ts`:

- `adaptLegacyStoredPeriodFilter(raw)` — filter-type migrations, strip fabricated bounds
- `adaptLegacyStoredConfigD(raw)` — periodOpt rename, nested periodFilter adaptation
- `adaptLegacyStoredConfigS(raw, isMap)` — detects legacy nested `conditionalFormatting` (as string preset or object union) and legacy map color fields; flattens any found CF through `flattenCf` into flat `cf*` fields on `s`; fills missing cf* fields from `CF_STORAGE_DEFAULTS`; fills `specialDisruptionsChart` from legacy `diffAreas` (Pattern 3); strips legacy fields (nested conditionalFormatting, all map* fields)
- `adaptLegacyStoredVizPresetTextConfig(raw)` — fill missing nullable fields
- `adaptLegacyStoredMetricAIDescription(raw)` — fill missing nullable fields; fill relatedMetrics default
- `adaptLegacyStoredVizPreset(raw)` — drop side-channel, fill missing required fields, then walk into config.d/s/t applying their adapters (isMap derived from d.type)
- `adaptLegacyStoredMetricDefinition(raw)` — no current drift (strict schema allows install-strip optionality); placeholder for future transforms
- `adaptLegacyStoredResultsObjectDefinition(raw)` — no current drift; placeholder
- `adaptLegacyStoredDefaultPresentationObject(raw)` — no current drift; placeholder
- `adaptLegacyStoredModuleDefinition(raw)` — fill top-level defaults; does **not** recurse into `metrics[]` or `defaultPresentationObjects[]` because child preprocesses handle those

Per-level adapter defined in `lib/types/presentation_object_config.ts`:

- `adaptLegacyStoredPresentationObjectConfig(raw)` — walks `d` / `s`, calls `adaptLegacyStoredConfigD` and `adaptLegacyStoredConfigS` (with isMap derived from `d.type`) from `module_definition.ts`

---

## Terminology

- **Strict schema** — `z.object({...})` with no drift tolerance. `*Strict` suffix. No preprocess wrapper.
- **Preprocessed schema** — `z.preprocess(adapter, strictSchema)`. The exported name (no suffix) at the four entry points.
- **Legacy type** — `Record<string, unknown>` (generic) or a more specific shape when known (e.g., existing `LegacyReportItemConfig`).
- **Pure adapter** — `(raw: LegacyStoredX) → Record<string, unknown>`. Zod strict validation on the returned shape catches any drift the adapter missed.
- **Convenience helper** — `parseStoredX(raw: string): X`. `JSON.parse` + `schema.parse` + cast for branded types.
- **Permissive-read helper** — `parseStoredX(raw: unknown): X`. `safeParse` + warn + fallback. Only for domains where a parse failure must not throw (PO config per PLAN_5 item D).

---

## Inventory: current → target

| Current location | Target location | Action |
|---|---|---|
| `server/legacy_adapters/period_filter.ts` → `adaptLegacyPeriodFilter` | `lib/types/module_definition.ts` inline, renamed `adaptLegacyStoredPeriodFilter` | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyConfigD` | `lib/types/module_definition.ts` inline, renamed `adaptLegacyStoredConfigD` | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyConfigS`, `buildCfFromLegacyMapFields`, `isLegacyCfPresetId`, `isConditionalFormattingObject`, `MAP_COLOR_PRESET_STOPS`, `MAP_NO_DATA_COLOR` | `lib/types/module_definition.ts` inline; public function renamed `adaptLegacyStoredConfigS` | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyPresentationObjectConfig` | `lib/types/presentation_object_config.ts` inline, renamed `adaptLegacyStoredPresentationObjectConfig` | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyVizPresets` | DELETED — per-element `vizPresetStored` preprocess subsumes it | DELETE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyPODetailResponse` | `server/routes/project/presentation_objects.ts` — inline at call site using the new permissive helper | INLINE |
| `server/legacy_adapters/report_item.ts` → `adaptLegacyReportItemConfigShape` + `LegacyReportItemConfig` + private `walkLayoutTree` | `lib/types/reports.ts` inline | MOVE |
| `server/legacy_adapters/report_item.ts` → `resolveLegacyReportMetricIds` + private `walkLayoutTreeAsync` | `server/db/project/reports.ts` inline | MOVE (stays server-side, DB-dependent) |
| `server/legacy_adapters/module_definition.ts` → `adaptLegacyModuleDefinition` | DELETED — preprocess on `moduleDefinitionStoredSchema` subsumes it | DELETE |
| `server/legacy_adapters/mod.ts` | DELETED | DELETE |
| Schema-level `.default()` / `.optional()` drift tolerance in `moduleDefinitionStoredSchema`, `metricDefinitionStoredSchema`, `metricAIDescriptionStored`, `vizPresetStored`, `vizPresetTextConfigStored` | REMOVED — drift tolerance moves into typed adapters | REWRITE |
| `parseModuleDefinition(raw: unknown)` helper | RENAMED to `parseStoredModuleDefinition(raw: string)` | RENAME |

---

## Execution order

Sequential. Each step self-contained within its domain. Step 5 (call-site updates) pairs with Steps 1–4 — land together or the tree breaks.

1. Step 1 — Rewrite `lib/types/module_definition.ts`.
2. Step 2 — Rewrite `lib/types/presentation_object_config.ts`.
3. Step 3 — Append legacy-adapter section to `lib/types/reports.ts`.
4. Step 4 — Move `resolveLegacyReportMetricIds` into `server/db/project/reports.ts`.
5. Step 5 — Update every call site (sub-steps below).
6. Step 6 — Delete `server/legacy_adapters/`.
7. Step 7 — Update `DOC_legacy_handling.md`.
8. Step 8 — Verify.

---

## Step 1 — Rewrite `lib/types/module_definition.ts`

### 1.1 Layer mapping for this file

| Layer | Items in this file |
|---|---|
| 1 (primitives) | translatableString, scriptGenerationType, dataSource (+ variants), moduleParameter (+ variants), moduleParameterInput, configRequirements, valueFunc, periodOption, disaggregationOption, postAggregationExpression, presentationOption, disaggregationDisplayOption, relativePeriodFilter, boundedPeriodFilter, periodFilterStrict |
| 2 (shared content) | configDStrict, configS, vizPresetTextConfigStrict, metricAIDescriptionStrict, vizPresetStrict |
| 3 (fetch) | resultsObjectDefinition, metricDefinitionJSON, ModuleDefinitionJSONSchema |
| 4 (stored strict) | resultsObjectDefinitionStoredStrict, metricDefinitionStoredStrict, defaultPresentationObjectStoredStrict, moduleDefinitionStoredStrict |
| 5 (stored preprocessed) | metricAIDescriptionStored, vizPresetStored, moduleDefinitionStoredSchema (note: PO config Layer 5 is in presentation_object_config.ts) |
| 6 (helpers) | parseStoredModuleDefinition |
| adapters | adaptLegacyStoredPeriodFilter, adaptLegacyStoredConfigD, adaptLegacyStoredConfigS, adaptLegacyStoredVizPresetTextConfig, adaptLegacyStoredMetricAIDescription, adaptLegacyStoredVizPreset, adaptLegacyStoredMetricDefinition, adaptLegacyStoredResultsObjectDefinition, adaptLegacyStoredDefaultPresentationObject, adaptLegacyStoredModuleDefinition |

### 1.2 Final file content

Replace the entire contents of `lib/types/module_definition.ts` with the following.

```ts
import { z } from "zod";
import { t3 } from "../translate/mod.ts";
import type { TranslatableString } from "../translate/types.ts";
import {
  cfStorageSchema,
  flattenCf,
  CF_STORAGE_DEFAULTS,
  type ConditionalFormatting,
  type ConditionalFormattingScale,
} from "./conditional_formatting.ts";
import {
  LEGACY_CF_PRESETS,
  type LegacyCfPresetId,
} from "../legacy_cf_presets.ts";
import type { ModuleId } from "./module_registry.ts";
import type { PresentationObjectConfig } from "./presentation_object_config.ts";
import {
  ALL_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
  type PresentationOption,
} from "./presentation_objects.ts";

export type { ModuleId };

// ============================================================================
// LAYER 1 — Shared primitives (used by fetch and stored trees)
// ============================================================================

export const translatableString = z.object({
  en: z.string(),
  fr: z.string(),
});

export const scriptGenerationType = z.enum(["template", "hfa"]);

export const dataSourceDataset = z.object({
  sourceType: z.literal("dataset"),
  replacementString: z.string(),
  datasetType: z.enum(["hmis", "hfa"]),
});

export const dataSourceResultsObject = z.object({
  sourceType: z.literal("results_object"),
  replacementString: z.string(),
  resultsObjectId: z.string(),
  moduleId: z.string(),
});

export const dataSource = z.discriminatedUnion("sourceType", [
  dataSourceDataset,
  dataSourceResultsObject,
]);

export const moduleParameterInput = z.discriminatedUnion("inputType", [
  z.object({ inputType: z.literal("number"), defaultValue: z.string() }),
  z.object({ inputType: z.literal("text"), defaultValue: z.string() }),
  z.object({
    inputType: z.literal("boolean"),
    defaultValue: z.enum(["TRUE", "FALSE"]),
  }),
  z.object({
    inputType: z.literal("select"),
    valueType: z.enum(["string", "number"]),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    defaultValue: z.string(),
  }),
]);

export const moduleParameter = z.object({
  replacementString: z.string(),
  description: z.string(),
  input: moduleParameterInput,
});

export const configRequirements = z.object({
  parameters: z.array(moduleParameter),
});

export const valueFunc = z.enum(["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"]);
export const periodOption = z.enum(["period_id", "quarter_id", "year"]);
export const disaggregationOption = z.enum(ALL_DISAGGREGATION_OPTIONS);

export const postAggregationExpression = z.object({
  ingredientValues: z.array(
    z.object({
      prop: z.string(),
      func: z.enum(["SUM", "AVG"]),
    }),
  ),
  expression: z.string(),
});

const presentationOption = z.enum(["timeseries", "table", "chart", "map"]);
const disaggregationDisplayOption = z.enum([
  "row",
  "rowGroup",
  "col",
  "colGroup",
  "series",
  "cell",
  "indicator",
  "replicant",
  "mapArea",
]);

const relativePeriodFilter = z.object({
  filterType: z.enum([
    "last_n_months",
    "last_calendar_year",
    "last_calendar_quarter",
    "last_n_calendar_years",
    "last_n_calendar_quarters",
  ]),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

const boundedPeriodFilter = z.object({
  filterType: z.enum(["custom", "from_month"]),
  periodOption: periodOption,
  min: z.number(),
  max: z.number(),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

export const periodFilterStrict = z
  .discriminatedUnion("filterType", [relativePeriodFilter, boundedPeriodFilter])
  .optional();

// ============================================================================
// Adapters — pure, typed, per-level. Used by Layer 5 preprocesses and by
// sibling adapters (e.g. adaptLegacyStoredVizPreset calls the config-level
// adapters). Exported so they can be reused by presentation_object_config.ts
// and any future siblings.
// ============================================================================

// ── periodFilter ────────────────────────────────────────────────────
const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

export function adaptLegacyStoredPeriodFilter(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const pf = { ...raw };
  if (pf.filterType === "last_12_months") {
    pf.filterType = "last_n_months";
    pf.nMonths = 12;
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
    return pf;
  }
  if (pf.filterType === undefined) {
    pf.filterType = "custom";
  }
  if (
    typeof pf.filterType === "string" &&
    RELATIVE_FILTER_TYPES.has(pf.filterType)
  ) {
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
  }
  return pf;
}

// ── configD ─────────────────────────────────────────────────────────
export function adaptLegacyStoredConfigD(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if ("periodOpt" in out) {
    if (!("timeseriesGrouping" in out)) {
      out.timeseriesGrouping = out.periodOpt;
    }
    delete out.periodOpt;
  }
  if (out.periodFilter && typeof out.periodFilter === "object" && !Array.isArray(out.periodFilter)) {
    out.periodFilter = adaptLegacyStoredPeriodFilter(
      out.periodFilter as Record<string, unknown>,
    );
  }
  return out;
}

// ── configS (needs isMap context from parent d.type) ───────────────
const MAP_COLOR_PRESET_STOPS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

const MAP_NO_DATA_COLOR = "#f0f0f0";

function buildCfFromLegacyMapFields(
  s: Record<string, unknown>,
): ConditionalFormattingScale | undefined {
  const preset = (s.mapColorPreset as string | undefined) ?? "red-green";
  const reverse = Boolean(s.mapColorReverse);
  const [rawFrom, rawTo] =
    preset === "custom"
      ? [
          (s.mapColorFrom as string | undefined) ?? "#fee0d2",
          (s.mapColorTo as string | undefined) ?? "#de2d26",
        ]
      : MAP_COLOR_PRESET_STOPS[preset] ?? MAP_COLOR_PRESET_STOPS["red-green"];
  const [from, to] = reverse ? [rawTo, rawFrom] : [rawFrom, rawTo];

  const scaleType = (s.mapScaleType as string | undefined) ?? "continuous";
  const steps =
    scaleType === "discrete"
      ? (s.mapDiscreteSteps as number | undefined) ?? 5
      : undefined;

  const domainType = (s.mapDomainType as string | undefined) ?? "auto";
  const domain: ConditionalFormattingScale["domain"] =
    domainType === "fixed"
      ? {
          kind: "fixed",
          min: (s.mapDomainMin as number | undefined) ?? 0,
          max: (s.mapDomainMax as number | undefined) ?? 1,
        }
      : { kind: "auto" };

  return {
    type: "scale",
    scale: { min: from, max: to },
    steps,
    domain,
    noDataColor: MAP_NO_DATA_COLOR,
  };
}

function isLegacyCfPresetId(v: unknown): v is LegacyCfPresetId {
  return typeof v === "string" && v in LEGACY_CF_PRESETS;
}

function isConditionalFormattingObject(v: unknown): v is ConditionalFormatting {
  if (v === null || typeof v !== "object") return false;
  const type = (v as { type?: unknown }).type;
  return type === "none" || type === "scale" || type === "thresholds";
}

export function adaptLegacyStoredConfigS(
  raw: Record<string, unknown>,
  isMap: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  // Capture any legacy-shape CF as a ConditionalFormatting union.
  let legacyCf: ConditionalFormatting | undefined;

  // (1) Legacy nested `conditionalFormatting` (removed in the flat-storage
  // refactor). Was either a string preset id or a union object.
  if ("conditionalFormatting" in out) {
    const cfRaw = out.conditionalFormatting;
    if (isConditionalFormattingObject(cfRaw)) {
      legacyCf = cfRaw;
    } else if (isLegacyCfPresetId(cfRaw)) {
      legacyCf = LEGACY_CF_PRESETS[cfRaw].value;
    }
    // Nested field has no home in the current shape — strip unconditionally.
    delete out.conditionalFormatting;
  }

  // (2) Legacy map color fields (only on map visualizations, and only if we
  // didn't already capture a non-none CF above).
  if (
    isMap &&
    (!legacyCf || legacyCf.type === "none") &&
    ("mapColorPreset" in out ||
      "mapColorFrom" in out ||
      "mapColorTo" in out ||
      "mapColorReverse" in out ||
      "mapScaleType" in out ||
      "mapDiscreteSteps" in out ||
      "mapDomainType" in out ||
      "mapDomainMin" in out ||
      "mapDomainMax" in out)
  ) {
    const scaleCf = buildCfFromLegacyMapFields(out);
    if (scaleCf) legacyCf = scaleCf;
  }

  // Strip legacy map color fields regardless (no home in current schema).
  delete out.mapColorPreset;
  delete out.mapColorFrom;
  delete out.mapColorTo;
  delete out.mapColorReverse;
  delete out.mapScaleType;
  delete out.mapDiscreteSteps;
  delete out.mapDomainType;
  delete out.mapDomainMin;
  delete out.mapDomainMax;

  // (3) Fill flat cf* fields from captured legacy CF (flattened) or from
  // CF_STORAGE_DEFAULTS when the row had no CF at all. Do NOT overwrite
  // fields already present on `out` — new-shape rows with cf* fields already
  // set must win over defaults/legacy projections.
  const flatSource = legacyCf ? flattenCf(legacyCf) : CF_STORAGE_DEFAULTS;
  for (const [key, value] of Object.entries(flatSource)) {
    if (!(key in out)) out[key] = value;
  }

  // (4) Pattern 3 migration: diffAreas → specialDisruptionsChart. Fill
  // specialDisruptionsChart from legacy diffAreas when missing. Keep diffAreas
  // in place because Pattern 3 dual-check sites still read it
  // (get_style_from_po.ts, _shared.tsx, _timeseries.tsx per
  // DOC_legacy_handling.md).
  if (!("specialDisruptionsChart" in out)) {
    out.specialDisruptionsChart = out.diffAreas === true;
  }

  return out;
}

// ── vizPresetTextConfig ─────────────────────────────────────────────
export function adaptLegacyStoredVizPresetTextConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (!("caption" in out)) out.caption = null;
  if (!("captionRelFontSize" in out)) out.captionRelFontSize = null;
  if (!("subCaption" in out)) out.subCaption = null;
  if (!("subCaptionRelFontSize" in out)) out.subCaptionRelFontSize = null;
  if (!("footnote" in out)) out.footnote = null;
  if (!("footnoteRelFontSize" in out)) out.footnoteRelFontSize = null;
  return out;
}

// ── metricAIDescription ─────────────────────────────────────────────
export function adaptLegacyStoredMetricAIDescription(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (!("caveats" in out)) out.caveats = null;
  if (!("importantNotes" in out)) out.importantNotes = null;
  if (!("relatedMetrics" in out)) out.relatedMetrics = [];
  return out;
}

// ── vizPreset ───────────────────────────────────────────────────────
// Walks into config.d / config.s / config.t — those sub-schemas are strict
// (Layer 2), so drift must be handled here.
export function adaptLegacyStoredVizPreset(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  delete out.defaultPeriodFilterForDefaultVisualizations;

  if (!("importantNotes" in out)) out.importantNotes = null;
  if (!("createDefaultVisualizationOnInstall" in out)) {
    out.createDefaultVisualizationOnInstall = null;
  }
  if (!("needsReplicant" in out)) out.needsReplicant = false;
  if (!("allowedFilters" in out)) out.allowedFilters = [];

  if (out.config && typeof out.config === "object" && !Array.isArray(out.config)) {
    const cfg = { ...(out.config as Record<string, unknown>) };
    let isMap = false;
    if (cfg.d && typeof cfg.d === "object" && !Array.isArray(cfg.d)) {
      const d = adaptLegacyStoredConfigD(cfg.d as Record<string, unknown>);
      isMap = (d as Record<string, unknown>).type === "map";
      cfg.d = d;
    } else {
      cfg.d = {};
    }
    if (cfg.s && typeof cfg.s === "object" && !Array.isArray(cfg.s)) {
      cfg.s = adaptLegacyStoredConfigS(cfg.s as Record<string, unknown>, isMap);
    } else {
      cfg.s = {};
    }
    if (cfg.t && typeof cfg.t === "object" && !Array.isArray(cfg.t)) {
      cfg.t = adaptLegacyStoredVizPresetTextConfig(
        cfg.t as Record<string, unknown>,
      );
    } else {
      cfg.t = adaptLegacyStoredVizPresetTextConfig({});
    }
    out.config = cfg;
  } else {
    out.config = {
      d: {},
      s: {},
      t: adaptLegacyStoredVizPresetTextConfig({}),
    };
  }

  return out;
}

// ── metricDefinition (stored-side; no current drift at this level) ─
export function adaptLegacyStoredMetricDefinition(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  // No current drift. Identity for uniformity and future-proofing. Nested
  // aiDescription and vizPresets[] are handled by their own Layer 5
  // preprocesses during strict validation.
  return { ...raw };
}

// ── resultsObjectDefinition (stored-side) ───────────────────────────
export function adaptLegacyStoredResultsObjectDefinition(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return { ...raw };
}

// ── defaultPresentationObject (stored-side) ─────────────────────────
export function adaptLegacyStoredDefaultPresentationObject(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return { ...raw };
}

// ── moduleDefinition (top-level; fills top-level defaults only) ────
export function adaptLegacyStoredModuleDefinition(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (!("prerequisites" in out)) out.prerequisites = [];
  if (!("lastScriptUpdate" in out)) out.lastScriptUpdate = "";
  if (!("dataSources" in out)) out.dataSources = [];
  if (!("scriptGenerationType" in out)) out.scriptGenerationType = "template";
  if (!("configRequirements" in out))
    out.configRequirements = { parameters: [] };
  if (!("script" in out)) out.script = "";
  if (!("assetsToImport" in out)) out.assetsToImport = [];
  if (!("resultsObjects" in out)) out.resultsObjects = [];
  if (!("metrics" in out)) out.metrics = [];
  if (!("defaultPresentationObjects" in out))
    out.defaultPresentationObjects = [];
  return out;
}

// ============================================================================
// LAYER 2 — Shared content strict schemas (used by BOTH fetch and stored)
// No preprocess. References Layer 1 primitives and other Layer 2 strict.
// ============================================================================

export const configDStrict = z
  .object({
    type: presentationOption,
    timeseriesGrouping: periodOption.optional(),
    valuesDisDisplayOpt: disaggregationDisplayOption,
    valuesFilter: z.array(z.string()).optional(),
    disaggregateBy: z.array(
      z.object({
        disOpt: disaggregationOption,
        disDisplayOpt: disaggregationDisplayOption,
      }),
    ),
    filterBy: z.array(
      z.object({
        disOpt: disaggregationOption,
        values: z.array(z.string()).min(1),
      }),
    ),
    periodFilter: periodFilterStrict,
    selectedReplicantValue: z.string().optional(),
    includeNationalForAdminArea2: z.boolean().optional(),
    includeNationalPosition: z.enum(["bottom", "top"]).optional(),
  })
  .refine(
    (d) => {
      const slots = d.disaggregateBy
        .map((x) => x.disDisplayOpt)
        .filter((opt) => opt !== "replicant");
      return new Set(slots).size === slots.length;
    },
    { message: "disaggregateBy contains duplicate non-replicant disDisplayOpt entries" },
  )
  .refine(
    (d) => d.disaggregateBy.filter((x) => x.disDisplayOpt === "replicant").length <= 1,
    { message: "Multi-replicant not yet implemented — at most one replicant allowed" },
  )
  .refine(
    (d) => new Set(d.disaggregateBy.map((x) => x.disOpt)).size === d.disaggregateBy.length,
    { message: "disaggregateBy contains duplicate disOpt entries" },
  );

// configS used by viz presets: every field optional via .partial(). CF is
// merged in as flat cf* fields from cfStorageSchema (no nested
// `conditionalFormatting` field — see the CF refactor note near the top of
// this plan).
export const configS = z
  .object({
    scale: z.number(),
    content: z.enum(["lines", "bars", "points", "areas"]),
    allowIndividualRowLimits: z.boolean(),
    colorScale: z.enum([
      "pastel-discrete",
      "alt-discrete",
      "red-green",
      "blue-green",
      "single-grey",
      "custom",
    ]),
    decimalPlaces: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    hideLegend: z.boolean(),
    showDataLabels: z.boolean(),
    showDataLabelsLineCharts: z.boolean(),
    barsStacked: z.boolean(),
    diffAreas: z.boolean(),
    diffAreasOrder: z.enum(["actual-expected", "expected-actual"]),
    diffInverted: z.boolean(),
    specialBarChart: z.boolean(),
    specialBarChartInverted: z.boolean(),
    specialBarChartDiffThreshold: z.number(),
    specialBarChartDataLabels: z.enum(["all-values", "threshold-values"]),
    specialCoverageChart: z.boolean(),
    specialDisruptionsChart: z.boolean(),
    specialScorecardTable: z.boolean(),
    verticalTickLabels: z.boolean(),
    horizontal: z.boolean().optional(),
    allowVerticalColHeaders: z.boolean(),
    forceYMax1: z.boolean(),
    forceYMinAuto: z.boolean(),
    customSeriesStyles: z.array(
      z.object({
        color: z.string(),
        strokeWidth: z.number(),
        lineStyle: z.enum(["solid", "dashed"]),
      }),
    ),
    nColsInCellDisplay: z.union([z.literal("auto"), z.number()]),
    seriesColorFuncPropToUse: z
      .enum(["series", "cell", "col", "row"])
      .optional(),
    sortIndicatorValues: z.enum(["ascending", "descending", "none"]),
    formatAdminArea3Labels: z.boolean().optional(),
    mapProjection: z.enum(["equirectangular", "mercator", "naturalEarth1"]),
  })
  .merge(cfStorageSchema)
  .partial();

export const vizPresetTextConfigStrict = z.object({
  caption: translatableString.nullable(),
  captionRelFontSize: z.number().nullable(),
  subCaption: translatableString.nullable(),
  subCaptionRelFontSize: z.number().nullable(),
  footnote: translatableString.nullable(),
  footnoteRelFontSize: z.number().nullable(),
});

export const metricAIDescriptionStrict = z.object({
  summary: translatableString,
  methodology: translatableString,
  interpretation: translatableString,
  typicalRange: translatableString,
  caveats: translatableString.nullable(),
  useCases: z.array(translatableString),
  relatedMetrics: z.array(z.string()),
  disaggregationGuidance: translatableString,
  importantNotes: translatableString.nullable(),
});

export const vizPresetStrict = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.nullable(),
  needsReplicant: z.boolean(),
  allowedFilters: z.array(disaggregationOption),
  createDefaultVisualizationOnInstall: z.string().nullable(),
  config: z.object({
    d: configDStrict,
    s: configS,
    t: vizPresetTextConfigStrict,
  }),
});

// ============================================================================
// LAYER 3 — Fetch-only strict schemas. Strict-all-the-way-down. Composed from
// Layer 1 and Layer 2. NO preprocess anywhere in this tree.
// ============================================================================

export const resultsObjectDefinition = z.object({
  id: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.record(z.string(), z.string()),
});

export const metricDefinitionJSON = z.object({
  id: z.string(),
  label: translatableString,
  variantLabel: translatableString.nullable(),
  valueProps: z.array(z.string()),
  valueFunc: valueFunc,
  formatAs: z.enum(["percent", "number"]),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()),
  postAggregationExpression: postAggregationExpression.nullable(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescriptionStrict.nullable(),
  importantNotes: translatableString.nullable(),
  vizPresets: z.array(vizPresetStrict),
  hide: z.boolean(),
});

export const ModuleDefinitionJSONSchema = z
  .object({
    label: translatableString,
    prerequisites: z.array(z.string()),
    scriptGenerationType: scriptGenerationType,
    dataSources: z.array(dataSource),
    configRequirements: configRequirements,
    assetsToImport: z.array(z.string()),
    resultsObjects: z.array(resultsObjectDefinition),
    metrics: z.array(metricDefinitionJSON),
  })
  .superRefine((def, ctx) => {
    const resultsObjectIds = new Set(def.resultsObjects.map((ro) => ro.id));
    const metricIds = new Set<string>();
    for (const metric of def.metrics) {
      if (metricIds.has(metric.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate metric ID: "${metric.id}"`,
          path: ["metrics"],
        });
      }
      metricIds.add(metric.id);
      if (!resultsObjectIds.has(metric.resultsObjectId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Metric "${metric.id}" references unknown resultsObjectId "${metric.resultsObjectId}"`,
          path: ["metrics"],
        });
      }
    }
    const roIds = new Set<string>();
    for (const ro of def.resultsObjects) {
      if (roIds.has(ro.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate results object ID: "${ro.id}"`,
          path: ["resultsObjects"],
        });
      }
      roIds.add(ro.id);
    }
    const metricsByLabel = new Map<string, typeof def.metrics>();
    for (const metric of def.metrics) {
      const labelKey = metric.label.en;
      const existing = metricsByLabel.get(labelKey) ?? [];
      existing.push(metric);
      metricsByLabel.set(labelKey, existing);
    }
    for (const [label, metricsWithLabel] of metricsByLabel.entries()) {
      if (metricsWithLabel.length > 1) {
        const missingVariant = metricsWithLabel.filter((m) => !m.variantLabel);
        if (missingVariant.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Metrics with label "${label}" have ${metricsWithLabel.length} entries but ${missingVariant.length} are missing variantLabel: ${missingVariant.map((m) => m.id).join(", ")}`,
            path: ["metrics"],
          });
        }
      }
    }
  });

// ============================================================================
// LAYER 5 (part 1) — metricAIDescriptionStored and vizPresetStored
// (Preprocessed standalone entry points. Referenced by Layer 4 below.)
// ============================================================================

export const metricAIDescriptionStored = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyStoredMetricAIDescription(raw as Record<string, unknown>);
}, metricAIDescriptionStrict);

export const vizPresetStored = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyStoredVizPreset(raw as Record<string, unknown>);
}, vizPresetStrict);

// ============================================================================
// LAYER 4 — Stored-specific strict schemas. Different outer shapes than
// fetch (install adds runtime fields, strips nulls on install-strippable
// fields, translates label strings). References Layer 5 preprocessed for
// children that have their own drift.
// ============================================================================

export const resultsObjectDefinitionStoredStrict = z.object({
  id: z.string(),
  moduleId: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.record(z.string(), z.string()).optional(),
});

export const metricDefinitionStoredStrict = z.object({
  id: z.string(),
  label: z.string(),
  variantLabel: z.string().optional(),
  valueProps: z.array(z.string()),
  valueFunc: valueFunc,
  formatAs: z.enum(["percent", "number"]),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()).optional(),
  postAggregationExpression: postAggregationExpression.optional(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescriptionStored.optional(),
  importantNotes: z.string().optional(),
  vizPresets: z.array(vizPresetStored).optional(),
  hide: z.boolean().optional(),
});

// `config` typed as z.unknown() to avoid circular value import with
// presentation_object_config.ts. Inner PO config is validated at dedicated PO
// read sites via parseStoredPresentationObjectConfig.
export const defaultPresentationObjectStoredStrict = z.object({
  id: z.string(),
  label: z.string(),
  moduleId: z.string(),
  metricId: z.string(),
  sortOrder: z.number(),
  config: z.unknown(),
});

export const moduleDefinitionStoredStrict = z.object({
  id: z.string(),
  label: z.string(),
  prerequisites: z.array(z.string()),
  lastScriptUpdate: z.string(),
  commitSha: z.string().optional(),
  dataSources: z.array(dataSource),
  scriptGenerationType: scriptGenerationType,
  configRequirements: configRequirements,
  script: z.string(),
  assetsToImport: z.array(z.string()),
  resultsObjects: z.array(resultsObjectDefinitionStoredStrict),
  metrics: z.array(metricDefinitionStoredStrict),
  defaultPresentationObjects: z.array(defaultPresentationObjectStoredStrict),
});

// ============================================================================
// LAYER 5 (part 2) — moduleDefinitionStoredSchema (preprocessed entry point).
// ============================================================================

export const moduleDefinitionStoredSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyStoredModuleDefinition(raw as Record<string, unknown>);
}, moduleDefinitionStoredStrict);

// ============================================================================
// LAYER 6 — Convenience helper for DB read call sites.
// ============================================================================

export function parseStoredModuleDefinition(raw: string): ModuleDefinition {
  return moduleDefinitionStoredSchema.parse(JSON.parse(raw)) as ModuleDefinition;
}

// ============================================================================
// Derived types (z.infer)
// ============================================================================

export type ScriptGenerationType = z.infer<typeof scriptGenerationType>;
export type DataSource = z.infer<typeof dataSource>;
export type DataSourceDataset = z.infer<typeof dataSourceDataset>;
export type DataSourceResultsObject = z.infer<typeof dataSourceResultsObject>;
export type ModuleParameter = z.infer<typeof moduleParameter>;
export type ModuleConfigRequirements = z.infer<typeof configRequirements>;
export type ResultsObjectDefinitionJSON = z.infer<typeof resultsObjectDefinition>;
export type ValueFunc = z.infer<typeof valueFunc>;
export type PeriodOption = z.infer<typeof periodOption>;
export type PostAggregationExpression = z.infer<typeof postAggregationExpression>;
export type VizPresetTextConfig = z.infer<typeof vizPresetTextConfigStrict>;
export type VizPreset = z.infer<typeof vizPresetStrict>;
export type MetricAIDescription = z.infer<typeof metricAIDescriptionStrict>;
export type MetricDefinitionJSON = z.infer<typeof metricDefinitionJSON>;
export type ValidatedModuleDefinitionJSON = z.infer<typeof ModuleDefinitionJSONSchema>;
export type ModuleDefinitionJSON = ValidatedModuleDefinitionJSON;

// Kept for existing consumers; not part of the stored-schema family.
export const moduleDefinitionCore = z.object({
  label: translatableString,
  prerequisites: z.array(z.string()),
  scriptGenerationType: scriptGenerationType,
  dataSources: z.array(dataSource),
  assetsToImport: z.array(z.string()),
});
export type ModuleDefinitionCore = z.infer<typeof moduleDefinitionCore>;

// ============================================================================
// HFA runtime types — not Zod-validated. Kept as-is.
// ============================================================================

export type HfaIndicator = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
};

export type HfaIndicatorCode = {
  varName: string;
  timePoint: string;
  rCode: string;
  rFilterCode: string | undefined;
};

export type HfaDictionaryForValidation = {
  timePoints: {
    timePoint: string;
    timePointLabel: string;
    vars: { varName: string; varLabel: string; varType: string }[];
    values: { varName: string; value: string; valueLabel: string }[];
  }[];
};

// ============================================================================
// Runtime-enriched types — hand-authored (branded ModuleId, etc.)
// ============================================================================

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
  prerequisites: ModuleId[];
  lastScriptUpdate: string;
  commitSha?: string;
  dataSources: DataSource[];
  scriptGenerationType: ScriptGenerationType;
  configRequirements: ModuleConfigRequirements;
  script: string;
  assetsToImport: string[];
  resultsObjects: ResultsObjectDefinition[];
  metrics: MetricDefinition[];
  defaultPresentationObjects: DefaultPresentationObject[];
};

export type ResultsObjectDefinition = {
  id: string;
  moduleId: string;
  description: string;
  createTableStatementPossibleColumns?: Record<string, string>;
};

export type ResultsValue = {
  id: string;
  resultsObjectId: string;
  valueProps: string[];
  valueFunc: ValueFunc;
  postAggregationExpression?: PostAggregationExpression;
  valueLabelReplacements?: Record<string, string>;
  label: string;
  variantLabel?: string;
  formatAs: "percent" | "number";
  disaggregationOptions: {
    value: DisaggregationOption;
    isRequired: boolean;
    allowedPresentationOptions?: PresentationOption[];
  }[];
  mostGranularTimePeriodColumnInResultsFile: PeriodOption | undefined;
  aiDescription?: MetricAIDescription;
  importantNotes?: string;
};

export type ResultsValueForVisualization = {
  formatAs: "percent" | "number";
  valueProps: string[];
  valueLabelReplacements?: Record<string, string>;
};

export type MetricStatus =
  | "ready"
  | "module_not_installed"
  | "results_not_ready"
  | "error";

export type MetricWithStatus = ResultsValue & {
  status: MetricStatus;
  moduleId: ModuleId;
  vizPresets?: VizPreset[];
};

export type ResultsValueDefinition = Omit<
  ResultsValue,
  "disaggregationOptions" | "mostGranularTimePeriodColumnInResultsFile"
> & {
  requiredDisaggregationOptions: DisaggregationOption[];
};

export type MetricDefinition = {
  id: string;
  label: string;
  variantLabel?: string;
  valueProps: string[];
  valueFunc: ValueFunc;
  formatAs: "percent" | "number";
  requiredDisaggregationOptions: DisaggregationOption[];
  valueLabelReplacements?: Record<string, string>;
  postAggregationExpression?: PostAggregationExpression;
  resultsObjectId: string;
  aiDescription?: MetricAIDescription;
  importantNotes?: string;
  vizPresets?: VizPreset[];
  hide?: boolean;
};

export type TranslatableAIString = TranslatableString;

export function get_PERIOD_OPTION_MAP(): Record<PeriodOption, string> {
  return {
    period_id: t3({ en: "Monthly", fr: "Mensuel" }),
    quarter_id: t3({ en: "Quarterly", fr: "Trimestriel" }),
    year: t3({ en: "Yearly", fr: "Annuellement" }),
  };
}

export type DefaultPresentationObject = {
  id: string;
  label: string;
  moduleId: string;
  metricId: string;
  sortOrder: number;
  config: PresentationObjectConfig;
};

export type ResultsValueDefinitionJSON = Omit<
  ResultsValueDefinition,
  "moduleId" | "resultsObjectId"
>;
```

---

## Step 2 — Rewrite `lib/types/presentation_object_config.ts`

### 2.1 What changes

- Add `adaptLegacyStoredPresentationObjectConfig` typed adapter. Delegates to `adaptLegacyStoredConfigD` and `adaptLegacyStoredConfigS` from `module_definition.ts`.
- Rename current exported schema to `presentationObjectConfigStrictSchema` (Layer 4 for PO config).
- Add public preprocessed schema `presentationObjectConfigSchema = z.preprocess(adapter, presentationObjectConfigStrictSchema)` (Layer 5).
- Add `parseStoredPresentationObjectConfig(raw: unknown): PresentationObjectConfig` permissive helper (Layer 6).

### 2.2 Final file content

Replace the entire contents of `lib/types/presentation_object_config.ts` with the following.

```ts
import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import {
  adaptLegacyStoredConfigD,
  adaptLegacyStoredConfigS,
  configDStrict,
} from "./module_definition.ts";

// ============================================================================
// PresentationObjectConfig — stored shape of a visualization config.
// Layered per PLAN_6. Sits downstream of module_definition.ts; imports only
// strict schemas and adapters (no preprocessed values) to avoid cycles.
// ============================================================================

// ── Layer 1/2 content (local) ────────────────────────────────────────

export const customSeriesStyleSchema = z.object({
  color: z.string(),
  strokeWidth: z.number(),
  lineStyle: z.enum(["solid", "dashed"]),
});
export type CustomSeriesStyle = z.infer<typeof customSeriesStyleSchema>;

// PO config's `s` schema: all fields required (no .partial()). CF is merged
// in as flat cf* fields from cfStorageSchema (see CF refactor note at top of
// this plan — no nested `conditionalFormatting` field).
const presentationObjectConfigSStrict = z
  .object({
    scale: z.number(),
    content: z.enum(["lines", "bars", "points", "areas"]),
    allowIndividualRowLimits: z.boolean(),
    colorScale: z.enum([
      "pastel-discrete",
      "alt-discrete",
      "red-green",
      "blue-green",
      "single-grey",
      "custom",
    ]),
    decimalPlaces: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    hideLegend: z.boolean(),
    showDataLabels: z.boolean(),
    showDataLabelsLineCharts: z.boolean(),
    barsStacked: z.boolean(),
    diffAreas: z.boolean(),
    diffAreasOrder: z.enum(["actual-expected", "expected-actual"]),
    diffInverted: z.boolean(),
    specialBarChart: z.boolean(),
    specialBarChartInverted: z.boolean(),
    specialBarChartDiffThreshold: z.number(),
    specialBarChartDataLabels: z.enum(["all-values", "threshold-values"]),
    specialCoverageChart: z.boolean(),
    specialDisruptionsChart: z.boolean(),
    specialScorecardTable: z.boolean(),
    verticalTickLabels: z.boolean(),
    horizontal: z.boolean().optional(),
    allowVerticalColHeaders: z.boolean(),
    forceYMax1: z.boolean(),
    forceYMinAuto: z.boolean(),
    customSeriesStyles: z.array(customSeriesStyleSchema),
    nColsInCellDisplay: z.union([z.literal("auto"), z.number()]),
    seriesColorFuncPropToUse: z
      .enum(["series", "cell", "col", "row"])
      .optional(),
    sortIndicatorValues: z.enum(["ascending", "descending", "none"]),
    formatAdminArea3Labels: z.boolean().optional(),
    mapProjection: z.enum(["equirectangular", "mercator", "naturalEarth1"]),
    mapShowRegionLabels: z.boolean().optional(),
  })
  .merge(cfStorageSchema);

const presentationObjectConfigTStrict = z.object({
  caption: z.string(),
  captionRelFontSize: z.number(),
  subCaption: z.string(),
  subCaptionRelFontSize: z.number(),
  footnote: z.string(),
  footnoteRelFontSize: z.number(),
});

// ── Adapter (pure, typed, per-level) ─────────────────────────────────

export function adaptLegacyStoredPresentationObjectConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = { ...raw };
  const rawD =
    input.d && typeof input.d === "object" && !Array.isArray(input.d)
      ? (input.d as Record<string, unknown>)
      : {};
  const d = adaptLegacyStoredConfigD(rawD);
  const isMap = (d as Record<string, unknown>).type === "map";
  const rawS =
    input.s && typeof input.s === "object" && !Array.isArray(input.s)
      ? (input.s as Record<string, unknown>)
      : {};
  const s = adaptLegacyStoredConfigS(rawS, isMap);
  return { ...input, d, s };
}

// ── Layer 4 — strict schema ──────────────────────────────────────────

export const presentationObjectConfigStrictSchema = z.object({
  d: configDStrict,
  s: presentationObjectConfigSStrict,
  t: presentationObjectConfigTStrict,
});

// ── Layer 5 — preprocessed public schema ─────────────────────────────

export const presentationObjectConfigSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyStoredPresentationObjectConfig(
    raw as Record<string, unknown>,
  );
}, presentationObjectConfigStrictSchema);

export type PresentationObjectConfig = z.infer<
  typeof presentationObjectConfigSchema
>;

// ── Layer 6 — permissive-read helper (per PLAN_5 item D) ─────────────
// Reads must not throw on legacy rows. On parse failure: log structured
// warning, return the adapter-only output as fallback. Strict-write sites
// call presentationObjectConfigSchema.parse directly (throws on invalid).

export function parseStoredPresentationObjectConfig(
  raw: unknown,
): PresentationObjectConfig {
  const result = presentationObjectConfigSchema.safeParse(raw);
  if (result.success) return result.data;
  console.warn(
    "[parseStoredPresentationObjectConfig] Zod validation failed after adapter run; falling back to adapter output. Issues:",
    result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw as PresentationObjectConfig;
  }
  return adaptLegacyStoredPresentationObjectConfig(
    raw as Record<string, unknown>,
  ) as PresentationObjectConfig;
}
```

---

## Step 3 — Append legacy-adapter section to `lib/types/reports.ts`

### 3.1 What changes

- Move `LegacyReportItemConfig` type from `server/legacy_adapters/report_item.ts`.
- Move `adaptLegacyReportItemConfigShape` function from `server/legacy_adapters/report_item.ts`.
- Move private `walkLayoutTree` helper (rename to `_walkReportItemLayoutTree` to signal "local private").
- No Zod schema for reports in this plan — that's PLAN_5 Tier 1 (deferred).

### 3.2 Append to the end of `lib/types/reports.ts`

Append the following block at the end of the file (after the existing `getStartingReportItemPlaceholder` function):

```ts
// ============================================================================
// Legacy report-item config — pure shape adapter.
// No Zod schema for ReportItemConfig yet (PLAN_5 Tier 1 deferred). Callers
// invoke this adapter explicitly before passing the result downstream:
//   adaptLegacyReportItemConfigShape(parseJsonOrThrow(rawReportItem.config))
// When a Zod schema is added, wrap it with
//   z.preprocess(adaptLegacyReportItemConfigShape, reportItemConfigStrict)
// per the layered architecture in PLAN_6.
// ============================================================================

export type LegacyReportItemConfig = Omit<ReportItemConfig, "freeform"> & {
  freeform: {
    useHeader?: boolean;
    headerText?: string;
    subHeaderText?: string;
    dateText?: string;
    headerLogos?: string[];
    useFooter?: boolean;
    footerText?: string;
    footerLogos?: string[];
    content:
      | ReportItemContentItem[][]
      | ReportItemConfig["freeform"]["content"];
  };
};

export function adaptLegacyReportItemConfigShape(
  config: LegacyReportItemConfig,
): ReportItemConfig {
  let content: LayoutNode<ReportItemContentItem>;
  if (Array.isArray(config.freeform?.content)) {
    content = {
      type: "rows" as const,
      id: crypto.randomUUID(),
      children: config.freeform.content.map((row) => ({
        type: "cols" as const,
        id: crypto.randomUUID(),
        children: row.map((item) => ({
          type: "item" as const,
          id: crypto.randomUUID(),
          data: item,
          span: item.span,
        })),
      })),
    };
  } else {
    content = config.freeform.content;
  }

  _walkReportItemLayoutTree(content, (item: ReportItemContentItem) => {
    if ((item as unknown as { type: string }).type === "placeholder") {
      item.type = "text";
      item.markdown = "";
    }
  });

  return {
    ...config,
    freeform: {
      ...config.freeform,
      content,
    },
  } as ReportItemConfig;
}

function _walkReportItemLayoutTree<T>(
  node: LayoutNode<T>,
  fn: (item: T) => void,
): void {
  if (node.type === "item") {
    fn(node.data);
  } else if (Array.isArray(node.children)) {
    for (const child of node.children) {
      _walkReportItemLayoutTree(child, fn);
    }
  }
}
```

`LayoutNode` is already imported at line 1 of this file — no new import needed.

---

## Step 4 — Move `resolveLegacyReportMetricIds` into `server/db/project/reports.ts`

### 4.1 What changes

- Move `resolveLegacyReportMetricIds` and its private helper `walkLayoutTreeAsync` from `server/legacy_adapters/report_item.ts` into `server/db/project/reports.ts`.
- Update imports in `server/db/project/reports.ts`:
  - Remove the `adaptLegacyReportItemConfigShape` import from `server/legacy_adapters/` — it now comes from `lib`.
  - Remove the `resolveLegacyReportMetricIds` import entirely — it's defined locally.

### 4.2 Edits to `server/db/project/reports.ts`

**Edit 4.2.a** — At the top of the file, find the existing import block that includes `adaptLegacyReportItemConfigShape, resolveLegacyReportMetricIds`. Current (lines 23–24):

```ts
  adaptLegacyReportItemConfigShape,
  resolveLegacyReportMetricIds,
```

Delete these two lines from wherever they currently are (likely a `"../../legacy_adapters/mod.ts"` import block), and add `adaptLegacyReportItemConfigShape` to the `"lib"` import block at the top of the file.

**Edit 4.2.b** — Ensure the file has these imports at the top (add any not present):

```ts
import type { LayoutNode } from "@timroberton/panther";
import type { Sql } from "postgres";
// ... and in the existing "lib" import:
//   ReportItemContentItem, ReportItemConfig, adaptLegacyReportItemConfigShape
```

**Edit 4.2.c** — Append the following block at the end of `server/db/project/reports.ts`:

```ts
// ============================================================================
// Legacy report-item config — DB-dependent resolution.
// Stays server-side because it needs a Sql connection. Colocated next to the
// read sites that invoke it after adaptLegacyReportItemConfigShape.
// ============================================================================

export async function resolveLegacyReportMetricIds(
  config: ReportItemConfig,
  projectDb: Sql,
): Promise<ReportItemConfig> {
  await _walkReportItemLayoutTreeAsync(
    config.freeform.content,
    async (item: ReportItemContentItem) => {
      const poInfo = item.presentationObjectInReportInfo as
        | { id: string; moduleId: string; metricId?: string }
        | { id: string; metricId: string; moduleId?: string }
        | undefined;

      if (
        poInfo &&
        "moduleId" in poInfo &&
        poInfo.moduleId &&
        !poInfo.metricId
      ) {
        const po = await projectDb<{ metric_id: string }[]>`
          SELECT metric_id FROM presentation_objects WHERE id = ${poInfo.id}
        `;
        if (po[0]) {
          delete poInfo.moduleId;
          poInfo.metricId = po[0].metric_id;
        }
      }
    },
  );
  return config;
}

async function _walkReportItemLayoutTreeAsync<T>(
  node: LayoutNode<T>,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (node.type === "item") {
    await fn(node.data);
  } else if (Array.isArray(node.children)) {
    for (const child of node.children) {
      await _walkReportItemLayoutTreeAsync(child, fn);
    }
  }
}
```

---

## Step 5 — Update every call site

### 5.1 `server/db/project/metric_enricher.ts`

**No edits required.** The file already imports `metricAIDescriptionStored` from `lib` and calls `metricAIDescriptionStored.parse(JSON.parse(...))`. After Step 1, that schema has preprocess; behavior changes from strict-with-defaults-in-schema to preprocess-then-strict. Same public API. Same call site.

### 5.2 `server/db/project/modules.ts`

**Edit 5.2.a** — In the `import ... from "lib"` block, replace `parseModuleDefinition,` with `parseStoredModuleDefinition,`.

**Edit 5.2.b** — Delete the line:

```ts
import { adaptLegacyModuleDefinition, adaptLegacyVizPresets } from "../../legacy_adapters/mod.ts";
```

**Edit 5.2.c** — Replace every occurrence of the 3-line block:

```ts
parseModuleDefinition(
      adaptLegacyModuleDefinition(JSON.parse(rawModule.module_definition)),
    )
```

with:

```ts
parseStoredModuleDefinition(rawModule.module_definition)
```

Applies at 6 occurrences (lines ~244–246, ~494–496, ~566–568, ~662–664, ~969–971, ~1007–1009).

**Edit 5.2.d** — Replace the single-line occurrence (line ~312):

```ts
    const storedDef = parseModuleDefinition(adaptLegacyModuleDefinition(JSON.parse(rawModule.module_definition)));
```

with:

```ts
    const storedDef = parseStoredModuleDefinition(rawModule.module_definition);
```

**Edit 5.2.e** — Replace the viz_presets parse (lines ~937–940):

```ts
        vizPresets: dbMetric.viz_presets
          ? z.array(vizPresetStored).parse(adaptLegacyVizPresets(JSON.parse(dbMetric.viz_presets)))
          : undefined,
```

with:

```ts
        vizPresets: dbMetric.viz_presets
          ? z.array(vizPresetStored).parse(JSON.parse(dbMetric.viz_presets))
          : undefined,
```

(The `adaptLegacyVizPresets` call is removed — per-element `vizPresetStored` preprocess handles it automatically.)

### 5.3 `server/db/project/presentation_objects.ts`

**Edit 5.3.a** — Replace the import line (~line 23):

```ts
import { adaptLegacyPresentationObjectConfig } from "../../legacy_adapters/mod.ts";
```

with:

```ts
import { parseStoredPresentationObjectConfig } from "lib";
```

**Edit 5.3.b** — Replace every occurrence of:

```ts
adaptLegacyPresentationObjectConfig(parseJsonOrThrow(row.config))
```

with:

```ts
parseStoredPresentationObjectConfig(JSON.parse(row.config))
```

Applies at lines ~145, ~163, ~492 (3 occurrences where the variable is `row.config`).

**Edit 5.3.c** — Replace:

```ts
adaptLegacyPresentationObjectConfig(parseJsonOrThrow(rawPresObj.config))
```

with:

```ts
parseStoredPresentationObjectConfig(JSON.parse(rawPresObj.config))
```

(Line ~202, 1 occurrence with `rawPresObj.config`.)

**Edit 5.3.d** — Replace:

```ts
          adaptLegacyPresentationObjectConfig(parseJsonOrThrow(result[0].config));
```

with:

```ts
          parseStoredPresentationObjectConfig(JSON.parse(result[0].config));
```

(Line ~381, 1 occurrence with `result[0].config`.)

**Edit 5.3.e** — Strict-write sites at lines ~66, ~322, ~386 use `presentationObjectConfigSchema.parse(config)`. **No change needed.** The schema is now preprocessed; adapter runs (no-op on current shape), then strict validation. If `config` is current-shape (editor save), adapter is idempotent identity. If legacy-shape, adapter normalizes first.

### 5.4 `server/task_management/get_dependents.ts`

**Edit 5.4.a** — Replace the import block:

```ts
import {
  parseModuleDefinition,
  type DatasetType,
} from "lib";
import { adaptLegacyModuleDefinition } from "../legacy_adapters/mod.ts";
```

with:

```ts
import {
  parseStoredModuleDefinition,
  type DatasetType,
} from "lib";
```

**Edit 5.4.b** — Replace (2 occurrences, lines ~33–35 and ~64–66):

```ts
    const modDef = parseModuleDefinition(
      adaptLegacyModuleDefinition(JSON.parse(rawModule.module_definition))
    );
```

with:

```ts
    const modDef = parseStoredModuleDefinition(rawModule.module_definition);
```

**Edit 5.4.c** — Replace (line ~126–128):

```ts
  const moduleDefinition = parseModuleDefinition(
    adaptLegacyModuleDefinition(JSON.parse(thisMod.module_definition))
  );
```

with:

```ts
  const moduleDefinition = parseStoredModuleDefinition(thisMod.module_definition);
```

### 5.5 `server/db/project/reports.ts`

Already covered in Step 4. No additional edits at this step.

### 5.6 `server/routes/project/presentation_objects.ts`

**Edit 5.6.a** — Replace (line ~16):

```ts
import { adaptLegacyPODetailResponse } from "../../legacy_adapters/mod.ts";
```

with:

```ts
import { parseStoredPresentationObjectConfig } from "lib";
```

**Edit 5.6.b** — Replace (line ~155):

```ts
      return c.json(adaptLegacyPODetailResponse(existing));
```

with:

```ts
      return c.json(
        existing.success
          ? {
              ...existing,
              data: {
                ...existing.data,
                config: parseStoredPresentationObjectConfig(existing.data.config),
              },
            }
          : existing,
      );
```

---

## Step 6 — Delete `server/legacy_adapters/`

### 6.1 Delete files

Remove these files:

- `server/legacy_adapters/mod.ts`
- `server/legacy_adapters/module_definition.ts`
- `server/legacy_adapters/period_filter.ts`
- `server/legacy_adapters/po_config.ts`
- `server/legacy_adapters/report_item.ts`

Then remove the `server/legacy_adapters/` directory itself.

### 6.2 Verify no stragglers

```bash
grep -rn "legacy_adapters" server/ lib/ client/ panther/ 2>/dev/null
```

Must return zero hits.

---

## Step 7 — Update `DOC_legacy_handling.md`

### 7.1 Replace the "Location" paragraph (line ~25)

Find:

```
**Location:** all server-side legacy adapters live in [server/legacy_adapters/](server/legacy_adapters/). This is the canonical folder — when adding a new adapter, put it here. Co-located with [server/db/migrations/](server/db/migrations/) and the Pattern 4 startup migrations in [server/db_startup.ts](server/db_startup.ts) so legacy handling is discoverable as a category.
```

Replace with:

```
**Location:** every pure legacy adapter is colocated with its Zod schema in `lib/types/<domain>.ts`. When you change a type, the adapter is in the same file. When you discover a new drift variant, add it to the appropriate `adaptLegacyStored<X>` function in that file. Adapters are baked into the public schema via `z.preprocess(adapter, strictSchema)`, so every `.parse` / `.safeParse` on the schema runs the adapter automatically — callers cannot bypass it.

DB-dependent legacy resolutions (adapters that need a database connection, filesystem access, or network) stay in the server code next to their callers. Currently: `resolveLegacyReportMetricIds` in [server/db/project/reports.ts](server/db/project/reports.ts).

**Fetch schemas stay strict.** The fetch tree (`ModuleDefinitionJSONSchema` and its children) never references preprocessed schemas. Authored `definition.json` files must match the current shape exactly — no silent normalization at fetch time.
```

### 7.2 Replace the wiring-rule block (lines ~29–34)

Find:

```
**Wiring rule — two layers:**

1. **DB read sites.** Every read path that parses the entity's JSON from the DB must call the adapter. The adapter normalizes the in-memory object to the current TS shape, which means read-modify-write paths also self-heal on save (written-back JSON gets the new shape).
2. **Cache-hit sites.** Valkey entries persist across deploys. A cached value written before a shape change will return stale-shape data on cache hit, bypassing the DB-read adapter. So at every cache-hit path that exposes the entity to consumers, also call the adapter. Idempotent for already-adapted entries.

Example: [server/routes/project/presentation_objects.ts](server/routes/project/presentation_objects.ts) wraps `_PO_DETAIL_CACHE.get()` result in `adaptLegacyPODetailResponse(...)` before returning. Cache misses go through the DB function which already adapts — double-adapting is a harmless no-op.
```

Replace with:

```
**Wiring rule:**

Because the adapter is baked into the public schema via `z.preprocess`, wiring is automatic at every validation site. You can't forget to invoke it — `.parse` and `.safeParse` run it for you.

- **DB read sites.** Call the domain's `parseStored<X>(raw)` helper (or `<X>Schema.parse(JSON.parse(raw))` if you want strict-throw instead of permissive-read). Adapter runs, then strict validation.
- **Cache-hit sites.** Same helper. Idempotent adapters mean double-running is a no-op.
- **Write sites.** Use `.parse` on the public schema (throws on invalid). Current-shape writes pass through the adapter unchanged. The rare legacy-shape write gets normalized before validation.

**Adapter purity contract.** Adapters MUST be pure functions — same output for same input, no side effects, no external state, no mutation of shared references. They WILL be called multiple times on the same data across a request (nested preprocess firing, cache-hit re-validation, defensive re-parse). Violations cause subtle bugs.
```

### 7.3 Replace the "Active adapters" list (lines ~44–62)

Find the block starting `**Active adapters in [server/legacy_adapters/](server/legacy_adapters/):**` and ending at the end of the `report_item.ts` bullet. Replace with:

```
**Active adapter inventory (colocated with schemas):**

- [lib/types/module_definition.ts](lib/types/module_definition.ts) — module-definition family. Preprocess entry points: `metricAIDescriptionStored`, `vizPresetStored`, `moduleDefinitionStoredSchema`. Per-level adapters (all pure, typed, exported so they can be composed):
  - `adaptLegacyStoredPeriodFilter` — `last_12_months` → `last_n_months+nMonths:12`; fill `filterType: "custom"` when undefined; strip fabricated bounds from relative types.
  - `adaptLegacyStoredConfigD` — rename legacy `periodOpt` → `timeseriesGrouping`; nested periodFilter adaptation.
  - `adaptLegacyStoredConfigS(raw, isMap)` — detects legacy nested `conditionalFormatting` (string preset id via `LEGACY_CF_PRESETS`, or object union); detects legacy map color fields (only when `isMap`, via `buildCfFromLegacyMapFields`); flattens any captured CF union via `flattenCf` into flat `cf*` fields on `s`; fills missing cf* fields from `CF_STORAGE_DEFAULTS`; fills `specialDisruptionsChart` from legacy `diffAreas` (Pattern 3); strips legacy nested `conditionalFormatting` and all map* fields. Parent adapters provide `isMap` from sibling `d.type`.
  - `adaptLegacyStoredVizPresetTextConfig` — fill missing nullable text-config fields.
  - `adaptLegacyStoredMetricAIDescription` — fill missing `caveats`, `importantNotes`, `relatedMetrics`.
  - `adaptLegacyStoredVizPreset` — drop `defaultPeriodFilterForDefaultVisualizations`; fill missing required fields; walk into `config.d`/`config.s`/`config.t`.
  - `adaptLegacyStoredModuleDefinition` — fill top-level defaults (scriptGenerationType, dataSources, metrics, etc.). Does NOT recurse into metrics[] — nested `metricAIDescriptionStored` and `vizPresetStored` preprocesses handle nested drift when strict validation runs.
  - `adaptLegacyStoredMetricDefinition`, `adaptLegacyStoredResultsObjectDefinition`, `adaptLegacyStoredDefaultPresentationObject` — currently identity (placeholders for future transforms; keep the shape so future adapters land in one predictable place).
  - Call sites: `parseStoredModuleDefinition(raw: string)` convenience helper in the same file; 10 read sites across [server/db/project/modules.ts](server/db/project/modules.ts) and [server/task_management/get_dependents.ts](server/task_management/get_dependents.ts); viz_presets-column read uses `z.array(vizPresetStored).parse(...)`; AI-description-column read uses `metricAIDescriptionStored.parse(...)`.

- [lib/types/presentation_object_config.ts](lib/types/presentation_object_config.ts) — PO config. Preprocess entry point: `presentationObjectConfigSchema`. Adapter `adaptLegacyStoredPresentationObjectConfig` delegates to `adaptLegacyStoredConfigD` and `adaptLegacyStoredConfigS` from module_definition.ts. Permissive-read helper `parseStoredPresentationObjectConfig(raw: unknown)` (safeParse + warn + fallback) per PLAN_5 item D.
  - Call sites: 5 DB read sites in [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts); 1 cache-hit site in [server/routes/project/presentation_objects.ts](server/routes/project/presentation_objects.ts); 3 strict-write sites in [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts) use `presentationObjectConfigSchema.parse(config)` directly.

- [lib/types/reports.ts](lib/types/reports.ts) — report-item shape adapter `adaptLegacyReportItemConfigShape`. Called explicitly at 2 read sites in [server/db/project/reports.ts](server/db/project/reports.ts); **not yet `z.preprocess`-wrapped** because there is no Zod schema for `ReportItemConfig` (PLAN_5 Tier 1 deferred). When the schema lands, wrap it per the layered architecture and remove the explicit adapter call.

- [server/db/project/reports.ts](server/db/project/reports.ts) — DB-dependent legacy resolution `resolveLegacyReportMetricIds(config, projectDb)` (`moduleId` → `metricId` lookup). Stays server-side. Chained with the pure shape adapter at the 2 read sites.
```

### 7.4 Update the cleanup audit table

Find the `po_config.ts` row in the cleanup audit table (~line 216):

```
| Legacy CF string-preset + map-color-field adapter transforms in `po_config.ts` (`adaptLegacyConfigS`, `LEGACY_CF_PRESETS` usage, `buildCfFromLegacyMapFields`) | Once every deployed project has re-saved affected configs, or a Pattern 4 forces it |
```

Replace with:

```
| Legacy CF string-preset + map-color-field adapter transforms in `lib/types/module_definition.ts` (`adaptLegacyStoredConfigS`, `LEGACY_CF_PRESETS` usage, `buildCfFromLegacyMapFields`) | Once every deployed project has re-saved affected configs, or a Pattern 4 forces it |
```

---

## Step 8 — Verification

### 8.1 Typecheck

```bash
deno task typecheck
```

Server typecheck must pass with zero new errors. Client typecheck has pre-existing errors from the in-flight conditional-formatting refactor (`client/src/generate_visualization/conditional_formatting.ts`, `client/src/generate_visualization/get_style_from_po/_0_common.ts`, etc.) — those are unrelated to this plan and unchanged by it. Compare the full client error list to the pre-Step-1 baseline; there must be no new entries.

### 8.2 No legacy_adapters references remain

```bash
grep -rn "legacy_adapters" server/ lib/ client/ panther/ 2>/dev/null
```

Must return zero hits.

### 8.3 Public-API usage verification

```bash
grep -rn "parseStoredModuleDefinition\|parseStoredPresentationObjectConfig" server/ lib/ 2>/dev/null | wc -l
```

Expected: `parseStoredModuleDefinition` appears 11 times (10 call sites + 1 definition); `parseStoredPresentationObjectConfig` appears 7 times (5 read sites in presentation_objects.ts + 1 in routes/presentation_objects.ts + 1 definition). Total 18 lines. Ensure these counts match.

### 8.4 No remaining explicit adapter calls

```bash
grep -rn "adaptLegacy" server/ lib/ 2>/dev/null
```

Expected matches (definitions only, no call sites in server code):

- `lib/types/module_definition.ts`: definitions of the 10 `adaptLegacyStored*` functions (10 hits). No call sites.
- `lib/types/presentation_object_config.ts`: 1 definition + 1 internal call from `parseStoredPresentationObjectConfig` fallback (2 hits).
- `lib/types/reports.ts`: 1 definition (1 hit).
- `server/db/project/reports.ts`: 2 explicit call sites (reports not yet preprocessed — Tier 1 deferred).

Total ~16 hits, all either definitions in lib or the 2 report-item explicit call sites.

### 8.5 Runtime sanity

- **Open a project** — `parseStoredModuleDefinition` must succeed on every row in `modules.module_definition` across all projects.
- **Open a visualization** — `parseStoredPresentationObjectConfig` must succeed or fall back with a structured warning on every row in `presentation_objects.config`.
- **Edit and save a visualization** — `presentationObjectConfigSchema.parse(config)` (strict-write) must accept the editor's current-shape output with no transform visible in the saved JSON.
- **Fetch a module from GitHub** — `ModuleDefinitionJSONSchema.safeParse(definition)` at `load_module.ts:123` must remain strict. Authored `definition.json` files that omit required fields or contain legacy field names (e.g., `periodOpt`, string `conditionalFormatting`) must fail validation with clear error paths.

---

## Rules carried forward

Every new stored-shape type follows this architecture.

1. **Strict schema first.** `const xStoredStrict = z.object({...})`. No `.default`/`.optional`/`.nullish` for drift tolerance.
2. **Pure adapter.** `export function adaptLegacyStoredX(raw: Record<string, unknown>): Record<string, unknown>`. Idempotent, no side effects.
3. **Preprocessed public schema** if X is a standalone DB-read entry point: `export const xStoredSchema = z.preprocess((r) => typeof r === "object" && r !== null && !Array.isArray(r) ? adaptLegacyStoredX(r as Record<string, unknown>) : r, xStoredStrict);`.
4. **Derived type.** `export type X = z.infer<typeof xStoredSchema>;` (or keep hand-authored when branding matters).
5. **Convenience helper** (optional): `export function parseStoredX(raw: string): X { return xStoredSchema.parse(JSON.parse(raw)) as X; }`.
6. **Permissive-read helper** (optional): only when parse failure must not throw — implements `safeParse → warn → fallback`.
7. **Fetch-side schema** (if applicable): strict composition from Layer 1 + Layer 2 (shared content schemas). Never reference Layer 5 (preprocessed).

Adding a drift variant:

1. Add a transform in the relevant `adaptLegacyStoredX` function.
2. That's it. All call sites pick it up via preprocess.

Removing a drift (after all rows re-saved):

1. Remove the transform from the adapter.
2. That's it.

Adding a new standalone read entry point:

1. Identify the level (e.g., some new nested blob).
2. Add `adaptLegacyStoredNewThing` adapter next to the strict schema for that level.
3. Add `newThingStored = z.preprocess(adapter, newThingStrict)` for standalone parsing.
4. Consumers that already parse the parent entity get the new drift automatically via nested preprocess.

---

## Out of scope

- **Writing Zod schemas for reports / slides / slide_decks.** Required before those domains can use `z.preprocess` baking. PLAN_5 Tier 1 (deferred).
- **Changing fetch-time schemas.** `ModuleDefinitionJSONSchema` stays strict and unchanged in shape.
- **Changing install-flow behavior.** `load_module.ts:translateMetrics` is unchanged — it still resolves TranslatableString → string and strips nulls.
- **Removing install-strip optionality on stored strict schemas.** `variantLabel`, `valueLabelReplacements`, `postAggregationExpression`, `aiDescription`, `importantNotes`, `vizPresets`, `hide`, `commitSha` remain `.optional()` on `metricDefinitionStoredStrict` and `moduleDefinitionStoredStrict` — those are genuine current-shape optionality driven by install, not drift tolerance.
- **Data migrations to eliminate legacy rows.** Pattern 4 work. Separate.
- **Client-side validation** of anything touched here. No client code changes.
- **The pre-existing client typecheck errors** in `conditional_formatting.ts` / `get_style_from_po/`. Those are from an in-flight refactor and out of scope for this plan.

---

## Landing

Ship as **one PR**. Step 1 removes the current schema-level defaults; the call sites in Steps 5.2 and 5.4 depend on the new `parseStoredModuleDefinition` name. Piecewise landing leaves the tree broken. Apply Steps 1–7, run Step 8, commit.

After landing, the file layout for legacy handling is:

```
lib/types/module_definition.ts            (Layers 1–6 for module family)
lib/types/presentation_object_config.ts   (Layers 1/4/5/6 for PO config)
lib/types/reports.ts                      (adapter only; schema pending)
server/db/project/reports.ts              (DB-dependent report adapter)
```

No `server/legacy_adapters/` directory. No per-boundary adapter wrappers.

---

## Pre-execution audit — findings from 2026-04-19

Before executing this plan, I verified the following against the repo state on 2026-04-19:

### Verified ✓

**External imports resolve.** `cfStorageSchema`, `flattenCf`, `CF_STORAGE_DEFAULTS`, `ConditionalFormatting`, `ConditionalFormattingScale` are all currently exported from `lib/types/conditional_formatting.ts`. `LEGACY_CF_PRESETS` and `LegacyCfPresetId` are currently exported from `lib/legacy_cf_presets.ts`. A smoke test (writing an imports-only file and running `deno check`) passes.

**No external consumers of the renamed schema values.** Grep confirms:

- `vizPreset` (schema value, lowercase) — used only in `lib/types/module_definition.ts`. Renaming to `vizPresetStrict` / `vizPresetStored` is safe.
- `metricAIDescription` (schema value, lowercase) — used only in `lib/types/module_definition.ts`. Safe.
- `configD` / `configS` (schema values) — used only within `lib/types/` (self-references and the adapter). Safe.
- `VizPreset` / `MetricAIDescription` / `VizPresetTextConfig` / `PresentationObjectConfig` (TS types, capitalized) — used in 18+ places across the codebase. These **stay** — they're re-derived via `z.infer` from the strict schemas. No breakage.

**Pattern-3 legacy sites still exist.** The three `diffAreas` dual-check sites flagged in `DOC_legacy_handling.md` are present today in the client:

- `client/src/generate_visualization/get_style_from_po.ts:21`
- `client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx:41`
- `client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx:106`

These stay. Step 1's `adaptLegacyStoredConfigS` fills `specialDisruptionsChart` from `diffAreas` so strict-writes at PO save don't fail, but `diffAreas` itself is preserved so the dual-check sites keep reading both flags as documented in Pattern 3.

### Known stale-schema sites (out of scope for this plan)

`_shared.tsx:108` references `p.tempConfig.s.conditionalFormatting?.type !== "none"` — reading the **old** nested CF shape that no longer exists in the current flat-storage schema. This is part of the in-flight CF refactor, not this plan's scope. Flagged here so whoever finishes the CF refactor knows to update it.

### Not verified (limits of a no-implementation audit)

**Full typecheck of the combined Step 1 + Step 2 content.** Smoke-tested the imports in isolation. Didn't run the full plan content through `deno check` in-situ because that would require temporarily replacing `module_definition.ts` and `presentation_object_config.ts`, which contradicts "don't implement anything, just update the plan." Executor should run typecheck immediately after applying Step 1 and Step 2, expect small surprises (cast adjustments, optional field ordering), resolve, and continue.

**Exact behavior of `.merge(cfStorageSchema).partial()` vs `.partial().merge(cfStorageSchema)`.** Step 1's `configS` uses `.merge(cfStorageSchema).partial()`. This makes both the base fields AND the merged cf* fields optional — which matches the semantics we want for viz presets (every field on `s` is optional). Verify this at typecheck time; if Zod treats the merge differently than expected, fall back to declaring cf* fields inline under `.partial()`.

**No audit of per-tool schema changes for AI tools.** Out of scope — AI tool schemas are unaffected by this plan.

### Transforms inventoried

Every known legacy transform has a home in the plan:

| Transform | Adapter location | Status |
|---|---|---|
| `d.periodOpt` → `d.timeseriesGrouping` | `adaptLegacyStoredConfigD` | Covered |
| `periodFilter: "last_12_months"` → `last_n_months+nMonths:12` | `adaptLegacyStoredPeriodFilter` | Covered |
| `periodFilter: undefined` → `"custom"` | `adaptLegacyStoredPeriodFilter` | Covered |
| Strip fabricated bounds on relative period filters | `adaptLegacyStoredPeriodFilter` | Covered |
| `s.conditionalFormatting: string` (preset id) → flat cf* fields | `adaptLegacyStoredConfigS` | Covered (via `flattenCf`) |
| `s.conditionalFormatting: object` (union) → flat cf* fields | `adaptLegacyStoredConfigS` | Covered (via `flattenCf`) |
| Legacy map color fields → flat cf* fields | `adaptLegacyStoredConfigS` | Covered |
| Strip legacy map* fields | `adaptLegacyStoredConfigS` | Covered |
| Missing cf* fields → `CF_STORAGE_DEFAULTS` | `adaptLegacyStoredConfigS` | Covered |
| `diffAreas` → `specialDisruptionsChart` (fill when missing) | `adaptLegacyStoredConfigS` | Covered |
| `vizPresets[].defaultPeriodFilterForDefaultVisualizations` drop | `adaptLegacyStoredVizPreset` | Covered |
| Missing `metricAIDescription.caveats` / `importantNotes` / `relatedMetrics` | `adaptLegacyStoredMetricAIDescription` | Covered |
| Missing `vizPresetTextConfig` fields | `adaptLegacyStoredVizPresetTextConfig` | Covered |
| Missing `vizPreset.importantNotes` / `createDefaultVisualizationOnInstall` / `needsReplicant` / `allowedFilters` / `config.s` / `config.t` | `adaptLegacyStoredVizPreset` | Covered |
| Missing top-level `moduleDefinition` fields (scriptGenerationType, metrics, etc.) | `adaptLegacyStoredModuleDefinition` | Covered |
| Legacy `placeholder` report item type → `text` | `adaptLegacyReportItemConfigShape` | Covered (not preprocessed yet; Tier 1 deferred) |
| Report item layout 2D array → `LayoutNode` tree | `adaptLegacyReportItemConfigShape` | Covered (not preprocessed yet) |
| Report item `moduleId` → `metricId` (DB-dependent) | `resolveLegacyReportMetricIds` (stays server-side) | Covered |

No known transforms are uncovered.
