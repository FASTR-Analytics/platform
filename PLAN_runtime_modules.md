# Plan: Runtime Module Installation from GitHub

## Summary

Decouple module definitions from app deployment. R developers edit scripts and definitions in GitHub repos; users install/update modules at runtime without redeployment. Only a lightweight module registry remains at build time.

## Architecture

### Current flow
```
module_defs/ → build_module_definitions.ts → module_defs_dist/ + module_metadata_generated.ts → deploy → server loads at startup
```

### New flow
```
GitHub repos (script.R + definition.json per module)
  ↓ (fetched at runtime on "install module")
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

## Module Registry (build-time)

New file: `lib/types/module_registry.ts`

```typescript
export const MODULE_REGISTRY = [
  {
    id: "m001",
    label: { en: "M1. Data quality assessment", fr: "M1. Évaluation de la qualité des données" },
    prerequisites: [],
    github: { owner: "...", repo: "...", path: "m001" },
  },
  // ... one entry per module
] as const;

export type ModuleId = typeof MODULE_REGISTRY[number]["id"];
```

- Replaces `getPossibleModules()` and `ModuleId` from `module_metadata_generated.ts`
- Adding a new module = add one entry + deploy
- Updating a module's definition or script = zero deploys

## Standalone ModuleDefinitionJSON Type

New file: `lib/types/module_definition_schema.ts`

A single file with zero imports containing all types needed to author a `definition.json`:
- `ModuleDefinitionJSON` (top-level)
- `TranslatableString`, `MetricDefinitionJSON`, `ResultsObjectDefinitionJSON`
- `VizPreset`, `VizPresetTextConfig`, `MetricAIDescription`
- `DataSource`, `ScriptSource`, `ModuleConfigRequirements`
- `PresentationObjectConfig` sub-types (for vizPreset configs)
- All leaf unions: `ValueFunc`, `PeriodOption`, `DisaggregationOption`, `PresentationOption`, `DisaggregationDisplayOption`, `AspectRatio`, `OptionalFacilityColumn`, `DatasetType`, `PeriodFilter`, `CustomSeriesStyle`, `PostAggregationExpression`

The existing `lib/types/module_definitions.ts` and `lib/types/presentation_objects.ts` would import from this file instead of defining locally (breaks the circular dependency as a side effect).

This file also serves as documentation for R developers authoring `definition.json` files.

## GitHub Module Structure

Per module on GitHub:
```
{repo}/modules/m001/
  ├── script.R          # R script
  └── definition.json   # ModuleDefinitionJSON
