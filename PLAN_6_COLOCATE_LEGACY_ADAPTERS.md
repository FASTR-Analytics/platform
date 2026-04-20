# PLAN 6: Colocate legacy adapters via z.preprocess

Every important stored-shape type gets one obvious file. That file contains: the strict Zod schema(s) for the current shape, the per-level adapters that normalize legacy shapes, and the public schema formed by `z.preprocess(adapter, strictSchema)`. Preprocess bakes the adapter into the schema — every `.parse()` and `.safeParse()` automatically runs it. Callers can't skip it.

When a type changes, you edit one file: update the strict schema, add a transform to the adapter. When a drift variant is discovered, same file. When auditing legacy for a domain, same file.

DB-dependent legacy resolutions (functions that need a `Sql` connection) stay server-side next to their caller.

This plan is **fully mechanical**. Every file edit is spelled out with exact content. No judgment calls at implementation time. Execute in order.

---

## Principle

1. **Schemas describe current shape only.** Strict. No `.default()`, `.optional()`-for-drift, `.nullish()` in schemas. Legacy tolerance lives in adapters.
2. **Adapters are pure, typed, idempotent.** Signature `adaptLegacy<X>(raw: Record<string, unknown>): Record<string, unknown>`. Running twice on the same input produces the same output. No network, no DB, no mutation of external state.
3. **Baked in via `z.preprocess`** at the **stored entry points** (the schemas that are `.parse`d at DB-read sites). Callers can't bypass.
4. **Github schemas stay strict-all-the-way-down.** The github tree never references preprocessed schemas. Authored `definition.json` files must match the current shape exactly — no silent normalization.
5. **One permissive-read helper per permissive-read domain.** Currently only PO config (per PLAN_5 item D). Implements `safeParse → warn → fallback`. Colocated with the schema.
6. **DB-dependent adapters** stay server-side next to their caller, never in `lib/types/`.

---

## File structure

The plan replaces today's split (`server/legacy_adapters/*` + the schema-and-default-laden `lib/types/module_definition.ts` + `lib/types/presentation_object_config.ts`) with three colocated files:

```
lib/types/_module_definition_github.ts      (authored in GitHub — strict, translatable strings)
lib/types/_module_definition_installed.ts   (written by install flow — drift-tolerant via preprocess)
lib/types/presentation_object_config.ts     (user-created via UI — drift-tolerant via preprocess)
```

**Naming convention.** File names describe the lifecycle stage that produces the shape:
- `_github` — authored in a GitHub repo, fetched at install time, validated by [server/module_loader/load_module.ts](server/module_loader/load_module.ts).
- `_installed` — written by the install flow (`installModule` etc.), read at runtime from `modules.module_definition` and from per-metric columns (`metrics.ai_description`, `metrics.viz_presets`).
- No suffix on `presentation_object_config.ts` — POs are user-created via the UI, not installed. Only one lifecycle.

The underscore prefix groups the schema-managing files at the top of `lib/types/`. New "drift-managed" schema files should follow the same convention.

**Self-containment.** The two module-definition files are **starting points** in the import graph. They MUST NOT import from peer schema files (PO config, reports, slides). They may import from foundational primitives files (`presentation_objects.ts` for the disaggregation enum, `conditional_formatting.ts` for `cfStorageSchema`/`flattenCf`/`CF_STORAGE_DEFAULTS`, `legacy_cf_presets.ts`, `translate/`).

Both module-def files contain all three components inline — module + metric + viz_preset. Where the github and installed shapes happen to be structurally identical at a sub-level (`vizPreset`, `metricAIDescription`), the schemas are duplicated across the two files. Each file reads top-to-bottom without jumping; ~40 lines of duplication is below the threshold where DRY wins.

**One-way edge: `presentation_object_config.ts` imports `configDStrict` and the `periodOption` / `disaggregationOption` enums from `_module_definition_installed.ts`.** PO config is downstream of module def in the data model (POs reference metrics from modules), so this direction is correct. Module-def files NEVER import from `presentation_object_config.ts`.

**Runtime types** (`ModuleDefinition`, `MetricDefinition`, `DefaultPresentationObject`, `ResultsValue`, `MetricWithStatus`, etc. — hand-authored types used in app code, derived from but not always identical to `z.infer<>`) live in `_module_definition_installed.ts`. The current `lib/types/module_definition.ts` is deleted; HFA runtime types and `get_PERIOD_OPTION_MAP` move to `_module_definition_installed.ts` too (or to a more appropriate home — see Step 4).

---

## Adapter inventory

Per-level adapters (all pure, typed, exported so they can be composed). Adapter names drop any lifecycle suffix — there's only one per concept:

In `_module_definition_installed.ts`:

- `adaptLegacyPeriodFilter(raw)` — filter-type migrations, strip fabricated bounds.
- `adaptLegacyConfigD(raw)` — `periodOpt` rename, nested `periodFilter` adaptation.
- `adaptLegacyConfigS(raw, isMap)` — detects legacy `conditionalFormatting: <preset-id-string>` and legacy map color fields (`mapColorPreset/From/To/Reverse/mapScaleType/mapDiscreteSteps/mapDomain*`); projects either into a `ConditionalFormatting` union via `LEGACY_CF_PRESETS` or `buildCfFromLegacyMapFields`; flattens that union through `flattenCf` and spreads flat `cf*` fields onto `s`; fills missing cf* fields from `CF_STORAGE_DEFAULTS`; fills `specialDisruptionsChart` from legacy `diffAreas` (Pattern 3); strips legacy fields.

  **Behaviour change vs current `po_config.ts` adapter** (worth calling out — this is a semantic shift, not just a move): **`cf*` overwrite semantics are inverted, on purpose.** Current code does `Object.assign(out, flattenCf(cf))` — flattened values from legacy always win over any pre-existing `cf*` fields on `out`. The new adapter only fills cf* keys that are **missing** (`if (!(key in out)) out[key] = value`), so rows already written with new-shape flat cf* fields keep them verbatim, and only legacy-shape rows get the flattened projection. Correct for steady state (new-shape writes must win) but diverges from current "legacy always normalizes downward" behavior.
- `adaptLegacyVizPresetTextConfig(raw)` — fill missing nullable text-config fields.
- `adaptLegacyMetricAIDescription(raw)` — fill missing `caveats`, `importantNotes`, `relatedMetrics`.
- `adaptLegacyVizPreset(raw)` — drop `defaultPeriodFilterForDefaultVisualizations`, fill missing required fields, walk into `config.d`/`config.s`/`config.t` applying their adapters (isMap derived from d.type). **New vs current `po_config.ts`:** current `adaptLegacyVizPresets` only walks `config.d` and `config.s`, never `config.t`. The new adapter additionally calls `adaptLegacyVizPresetTextConfig` on `config.t` so installed vizPresets with missing text-config fields survive the strict vizPreset validation. This is additive.
- `adaptLegacyMetricDefinition(raw)` — no current drift; placeholder.
- `adaptLegacyResultsObjectDefinition(raw)` — no current drift; placeholder.
- `adaptLegacyDefaultPresentationObject(raw)` — no current drift; placeholder.
- `adaptLegacyModuleDefinition(raw)` — fill top-level defaults; does **not** recurse into `metrics[]` or `defaultPresentationObjects[]` because nested preprocesses on `metricAIDescriptionInstalled` and `vizPresetInstalled` handle nested drift during strict validation.

In `presentation_object_config.ts`:

- `adaptLegacyPresentationObjectConfig(raw)` — walks `d` / `s`, calls `adaptLegacyConfigD` and `adaptLegacyConfigS` (with isMap derived from `d.type`) imported from `_module_definition_installed.ts`.

In `lib/types/reports.ts`:

- `adaptLegacyReportItemConfigShape` — pure shape adapter (layout 2D array → tree, `placeholder` → `text`). Not yet `z.preprocess`-wrapped because there is no Zod schema for `ReportItemConfig` yet (PLAN_5 Tier 1 deferred).

In `server/db/project/reports.ts`:

- `resolveLegacyReportMetricIds(config, projectDb)` — DB-dependent (`moduleId` → `metricId` lookup). Stays server-side.

---

## Validation surface — what gets Zod-parsed, and where

Reference table of every runtime Zod validation in the server + the AI tool path. The "Adapter attached" column says whether the parse runs through an adapter (via `z.preprocess` baking) — every "Yes" is a site where legacy-shape tolerance happens automatically; every "No" is strict-only.

