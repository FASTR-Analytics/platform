# Plan: Runtime Module Installation from GitHub (Revised)

## Summary

Decouple module definitions from app deployment. R developers edit scripts and definitions in GitHub repos; users install/update modules at runtime without redeployment. Only a lightweight module registry remains at build time.

This plan is structured as **7 independently-implementable parts**. Each part ships, deploys, and can be verified in isolation. If any part needs reverting, the others still stand.

---

## The Sync Model (Core Challenge)

Module data has two temporal identities:

| Category | Meaning | Source | Updated when |
|----------|---------|--------|-------------|
| **Installed definition** | What the module *claims* to produce | `modules.module_definition` + `metrics` table | User clicks "install" or "update" |
| **Run output** | What the module *actually produced* | Results object DATA tables | Module R script finishes |

These two can diverge. Between "update installed" and "re-run complete," the installed definition may describe columns/metrics that don't exist in the data tables yet.

### How this is already handled

The existing architecture has a safety valve: `enrichMetric()` dynamically discovers which columns exist in the results object data tables. Disaggregation options reflect what's *actually available*, not what the definition *says* should be available. Combined with dirty state (which tells the UI that results are stale), this means:

- **Labels, AI descriptions, important notes**: Always safe to update from installed definition (display-only).
- **VizPresets**: Safe to update because they're templates — when used to create a PO, the PO's fetchConfig will only succeed for columns that exist. If the module is dirty, the metric's status is `"results_not_ready"` and the UI already reflects this.
- **Results object schemas, metric valueProps/valueFunc**: Updated in the `metrics` table from the installed definition, but the actual data tables may not match until re-run. `enrichMetric()` bridges this gap.

### What drives compute?

Three things determine what a module's R script produces:

1. **The R script itself** — the code that runs
2. **The user's parameter/config selections** — what config the script receives
3. **The input data** — datasets and upstream module results (already handled by the existing dirty propagation system)

Everything in `definition.json` is **metadata about how to interpret and display results**. It does not affect what the R script produces. This includes all metric fields (labels, vizPresets, formatAs, valueFunc, valueProps, etc.), results object descriptions, and module labels.

### Change detection

When a module is updated from GitHub, the server compares the incoming definition against the stored one across three **compute-affecting fields**:

