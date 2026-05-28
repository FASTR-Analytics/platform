# Plan: Show Labels Instead of IDs in Filter UI

## Problem Statement

The filter selection UI in the presentation object editor currently displays raw IDs (e.g., `anc1`, `opd_total`) instead of human-readable labels (e.g., `ANC 1st visit`, `OPD Total Visits`). Users cannot easily identify which filter values to select.

## Goal

Display human-readable labels in the filter chip UI while continuing to store IDs in the presentation object config. The stored config format does not change - only the display.

## Current Behavior

When a user expands a filter (e.g., "Indicator") in the presentation object editor, they see clickable chips showing raw IDs like:
```
[anc1] [anc4] [opd_total] [ipd_admissions]
```

## Desired Behavior

The same chips should display labels:
```
[ANC 1st visit] [ANC 4th visit] [OPD Total Visits] [IPD Admissions]
```

When clicked, the **ID** (not label) is still stored in `config.d.filterBy[].values`.

---

## Files to Modify (13 files)

### Type Definitions (2 files)
1. `lib/types/presentation_objects.ts` - DisaggregationPossibleValuesStatus type
2. `lib/types/presentation_objects.ts` - ReplicantOptionsForPresentationObject type

### Server (4 files)
3. `server/db/project/results_value_resolver.ts` - return moduleId
4. `server/db/project/presentation_objects.ts` - update caller of resolveMetricById
5. `server/server_only_funcs_presentation_objects/get_results_value_info.ts` - pass moduleId
6. `server/server_only_funcs_presentation_objects/get_possible_values.ts` - return {id, label}[]

### Server Routes (1 file)
7. `server/routes/project/presentation_objects.ts` - pass moduleId to getPossibleValues

### Client (6 files)
8. `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx` - filter UI
9. `client/src/components/ReplicateByOptions.tsx` - replicant dropdown
10. `client/src/state/project/t2_presentation_objects.ts` - replicant validation
11. `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` - AI figure resolution
12. `client/src/components/dashboards/dashboard_editor.tsx` - dashboard replicant handling
13. `client/src/components/project_ai/ai_tools/validators/content_validators.ts` - AI content validation

---

## Change 1: DisaggregationPossibleValuesStatus Type

**File**: `lib/types/presentation_objects.ts`  
**Lines**: 77-91

### Current Code:
```ts
export type DisaggregationPossibleValuesStatus =
  | {
      status: "ok";
      values: string[];
    }
  | {
      status: "too_many_values";
    }
  | {
      status: "no_values_available";
    }
  | {
      status: "error";
      message: string;
    };
```

### New Code:
```ts
export type DisaggregationPossibleValuesStatus =
  | {
      status: "ok";
      values: { id: string; label: string }[];
    }
  | {
      status: "too_many_values";
    }
  | {
      status: "no_values_available";
    }
  | {
      status: "error";
      message: string;
    };
```

### What Changed:
- Line 80: `values: string[]` → `values: { id: string; label: string }[]`

---

## Change 2: ReplicantOptionsForPresentationObject Type

**File**: `lib/types/presentation_objects.ts`  
**Lines**: 104-122

### Current Code:
```ts
export type ReplicantOptionsForPresentationObject = {
  projectId: string;
  resultsObjectId: string;
  replicateBy: DisaggregationOption;
  fetchConfig: GenericLongFormFetchConfig;
  moduleLastRun: string;
} & (
  | {
      status: "ok";
      possibleValues: string[];
    }
  | {
      status: "too_many_values";
    }
  | {
      status: "no_values_available";
    }
);
```

### New Code:
```ts
export type ReplicantOptionsForPresentationObject = {
  projectId: string;
  resultsObjectId: string;
  replicateBy: DisaggregationOption;
  fetchConfig: GenericLongFormFetchConfig;
  moduleLastRun: string;
} & (
  | {
      status: "ok";
      possibleValues: { id: string; label: string }[];
    }
  | {
      status: "too_many_values";
    }
  | {
      status: "no_values_available";
    }
);
```