| Type being parsed | Schema / helper used | Call site(s) | Adapter attached? |
|---|---|---|---|
| Module definition (installed blob in `modules.module_definition`) | `moduleDefinitionInstalledSchema` via `parseInstalledModuleDefinition(raw)` | 10 sites: 7 in `server/db/project/modules.ts`, 3 in `server/task_management/get_dependents.ts` | **Yes** — `adaptLegacyModuleDefinition` via z.preprocess. Nested preprocesses on `metricAIDescriptionInstalled` and `vizPresetInstalled` fire during strict validation of nested fields. |
| Module definition (authored `definition.json` from GitHub) | `moduleDefinitionGithubSchema` (strict) | 1 site: `server/module_loader/load_module.ts:123` | **No** — strict by design; authored files must match current shape. |
| Metric AI description (`metrics.ai_description` column) | `metricAIDescriptionInstalled` | 1 site: `server/db/project/metric_enricher.ts` | **Yes** — `adaptLegacyMetricAIDescription` via z.preprocess. |
| Viz presets array (`metrics.viz_presets` column) | `z.array(vizPresetInstalled)` | 1 site: `server/db/project/modules.ts:939` | **Yes** — per-element `adaptLegacyVizPreset` via z.preprocess. |
| PO config (reads — permissive) | `parseStoredPresentationObjectConfig(raw)` (safeParse + warn + fallback, wraps `presentationObjectConfigSchema`) | 5 sites in `server/db/project/presentation_objects.ts` (lines 145, 163, 202, 381, 492) | **Yes** — `adaptLegacyPresentationObjectConfig` via z.preprocess. |
| PO config (cache-hit) | same as above, inlined in route handler | 1 site: `server/routes/project/presentation_objects.ts:155` | **Yes** — same. |
| PO config (writes — strict) | `presentationObjectConfigSchema.parse(config)` (throws on invalid) | 3 sites: `server/db/project/presentation_objects.ts` (lines 67, 323, 387) | **Yes** — adapter runs (no-op on current-shape input), then strict validation. |
| Required disaggregation options (stored column) | `z.array(disaggregationOption)` | 1 site: `server/db/project/metric_enricher.ts` | **No** — primitive enum array, no drift. |
| Value props (stored column) | `z.array(z.string())` | 1 site: `server/db/project/metric_enricher.ts` | **No** — primitive array. |
| Post-aggregation expression (stored column) | `postAggregationExpression` (strict) | 1 site: `server/db/project/metric_enricher.ts` | **No** — no known drift. |
| Value-label replacements (stored column) | `z.record(z.string(), z.string())` | 1 site: `server/db/project/metric_enricher.ts` | **No** — primitive record. |
| Instance: max admin area config | `instanceConfigMaxAdminAreaSchema` (strict) | 1 site: `server/db/instance/config.ts:92` | **No** — no known drift. |
| Instance: facility columns config | `instanceConfigFacilityColumnsSchema` (strict) | 1 site: `server/db/instance/config.ts:138` | **No** — no known drift. |
| Instance: country ISO3 config | `instanceConfigCountryIso3Schema` (strict) | 1 site: `server/db/instance/config.ts:182` | **No** — no known drift. |
| Instance: admin area labels config | `instanceConfigAdminAreaLabelsSchema` (strict) | 1 site: `server/db/instance/config.ts:225` | **No** — no known drift. |
| AI tool inputs | Each tool's declared `inputSchema` via panther's `createAITool.run` (framework-level `.parse` baked into `tool_helpers.ts`) | Every tool call, universal | **N/A** — AI inputs are live; no persistence, no legacy shapes possible. Strict validation with `is_error: true` retry on failure. |
| Report item config (stored) | Pure adapter `adaptLegacyReportItemConfigShape` called explicitly before `parseJsonOrThrow` cast; no Zod schema yet | 2 sites: `server/db/project/reports.ts` (lines 359, 604) | Adapter runs; Zod schema pending (PLAN_5 Tier 1 deferred). |
| Report config, report summaries, other report JSON | `parseJsonOrThrow` cast only; no Zod | Multiple in `server/db/project/reports.ts` | **No schema, no adapter** — Tier 1 deferred. |
| Project info JSON | `parseJsonOrThrow` cast only | `server/db/project/projects.ts` | **No** — Tier 2 deferred. |
| Dataset staging / mapping JSON | `parseJsonOrThrow` cast only | `server/db/instance/dataset_hmis.ts`, `server/db/instance/dataset_hfa.ts` | **No** — Tier 2 deferred. |
| Worker-routine staging JSON | `parseJsonOrThrow` cast only | 4 files under `server/worker_routines/` | **No** — Tier 3 skipped. |

After this plan lands, every row in the upper portion of the table is Zod-validated with an adapter in front where drift is possible.

---

## Terminology

- **Strict schema** — `z.object({...})` with no drift tolerance. `*Strict` suffix where useful for disambiguation. No preprocess wrapper.
- **Preprocessed schema** — `z.preprocess(adapter, strictSchema)`. The exported public name at standalone DB-read entry points (`moduleDefinitionInstalledSchema`, `metricAIDescriptionInstalled`, `vizPresetInstalled`, `presentationObjectConfigSchema`).
- **Pure adapter** — `(raw: Record<string, unknown>) → Record<string, unknown>`. Zod strict validation on the returned shape catches any drift the adapter missed.
- **Convenience helper** — `parseInstalledX(raw: string): X`. `JSON.parse` + `schema.parse` + cast for branded types.
- **Permissive-read helper** — `parseStoredX(raw: unknown): X`. `safeParse` + warn + fallback. Only for domains where a parse failure must not throw (PO config per PLAN_5 item D).

---

## Inventory: current → target

| Current location | Target location | Action |
|---|---|---|
| `server/legacy_adapters/period_filter.ts` → `adaptLegacyPeriodFilter` | `lib/types/_module_definition_installed.ts` inline | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyConfigD` | `lib/types/_module_definition_installed.ts` inline | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyConfigS`, `buildCfFromLegacyMapFields`, `isLegacyCfPresetId`, `MAP_COLOR_PRESET_STOPS`, `MAP_NO_DATA_COLOR` | `lib/types/_module_definition_installed.ts` inline | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyPresentationObjectConfig` | `lib/types/presentation_object_config.ts` inline | MOVE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyVizPresets` | DELETED — per-element `vizPresetInstalled` preprocess subsumes it | DELETE |
| `server/legacy_adapters/po_config.ts` → `adaptLegacyPODetailResponse` | `server/routes/project/presentation_objects.ts` — inline at call site using the new permissive helper | INLINE |
| `server/legacy_adapters/report_item.ts` → `adaptLegacyReportItemConfigShape` + `LegacyReportItemConfig` + private `walkLayoutTree` | `lib/types/reports.ts` inline | MOVE |
| `server/legacy_adapters/report_item.ts` → `resolveLegacyReportMetricIds` + private `walkLayoutTreeAsync` | `server/db/project/reports.ts` inline | MOVE (stays server-side, DB-dependent) |
| `server/legacy_adapters/module_definition.ts` → `adaptLegacyModuleDefinition` | DELETED — preprocess on `moduleDefinitionInstalledSchema` subsumes it | DELETE |
| `server/legacy_adapters/mod.ts` | DELETED | DELETE |
| `lib/types/module_definition.ts` (current — both fetch + installed schemas, runtime types, HFA types) | SPLIT into `_module_definition_github.ts` + `_module_definition_installed.ts`; runtime + HFA types move into `_module_definition_installed.ts` | SPLIT/DELETE |
| Schema-level `.default()` / `.optional()` drift tolerance in `moduleDefinitionStoredSchema`, `metricDefinitionStoredSchema`, `metricAIDescriptionStored`, `vizPresetStored`, `vizPresetTextConfigStored` | REMOVED — drift tolerance moves into typed adapters | REWRITE |
| `parseModuleDefinition(raw: unknown)` helper | RENAMED to `parseInstalledModuleDefinition(raw: string)` | RENAME |

### Schema rename map

For grep convenience during execution:

| Old name | New name |
|---|---|
| `moduleDefinitionStoredSchema` | `moduleDefinitionInstalledSchema` |
| `moduleDefinitionStoredStrict` | `moduleDefinitionInstalledStrict` |
| `metricDefinitionStoredSchema` | `metricDefinitionInstalledSchema` |
| `metricDefinitionStoredStrict` | `metricDefinitionInstalledStrict` |
| `metricAIDescriptionStored` | `metricAIDescriptionInstalled` |
| `vizPresetStored` | `vizPresetInstalled` |
| `vizPresetTextConfigStored` | `vizPresetTextConfigInstalled` |
| `resultsObjectDefinitionStoredSchema` | `resultsObjectDefinitionInstalledSchema` |
| `resultsObjectDefinitionStoredStrict` | `resultsObjectDefinitionInstalledStrict` |
| `defaultPresentationObjectStoredSchema` | `defaultPresentationObjectInstalledSchema` |
| `defaultPresentationObjectStoredStrict` | `defaultPresentationObjectInstalledStrict` |
| `parseModuleDefinition` | `parseInstalledModuleDefinition` |
| `ModuleDefinitionJSONSchema` | `moduleDefinitionGithubSchema` |
| `metricDefinitionJSON` | `metricDefinitionGithub` |
| `vizPreset` (schema value) | `vizPresetGithub` (in `_github` file), `vizPresetInstalledStrict` (in `_installed` file inside the preprocess wrapper) |
| `metricAIDescription` (schema value) | `metricAIDescriptionGithub` (in `_github` file), `metricAIDescriptionInstalledStrict` (in `_installed` file inside the preprocess wrapper) |
| `configD`, `configS`, `vizPresetTextConfig` (current shared values) | Moved into `_module_definition_installed.ts` as `configDStrict`, `configSStrict`, `vizPresetTextConfigInstalledStrict`. Github file declares its own `configDGithubStrict`, `configSGithubStrict`, `vizPresetTextConfigGithubStrict` (structurally identical — duplicated, see "File structure"). |

`parseStoredPresentationObjectConfig` keeps "Stored" — different naming context (no install flow for PO config; "Stored" here just means "read from DB with permissive fallback").

---

## Execution order

Sequential. Each step self-contained within its domain. Steps 1–9 ship as one PR; Step 10 (the optional startup sweep) can land separately.

1. Step 1 — Create `lib/types/_module_definition_github.ts`.
2. Step 2 — Create `lib/types/_module_definition_installed.ts`.
3. Step 3 — Delete `lib/types/module_definition.ts` (its content is in the two new files).
4. Step 4 — Rewrite `lib/types/presentation_object_config.ts`.
5. Step 5 — Append legacy-adapter section to `lib/types/reports.ts`.
6. Step 6 — Move `resolveLegacyReportMetricIds` into `server/db/project/reports.ts`.
7. Step 7 — Update every call site (sub-steps below).
8. Step 8 — Delete `server/legacy_adapters/`.
9. Step 9 — Update `DOC_legacy_handling.md`.
10. Step 10 — Verify.
11. Step 11 (optional, follow-up PR) — Startup validation sweep.

---

## Step 1 — Create `lib/types/_module_definition_github.ts`

### 1.1 Purpose

