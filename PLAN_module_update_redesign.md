# PLAN: Module Update System Redesign

## Background: What This System Does

When a module's source code (R script + definition.json) is updated on GitHub, users can "update" their installed module to get the latest version. This involves:

1. **Reinstalling the definition** — Fetching the latest definition.json and script.R, updating the database with new metadata (metrics, vizPresets, presentation objects)

2. **Rerunning the module** — Executing the R script to recompute results (drops existing data tables, runs script, creates new data)

These are **independent operations**. You might want to:
- Reinstall only (e.g., vizPreset label changed, no need to recompute)
- Rerun only (e.g., underlying data changed, same script)
- Both (e.g., script changed, need new results)
- Neither (just viewing what's available)

---

## Current Problems

### Problem 1: Server decides, client overrides

**Current flow:**
```
Client: "Update this module, preserveSettings=true, preventRerun=false"
Server: *independently computes whether rerun is needed*
Server: *does rerun OR not based on its own logic*
Client: shows one thing, server does another
```

The preview endpoint and update function use **different comparison logic**:

**Preview** (`server/routes/project/modules.ts:350-379`):
- Uses `fetchModuleFiles()` which returns raw GitHub definition
- Strips `moduleId` from stored resultsObjects before comparing
- Compares: `incomingDef.resultsObjects` vs `storedResultsObjsWithoutModuleId`

**Update** (`server/db/project/modules.ts:322-328`):
- Uses `getModuleDefinitionDetail()` which returns **translated** definition with `moduleId` added
- Does NOT strip `moduleId` from either side
- Compares: `modDef.data.resultsObjects` vs `storedDef.resultsObjects`

This mismatch means preview might say "definition_only" but update detects "computeChange" and triggers a rerun anyway.

### Problem 2: "preventRerun" is confusing

The current `preventRerun` flag:
- Only affects whether `setModuleDirty()` is called in the route handler
- Does NOT prevent Scenario B (full reinstall with `dirty='queued'`) in the DB function
- So if `computeChange=true` and `preventRerun=true`, the module still gets deleted/recreated with `dirty='queued'`, but `setModuleDirty()` isn't called, leaving it stuck

### Problem 3: Checkbox appears inconsistently

Current modal states and what's shown:

| impactType | Preserve Settings | Prevent Rerun |
|------------|-------------------|---------------|
| no_change | NO | YES |
| definition_only | YES | NO |
| config_change | YES | YES |
| script_change | YES | YES |

The "prevent rerun" checkbox doesn't appear for `definition_only`, even though:
1. The server might still trigger a rerun due to comparison mismatch
2. User might want to force a rerun even for "definition only" changes

### Problem 4: "Needs update" indicator doesn't clear

After updating, the indicator should clear. The flow is:
1. Update completes, sets `installed_git_ref` in DB
2. Server calls `notifyProjectUpdated()` 
3. Client receives SSE `project_updated` event
4. Client calls `fetchProjectDetail()`
5. New `projectModules` includes updated `installedGitRef`
6. Comparison `installedGitRef === latestCommit.sha` should now be true

**Potential issues:**
- `moduleLatestCommits` is a separate signal, not refetched on project update
- The comparison in `project_modules.tsx:80-86` uses `moduleLatestCommits()` which may be stale

### Problem 5: "Last run not same as installed" confusion

When you update without rerun:
- `installed_git_ref` updates to new commit
- `last_run_git_ref` stays at old commit
- UI shows this as a warning, but it's intentional behavior

---

## Proposed Solution

### Core Principle

**Client decides, server executes.**

The client explicitly sends:
```typescript
{
  reinstall: boolean;  // Update definition/metrics/POs
  rerun: boolean;      // Mark dirty and trigger R script execution
  preserveSettings: boolean;  // Keep user's parameter selections
}
```

Server does exactly what it's told. No independent decision-making.

---

## Detailed Code Changes

### Change 1: Update API Types

**File: `lib/types/modules.ts`**

Replace lines 151-155:
```typescript
// OLD
export type ModuleUpdatePreview = {
  impactType: "script_change" | "config_change" | "definition_only" | "no_change";
  commitsSince: { sha: string; message: string; date: string; author: string }[];
  headGitRef: string;
};
```

With:
```typescript
// NEW
export type ModuleUpdatePreview = {
  // Git ref comparison
  hasUpdate: boolean;
  currentGitRef: string | null;
  incomingGitRef: string;
  
  // What specifically changed (factual, not predictive)
  changes: {
    script: boolean;
    configRequirements: boolean;
    resultsObjects: boolean;
    metrics: boolean;
    label: boolean;
    dataSources: boolean;
    assetsToImport: boolean;
  };
  
  // Recommendation based on changes (client can override)
  recommendsRerun: boolean;
  
  // Commit history
  commitsSince: { sha: string; message: string; date: string; author: string }[];
};
```

**File: `lib/api-routes/project/modules.ts`**

Replace lines 31-34:
```typescript
// OLD
body: {} as {
  preserveSettings: boolean;
  preventRerun?: boolean;
},
```

With:
```typescript
// NEW
body: {} as {
  reinstall: boolean;
  rerun: boolean;
  preserveSettings: boolean;
},
```

---

### Change 2a: Add DefinitionChanges Type to lib/

**File: `lib/types/modules.ts`**

Add after `ModuleUpdatePreview` type:

```typescript
export type DefinitionChanges = {
  script: boolean;
  configRequirements: boolean;
  resultsObjects: boolean;
  metrics: boolean;
  vizPresets: boolean;
  label: boolean;
  dataSources: boolean;
  assetsToImport: boolean;
};
```

Update `ModuleUpdatePreview` to use it:

```typescript
export type ModuleUpdatePreview = {
  hasUpdate: boolean;
  currentGitRef: string | null;
  incomingGitRef: string;
  changes: DefinitionChanges;
  recommendsRerun: boolean;
  commitsSince: { sha: string; message: string; date: string; author: string }[];
};
```

---

### Change 2b: Extract Comparison Logic

**New file: `server/module_loader/compare_definitions.ts`**

```typescript
import type { ModuleDefinitionGithub, DefinitionChanges } from "lib";
import type { ModuleDefinitionInstalled } from "lib";

/**
 * Compare an incoming GitHub definition against an installed definition.
 * Returns which fields have changed.
 * 
 * This is the SINGLE SOURCE OF TRUTH for comparison logic.
 * Used by the preview endpoint to report facts to the client.
 */
export function compareDefinitions(
  incomingDef: ModuleDefinitionGithub,
  incomingScript: string,
  storedDef: ModuleDefinitionInstalled,
): DefinitionChanges {
  const scriptChanged = incomingScript !== storedDef.script;

  const configReqChanged = JSON.stringify(incomingDef.configRequirements) !==
    JSON.stringify(storedDef.configRequirements);

  // Strip moduleId from stored resultsObjects for fair comparison
  // (incoming doesn't have moduleId, stored does)
  const storedResultsObjsComparable = storedDef.resultsObjects.map(
    ({ moduleId: _, ...rest }) => rest
  );
  const resultsObjChanged = JSON.stringify(incomingDef.resultsObjects) !==
    JSON.stringify(storedResultsObjsComparable);

  // Metrics: compare structure (excluding translated fields and vizPresets)
  // We compare: id, valueFunc, formatAs, valueProps, resultsObjectId, hide
  // We skip: label, variantLabel, importantNotes (translated), vizPresets (separate)
  const incomingMetricsComparable = incomingDef.metrics.map(m => ({
    id: m.id,
    valueFunc: m.valueFunc,
    formatAs: m.formatAs,
    valueProps: m.valueProps,
    resultsObjectId: m.resultsObjectId,
    hide: m.hide,
    requiredDisaggregationOptions: m.requiredDisaggregationOptions,
  }));
  const storedMetricsComparable = (storedDef.metrics ?? []).map(m => ({
    id: m.id,
    valueFunc: m.valueFunc,
    formatAs: m.formatAs,
    valueProps: m.valueProps,
    resultsObjectId: m.resultsObjectId,
    hide: m.hide,
    requiredDisaggregationOptions: m.requiredDisaggregationOptions,
  }));
  const metricsChanged = JSON.stringify(incomingMetricsComparable) !==
    JSON.stringify(storedMetricsComparable);

  // VizPresets: compare full content per metric
  const incomingVizPresets = incomingDef.metrics.map(m => ({
    metricId: m.id,
    presets: m.vizPresets ?? [],
  }));
  const storedVizPresets = (storedDef.metrics ?? []).map(m => ({
    metricId: m.id,
    presets: m.vizPresets ?? [],
  }));
  const vizPresetsChanged = JSON.stringify(incomingVizPresets) !==
    JSON.stringify(storedVizPresets);

  // Label: incoming is { en, fr }, stored is plain string
  // Check if stored matches either translation
  const labelChanged = 
    storedDef.label !== incomingDef.label.en &&
    storedDef.label !== incomingDef.label.fr;

  const dataSourcesChanged = JSON.stringify(incomingDef.dataSources) !==
    JSON.stringify(storedDef.dataSources);

  const assetsChanged = JSON.stringify(incomingDef.assetsToImport) !==
    JSON.stringify(storedDef.assetsToImport);

  return {
    script: scriptChanged,
    configRequirements: configReqChanged,
    resultsObjects: resultsObjChanged,
    metrics: metricsChanged,
    vizPresets: vizPresetsChanged,
    label: labelChanged,
    dataSources: dataSourcesChanged,
    assetsToImport: assetsChanged,
  };
}

/**
 * Returns true if any compute-affecting field changed.
 * Compute-affecting = would produce different R script output.
 */
export function recommendsRerun(changes: DefinitionChanges): boolean {
  return changes.script || changes.configRequirements || changes.resultsObjects;
}
```

**Update: `server/module_loader/mod.ts`**

Add export:
```typescript
export { compareDefinitions, recommendsRerun } from "./compare_definitions.ts";
```

---

### Change 3: Rewrite Preview Endpoint

**File: `server/routes/project/modules.ts`**

Add import:
```typescript
import { compareDefinitions, recommendsRerun } from "../../module_loader/mod.ts";
```

Replace the entire `previewModuleUpdate` route (lines 335-404) with:

```typescript
defineRoute(
  routesModules,
  "previewModuleUpdate",
  requireProjectPermission("can_configure_modules"),
  async (c, { params }) => {
    const registryEntry = MODULE_REGISTRY.find((m) => m.id === params.module_id);
    if (!registryEntry) {
      return c.json({ success: false, err: `Unknown module: ${params.module_id}` });
    }

    // Get stored module
    const stored = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (stored.success === false) {
      return c.json(stored);
    }
    const storedDef = stored.data.moduleDefinition;

    // Get installed git ref
    const installedGitRef = (await c.var.ppk.projectDb<{ installed_git_ref: string | null }[]>`
      SELECT installed_git_ref FROM modules WHERE id = ${params.module_id}
    `).at(0)?.installed_git_ref ?? null;

    // Fetch incoming definition from source (GitHub or local)
    let incomingDef, incomingScript, incomingGitRef;
    try {
      const fetched = await fetchModuleFiles(params.module_id);
      incomingDef = fetched.definition;
      incomingScript = fetched.script;
      incomingGitRef = fetched.gitRef;
    } catch (e) {
      return c.json({ 
        success: false, 
        err: `Failed to fetch module from source: ${e instanceof Error ? e.message : String(e)}` 
      });
    }

    // Determine if there's an update available (git refs differ)
    // Only consider it "has update" if we successfully got the incoming git ref
    const hasUpdate = incomingGitRef !== undefined && 
      (!installedGitRef || incomingGitRef !== installedGitRef);

    // Compare definitions using shared comparison logic
    const changes = compareDefinitions(incomingDef, incomingScript, storedDef);

    // Get commits since installed version
    let commitsSince: ModuleUpdatePreview["commitsSince"] = [];
    if (hasUpdate) {
      const { owner, repo, path } = registryEntry.github;
      const commitsRes = await fetchCommits(owner, repo, path, "main");
      if (commitsRes.success) {
        if (installedGitRef) {
          const idx = commitsRes.data.findIndex((cm) => cm.sha === installedGitRef);
          if (idx === -1) {
            // Installed commit not found in recent history — return all commits
            commitsSince = commitsRes.data;
          } else {
            // Return commits between HEAD and installed (exclusive)
            commitsSince = commitsRes.data.slice(0, idx);
          }
        } else {
          // No installed ref — return all commits
          commitsSince = commitsRes.data;
        }
      }
    }

    const preview: ModuleUpdatePreview = {
      hasUpdate,
      currentGitRef: installedGitRef,
      incomingGitRef: incomingGitRef ?? "",
      changes,
      recommendsRerun: recommendsRerun(changes),
      commitsSince,
    };

    return c.json({ success: true, data: preview });
  },
);
```

---

### Change 3: Rewrite Update DB Function

**File: `server/db/project/modules.ts`**

Replace the entire `updateModuleDefinition` function (lines 284-474) with:

```typescript
export async function updateModuleDefinition(
  projectDb: Sql,
  moduleDefinitionId: ModuleId,
  reinstall: boolean,
  rerun: boolean,
  preserveSettings: boolean,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    presObjIdsWithNewLastUpdateds: string[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<DBModule[]>`
        SELECT * FROM modules WHERE id = ${moduleDefinitionId}
      `
    ).at(0);

    if (!rawModule) {
      throw new Error("Module not found");
    }

    const lastUpdated = new Date().toISOString();

    // If neither reinstall nor rerun requested, nothing to do
    if (!reinstall && !rerun) {
      return {
        success: true,
        data: { lastUpdated, presObjIdsWithNewLastUpdateds: [] },
      };
    }

    // If only rerun (no reinstall), just mark dirty and return
    if (!reinstall && rerun) {
      await projectDb`UPDATE modules SET dirty = 'queued' WHERE id = ${moduleDefinitionId}`;
      return {
        success: true,
        data: { lastUpdated, presObjIdsWithNewLastUpdateds: [] },
      };
    }

    // From here: reinstall is true (rerun may or may not be true)
    
    const modDef = await getModuleDefinitionDetail(
      moduleDefinitionId,
      _INSTANCE_LANGUAGE,
    );
    throwIfErrWithData(modDef);

    const gitRef = modDef.data.gitRef;

    // Compute new config selections
    const oldConfigSelections = parseModuleConfigSelections(rawModule.config_selections);
    const newConfigSelections = preserveSettings
      ? getMergedModuleConfigSelections(oldConfigSelections, modDef.data.configRequirements)
      : getStartingModuleConfigSelections(modDef.data.configRequirements);

    const configSelectionsChanged = JSON.stringify(newConfigSelections.parameterSelections) !== 
      JSON.stringify(oldConfigSelections.parameterSelections);

    const metricIds = modDef.data.metrics.map((m) => m.id);
    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    if (rerun) {
      // REINSTALL + RERUN: Full reinstall, drop tables, set dirty='queued'
      
      await projectDb.begin(async (sql: Sql) => {
        // Delete module (cascades to metrics, results_objects metadata)
        await sql`DELETE FROM modules WHERE id = ${modDef.data.id}`;
        
        // Insert fresh module with dirty='queued'
        await sql`
          INSERT INTO modules
            (id, module_definition, config_selections, dirty, installed_at, 
             script_updated_at, definition_updated_at, config_updated_at, 
             last_run_at, installed_git_ref)
          VALUES (
            ${modDef.data.id},
            ${prepareModuleDefinitionForStorage(modDef.data)},
            ${JSON.stringify(newConfigSelections)},
            'queued',
            ${lastUpdated},
            ${lastUpdated},
            ${lastUpdated},
            ${lastUpdated},
            ${rawModule.last_run_at},
            ${gitRef ?? rawModule.installed_git_ref}
          )`;

        // Drop and recreate results object tables
        for (const resultsObject of modDef.data.resultsObjects) {
          const roTableName = getResultsObjectTableName(resultsObject.id);
          await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
          await sql`
            INSERT INTO results_objects (id, module_id, description, column_definitions)
            VALUES (${resultsObject.id}, ${modDef.data.id}, ${resultsObject.description},
              ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null})`;
        }

        // Insert metrics
        for (const metric of modDef.data.metrics) {
          const validatedMetric = metricStrict.parse(metric);
          await sql`
            INSERT INTO metrics (
              id, module_id, label, variant_label, value_func, format_as, value_props,
              required_disaggregation_options, value_label_replacements, post_aggregation_expression,
              results_object_id, ai_description, viz_presets, hide, important_notes
            ) VALUES (
              ${validatedMetric.id}, ${modDef.data.id}, ${validatedMetric.label}, ${validatedMetric.variantLabel},
              ${validatedMetric.valueFunc}, ${validatedMetric.formatAs}, ${JSON.stringify(validatedMetric.valueProps)},
              ${JSON.stringify(validatedMetric.requiredDisaggregationOptions)},
              ${validatedMetric.valueLabelReplacements ? JSON.stringify(validatedMetric.valueLabelReplacements) : null},
              ${validatedMetric.postAggregationExpression ? JSON.stringify(validatedMetric.postAggregationExpression) : null},
              ${validatedMetric.resultsObjectId}, ${validatedMetric.aiDescription ? JSON.stringify(validatedMetric.aiDescription) : null},
              ${JSON.stringify(validatedMetric.vizPresets)},
              ${validatedMetric.hide}, ${validatedMetric.importantNotes})`;
        }

        // Recreate default presentation objects
        if (metricIds.length > 0) {
          await sql`DELETE FROM presentation_objects WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE`;
        }
        for (const po of defaultPresentationObjects) {
          const validatedConfig = presentationObjectConfigSchema.parse(po.config);
          await sql`DELETE FROM presentation_objects WHERE id = ${po.id}`;
          await sql`
            INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
            VALUES (${po.id}, ${po.metricId}, ${true}, ${po.label}, ${JSON.stringify(validatedConfig)}, ${lastUpdated}, ${po.sortOrder})`;
        }
      });

    } else {
      // REINSTALL ONLY (no rerun): Update in place, preserve data tables, preserve dirty state
      
      await projectDb.begin(async (sql: Sql) => {
        // Update module row (keep dirty state as-is)
        await sql`
          UPDATE modules
          SET
            module_definition = ${prepareModuleDefinitionForStorage(modDef.data)},
            config_selections = ${JSON.stringify(newConfigSelections)},
            definition_updated_at = ${lastUpdated},
            installed_git_ref = ${gitRef ?? rawModule.installed_git_ref},
            config_updated_at = ${configSelectionsChanged ? lastUpdated : rawModule.config_updated_at}
          WHERE id = ${moduleDefinitionId}
        `;

        // Delete and recreate metadata rows (NOT data tables)
        await sql`DELETE FROM results_objects WHERE module_id = ${modDef.data.id}`;
        await sql`DELETE FROM metrics WHERE module_id = ${modDef.data.id}`;

        for (const resultsObject of modDef.data.resultsObjects) {
          await sql`
            INSERT INTO results_objects (id, module_id, description, column_definitions)
            VALUES (${resultsObject.id}, ${modDef.data.id}, ${resultsObject.description},
              ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null})`;
        }

        for (const metric of modDef.data.metrics) {
          const validatedMetric = metricStrict.parse(metric);
          await sql`
            INSERT INTO metrics (
              id, module_id, label, variant_label, value_func, format_as, value_props,
              required_disaggregation_options, value_label_replacements, post_aggregation_expression,
              results_object_id, ai_description, viz_presets, hide, important_notes
            ) VALUES (
              ${validatedMetric.id}, ${modDef.data.id}, ${validatedMetric.label}, ${validatedMetric.variantLabel},
              ${validatedMetric.valueFunc}, ${validatedMetric.formatAs}, ${JSON.stringify(validatedMetric.valueProps)},
              ${JSON.stringify(validatedMetric.requiredDisaggregationOptions)},
              ${validatedMetric.valueLabelReplacements ? JSON.stringify(validatedMetric.valueLabelReplacements) : null},
              ${validatedMetric.postAggregationExpression ? JSON.stringify(validatedMetric.postAggregationExpression) : null},
              ${validatedMetric.resultsObjectId}, ${validatedMetric.aiDescription ? JSON.stringify(validatedMetric.aiDescription) : null},
              ${JSON.stringify(validatedMetric.vizPresets)},
              ${validatedMetric.hide}, ${validatedMetric.importantNotes})`;
        }

        // Recreate default presentation objects
        if (metricIds.length > 0) {
          await sql`DELETE FROM presentation_objects WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE`;
        }
        for (const po of defaultPresentationObjects) {
          const validatedConfig = presentationObjectConfigSchema.parse(po.config);
          await sql`DELETE FROM presentation_objects WHERE id = ${po.id}`;
          await sql`
            INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
            VALUES (${po.id}, ${po.metricId}, ${true}, ${po.label}, ${JSON.stringify(validatedConfig)}, ${lastUpdated}, ${po.sortOrder})`;
        }
      });
    }

    // Update presentation_objects timestamps and get IDs for SSE
    let presObjIdsWithNewLastUpdateds: string[] = [];
    if (metricIds.length > 0) {
      await projectDb`UPDATE presentation_objects SET last_updated = ${lastUpdated} WHERE metric_id = ANY(${metricIds})`;
      const allPresObjs = await projectDb<{ id: string }[]>`SELECT id FROM presentation_objects WHERE metric_id = ANY(${metricIds})`;
      presObjIdsWithNewLastUpdateds = allPresObjs.map((po) => po.id);
    }

    return {
      success: true,
      data: { lastUpdated, presObjIdsWithNewLastUpdateds },
    };
  });
}

// NOTE: last_run_git_ref is updated by the task manager when module execution
// completes (in set_module_clean.ts), not by this update function.

// IMPLEMENTATION NOTE: The metric/resultsObject/PO insertion logic above is
// duplicated between the two branches. Consider extracting to a helper:
//
// async function insertModuleMetadata(
//   sql: Sql,
//   modDef: ModuleDefinitionDetail,
//   lastUpdated: string,
// ): Promise<void> {
//   // Insert results_objects, metrics, default presentation_objects
// }
```

