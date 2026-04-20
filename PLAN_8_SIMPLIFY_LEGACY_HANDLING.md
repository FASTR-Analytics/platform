# Plan: Simplify Legacy Handling

## Goal

Move from "runtime adaptation on every read" to "one-time migration at deploy time." Runtime code only sees current-shape data.

**Result:**
- No runtime adapters
- No z.preprocess wrappers
- No Pattern 3 dual-checks
- Simpler, faster read paths
- One clear pattern for schema evolution

---

## Phase 1: Migration System

**Objective:** Create one migration function per data type that runs at startup.

### 1.1 Design

Each stored data type gets one migration function. The function:
1. Runs at startup, in its own transaction
2. Reads all rows of that type
3. For each row: validates against current schema
   - If valid: skip (no-op)
   - If invalid: apply transforms, validate result, write
4. If any row fails validation after transforms: transaction rolls back, boot fails with error log

No `schema_migrations` tracking needed. The validation check itself determines whether work is needed. A row that passes validation is already current-shape.

### 1.2 Directory structure

```
server/db/migrations/
├── instance/              # SQL - main DB schema (existing)
├── project/               # SQL - project DB schema (existing)
└── data_transforms/       # JS - data shape migrations (new)
    ├── po_config.ts
    ├── module_definition.ts
    ├── metrics_columns.ts
    ├── slide_deck_config.ts   # stub for future
    └── slide_config.ts        # stub for future
```

### 1.3 Migration function pattern

Each file has a standard header documenting the table, schema location, and transform blocks.

```ts
// server/db/migrations/data_transforms/po_config.ts
//
// =============================================================================
// DATA TRANSFORM: presentation_objects.config
// =============================================================================
//
// Table:    presentation_objects
// Column:   config (JSON)
// Schema:   lib/types/_presentation_object_config.ts
//           → presentationObjectConfigSchema
//
// HOW THIS WORKS:
// - Runs at startup in a transaction
// - For each row: validate against current schema
// - If valid: skip (no work needed)
// - If invalid: apply transform blocks, validate, write
// - If any row fails validation after transforms: rollback, boot fails
//
// TRANSFORM BLOCKS: (see Phase 2.1 for full list)
//
// =============================================================================

import { presentationObjectConfigSchema } from "lib";
import type { Sql } from "postgres";

export async function migratePOConfigs(tx: Sql): Promise<void> {
  const rows = await tx`SELECT id, config FROM presentation_objects`;
  const now = new Date().toISOString();
  
  for (const row of rows) {
    const config = JSON.parse(row.config);
    
    // Already valid? Skip.
    if (presentationObjectConfigSchema.safeParse(config).success) {
      continue;
    }
    
    // Deep clone to avoid mutating original
    const transformed = structuredClone(config);
    
    // Transform blocks — see Phase 2.1 for full list
    // (abbreviated here, full implementation in Phase 2.1)
    
    // Block 1: periodOpt → timeseriesGrouping
    if (transformed.d?.periodOpt !== undefined) {
      transformed.d.timeseriesGrouping = transformed.d.periodOpt;
      delete transformed.d.periodOpt;
    }
    
    // Block 7: diffAreas → specialDisruptionsChart
    // NOTE: Don't delete diffAreas/diffAreasOrder — schema still requires them.
    // Set to neutral values. Phase 6 removes them from schema + data.
    if (transformed.s?.diffAreas === true) {
      transformed.s.specialDisruptionsChart = true;
    }
    transformed.s.diffAreas = false;
    transformed.s.diffAreasOrder = "actual-expected";
    
    // ... other blocks ...
    
    // Validate against current schema — throws if invalid
    const validated = presentationObjectConfigSchema.parse(transformed);
    
    // Write + update last_updated (invalidates cache)
    await tx`
      UPDATE presentation_objects 
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
  }
}
```

### 1.4 Stub template for future types

For types without current transforms (slide_deck_config, slide_config):

```ts
// server/db/migrations/data_transforms/slide_config.ts
//
// =============================================================================
// DATA TRANSFORM: slides.config
// =============================================================================
//
// Table:    slides
// Column:   config (JSON)
// Schema:   lib/types/slides.ts
//           → slideConfigSchema
//
// TRANSFORM BLOCKS: (none yet)
//
// =============================================================================

import { slideConfigSchema } from "lib";
import type { Sql } from "postgres";