### What Changed:
- Line 114: `possibleValues: string[]` → `possibleValues: { id: string; label: string }[]`

---

## Change 3: Return moduleId from Resolver

**File**: `server/db/project/results_value_resolver.ts`  
**Lines**: 14-35 (entire function)

### Current Code:
```ts
export async function resolveMetricById(
  projectDb: Sql,
  metricId: string,
  facilityConfig?: InstanceConfigFacilityColumns,
): Promise<APIResponseWithData<ResultsValue>> {
  try {
    const dbMetric = (
      await projectDb<DBMetric[]>`
        SELECT * FROM metrics WHERE id = ${metricId}
      `
    ).at(0);

    if (!dbMetric) {
      return { success: false, err: `Metric not found: ${metricId}` };
    }

    const enrichedMetric = await enrichMetric(dbMetric, projectDb, facilityConfig);
    return { success: true, data: enrichedMetric };
  } catch (error) {
    return { success: false, err: `Error resolving metric: ${error}` };
  }
}
```

### New Code:
```ts
export async function resolveMetricById(
  projectDb: Sql,
  metricId: string,
  facilityConfig?: InstanceConfigFacilityColumns,
): Promise<APIResponseWithData<{ resultsValue: ResultsValue; moduleId: string }>> {
  try {
    const dbMetric = (
      await projectDb<DBMetric[]>`
        SELECT * FROM metrics WHERE id = ${metricId}
      `
    ).at(0);

    if (!dbMetric) {
      return { success: false, err: `Metric not found: ${metricId}` };
    }

    const enrichedMetric = await enrichMetric(dbMetric, projectDb, facilityConfig);
    return { success: true, data: { resultsValue: enrichedMetric, moduleId: dbMetric.module_id } };
  } catch (error) {
    return { success: false, err: `Error resolving metric: ${error}` };
  }
}
```

### What Changed:
- Line 18: Return type `APIResponseWithData<ResultsValue>` → `APIResponseWithData<{ resultsValue: ResultsValue; moduleId: string }>`
- Line 31: Return `{ resultsValue: enrichedMetric, moduleId: dbMetric.module_id }` instead of just `enrichedMetric`

---

## Change 4: Update presentation_objects.ts Caller

**File**: `server/db/project/presentation_objects.ts`  
**Lines**: 196-199

### Current Code:
```ts
    const presObj: PresentationObjectDetail = {
      id: rawPresObj.id,
      projectId,
      resultsValue: resResultsValue.data,
```

### New Code:
```ts
    const presObj: PresentationObjectDetail = {
      id: rawPresObj.id,
      projectId,
      resultsValue: resResultsValue.data.resultsValue,
```

### What Changed:
- Line 199: `resResultsValue.data` → `resResultsValue.data.resultsValue`

---

## Change 5: Pass moduleId Through get_results_value_info.ts

**File**: `server/server_only_funcs_presentation_objects/get_results_value_info.ts`

### Change 5a: Update caller of resolveMetricById (lines 32-51)

#### Current Code:
```ts
    const resResultsValue = await resolveMetricById(projectDb, metricId, facilityConfig);
    throwIfErrWithData(resResultsValue);

    // Extract everything from the ResultsValue
    const resultsObjectId = resResultsValue.data.resultsObjectId;
    const disaggregationOptions = resResultsValue.data.disaggregationOptions
      .map((d) => d.value);
    const firstPeriodOption = resResultsValue.data.mostGranularTimePeriodColumnInResultsFile;

    // Call the core logic with all derived values
    return await getResultsObjectVariableInfoCore(
      mainDb,
      projectDb,
      projectId,
      resultsObjectId,
      metricId,
      firstPeriodOption,
      disaggregationOptions,
      moduleLastRun,
    );
```