1. **R script content** — the code that runs
2. **`configRequirements`** — what parameters the script receives (a new param always comes with a script change, but a changed default value doesn't)
3. **`resultsObjects`** — the schema of what the script produces (column names, types)

If any of these three differ → Scenario B (compute change, must re-run).
If none differ but other definition fields changed → Scenario A (presentation-only update).
If nothing changed → no-op.

The comparison is straightforward: string comparison on script content, `JSON.stringify` comparison on `configRequirements` and `resultsObjects`.

### Update scenarios

**Scenario A: Presentation-only update (compute fields unchanged, other definition fields changed)**
1. Update `modules.module_definition` with new definition
2. Delete/recreate `metrics` rows (new labels, vizPresets, etc.)
3. Delete/recreate `results_objects` metadata rows (descriptions might change)
4. Do NOT drop results object DATA tables
5. Do NOT mark dirty
6. Update default POs if vizPreset configs changed

**Scenario B: Compute change (script, configRequirements, or resultsObjects changed)**
1. Full reinstall (like current `installModule`)
2. Drop and recreate results object DATA tables
3. Mark dirty → `'queued'` → triggers re-run

This maps directly onto the existing code: `updateModuleDefinition()` is Scenario A, `installModule()` is Scenario B. The new logic just decides which path to take based on comparing the three compute-affecting fields.

---

## Architecture

### Current flow
```
module_defs/ → build_module_definitions.ts → module_defs_dist/ + module_metadata_generated.ts → deploy → server loads at startup
```

### New flow
```
GitHub repos (script.R + definition.json per module)
  ↓ (fetched at runtime on "install/update module")
Validated with Zod
  ↓
Project DB (stores definition + script snapshot)
  ↓
Client gets everything via projectDetail
```

### Build-time (static, changes rarely)
- `lib/types/module_registry.ts` — list of available modules with GitHub coordinates
- Provides `MODULE_REGISTRY`, `ModuleId` type, prerequisite graph

### Runtime (fetched from GitHub on install)
- Full `ModuleDefinitionJSON` (metrics, vizPresets, dataSources, configRequirements, resultsObjects)
- R script source

---

## Modules Table Column Redesign

This plan is our opportunity to clean up the `modules` table columns. The current schema has ambiguous names (`last_updated` could mean anything) and redundant columns (`date_installed` and `last_updated` are always set to the same value). The new schema tracks what actually matters: the three things that can change (script, definition, config), when they last changed, and what version is installed vs what version produced the current results.

### New schema

| Column | Type | Set when | Meaning |
|--------|------|----------|---------|
| `id` | text PK | — | Module identifier |
| `module_definition` | text | Install, update | Full `ModuleDefinition` as JSON |
| ~~`config_type`~~ | — | — | **Dropped.** Redundant — derivable from `configRequirements.parameters` in the stored definition. |
| `config_selections` | text | Install, update, param change | User's current config as JSON |
| `dirty` | text | Various (existing system, unchanged) | `'queued'` / `'running'` / `'ready'` / `'error'` |
| `installed_at` | text | Install, update | When the current version was put in place. Updates on every install/update — a quick staleness signal ("this module hasn't been touched since March"). |
| `script_updated_at` | text | Install; update if script differs | When the R script content last changed. Only moves forward when the actual script text is different. |
| `definition_updated_at` | text | Install; update if definition differs | When the `definition.json` metadata last changed. Only moves forward when definition content is different. |
| `config_updated_at` | text | Install, param change | When the user last changed parameters/config. |
| `last_run_at` | text | Run completion | When the R script last completed execution. |
| `installed_git_ref` | text | Install, update | Commit SHA of the version fetched from git. |
| `last_run_git_ref` | text | Run completion | Commit SHA of the version that produced the current results. After an update but before re-run, `installed_git_ref ≠ last_run_git_ref` — telling you "what's installed" vs "what produced the current results." |

### What each timestamp answers

- **`installed_at`** — "How stale is this module?" (useful even without checking git for updates)
- **`script_updated_at`** — "When did the compute logic last change?"
- **`definition_updated_at`** — "When did the metric metadata last change?"
- **`config_updated_at`** — "When did the user last adjust parameters?"
- **`last_run_at`** — "When were the results last produced?"

### Relationship to dirty detection

These timestamps are **informational metadata**. They do NOT drive dirty detection. The existing `dirty` column remains the sole mechanism for determining whether a module needs re-running:

- Script changed → update flow marks `dirty = 'queued'`
- Config changed → update flow marks `dirty = 'queued'`
- Input data changed → existing dirty propagation marks `dirty = 'queued'`

The timestamps explain *why* and *when* something changed. The `dirty` column drives *what happens next*.

### Columns removed

| Old column | Disposition |
|------------|------------|
| `date_installed` | Renamed → `installed_at` |
| `last_updated` | Dropped (was always set to same value as `date_installed`, never read) |
| `last_run` | Renamed → `last_run_at` |
| `latest_ran_commit_sha` | Renamed → `last_run_git_ref` |

### Migration

All column changes happen in a single migration in Part 5d. The renames and additions are done via `ALTER TABLE` statements. All code that reads/writes these columns is updated in the same part: `DBModule` type, `installModule`, `updateModuleDefinition`, `updateModuleParameters`, `set_module_clean`, `set_module_dirty`, `getAllModulesForProject`, `getModuleDetail`, `InstalledModuleSummary` type, and client display code.

---

## Part 1: Standalone Type File + Zod Validation Schema

**Goal**: Create a self-contained type file for `ModuleDefinitionJSON` and a Zod schema that validates JSON against it. Zero behavior change.

### 1a. `lib/types/module_definition_schema.ts`

A single file containing all types needed to author a `definition.json`. It CAN import from other files in the project (unlike the original plan's "zero imports" constraint — that was over-engineered). The key constraint is: it must define `ModuleDefinitionJSON` and all its transitive dependencies clearly.

This file already effectively exists as the bottom half of `lib/types/module_definitions.ts`. The refactor is to make the JSON-authoring types cleanly separated from the runtime types.

Types to include:
- `ModuleDefinitionJSON` (top-level)
- `MetricDefinitionJSON`
- `ResultsObjectDefinitionJSON`
- `VizPreset`, `VizPresetTextConfig`
- `ScriptGenerationType` (added by HFA-to-instance migration)
- `MetricAIDescription`
- `DataSource`, `ScriptSource`, `ModuleConfigRequirements`
- All leaf unions: `ValueFunc`, `PeriodOption`, `DisaggregationOption`, etc.
- `TranslatableString` (re-exported)

### 1b. `lib/types/module_definition_validator.ts`

A Zod schema that validates a parsed JSON object against `ModuleDefinitionJSON`. This runs server-side at install/update time. Zod is a new dependency — needed because definitions now arrive as raw JSON from GitHub with no TypeScript compiler in the loop.

The Zod schema validates:
- All required fields present with correct types
- Enum values are valid (valueFunc, formatAs, periodOptions, disaggregationOptions, etc.)
- Metric resultsObjectId references a resultsObject defined in the same module
- No duplicate metric IDs within the module
- No duplicate results object IDs within the module
- Variant label consistency (ported from existing `validateMetrics` in `build_module_definitions.ts`)
- VizPreset config.d has valid structure

Does NOT validate (left to install-time cross-module check):
- Metric ID uniqueness across modules (Part 5)

### 1c. Refactor existing imports

Update `lib/types/module_definitions.ts` and `lib/types/presentation_objects.ts` to import shared types from the new schema file where appropriate.

### Files created
- `lib/types/module_definition_schema.ts`
- `lib/types/module_definition_validator.ts`

### Files modified
- `lib/types/module_definitions.ts` — import shared types from schema file
- `lib/types/mod.ts` — re-export new files
- `deno.json` — add `zod` dependency

### Verification
- `deno task typecheck` passes
- Write a test that validates each existing module's `definition.ts` export against the Zod schema

---

## Part 2: Add vizPresets + hide to Metrics DB + Server

**Goal**: Store vizPresets and hide flag in the metrics table. Replace server-side `METRIC_STATIC_DATA` usage. Zero client change.

### 2a. DB schema change

Add two columns to the `metrics` table:

```sql
ALTER TABLE metrics ADD COLUMN viz_presets text;  -- JSON array, nullable
ALTER TABLE metrics ADD COLUMN hide boolean DEFAULT false;
ALTER TABLE metrics ADD COLUMN important_notes text;  -- resolved string, nullable
```

Note: `importantNotes` exists on the `ResultsValue` type but is NOT currently in the metrics table and `enrichMetric()` never populates it. Currently it only reaches the client via `getMetricStaticData()`. When Part 3 removes that function, `importantNotes` would silently become `undefined` everywhere unless we add this column now.

Migration file: `server/db/migrations/project/009_add_viz_presets_and_hide_to_metrics.sql`

The migration must be **idempotent** (use `ADD COLUMN IF NOT EXISTS`):
```sql
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS viz_presets text;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS hide boolean DEFAULT false;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS important_notes text;
```

Also update `server/db/project/_project_database.sql` (the base schema for new projects) to include these columns in the `CREATE TABLE metrics` statement.

### 2b. Populate on install/update

In `installModule()` and `updateModuleDefinition()`, when inserting metric rows, include the new columns:

```typescript
// In the INSERT INTO metrics statement, add:
${metric.vizPresets ? JSON.stringify(metric.vizPresets) : null},  // viz_presets
${metric.hide ?? false},  // hide
${metric.importantNotes ?? null}  // important_notes
```

The `MetricDefinition` type already has `vizPresets?: VizPreset[]` and `hide?: boolean`, so the data is available from `modDef.data.metrics`.

### 2b-ii. Update `enrichMetric()` to populate `importantNotes`

`enrichMetric()` (`metric_enricher.ts:36-55`) builds a `ResultsValue` but never sets `importantNotes`. Add it to the return object:

```typescript
importantNotes: dbMetric.important_notes ?? undefined,
```

Without this, the `important_notes` column would exist in the DB but `enrichMetric()` would silently discard it, and `importantNotes` on `MetricWithStatus` would always be `undefined`.

### 2c. Replace server-side `METRIC_STATIC_DATA` usage

In `modules.ts`, two functions use `METRIC_STATIC_DATA`:

**`getAllMetrics()` (line ~821)**:
```typescript
// Before:
if (!(dbMetric.id in METRIC_STATIC_DATA)) continue;
// After:
// No filter needed — if the metric is in the DB, it's valid.
// The DB is the source of truth, not the generated file.
```

**`getMetricsWithStatus()` (line ~862)**:
```typescript
// Before:
const staticData = METRIC_STATIC_DATA[dbMetric.id];
if (!staticData || staticData.hide) continue;
// After:
if (dbMetric.hide) continue;
```

Remove the `METRIC_STATIC_DATA` import from `modules.ts`.

### 2d. Replace server-side `getModuleIdForMetric()` and `getModuleIdForResultsObject()`

These generated-file functions are also used server-side. Replace with DB queries:

**`presentation_objects.ts:416`** — `getModuleIdForMetric(body.metricId)`:
```typescript
// Before:
const moduleId = getModuleIdForMetric(body.metricId);
// After:
const metricRow = (await projectDb<{module_id: string}[]>`
  SELECT module_id FROM metrics WHERE id = ${body.metricId}
`).at(0);
if (!metricRow) throw new Error(`Unknown metric: ${body.metricId}`);
const moduleId = metricRow.module_id;
```

**`presentation_objects.ts:320`, `presentation_objects.ts:526`** — `getModuleIdForResultsObject(body.resultsObjectId)`:
```typescript
// Before:
const moduleId = getModuleIdForResultsObject(body.resultsObjectId);
// After:
const roRow = (await projectDb<{module_id: string}[]>`
  SELECT module_id FROM results_objects WHERE id = ${body.resultsObjectId}
`).at(0);
if (!roRow) throw new Error(`Unknown results object: ${body.resultsObjectId}`);
const moduleId = roRow.module_id;
```

**`get_presentation_object_items.ts:29`** — same pattern as above for `getModuleIdForResultsObject`.

**`projects.ts:359`** — `getPossibleModules()` used server-side for prerequisite resolution during project creation. Replace with `MODULE_REGISTRY` import (from Part 4). Since Part 4 comes after Part 2, this call site can be migrated in Part 4 alongside the client sites. Alternatively, move it to Part 2 if `MODULE_REGISTRY` is created early.

### 2e. Add vizPresets to MetricWithStatus

Extend `MetricWithStatus` to include vizPresets:

```typescript
export type MetricWithStatus = ResultsValue & {
  status: MetricStatus;
  moduleId: ModuleId;
  vizPresets?: VizPreset[];  // NEW
  hide?: boolean;            // NEW (mostly for completeness; hidden metrics are filtered server-side)
};
```

In `getMetricsWithStatus()`, populate vizPresets from the DB:

```typescript
metrics.push({
  ...enrichedMetric,
  status,
  moduleId,
  vizPresets: dbMetric.viz_presets ? parseJsonOrThrow(dbMetric.viz_presets) : undefined,
});
```

### 2e. Seed existing projects

Write a one-time migration/seeding function that populates `viz_presets` and `hide` for existing metric rows using the current `METRIC_STATIC_DATA`. This runs at startup if the columns exist but are empty.

Actually, simpler: the `updateModuleDefinition()` flow already deletes and recreates all metric rows. So after deploying Part 2, running "update module definitions" on each project (which admins already do after deploys) will populate the new columns. No separate migration script needed.

### Files modified
- `server/db/migrations/project/` — new migration file
- `server/db/project/modules.ts` — populate new columns on install/update, remove METRIC_STATIC_DATA usage
- `server/db/project/_project_database.sql` — add columns to CREATE TABLE (for new projects)
- `server/db/project/_project_database_types.ts` — add `viz_presets` and `hide` to `DBMetric`
- `lib/types/module_definitions.ts` — extend `MetricWithStatus`

### Verification
- `deno task typecheck` passes
- Install a module in a test project → metrics table has viz_presets populated
- `getMetricsWithStatus()` returns vizPresets on each metric
- Server no longer imports `METRIC_STATIC_DATA`

---

## Part 3: Client Migration

**Goal**: Replace all client usage of `getMetricStaticData()`, `getModuleIdForMetric()`, `getModuleIdForResultsObject()` with data from `projectDetail`.

### Key insight

Most of what `getMetricStaticData()` returns is **already on `MetricWithStatus`** via `ResultsValue`:
- `formatAs` ✅ already there
- `valueLabelReplacements` ✅ already there
- `resultsObjectId` ✅ already there
- `periodOptions` ✅ already there
- `requiredDisaggregationOptions` → available as `disaggregationOptions.filter(o => o.isRequired)`
- `valueProps` ✅ already there
- `importantNotes` ✅ already there
- `postAggregationExpression` ✅ already there
- `vizPresets` ← NEW from Part 2
- `hide` ← NEW from Part 2

So the migration is: **replace `getMetricStaticData(id)` calls with direct access to the metric object** (which the call site usually already has or can get from `projectDetail.metrics`).

### 3a. Helper function

Create a small utility to find a metric in projectDetail:

```typescript
function getMetricById(metrics: MetricWithStatus[], id: string): MetricWithStatus {
  const m = metrics.find(m => m.id === id);
  if (!m) throw new Error(`Metric not found: ${id}`);
  return m;
}
```

### 3b. Migrate `getMetricStaticData()` — 9 call sites

For each call site, the metric object is already available or easily obtained:

| File | Current | After |
|------|---------|-------|
| `add_visualization.tsx` | `getMetricStaticData(id).vizPresets` | `metric.vizPresets` (metric already in scope) |
| `preset_preview.tsx` | `getMetricStaticData(metric.id)` | Use `metric` directly (already passed as prop) |
| `DraftVisualizationPreview.tsx` | `getMetricStaticData(id).formatAs` | Find metric in projectDetail |
| `format_metrics_list_for_ai.ts` | `getMetricStaticData(metric.id)` | Use `metric` directly (already iterating MetricWithStatus[]) |
| `format_metric_data_for_ai.ts` (×2) | `getMetricStaticData(metricId)` | Find metric in projectDetail (pass metrics array as param) |
| `build_config_from_metric.ts` | `getMetricStaticData(metricId).vizPresets` | Pass metrics array, find metric |
| `slide_editor/index.tsx` | `getMetricStaticData(source.metricId)` | Find metric in projectDetail |
| `resolve_figure_from_metric.ts` | `getMetricStaticData(metricId)` | Pass metrics array, find metric |
| `convert_slide_to_page_inputs.ts` | `getMetricStaticData(id).formatAs` | Find metric in projectDetail |

### 3c. Migrate `getModuleIdForMetric()` — ~11 client invocations across 5 files

Every `MetricWithStatus` already has `moduleId`. The PO summary objects have `metricId`, so build a lookup map from `projectDetail.metrics` once:

```typescript
const moduleIdByMetric = new Map(projectDetail.metrics.map(m => [m.id, m.moduleId]));
```

Files (with multiple invocations per file):
- `PresentationObjectPanelDisplay.tsx` — 4 calls (grouping, filtering, key function, rendering)
- `visualization_editor_inner.tsx` — 2 calls
- `select_visualization_for_slide.tsx` — 2 calls
- `select_presentation_object.tsx` — 2 calls
- `report_item_editor_panel_content.tsx` — 1 call

Note: server-side call site (`presentation_objects.ts:416`) is handled in Part 2d.

### 3d. Migrate `getModuleIdForResultsObject()` — 0 client call sites remaining

All 3 call sites are server-side (handled in Part 2d). No client migration needed for this function.

### 3e. Translation handling for vizPreset text

VizPresets contain `TranslatableString` fields (label, description, caption, footnote, etc.). Currently `getMetricStaticData()` resolves these via `t3()`.

After migration, vizPresets on `MetricWithStatus` will contain raw `TranslatableString` objects (as stored in DB, which stores the resolved `ModuleDefinition`). Wait — actually, the current `ModuleDefinition` stores resolved strings (not `TranslatableString`) for metric labels, but `VizPreset` fields (label, description, config.t) use `TranslatableString` even in the resolved `ModuleDefinition`.

So: client continues to call `t3()` on vizPreset TranslatableString fields, same as `getMetricStaticData()` does today. No change in translation behavior.

### Files modified
- ~12 client files (listed above)
- Possibly add a shared helper for metric lookup

### Verification
- `deno task typecheck` passes (both server and client)
- Client no longer imports `getMetricStaticData`, `getModuleIdForMetric`, `getModuleIdForResultsObject`
- All visualization workflows still work (add viz, preset preview, AI tools, slides)

---

## Part 4: Module Registry

**Goal**: Replace `getPossibleModules()` and `ModuleId` from `module_metadata_generated.ts` with a static registry file that includes GitHub coordinates.

### 4a. `lib/types/module_registry.ts`

```typescript
export const MODULE_REGISTRY = [
  {
    id: "m001",
    label: { en: "M1. Data quality assessment", fr: "M1. Évaluation de la qualité des données" },
    prerequisites: [] as string[],
    github: { owner: "...", repo: "...", path: "modules/m001" },
  },
  {
    id: "m002",
    label: { en: "M2. Data quality adjustments", fr: "M2. Ajustements de la qualité des données" },
    prerequisites: ["m001"],
    github: { owner: "...", repo: "...", path: "modules/m002" },
  },
  // ... one entry per module
] as const;

export type ModuleId = typeof MODULE_REGISTRY[number]["id"];

export function getValidatedModuleId(id: string): ModuleId {
  const entry = MODULE_REGISTRY.find(m => m.id === id);
  if (!entry) throw new Error(`Unknown module id: ${id}`);
  return entry.id;
}
```

### 4b. Migrate `getPossibleModules()` — 4 call sites

Replace with `MODULE_REGISTRY` lookups. The call sites need `{ id, label, prerequisiteModules }[]`. Build this from the registry with `t3()` for label resolution.

Files:
- `add_project.tsx`
- `project_modules.tsx` (×3)
- `project_metrics.tsx`

### 4c. Remove `module_metadata_generated.ts`

After Parts 3 and 4, nothing imports from this file. Delete it.

### Files created
- `lib/types/module_registry.ts`

### Files deleted
- `lib/types/module_metadata_generated.ts`

### Files modified
- `lib/types/mod.ts` — update exports
- ~5 client/server files that use `getPossibleModules()` or `getValidatedModuleId()`
- Any remaining imports of `ModuleId` from the generated file → import from registry

### Verification
- `deno task typecheck` passes
- `module_metadata_generated.ts` has zero imports (can be deleted)
- Module install/uninstall UI still shows all modules with correct prerequisites

---

## Part 5: GitHub Install/Update Flow

**Goal**: Fetch module definitions from GitHub at runtime. Apply the modules table column redesign. This is the core behavioral change.

### 5a. GitHub fetch utility

New file: `server/module_loader/fetch_from_github.ts`

```typescript
export async function fetchModuleFromGitHub(
  github: { owner: string; repo: string; path: string },
  ref: string = "HEAD"  // or a tag/commit SHA
): Promise<{ definition: ModuleDefinitionJSON; script: string }>
```

Uses GitHub raw content API (`raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}/definition.json` and `.../script.R`). No auth needed for public repos. If `GITHUB_TOKEN` is set in env, include it as Bearer token for private repos.

Important: after fetching `script.R`, apply `stripFrontmatter()` to remove lines before `#---` marker. This function currently lives in `build_module_definitions.ts` — extract it into a shared utility (e.g. `server/module_loader/strip_frontmatter.ts`) so both the build script (during transition) and the fetch utility can use it. Also apply `source.replacements` if any are defined in the registry.

### 5b. Install endpoint

New route: `POST /project/:projectId/modules/install-from-github`

```typescript
body: { moduleId: string }
```

Flow:
1. Look up `moduleId` in `MODULE_REGISTRY` → get GitHub coordinates
2. Fetch `definition.json` + `script.R` from GitHub
3. **Validate** JSON with Zod schema (from Part 1)
4. **Cross-module validation**: check metric IDs don't conflict with other installed modules
5. Resolve TranslatableStrings using `_INSTANCE_LANGUAGE`
6. Build full `ModuleDefinition` (add id, script, lastScriptUpdate, defaultPresentationObjects)
7. Call existing `installModule()` (or new variant) to store in project DB
8. Stamp `installed_at`, `script_updated_at`, `definition_updated_at`, `installed_git_ref` on the module row

### 5c. Update endpoint

New route: `POST /project/:projectId/modules/update-from-github`

```typescript
body: { moduleId: string }
```

Flow:
1. Fetch latest from GitHub
2. Validate with Zod
3. Build ModuleDefinition
4. Compare incoming definition against stored definition on the three compute-affecting fields: script content, `configRequirements`, `resultsObjects`
5. Based on comparison:
   - **No compute fields changed** → Scenario A (presentation-only update via `updateModuleDefinition` path, preserve settings, don't mark dirty). Stamp `installed_at`, `definition_updated_at`, `installed_git_ref`. Only stamp `definition_updated_at` if definition actually differs.
   - **Any compute field changed** → Scenario B (full update, mark dirty). Stamp `installed_at`, `script_updated_at`, `definition_updated_at`, `installed_git_ref`.

### 5d. Modules table column redesign migration

Apply the full column redesign described in the "Modules Table Column Redesign" section above.

Migration file: `server/db/migrations/project/010_modules_column_redesign.sql`

The migration must be **idempotent**:

```sql
-- Rename existing columns (idempotent: check if old name still exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'date_installed') THEN
    ALTER TABLE modules RENAME COLUMN date_installed TO installed_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'last_run') THEN
    ALTER TABLE modules RENAME COLUMN last_run TO last_run_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'latest_ran_commit_sha') THEN
    ALTER TABLE modules RENAME COLUMN latest_ran_commit_sha TO last_run_git_ref;
  END IF;
END $$;

-- Drop unused columns
ALTER TABLE modules DROP COLUMN IF EXISTS last_updated;
ALTER TABLE modules DROP COLUMN IF EXISTS config_type;

-- Add new columns
ALTER TABLE modules ADD COLUMN IF NOT EXISTS script_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS definition_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS config_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS installed_git_ref text;

-- Add missing FK: metrics.results_object_id → results_objects.id
-- (The old results_values table had this FK; it was missed when metrics table was created)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_metrics_results_object_id') THEN
    ALTER TABLE metrics ADD CONSTRAINT fk_metrics_results_object_id
      FOREIGN KEY (results_object_id) REFERENCES results_objects(id) ON DELETE CASCADE;
  END IF;
END $$;
```

Also update:
- `server/db/project/_project_database.sql` — rewrite `CREATE TABLE modules` with new column names
- `server/db/project/_project_database_types.ts` — update `DBModule` type
- `lib/types/modules.ts` — update `InstalledModuleSummary` type
- All server code that reads/writes these columns: `installModule`, `updateModuleDefinition`, `updateModuleParameters`, `set_module_clean`, `set_module_dirty`, `getAllModulesForProject`, `getModuleDetail`
- Client code that displays these values: `project_modules.tsx`, AI formatting functions

### 5e. Worker changes

Update `set_module_clean.ts` to stamp `last_run_at` (renamed from `last_run`) and `last_run_git_ref` (renamed from `latest_ran_commit_sha`). The worker reads `installed_git_ref` from the module row (instead of deriving `commitSha` from the definition) and copies it to `last_run_git_ref` on completion.

### 5f. GitHub module structure

Per module on GitHub:
```
{repo}/modules/m001/
  ├── script.R          # R script
  └── definition.json   # ModuleDefinitionJSON (validated by runtime validator)
```

### 5g. `deriveDefaultPresentationObjects` in the new flow

Currently `deriveDefaultPresentationObjects()` lives in `server/module_loader/load_module.ts` and runs during local-file loading. It reads `vizPresets` with `createDefaultVisualizationOnInstall` set and builds `DefaultPresentationObject[]` that get stored on `ModuleDefinition`.

In the new flow, the install endpoint (5b step 6) must call this same function after resolving TranslatableStrings. The function takes `MetricDefinition[]` and `moduleId` as input — both available at that point. Either:
- Extract `deriveDefaultPresentationObjects` into a shared utility (e.g. `server/module_loader/derive_defaults.ts`)
- Or call it directly from `load_module.ts` where it already lives

The install endpoint builds the full `ModuleDefinition` including `defaultPresentationObjects`, then passes it to `installModule()` which handles DB insertion — same as today.

### 5h. Conversion tooling (one-time prerequisite)

Before Part 5 can be tested, the existing `definition.ts` files must be converted to `definition.json` for the GitHub repos. Write a one-time script:

```
scripts/convert_definitions_to_json.ts
```

For each module in `module_defs/{id}/{version}/`:
1. Import the `definition.ts` export (already typed as `ModuleDefinitionJSON`)
2. `JSON.stringify` with 2-space indent
3. Write to `definition.json` alongside `script.R`
4. Validate output against the Zod schema (from Part 1)

This script runs once to seed the GitHub repos. It's not part of the runtime system.

### 5i. Check for updates

Optional: `GET /project/:projectId/modules/check-updates`

For each installed module, fetch the GitHub definition, deep-compare compute fields against stored definition. Return list of modules with available updates and whether each is compute-only or presentation-only.

### Files created
- `server/module_loader/fetch_from_github.ts`
- `server/routes/project/github_modules.ts` (or add to existing modules routes)
- `scripts/convert_definitions_to_json.ts` (one-time tooling)
- `server/db/migrations/project/XXX_modules_column_redesign.sql`

### Files modified
- `server/db/project/modules.ts` — update install/update functions to accept GitHub-fetched definitions
- `server/db/project/_project_database.sql` — add columns
- `server/db/project/_project_database_types.ts` — add columns to DBModule
- `server/routes/project/modules.ts` — new endpoints
- `server/module_loader/load_module.ts` — may need refactoring (currently loads from local files)
- Client: module management UI (`project_modules.tsx`) — add install/update from GitHub buttons

### 5j. Route registration

All new endpoints must be registered in `lib/api-routes/` and `route-tracker.ts`. Startup validation will fail if this is missed.

### Verification
- Can install a module from GitHub into a project
- Can update a module (definition-only → no dirty; script change → dirty)
- Zod validation rejects malformed definitions with clear errors
- Cross-module metric ID conflicts are caught

---

## Part 6: Cleanup

**Goal**: Remove the old build-time module system.

### 6a. Delete old files
- `module_defs/` — entire directory
- `module_defs_dist/` — entire directory
- `build_module_definitions.ts`

### 6b. Update build/deploy
- Remove `build:modules` from `deno.json` tasks
- Update `deploy` script to not run module build
- Update `server/module_loader/load_module.ts` — remove local file loading (no longer needed; modules come from GitHub via DB)

### 6c. Existing project migration

Projects that already have modules installed will have:
- `modules` rows with renamed columns and new columns set to null (after Part 5d migration)
- `metrics` rows WITHOUT `viz_presets`, `hide`, and `important_notes` (null/false after Part 2 migration)

Strategy: After migrations add/rename columns, running "update module definitions" on each project repopulates everything. For the transition period (between deploy and update), the server handles null gracefully:
- `script_updated_at` null → treat any update as script change (conservative; marks dirty)
- `installed_git_ref` null → no version tracking until next install/update
- `viz_presets` null → vizPresets unavailable on that metric (client handles undefined)

For production, the deploy sequence is:
1. Deploy new code
2. For each active project, trigger module definition update (can be scripted)
3. Modules get repopulated with new columns

### Files deleted
- `module_defs/` (entire directory)
- `module_defs_dist/` (entire directory)
- `build_module_definitions.ts`

### Files modified
- `deno.json` — remove `build:modules` task
- `deploy` script — remove module build step
- `server/module_loader/load_module.ts` — simplify (only GitHub-based loading)

---

## Part 7: Module Status Indicators

**Goal**: Give users clear visibility into two distinct states: (a) a newer version is available on GitHub, and (b) the installed definition has changed but the module hasn't re-run yet. Surface these at both the individual module level and as project-wide summaries.

### Current state

The UI currently shows run status per module via the `DirtyStatus` badge: queued, running, ready, error. There's also a project-wide `ProjectRunStatus` indicator that pulses when any module is running. There is no concept of "update available."

### Two new states to surface

**"Update available"** — the GitHub definition is newer than what's installed. Detected by comparing `installed_git_ref` against what's on GitHub HEAD. This is a *remote check* — requires fetching from GitHub.

**"Needs re-run"** — the script was updated but the module hasn't re-run yet. This is a *local check* — compare `installed_git_ref ≠ last_run_git_ref` on the module row (or check `dirty = 'queued'`). This is a subset of the existing "queued" state, but it's useful to distinguish "queued because data changed" from "queued because the script was updated."

### 7a. Check-for-updates endpoint

`GET /project/:projectId/modules/check-updates`

For each installed module:
1. Fetch HEAD commit SHA from GitHub (lightweight — use `GET /repos/{owner}/{repo}/commits?path={path}&per_page=1` or a HEAD request to raw content)
2. Compare with stored `installed_git_ref`
3. If different, fetch the full definition and compare script content to determine whether the update includes a script change or is definition-only

Returns:
```typescript
type ModuleUpdateCheck = {
  moduleId: string;
  updateAvailable: boolean;
  updateType?: "script" | "definition";  // only if updateAvailable
};
```

This endpoint should be called on-demand (user clicks "check for updates") or periodically in the background — NOT on every page load (GitHub rate limits).

### 7b. Store update-check results

Cache the check results in memory (server-side, per project) or in a lightweight table/column. The results are ephemeral — they just indicate "as of last check, these modules have updates." No need to persist across restarts.

Alternatively, store `latest_remote_git_ref` on the module row after each check, and let the client compare with `installed_git_ref`.

### 7c. Per-module indicators

In `project_modules.tsx`, each installed module card gets new visual indicators:

**Update available badge**: Shown when the GitHub version is newer than installed. Two variants:
- Yellow/amber badge: "Update available (definition only)" — safe to update, won't require re-run
- Orange badge: "Update available (script change)" — will require re-run after update

**Needs re-run indicator**: Shown when `installed_git_ref ≠ last_run_git_ref` (script was updated but hasn't re-run yet). This overlaps with the existing "queued" dirty state but gives more specific context — e.g. "Script updated — re-run needed" instead of just "Queued."

**Visual layout on module card**:
```
┌─────────────────────────────────────────────┐
│ M1. Data quality assessment    [Ready] [⬆ Update available]  │
│                                                               │
│ Last run: 2026-03-04 (abc123)                                │
│ Installed: 2026-03-01 (def456)                               │
│ [Update] [Re-run] [Script] [Logs] [Files]                    │
└───────────────────────────────────────────────────────────────┘
```

### 7d. Project-wide summary

On the project modules page header (and optionally in the project sidebar/nav), show aggregated indicators:

- **"X modules have updates available"** — amber badge, shown when any installed module has a newer GitHub version
- **"X modules need re-running"** — shown when any module has been updated but not yet re-run

These give a quick at-a-glance status without needing to scroll through individual modules.

### 7e. "Check for updates" button

Add a button on the modules page: **"Check for updates"**

- Calls the check-updates endpoint
- Shows a loading spinner while fetching from GitHub
- Updates the per-module and project-wide indicators
- Optionally: auto-check on page load (but throttled — at most once per N minutes per project)

### 7f. "Update all" flow

Extend the existing "Update all modules" dialog to:
1. First check for updates (fetch from GitHub)
2. Show which modules have updates and what type (script change vs definition-only)
3. Let the user confirm
4. Apply updates in dependency order
5. Show per-module progress (reuse existing `update_all_modules.tsx` pattern)

### Files modified
- `client/src/components/project/project_modules.tsx` — per-module badges, check-for-updates button, project summary
- `client/src/components/DirtyStatus.tsx` — possibly extend or add new badge component
- `server/routes/project/modules.ts` — check-updates endpoint
- `lib/types/module_definitions.ts` — add `ModuleUpdateCheck` type (or similar)
- `client/src/server_actions/` — add check-updates action

### Verification
- "Check for updates" correctly identifies modules with newer GitHub versions
- Per-module badges show correct state (update available, needs re-run, ready)
- Project-wide summary accurately reflects module states
- UI updates after installing an update (badge disappears)

---

## Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **GitHub auth** | Public repos, unauthenticated. Add `GITHUB_TOKEN` env var support for private repos (optional). | Keep it simple. |
| **Version pinning** | Fetch at HEAD by default. Store the fetched commit SHA on the module row (`installed_git_ref`). Support pinning to a tag/commit in future. | HEAD is simplest for the "always latest" workflow. Stored SHA enables "what version am I running?" queries. |
| **Validation** | Zod schema, mandatory, runs before any DB writes. | Clear error messages, TypeScript-native, catches issues at the boundary. |
| **VizPresets delivery** | Inline on `MetricWithStatus` via `viz_presets` column on metrics table. | Simplest approach. Payload increase is acceptable — vizPresets are only present on metrics that have them (~15 of ~40 metrics), and the data compresses well. |
| **Existing project migration** | Column migrations + trigger "update definitions" per project. No separate seeding script. | Leverages existing update flow. Conservative null handling during transition. |
| **`hide` field** | Add `hide boolean` column to metrics table. Filter in `getMetricsWithStatus()` query. | Minimal change, replaces the current `METRIC_STATIC_DATA` filter. |
| **Cross-module validation** | At install time, check metric IDs against all other installed modules in the project. | Catches conflicts at the right moment. No global registry needed. |
| **What drives dirty?** | Three compute-affecting fields drive dirty: script content, `configRequirements`, and `resultsObjects`. Changes to any of these mark dirty. Changes to other definition fields (labels, vizPresets, formatting) do not. User config/parameter changes also mark dirty. The `dirty` column is the sole mechanism — timestamps are informational only. | Script content is the code. `configRequirements` determines what the script receives. `resultsObjects` determines the output schema. Everything else in `definition.json` is metadata about how to interpret and display results. |
| **`installed_git_ref` vs `last_run_git_ref`** | Both stored. Same commit SHA, stamped at different moments. | `installed_git_ref` = what's installed now. `last_run_git_ref` = what produced the current results. When they differ, you know the module was updated but hasn't re-run. |

---

## Future Enhancements (Not in This Plan)

- **Central validation service**: Module authors register their GitHub repo URL. Service fetches, validates with Zod, reports errors. Acts as CI for module definitions.
- **Web-based module editor**: Admin UI for creating/editing module definitions. Feeds into the same install flow.
- **R package for authoring**: R function that generates `definition.json` from annotated R scripts. Authoring convenience for R developers.
- **User-created custom modules**: Per-project or per-instance modules defined via UI. Same `ModuleDefinitionJSON` format, different authoring workflow.
- **Module marketplace**: Central registry for discovering and sharing modules across instances.

---

## Implementation Order

```
Part 1: Types + Zod         (pure refactor, zero behavior change)
  ↓
Part 2: DB + Server         (adds viz_presets/hide to DB, removes METRIC_STATIC_DATA from server)
  ↓
Part 3: Client Migration    (replaces getMetricStaticData/getModuleIdForMetric with projectDetail)
  ↓
Part 4: Module Registry     (replaces getPossibleModules/ModuleId, deletes generated file)
  ↓
Part 5: GitHub Flow         (the actual new feature: install/update from GitHub)
  ↓
Part 6: Cleanup             (delete old module_defs, update deploy)
  ↓
Part 7: Status Indicators   (update-available badges, needs-re-run indicators, project summary)
```

Parts 1-4 are pure refactoring — they improve the codebase without changing behavior. Part 5 is the feature. Part 6 is cleanup. Part 7 is UX polish. Each part can be deployed independently and verified before moving to the next.