Strict schema for module definitions as authored in GitHub repos and validated at fetch time by [server/module_loader/load_module.ts:123](server/module_loader/load_module.ts#L123). No drift tolerance, no preprocess. Authored `definition.json` files must match this shape exactly.

This file is a starting point in the import graph. It imports zod, translation primitives, and foundational atoms (`ALL_DISAGGREGATION_OPTIONS` from `presentation_objects.ts`). It does NOT import from `_module_definition_installed.ts` or any other peer schema file. Sub-shapes that happen to be structurally identical to the installed file (`vizPreset`, `metricAIDescription`) are **duplicated here on purpose** so the file reads top-to-bottom.

### 1.2 Final file content

Create `lib/types/_module_definition_github.ts` with the following content:

```ts
import { z } from "zod";
import { ALL_DISAGGREGATION_OPTIONS } from "./presentation_objects.ts";

// ============================================================================
// Module Definition — GITHUB SHAPE.
//
// Strict schema for module definitions as authored in GitHub repos. Validated
// at fetch time by load_module.ts. Strict-all-the-way-down: NO preprocess,
// NO drift tolerance, NO defaults for missing fields. Authored definition.json
// files must match this shape exactly — incomplete or legacy shapes get
// rejected with clear error paths.
//
// This file is a STARTING POINT in the import graph. It imports zod and
// foundational atoms only. It MUST NOT import from
// _module_definition_installed.ts or any other peer schema file. Where
// sub-shapes are structurally identical to the installed file, they are
// duplicated here on purpose.
// ============================================================================

// ── Atoms ───────────────────────────────────────────────────────────

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

const periodFilter = z
  .discriminatedUnion("filterType", [relativePeriodFilter, boundedPeriodFilter])
  .optional();

// ── Component schemas (config tree) ─────────────────────────────────

export const configDGithubStrict = z
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
    periodFilter: periodFilter,
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

// configS for github vizPresets: every field optional via .partial(). Github
// authors don't need to repeat all the cf* defaults — they just override what
// they want. The full cf storage shape is filled in by the install flow's cf
// defaults when the github file is loaded; if you change THIS file, also keep
// the corresponding configSInstalledStrict in _module_definition_installed.ts
// in lockstep.
import { cfStorageSchema as _cfStorageSchemaForGithubConfigS } from "./conditional_formatting.ts";

export const configSGithubStrict = z
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
  .merge(_cfStorageSchemaForGithubConfigS)
  .partial();

export const vizPresetTextConfigGithubStrict = z.object({
  caption: translatableString.nullable(),
  captionRelFontSize: z.number().nullable(),
  subCaption: translatableString.nullable(),
  subCaptionRelFontSize: z.number().nullable(),
  footnote: translatableString.nullable(),
  footnoteRelFontSize: z.number().nullable(),
});

// ── vizPreset (github) ──────────────────────────────────────────────

export const vizPresetGithub = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.nullable(),
  needsReplicant: z.boolean(),
  allowedFilters: z.array(disaggregationOption),
  createDefaultVisualizationOnInstall: z.string().nullable(),
  config: z.object({
    d: configDGithubStrict,
    s: configSGithubStrict,
    t: vizPresetTextConfigGithubStrict,
  }),
});

// ── metricAIDescription (github) ────────────────────────────────────

export const metricAIDescriptionGithub = z.object({
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

// ── metricDefinition (github) ───────────────────────────────────────

export const metricDefinitionGithub = z.object({
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
  aiDescription: metricAIDescriptionGithub.nullable(),
  importantNotes: translatableString.nullable(),
  vizPresets: z.array(vizPresetGithub),
  hide: z.boolean(),
});

// ── resultsObjectDefinition (github) ────────────────────────────────

export const resultsObjectDefinitionGithub = z.object({
  id: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.record(z.string(), z.string()),
});

// ── moduleDefinition (github — full file) ───────────────────────────

export const moduleDefinitionGithubSchema = z
  .object({
    label: translatableString,
    prerequisites: z.array(z.string()),
    scriptGenerationType: scriptGenerationType,
    dataSources: z.array(dataSource),
    configRequirements: configRequirements,
    assetsToImport: z.array(z.string()),
    resultsObjects: z.array(resultsObjectDefinitionGithub),
    metrics: z.array(metricDefinitionGithub),
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

// ── Derived types ───────────────────────────────────────────────────

export type ScriptGenerationType = z.infer<typeof scriptGenerationType>;
export type DataSource = z.infer<typeof dataSource>;
export type DataSourceDataset = z.infer<typeof dataSourceDataset>;
export type DataSourceResultsObject = z.infer<typeof dataSourceResultsObject>;
export type ModuleParameter = z.infer<typeof moduleParameter>;
export type ModuleConfigRequirements = z.infer<typeof configRequirements>;
export type ResultsObjectDefinitionGithub = z.infer<typeof resultsObjectDefinitionGithub>;
export type ValueFunc = z.infer<typeof valueFunc>;
export type PeriodOption = z.infer<typeof periodOption>;
export type PostAggregationExpression = z.infer<typeof postAggregationExpression>;
export type VizPresetTextConfigGithub = z.infer<typeof vizPresetTextConfigGithubStrict>;
export type VizPresetGithub = z.infer<typeof vizPresetGithub>;
export type MetricAIDescriptionGithub = z.infer<typeof metricAIDescriptionGithub>;
export type MetricDefinitionGithub = z.infer<typeof metricDefinitionGithub>;
export type ValidatedModuleDefinitionGithub = z.infer<typeof moduleDefinitionGithubSchema>;
export type ModuleDefinitionGithub = ValidatedModuleDefinitionGithub;

// Existing consumers used `ModuleDefinitionJSON` and
// `ResultsValueDefinitionJSON` aliases. Re-export under the old names so
// PR diff stays small.
export type ModuleDefinitionJSON = ModuleDefinitionGithub;
export type ResultsValueDefinitionJSON = MetricDefinitionGithub;
```

**Note on `_cfStorageSchemaForGithubConfigS`**: this aliased import is to allow `cfStorageSchema` to be referenced from a single source while making the local-only import clear. It's stylistic — the executor may inline it as a direct top-of-file import if preferred.

---

## Step 2 — Create `lib/types/_module_definition_installed.ts`

### 2.1 Purpose

Schemas for module definitions as written by the install flow. Includes:
- The full installed-blob schema (`moduleDefinitionInstalledSchema`) — read from `modules.module_definition`.
- Standalone preprocessed schemas for the columns denormalized by install: `metricAIDescriptionInstalled` (read from `metrics.ai_description`), `vizPresetInstalled` (read from `metrics.viz_presets`).
- Per-level adapters that handle drift on installed data.
- Convenience helper `parseInstalledModuleDefinition(raw: string)`.
- Hand-authored runtime types (`ModuleDefinition`, `MetricDefinition`, `DefaultPresentationObject`, `ResultsValue`, etc.) — these were in the old `module_definition.ts` and now live next to the schemas they're derived from.
- HFA runtime types and `get_PERIOD_OPTION_MAP` (also from the old `module_definition.ts`).

This file is a STARTING POINT in the import graph. It MUST NOT import from `_module_definition_github.ts` or `presentation_object_config.ts` or any other peer schema file.

### 2.2 Final file content

Create `lib/types/_module_definition_installed.ts` with the following content:

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
// Module Definition — INSTALLED SHAPE.
//
// Schemas for module definitions written by the install flow (see
// installModule in server/db/project/modules.ts and load_module.ts:
// translateMetrics). The install flow resolves translatable strings to plain
// strings on outer metric/module fields, strips nulls to undefined on
// install-strippable fields, and adds runtime fields (id, lastScriptUpdate,
// script, defaultPresentationObjects, moduleId on resultsObjects).
//
// Read from:
//   - modules.module_definition (full blob) → moduleDefinitionInstalledSchema
//   - metrics.ai_description (denormalized column) → metricAIDescriptionInstalled
//   - metrics.viz_presets (denormalized column) → vizPresetInstalled (per-element)
//
// Drift handling lives here via per-level adapters baked into z.preprocess.
//
// This file is a STARTING POINT in the import graph. It MUST NOT import from
// _module_definition_github.ts or any peer schema file. It imports zod,
// translation primitives, foundational atoms (conditional_formatting,
// legacy_cf_presets, presentation_objects' ALL_DISAGGREGATION_OPTIONS,
// module_registry's ModuleId, translate types) only.
// ============================================================================

// ── Atoms ───────────────────────────────────────────────────────────

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
// Adapters — pure, typed, per-level. Used by the preprocesses below and by
// presentation_object_config.ts (which imports adaptLegacyConfigD and
// adaptLegacyConfigS).
// ============================================================================

// ── periodFilter ────────────────────────────────────────────────────
const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

export function adaptLegacyPeriodFilter(
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
export function adaptLegacyConfigD(
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
    out.periodFilter = adaptLegacyPeriodFilter(
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

export function adaptLegacyConfigS(
  raw: Record<string, unknown>,
  isMap: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  // Capture any legacy-shape CF as a ConditionalFormatting union.
  let legacyCf: ConditionalFormatting | undefined;

  // (1) Legacy `conditionalFormatting: <preset-id-string>` (pre-flat-storage
  // refactor). Nested object shape was never shipped in storage, so no need
  // to handle it here — the only legacy value on this key is a string id.
  if ("conditionalFormatting" in out) {
    const cfRaw = out.conditionalFormatting;
    if (isLegacyCfPresetId(cfRaw)) {
      legacyCf = LEGACY_CF_PRESETS[cfRaw].value;
    }
    // Key has no home in the current shape — strip regardless.
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
  // specialDisruptionsChart from legacy diffAreas when missing. Keep
  // diffAreas in place because Pattern 3 dual-check sites still read it
  // (get_style_from_po.ts, _shared.tsx, _timeseries.tsx per
  // DOC_legacy_handling.md).
  if (!("specialDisruptionsChart" in out)) {
    out.specialDisruptionsChart = out.diffAreas === true;
  }

  return out;
}

// ── vizPresetTextConfig ─────────────────────────────────────────────
export function adaptLegacyVizPresetTextConfig(
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
export function adaptLegacyMetricAIDescription(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (!("caveats" in out)) out.caveats = null;
  if (!("importantNotes" in out)) out.importantNotes = null;
  if (!("relatedMetrics" in out)) out.relatedMetrics = [];
  return out;
}

// ── vizPreset ───────────────────────────────────────────────────────
// Walks into config.d / config.s / config.t — those sub-schemas are strict,
// so drift must be handled here.
export function adaptLegacyVizPreset(
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
      const d = adaptLegacyConfigD(cfg.d as Record<string, unknown>);
      isMap = (d as Record<string, unknown>).type === "map";
      cfg.d = d;
    } else {
      cfg.d = {};
    }
    if (cfg.s && typeof cfg.s === "object" && !Array.isArray(cfg.s)) {
      cfg.s = adaptLegacyConfigS(cfg.s as Record<string, unknown>, isMap);
    } else {
      cfg.s = {};
    }
    if (cfg.t && typeof cfg.t === "object" && !Array.isArray(cfg.t)) {
      cfg.t = adaptLegacyVizPresetTextConfig(
        cfg.t as Record<string, unknown>,
      );
    } else {
      cfg.t = adaptLegacyVizPresetTextConfig({});
    }
    out.config = cfg;
  } else {
    out.config = {
      d: {},
      s: {},
      t: adaptLegacyVizPresetTextConfig({}),
    };
  }

  return out;
}

// ── metricDefinition (no current drift) ─────────────────────────────
export function adaptLegacyMetricDefinition(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return { ...raw };
}

// ── resultsObjectDefinition (no current drift) ──────────────────────
export function adaptLegacyResultsObjectDefinition(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return { ...raw };
}

// ── defaultPresentationObject (no current drift) ────────────────────
export function adaptLegacyDefaultPresentationObject(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return { ...raw };
}

// ── moduleDefinition (top-level; fills top-level defaults only) ────
export function adaptLegacyModuleDefinition(
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
// Component strict schemas (configD, configS, vizPresetTextConfig).
// These are exported so presentation_object_config.ts can compose configDStrict
// into its own schema. The .partial() configS variant here is for vizPresets;
// PO config has its own non-partial configS in presentation_object_config.ts.
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
// `conditionalFormatting` field — flat storage refactor).
export const configSStrict = z
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

export const vizPresetTextConfigInstalledStrict = z.object({
  caption: translatableString.nullable(),
  captionRelFontSize: z.number().nullable(),
  subCaption: translatableString.nullable(),
  subCaptionRelFontSize: z.number().nullable(),
  footnote: translatableString.nullable(),
  footnoteRelFontSize: z.number().nullable(),
});

// ============================================================================
// Standalone preprocessed entry points — metricAIDescription + vizPreset.
// These are the schemas used at standalone DB-read sites:
//   - metric_enricher.ts reads metrics.ai_description → metricAIDescriptionInstalled.parse
//   - modules.ts reads metrics.viz_presets → z.array(vizPresetInstalled).parse
// They are also embedded inside metricDefinitionInstalledStrict so nested
// preprocesses fire when the full module definition is parsed.
// ============================================================================

export const metricAIDescriptionInstalledStrict = z.object({
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

export const metricAIDescriptionInstalled = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyMetricAIDescription(raw as Record<string, unknown>);
}, metricAIDescriptionInstalledStrict);

export const vizPresetInstalledStrict = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.nullable(),
  needsReplicant: z.boolean(),
  allowedFilters: z.array(disaggregationOption),
  createDefaultVisualizationOnInstall: z.string().nullable(),
  config: z.object({
    d: configDStrict,
    s: configSStrict,
    t: vizPresetTextConfigInstalledStrict,
  }),
});

export const vizPresetInstalled = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyVizPreset(raw as Record<string, unknown>);
}, vizPresetInstalledStrict);

// ============================================================================
// Outer strict schemas (resultsObject, metric, defaultPO, module).
// These reference the preprocessed Layer-5 entry points above for children
// that have their own drift (aiDescription, vizPresets[]).
// ============================================================================

export const resultsObjectDefinitionInstalledStrict = z.object({
  id: z.string(),
  moduleId: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.record(z.string(), z.string()).optional(),
});

export const metricDefinitionInstalledStrict = z.object({
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
  aiDescription: metricAIDescriptionInstalled.optional(),
  importantNotes: z.string().optional(),
  vizPresets: z.array(vizPresetInstalled).optional(),
  hide: z.boolean().optional(),
});

// `config` typed as z.unknown() to avoid a value-level cycle with
// presentation_object_config.ts. The PO config inside default presentation
// objects gets its dedicated validation at PO read sites via
// parseStoredPresentationObjectConfig.
export const defaultPresentationObjectInstalledStrict = z.object({
  id: z.string(),
  label: z.string(),
  moduleId: z.string(),
  metricId: z.string(),
  sortOrder: z.number(),
  config: z.unknown(),
});

export const moduleDefinitionInstalledStrict = z.object({
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
  resultsObjects: z.array(resultsObjectDefinitionInstalledStrict),
  metrics: z.array(metricDefinitionInstalledStrict),
  defaultPresentationObjects: z.array(defaultPresentationObjectInstalledStrict),
});

export const moduleDefinitionInstalledSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyModuleDefinition(raw as Record<string, unknown>);
}, moduleDefinitionInstalledStrict);

