# Move HFA Indicators to Instance Level + Decouple scriptGenerationType

## Context

HFA indicators (`HfaIndicator[]`) are stored per-project in `modules.config_selections`. This requires duplicate setup per project. Moving them to the instance level means configure once, apply everywhere.

Additionally, `configType: "hfa"` currently serves double duty — it controls both the config/settings UI and the script generation dispatch. Since removing `indicators` from the config leaves only `useSampleWeights: boolean`, the HFA config type becomes unnecessary. We introduce `scriptGenerationType` to decouple script generation from config type.

**Key naming distinction:**
- `hfa_indicators` (new, instance DB) — **indicator definitions**: R code, category, type, etc. Configured once at instance level.
- `indicators_hfa` (existing, project DB) — **dataset column metadata**: variable names from uploaded HFA CSV files. Remains project-level, unchanged by this work.

**Decisions:**
- Always fetch fresh from instance DB (no snapshots/dirty marking for now)
- `useSampleWeights` becomes a standard boolean parameter
- Add `scriptGenerationType: "hfa"` for script generation dispatch
- Remove `configType: "hfa"` entirely — use standard `"parameters"` config
- No default seeding — start empty
- Feature not yet in production — no migration concerns

---

## Step 1: Type Changes — Module Definitions

**File: `lib/types/module_definitions.ts`**

Add required `scriptGenerationType` to `ModuleDefinition`:
```ts
export type ScriptGenerationType = "template" | "hfa";

export type ModuleDefinition = {
  // ... existing fields
  scriptGenerationType: ScriptGenerationType;  // NEW — controls R script generation dispatch
};
```

- `"template"` — standard R script with placeholder string replacements (all m001–m006)
- `"hfa"` — script generated from instance-level HFA indicator definitions

Also add to `ModuleDefinitionJSON` — once added to `ModuleDefinition`, it carries through automatically since `scriptGenerationType` is not in the Omit list.

Remove `configType: "hfa"` from `ModuleConfigRequirements`:
```ts
export type ModuleConfigRequirements =
  | { configType: "none" }
  | { configType: "parameters"; parameters: ModuleParameter[] };
// "hfa" variant removed
```

`HfaIndicator` type stays as-is.

---

## Step 2: Type Changes — Module Config Selections

**File: `lib/types/modules.ts`**

Remove `ModuleConfigSelectionsHfa` type entirely.

Remove HFA branch from `getStartingModuleConfigSelections` (lines 75-82).

Remove HFA branch from `getMergedModuleConfigSelections` (lines 119-125).

Update `ModuleConfigSelections` union — only `ModuleConfigSelectionsNone | ModuleConfigSelectionsParameters`.

Remove `hfaIndicators?` field from `InstalledModuleWithConfigSelections`.

Update `InstalledModuleSummary.configType` type from `"none" | "parameters" | "hfa"` to `"none" | "parameters"`.

---

## Step 3: Module Definitions

**File: `module_defs/hfa001/1.0.0/definition.ts`**

Change:
```ts
configRequirements: {
  configType: "hfa",
},
```
To:
```ts
scriptGenerationType: "hfa",
configRequirements: {
  configType: "parameters",
  parameters: [
    {
      replacementString: "USE_SAMPLE_WEIGHTS",
      description: "Use sample weights for calculations",
      input: {
        inputType: "boolean",
        defaultValue: "FALSE",
      },
    },
  ],
},
```

**All other module definitions** (`m001`–`m006`): 

Add `scriptGenerationType: "template"` to each definition. Example:
```ts
scriptGenerationType: "template",
configRequirements: { ... }, // unchanged
```

---

## Step 4: Instance DB Schema

**File: `server/db/instance/_main_database.sql`**