#### New Code:
```ts
    const resResultsValue = await resolveMetricById(projectDb, metricId, facilityConfig);
    throwIfErrWithData(resResultsValue);

    // Extract everything from the ResultsValue
    const { resultsValue, moduleId } = resResultsValue.data;
    const resultsObjectId = resultsValue.resultsObjectId;
    const disaggregationOptions = resultsValue.disaggregationOptions
      .map((d) => d.value);
    const firstPeriodOption = resultsValue.mostGranularTimePeriodColumnInResultsFile;

    // Call the core logic with all derived values
    return await getResultsObjectVariableInfoCore(
      mainDb,
      projectDb,
      projectId,
      resultsObjectId,
      metricId,
      firstPeriodOption,
      disaggregationOptions,
      moduleLastRun,
      moduleId,
    );
```

#### What Changed:
- Line 35: Destructure `{ resultsValue, moduleId }` from `resResultsValue.data`
- Lines 36-39: Access properties from `resultsValue` instead of `resResultsValue.data`
- Line 51: Add `moduleId` as final argument

### Change 5b: Update getResultsObjectVariableInfoCore signature (lines 79-88)

#### Current Code:
```ts
async function getResultsObjectVariableInfoCore(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  resultsObjectId: string,
  metricId: string,
  firstPeriodOption: PeriodOption | undefined,
  disaggregationOptions: DisaggregationOption[],
  moduleLastRun: string,
):
```

#### New Code:
```ts
async function getResultsObjectVariableInfoCore(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  resultsObjectId: string,
  metricId: string,
  firstPeriodOption: PeriodOption | undefined,
  disaggregationOptions: DisaggregationOption[],
  moduleLastRun: string,
  moduleId: string,
):
```

#### What Changed:
- Add `moduleId: string` parameter after `moduleLastRun`

### Change 5c: Pass moduleId to getPossibleValues (lines 118-123)

#### Current Code:
```ts
      const resDisPossibleVals = await getPossibleValues(
        projectDb,
        resultsObjectId,
        disOpt,
        mainDb,
      );
```

#### New Code:
```ts
      const resDisPossibleVals = await getPossibleValues(
        projectDb,
        resultsObjectId,
        disOpt,
        mainDb,
        moduleId,
      );
```

#### What Changed:
- Add `moduleId` as 5th argument

---

## Change 6: Update getPossibleValues to Return Labels

**File**: `server/server_only_funcs_presentation_objects/get_possible_values.ts`

### Change 6a: Add imports (top of file)

#### Add to imports:
```ts
import { IndicatorMetadata } from "lib";
import { getIndicatorMetadata } from "./get_indicator_metadata.ts";
```

### Change 6b: Update function signature (lines 25-36)

#### Current Code:
```ts
export async function getPossibleValues(
  projectDb: Sql,
  resultsObjectId: string,
  disaggregationOption: DisaggregationOption,
  mainDb: Sql,
  filters?: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds?: {
    periodOption: PeriodOption;
    min: number;
    max: number;
  },
): Promise<APIResponseWithData<string[]>> {
```

#### New Code:
```ts
export async function getPossibleValues(
  projectDb: Sql,
  resultsObjectId: string,
  disaggregationOption: DisaggregationOption,
  mainDb: Sql,
  moduleId: string,
  filters?: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds?: {
    periodOption: PeriodOption;
    min: number;
    max: number;
  },
): Promise<APIResponseWithData<{ id: string; label: string }[]>> {
```

#### What Changed:
- Add `moduleId: string` parameter after `mainDb`
- Return type: `string[]` → `{ id: string; label: string }[]`

### Change 6c: Replace final return block (lines 227-234)

#### Current Code:
```ts
    const results =
      await projectDb.unsafe<{ disaggregation_value: string }[]>(sqlQuery);

    const possibleValues = results
      .map((opt) => opt.disaggregation_value)
      .filter((v) => v != null && String(v).trim() !== "");
    return { success: true, data: possibleValues };
  });
}
```