// ============================================================================
// Convenience helper for DB read call sites.
// ============================================================================

export function parseInstalledModuleDefinition(raw: string): ModuleDefinition {
  return moduleDefinitionInstalledSchema.parse(JSON.parse(raw)) as ModuleDefinition;
}

// ============================================================================
// Derived types (z.infer) and aliases for back-compat with existing imports.
// ============================================================================

export type ScriptGenerationType = z.infer<typeof scriptGenerationType>;
export type DataSource = z.infer<typeof dataSource>;
export type DataSourceDataset = z.infer<typeof dataSourceDataset>;
export type DataSourceResultsObject = z.infer<typeof dataSourceResultsObject>;
export type ModuleParameter = z.infer<typeof moduleParameter>;
export type ModuleConfigRequirements = z.infer<typeof configRequirements>;
export type ValueFunc = z.infer<typeof valueFunc>;
export type PeriodOption = z.infer<typeof periodOption>;
export type PostAggregationExpression = z.infer<typeof postAggregationExpression>;
export type VizPresetTextConfig = z.infer<typeof vizPresetTextConfigInstalledStrict>;
export type VizPreset = z.infer<typeof vizPresetInstalledStrict>;
export type MetricAIDescription = z.infer<typeof metricAIDescriptionInstalledStrict>;

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
// HFA runtime types — not Zod-validated. Kept in this file because the legacy
// home (module_definition.ts) is being deleted. If a more appropriate home
// exists (dataset_hfa.ts), the executor may move them — they're not coupled
// to module-definition concepts beyond the file they happened to live in.
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
// Runtime-enriched types — hand-authored (branded ModuleId, etc.). These
// are the in-app representations of installed module concepts.
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
```

---

## Step 3 — Delete `lib/types/module_definition.ts`

The two new files cover everything the old file held. Delete `lib/types/module_definition.ts`.

`lib/types/mod.ts` re-exports `* from` each file in `lib/types/`. Add the two new files to the barrel and remove the deleted file:

**Edit 3.1** — In `lib/types/mod.ts`, replace:

```ts
export * from "./module_definition.ts";
```

with:

```ts
export * from "./_module_definition_github.ts";
export * from "./_module_definition_installed.ts";
```

(Order matters because both files export overlapping atom names like `translatableString`, `dataSource`, `valueFunc`, etc. The second export wins for shadowed names. Since the installed file is what consumers want for runtime types, list it second so its exports take precedence on overlap. If TS complains about duplicate exports, prefix the github file's atoms with the file name when consumed elsewhere — none currently are, so this should be a non-issue.)

---

## Step 4 — Rewrite `lib/types/presentation_object_config.ts`

### 4.1 What changes

- Add `adaptLegacyPresentationObjectConfig` typed adapter. Delegates to `adaptLegacyConfigD` and `adaptLegacyConfigS` from `_module_definition_installed.ts`.
- Rename current exported schema to `presentationObjectConfigStrictSchema`.
- Add public preprocessed schema `presentationObjectConfigSchema = z.preprocess(adapter, presentationObjectConfigStrictSchema)`.
- Add `parseStoredPresentationObjectConfig(raw: unknown): PresentationObjectConfig` permissive helper (per PLAN_5 item D).

### 4.2 Final file content

Replace the entire contents of `lib/types/presentation_object_config.ts` with:

```ts
import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import {
  adaptLegacyConfigD,
  adaptLegacyConfigS,
  configDStrict,
} from "./_module_definition_installed.ts";

// ============================================================================
// PresentationObjectConfig — stored shape of a visualization config.
//
// POs are user-created via the UI (no install flow), so this file has no
// _github / _installed split. The "stored" terminology in
// parseStoredPresentationObjectConfig means "read from DB with permissive
// fallback" — different connotation than for module definitions.
//
// Imports from _module_definition_installed.ts (configDStrict + the periodFilter
// atoms transitively): one-way edge. PO config is downstream of module def
// in the data model.
// ============================================================================

export const customSeriesStyleSchema = z.object({
  color: z.string(),
  strokeWidth: z.number(),
  lineStyle: z.enum(["solid", "dashed"]),
});
export type CustomSeriesStyle = z.infer<typeof customSeriesStyleSchema>;

// PO config's `s` schema: all fields required (no .partial()). CF is merged
// in as flat cf* fields from cfStorageSchema (no nested
// `conditionalFormatting` field).
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

export function adaptLegacyPresentationObjectConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = { ...raw };
  const rawD =
    input.d && typeof input.d === "object" && !Array.isArray(input.d)
      ? (input.d as Record<string, unknown>)
      : {};
  const d = adaptLegacyConfigD(rawD);
  const isMap = (d as Record<string, unknown>).type === "map";
  const rawS =
    input.s && typeof input.s === "object" && !Array.isArray(input.s)
      ? (input.s as Record<string, unknown>)
      : {};
  const s = adaptLegacyConfigS(rawS, isMap);
  return { ...input, d, s };
}

// ── Strict + preprocessed public schemas ────────────────────────────

export const presentationObjectConfigStrictSchema = z.object({
  d: configDStrict,
  s: presentationObjectConfigSStrict,
  t: presentationObjectConfigTStrict,
});

export const presentationObjectConfigSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyPresentationObjectConfig(
    raw as Record<string, unknown>,
  );
}, presentationObjectConfigStrictSchema);

export type PresentationObjectConfig = z.infer<
  typeof presentationObjectConfigSchema
>;

// ── Permissive-read helper (per PLAN_5 item D) ─────────────────────
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
  return adaptLegacyPresentationObjectConfig(
    raw as Record<string, unknown>,
  ) as PresentationObjectConfig;
}
```

---

## Step 5 — Append legacy-adapter section to `lib/types/reports.ts`

### 5.1 What changes

- Move `LegacyReportItemConfig` type from `server/legacy_adapters/report_item.ts`.
- Move `adaptLegacyReportItemConfigShape` function from `server/legacy_adapters/report_item.ts`.
- Move private `walkLayoutTree` helper (rename to `_walkReportItemLayoutTree` to signal "local private").
- No Zod schema for reports in this plan — that's PLAN_5 Tier 1 (deferred).

### 5.2 Append to the end of `lib/types/reports.ts`

Append the following block at the end of the file (after the existing `getStartingReportItemPlaceholder` function):

```ts
// ============================================================================
// Legacy report-item config — pure shape adapter.
// No Zod schema for ReportItemConfig yet (PLAN_5 Tier 1 deferred). Callers
// invoke this adapter explicitly before passing the result downstream:
//   adaptLegacyReportItemConfigShape(parseJsonOrThrow(rawReportItem.config))
// When a Zod schema is added, wrap it with
//   z.preprocess(adaptLegacyReportItemConfigShape, reportItemConfigStrict)
// per the per-level preprocess pattern in PLAN_6.
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

**Note on exported `LegacyReportItemConfig`**: this type is currently private inside `server/legacy_adapters/report_item.ts`. Moving it to `lib/types/reports.ts` and exporting it adds a new public type to lib via `mod.ts`'s `export *`. If you don't want it public, prefix with `_` (`_LegacyReportItemConfig`) — `export *` still exports underscore-prefixed names but the convention signals "internal use".