Add table:
```sql
CREATE TABLE IF NOT EXISTS hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**New migration file** in `server/db/migrations/instance/` — same CREATE TABLE IF NOT EXISTS.

---

## Step 5: Server CRUD

**New file: `server/db/instance/hfa_indicators.ts`**

Follow pattern from `server/db/instance/indicators.ts`:
- `getHfaIndicators(mainDb)` — returns all ordered by `sort_order, var_name`
- `createHfaIndicator(mainDb, indicator)` — insert
- `updateHfaIndicator(mainDb, oldVarName, indicator)` — update
- `deleteHfaIndicators(mainDb, varNames[])` — bulk delete
- `batchUploadHfaIndicators(mainDb, indicators[], replaceAll)` — bulk import (if `replaceAll`, deletes all first)

Conversion helper for module execution:
```ts
export function dbRowToHfaIndicator(row: DBHfaIndicator): HfaIndicator {
  return {
    varName: row.var_name,
    category: row.category,
    definition: row.definition,
    rCode: row.r_code,
    rFilterCode: row.r_filter_code ?? undefined,
    type: row.type,
  };
}
```

**Update `getInstanceDetail`** in `server/db/instance/instance.ts` — add HFA indicator count.

---

## Step 6: API Routes & Server Route Handlers

**New file: `lib/api-routes/instance/hfa_indicators.ts`** — route definitions for CRUD.

**Register in combined route registry.**

**New file: `server/routes/instance/hfa_indicators.ts`** — Hono route handlers.
- All use `c.var.mainDb`
- Mutating routes require `can_configure_data`
- No cross-project dirty marking for now

---

## Step 7: Script Generation — Use `scriptGenerationType`

**File: `server/server_only_funcs/get_script_with_parameters.ts`**

Change dispatch from checking `configType === "hfa"` to checking `scriptGenerationType`:
```ts
export function getScriptWithParameters(
  moduleDefinition: ModuleDefinition,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  knownDatasetVariables?: Set<string>,
  hfaIndicators?: HfaIndicator[]         // NEW — from instance DB
): string {
  if (moduleDefinition.scriptGenerationType === "hfa") {
    if (!knownDatasetVariables) throw new Error("...");
    if (!hfaIndicators) throw new Error("...");
    return getScriptWithParametersHfa(hfaIndicators, knownDatasetVariables);
  }

  // ... rest unchanged (template replacement + parameter substitution)
}
```

**File: `server/server_only_funcs/get_script_with_parameters_hfa.ts`** — NO CHANGES needed. Already takes `indicators: HfaIndicator[]` as parameter.

---

## Step 8: Module Execution — Fetch from Instance DB

**File: `server/worker_routines/run_module/run_module_iterator.ts`**

Add `mainDb: Sql` parameter. Change dispatch:
```ts
let knownDatasetVariables: Set<string> | undefined;
let hfaIndicatorsFromInstance: HfaIndicator[] | undefined;
if (moduleDetail.moduleDefinition.scriptGenerationType === "hfa") {
  // Dataset variables (project-level — from uploaded HFA CSV)
  const hfaVarRows = await projectDb<{ var_name: string }[]>`
    SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
  `;
  knownDatasetVariables = new Set(hfaVarRows.map((r) => r.var_name));

  // Indicator definitions (instance-level)
  const hfaRows = await mainDb<DBHfaIndicator[]>`
    SELECT * FROM hfa_indicators ORDER BY sort_order, var_name
  `;
  hfaIndicatorsFromInstance = hfaRows.map(dbRowToHfaIndicator);

  if (hfaIndicatorsFromInstance.length === 0) {
    throw new Error("No HFA indicators configured at the instance level.");
  }
}