#### New Code:
```ts
    const results =
      await projectDb.unsafe<{ disaggregation_value: string }[]>(sqlQuery);

    const rawValues = results
      .map((opt) => opt.disaggregation_value)
      .filter((v) => v != null && String(v).trim() !== "");

    // For indicator columns, get labels from indicator metadata
    const indicatorColumns: DisaggregationOption[] = ["indicator_common_id"];
    let labelMap: Map<string, string> | undefined;

    if (indicatorColumns.includes(disaggregationOption)) {
      const metadata = await getIndicatorMetadata(mainDb, projectDb, moduleId);
      labelMap = new Map(metadata.map((m) => [m.id, m.label]));
    }

    const possibleValues = rawValues.map((id) => ({
      id: String(id),
      label: labelMap?.get(String(id)) ?? String(id),
    }));

    return { success: true, data: possibleValues };
  });
}
```

#### What Changed:
- Renamed `possibleValues` to `rawValues` for intermediate step
- Added `indicatorColumns` array defining which disaggregation options use indicator metadata
- Added conditional call to `getIndicatorMetadata` when needed
- Built `labelMap` from metadata for ID→label lookup
- Transformed `rawValues` into `{ id, label }[]`, using labelMap when available, falling back to id as label

---

## Change 7: Update Route getPossibleValues Caller

**File**: `server/routes/project/presentation_objects.ts`  
**Lines**: 622-636

### Current Code:
```ts
        const resDisPossibleVals = await getPossibleValues(
          c.var.ppk.projectDb,
          body.resultsObjectId,
          body.replicateBy,
          c.var.mainDb,
          body.fetchConfig.filters,
          body.fetchConfig.periodFilter &&
            periodFilterHasBounds(body.fetchConfig.periodFilter)
            ? {
                periodOption: body.fetchConfig.periodFilter.periodOption,
                min: body.fetchConfig.periodFilter.min,
                max: body.fetchConfig.periodFilter.max,
              }
            : undefined,
        );
```

### New Code:
```ts
        const resDisPossibleVals = await getPossibleValues(
          c.var.ppk.projectDb,
          body.resultsObjectId,
          body.replicateBy,
          c.var.mainDb,
          moduleId,
          body.fetchConfig.filters,
          body.fetchConfig.periodFilter &&
            periodFilterHasBounds(body.fetchConfig.periodFilter)
            ? {
                periodOption: body.fetchConfig.periodFilter.periodOption,
                min: body.fetchConfig.periodFilter.min,
                max: body.fetchConfig.periodFilter.max,
              }
            : undefined,
        );
```

### What Changed:
- Add `moduleId` as 5th argument (moduleId is already available at line 557)

---

## Change 8: Update Client Filter UI

**File**: `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`

### Change 8a: Update toggleVal function (lines 488-502)

#### Current Code:
```ts
          function toggleVal(val: string) {
            const normalized = String(val).toLowerCase();
```

#### New Code:
```ts
          function toggleVal(id: string) {
            const normalized = String(id).toLowerCase();
```

#### What Changed:
- Renamed parameter from `val` to `id` for clarity

### Change 8b: Update chip rendering (lines 523-543)

#### Current Code:
```ts
                <Match when={p.keyedStatus.status === "ok"}>
                  <div class="ui-gap-sm ui-pad border-base-300 flex max-h-[300px] flex-wrap overflow-auto rounded border font-mono text-xs">
                    <For each={(p.keyedStatus as Extract<DisaggregationPossibleValuesStatus, { status: "ok" }>).values}>
                      {(opt) => {
                        return (
                          <div
                            class="ui-hoverable bg-base-200 data-[selected=true]:bg-success data-[selected=true]:text-base-100 rounded px-2 py-1"
                            onClick={() => toggleVal(opt)}
                            data-selected={keyedFilter.values.some(
                              v => String(v).toLowerCase() === String(opt).toLowerCase()
                            )}
                          >
                            <span class="relative">
                              {keyedFilter.disOpt === "indicator_common_id"
                                ? String(opt).toUpperCase()
                                : opt}
                            </span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Match>
```