---

## Step 6 — Move `resolveLegacyReportMetricIds` into `server/db/project/reports.ts`

### 6.1 What changes

- Move `resolveLegacyReportMetricIds` and its private helper `walkLayoutTreeAsync` from `server/legacy_adapters/report_item.ts` into `server/db/project/reports.ts`.
- Update imports in `server/db/project/reports.ts`:
  - Remove the `adaptLegacyReportItemConfigShape` import from `server/legacy_adapters/` — it now comes from `lib`.
  - Remove the `resolveLegacyReportMetricIds` import entirely — it's defined locally.

### 6.2 Edits to `server/db/project/reports.ts`

**Edit 6.2.a** — Find the existing import block (lines 22–25):

```ts
import {
  adaptLegacyReportItemConfigShape,
  resolveLegacyReportMetricIds,
} from "../../legacy_adapters/mod.ts";
```

Delete the entire block. Then, in the existing `"lib"` import block at the top of the file (which already imports `ReportItemConfig`, `ReportItemContentItem`, etc.), add `adaptLegacyReportItemConfigShape` to the import list.

**Edit 6.2.b** — Append the following block at the end of `server/db/project/reports.ts`:

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

`LayoutNode` and `Sql` are already imported at the top of the file — no new imports needed.

---

## Step 7 — Update every call site

### 7.1 `server/db/project/metric_enricher.ts`

**Edit 7.1.a** — In the `import ... from "lib"` block, replace `metricAIDescriptionStored` with `metricAIDescriptionInstalled`.

**Edit 7.1.b** — At line 54, replace:

```ts
      ? metricAIDescriptionStored.parse(JSON.parse(dbMetric.ai_description))
```

with:

```ts
      ? metricAIDescriptionInstalled.parse(JSON.parse(dbMetric.ai_description))
```

### 7.2 `server/db/project/modules.ts`

**Edit 7.2.a** — In the `import ... from "lib"` block, replace `parseModuleDefinition,` with `parseInstalledModuleDefinition,` and `vizPresetStored,` with `vizPresetInstalled,`.

**Edit 7.2.b** — Delete the line:

```ts
import { adaptLegacyModuleDefinition, adaptLegacyVizPresets } from "../../legacy_adapters/mod.ts";
```

**Edit 7.2.c** — Replace every occurrence of the 3-line block:

```ts
parseModuleDefinition(
      adaptLegacyModuleDefinition(JSON.parse(rawModule.module_definition)),
    )
```

with:

```ts
parseInstalledModuleDefinition(rawModule.module_definition)
```

Applies at 6 occurrences (lines ~244–246, ~494–496, ~566–568, ~662–664, ~969–971, ~1007–1009).

**Edit 7.2.d** — Replace the single-line occurrence (line ~312):

```ts
    const storedDef = parseModuleDefinition(adaptLegacyModuleDefinition(JSON.parse(rawModule.module_definition)));
```

with:

```ts
    const storedDef = parseInstalledModuleDefinition(rawModule.module_definition);
```

**Edit 7.2.e** — Replace the viz_presets parse (lines ~937–940):

```ts
        vizPresets: dbMetric.viz_presets
          ? z.array(vizPresetStored).parse(adaptLegacyVizPresets(JSON.parse(dbMetric.viz_presets)))
          : undefined,
```

with:

```ts
        vizPresets: dbMetric.viz_presets
          ? z.array(vizPresetInstalled).parse(JSON.parse(dbMetric.viz_presets))
          : undefined,
```

(The `adaptLegacyVizPresets` call is removed — per-element `vizPresetInstalled` preprocess handles it automatically.)

### 7.3 `server/db/project/presentation_objects.ts`

**Edit 7.3.a** — Replace the import line (~line 23):

```ts
import { adaptLegacyPresentationObjectConfig } from "../../legacy_adapters/mod.ts";
```

with:

```ts
import { parseStoredPresentationObjectConfig } from "lib";
```

**Edit 7.3.b** — Replace every occurrence of:

```ts
adaptLegacyPresentationObjectConfig(parseJsonOrThrow(row.config))
```

with:

```ts
parseStoredPresentationObjectConfig(parseJsonOrThrow(row.config))
```

Applies at lines ~145, ~163, ~492 (3 occurrences where the variable is `row.config`).

**Note**: the plan keeps `parseJsonOrThrow(...)` rather than swapping to bare `JSON.parse(...)`. `parseJsonOrThrow` adds context to JSON-parse errors — preserving it preserves error-message quality at no cost.

**Edit 7.3.c** — Replace:

```ts
adaptLegacyPresentationObjectConfig(parseJsonOrThrow(rawPresObj.config))
```

with:

```ts
parseStoredPresentationObjectConfig(parseJsonOrThrow(rawPresObj.config))
```

(Line ~202, 1 occurrence with `rawPresObj.config`.)

**Edit 7.3.d** — Replace:

```ts
          adaptLegacyPresentationObjectConfig(parseJsonOrThrow(result[0].config));
```

with:

```ts
          parseStoredPresentationObjectConfig(parseJsonOrThrow(result[0].config));
```

(Line ~381, 1 occurrence with `result[0].config`.)

**Edit 7.3.e** — Strict-write sites at lines ~67, ~323, ~387 use `presentationObjectConfigSchema.parse(config)`. **No change needed.** The schema is now preprocessed; adapter runs (no-op on current shape), then strict validation. If `config` is current-shape (editor save), the adapter is idempotent identity. If legacy-shape, the adapter normalizes first. (Line numbers per audit on 2026-04-20; resync at edit time if they've drifted.)

### 7.4 `server/task_management/get_dependents.ts`

**Edit 7.4.a** — Replace the import block:

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
  parseInstalledModuleDefinition,
  type DatasetType,
} from "lib";
```

**Edit 7.4.b** — Replace (2 occurrences, lines ~33–35 and ~64–66):

```ts
    const modDef = parseModuleDefinition(
      adaptLegacyModuleDefinition(JSON.parse(rawModule.module_definition))
    );
```

with:

```ts
    const modDef = parseInstalledModuleDefinition(rawModule.module_definition);
```

**Edit 7.4.c** — Replace (line ~126–128):

```ts
  const moduleDefinition = parseModuleDefinition(
    adaptLegacyModuleDefinition(JSON.parse(thisMod.module_definition))
  );
```

with:

```ts
  const moduleDefinition = parseInstalledModuleDefinition(thisMod.module_definition);
```

### 7.5 `server/db/project/reports.ts`

Already covered in Step 6. No additional edits at this step.

### 7.6 `server/routes/project/presentation_objects.ts`

**Edit 7.6.a** — Replace (line ~16):

```ts
import { adaptLegacyPODetailResponse } from "../../legacy_adapters/mod.ts";
```

with:

```ts
import { parseStoredPresentationObjectConfig } from "lib";
```

**Edit 7.6.b** — Replace (line ~155):

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

**Alternative (equally acceptable):** keep a thin local helper in the route file that matches `adaptLegacyPODetailResponse`'s current signature but delegates to `parseStoredPresentationObjectConfig` internally. Preserves the call site `return c.json(adaptLegacyPODetailResponse(existing))` unchanged and localizes the inlined unwrapping to a helper body. Either pattern is fine — pick whichever matches the route file's existing style.

### 7.7 `server/module_loader/load_module.ts`

**Edit 7.7.a** — In the import from `lib`, replace `ModuleDefinitionJSONSchema` with `moduleDefinitionGithubSchema` (or keep the old name as an alias if preferred; the rename map in the inventory section above shows `ModuleDefinitionJSONSchema` → `moduleDefinitionGithubSchema`). At the call site (line ~123), update the schema name.

If the executor wants to minimize diff, add a back-compat alias `export { moduleDefinitionGithubSchema as ModuleDefinitionJSONSchema } from "./_module_definition_github.ts"` somewhere — but the canonical name should be the new one.

---

## Step 8 — Delete `server/legacy_adapters/`

### 8.1 Delete files

Remove these files:

- `server/legacy_adapters/mod.ts`
- `server/legacy_adapters/module_definition.ts`
- `server/legacy_adapters/period_filter.ts`
- `server/legacy_adapters/po_config.ts`
- `server/legacy_adapters/report_item.ts`

Then remove the `server/legacy_adapters/` directory itself.

### 8.2 Verify no stragglers

```bash
grep -rn "legacy_adapters" server/ lib/ client/ panther/ 2>/dev/null
```

Must return zero hits.

---

## Step 9 — Update `DOC_legacy_handling.md`

### 9.1 Replace the "Location" paragraph (line ~25)

Find:

```
**Location:** all server-side legacy adapters live in [server/legacy_adapters/](server/legacy_adapters/). This is the canonical folder — when adding a new adapter, put it here. Co-located with [server/db/migrations/](server/db/migrations/) and the Pattern 4 startup migrations in [server/db_startup.ts](server/db_startup.ts) so legacy handling is discoverable as a category.
```

Replace with:

```
**Location:** every pure legacy adapter is colocated with its Zod schema in `lib/types/<domain>.ts`. Files that manage drift use an underscore prefix (`_module_definition_github.ts`, `_module_definition_installed.ts`) to group at the top of the directory and signal "this file owns a drift-tolerant schema". When you change a type, the adapter is in the same file. When you discover a new drift variant, add it to the appropriate `adaptLegacy<X>` function in that file. Adapters are baked into the public schema via `z.preprocess(adapter, strictSchema)`, so every `.parse` / `.safeParse` on the schema runs the adapter automatically — callers cannot bypass it.

DB-dependent legacy resolutions (adapters that need a database connection, filesystem access, or network) stay in the server code next to their callers. Currently: `resolveLegacyReportMetricIds` in [server/db/project/reports.ts](server/db/project/reports.ts).

**GitHub schemas stay strict.** `_module_definition_github.ts` never references preprocessed schemas. Authored `definition.json` files must match the current shape exactly — no silent normalization at fetch time.
```

### 9.2 Replace the wiring-rule block (lines ~29–34)

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

- **DB read sites.** Call the domain's `parseInstalled<X>` or `parseStored<X>` helper (or `<X>Schema.parse(JSON.parse(raw))` if you want strict-throw instead of permissive-read). Adapter runs, then strict validation.
- **Cache-hit sites.** Same helper. Idempotent adapters mean double-running is a no-op.
- **Write sites.** Use `.parse` on the public schema (throws on invalid). Current-shape writes pass through the adapter unchanged. The rare legacy-shape write gets normalized before validation.

**Adapter purity contract.** Adapters MUST be pure functions — same output for same input, no side effects, no external state, no mutation of shared references. They WILL be called multiple times on the same data across a request (nested preprocess firing, cache-hit re-validation, defensive re-parse). Violations cause subtle bugs.
```

