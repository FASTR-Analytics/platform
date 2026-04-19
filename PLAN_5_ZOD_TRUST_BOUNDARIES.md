# PLAN 5: Zod Validation at Trust Boundaries

A recurring theme across recent plans: runtime data crossing into the app is validated inconsistently. Module definitions are Zod-validated on fetch but not on DB read. AI tool inputs are Zod-validated on the client but pass-through on the server. Instance configs, PO configs, and metric JSON fields are read via `parseJsonOrThrow<T>()` — a type cast with no runtime check.

This plan audits the trust boundaries, picks the ones worth tightening, and leaves the ones that aren't.

---

## Guiding principle: trust boundaries

The rule is:

> **Anything crossing into the app from outside a trusted TypeScript-typed path needs Zod. Anything already inside doesn't.**

What counts as "outside":

- **Externally hosted systems** — LLMs (Claude), DHIS2, Clerk, future partner APIs.
- **User uploads** — CSVs, asset files, arbitrary JSON in config fields.
- **DB reads** of JSON-typed columns — the value was put there by an earlier version of the code (or by a human), there's no compile-time guarantee the shape is current.
- **Long-lived cross-process connections** where the two ends can drift — SSE streams, API request bodies when a stale browser tab outlives a deploy.

What's inside the boundary and doesn't need re-validation:

- Server-to-server calls within a single request handler.
- Already-validated data flowing onward (e.g. a config that was Zod-parsed at the edge and is now being passed as a typed arg).
- Hono middleware state after auth.

---

## A note on atomic deploys

Atomic client+server deploy means the two halves come from the same commit — no version skew at steady state. But the skew window isn't zero:

- **Stale browser tabs**: a user with the app open for 3 days, server deploys a breaking schema change, their tab still runs old JS against new server.
- **Long-lived SSE connections**: the connection can span a deploy.

This lowers — but doesn't eliminate — the urgency of validating API request bodies and SSE envelopes. They land in Tier 2, not Tier 1.

---

## Audit summary (current state)

Totals across the server tree: `parseJsonOrThrow` appears **74 times across 16 files**. Most sites share a single shape (read a typed JSON column, cast, use). Grouped by trust category:

| Boundary | Current state | Tier |
|---|---|---|
| **Module definitions on fetch (GitHub)** | Zod-validated at `fetchModuleFiles` via `ModuleDefinitionJSONSchema` | OK |
| **Module definitions on DB read** | `parseJsonOrThrow<ModuleDefinition>` — JSON schema exists but doesn't match stored (translated) shape; needs new runtime schema (10 sites) | **Tier 1** |
| **AI tool inputs (client side)** | Zod via `createAITool({ inputSchema })` for slides + content validators | OK |
| **AI-generated PO configs on save** | Type-cast; no schema. `PresentationObjectConfig` has no Zod schema at all | **Tier 1** |
| **AI-generated PO configs on read (legacy adapter)** | Coerces legacy shapes but doesn't validate the result | **Tier 1** |
| **Instance config reads** (maxAdminArea, facilityColumns, countryIso3, adminAreaLabels) | `parseJsonOrThrow<T>` — no schema (4 sites in `config.ts`) | **Tier 1** |
| **Metric JSON fields on DB read** (value_props, value_label_replacements, required_disaggregation_options, post_aggregation_expression, ai_description) | `parseJsonOrThrow` — no schema per field (5 sites) | **Tier 1** |
| **Slide / slide-deck configs on DB read** | `parseJsonOrThrow` — no schema ([slides.ts](server/db/project/slides.ts) 3 sites, [slide_decks.ts](server/db/project/slide_decks.ts) 2 sites) | **Tier 1 (deferred)** |
| **Report / report-item / long-form-report configs on DB read** | `parseJsonOrThrow` — no schema ([reports.ts](server/db/project/reports.ts) 9 sites) | **Tier 1 (deferred)** |
| **Project info on DB read** | `parseJsonOrThrow` — no schema ([projects.ts](server/db/project/projects.ts) 3 sites) | **Tier 2** |
| **Dataset staging / mapping state on DB read** | `parseJsonOrThrow` — no schema ([dataset_hmis.ts](server/db/instance/dataset_hmis.ts), [dataset_hfa.ts](server/db/instance/dataset_hfa.ts), 10 sites) | **Tier 2** |
| **Worker-routine staging state** | `parseJsonOrThrow` — no schema (4 worker files, 14 sites) | **Tier 3** |
| **CSV uploads (structure import)** | Header-presence check only; row values not schema-checked | **Tier 2** |
| **DHIS2 responses** | `response.json() as T` — pure cast | **Tier 2** |
| **API request bodies** | Type-cast via route registry's compile-time type parameter only | **Tier 2** |
| **SSE messages (client side)** | `JSON.parse(event.data) as InstanceSseMessage` | **Tier 2** |
| **Asset upload metadata (TUS)** | Protocol compliance only; no filename/size/type Zod | **Tier 3** |
| **Clerk webhooks** | Not implemented | N/A |