#### New Code:
```ts
                <Match when={p.keyedStatus.status === "ok"}>
                  <div class="ui-gap-sm ui-pad border-base-300 flex max-h-[300px] flex-wrap overflow-auto rounded border text-xs">
                    <For each={(p.keyedStatus as Extract<DisaggregationPossibleValuesStatus, { status: "ok" }>).values}>
                      {(opt) => {
                        return (
                          <div
                            class="ui-hoverable bg-base-200 data-[selected=true]:bg-success data-[selected=true]:text-base-100 rounded px-2 py-1"
                            onClick={() => toggleVal(opt.id)}
                            data-selected={keyedFilter.values.some(
                              v => String(v).toLowerCase() === String(opt.id).toLowerCase()
                            )}
                          >
                            <span class="relative">{opt.label}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Match>
```

#### What Changed:
- Line 524: Removed `font-mono` class
- Line 530: `toggleVal(opt)` → `toggleVal(opt.id)`
- Lines 531-532: `String(opt)` → `String(opt.id)`
- Lines 535-538: Replaced conditional with `{opt.label}`

---

## Change 9: Update ReplicateByOptions.tsx

**File**: `client/src/components/ReplicateByOptions.tsx`

### Change 9a: Update panther import (lines 11-17)

#### Current Code:
```ts
import {
  Select,
  SelectList,
  StateHolderWrapper,
  timQuery,
  getSelectOptions,
} from "panther";
```

#### New Code:
```ts
import {
  Select,
  SelectList,
  StateHolderWrapper,
  timQuery,
  getSelectOptionsFromIdLabel,
} from "panther";
```

#### What Changed:
- Replace `getSelectOptions` with `getSelectOptionsFromIdLabel` in existing panther import

### Change 9b: First component - SelectList usage (lines 91-105)

#### Current Code:
```ts
                  const options = getSelectOptions(
                    (
                      keyedReplicantOptions as Extract<
                        typeof keyedReplicantOptions,
                        { status: "ok" }
                      >
                    ).possibleValues,
                  ).map((opt) => ({
                    ...opt,
                    label:
                      p.replicateBy === "indicator_common_id" ||
                      p.replicateBy === "strat"
                        ? translateIndicatorId(opt.value).toUpperCase()
                        : opt.label,
                  }));
```

#### New Code:
```ts
                  const options = getSelectOptionsFromIdLabel(
                    (
                      keyedReplicantOptions as Extract<
                        typeof keyedReplicantOptions,
                        { status: "ok" }
                      >
                    ).possibleValues,
                  );
```

#### What Changed:
- Use `getSelectOptionsFromIdLabel` instead of `getSelectOptions`
- Remove the `.map()` that was manually translating indicator IDs (labels now come from server)

### Change 9c: Second component - Select with possibleValues.map (lines 186-205)

#### Current Code:
```ts
                const possibleValues = (
                  keyedReplicantOptions as Extract<
                    typeof keyedReplicantOptions,
                    { status: "ok" }
                  >
                ).possibleValues;

                return (
                  <Select
                    options={possibleValues.map((pv: string) => {
                      return {
                        value: pv,
                        label:
                          p.replicateBy === "indicator_common_id"
                            ? translateIndicatorId(pv).toUpperCase()
                            : pv,
                      };
                    })}
                    value={p.selectedReplicantValue}
                    onChange={(v) => p.setSelectedReplicant(v, possibleValues)}
```