---

### Change 4: Update Route Handler

**File: `server/routes/project/modules.ts`**

Replace the `updateModuleDefinition` route (lines 107-143) with:

```typescript
defineRoute(
  routesModules,
  "updateModuleDefinition",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_modules",
  ),
  log("updateModuleDefinition"),
  async (c, { params, body }) => {
    const res = await updateModuleDefinition(
      c.var.ppk.projectDb,
      params.module_id,
      body.reinstall,
      body.rerun,
      body.preserveSettings,
    );
    if (res.success === false) {
      return c.json(res);
    }
    
    // If rerun requested, notify task manager
    if (body.rerun) {
      await setModuleDirty(c.var.ppk, params.module_id);
    }
    
    // Notify clients
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      res.data.presObjIdsWithNewLastUpdateds,
      res.data.lastUpdated,
    );
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    
    return c.json(res);
  },
);
```

---

### Change 5: Rewrite Client Modal

**File: `client/src/components/project/update_module.tsx`**

Replace entire file with:

```typescript
import { t3, TC, type ModuleId, type ModuleUpdatePreview } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  StateHolderWrapper,
  timActionForm,
  timQuery,
} from "panther";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
// NOTE: Verify panther Checkbox accepts 'description' prop. If not, remove descriptions below.
import { serverActions } from "~/server_actions";
import { setModuleLatestCommits } from "~/state/t4_ui";

export function UpdateModule(
  p: AlertComponentProps<
    {
      projectId: string;
      moduleId: ModuleId;
    },
    undefined
  >,
) {
  const preview = timQuery(
    () =>
      serverActions.previewModuleUpdate({
        projectId: p.projectId,
        module_id: p.moduleId,
      }),
    t3({ en: "Loading update preview...", fr: "Chargement de l'aperçu..." }),
  );

  // Signals for user choices
  const [reinstall, setReinstall] = createSignal<boolean>(false);
  const [rerun, setRerun] = createSignal<boolean>(false);
  const [preserveSettings, setPreserveSettings] = createSignal<boolean>(true);

  // Set defaults based on preview when it loads (one-shot, not on every state change)
  let defaultsSet = false;
  createEffect(() => {
    const state = preview.state();
    if (state.status === "ready" && !defaultsSet) {
      defaultsSet = true;
      setReinstall(state.data.hasUpdate);
      setRerun(state.data.recommendsRerun);
    }
  });

  const canSubmit = createMemo(() => reinstall() || rerun());

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const result = await serverActions.updateModuleDefinition({
        projectId: p.projectId,
        module_id: p.moduleId,
        reinstall: reinstall(),
        rerun: rerun(),
        preserveSettings: preserveSettings(),
      });
      
      // Refetch moduleLatestCommits to clear "needs update" badge
      if (result.success) {
        const commitsRes = await serverActions.checkModuleUpdates({});
        if (commitsRes.success) {
          setModuleLatestCommits(commitsRes.data);
        }
      }
      
      return result;
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="update-module"
      header={t3({ en: "Update module", fr: "Mettre à jour le module" })}
      savingState={save.state()}
      saveFunc={canSubmit() ? save.click : undefined}
      saveButtonText={t3(TC.apply)}
      cancelFunc={() => p.close(undefined)}
    >
      <StateHolderWrapper state={preview.state()} noPad>
        {(data: ModuleUpdatePreview) => (
            <div class="ui-spy-sm">
              {/* Status header */}
              <div class="mb-4">
                <Show
                  when={data.hasUpdate}
                  fallback={
                    <div class="bg-success/10 text-success font-500 rounded px-3 py-2 text-sm">
                      {t3({ en: "Module is up to date", fr: "Le module est à jour" })}
                      <Show when={data.currentGitRef}>
                        <span class="text-neutral ml-2 font-mono text-xs">
                          ({data.currentGitRef?.slice(0, 7)})
                        </span>
                      </Show>
                    </div>
                  }
                >
                  <div class="bg-warning/10 text-warning font-500 rounded px-3 py-2 text-sm">
                    {t3({ en: "Update available", fr: "Mise à jour disponible" })}
                    <span class="text-neutral ml-2 font-mono text-xs">
                      {data.currentGitRef?.slice(0, 7) ?? "?"} → {data.incomingGitRef.slice(0, 7)}
                    </span>
                  </div>
                </Show>
              </div>

              {/* What changed */}
              <Show when={data.hasUpdate && Object.values(data.changes).some(Boolean)}>
                <div class="mb-4">
                  <div class="text-neutral font-500 mb-2 text-xs uppercase">
                    {t3({ en: "What changed", fr: "Ce qui a changé" })}
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <Show when={data.changes.script}>
                      <ChangeBadge label="Script" isComputeAffecting />
                    </Show>
                    <Show when={data.changes.configRequirements}>
                      <ChangeBadge label="Config requirements" isComputeAffecting />
                    </Show>
                    <Show when={data.changes.resultsObjects}>
                      <ChangeBadge label="Results objects" isComputeAffecting />
                    </Show>
                    <Show when={data.changes.metrics}>
                      <ChangeBadge label="Metrics" />
                    </Show>
                    <Show when={data.changes.vizPresets}>
                      <ChangeBadge label="Viz presets" />
                    </Show>
                    <Show when={data.changes.label}>
                      <ChangeBadge label="Label" />
                    </Show>
                    <Show when={data.changes.dataSources}>
                      <ChangeBadge label="Data sources" />
                    </Show>
                    <Show when={data.changes.assetsToImport}>
                      <ChangeBadge label="Assets" />
                    </Show>
                  </div>
                </div>
              </Show>

              {/* Commits since */}
              <Show when={data.commitsSince.length > 0}>
                <div class="mb-4">
                  <div class="text-neutral font-500 mb-1 text-xs uppercase">
                    {t3({ en: "Commits since installed", fr: "Commits depuis l'installation" })}
                  </div>
                  <div class="border-base-300 max-h-32 overflow-y-auto rounded border">
                    <For each={data.commitsSince}>
                      {(commit) => (
                        <div class="border-base-300 flex items-start gap-2 border-b px-3 py-2 last:border-b-0 text-xs">
                          <span class="text-neutral font-mono">
                            {commit.sha.slice(0, 7)}
                          </span>
                          <span class="flex-1">{commit.message}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Actions */}
              <div class="border-base-300 rounded border p-3 space-y-3">
                <Checkbox
                  label={t3({
                    en: "Reinstall definition",
                    fr: "Réinstaller la définition",
                  })}
                  description={t3({
                    en: "Update metrics, presets, and presentation objects from latest source",
                    fr: "Mettre à jour les métriques, préréglages et objets de présentation",
                  })}
                  checked={reinstall()}
                  onChange={setReinstall}
                />
                
                <Checkbox
                  label={t3({
                    en: "Rerun module",
                    fr: "Réexécuter le module",
                  })}
                  description={t3({
                    en: "Execute R script and recompute all results",
                    fr: "Exécuter le script R et recalculer tous les résultats",
                  })}
                  checked={rerun()}
                  onChange={setRerun}
                />

                <Show when={reinstall()}>
                  <div class="pl-6 border-l-2 border-base-300">
                    <Checkbox
                      label={t3({
                        en: "Preserve settings",
                        fr: "Conserver les paramètres",
                      })}
                      description={t3({
                        en: "Keep your current parameter values where possible",
                        fr: "Conserver vos valeurs de paramètres actuelles si possible",
                      })}
                      checked={preserveSettings()}
                      onChange={setPreserveSettings}
                    />
                  </div>
                </Show>
              </div>

              {/* Recommendation */}
              <Show when={data.recommendsRerun && !rerun()}>
                <div class="mt-3 bg-warning/10 text-warning rounded px-3 py-2 text-xs">
                  {t3({
                    en: "Compute-affecting changes detected. Rerun recommended.",
                    fr: "Changements affectant le calcul détectés. Réexécution recommandée.",
                  })}
                </div>
              </Show>

              <Show when={!canSubmit()}>
                <div class="mt-3 text-neutral text-xs">
                  {t3({
                    en: "Select at least one action to apply.",
                    fr: "Sélectionnez au moins une action à appliquer.",
                  })}
                </div>
              </Show>
            </div>
          )}
      </StateHolderWrapper>
    </AlertFormHolder>
  );
}

function ChangeBadge(p: { label: string; isComputeAffecting?: boolean }) {
  return (
    <span
      class={`rounded px-2 py-0.5 text-xs ${
        p.isComputeAffecting
          ? "bg-danger/10 text-danger"
          : "bg-base-200 text-neutral"
      }`}
    >
      {p.label}
      {p.isComputeAffecting && " *"}
    </span>
  );
}
```