const scriptWithParameters = getScriptWithParameters(
  moduleDetail.moduleDefinition,
  moduleDetail.configSelections,
  countryIso3,
  knownDatasetVariables,
  hfaIndicatorsFromInstance     // NEW
);
```

**File: `server/worker_routines/run_module/worker.ts`** (line 68-74)

Pass `mainDb` (already exists on line 45) to `runModuleIterator`.

---

## Step 9: Script Preview Route

**File: `server/routes/project/modules.ts`** (lines 216-232)

Change dispatch from `configRequirements.configType === "hfa"` to `scriptGenerationType === "hfa"`. Also fetch HFA indicators from instance DB (`c.var.mainDb`) instead of from config_selections:
```ts
let hfaIndicators: HfaIndicator[] | undefined;
if (res.data.moduleDefinition.scriptGenerationType === "hfa") {
  // ... fetch knownDatasetVariables from project DB
  // ... fetch hfaIndicators from main DB
}
const script = getScriptWithParameters(
  res.data.moduleDefinition,
  res.data.configSelections,
  resCountryIso3.data.countryIso3,
  knownDatasetVariables,
  hfaIndicators
);
```

---

## Step 10: Clean Up Project-Level HFA Code

**File: `server/db/project/modules.ts`**

- `updateModuleParameters` (lines 1038-1049): Remove entire `configType === "hfa"` branch. Standard parameter handling covers `useSampleWeights`.
- `getModuleWithConfigSelections` (lines 971+): Remove the `indicators_hfa` query and `hfaIndicators` field.

---

## Step 11: Indicator Label Replacements

**File: `server/server_only_funcs_presentation_objects/get_indicator_label_replacements.ts`**

Currently parses HFA indicator definitions from the `config_selections` JSON column in the project DB `modules` table. Change to query the instance DB instead:
```ts
export async function getIndicatorLabelReplacements(
  mainDb: Sql,     // ADD — caller (getPresentationObjectItems) already has this
  projectDb: Sql,
  moduleId: string,
): Promise<Record<string, string>> {
  if (moduleId.toLowerCase().startsWith("hfa")) {
    const hfaRows = await mainDb<DBHfaIndicator[]>`
      SELECT * FROM hfa_indicators
    `;
    for (const row of hfaRows) {
      indicatorLabelReplacements[row.var_name] = row.definition;
    }
  } else {
    // ... existing common indicator logic unchanged
  }
}
```

**Update caller** in `get_presentation_object_items.ts:46` — pass `mainDb` as first arg.

---

## Step 12: Client — HfaIndicatorsManager

**New file: `client/src/components/instance/hfa_indicators_manager.tsx`**

Follow pattern from `client/src/components/indicators/indicators_manager.tsx` and `panther/FRONTEND_STYLE_GUIDE.md`:

**Layout & data fetching:**
- `FrameTop` + `HeadingBar` with back button, title "HFA INDICATORS", action buttons (Upload CSV, Download CSV, Add, Refresh)
- `timQuery` for fetching (`serverActions.getHfaIndicators({})`) — never `createResource`
- `StateHolderWrapper` for loading/error states
- `EditorWrapper` wrapping the entire component for modal support

**Table:**
- `Table` component with `TableColumn[]`, `keyField="var_name"`, `fitTableToAvailableHeight`
- Columns: category, varName, definition, type (rendered as "Boolean"/"Numeric"), rCode (mono), rFilterCode (mono)
- Actions column with edit (pencil) + delete (trash) buttons per row (admin only)
- `bulkActions` with bulk delete via `timActionDelete` (admin only)
- Group by `category` using `groups` + `currentGroup` props
- Row click opens edit modal

**CRUD operations:**
- Each mutation is an immediate server round-trip (not batch-save)
- Create/Edit: `openComponent` with `EditHfaIndicatorForm` modal
- Delete: `timActionDelete` with confirmation dialog
- After every mutation: `silentRefreshIndicators` (calls both `p.instanceDetail.silentFetch()` + `indicators.silentFetch()`)

**CSV:**
- Download: client-side Blob creation (same pattern as `IndicatorsManager.handleDownloadCommonCsv`)
- Upload: adapt `HfaCsvUploadForm` to call instance-level batch server action

**Props:** `{ isGlobalAdmin, instanceDetail, backToInstance }`

---

**Adapt `EditHfaIndicator` for immediate persistence:**

The current `edit_hfa_indicator.tsx` uses the old batch-save pattern (`createStore` → mutate → return `"NEEDS_UPDATE"` → parent saves batch). This must change to the `EditIndicatorCommonForm` pattern:

- `AlertFormHolder` wrapper (not `ModalContainer`)
- `createSignal` per field (not `createStore`)
- `timActionForm` → validation → server action (`createHfaIndicator` or `updateHfaIndicator`) → `silentRefreshIndicators` → `p.close(undefined)`
- Create/update mode based on `existingIndicator?` prop
- Validation: require `varName`, `rCode`, `type`

Modify `edit_hfa_indicator.tsx` in place (old pattern becomes dead code after this change).

**New server actions** for instance HFA indicator CRUD.

---

## Step 13: Client — instance_data.tsx

**File: `client/src/components/instance/instance_data.tsx`**

Add `<Match when={selectedDataSource() === "hfa_indicators"}>` with `<HfaIndicatorsManager>`.

Add card in "Common structure" section showing HFA indicator count.

---

## Step 14: Client — Settings UI

**File: `client/src/components/project/project_modules.tsx`** (lines 148-166)

Remove the `configType === "hfa"` branch. HFA modules now have `configType === "parameters"`, so they'll use `SettingsForProjectModuleGeneric` automatically — which renders the standard parameter editor (just the `useSampleWeights` checkbox).

**File: `client/src/components/project_module_settings/settings_hfa.tsx`** — can be deleted or left as dead code.

---

## Step 15: AI Context

**File: `client/src/components/project_ai/ai_tools/tools/_internal/format_module_settings_for_ai.ts`**

Remove `configType === "hfa"` branch. Standard parameter formatting handles it.

---

## Files Modified (Summary)

| File                                                                                | Change                                                                           |
|-------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| `lib/types/module_definitions.ts`                                                   | Add `scriptGenerationType`, remove `configType: "hfa"` from union                |
| `lib/types/modules.ts`                                                              | Remove `ModuleConfigSelectionsHfa`, HFA branches, `hfaIndicators` field          |
| `module_defs/hfa001/1.0.0/definition.ts`                                            | Change configType to "parameters", add `scriptGenerationType: "hfa"`             |
| `module_defs/m001–m006/1.0.0/definition.ts`                                         | Add `scriptGenerationType: "template"` to each                                   |
| `server/db/instance/_main_database.sql`                                             | Add `hfa_indicators` table                                                       |
| `server/db/instance/hfa_indicators.ts`                                              | **NEW** — CRUD functions                                                         |
| `server/db/instance/instance.ts`                                                    | Add HFA indicator count                                                          |
| `lib/api-routes/instance/hfa_indicators.ts`                                         | **NEW** — route definitions                                                      |
| `server/routes/instance/hfa_indicators.ts`                                          | **NEW** — route handlers                                                         |
| `server/server_only_funcs/get_script_with_parameters.ts`                            | Check `scriptGenerationType` instead of `configType`                             |
| `server/worker_routines/run_module/run_module_iterator.ts`                          | Add `mainDb` param, check `scriptGenerationType`                                 |
| `server/worker_routines/run_module/worker.ts`                                       | Pass `mainDb` to iterator                                                        |
| `server/routes/project/modules.ts`                                                  | Script preview: check `scriptGenerationType`, fetch from instance                |
| `server/db/project/modules.ts`                                                      | Remove HFA branch from `updateModuleParameters`, `getModuleWithConfigSelections` |
| `server/server_only_funcs_presentation_objects/get_indicator_label_replacements.ts` | Read from instance DB                                                            |
| `server/server_only_funcs_presentation_objects/get_presentation_object_items.ts`    | Pass `mainDb` to label replacements                                              |
| `client/src/components/instance/hfa_indicators_manager.tsx`                         | **NEW** — indicator management UI                                                |
| `client/src/components/instance/instance_data.tsx`                                  | Add HFA indicators nav entry                                                     |
| `client/src/components/project/project_modules.tsx`                                 | Remove HFA settings dispatch                                                     |
| `client/src/components/project_ai/.../format_module_settings_for_ai.ts`             | Remove HFA branch                                                                |
| `server/db/migrations/instance/`                                                    | **NEW** — migration for `hfa_indicators` table                                   |
| `client/src/components/forms_editors/edit_hfa_indicator.tsx`                         | Rewrite: batch-save pattern → immediate-persist via `timActionForm`              |
| `client/src/server_actions/` (or equivalent)                                        | **NEW** — server actions for HFA indicator CRUD                                  |
| `lib/api-routes/project/modules.ts`                                                 | Remove HFA from updateModuleParameters body type                                 |

---

## NOT Doing

- **Cross-project dirty marking** — skipped for now. Users manually re-run modules after changing instance indicators.
- **Default indicator seeding** — instance starts empty.
- **Removing `useSampleWeights`** — kept as a standard parameter for future use.

---

## Verification

1. `deno task typecheck` — both server and client pass
2. `deno task build:modules` — module definitions build successfully
3. Start server + client (`./run`)
4. Navigate to Data page — HFA Indicators card appears in Common structure
5. Add indicators via new manager (manual + CSV upload)
6. Create project, install HFA module — settings show standard parameter editor with "Use sample weights" checkbox
7. Upload HFA dataset, run module — verify it reads indicators from instance DB and generates correct R script
8. Verify chart label replacements work (indicator varName → definition mapping)