#### New Code:
```ts
                const possibleValues = (
                  keyedReplicantOptions as Extract<
                    typeof keyedReplicantOptions,
                    { status: "ok" }
                  >
                ).possibleValues;

                return (
                  <Select
                    options={getSelectOptionsFromIdLabel(possibleValues)}
                    value={p.selectedReplicantValue}
                    onChange={(v) => p.setSelectedReplicant(v, possibleValues.map(pv => pv.id))}
```

#### What Changed:
- Line 195: `possibleValues.map((pv: string) => ...)` → `getSelectOptionsFromIdLabel(possibleValues)`
- Line 205: `p.setSelectedReplicant(v, possibleValues)` → `p.setSelectedReplicant(v, possibleValues.map(pv => pv.id))`

### Change 9d: createEffect with state.data.possibleValues (lines 153-157)

#### Current Code:
```ts
    if (state.status === "ready" && state.data.status === "ok") {
      p.setSelectedReplicant(
        p.selectedReplicantValue || "",
        state.data.possibleValues,
      );
    }
```

#### New Code:
```ts
    if (state.status === "ready" && state.data.status === "ok") {
      p.setSelectedReplicant(
        p.selectedReplicantValue || "",
        state.data.possibleValues.map(pv => pv.id),
      );
    }
```

#### What Changed:
- Line 156: `state.data.possibleValues` → `state.data.possibleValues.map(pv => pv.id)`

---

## Change 10: Update t2_presentation_objects.ts

**File**: `client/src/state/project/t2_presentation_objects.ts`  
**Lines**: 325-338

### Current Code:
```ts
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (!selected || !validValues.includes(selected)) {
        if (validValues.length === 0) {
          yield {
            status: "error",
            err: t3({
              en: `[INFO] No values available for "${replicateBy}"`,
              fr: `[INFO] Aucune valeur disponible pour "${replicateBy}"`,
            }),
          };
          return;
        }
        config.d.selectedReplicantValue = validValues[0];
```

### New Code:
```ts
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (!selected || !validValues.some(v => v.id === selected)) {
        if (validValues.length === 0) {
          yield {
            status: "error",
            err: t3({
              en: `[INFO] No values available for "${replicateBy}"`,
              fr: `[INFO] Aucune valeur disponible pour "${replicateBy}"`,
            }),
          };
          return;
        }
        config.d.selectedReplicantValue = validValues[0].id;
```

### What Changed:
- Line 327: `!validValues.includes(selected)` → `!validValues.some(v => v.id === selected)`
- Line 338: `validValues[0]` → `validValues[0].id`

---

## Change 11: Update resolve_figure_from_metric.ts

**File**: `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts`  
**Lines**: 55-61

### Current Code:
```ts
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (selected && !validValues.includes(selected)) {
        throw new Error(
          `Invalid replicant value "${selected}" for metric "${metricId}". ` +
          `Valid values: ${validValues.join(", ")}`,
        );
      }
```

### New Code:
```ts
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (selected && !validValues.some(v => v.id === selected)) {
        throw new Error(
          `Invalid replicant value "${selected}" for metric "${metricId}". ` +
          `Valid values: ${validValues.map(v => v.label).join(", ")}`,
        );
      }
```

### What Changed:
- Line 57: `!validValues.includes(selected)` → `!validValues.some(v => v.id === selected)`
- Line 60: `validValues.join(", ")` → `validValues.map(v => v.label).join(", ")`

---

## Change 12: Update dashboard_editor.tsx

**File**: `client/src/components/dashboards/dashboard_editor.tsx`  
**Lines**: 141-146

### Current Code:
```ts
      if (
        optRes.success &&
        optRes.data.status === "ok"
      ) {
        allReplicants = optRes.data.possibleValues;
      }
```

### New Code:
```ts
      if (
        optRes.success &&
        optRes.data.status === "ok"
      ) {
        allReplicants = optRes.data.possibleValues.map(pv => pv.id);
      }
```

### What Changed:
- Line 145: `optRes.data.possibleValues` → `optRes.data.possibleValues.map(pv => pv.id)`