---

### Change 6: Update "Update All Modules" Component

**File: `client/src/components/project/update_all_modules.tsx`**

Update line 47-51 to use new API:

```typescript
// OLD
const res = await serverActions.updateModuleDefinition({
  projectId: p.projectId,
  module_id: mod.id,
  preserveSettings: preserveSettings(),
});

// NEW
const res = await serverActions.updateModuleDefinition({
  projectId: p.projectId,
  module_id: mod.id,
  reinstall: true,
  rerun: true,  // Update all always reruns
  preserveSettings: preserveSettings(),
});
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `lib/types/modules.ts` | Replace `ModuleUpdatePreview` type |
| `lib/api-routes/project/modules.ts` | Update request body type |
| `server/module_loader/compare_definitions.ts` | **NEW** — Comparison logic (single source of truth) |
| `server/module_loader/mod.ts` | Add export for comparison functions |
| `server/routes/project/modules.ts` | Rewrite preview endpoint, update route handler |
| `server/db/project/modules.ts` | Rewrite `updateModuleDefinition` function |
| `client/src/components/project/update_module.tsx` | Complete rewrite of modal |
| `client/src/components/project/update_all_modules.tsx` | Update API call |

---

## What We Are NOT Changing

- `setModuleDirty()` function
- Task manager and module execution
- Module dependency tracking
- Worker routines
- SSE notification infrastructure
- Any other module operations (install, uninstall, parameter updates)
- `last_run_git_ref` updates (handled by task manager in `set_module_clean.ts`)

We are ONLY changing the module update modal flow. The rest of the system continues to work exactly as before.

---

## Pre-Implementation Verification

Before implementing, verify these assumptions:

1. **`getModuleDetail` returns same shape as `parseInstalledModuleDefinition`**
   - Check: `server/db/project/modules.ts` line ~549
   - Both should return `ModuleDefinitionInstalled`

2. **`last_run_git_ref` is set when module completes**
   - Check: `server/task_management/set_module_clean.ts`
   - Should update `last_run_git_ref` with current `installed_git_ref`

3. **`fetchModuleFiles` returns `{ definition, script, gitRef }`**
   - Check: `server/module_loader/load_module.ts` line ~59
   - Confirmed in code review

4. **`prepareModuleDefinitionForStorage` handles translated input**
   - Check: `server/db/project/modules.ts` line ~51
   - Receives output of `getModuleDefinitionDetail` (already translated)
   - Verify it doesn't double-translate or break

5. **`Checkbox` component accepts `description` prop**
   - Check: `panther` Checkbox component
   - If not, remove description props or add feature to panther

---

## Testing Checklist

**Core functionality:**
- [ ] Reinstall only (no rerun): Definition updates, data tables preserved, dirty state unchanged
- [ ] Rerun only (no reinstall): Module marked dirty, runs with current definition
- [ ] Both: Full update + rerun
- [ ] Neither: Button disabled, nothing happens
- [ ] Preserve settings: Parameter values preserved across reinstall

**Indicators and badges:**
- [ ] "Needs update" badge clears after reinstall (moduleLatestCommits refetched)
- [ ] Preview shows correct change detection for each field type
- [ ] Recommendation matches compute-affecting changes
- [ ] Label change detected correctly (translatable string vs plain string)
- [ ] Metrics change detected correctly (not just count)

**Edge cases:**
- [ ] GitHub unavailable: graceful degradation, no false "has update"
- [ ] Module with zero metrics
- [ ] Module installed before gitRef tracking existed (installedGitRef is null)
- [ ] Installed commit not found in recent commit history

**After rerun completes:**
- [ ] `last_run_git_ref` matches `installed_git_ref`
- [ ] "Results stale" indicator clears
