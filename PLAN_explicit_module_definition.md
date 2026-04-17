# Plan: explicit author-declared JSON for module definitions

## Status: DRAFT

## Goal

Make the authored module definition JSON fully explicit — every field present, no `?` optionals in the authored shape. Use `null` as the sentinel for "intentionally no value".

## Design

- **Types** (`MetricDefinitionJSON`, `VizPreset`, `VizPresetTextConfig`, `MetricAIDescription`, `ResultsObjectDefinitionJSON`) → strict. Semantic nullables become `T | null`. Collections and flags become required.
- **Zod validator** → matches. Runs at install.
- **Runtime inheritance is accepted, not avoided.** `VizPreset`, `VizPresetTextConfig`, and `MetricAIDescription` in [lib/types/module_definitions.ts](lib/types/module_definitions.ts#L10-L29) are re-exports of the JSON types — the runtime side uses the same type. Tightening the JSON type tightens `MetricDefinition.vizPresets`, `MetricWithStatus.vizPresets`, and `ResultsValue.aiDescription` too. Practical impact: near-zero. Consumer code uses truthy checks and `??`, both of which treat `null` the same as `undefined`.
- **`MetricDefinitionJSON`** is authored-only — runtime `MetricDefinition` is its translated sibling, not a direct re-export. `variantLabel`, `valueLabelReplacements`, `postAggregationExpression`, `importantNotes`, `vizPresets`, `hide` on `MetricDefinition` stay as they are (the loader does the JSON→runtime conversion).
- **Install loader** — mostly unchanged. Existing truthy checks (`m.importantNotes ? resolveTS : undefined`) map `null → undefined` for free. One update needed: `config.t` becomes required, so `preset.config.t?.caption` chains drop the `?.`.
- **Storage shape** — stored JSON in `modules.module_definition` will contain explicit `null`s via the spread in `translateMetrics`. That's consistent with the runtime inheritance decision. No adapter needed; no strip-to-undefined step.
- **Validator duplicate types** — [module_definition_validator.ts:306-309](lib/types/module_definition_validator.ts#L306-L309) re-exports `VizPreset`, `VizPresetTextConfig`, `MetricAIDescription`, `MetricDefinitionJSON` via `z.infer`. None are imported elsewhere (only `ModuleDefinitionJSONSchema` is). Delete these duplicate type exports — the hand-written types in `module_definition_schema.ts` are the source of truth; the validator just checks them.

## Affected fields

All in [lib/types/module_definition_schema.ts](lib/types/module_definition_schema.ts). These ARE the runtime shapes for the nested types (see Design note above).

### `MetricDefinitionJSON`

- `variantLabel?: TranslatableString` → `TranslatableString | null`
- `valueLabelReplacements?: Record<string, string>` → `Record<string, string>`
- `postAggregationExpression?: PostAggregationExpression` → `PostAggregationExpression | null`
- `aiDescription?: MetricAIDescription` → `MetricAIDescription | null`
- `importantNotes?: TranslatableString` → `TranslatableString | null`
- `vizPresets?: VizPreset[]` → `VizPreset[]`
- `hide?: boolean` → `boolean`

### `VizPreset`

- `importantNotes?: TranslatableString` → `TranslatableString | null`
- `needsReplicant?: boolean` → `boolean`
- `allowedFilters?: DisaggregationOption[]` → `DisaggregationOption[]`
- `createDefaultVisualizationOnInstall?: string` → `string | null`
- `config.s?: Partial<...>` → `Partial<...>` (use `{}`)
- `config.t?: VizPresetTextConfig` → `VizPresetTextConfig`

### `VizPresetTextConfig`

- `caption?: TranslatableString` → `TranslatableString | null`
- `captionRelFontSize?: number` → `number | null`
- `subCaption?: TranslatableString` → `TranslatableString | null`
- `subCaptionRelFontSize?: number` → `number | null`
- `footnote?: TranslatableString` → `TranslatableString | null`
- `footnoteRelFontSize?: number` → `number | null`

### `MetricAIDescription`

- `caveats?: TranslatableString` → `TranslatableString | null`
- `relatedMetrics?: string[]` → `string[]`
- `importantNotes?: TranslatableString` → `TranslatableString | null`

### `ResultsObjectDefinitionJSON`

- `createTableStatementPossibleColumns?: Record<string, string>` → `Record<string, string>`

## Changes

### Part A — Types + Zod

**A1.** [lib/types/module_definition_schema.ts](lib/types/module_definition_schema.ts) — update JSON types per above.

**A2.** [lib/types/module_definition_validator.ts](lib/types/module_definition_validator.ts) — match using `.nullable()` for `T | null` fields, drop `.optional()` from collections/flags. Delete the dead `z.infer` type re-exports at lines 306-309 (nothing imports them).

### Part B — Loader

**B1.** [server/module_loader/load_module.ts](server/module_loader/load_module.ts) — the truthy-check pattern for scalar nullables already works unchanged (`null ? x : undefined` evaluates the false branch). But `config.t` becoming required means the optional-chain sites in `load_module.ts:~46-51` become plain access. Grep for `preset.config.t?.` and drop the `?.`.

**B2.** [load_module.ts:~70-73](server/module_loader/load_module.ts#L70-L73) — the local-install branch currently returns the parsed definition WITHOUT calling `validateDefinition`. Strict authoring is only enforced on the GitHub-fetch path. Add `validateDefinition` to the local path too so strictness is a real guardrail during development against local modules.

### Part C — Modules repo (wb-fastr-modules)

Update every `_metrics.ts` under `m001/…m007/` and the hand-maintained `hfa001/definition.json`:

- Every scalar nullable field: write value OR write `null`.
- Every collection: write `[]` if none.
- Every flag: write `true`/`false` explicitly.
- `config.s`, `config.t`: always present (use `{}` if nothing to override).

Regenerate JSON via the build step.

Sync the validator: `./vendor_schema`.

### Part D — Typecheck and smoke test

Typecheck both repos. The JSON-type tightening WILL surface runtime consumer sites that use the shared types (especially `VizPreset` reads). Expect near-zero real fixes (truthy/??) but the typechecker should stay green after — if it doesn't, each error is a genuine site that needs either `?? default` or an explicit null branch.

Install a module against a dev instance. Verify:

- Install succeeds.
- Stored `modules.module_definition` contains explicit `null`s (confirms the storage shape decision).
- Default visualizations install correctly.

## Risks

1. **Rollout order: modules-first or atomic — NOT any order.** New validator requires `vizPresets`, `hide`, `needsReplicant`, `allowedFilters`, etc. If app deploys first against old modules that omit these, install fails. Modules repo must ship first, OR both atomically.

2. **Runtime inheritance means `VizPreset` typechecks tighten everywhere it's consumed**, not just at install. Practical impact nil because consumer code uses truthy/`??` — but audit for `=== undefined` checks on these fields.

3. **Storage shape carries nulls.** If you'd rather have omissions in stored JSON, add a `stripNulls` step in `translateMetrics`. Default recommendation: don't bother — consistent with runtime, no conversion asymmetry.

4. **Authors writing explicit `null` on a field they should write a value for** — Zod won't catch, business rule violation. Mitigate via author docs and/or validators that treat null as acceptable but check min/max cardinality where it matters.

## Effort

- Types + Zod: ~30 min (including deleting the dead z.infer exports)
- Loader: ~10 min (drop `?.` on `config.t` chains; add validateDefinition to local path)
- Modules repo: ~1-2 hours (7 `_metrics.ts` + hfa001/definition.json)
- Typecheck audit + smoke: ~30 min

Total: ~2-3 hours. Still no adapter, no wiring, no downstream consumer churn beyond what the typechecker flags.