Note: The variable `allReplicants` is typed as `string[]` and is used downstream as IDs, so we extract just the IDs.

---

## Change 13: Update content_validators.ts

**File**: `client/src/components/project_ai/ai_tools/validators/content_validators.ts`  
**Lines**: 174-181

### Current Code:
```ts
    const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.disOpt];
    if (dimValues?.status === "ok") {
      const invalid = filter.values.filter(v => !dimValues.values.some(dv => String(dv) === String(v)));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid filter value(s) for "${filter.disOpt}": ${invalid.join(", ")}. ` +
          `Valid: ${dimValues.values.join(", ")}`
        );
      }
    }
```

### New Code:
```ts
    const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.disOpt];
    if (dimValues?.status === "ok") {
      const invalid = filter.values.filter(v => !dimValues.values.some(dv => dv.id === String(v)));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid filter value(s) for "${filter.disOpt}": ${invalid.join(", ")}. ` +
          `Valid: ${dimValues.values.map(v => v.label).join(", ")}`
        );
      }
    }
```

### What Changed:
- Line 176: `String(dv) === String(v)` → `dv.id === String(v)`
- Line 180: `dimValues.values.join(", ")` → `dimValues.values.map(v => v.label).join(", ")`

---

## Helper Available

The panther library already has a helper for converting `{id, label}[]` to select options:

**File**: `panther/_303_components/form_inputs/utils.ts`  
**Lines**: 32-38

```ts
export function getSelectOptionsFromIdLabel(
  arr: { id: string; label: string }[],
): SelectOption<string>[] {
  return arr.map((v) => {
    return { value: v.id, label: v.label };
  });
}
```

Use this in ReplicateByOptions.tsx instead of manually mapping.

---

## Summary of Data Flow

```
1. Client requests filter options for a presentation object

2. Server: getResultsValueInfoForPresentationObject()
   - Calls resolveMetricById() → returns { resultsValue, moduleId }
   - Passes moduleId to getResultsObjectVariableInfoCore()

3. Server: getResultsObjectVariableInfoCore()
   - For each disaggregation option, calls getPossibleValues(moduleId)

4. Server: getPossibleValues()
   - Queries database for distinct values (IDs)
   - If disaggregationOption is "indicator_common_id":
     - Calls getIndicatorMetadata(moduleId) to get id→label mapping
     - Maps IDs to labels
   - Else:
     - Uses ID as label
   - Returns { id, label }[]

5. Client components:
   - Display label (opt.label / v.label)
   - Store/match by id (opt.id / v.id)
   - Config still stores string IDs
```

---

## What getIndicatorMetadata Handles

The existing `getIndicatorMetadata` function already handles all indicator types:

1. **HFA modules**: Queries `hfa_indicators` table, uses `var_name` as id, `definition` as label
2. **ICEH modules**: Gets from iceh snapshot, uses `indicatorCode` as id, `indicatorName` as label
3. **HMIS modules**: Queries project `indicators` table, uses `indicator_common_id` as id, `indicator_common_label` as label; also includes calculated indicators

No changes needed to `get_indicator_metadata.ts`.

---

## Testing Checklist

- [ ] Filter UI shows labels instead of IDs for indicator_common_id
- [ ] Clicking a label chip stores the ID in config (verify in network/state)
- [ ] Selected state correctly highlights chips (matched by ID)
- [ ] HFA indicator labels display correctly
- [ ] ICEH indicator labels display correctly
- [ ] HMIS indicator labels display correctly
- [ ] Non-indicator filters (facility_type, admin_area_2, etc.) still work (ID = label)
- [ ] Replicant dropdown shows labels, stores IDs
- [ ] Dashboard editor replicant selection works
- [ ] AI content validation shows labels in error messages
- [ ] AI figure resolution validates correctly
- [ ] TypeScript compiles without errors