### Dispositions for the additional boundaries

The earlier draft of this audit missed slides/decks/reports/projects/datasets/workers. Explicit call on each:

- **Slides, slide-decks, reports**: same "user-authored config that flows to/from DB" pattern as PO configs. Each has its own TypeScript type but no Zod schema. Land them using the same approach as item C (add schema, permissive-read / strict-write). **Deferred Tier 1 — same pattern as C, but not a prerequisite for the initial PLAN_5 rollout. Land them sequentially after C proves the rollout playbook.**
- **Module config selections** (`parseModuleConfigSelections` at [modules.ts:39](server/db/project/modules.ts#L39), cast as `Record<string, unknown>`): another stored JSON column (`modules.config_selections`) with no schema. Different entity from `ModuleDefinition` (items B/C don't cover it). Same pattern as the slides/decks/reports group — deferred Tier 1. Noted here so future readers don't wonder why it was skipped.
- **Project info**: small JSON fields (module dirty states, etc.). Less safety-critical than PO/slide configs, but cheap. Tier 2.
- **Dataset staging / mapping state**: transient state written and read within a single user's import flow. Less long-lived than PO configs — a bad row typically manifests within one session. Tier 2, skip unless pain arises.
- **Worker-routine staging**: internally-written by worker code, read back by the same worker in the same run. Trust boundary is effectively "this server's memory, just serialized through Postgres because the worker is a separate process." Tier 3.

---

## Schema and type colocation

**Principle: single source of truth.** Wherever there's a Zod schema, the TypeScript type is *derived* from it via `z.infer<typeof schema>`. Never hand-author a type in parallel with its schema — drift is guaranteed.

**Convention**:

1. Everything lives in `lib/types/`. Files are organized by domain (`instance.ts`, `module_definition.ts`, `presentation_object.ts`, `slide.ts`, …), not by "types file vs. validator file".
2. Within a file: the Zod schema is declared, then the TS type is derived:
   ```ts
   export const instanceConfigFacilityColumnsSchema = z.object({ … });
   export type InstanceConfigFacilityColumns = z.infer<typeof instanceConfigFacilityColumnsSchema>;
   ```
3. No `*_validator.ts` suffix. Rename `module_definition_validator.ts` → `module_definition.ts` (merging with the existing `module_definitions.ts` types file).
4. Where a runtime type legitimately adds fields the raw/stored shape doesn't carry (e.g. `ResultsValue` which is the *enriched* metric — stored shape + computed `disaggregationOptions`), the runtime type stays hand-authored. These don't cross a trust boundary; they're built by internal code from already-validated inputs. Keep them in the same domain file, below the schema-derived types.
5. A single runtime array can seed both the TS union and the Zod enum (already the pattern for `ALL_DISAGGREGATION_OPTIONS`):
   ```ts
   export const ALL_DISAGGREGATION_OPTIONS = [ … ] as const;
   export type DisaggregationOption = (typeof ALL_DISAGGREGATION_OPTIONS)[number];
   export const disaggregationOption = z.enum(ALL_DISAGGREGATION_OPTIONS);
   ```

**What gets migrated to `z.infer` during Tier 1**:

| Today | After | Item |
|---|---|---|
| `InstanceConfigMaxAdminArea`, `InstanceConfigFacilityColumns`, `InstanceConfigCountryIso3`, `InstanceConfigAdminAreaLabels` — hand-authored in `lib/types/instance.ts` | `z.infer` from schemas in the same file | A |
| Metric JSON leaf types (`PostAggregationExpression`, `MetricAIDescription`, etc.) — **already `z.infer`-derived** in `lib/types/module_definition_validator.ts` but reached via a two-hop facade through `module_definition_schema.ts` → `module_definitions.ts` | Same `z.infer` types, collapsed into a single `lib/types/module_definition.ts` — file-location migration, not authorship | B |
| Full `PresentationObjectConfig` — hand-authored in `lib/types/presentation_objects.ts`, no Zod schema | `z.infer` from new `presentationObjectConfigSchema` in the same file | C |
| Runtime `ModuleDefinition` — hand-authored in `lib/types/module_definitions.ts` | `z.infer` from new `moduleDefinitionRuntime` schema in the collapsed `module_definition.ts` | D |
| AI tool input types in `lib/types/slides_ai_input.ts` | Already partially `z.infer`'d; tighten remaining tools | E |

**What stays hand-authored**:

- Runtime-enriched types like `ResultsValue` (has computed `disaggregationOptions`), `InstanceDetail` (server-composed from multiple schemas), `ResultsValueInfoForPresentationObject` (composed at query time). These are built from validated inputs by internal code — they don't need their own schema.
- Types with no external entry point (internal server state, server→server call shapes).

**What a reviewer can do after**:

- `ls lib/types/` lists every domain.
- `grep -l "z\\.object\\|z\\.enum\\|z\\.discriminatedUnion" lib/types/*.ts` lists every file that declares a schema.
- There's exactly one declaration of any given type — if a type exists at all, it's either the `z.infer` of a schema or a hand-authored runtime-enriched shape.

**Sequence note — module_definition tangle**: three files carry module-definition types today, forming a facade chain:

- [lib/types/module_definition_validator.ts](lib/types/module_definition_validator.ts) — Zod schemas + `z.infer`-derived types (single source of truth for module JSON).
- [lib/types/module_definition_schema.ts](lib/types/module_definition_schema.ts) — facade: re-exports schema-derived types + adds hand-written HFA runtime types (`HfaIndicator`, `HfaIndicatorCode`, `HfaDictionaryForValidation`).
- [lib/types/module_definitions.ts](lib/types/module_definitions.ts) — further facade: re-exports from `_schema.ts` + adds runtime-enriched types (`ResultsValue`, `MetricWithStatus`).

**Target**: collapse all three into a single `lib/types/module_definition.ts` carrying schemas, derived types, runtime-enriched types, and HFA internals. The facades add nothing a reviewer needs — just indirection to chase. HFA types (~25 lines) stay in the same file since they share the module-level concern; splitting them to `hfa.ts` is a separate call if the file grows too big.

**When**: the collapse lands with item B (the first item to touch these files). B's scope includes the three-file merge. It also exports `configD` from the collapsed `module_definition.ts` so item C can import it cleanly for `presentationObjectConfigSchema` (today `configD` is declared `const`, not `export const`). No big-bang rename PR.

Item C's presentation-object schema lands in `lib/types/presentation_objects.ts` directly — no facade chain there to untangle.

`module_definitions.ts` also carries translation-dependent runtime helpers like `get_PERIOD_OPTION_MAP` (uses `t3`). They move into the collapsed file alongside the schemas and types. That's fine — translation + types + schemas can coexist in one domain file — but noted so the reviewer doesn't flinch at a schema file importing `t3`.

---

## Interaction with legacy adapters

See [DOC_legacy_handling.md](DOC_legacy_handling.md) for the full catalogue of legacy-handling patterns. The interaction with Zod is:

**Principle — adapters run before Zod.**

```text
DB text → JSON.parse → legacy adapter → Zod.parse (or safeParse) → typed value
```

The adapter's job is to normalize legacy shapes to the current shape. Zod's job is to verify the adapter succeeded. **Zod schemas describe only the current shape** — they don't need to enumerate legacy shapes. If something slips past the adapter, Zod surfaces the exact path of the drift; that's a signal to add a new transform to the adapter, not to loosen the schema.

**Consequences for each Tier 1 item**:

- **Item A** (instance configs): no adapter today. Schemas are small and have evolved minimally. Low probability of legacy drift, but a safeParse-sweep of the 4 rows in `instance_config` is cheap and confirms before strict mode lands.
- **Item B** (metric JSON fields + viz_presets): no centralized adapter exists today. Metric JSON is written at module-install time from a Zod-validated source, so old rows *should* match the current schema. Before landing: safeParse-sweep all `metrics.*` rows. If failures appear, decide between (a) a one-off migration (Pattern 4) to re-normalize, (b) a new Pattern 1 adapter in [server/legacy_adapters/](server/legacy_adapters/), or (c) `.safeParse` with a fallback like item D. `viz_presets` already has the `adaptLegacyVizPresets` adapter — Zod runs after it, per the canonical flow.
- **Item C** (PO configs): `adaptLegacyPresentationObjectConfig` exists in [server/legacy_adapters/po_config.ts](server/legacy_adapters/po_config.ts). Zod runs *inside* the adapter, on the adapter's output. This is the reference implementation for the pattern.
- **Item D** (module definitions on DB read): no adapter today. Module defs have a stored-vs-JSON shape mismatch (see item details) that's addressed by authoring a new runtime-shape schema. Same sweep-and-decide pattern as B once the runtime schema is in place.
- **Item E** (AI tool inputSchemas): N/A — AI inputs are live, not stored. No legacy shapes possible.

**Rule for any future schema change** (applies beyond this plan):

When a stored entity's schema changes (field rename, required → optional, enum value added/removed), update the corresponding legacy adapter *first* (or create one per [DOC_legacy_handling.md](DOC_legacy_handling.md)'s pattern rules) *before* the Zod schema changes. The adapter produces the current shape; Zod validates it. Skipping the adapter update turns every stored row into a validation failure on next deploy.

This makes DOC_legacy_handling.md required reading for anyone changing a type that has a Zod schema.

---

## Tier 1 — recommend doing

Shared characteristic: the data is *stored* and its shape has long-term consequences. A bad value survives deploys, corrupts exports, or poisons downstream caches. Schema validation on DB read catches historical drift; on write, catches AI / human input errors at the boundary.

Items below are ordered by execution sequence — A ships first, then B, etc.

### A. Zod schemas for instance configs

**Gap**: Four instance config rows are read via `parseJsonOrThrow<T>` with no schema:

- `InstanceConfigMaxAdminArea` ([config.ts:89](server/db/instance/config.ts#L89))
- `InstanceConfigFacilityColumns` ([config.ts:135](server/db/instance/config.ts#L135))
- `InstanceConfigCountryIso3` ([config.ts:179](server/db/instance/config.ts#L179))
- `InstanceConfigAdminAreaLabels` ([config.ts:222](server/db/instance/config.ts#L222))

**Why**: These configs drive UI structure, column gating, metric enrichment. A corrupted row causes wide-surface-area failures. The types are tiny (3–10 fields each); defining Zod schemas is minutes of work.

**Fix**: Add a Zod schema per config type directly in `lib/types/instance.ts` (per the colocation convention — no separate `_validator.ts` file). Each existing type becomes `z.infer<typeof schema>`. Replace `parseJsonOrThrow<T>(row.config_json_value)` with `TSchema.parse(JSON.parse(row.config_json_value))`. Optionally, define a small helper `parseInstanceConfig<T>(row, schema)`.

**Scope**: 4 schemas added to existing `lib/types/instance.ts` + 4 call-site replacements in `config.ts`. No new files.

**Why first**: smallest possible change that exercises the whole pattern — author schemas, derive types via `z.infer`, parse on DB read. No translation concerns, no adapter interaction, no file collapse. Proves the mechanics before item B drags in the module-definition three-file merge.

### B. Zod schemas for metric JSON fields on DB read

**Gap**: [metric_enricher.ts:28-51](server/db/project/metric_enricher.ts#L28-L51) has five `parseJsonOrThrow` calls on nested metric fields, none with schemas:

```text
required_disaggregation_options → DisaggregationOption[]
value_props → string[]
post_aggregation_expression → PostAggregationExpression
value_label_replacements → Record<string, string>
ai_description → MetricAIDescription
```

Plus one adjacent site at [modules.ts:935](server/db/project/modules.ts#L935) reads `dbMetric.viz_presets` via `parseJsonOrThrow(...)` and runs it through the existing `adaptLegacyVizPresets` adapter — also without Zod. Same trust-boundary profile (metric-level stored JSON, written at module install), so folded into this item.

**Why**: These are stored at module-install time. If the module install path stored a bad value (it shouldn't — it's Zod-validated on fetch — but migrations and manual fixes happen), every metric read pulls through the corrupt value silently.

**Translation-layer note**: unlike item C (which touches the full `module_definition` blob that includes translated fields), item B's fields all escape [translateMetrics](server/module_loader/load_module.ts#L131-L152) unchanged. `aiDescription` passes through via `?? undefined` (no `resolveTS` call). `vizPresets` ride through via the initial `...m` spread; `translateMetrics` never overwrites them. The four remaining fields have no `TranslatableString` in their schemas at all. So the existing JSON schemas match the stored shape 1:1 — no new schemas needed for this item.

**Fix**: The Zod schemas already exist inside `module_definition_validator.ts` (as `disaggregationOption`, `postAggregationExpression`, the metric-definition sub-schemas, and `vizPreset` at [line 237](lib/types/module_definition_validator.ts#L237)). Export the relevant leaf schemas — including `configD`, which item C needs (today it's declared `const configD`, not exported). Replace each `parseJsonOrThrow` with the corresponding Zod parse. For `viz_presets`, the flow is the canonical adapter-then-Zod pattern: `JSON.parse → adaptLegacyVizPresets → z.array(vizPreset).parse`.

**Scope**: 6 call-site replacements total — 5 in `metric_enricher.ts` + 1 in `modules.ts:935`. Three files touched: `metric_enricher.ts`, `modules.ts`, and the collapsed `module_definition.ts` (which absorbs `module_definition_validator.ts` + `module_definition_schema.ts` + `module_definitions.ts` per the Sequence note above). Also lands the `configD` export needed by item C.

### C. Zod schema for PresentationObjectConfig + applied on read and on AI-save

**Gap**: `PresentationObjectConfig` has no top-level Zod schema. The validator file has a `configD` schema ([lib/types/module_definition_validator.ts:116](lib/types/module_definition_validator.ts#L116)) used for *viz preset* validation but not for the full `{ d, s, t }` PO config. PO configs are written to DB via `JSON.stringify(config)` at three sites in [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts) (lines 66, 322, 386) — no Zod at any of them. PO reads go through `adaptLegacyPresentationObjectConfig` ([server/legacy_adapters/po_config.ts:46-52](server/legacy_adapters/po_config.ts#L46-L52)) which normalizes shape but doesn't validate.

**Why**: AI generates PO configs. AI is the highest-risk boundary. Today, a semantically-wrong AI config flows straight to DB and only fails at render (silent or loud depending on the specific issue). The `configD` refinements at [module_definition_validator.ts:116](lib/types/module_definition_validator.ts#L116) — non-replicant-unique slot, single-replicant (temporary), no duplicate disOpt, non-empty `filterBy.values` — need to *actually run* on the AI-save path.

**Fix**:

1. Add `presentationObjectConfigSchema` directly to `lib/types/presentation_objects.ts` (per the colocation convention — no separate `_validator.ts` file). Covers the full `{ d, s, t }` shape. Import `configD` from the collapsed `module_definition.ts` (see Sequence note; exported by item B) so the refinements ride along automatically.
2. Apply in the PO update route handler: Zod-parse the incoming body before handing to the DB function.
3. Apply in `adaptLegacyPresentationObjectConfig`: after normalization, Zod-parse the result. Use the permissive-read strategy below.

**Scope**: `presentationObjectConfigSchema` added to existing `lib/types/presentation_objects.ts` + 3 write sites in `presentation_objects.ts` (66, 322, 386) + 1 read site in the legacy adapter. No new files. The existing `configD` refinements compose in via the schema's `d` field.

**Rollout risk — legacy DB rows**: applying `.parse()` on read will throw on any historical row that doesn't conform. Configs that pass raw-cast today may fail Zod because:

- Stored shapes predate newer required fields.
- Missing-but-optional-in-practice fields (e.g. relative-filter bounds that were added/removed over time).
- Manual fixes or migrations that left rows in odd states.
- AI configs saved before this validation landed.

**Strategy**: permissive-read, strict-write.

- **On write**: strict. Reject any save that fails Zod with the full error message. Applies to AI save, editor save, and any future programmatic writes.
- **On read** (inside `adaptLegacyPresentationObjectConfig`): parse with `.safeParse`. On success, return the validated config. On failure, log a structured warning (config ID + Zod issues path) and fall back to the adapter's current pass-through shape. This keeps existing views rendering while surfacing the bad rows for targeted fixes.

Optionally: a one-shot script that iterates all `presentation_objects` rows, runs `.safeParse`, and reports the count of failing rows before the refactor lands. If the count is zero, switch read-side to strict too. If non-zero, triage the failures, fix or migrate, then tighten. Without this, permissive-read persists indefinitely by default — which is fine, but means we never reach "all PO configs in memory are Zod-valid."

**Why before D**: item D needs `presentationObjectConfigSchema` to type `defaultPresentationObjects[i].config` in its runtime schema. C lands first; D imports the schema cleanly.

### D. DB reads of stored module definitions

**Gap**: Module definitions are Zod-validated once at GitHub fetch ([server/module_loader/load_module.ts:123](server/module_loader/load_module.ts#L123) via `ModuleDefinitionJSONSchema.safeParse`). After install, the definition is stored as JSON in `modules.module_definition` and subsequently read via `parseJsonOrThrow<ModuleDefinition>` ([server/db/project/modules.ts:241](server/db/project/modules.ts#L241)) with no re-validation.

**Complication — stored shape differs from JSON shape**: `ModuleDefinitionJSONSchema` describes the raw module JSON (pre-translation). The DB stores the *translated runtime* shape produced by [load_module.ts:181-198](server/module_loader/load_module.ts#L181-L198) → [modules.ts:110](server/db/project/modules.ts#L110) `JSON.stringify(modDef.data)`. The runtime shape differs from the JSON shape in two ways:

- **Translated fields**: `label` is `resolveTS(definition.label, language)` — a plain `string`, not a `TranslatableString { en, fr }`. Same for `metrics[i].label`, `metrics[i].variantLabel`, `metrics[i].importantNotes`, `resultsObjects[i].description`, and `valueLabelReplacements` values.
- **Added runtime fields**: `script`, `lastScriptUpdate`, `commitSha`, `defaultPresentationObjects` — not present in `ModuleDefinitionJSONSchema`.

So `ModuleDefinitionJSONSchema.parse(stored)` will fail on every row. The premise of reusing the existing schema doesn't hold.

(Note: item B is unaffected — the metric-level fields it touches either have no `TranslatableString` nesting or — for `aiDescription` and `vizPresets` — ride through `translateMetrics` untranslated. The translation layer is selective; only the specific top-level/metric-label fields get flattened. Item D is affected because storage writes the whole `ModuleDefinition` runtime type to the `module_definition` column, which includes the translated top-level and nested fields.)

**Why**: A stored module definition is long-lived. Migrations could alter its shape; future schema changes could break old rows; manual DB edits happen in emergencies. Re-validating on read is a near-free safety net — *once we have a schema that matches the stored shape.*

**Fix**: Author a new `moduleDefinitionRuntime` schema in the collapsed `module_definition.ts` that mirrors the stored shape:

- Reuse existing JSON sub-schemas where they match the runtime 1:1 (`dataSources`, `scriptGenerationType`, `configRequirements`, `resultsObjects[i]` minus description, `postAggregationExpression`, `disaggregationOption`, etc.).
- Override the translated fields to plain strings:
  - `label: z.string()` (was `translatableString`).
  - `metrics[i].label: z.string()`, `variantLabel: z.string().nullable()`, `importantNotes: z.string().nullable()`.
  - `resultsObjects[i].description: z.string()`.
  - `valueLabelReplacements: z.record(z.string(), z.string())` — already string-to-string, stays.
- Add the runtime-only fields: `script: z.string()`, `lastScriptUpdate: z.string()`, `commitSha: z.string().optional()`, `defaultPresentationObjects: z.array(defaultPresentationObjectSchema)` where `defaultPresentationObjectSchema` embeds `presentationObjectConfigSchema` from item C via `config: presentationObjectConfigSchema`.
- Derive `type ModuleDefinition = z.infer<typeof moduleDefinitionRuntime>` — replaces the hand-authored type at [module_definitions.ts:56](lib/types/module_definitions.ts#L56). Single source of truth re-established.

Then define a single helper `parseModuleDefinition(json): ModuleDefinition` that runs `moduleDefinitionRuntime.parse(JSON.parse(json))`. Replace every `parseJsonOrThrow<ModuleDefinition>(…)` with the helper.

`aiDescription` and `vizPresets` within metrics keep their existing JSON-shape schemas (which match the untranslated stored shape) — those pass through `translateMetrics` unchanged, so no shape divergence.

**Scope**: the runtime schema is larger than Item B's metric-level schemas (most fields need to be declared), plus the 10 call-site replacements. Three files touched: collapsed `module_definition.ts`, `modules.ts`, `get_dependents.ts`. Any file currently importing the hand-authored `ModuleDefinition` type continues to work — the derived type has the same shape. **Land last** — depends on A (proves the pattern), B (collapses the file + exports `configD`), and C (provides `presentationObjectConfigSchema` for `defaultPresentationObjects[i].config`).

**Pre-flight**: `safeParse`-sweep all existing `modules.module_definition` rows against the new runtime schema before landing strict mode. Any failures indicate either (a) the schema missed a field, or (b) stored rows have genuine drift — triage accordingly.

### E. AI tool inputSchema tightening + retry pattern documentation

**Gap**: Eight of twenty-eight `createAITool(...)` calls use `inputSchema: z.object({})` — an empty Zod schema that accepts any input Claude sends:

- `get_available_modules` — [modules.ts:17](client/src/components/project_ai/ai_tools/tools/modules.ts#L17)
- `get_methodology_docs_list` — [methodology_docs.tsx:12](client/src/components/project_ai/ai_tools/tools/methodology_docs.tsx#L12)
- `get_available_metrics` — [metrics.tsx:14](client/src/components/project_ai/ai_tools/tools/metrics.tsx#L14)
- `get_available_visualizations` — [visualizations.tsx:23](client/src/components/project_ai/ai_tools/tools/visualizations.tsx#L23)
- `get_available_slide_decks` — [visualizations.tsx:35](client/src/components/project_ai/ai_tools/tools/visualizations.tsx#L35)
- `get_deck` — [slides.tsx:59](client/src/components/project_ai/ai_tools/tools/slides.tsx#L59)
- `get_slide_editor` — [slide_editor.tsx:42](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L42)
- `get_viz_editor` — [visualization_editor.tsx:34](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L34)

These are zero-arg fetchers — conceptually they accept nothing. But the empty schema means Claude can hallucinate fields (e.g. adding a `filter` argument the tool never defined) and nothing catches it. The hallucinated field is silently dropped; Claude believes it filtered, user gets unfiltered data.

**Why**: the retry-with-hint pattern is already wired — [panther/_305_ai/_core/tool_engine.ts:124-143](panther/_305_ai/_core/tool_engine.ts#L124-L143) catches thrown errors from tool handlers and returns them to Claude as `{ type: "tool_result", is_error: true, content: cleanMessage }`. Claude reads `is_error: true`, self-corrects, retries. The idiom in this repo is: **throw from the handler, the framework converts to is_error**. Tightening the Zod schema means Zod's own `.parse()` failure throws before the handler runs — same pattern, earlier detection, clean error message to Claude.

**Fix**:

1. Change every `inputSchema: z.object({})` to `z.strictObject({})` so extraneous fields are rejected (not silently dropped). Claude learns on retry.
2. For tools with trivial params (`{ id: z.string() }`), upgrade to `z.strictObject({ id: z.string() })` for the same reason.
3. Review the other tools that accept rich input — confirm all are using strict schemas and appropriate `.refine()` where semantic invariants exist (e.g. `filterBy.values.min(1)` if the tool generates filter structures).
4. Document the retry pattern in a new `DOC_AI_TOOL_VALIDATION.md`: "throw from handler → is_error back to Claude → retry." Include the `strictObject` convention.

**Scope**: 8 edits (one per tool with empty schema) + a handful of tight-up edits on tools with loose strict flags + one new doc file. No new validators file needed (AI tool schemas already live with their tools in [slides_ai_input.ts](lib/types/slides_ai_input.ts); see colocation note above for the pending split).

**Server-side re-validation**: not needed. Tool handlers run client-side; their state changes invoke normal API routes, which are the actual trust boundary on the server. That boundary is Tier 2 G (API body validation). AI doesn't get a privileged path.

---

## Tier 2 — worth considering, lower priority

Shared characteristic: long-lived runtime streams or external APIs where validation is defense-in-depth rather than correctness guarantee. Atomic deploy reduces urgency but doesn't eliminate it.

### F. DHIS2 response validation

**Gap**: [server/dhis2/common/base_fetcher.ts:124-125](server/dhis2/common/base_fetcher.ts#L124-L125) — `await response.json()` + `as T` cast. No Zod. DHIS2 is external; its schema can change without notice.

**Why (yes)**: DHIS2 schema changes today either propagate silently (undefined scalars flow into labels, filters, downstream state) or fail at first property access with a cryptic TypeError — depending on how the field is consumed. Zod would produce a clean error at parse time with exact path, and catches the silent-propagation case that TypeScript can't.

**Why (no)**: partial silent propagation is a real concern, but DHIS2 responses are structurally complex enough that writing comprehensive Zod schemas is non-trivial, and the downstream UI surfaces incorrect-but-not-broken data — not a safety issue.

**Recommendation**: defer. Start applying Zod only when a DHIS2 schema drift actually causes pain; at that point the affected endpoint gets a schema in isolation. Don't boil the ocean.

### G. API request body validation

**Gap**: [server/routes/route-helpers.ts:53](server/routes/route-helpers.ts#L53) — `body = await c.req.json()` → cast to route registry's `body` type at compile time. No runtime check.

**Why (yes)**: stale browser tabs can send outdated payloads across deploys. Defense-in-depth catches client bugs that slipped past TypeScript.

**Why (no)**: atomic deploy + trusted auth (Clerk) + no third-party consumers means the *intended* input is always well-typed. Zod-parsing every route body adds boilerplate for a threat that rarely manifests (and when it does, typically fails loudly at DB write, not silently).

**Recommendation**: adopt a soft policy. When adding new routes that accept rich bodies (not just primitives like `{ id }`), define a Zod schema and parse in the handler. Don't retrofit the existing 100+ routes — too much churn for the marginal safety gain in an authenticated internal app.

The route-helper could offer an *optional* `bodySchema: ZodSchema` parameter; when provided, parse; when absent, cast. Incrementally adoptable.

### H. SSE message validation on client

**Gap**: [client/src/state/instance/t1_sse.tsx:52](client/src/state/instance/t1_sse.tsx#L52) — `JSON.parse(event.data) as InstanceSseMessage`. The `switch` on `msg.type` silently drops unknown types; malformed `data` fields trip downstream handlers.

**Why (yes)**: SSE connections span deploys. A server pushing a new `type` value to an old client silently drops the message today; validation would produce a console error.

**Why (no)**: similar to F — the failure mode is already reasonable (unknown type = no-op). Adds boilerplate for limited gain.

**Recommendation**: same as F. Define `instanceSseMessageSchema` once, apply in `t1_sse.tsx`. Single file, one schema. Lower effort than F because there's only one handler. Worth doing alongside F or as standalone.

### I. CSV upload semantic validation

**Gap**: [stage_structure_from_csv.ts](server/server_only_funcs_importing/stage_structure_from_csv.ts) — headers checked for presence; row values cleaned for SQL escape but not schema-checked.

**Why (yes)**: users upload these files. The stricter the validation, the clearer the error messages.

**Why (no)**: the current per-column error messages (in the structure-import wizard) are already reasonably helpful. A Zod row-level validator would re-implement what's already there in a different style.

**Recommendation**: out of scope for a "Zod plan." Structure-import validation is its own concern with its own UX; if it needs tightening, handle as a structure-import plan.

---

## Tier 3 — skip

### J. Asset upload metadata (TUS)

Protocol-level compliance is fine. Semantic validation (filename sanitization, max size, content-type whitelisting) is a *security* concern, not a *Zod* concern. Address if a security review flags it.

### K. Clerk webhooks

Not implemented. Revisit if adopted.

---

## What changes in practice

After Tier 1 lands, a reader of the server code can trust that:

- Every instance config in memory has passed its dedicated schema (item A).
- Every metric's `disaggregationOptions`, `valueProps`, `aiDescription`, `vizPresets`, etc., are schema-valid on read (item B).
- Every PO config written passes strict Zod; reads that fail log structured warnings without crashing views (item C).
- Every stored module definition has passed `moduleDefinitionRuntime` on DB read (item D). `ModuleDefinitionJSONSchema` continues to validate the raw JSON on GitHub fetch.
- Every AI tool call rejects hallucinated fields via strict schemas; Claude self-corrects via the `is_error` retry loop (item E).

Anything that's not schema-valid fails loud at the boundary instead of silently rendering wrong, quietly producing broken exports, or corrupting a downstream cache key.

The `configD` refinements get real leverage only if they run on every PO-config read, not just at module-install time. Tier 1 C is where that happens.

A reviewer can `ls lib/types/` for every domain and `grep -l "z\.object\|z\.enum\|z\.discriminatedUnion" lib/types/*.ts` to list every file that declares a schema — no `_validator.ts` suffix needed.

---

## Recommended landing order

Items in Tier 1 are labelled in execution order:

1. **Tier 1 A** (instance configs, 4 schemas added to existing `lib/types/instance.ts`) — tiny schemas, 4 call sites, no translation concerns. Cleanest pattern-proving first step.
2. **Tier 1 B** (metric JSON fields + viz_presets, 6 sites) — reuses existing JSON schemas; also lands the three-file `module_definition*` collapse and exports `configD` for item C.
3. **Tier 1 C** (PO config schema + permissive-read / strict-write) — biggest user-facing surface; wraps the `configD` refinements; use the rollout strategy in the item.
4. **Tier 1 D** (module definitions on DB read, ~10 sites) — requires authoring a new `moduleDefinitionRuntime` schema (stored shape ≠ JSON shape due to translation); also needs `presentationObjectConfigSchema` from C to type `defaultPresentationObjects[i].config`. Lands last.
5. **Tier 1 E** (AI tool inputSchema tightening + retry-pattern doc) — independent of A–D; can slot in anywhere. 8 edits + 1 new doc.
6. **Tier 1 (deferred)** — repeat C's pattern for slides, slide-decks, reports. Each is a separate small PR.
7. **Tier 2 H** (SSE) — if appetite.
8. **Tier 2 G** (API bodies, optional `bodySchema` on route helper) — incremental, opportunistic.

Tier 2 F (DHIS2), Tier 2 I (CSV), Tier 2 project info, Tier 2 dataset staging, and Tier 3 items (J asset uploads, K Clerk webhooks) stay in the backlog until concrete pain justifies them.
