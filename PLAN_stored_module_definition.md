# Plan: Narrow `StoredModuleDefinition` type + validator-adapter

## Status: READY TO REVIEW

## Goal

Replace the untyped `module_definition` JSON blob in `modules.module_definition` with a narrow `StoredModuleDefinition` shape that contains only the fields runtime readers need. Write a validator-adapter that:

- **Tolerates** recoverable drift (old field names → new; missing optional fields → defaults; unknown bloat → dropped).
- **Throws loudly** when data is unrecoverable (required fields missing, wrong types, structural corruption).

This eliminates the "random JSON blobs accumulate stale fields" problem without introducing a schema version number to track.

## Background

### Facts

- `modules.module_definition` is a `text` column storing `JSON.stringify(ModuleDefinition)` at install time ([modules.ts:108](server/db/project/modules.ts#L108)).
- `ModuleDefinition` is large: `label`, `description`, `scriptGenerationType`, `script`, `metrics`, `resultsObjects`, `dataSources`, `configRequirements`, `assetsToImport`, `prerequisiteModules`, and more.
- Runtime readers of `module_definition` (audited earlier):
  - `.dataSources` — task dependency tracking ([get_dependents.ts:37,68](server/task_management/get_dependents.ts#L37))
  - `.label` — module list display, script runner ([modules.ts:497,659,968,1010](server/db/project/modules.ts#L497))
  - `.configRequirements` — parameter handling ([modules.ts:499](server/db/project/modules.ts#L499))
  - `.resultsObjects` — installation + run-module iteration ([modules.ts:246](server/db/project/modules.ts#L246), [run_module_iterator.ts:84,256,270](server/worker_routines/run_module/run_module_iterator.ts#L84))
  - `.script`, `.scriptGenerationType`, `.dataSources`, `.assetsToImport` — script execution ([get_script_with_parameters.ts](server/server_only_funcs/get_script_with_parameters.ts), [run_module_iterator.ts](server/worker_routines/run_module/run_module_iterator.ts))
- Readers that are NOT needed (data duplicated elsewhere):
  - `.metrics` — already in `metrics` table (structured columns + `viz_presets` JSON column).
  - `.metrics[*].vizPresets` — duplicated into `metrics.viz_presets`.
  - `.periodOptions` — removed in PLAN item 2.

### Why this is a problem

- Bloat accumulates silently. The refactor we just did left `periodOpt`, `defaultPeriodFilterForDefaultVisualizations`, fabricated `PeriodBounds` in existing `module_definition` blobs. Nothing crashes; nothing visible breaks; the stale data just sits there forever until reinstall.
- No typed contract between write and read. `JSON.stringify(modDef.data)` writes whatever the current `ModuleDefinition` shape is. `parseJsonOrThrow<ModuleDefinition>(raw)` lies — TS claims the parsed object conforms, but nothing checks.
- No signal when the stored shape drifts from what code expects. Silent drift.

## Design

### Narrow type

```ts
// lib/types/stored_module_definition.ts (or similar)
export type StoredModuleDefinition = {
  label: TranslatableString;
  description: TranslatableString;
  scriptGenerationType: "template" | "hfa";
  script: string;
  configRequirements: ConfigRequirements;
  dataSources: DataSource[];
  assetsToImport: AssetToImport[];
  prerequisiteModules: ModuleId[];
  resultsObjects: ResultsObjectDefinition[];
};
```

Deliberately excluded:
- `metrics` (in `metrics` table)
- `periodOptions` on metrics (being removed)
- Anything else currently in `ModuleDefinition` that no runtime reader touches

### Adapter-as-validator

```ts
// lib/legacy/stored_module_definition.ts
export function adaptStoredModuleDefinition(raw: unknown): StoredModuleDefinition {
  // ... split semantics below
}
```

Semantic split:

| Field | Missing / invalid behavior |
|-------|----------------------------|
| `label` | **throw** — module can't be identified |
| `description` | **throw** — should always be present |
| `scriptGenerationType` | **throw** — invalid enum → can't run |
| `script` | **throw** — module can't run without it |
| `configRequirements` | **throw** — install assumes structure |
| `dataSources` | **throw** if not array |
| `resultsObjects` | **throw** if not array — run_module requires it |
| `assetsToImport` | **default to `[]`** — typically empty anyway |
| `prerequisiteModules` | **default to `[]`** — optional by nature |
| unknown fields | **drop silently** — narrowing is the point |
| known-legacy fields (`metrics`, `periodOptions`, old vizPresets shapes) | **drop silently** — not part of stored shape |

Implementation: hand-written picker/validator, not Zod's `.parse()` (which throws on any unknown field). Zod's `.passthrough()` + `.transform(pick)` would work too but hand-written is clearer about the lenient/strict split.

### Write-side reshape

On install, serialize only the narrow shape. This actively strips bloat going forward — even without a DB migration, every reinstall cleans the row.

```ts
// was:
await sql`INSERT INTO modules (..., module_definition, ...) VALUES (..., ${JSON.stringify(modDef.data)}, ...)`;
// becomes:
const stored = toStoredModuleDefinition(modDef.data);
await sql`INSERT INTO modules (..., module_definition, ...) VALUES (..., ${JSON.stringify(stored)}, ...)`;
```

`toStoredModuleDefinition` is a pure projection function (no tolerance, no defaults — it receives a valid `ModuleDefinition` and picks the subset).

### Read-side wiring

Per the Item 1 plan, adaptation wires at the service-layer. All current `parseJsonOrThrow<ModuleDefinition>(raw)` sites should:

1. Return `StoredModuleDefinition`, not `ModuleDefinition` (narrower type communicates intent).
2. Call `adaptStoredModuleDefinition` on the parsed JSON.

Readers currently typed as `ModuleDefinition` need to change. This is tractable because they only access the fields that survived the narrowing — a typecheck error there would indicate a bug (code is reading a field that shouldn't be in the stored blob).

## Changes

### Part A — Define the narrow type

**A1.** Create `lib/types/stored_module_definition.ts`:
```ts
export type StoredModuleDefinition = { /* as above */ };
```

**A2.** Add `toStoredModuleDefinition(md: ModuleDefinition): StoredModuleDefinition` in the same file. Pure field-picker.

**A3.** Export from `lib/types/mod.ts`.

### Part B — Write the adapter-as-validator

**B1.** Create `lib/legacy/stored_module_definition.ts`:
- Exports `adaptStoredModuleDefinition(raw: unknown): StoredModuleDefinition`.
- Lenient for: missing optional fields, unknown bloat, old legacy field names (e.g., if we ever rename in the future).
- Strict for: missing required fields, wrong types, invalid enums.
- Document the split at the top of the file.

**B2.** Export from `lib/legacy/mod.ts` (created in the Item 1 plan).

### Part C — Update write paths

**C1.** [server/db/project/modules.ts](server/db/project/modules.ts) at install ([line 108](server/db/project/modules.ts#L108)) — replace `JSON.stringify(modDef.data)` with `JSON.stringify(toStoredModuleDefinition(modDef.data))`.

**C2.** Same for reinstall / config-update paths in `modules.ts` that overwrite `module_definition` (line ~396).

**C3.** Same for any other write site. Grep for `module_definition = ` and audit.

### Part D — Update read paths

**D1.** Find all `parseJsonOrThrow<ModuleDefinition>(rawModule.module_definition)` sites (from earlier grep: ~10 sites across `server/db/project/modules.ts`, `server/task_management/get_dependents.ts`, `server/server_only_funcs/get_script_with_parameters.ts`, `server/db/project/presentation_objects.ts`).

**D2.** For each, replace with:
```ts
const storedDef = adaptStoredModuleDefinition(parseJsonOrThrow(rawModule.module_definition));
```
And retype the downstream variable as `StoredModuleDefinition`.

**D3.** TypeScript will flag any reader that accesses a field excluded from `StoredModuleDefinition`. For each such error:
- If the field is legitimately needed at runtime → add it to `StoredModuleDefinition` (expand the narrow type).
- If the reader is only checking something duplicated elsewhere (e.g., `.metrics`) → rewrite the reader to use the proper source (metrics table).

**D4.** [server/db_startup.ts:142](server/db_startup.ts#L142) migrations run on stored JSON. Check if that migration needs shape awareness — likely not (it only reads `resultsObjects` and `metrics`, and the migration is idempotent-guarded so it's fine if it breaks on fully-migrated data).

### Part E — Document

**E1.** Add a section to [DOC_legacy_handling.md](DOC_legacy_handling.md) for `StoredModuleDefinition`:
- Explains the narrow-type + adapter-validator pattern.
- Notes it's an extension of Pattern 1.
- Documents the lenient-vs-strict split.

**E2.** Consider updating [CLAUDE.md](CLAUDE.md) or a new architecture doc explaining the install-vs-runtime data flow: module source (file) → install → (partial) normalized tables + stored narrow blob → runtime read via adapter-validator.

## Backwards compatibility

All existing rows in `modules.module_definition` have the old full-fat shape. On read:
- `adaptStoredModuleDefinition` picks out only the fields in the narrow type.
- Unknown fields (metrics, periodOptions, whatever accumulated) are silently dropped.
- Required fields still present → adapted output is clean.
- A required field genuinely missing → throws. (Highly unlikely for well-installed modules.)

Bloat doesn't clear from the DB until the module is reinstalled. But the read path produces clean shape regardless. Self-healing over time; no migration required.

## Testing

1. `deno task typecheck` after each part.
2. Install a module fresh; check DB row has only the narrow fields in its JSON.
3. Load app against a DB with old-shape rows (existing ones); verify reads work and adapted output is correct.
4. Corrupt test: hand-edit a DB row to remove `script`; verify the read throws loudly with a clear error.
5. Bloat test: hand-edit a DB row to add a spurious `extraFoo: "bar"`; verify the read succeeds and the field is not in the output.

## Open questions

- **Should we run a one-time cleanup migration** (JS startup, Pattern 4) to reshape all existing rows eagerly? Probably no — adapter covers reads, self-heal on reinstall suffices. If you want deterministic cleanup, a migration is cheap.
- **Type `parseJsonOrThrow<StoredModuleDefinition>(...)` doesn't validate — it just casts.** Do we want to retire that pattern in favor of always going through the adapter? Yes, for this specific column. Elsewhere, case-by-case.
- **Consider also retiring `ModuleDefinition` as a runtime type for reads**? Only `install`-side code should ever touch `ModuleDefinition` (the full shape from file/JSON). Every DB read should only see `StoredModuleDefinition`. Worth enforcing by removing `ModuleDefinition` from readers' imports.