```

## Install/Update Flow

When a user clicks "install module" or "update module":

1. **Fetch** `definition.json` from GitHub at HEAD (or pinned commit)
2. **Fetch** `script.R` from GitHub
3. **Validate** JSON against `ModuleDefinitionJSON` schema
4. **Compare versions** (compute vs presentation split — see below)
5. **Store** definition + script in project DB `modules` table
6. **Extract** metrics → `metrics` table, results objects → `results_objects` table
7. **Create default POs** if `createDefaultVisualizationOnInstall` is set on any vizPreset
8. **Mark dirty** if compute-relevant parts changed; skip if only presentation changed

## Compute vs Presentation Split

Module definitions have two independent concerns:

**Compute contract** (changes here → mark dirty → needs re-run):
- R script content
- Data sources
- Results object schemas
- Config requirements / parameters

**Presentation layer** (changes here → update in place → no re-run):
- VizPresets (configs, labels, descriptions)
- Metric labels, formatAs, valueLabelReplacements
- AI descriptions, important notes

On install/update, hash the compute-relevant fields. Store as `compute_version` on the `modules` row. Compare against `last_ran_compute_version` to determine if dirty.

## Client Migration: Remove Static Metric Data

Remove all client usage of `module_metadata_generated.ts` exports. Everything moves to `projectDetail.metrics`.

### getModuleIdForMetric() — 8 call sites
Each `MetricWithStatus` already has `moduleId`. Replace static lookup with property access.

Files:
- `PresentationObjectPanelDisplay.tsx`
- `report_item_editor_panel_content.tsx`
- `select_presentation_object.tsx`
- `visualization_editor_inner.tsx`
- `select_visualization_for_slide.tsx`
- `state/caches/visualizations.ts`

### getModuleIdForResultsObject() — 2 call sites
Add `moduleId` to the results object info in projectDetail (server already knows this).

Files:
- `state/caches/visualizations.ts`

### getMetricStaticData() — 9 call sites
All the data this returns (vizPresets, formatAs, valueLabelReplacements, etc.) needs to be on `MetricWithStatus` in projectDetail. Server already has this data from the stored module definition.

Files:
- `add_visualization.tsx` — vizPresets
- `preset_preview.tsx` — static data for rendering
- `DraftVisualizationPreview.tsx` — formatAs
- `format_metrics_list_for_ai.ts` — AI context
- `format_metric_data_for_ai.ts` — AI context (2 uses)
- `slide_editor/index.tsx` — metric data for slides
- `build_config_from_metric.ts` — viz config from static data
- `resolve_figure_from_metric.ts` — figure config
- `convert_slide_to_page_inputs.ts` — formatAs

### getPossibleModules() — 4 call sites
Replace with `MODULE_REGISTRY` from the new static registry file.

Files:
- `add_project.tsx`
- `project_modules.tsx` (3 uses)
- `project_metrics.tsx`

### getValidatedModuleId() — server only
Replace with simple validation against `MODULE_REGISTRY`.

## Files to Delete

- `module_defs/` — entire directory (definitions move to GitHub)
- `module_defs_dist/` — entire directory (no more build output)
- `build_module_definitions.ts` — build script no longer needed
- `lib/types/module_metadata_generated.ts` — replaced by `module_registry.ts` + runtime data

## Files to Modify

- `lib/types/module_definitions.ts` — import from new schema file
- `lib/types/presentation_objects.ts` — import from new schema file (breaks circular dep)
- `lib/types/mod.ts` — update exports
- `server/db/project/modules.ts` — enrich `MetricWithStatus` with vizPresets, formatAs, etc. Add `compute_version` / `last_ran_compute_version`
- `server/routes/project/modules.ts` — add install-from-GitHub endpoint
- `server/module_loader/load_module.ts` — fetch from GitHub instead of local files
- `server/task_management/set_module_dirty.ts` — respect compute vs presentation split
- `server/db/project/_project_database.sql` — add `compute_version`, `last_ran_compute_version` columns
- ~20 client files listed above — migrate from static data to projectDetail
- `deno.json` — remove `build:modules` task

## Migration Strategy

### Phase 1: Standalone type file
- Create `lib/types/module_definition_schema.ts` with all types inlined
- Refactor existing imports to use it
- No behavior change

### Phase 2: Module registry
- Create `lib/types/module_registry.ts`
- Migrate `getPossibleModules()` call sites (4 files)
- Remove `ModuleId` from generated file

### Phase 3: Enrich projectDetail
- Add vizPresets, formatAs, valueLabelReplacements, etc. to `MetricWithStatus`
- Add `moduleId` to results object info
- Migrate `getMetricStaticData()` call sites (9 files)
- Migrate `getModuleIdForMetric()` call sites (8 files)
- Migrate `getModuleIdForResultsObject()` call sites (2 files)

### Phase 4: GitHub install flow
- Add install-from-GitHub endpoint
- Add compute/presentation version tracking
- Update dirty logic for compute vs presentation split
- Update module install UI

### Phase 5: Cleanup
- Delete `module_defs/`, `module_defs_dist/`, `build_module_definitions.ts`
- Delete `module_metadata_generated.ts`
- Remove `build:modules` from deno tasks
- Update deploy script

## Open Questions

1. **GitHub auth** — do the module repos need to be private? If so, need a GitHub token in env config
2. **Version pinning** — install at HEAD or at a specific commit/tag? Tags are safer for reproducibility
3. **Offline/caching** — should the server cache fetched definitions, or always fetch fresh from GitHub on install?
4. **ModuleDefinitionJSON validation** — runtime validation (e.g. Zod schema) to catch malformed definitions before install?
5. **Migration of existing projects** — projects with already-installed modules need their DB rows enriched with the new fields