export async function migrateSlideConfigs(tx: Sql): Promise<void> {
  const rows = await tx`SELECT id, config FROM slides`;
  const now = new Date().toISOString();
  
  for (const row of rows) {
    const config = JSON.parse(row.config);
    
    // Already valid? Skip.
    if (slideConfigSchema.safeParse(config).success) {
      continue;
    }
    
    // No transform blocks yet — if we get here, data is invalid
    // Add blocks above this line when schema evolves
    
    const validated = slideConfigSchema.parse(config);
    
    await tx`
      UPDATE slides 
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
  }
}
```

**Key properties:**
- Transform blocks are idempotent — safe to re-run
- Validation always against current schema — no schema versioning problem
- When schema evolves, add new blocks to the function
- Old blocks remain — they're no-ops for already-migrated data

### 1.5 Wire into startup

Update `server/db_startup.ts`:

```ts
// After SQL migrations, before server starts
for (const project of projects) {
  const projectDb = getPgConnectionFromCacheOrNew(project.id, "READ_AND_WRITE");
  await runProjectMigrations(projectDb);  // SQL (existing)
  
  // Data transforms — each in its own transaction
  await projectDb.begin(async (tx) => {
    await migratePOConfigs(tx);
  });
  await projectDb.begin(async (tx) => {
    await migrateModuleDefinitions(tx);
  });
  await projectDb.begin(async (tx) => {
    await migrateMetricsColumns(tx);
  });
  await projectDb.begin(async (tx) => {
    await migrateSlideDeckConfigs(tx);
  });
  await projectDb.begin(async (tx) => {
    await migrateSlideConfigs(tx);
  });
}
```

Each type has its own transaction. If module definitions fail, PO configs (already committed) are preserved. Boot still fails — server won't start with broken data.

### 1.6 Failure handling

**Collect all errors, then report.** Don't exit on first failure — try all types, give a full report, then exit if any failed.

```ts
type MigrationResult = { type: string; success: boolean; error?: Error; rowId?: string };

const results: MigrationResult[] = [];

// Run all migrations, collecting results
for (const { name, fn } of migrations) {
  try {
    await projectDb.begin(async (tx) => {
      await fn(tx);
    });
    results.push({ type: name, success: true });
  } catch (err) {
    results.push({ 
      type: name, 
      success: false, 
      error: err instanceof Error ? err : new Error(String(err)),
      rowId: extractRowIdFromError(err),  // if available
    });
  }
}

// Report results with clear formatting
logMigrationResults(project.id, results);

// Exit if any failed
if (results.some(r => !r.success)) {
  Deno.exit(1);
}
```

**Logging requirements:**

Use colors and clear formatting. Balance between:
- What failed (type name, row ID if available)
- Why it failed (validation error message, which field)
- What passed (quick summary)

Example output:
```
[migration] Project abc-123
  ✓ po_config (247 rows checked, 3 transformed)
  ✓ module_definition (12 rows checked, 0 transformed)
  ✗ metrics_columns
    Row: metric-456
    Error: Invalid enum value. Expected 'line' | 'bar', received 'unknown'
    Path: vizPresets[0].config.d.vizType
  ✓ slide_deck_config (0 rows)
  ✓ slide_config (0 rows)

[migration] FAILED — 1 of 5 types failed. Server will not start.
```

**Key details to log:**
- Type name (which migration)
- Row count checked vs transformed (shows progress even on success)
- On failure: row ID, Zod error message, path to invalid field
- Summary: X of Y passed, clear pass/fail verdict

---

## Phase 2: Transform Blocks

**Objective:** Define the idempotent transform blocks for each migration function.

### Cache Invalidation

When a row is transformed, update its `last_updated` column. This automatically invalidates Valkey cache entries (they use `last_updated` as version hash). No explicit cache flush needed.

### 2.1 Presentation object config

Function: `migratePOConfigs` in `server/db/migrations/data_transforms/po_config.ts`
Validates with: `presentationObjectConfigSchema`

**Transform blocks** (from `adaptLegacyConfigD` + `adaptLegacyConfigS`):

```ts
const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

// Use deep clone to avoid mutating original
const c = structuredClone(config);

// ─── configD transforms ───────────────────────────────────────────────

// Block 1: periodOpt → timeseriesGrouping
if (c.d?.periodOpt !== undefined) {
  c.d.timeseriesGrouping ??= c.d.periodOpt;
  delete c.d.periodOpt;
}

// Block 2: periodFilter.filterType "last_12_months" → "last_n_months"
if (c.d?.periodFilter?.filterType === "last_12_months") {
  c.d.periodFilter.filterType = "last_n_months";
  c.d.periodFilter.nMonths = 12;
  delete c.d.periodFilter.periodOption;
  delete c.d.periodFilter.min;
  delete c.d.periodFilter.max;
}

// Block 3: periodFilter.filterType undefined → "custom"
if (c.d?.periodFilter && c.d.periodFilter.filterType === undefined) {
  c.d.periodFilter.filterType = "custom";
}

// Block 4: Strip periodOption/min/max from relative filter types
if (c.d?.periodFilter && RELATIVE_FILTER_TYPES.has(c.d.periodFilter.filterType)) {
  delete c.d.periodFilter.periodOption;
  delete c.d.periodFilter.min;
  delete c.d.periodFilter.max;
}

// ─── configS transforms ───────────────────────────────────────────────

const isMap = c.d?.type === "map";
let legacyCf: ConditionalFormatting | undefined;

// Block 5: Legacy conditionalFormatting string preset → capture as legacyCf
if (c.s?.conditionalFormatting !== undefined) {
  const cfRaw = c.s.conditionalFormatting;
  if (typeof cfRaw === "string" && cfRaw in LEGACY_CF_PRESETS) {
    legacyCf = LEGACY_CF_PRESETS[cfRaw].value;
  }
  delete c.s.conditionalFormatting;
}

// Block 6: Legacy mapColor* fields → capture as legacyCf (maps only)
if (isMap && (!legacyCf || legacyCf.type === "none")) {
  if (c.s?.mapColorPreset || c.s?.mapColorFrom || c.s?.mapColorTo || 
      c.s?.mapColorReverse || c.s?.mapScaleType || c.s?.mapDiscreteSteps ||
      c.s?.mapDomainType || c.s?.mapDomainMin || c.s?.mapDomainMax) {
    legacyCf = buildCfFromLegacyMapFields(c.s);
  }
}

// Block 7: Strip legacy mapColor* fields (no home in current schema)
delete c.s?.mapColorPreset;
delete c.s?.mapColorFrom;
delete c.s?.mapColorTo;
delete c.s?.mapColorReverse;
delete c.s?.mapScaleType;
delete c.s?.mapDiscreteSteps;
delete c.s?.mapDomainType;
delete c.s?.mapDomainMin;
delete c.s?.mapDomainMax;

// Block 8: Fill flat cf* fields from captured legacyCf or defaults
const flatSource = legacyCf ? flattenCf(legacyCf) : CF_STORAGE_DEFAULTS;
for (const [key, value] of Object.entries(flatSource)) {
  if (!(key in c.s)) c.s[key] = value;
}

// Block 9: diffAreas → specialDisruptionsChart
// NOTE: Don't delete diffAreas/diffAreasOrder — schema still requires them.
// Set to neutral values. Phase 6 removes them from schema + data.
if (c.s?.diffAreas === true) {
  c.s.specialDisruptionsChart = true;
}
c.s.diffAreas = false;
c.s.diffAreasOrder = "actual-expected";
```

**Helper imports:**
- `buildCfFromLegacyMapFields` — from `_module_definition_installed.ts`
- `flattenCf`, `CF_STORAGE_DEFAULTS` — from `conditional_formatting.ts`
- `LEGACY_CF_PRESETS` — from `legacy_cf_presets.ts`

### 2.2 Module definition (installed)

Function: `migrateModuleDefinitions` in `server/db/migrations/data_transforms/module_definition.ts`
Validates with: `moduleDefinitionInstalledSchema`

Transform blocks (from various `adaptLegacy*` functions):

- Fill missing top-level fields: `prerequisites`, `lastScriptUpdate`, `dataSources`, etc.
- For each metric's `aiDescription`: fill `caveats`, `importantNotes`, `relatedMetrics`
- For each metric's `vizPresets[]`: apply same transforms as PO config, plus:
  - Drop `defaultPeriodFilterForDefaultVisualizations`
  - Fill `importantNotes`, `createDefaultVisualizationOnInstall`, `needsReplicant`, `allowedFilters`
  - Fill text config nullable fields

### 2.3 Metrics columns

Function: `migrateMetricsColumns` in `server/db/migrations/data_transforms/metrics_columns.ts`
Validates with: `metricAIDescriptionInstalled` (ai_description), `z.array(vizPresetInstalled)` (viz_presets)

Transform blocks:

- `metrics.ai_description`: same as module definition aiDescription transform
- `metrics.viz_presets`: same as module definition vizPresets transform

### 2.4 Report item config — NOT INCLUDED

**Reports are deprecated.** The only consumer of report items is the `migrate_reports_to_slides.tsx` tool, which converts old reports to slide decks.

Rather than transforming report_items at startup (for deprecated data), the legacy adapters (`adaptLegacyReportItemConfigShape`, `resolveLegacyReportMetricIds`) stay in place and are used only by the migration tool. This keeps adapter code isolated to the one place that needs it.

---

## Phase 3.0: Full Metric Write-Time Validation

**Objective:** Validate the entire metric row at write time using `metricStrict`.

We have a full `Metric` schema (`metricStrict` in `_metric_installed.ts`). Use it to validate the entire metric object before INSERT — one validation call catches all issues (JSON structure, enum values, required fields).

**Location:** `server/db/project/modules.ts` — the metric INSERT in `installModule` and `updateModuleDefinition`.

**Action:** Before inserting a metric, validate with `metricStrict.parse(metric)`. The startup sweep catches stored data issues; write-time validation prevents new issues from entering.

---

## Phase 3: Write-Time Validation Audit

**Objective:** Ensure all write paths validate before INSERT/UPDATE.

### 3.1 Audit write paths

**Every write path must validate before INSERT/UPDATE.** Audit all stored types:

| Type | Write locations | Action |
|------|-----------------|--------|
| `presentation_objects.config` | `server/db/project/presentation_objects.ts` | Verify `presentationObjectConfigSchema.parse()` before write |
| `modules.module_definition` | `server/db/project/modules.ts` (installModule) | Verify `moduleDefinitionInstalledSchema.parse()` before write |
| `metrics.*` (full row) | `server/db/project/modules.ts` | Validate with `metricStrict.parse()` before write |
| `slide_decks.config` | `server/db/project/slide_decks.ts` | Verify `slideDeckConfigSchema.parse()` before write |
| `slides.config` | `server/db/project/slides.ts` | Verify `slideConfigSchema.parse()` before write |
| `instance_config.*` | `server/db/instance/instance_config.ts` | Verify schema validation before write |

For each: grep for INSERT/UPDATE statements, ensure Zod parse happens before the write.

**Note:** `report_items.config` is excluded — reports are deprecated and only read by the migration tool.

---

## Phase 4: Audit External Boundary Validation

**Objective:** Ensure all external input is validated before it enters the system.

### 4.1 Audit external boundaries

| Boundary | Location | Schema | Action |
|----------|----------|--------|--------|
| User form input (PO config) | Client → API routes | `presentationObjectConfigSchema` | Verify route validates before passing to DB function |
| User form input (report config) | Client → API routes | `reportConfigSchema`, `reportItemConfigSchema` | Verify or add validation |
| AI-generated visualizations | `server/ai/` | `presentationObjectConfigSchema` | Verify AI output validated before storage |
| DHIS2 imports | `server/dhis2/` | Various | Verify imported data validated |
| CSV uploads | `server/worker_routines/stage_*` | Staging validation | Verify validation during staging |
| API request bodies | `server/routes/` | Route-specific schemas | Spot-check critical routes |

### 4.2 Add missing validation

For any boundary found without validation:
1. Identify the appropriate Zod schema
2. Add `.parse()` or `.safeParse()` before the data proceeds
3. Return structured error to caller on validation failure

---

## Phase 5: Simplify Read Paths

**Objective:** Remove runtime adaptation. Trust the database.

### 5.1 Remove z.preprocess wrappers

In `lib/types/_module_definition_installed.ts`:
- `moduleDefinitionInstalledSchema` — remove z.preprocess, use strict schema directly
- `metricAIDescriptionInstalled` — remove z.preprocess
- `vizPresetInstalled` — remove z.preprocess

In `lib/types/_presentation_object_config.ts`:
- `presentationObjectConfigSchema` — remove z.preprocess

### 5.2 Simplify parse helpers

```ts
// Before
export function parsePresentationObjectConfig(raw: string): PresentationObjectConfig {
  return presentationObjectConfigSchema.parse(JSON.parse(raw));
}

// After
export function parsePresentationObjectConfig(raw: string): PresentationObjectConfig {
  return JSON.parse(raw) as PresentationObjectConfig;
}
```

Same for:
- `parseInstalledModuleDefinition`
- Report item parsing in `server/db/project/reports.ts`

### 5.3 Delete adapter functions

In `lib/types/_module_definition_installed.ts`, delete:
- `adaptLegacyPeriodFilter`
- `adaptLegacyConfigD`
- `adaptLegacyConfigS`
- `adaptLegacyVizPresetTextConfig`
- `adaptLegacyMetricAIDescription`
- `adaptLegacyVizPreset`
- `adaptLegacyMetricDefinition`
- `adaptLegacyResultsObjectDefinition`
- `adaptLegacyDefaultPresentationObject`
- `adaptLegacyModuleDefinition`

In `lib/types/_presentation_object_config.ts`, delete:
- `adaptLegacyPresentationObjectConfig`

**Note:** Report item adapters (`adaptLegacyReportItemConfigShape`, `resolveLegacyReportMetricIds`) are NOT deleted — they stay in place for the deprecated reports → slides migration tool.

### 5.4 Remove adapter imports

Search for imports of deleted functions and remove them.

### 5.5 Remove cache-hit adapter

In `server/routes/project/presentation_objects.ts` (around line 152-164), remove the `presentationObjectConfigSchema.parse()` call on cache hits. After migrations run and adapters are removed, cached data is always current shape — no adaptation needed.

Before:
```ts
return c.json(
  existing.success
    ? {
        ...existing,
        data: {
          ...existing.data,
          config: presentationObjectConfigSchema.parse(existing.data.config),
        },
      }
    : existing,
);
```

After:
```ts
return c.json(existing);
```

### 5.6 Keep db_startup_validation.ts as strict-only

`server/db_startup_validation.ts` runs AFTER migrations. After Phase 5, schemas lose `z.preprocess`, so validation becomes strict-only (no transformation).

**Keep it as defense-in-depth.** It catches:
- Migration bugs that slip through
- Manual SQL tampering
- Any edge case where invalid data enters the DB

No code changes needed — it just becomes stricter automatically when z.preprocess is removed.

---

## Phase 6: Delete Pattern 3 Dual-Checks

**Objective:** Remove scattered legacy checks from client code.

The PO config migration already deleted `diffAreas` from stored configs and set `specialDisruptionsChart`. The dual-checks in client code are now dead code.

### 6.1 Delete dual-checks

Remove legacy adapter comments and code from:
- `client/src/generate_visualization/get_style_from_po.ts:20-21`
- `client/src/generate_visualization/conditional_formatting.ts:119-120`
- `client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx:105-106`
- `client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx:40-41`

Change from:
```ts
config.s.specialDisruptionsChart ||
(config.s.content === "areas" && config.s.diffAreas)
```

To:
```ts
config.s.specialDisruptionsChart
```

### 6.2 Remove diffAreas from schema and stored data

**Step 1: Update migration to delete fields (code change in Phase 6)**

Phases 1-4 shipped with the "keep diffAreas" version of Block 9 (sets to false, doesn't delete). Now update `po_config.ts`, `module_definition.ts`, and `metrics_columns.ts` to replace Block 9 with the "delete" version:

```ts
// Block 9: Delete diffAreas/diffAreasOrder (schema no longer has them)
if (c.s?.diffAreas === true) {
  c.s.specialDisruptionsChart = true;
}
delete c.s.diffAreas;
delete c.s.diffAreasOrder;
```

**Step 2: Remove from schemas**

In `lib/types/_module_definition_installed.ts` and `_presentation_object_config.ts`:
- Remove `diffAreas` and `diffAreasOrder` from `configSStrict`

In `lib/types/_module_definition_github.ts`:
- Remove `diffAreas` and `diffAreasOrder` from `configSGithubStrict`

**Step 3: Update GitHub module definitions**

All modules are sourced from `FASTR-Analytics/modules` (internal). Update any `definition.json` files that use `diffAreas` before deploying this phase.

---

## Phase 7: Update Documentation

### 7.1 Replace DOC_legacy_handling.md

Replace with new doc (see DOC_legacy_handling_v2.md) that reflects:
- Single pattern: startup migrations
- No runtime adaptation
- Clear process for schema changes

### 7.2 Update CLAUDE.md if needed

Remove any references to legacy adapter patterns.

### 7.3 Delete obsolete docs

- Any PLAN files related to legacy handling that are now complete

---

## Execution Order

Phases can be executed incrementally:

1. **Phase 1** — Sets up migration functions. Idempotent, backward-compatible (adapters still work).
2. **Phase 2** — Defines transform blocks. Ships with Phase 1.
3. **Phase 3** — Adds report item schema + audits write-time validation.
4. **Phase 4** — Audits external boundary validation.
5. **Phase 5** — Ship AFTER all deployments have run migrations. This is the breaking change that removes adapters.
6. **Phase 6** — Ship AFTER Phase 5. Removes legacy field entirely.
7. **Phase 7** — Ship with or after Phase 5.

**Recommended approach:**
- Ship Phases 1-4 together (migration system + validation audit)
- Wait for all deployments to boot successfully (migrations run on startup)
- Ship Phases 5-7 together (remove adapters + cleanup)

---

## Risk Mitigation

### Migration correctness

- Each migration is tested against real data shapes before deploy
- Migrations run in transaction — partial failure = full rollback
- Startup sweep validates all data after migrations — catches bugs immediately

### Pre-deploy testing

**Required before deploying Phase 2:**

1. **Test against prod data dump.** Export prod database, run migrations in staging, verify:
   - All migrations complete without error
   - Startup sweep passes
   - Spot-check transformed data looks correct

### Rollback

- If Phase 5 is deployed and there's an issue: rollback code, data is still valid (migrations are forward-only but data shape is still correct)
- Migrations themselves cannot be rolled back without writing reverse migrations (acceptable for this use case)

**If a migration corrupts data:**
- Migrations run in transactions — if validation fails mid-migration, the whole migration rolls back
- If corruption is discovered after commit: restore from pre-migration snapshot (see below)

### Database snapshots

**Take a snapshot before deploying Phase 2 migrations to production.**

- Cloud providers: use managed snapshot feature
- Self-hosted: `pg_dump` before deploy

This is your safety net if a migration has a bug that passes validation but produces semantically wrong data.

### Timing

- Phase 2 migrations may take time on large datasets (estimate: 1-5 minutes per 10k rows)
- Consider: run migrations during maintenance window for large instances
- Monitor migration duration in logs: `[migration] Applied XXX in Yms`

---

## Verification Checklist

### How to verify all deployments have migrated

Since migrations validate against the current schema, a successful boot means all data is migrated. If any row fails validation, boot fails.

**Verification:** All production instances have booted successfully after deploying Phase 1-2.

### Before shipping Phase 5

- [ ] All production deployments have booted successfully (migrations ran)
- [ ] No `adaptLegacy*` functions are called anywhere (grep verification)
- [ ] No z.preprocess wrappers remain on stored-data schemas
- [ ] All Pattern 3 sites removed (grep for "Legacy adapter")

---

## Files Changed

### New files

- `server/db/migrations/data_transforms/po_config.ts`
- `server/db/migrations/data_transforms/module_definition.ts`
- `server/db/migrations/data_transforms/metrics_columns.ts`
- `server/db/migrations/data_transforms/slide_deck_config.ts` (stub)
- `server/db/migrations/data_transforms/slide_config.ts` (stub)
- `DOC_legacy_handling.md` (replacement)

### Modified files

- `server/db_startup.ts` — wire in migration functions
- `lib/types/_module_definition_installed.ts` — remove adapters + z.preprocess
- `lib/types/_presentation_object_config.ts` — remove adapter + z.preprocess
- `lib/types/slides.ts` — add Zod schemas for slide_decks.config and slides.config
- `server/db/project/presentation_objects.ts` — simplify parsing
- `server/db/project/modules.ts` — simplify parsing
- `server/routes/project/presentation_objects.ts` — remove cache-hit adapter
- `client/src/generate_visualization/get_style_from_po.ts` — remove dual-check
- `client/src/generate_visualization/conditional_formatting.ts` — remove dual-check
- `client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx` — remove dual-check
- `client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx` — remove dual-check

### Deleted files

- None (code is deleted from files, not whole files)
