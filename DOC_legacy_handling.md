# Legacy & Migration Handling

Single source of truth for **how old data reaches current code, and how we prove it.** Keep this doc up-to-date when adding new migrations, adapters, or legacy shims.

## The five patterns

| # | Pattern                              | Use when                                                   | Cleanup                                                                    |
|---|--------------------------------------|------------------------------------------------------------|----------------------------------------------------------------------------|
| 1 | Colocated adapter via `z.preprocess` | JSON blob shape changed, TS/text column                    | Remove the adapter transform once all rows re-saved (or Pattern 4 forces)  |
| 2 | Inline read-time auto-migrate        | Single narrow field rename/rewrite, hot path               | Fold into a Pattern 1 adapter when it grows                                |
| 3 | Dual-check "legacy adapter" comments | Bool/enum deprecated, read from many sites                 | Remove comment-marked lines once confident all configs re-saved            |
| 4 | One-off JS startup migration         | Cross-table structural change, PostgreSQL jsonb-unfriendly | Keep forever (idempotent); delete once no deployments remain with old data |
| 5 | SQL schema migration                 | Column/table shape changes                                 | Keep forever                                                               |

**Not a pattern: deliberate non-adaptation.** Sometimes missing = correct in the domain. See ["When NOT to adapt"](#when-not-to-adapt).

---

## Pattern 1 — Colocated adapter via `z.preprocess`

The primary pattern. Every drift-tolerant stored type follows the same shape:

```
DB text → JSON.parse → [z.preprocess: adapter runs] → strict validation → typed value
```

The adapter is **baked into the public schema** via `z.preprocess(adapter, strictSchema)`. Every `.parse` / `.safeParse` on the schema runs the adapter automatically. Callers cannot bypass it.

### Where the files live

Each drift-managed type gets one file in `lib/types/`, underscore-prefixed to group them at the top of the directory:

- [`_module_definition_github.ts`](lib/types/_module_definition_github.ts) — module defs authored in GitHub. Strict, no preprocess, no drift tolerance. Single call site: [`load_module.ts`](server/module_loader/load_module.ts).
- [`_module_definition_installed.ts`](lib/types/_module_definition_installed.ts) — module defs written by the install flow. Preprocessed entry points: `metricAIDescriptionInstalled`, `vizPresetInstalled`, `moduleDefinitionInstalledSchema`. All per-level adapters live here (exported so they can be composed).
- [`_presentation_object_config.ts`](lib/types/_presentation_object_config.ts) — PO configs (user-created via UI). Preprocessed entry point: `presentationObjectConfigSchema`. Adapter delegates to `adaptLegacyConfigD` / `adaptLegacyConfigS` from the module-def installed file.
- [`reports.ts`](lib/types/reports.ts) — report-item shape adapter `adaptLegacyReportItemConfigShape`. **Not yet `z.preprocess`-wrapped** because `ReportItemConfig` has no Zod schema yet. Called explicitly at 2 read sites. When the schema lands, wrap it and delete the explicit calls.

DB-dependent legacy resolutions (need a connection, filesystem, network) stay server-side next to their caller. Currently: `resolveLegacyReportMetricIds` in [`server/db/project/reports.ts`](server/db/project/reports.ts).

### Rules

1. **Schemas describe current shape only.** Strict. No `.default()` / `.optional()` / `.nullish()` for drift tolerance. Drift handling lives in the adapter.
2. **Adapters are pure.** Signature `(raw: Record<string, unknown>) → Record<string, unknown>`. Idempotent. No side effects. They are called multiple times per request (nested preprocess firing, cache-hit re-validation); violations cause subtle bugs.
3. **GitHub schemas stay strict.** Never reference preprocessed schemas from the `_github` file. Authored `definition.json` files must match the current shape exactly — no silent normalization at fetch time.
4. **Reads and writes use the same schema.** Reads parse from DB; writes parse before insert. The adapter runs on both (no-op for current-shape input). One code path, no special cases.

### Enforcement: two layers, different times

| Layer | When | What it catches | Failure mode |
|---|---|---|---|
| **Startup sweep** | Boot (opt-in) | All drift, batched | Throws → boot aborts, deploy fails loudly in ops logs, zero user impact |
| **Runtime strict parse** | Every DB read | Anything that slipped past the sweep | Throws → `tryCatchDatabaseAsync` returns a structured API error → UI shows "failed to load" scoped to that viz/module |

Belt + suspenders. The sweep is the ops-time gate; runtime strict is the per-request net. Writes are also strict — nothing new can land in bad shape.

### How to enable the sweep

Set `VALIDATE_ON_STARTUP=true` in the environment. Boot will call [`validateStoredDataOnStartup`](server/db_startup_validation.ts) after migrations. Every schema-backed stored row is parsed against the current Zod schema. If any fail, a `[validate]` report is logged and the process throws.

Recommended ON in every non-dev environment (staging, prod).

### How to add a new drift variant

1. Add a transform to the relevant `adaptLegacy<X>` function in the domain's file.
2. Ship.

All call sites pick it up automatically because the adapter is baked into `z.preprocess`.

### How to add a new drift-managed type

1. Create `lib/types/_<name>.ts` (underscore prefix).
2. Declare the strict schema. No `.default()` / `.optional()` for drift.
3. Declare `adaptLegacy<X>(raw): Record<string, unknown>` — pure, idempotent.
4. Export `<x>Schema = z.preprocess((r) => typeof r === "object" && r !== null && !Array.isArray(r) ? adaptLegacy<X>(r as Record<string, unknown>) : r, strictSchema);`.
5. Add a convenience helper `parse<X>(raw: string): X { return <x>Schema.parse(JSON.parse(raw)); }`.
6. Wire the schema into the startup sweep (`server/db_startup_validation.ts`). Without this, the sweep won't catch drift on this type.
7. Add an entry to [Active adapter inventory](#active-adapter-inventory) below.

### Active adapter inventory

**[`_module_definition_installed.ts`](lib/types/_module_definition_installed.ts)** — preprocess entry points `metricAIDescriptionInstalled`, `vizPresetInstalled`, `moduleDefinitionInstalledSchema`. Per-level adapters:

- `adaptLegacyPeriodFilter` — `last_12_months` → `last_n_months+nMonths:12`; fill `filterType: "custom"` when undefined; strip fabricated bounds from relative types.
- `adaptLegacyConfigD` — rename `periodOpt` → `timeseriesGrouping`; nested periodFilter adaptation.
- `adaptLegacyConfigS(raw, isMap)` — legacy `s.conditionalFormatting` string preset id via `LEGACY_CF_PRESETS`; legacy map color fields via `buildCfFromLegacyMapFields` when `isMap`; flattens any captured CF via `flattenCf` into flat `cf*` fields; fills missing cf* fields from `CF_STORAGE_DEFAULTS`; fills `specialDisruptionsChart` from legacy `diffAreas` (Pattern 3); strips legacy `conditionalFormatting` and all `map*` fields. Parent adapters derive `isMap` from sibling `d.type`.
- `adaptLegacyVizPresetTextConfig` — fill missing nullable text-config fields.
- `adaptLegacyMetricAIDescription` — fill missing `caveats`, `importantNotes`, `relatedMetrics`.
- `adaptLegacyVizPreset` — drop `defaultPeriodFilterForDefaultVisualizations`; fill missing required fields; walk into `config.d` / `config.s` / `config.t`.
- `adaptLegacyModuleDefinition` — fill top-level defaults. Does **not** recurse into `metrics[]` — nested `metricAIDescriptionInstalled` and `vizPresetInstalled` preprocesses handle nested drift.
- `adaptLegacyMetricDefinition`, `adaptLegacyResultsObjectDefinition`, `adaptLegacyDefaultPresentationObject` — currently identity. Placeholders so future transforms land in a predictable spot.
- Call sites: `parseInstalledModuleDefinition(raw: string)`; 10 read sites in [`modules.ts`](server/db/project/modules.ts) + [`get_dependents.ts`](server/task_management/get_dependents.ts); `z.array(vizPresetInstalled).parse(...)` for viz-presets column; `metricAIDescriptionInstalled.parse(...)` for AI-description column.

**[`_module_definition_github.ts`](lib/types/_module_definition_github.ts)** — strict schema for `definition.json` files. Single call site at [`load_module.ts`](server/module_loader/load_module.ts). No preprocess.

**[`_presentation_object_config.ts`](lib/types/_presentation_object_config.ts)** — preprocess entry point `presentationObjectConfigSchema`. Adapter `adaptLegacyPresentationObjectConfig` delegates to `adaptLegacyConfigD` and `adaptLegacyConfigS`. Strict throughout: 5 read sites + 1 cache-hit site use the convenience helper `parsePresentationObjectConfig(raw: string)`; 3 write sites call `presentationObjectConfigSchema.parse(config)` directly. No permissive fallback.

**[`reports.ts`](lib/types/reports.ts)** — `adaptLegacyReportItemConfigShape`. Not preprocessed yet (Zod schema pending). Called explicitly at 2 read sites in [`server/db/project/reports.ts`](server/db/project/reports.ts).

**[`server/db/project/reports.ts`](server/db/project/reports.ts)** — `resolveLegacyReportMetricIds(config, projectDb)` (DB-dependent `moduleId` → `metricId` lookup). Stays server-side. Chained with `adaptLegacyReportItemConfigShape` at the 2 read sites.

---

## Pattern 2 — Inline read-time auto-migrate

A single in-place rewrite done inside a read or resolve function. Smaller than Pattern 1; usually one transform.

**Active sites:**

- [`client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx:26-44`](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L26) — `resolvePeriodFilter` realigns a stored `periodFilter.periodOption` when it doesn't match the data's actual time column. This is **runtime alignment**, not legacy migration — handles the case where data shape genuinely differs from what the filter was authored against.

**Graduation rule:** when a second legacy transform for the same entity appears, consolidate into Pattern 1.

---

## Pattern 3 — Dual-check "legacy adapter" comments

At every read site, check both the old field AND the new field as equivalent. Written-out condition: `newFlag || (oldConditions...)`. Every such line is marked with the exact comment `// Legacy adapter — remove once all configs migrated` so grep finds them together.

**Active sites — `diffAreas` → `specialDisruptionsChart`:**

- [`client/src/generate_visualization/get_style_from_po.ts:21`](client/src/generate_visualization/get_style_from_po.ts#L21)
- [`client/src/generate_visualization/conditional_formatting.ts:211`](client/src/generate_visualization/conditional_formatting.ts#L211)
- [`client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx:106`](client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx#L106)
- [`client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx:41,51`](client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx#L41)

**Cleanup:** grep for `Legacy adapter — remove once all configs migrated`. Delete once every config re-saved (or a Pattern 4 migration forced it).

**Prefer Pattern 1 for new work.** Pattern 3 scatters knowledge.

---

## Pattern 4 — One-off JS startup migration

Runs once at app startup. Tracked in the `schema_migrations` table via a `MIGRATION_ID`. Idempotent check at the top.

**Canonical example:** [`server/db_startup.ts` `migrateToMetricsTables`](server/db_startup.ts). MIGRATION_ID: `js_migrate_to_metrics_2025_02`.

**Shape:**

```ts
async function migrateXxx(sql) {
  const MIGRATION_ID = "js_migrate_xxx_YYYY_MM";
  const applied = await sql`SELECT ... FROM schema_migrations WHERE migration_id = ${MIGRATION_ID}`;
  if (applied.length > 0) return;

  await sql.begin(async (tx) => {
    // ... do the migration ...
    await tx`INSERT INTO schema_migrations (migration_id) VALUES (${MIGRATION_ID})`;
  });
}
```

**When to use:** cross-table or cross-entity structural change that's awkward in SQL — especially JSON blob surgery (our config columns are `text`, not `jsonb`, so `jsonb_set` isn't practical).

**Lifetime:** these stay in startup code forever. Idempotent — harmless on migrated DBs. Only delete once no deployment could encounter a pre-migration database.

---

## Pattern 5 — SQL schema migration

Versioned `.sql` files, auto-run at startup. For column additions, table creations, index changes, constraint adjustments.

**Locations:**

- [`server/db/migrations/instance/`](server/db/migrations/instance/) — main database.
- [`server/db/migrations/project/`](server/db/migrations/project/) — each project database.

**Naming:** `NNN_description.sql`, zero-padded. Numbers unique within each directory.

### Rules — read before writing a migration

1. **Idempotent.** Use `IF NOT EXISTS`, `IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`. No `CREATE TABLE` without `IF NOT EXISTS`. No `INSERT` without `ON CONFLICT DO NOTHING` / `ON CONFLICT DO UPDATE`.
2. **Update the live schema files too.** [`server/db/instance/_main_database.sql`](server/db/instance/_main_database.sql) and [`server/db/project/_project_database.sql`](server/db/project/_project_database.sql) are source-of-truth for fresh DBs. If you add a column in a migration, add it to the `CREATE TABLE` too.
3. **Don't rewrite old migrations.** Fix forward with a new one.

**Minimal example** ([`008_slide_deck_config.sql`](server/db/migrations/project/008_slide_deck_config.sql)):

```sql
ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS config text;
```

**When to use:** structural changes. Do NOT use for data transforms on JSON `text` columns — use Pattern 4.

---

## When NOT to adapt

Sometimes the right move is to adapt nothing. If a field is missing from old rows and the missing state already has a correct meaning in the domain, adapting is busywork.

**Active sites:**

- HFA project info ([`PLAN_hfa_02_staleness_detection.md:55`](PLAN_hfa_02_staleness_detection.md#L55)): `info = '{}'` → all snapshot fields `undefined` → treated as "stale", forcing re-export. Intentional. No migration, no adapter.

**Test:** could you "fix" this with a Pattern 1 adapter or Pattern 4 migration? Almost always yes. The question is whether the missing state is *already semantically correct*. If it is, don't adapt.

---

## User-initiated migrations

Not strictly "legacy handling" but the same family: explicit UI flows where the user triggers a one-shot data transform on their own project.

- [`client/src/components/project/migrate_reports_to_slides.tsx`](client/src/components/project/migrate_reports_to_slides.tsx) — user clicks "Migrate", old reports are read, new slide decks are created.

**When to use:** migration that depends on user intent, irreversible reshaping, or where surfacing the change to the user matters.

---

## How to add a new legacy-handling entry

Before writing code:

1. **Source of old shape?** Stored JSON blob? Column type? Missing-and-meaningful?
2. **Transforms needed?** One? Several? Cross-table?
3. **Write shape type-enforced?** If yes, old data self-heals on re-save; read-time adapter is enough. If no, you need a write-side migration too.

Then pick:

- JSON blob, 1 transform, simple → Pattern 2 (inline). Promote to Pattern 1 when a second arrives.
- JSON blob, drift-managed type → **Pattern 1**. Colocated adapter via `z.preprocess`. Wire into the startup sweep.
- Flag/enum rename read from many sites → Pattern 3 (dual-check). Prefer Pattern 1 if starting fresh.
- Cross-table or structural data move → Pattern 4 (JS startup migration). Idempotent + MIGRATION_ID.
- Column/table shape → Pattern 5 (SQL migration). Update both schema files. Idempotent guards.
- Missing = domain-meaningful → don't adapt. Document the intent.

Finally: **add an entry to this doc.**

---

## Cleanup audit — current debt

Sites that should eventually be removed:

| Site | Trigger for removal |
| --- | --- |
| `diffAreas` legacy adapter (5 sites, Pattern 3) | Once every deployed project has re-saved affected configs, or a Pattern 4 forces it |
| Legacy CF string-preset + map-color-field transforms in `_module_definition_installed.ts` (`adaptLegacyConfigS`, `LEGACY_CF_PRESETS` usage, `buildCfFromLegacyMapFields`) | Once every deployed project has re-saved affected configs, or a Pattern 4 forces it |
| `resolvePeriodFilter` runtime alignment in `_2_filters.tsx` | Not legacy — see [`PLAN_simplify_period_format.md`](PLAN_simplify_period_format.md); tied to the premise that results-object period format doesn't change |
| `migrateToMetricsTables` (Pattern 4) | Only when no deployment will see a pre-Feb-2025 database |
| `// Keep for backward compatibility` in panther types | Panther is an external library — not our maintenance concern |