### 9.3 Replace the "Active adapters" list (lines ~44–62)

Find the block starting `**Active adapters in [server/legacy_adapters/](server/legacy_adapters/):**` and ending at the end of the `report_item.ts` bullet. Replace with:

```
**Active adapter inventory (colocated with schemas):**

- [lib/types/_module_definition_installed.ts](lib/types/_module_definition_installed.ts) — module-definition family. Preprocess entry points: `metricAIDescriptionInstalled`, `vizPresetInstalled`, `moduleDefinitionInstalledSchema`. Per-level adapters (all pure, typed, exported so they can be composed):
  - `adaptLegacyPeriodFilter` — `last_12_months` → `last_n_months+nMonths:12`; fill `filterType: "custom"` when undefined; strip fabricated bounds from relative types.
  - `adaptLegacyConfigD` — rename legacy `periodOpt` → `timeseriesGrouping`; nested periodFilter adaptation.
  - `adaptLegacyConfigS(raw, isMap)` — detects legacy `s.conditionalFormatting` (string preset id via `LEGACY_CF_PRESETS`); detects legacy map color fields (only when `isMap`, via `buildCfFromLegacyMapFields`); flattens any captured CF union via `flattenCf` into flat `cf*` fields on `s`; fills missing cf* fields from `CF_STORAGE_DEFAULTS`; fills `specialDisruptionsChart` from legacy `diffAreas` (Pattern 3); strips legacy `conditionalFormatting` and all map* fields. Parent adapters provide `isMap` from sibling `d.type`. Note: cf* overwrite semantics inverted vs old `po_config.ts` adapter — new-shape rows with cf* fields keep them; only missing cf* keys get filled.
  - `adaptLegacyVizPresetTextConfig` — fill missing nullable text-config fields.
  - `adaptLegacyMetricAIDescription` — fill missing `caveats`, `importantNotes`, `relatedMetrics`.
  - `adaptLegacyVizPreset` — drop `defaultPeriodFilterForDefaultVisualizations`; fill missing required fields; walk into `config.d`/`config.s`/`config.t`.
  - `adaptLegacyModuleDefinition` — fill top-level defaults (scriptGenerationType, dataSources, metrics, etc.). Does NOT recurse into metrics[] — nested `metricAIDescriptionInstalled` and `vizPresetInstalled` preprocesses handle nested drift when strict validation runs.
  - `adaptLegacyMetricDefinition`, `adaptLegacyResultsObjectDefinition`, `adaptLegacyDefaultPresentationObject` — currently identity (placeholders for future transforms; keep the shape so future adapters land in one predictable place).
  - Call sites: `parseInstalledModuleDefinition(raw: string)` convenience helper in the same file; 10 read sites across [server/db/project/modules.ts](server/db/project/modules.ts) and [server/task_management/get_dependents.ts](server/task_management/get_dependents.ts); viz_presets-column read uses `z.array(vizPresetInstalled).parse(...)`; AI-description-column read uses `metricAIDescriptionInstalled.parse(...)`.

- [lib/types/_module_definition_github.ts](lib/types/_module_definition_github.ts) — module-definition github shape. Strict, no preprocess. Single call site: `moduleDefinitionGithubSchema.safeParse(...)` at [server/module_loader/load_module.ts:123](server/module_loader/load_module.ts#L123). Authored `definition.json` files must match this shape exactly.

- [lib/types/presentation_object_config.ts](lib/types/presentation_object_config.ts) — PO config. Preprocess entry point: `presentationObjectConfigSchema`. Adapter `adaptLegacyPresentationObjectConfig` delegates to `adaptLegacyConfigD` and `adaptLegacyConfigS` from `_module_definition_installed.ts`. Permissive-read helper `parseStoredPresentationObjectConfig(raw: unknown)` (safeParse + warn + fallback) per PLAN_5 item D.
  - Call sites: 5 DB read sites in [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts); 1 cache-hit site in [server/routes/project/presentation_objects.ts](server/routes/project/presentation_objects.ts); 3 strict-write sites in [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts) use `presentationObjectConfigSchema.parse(config)` directly.

- [lib/types/reports.ts](lib/types/reports.ts) — report-item shape adapter `adaptLegacyReportItemConfigShape`. Called explicitly at 2 read sites in [server/db/project/reports.ts](server/db/project/reports.ts); **not yet `z.preprocess`-wrapped** because there is no Zod schema for `ReportItemConfig` (PLAN_5 Tier 1 deferred). When the schema lands, wrap it per the per-level preprocess pattern and remove the explicit adapter call.

- [server/db/project/reports.ts](server/db/project/reports.ts) — DB-dependent legacy resolution `resolveLegacyReportMetricIds(config, projectDb)` (`moduleId` → `metricId` lookup). Stays server-side. Chained with the pure shape adapter at the 2 read sites.
```

### 9.4 Update the cleanup audit table

Find the `po_config.ts` row in the cleanup audit table (~line 216):

```
| Legacy CF string-preset + map-color-field adapter transforms in `po_config.ts` (`adaptLegacyConfigS`, `LEGACY_CF_PRESETS` usage, `buildCfFromLegacyMapFields`) | Once every deployed project has re-saved affected configs, or a Pattern 4 forces it |
```

Replace with:

```
| Legacy CF string-preset + map-color-field adapter transforms in `lib/types/_module_definition_installed.ts` (`adaptLegacyConfigS`, `LEGACY_CF_PRESETS` usage, `buildCfFromLegacyMapFields`) | Once every deployed project has re-saved affected configs, or a Pattern 4 forces it |
```

---

## Step 10 — Verification

### 10.1 Typecheck

```bash
deno task typecheck
```

Server typecheck must pass with zero errors.

### 10.2 No legacy_adapters references remain

```bash
grep -rn "legacy_adapters" server/ lib/ client/ panther/ 2>/dev/null
```

Must return zero hits.

### 10.3 No stale schema names remain

```bash
grep -rn "parseModuleDefinition\|moduleDefinitionStoredSchema\|metricAIDescriptionStored\|vizPresetStored\|vizPresetTextConfigStored\|ModuleDefinitionJSONSchema\b" server/ lib/ client/ 2>/dev/null
```

Must return zero hits (other than possibly intentional back-compat aliases the executor chose to keep).

### 10.4 Public-API usage verification

```bash
grep -rn "parseInstalledModuleDefinition\|parseStoredPresentationObjectConfig" server/ lib/ 2>/dev/null | wc -l
```

Expected: `parseInstalledModuleDefinition` appears 11 times (10 call sites + 1 definition); `parseStoredPresentationObjectConfig` appears 7 times (5 read sites in presentation_objects.ts + 1 in routes/presentation_objects.ts + 1 definition). Total 18 lines. Ensure these counts match.

### 10.5 No remaining explicit adapter calls in server code

```bash
grep -rn "adaptLegacy" server/ lib/ 2>/dev/null
```

Expected matches (definitions only, no call sites in server code):

- `lib/types/_module_definition_installed.ts`: definitions of the 10 `adaptLegacy*` functions (10 hits). No call sites.
- `lib/types/presentation_object_config.ts`: 1 definition + 1 internal call from `parseStoredPresentationObjectConfig` fallback (2 hits).
- `lib/types/reports.ts`: 1 definition (1 hit).
- `server/db/project/reports.ts`: 2 explicit call sites (reports not yet preprocessed — Tier 1 deferred).

Total ~16 hits, all either definitions in lib or the 2 report-item explicit call sites.

### 10.6 Runtime sanity

- **Open a project** — `parseInstalledModuleDefinition` must succeed on every row in `modules.module_definition` across all projects.
- **Open a visualization** — `parseStoredPresentationObjectConfig` must succeed or fall back with a structured warning on every row in `presentation_objects.config`.
- **Edit and save a visualization** — `presentationObjectConfigSchema.parse(config)` (strict-write) must accept the editor's current-shape output with no transform visible in the saved JSON.
- **Fetch a module from GitHub** — `moduleDefinitionGithubSchema.safeParse(definition)` at `load_module.ts:123` must remain strict. Authored `definition.json` files that omit required fields or contain legacy field names (e.g., `periodOpt`, string `conditionalFormatting`) must fail validation with clear error paths.

---

## Step 11 — Startup validation sweep (optional but recommended)

### 11.1 Purpose

Catch schema drift at server startup — before any user interacts with a stale row. Read-only: iterates every stored row, parses against its schema, records failures, **never re-saves**. Doesn't crash boot on failure; logs structured issues and continues. Opt-in via env var.

Benefits:

- Drift surfaces immediately at deploy time, not when a user happens to open a project. Turns a "mysterious bug report an hour later" into "this shape is broken at boot, here's the row."
- Batch audit in one place. The sweep's output is an actionable list of rows needing fixes, with exact field paths.
- Uses the same adapter-then-validate path as runtime — a passing sweep means runtime has no adapter-related surprises.
- **Especially valuable for first deploy after this PR**, given the cf* overwrite semantics inversion (see "Issues to address" below). Surfaces any in-wild rows that have both new-shape `cf*` AND a stale legacy `conditionalFormatting` from a partial save.

Caveats:

- Cost scales with DB size. A large deployment might pay measurable startup time. Opt-in flag keeps it out of the default path.
- Valkey sweep depends on the cache's key-listing API and entry count; mirror the DB sweep pattern once cache-iteration support is confirmed.

### 11.2 New file: `server/db_startup_validation.ts`

Create a new file at `server/db_startup_validation.ts` with the following content:

```ts
import { z } from "zod";
import type { Sql } from "postgres";
import {
  instanceConfigAdminAreaLabelsSchema,
  instanceConfigCountryIso3Schema,
  instanceConfigFacilityColumnsSchema,
  instanceConfigMaxAdminAreaSchema,
  metricAIDescriptionInstalled,
  moduleDefinitionInstalledSchema,
  presentationObjectConfigSchema,
  vizPresetInstalled,
} from "lib";

// Opt-in env gate. Set VALIDATE_ON_STARTUP=true to run.
const SHOULD_RUN = Deno.env.get("VALIDATE_ON_STARTUP") === "true";

type Issue = {
  scope: "instance" | "project";
  project?: string;
  table: string;
  rowId: string;
  issues: string;
};

function formatZodError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

// Parameter names match `server/db_startup.ts` conventions: `sqlMain` for
// the main DB handle, `getPgConnectionFromCacheOrNew` for the per-project
// resolver.
export async function validateStoredDataOnStartup(
  sqlMain: Sql,
  getPgConnectionFromCacheOrNew: (projectId: string) => Sql,
): Promise<void> {
  if (!SHOULD_RUN) return;

  const startedAt = Date.now();
  const issues: Issue[] = [];
  let rowsScanned = 0;

  // ── Instance configs (main DB) ─────────────────────────────────────
  const INSTANCE_CONFIG_SCHEMAS: Record<string, z.ZodSchema> = {
    max_admin_area: instanceConfigMaxAdminAreaSchema,
    facility_columns: instanceConfigFacilityColumnsSchema,
    country_iso3: instanceConfigCountryIso3Schema,
    admin_area_labels: instanceConfigAdminAreaLabelsSchema,
  };
  const configs = await sqlMain<{ config_key: string; config_json_value: string }[]>`
    SELECT config_key, config_json_value FROM instance_config
  `;
  for (const c of configs) {
    const schema = INSTANCE_CONFIG_SCHEMAS[c.config_key];
    if (!schema) continue;
    rowsScanned++;
    try {
      schema.parse(JSON.parse(c.config_json_value));
    } catch (e) {
      issues.push({
        scope: "instance",
        table: "instance_config",
        rowId: c.config_key,
        issues: formatZodError(e),
      });
    }
  }

  // ── Per-project DBs ────────────────────────────────────────────────
  const projects = await sqlMain<{ id: string }[]>`SELECT id FROM projects`;
  for (const p of projects) {
    const projectDb = getPgConnectionFromCacheOrNew(p.id);

    // modules.module_definition
    const modules = await projectDb<{ id: string; module_definition: string }[]>`
      SELECT id, module_definition FROM modules
    `;
    for (const m of modules) {
      rowsScanned++;
      try {
        moduleDefinitionInstalledSchema.parse(JSON.parse(m.module_definition));
      } catch (e) {
        issues.push({
          scope: "project",
          project: p.id,
          table: "modules.module_definition",
          rowId: m.id,
          issues: formatZodError(e),
        });
      }
    }

    // metrics.ai_description + metrics.viz_presets
    const metrics = await projectDb<
      { id: string; ai_description: string | null; viz_presets: string | null }[]
    >`SELECT id, ai_description, viz_presets FROM metrics`;
    for (const m of metrics) {
      if (m.ai_description) {
        rowsScanned++;
        try {
          metricAIDescriptionInstalled.parse(JSON.parse(m.ai_description));
        } catch (e) {
          issues.push({
            scope: "project",
            project: p.id,
            table: "metrics.ai_description",
            rowId: m.id,
            issues: formatZodError(e),
          });
        }
      }
      if (m.viz_presets) {
        rowsScanned++;
        try {
          z.array(vizPresetInstalled).parse(JSON.parse(m.viz_presets));
        } catch (e) {
          issues.push({
            scope: "project",
            project: p.id,
            table: "metrics.viz_presets",
            rowId: m.id,
            issues: formatZodError(e),
          });
        }
      }
    }

    // presentation_objects.config (strict parse — NOT the permissive helper,
    // so every drift surfaces. Runtime uses the permissive helper for reads;
    // the sweep is the audit path that demands strict success.)
    const pos = await projectDb<{ id: string; config: string }[]>`
      SELECT id, config FROM presentation_objects
    `;
    for (const po of pos) {
      rowsScanned++;
      try {
        presentationObjectConfigSchema.parse(JSON.parse(po.config));
      } catch (e) {
        issues.push({
          scope: "project",
          project: p.id,
          table: "presentation_objects.config",
          rowId: po.id,
          issues: formatZodError(e),
        });
      }
    }
  }

  // ── Valkey sweep (optional — implement when cache iteration is wired) ──
  // Iterate cached PO detail entries and parse .data.config against
  // presentationObjectConfigSchema. Same issue-reporting pattern.

  // ── Summary ────────────────────────────────────────────────────────
  const elapsed = Date.now() - startedAt;
  console.log(
    `[validate] scanned ${rowsScanned} rows across ${projects.length} project(s) in ${elapsed}ms`,
  );
  if (issues.length === 0) {
    console.log(`[validate] no drift detected — all stored rows match current schemas`);
    return;
  }
  console.warn(
    `[validate] ${issues.length} drift issue(s) detected. Each is an actionable pointer to a row that needs adapter extension or data fix:`,
  );
  for (const issue of issues) {
    console.warn(
      `[validate]`,
      JSON.stringify(issue),
    );
  }
}
```

### 11.3 Wire into `server/db_startup.ts`

After the migrations block in `server/db_startup.ts`, before the server starts accepting requests, add:

```ts
import { validateStoredDataOnStartup } from "./db_startup_validation.ts";

// ... after migrations ...

await validateStoredDataOnStartup(sqlMain, getPgConnectionFromCacheOrNew);
```

The local variable names (`sqlMain`, `getPgConnectionFromCacheOrNew`) match what's already in `server/db_startup.ts`. If those names drift at edit time, rename in 11.2's function signature + invocation — the behaviour doesn't depend on the names.

### 11.4 Operational notes

- **Default off.** Set `VALIDATE_ON_STARTUP=true` in environments where you want the sweep. **Recommended ON for first deploy after this PR** — catches the cf* overwrite semantic shift in a controlled way.
- **Output is structured console warnings.** If you have log aggregation, grep for `[validate]` to collect audit reports.
- **Exit behaviour.** The sweep never throws. Drift doesn't block startup. The intent is observability, not gating.
- **Don't re-save from the sweep.** That's a separate, deliberate migration concern (Pattern 4) and should be an explicit user-initiated operation, not a silent side-effect of reading.
- **Connection lifetime.** `getPgConnectionFromCacheOrNew` iterates every project — verify in `server/db/postgres/connection_manager.ts` that the pool doesn't retain N persistent handles after the sweep completes. If the cached connections are kept alive post-sweep, enabling `VALIDATE_ON_STARTUP` adds a permanent N-connection footprint on every boot. If that's a problem, either release the handles at the end of the sweep or use short-lived connections within `validateStoredDataOnStartup`.

### 11.5 Scope boundary

This sweep only validates types that already have Zod schemas — i.e., everything in the upper portion of the "Validation surface" table. Types without schemas (reports / project info / dataset staging / worker routines) don't get swept because there's nothing to parse against. Once those types land Zod schemas (Tier 1 deferred work), add them to the sweep.

---

## Step 12 — Follow-up: convert PO config to strict (drop the permissive helper)

### 12.1 Why this is a separate follow-up

The initial PR keeps the permissive-read helper (`parseStoredPresentationObjectConfig`) for PO config because today's `adaptLegacyPresentationObjectConfig` has `safeParse → warn → fallback` baked into its body. Preserving that behaviour during the colocation refactor reduces risk: behaviour-change and structural-change land separately.

Once Steps 1–11 have shipped and the startup sweep (Step 11) has run clean against deployed data, the permissive helper becomes unnecessary. This step removes it.

### 12.2 What changes

- Delete `parseStoredPresentationObjectConfig` from `lib/types/presentation_object_config.ts`.
- Add a strict convenience helper `parsePresentationObjectConfig(raw: string): PresentationObjectConfig` — `JSON.parse` + `presentationObjectConfigSchema.parse`. Throws on invalid.
- Update the 5 read sites in `server/db/project/presentation_objects.ts` (lines 145, 163, 202, 381, 492) to call `parsePresentationObjectConfig(row.config)` (or `parsePresentationObjectConfig(rawPresObj.config)` / `parsePresentationObjectConfig(result[0].config)` as appropriate). Note: the helper now takes a raw string and does JSON parsing internally — drop the `parseJsonOrThrow(...)` wrapper at these sites.
- Update the cache-hit site in `server/routes/project/presentation_objects.ts` (line ~155) to use the strict helper (or inline the parse). Parse failure at a cache-hit site means a stale cache entry — acceptable to throw; the subsequent cache miss will re-derive.
- Writes at lines 67, 323, 387 continue to use `presentationObjectConfigSchema.parse(config)` directly — no change needed. The strict schema is the same; only the read path switches.

### 12.3 What it buys

- One parse pattern across the entire codebase: strict-throw everywhere.
- One fewer public API to remember.
- No "which helper do I use at this site?" decision.
- Unknown drift surfaces loudly and immediately rather than being buried in a warn log.

### 12.4 Pre-flight checklist

Before landing Step 12:

- [ ] Step 11's startup sweep has run in production for at least one deploy cycle with zero warnings on `presentation_objects.config`. This proves every deployed row parses cleanly against the strict schema.
- [ ] Any drift discovered during that sweep period has been resolved (either by adding a transform to `adaptLegacyConfigD` / `adaptLegacyConfigS` or by a Pattern 4 data migration).
- [ ] The team has agreed that per-viz "failed to load" errors on unknown drift are acceptable (they're loud and actionable, vs. the current soft-fail warn + degraded UI).

### 12.5 Risk

The only risk is a stale row slipping through after Step 11's sweep and causing a user-facing "failed to load this viz" error. Mitigations:

- Step 11 sweep gives high confidence before landing.
- Strict errors surface fast and are easy to diagnose (schema paths in the error).
- A single bad viz doesn't block other vizzes or project-level operations.

If the team isn't ready to commit to strict for PO config, Step 12 can be deferred indefinitely. The permissive helper is not a maintenance burden — it's a deliberate safety net. Converting is a cleanup, not a necessity.

---

## Issues to address before / during execution

These were surfaced by audit on 2026-04-20 and are carried forward into the executor's checklist. None blocks execution; all are worth a careful look as the PR is prepared.

1. **Keep `parseJsonOrThrow` in PO config call sites.** Step 7.3.b/c/d preserves `parseJsonOrThrow(...)` rather than swapping to bare `JSON.parse(...)`. `parseJsonOrThrow` adds context to JSON-parse errors — keeping it preserves error-message quality at no cost. (Already reflected above; flagged here for visibility.)

2. **cf\* overwrite semantics inversion is a real behaviour change.** Current `adaptLegacyConfigS` does `Object.assign(out, flattenCf(cf))` (legacy always wins). New adapter does `if (!(key in out)) out[key] = value` (new-shape rows keep their cf*). Correct for steady state, but assumes no row in the wild has both new-shape `cfMode` AND a stale legacy `conditionalFormatting` from a partial save. **Enable Step 11's sweep at first deploy** to catch this if it happens.

3. **`adaptLegacyVizPreset` now walks `config.t`** (additive vs current `adaptLegacyVizPresets`, which only walks `config.d` and `config.s`). Any in-wild stored vizPreset with a malformed (not just missing) `config.t` field that previously squeaked past will now fail strict validation. The Step 11 sweep also catches this.

4. **`parseInstalledModuleDefinition` signature change.** The old `parseModuleDefinition(raw: unknown)` accepted an already-parsed object. The new helper takes `raw: string` and does the `JSON.parse` internally. Step 7's call-site updates account for this — every `parseModuleDefinition(adaptLegacyModuleDefinition(JSON.parse(x)))` becomes `parseInstalledModuleDefinition(x)`. Verify no other caller exists outside the covered sites before landing.

5. **`LegacyReportItemConfig` becomes a public lib export.** Currently private inside `server/legacy_adapters/report_item.ts`. After Step 5, it's exported from `lib/types/reports.ts` via `mod.ts`'s `export *`. If you don't want it public, prefix with `_` (`_LegacyReportItemConfig`).

6. **Nested preprocess performance.** Parsing a module with N metrics × M viz presets triggers N + N×M preprocess calls. For typical modules negligible, but if any module has hundreds of presets that adds up. Probably fine; flagged for visibility.

7. **Permissive vs strict helpers — naming.** Two PO config public APIs ship: `presentationObjectConfigSchema.parse(...)` (strict-throw, used by writes) and `parseStoredPresentationObjectConfig(raw)` (permissive safeParse + warn + fallback, used by reads). Call sites must pick the right one. Documented in this plan, in `DOC_legacy_handling.md`, and in the schema file's comment. Consider a more obvious naming distinction in a follow-up if the convention causes confusion.

---

## Rules carried forward

Every new stored-shape type follows this architecture.

1. **Strict schema first.** `const xInstalledStrict = z.object({...})`. No `.default`/`.optional`/`.nullish` for drift tolerance.
2. **Pure adapter.** `export function adaptLegacy<X>(raw: Record<string, unknown>): Record<string, unknown>`. Idempotent, no side effects.
3. **Preprocessed public schema** if X is a standalone DB-read entry point: `export const xInstalledSchema = z.preprocess((r) => typeof r === "object" && r !== null && !Array.isArray(r) ? adaptLegacy<X>(r as Record<string, unknown>) : r, xInstalledStrict);`.
4. **Derived type.** `export type X = z.infer<typeof xInstalledSchema>;` (or keep hand-authored when branding matters).
5. **Convenience helper** (optional): `export function parseInstalled<X>(raw: string): X { return xInstalledSchema.parse(JSON.parse(raw)) as X; }`.
6. **Permissive-read helper** (optional): only when parse failure must not throw — implements `safeParse → warn → fallback`. Name it `parseStored<X>` to distinguish from strict-throw.
7. **GitHub-side schema** (only if the type has a fetch/install boundary): separate file `_<type>_github.ts`, strict-all-the-way-down. Never reference preprocessed schemas from the github file.

Adding a drift variant:

1. Add a transform in the relevant `adaptLegacy<X>` function.
2. That's it. All call sites pick it up via preprocess.

Removing a drift (after all rows re-saved):

1. Remove the transform from the adapter.
2. That's it.

Adding a new standalone read entry point:

1. Identify the level (e.g., some new nested blob).
2. Add `adaptLegacy<NewThing>` adapter next to the strict schema for that level.
3. Add `newThingInstalled = z.preprocess(adapter, newThingStrict)` for standalone parsing.
4. Consumers that already parse the parent entity get the new drift automatically via nested preprocess.

---

## Out of scope

- **Writing Zod schemas for reports / slides / slide_decks.** Required before those domains can use `z.preprocess` baking. PLAN_5 Tier 1 (deferred).
- **Changing fetch-time schema shape.** `moduleDefinitionGithubSchema` stays strict and unchanged in shape (only renamed from `ModuleDefinitionJSONSchema`).
- **Changing install-flow behavior.** `load_module.ts:translateMetrics` is unchanged — it still resolves TranslatableString → string and strips nulls.
- **Removing install-strip optionality on installed strict schemas.** `variantLabel`, `valueLabelReplacements`, `postAggregationExpression`, `aiDescription`, `importantNotes`, `vizPresets`, `hide`, `commitSha` remain `.optional()` on `metricDefinitionInstalledStrict` and `moduleDefinitionInstalledStrict` — those are genuine current-shape optionality driven by install, not drift tolerance.
- **Data migrations to eliminate legacy rows.** Pattern 4 work. Separate.
- **Client-side validation** of anything touched here. No client code changes.

---

## Landing

**Steps 1–10 ship as one PR.** Step 1 / Step 2 introduce the new files; Step 3 deletes the old; Step 7's call-site updates depend on the new helper names. Piecewise landing leaves the tree broken. Apply Steps 1–9, run Step 10, commit.

**Step 11 (the startup validation sweep) can ship as a follow-up PR.** It's additive — new file `server/db_startup_validation.ts` + one invocation in `db_startup.ts`, gated behind `VALIDATE_ON_STARTUP=true`. Independently reviewable. Splitting keeps the colocation refactor diff focused. **Recommendation: enable `VALIDATE_ON_STARTUP=true` for the first deploy after Steps 1–10 land** — catches the cf* overwrite semantic shift in a controlled way.

After landing, the file layout for legacy handling is:

```
lib/types/_module_definition_github.ts      (authored in GitHub — strict)
lib/types/_module_definition_installed.ts   (written by install — preprocess + adapters)
lib/types/presentation_object_config.ts     (user-created via UI — preprocess + adapters)
lib/types/reports.ts                        (adapter only; schema pending)
server/db/project/reports.ts                (DB-dependent report adapter)
```

No `server/legacy_adapters/` directory. No `lib/types/module_definition.ts`. No per-boundary adapter wrappers.

---

## Pre-execution audit — findings

Verified against the repo state on 2026-04-20:

**External imports resolve.** `cfStorageSchema`, `flattenCf`, `CF_STORAGE_DEFAULTS`, `ConditionalFormatting`, `ConditionalFormattingScale` are all currently exported from `lib/types/conditional_formatting.ts`. `LEGACY_CF_PRESETS` and `LegacyCfPresetId` are currently exported from `lib/legacy_cf_presets.ts`.

**No external consumers of the renamed schema values.** Grep confirms:

- `vizPreset` (schema value, lowercase) — used only in `lib/types/module_definition.ts`. Renaming is safe.
- `metricAIDescription` (schema value, lowercase) — used only in `lib/types/module_definition.ts`. Safe.
- `configD` / `configS` (schema values) — used only within `lib/types/` (self-references and the adapter). Safe.
- `VizPreset` / `MetricAIDescription` / `VizPresetTextConfig` / `PresentationObjectConfig` (TS types, capitalized) — used in 18+ places across the codebase. These **stay** — they're re-derived via `z.infer` from the strict schemas in `_module_definition_installed.ts`. No breakage.

**Pattern-3 legacy sites still exist.** The three `diffAreas` dual-check sites flagged in `DOC_legacy_handling.md` are present today in the client:

- `client/src/generate_visualization/get_style_from_po.ts:21`
- `client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx:41`
- `client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx:106`

These stay. `adaptLegacyConfigS` fills `specialDisruptionsChart` from `diffAreas` so strict-writes at PO save don't fail, but `diffAreas` itself is preserved so the dual-check sites keep reading both flags as documented in Pattern 3.

**Call site counts confirmed.**

- `parseModuleDefinition` calls: 7 in `server/db/project/modules.ts` (lines 244, 312, 494, 566, 662, 969, 1007) + 3 in `server/task_management/get_dependents.ts` (lines 34, 65, 127) = 10. Matches plan.
- `presentationObjectConfigSchema.parse(config)` (strict-write): 3 in `server/db/project/presentation_objects.ts` (lines 67, 323, 387). Matches plan.
- `adaptLegacyPresentationObjectConfig` (PO config reads): 5 in `server/db/project/presentation_objects.ts` (lines 145, 163, 202, 381, 492). Matches plan.
- `adaptLegacyPODetailResponse` (cache-hit): 1 in `server/routes/project/presentation_objects.ts` (line 155). Matches plan.

**Transforms inventoried.**

| Transform | Adapter location | Status |
|---|---|---|
| `d.periodOpt` → `d.timeseriesGrouping` | `adaptLegacyConfigD` | Covered |
| `periodFilter: "last_12_months"` → `last_n_months+nMonths:12` | `adaptLegacyPeriodFilter` | Covered |
| `periodFilter: undefined` → `"custom"` | `adaptLegacyPeriodFilter` | Covered |
| Strip fabricated bounds on relative period filters | `adaptLegacyPeriodFilter` | Covered |
| `s.conditionalFormatting: string` (preset id) → flat cf* fields | `adaptLegacyConfigS` | Covered (via `flattenCf`) |
| Legacy map color fields → flat cf* fields | `adaptLegacyConfigS` | Covered |
| Strip legacy map* fields | `adaptLegacyConfigS` | Covered |
| Missing cf* fields → `CF_STORAGE_DEFAULTS` | `adaptLegacyConfigS` | Covered |
| `diffAreas` → `specialDisruptionsChart` (fill when missing) | `adaptLegacyConfigS` | Covered |
| `vizPresets[].defaultPeriodFilterForDefaultVisualizations` drop | `adaptLegacyVizPreset` | Covered |
| Missing `metricAIDescription.caveats` / `importantNotes` / `relatedMetrics` | `adaptLegacyMetricAIDescription` | Covered |
| Missing `vizPresetTextConfig` fields | `adaptLegacyVizPresetTextConfig` | Covered |
| Missing `vizPreset.importantNotes` / `createDefaultVisualizationOnInstall` / `needsReplicant` / `allowedFilters` / `config.s` / `config.t` | `adaptLegacyVizPreset` | Covered |
| Missing top-level `moduleDefinition` fields (scriptGenerationType, metrics, etc.) | `adaptLegacyModuleDefinition` | Covered |
| Legacy `placeholder` report item type → `text` | `adaptLegacyReportItemConfigShape` | Covered (not preprocessed yet; Tier 1 deferred) |
| Report item layout 2D array → `LayoutNode` tree | `adaptLegacyReportItemConfigShape` | Covered (not preprocessed yet) |
| Report item `moduleId` → `metricId` (DB-dependent) | `resolveLegacyReportMetricIds` (stays server-side) | Covered |

No known transforms are uncovered.