# Plan: Unify Effective Dimension Logic

Extends `getEffectivePOConfig` to handle both disaggregation dimensions AND the values dimension, returning both the stripped config and information about what was stripped.

## Problem

1. **Scattered logic** — "Is this dimension effective?" answered in multiple places with duplicated code
2. **Values dimension handled separately** — `getFilteredValueProps().length > 1` scattered across files
3. **Editor can't show disabled state** — Currently filters out ineffective disaggregators; can't show them disabled with explanation

## Solution

One function returns everything:

```ts
type EffectivePOConfigResult = {
  config: PresentationObjectConfig;           // stripped, for rendering
  effectiveValueProps: string[];              // filtered valueProps
  hasMultipleValueProps: boolean;             // convenience flag
  ineffectiveDisaggregators: {                // what was stripped and why
    disOpt: DisaggregationOption;
    reason: "filtered_to_one_value" | "single_period" | "single_year";
  }[];
};

function getEffectivePOConfig(
  config: PresentationObjectConfig,
  context?: {
    dateRange?: { min: number; max: number };
    valueProps?: string[];
  }
): EffectivePOConfigResult
```

- **Renderer** uses `config` (stripped)
- **Editor** uses `ineffectiveDisaggregators` to show disabled state with message
- **All logic in one place**

---

## Part 1: Update getEffectivePOConfig

### Task 1.1: Update `lib/normalize_po_config.ts`

Note: Reuses `hasOnlyOneFilteredValue` and `getFilteredValueProps` from `get_fetch_config_from_po.ts`. No circular dependency — that file doesn't import from here.

```ts
import { 
  getFilteredValueProps, 
  hasOnlyOneFilteredValue 
} from "./get_fetch_config_from_po.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";

export type IneffectiveReason = 
  | "filtered_to_one_value" 
  | "single_period" 
  | "single_year";

export type IneffectiveDisaggregator = {
  disOpt: DisaggregationOption;
  reason: IneffectiveReason;
};

export type EffectivePOConfigResult = {
  config: PresentationObjectConfig;
  effectiveValueProps: string[];
  hasMultipleValueProps: boolean;
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
};

const TIME_COLUMNS = new Set<string>(["period_id", "quarter_id", "year", "month"]);

export function getEffectivePOConfig(
  config: PresentationObjectConfig,
  context?: {
    dateRange?: { min: number; max: number };
    valueProps?: string[];
  }
): EffectivePOConfigResult {
  const dateRange = context?.dateRange;
  const valueProps = context?.valueProps;

  const singlePeriod = dateRange && dateRange.min === dateRange.max;
  const singleYear = dateRange && Math.floor(dateRange.min / 100) === Math.floor(dateRange.max / 100);

  const ineffectiveDisaggregators: IneffectiveDisaggregator[] = [];
  
  const effectiveDisaggregateBy = config.d.disaggregateBy.filter((d) => {
    // Check: filtered to one value
    if (hasOnlyOneFilteredValue(config, d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "filtered_to_one_value" });
      return false;
    }
    
    // Check: single period (runtime)
    if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "single_period" });
      return false;
    }
    
    // Check: single year (runtime)
    if (singleYear && d.disOpt === "year") {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "single_year" });
      return false;
    }
    
    return true;
  });

  const effectiveConfig: PresentationObjectConfig = {
    ...config,
    d: {
      ...config.d,
      disaggregateBy: effectiveDisaggregateBy,
    },
  };

  const effectiveValueProps = valueProps
    ? getFilteredValueProps(valueProps, config)
    : [];

  return {
    config: effectiveConfig,
    effectiveValueProps,
    hasMultipleValueProps: effectiveValueProps.length > 1,
    ineffectiveDisaggregators,
  };
}
```

### Task 1.2: Update `lib/mod.ts` exports

```ts
export * from "./normalize_po_config.ts";
// Types EffectivePOConfigResult, IneffectiveDisaggregator, IneffectiveReason are auto-exported
```

### Task 1.3: Update `visualization_editor_inner.tsx`

```ts
// Before
!hasDuplicateDisaggregatorDisplayOptions(
  p.poDetail.resultsValue,
  getEffectivePOConfig(tempConfig),
)

// After
!hasDuplicateDisaggregatorDisplayOptions(
  p.poDetail.resultsValue,
  getEffectivePOConfig(tempConfig).config,
)
```

### Task 1.4: Update `get_figure_inputs_from_po.ts`

```ts
// Before
const effectiveConfig = getEffectivePOConfig(config, ih.dateRange);

// After
const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(config, {
  dateRange: ih.dateRange,
  valueProps: resultsValue.valueProps,
});
```

### Task 1.5: Update `get_data_config_from_po.ts`

Pass `effectiveValueProps` from caller instead of calling `getFilteredValueProps` directly.

Update function signatures:

```ts
// Before
export function getTimeseriesJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  ...
)

// After  
export function getTimeseriesJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  ...
)
```

Inside each builder, replace:
```ts
// Before
valueProps: getFilteredValueProps(resultsValue.valueProps, config),

// After
valueProps: effectiveValueProps,
```

Same for: `getTableJsonDataConfigFromPresentationObjectConfig`, `getChartOVJsonDataConfigFromPresentationObjectConfig`, `getChartOHJsonDataConfigFromPresentationObjectConfig`, and `getMapJsonDataConfigFromPresentationObjectConfig` in `get_data_config_for_map.ts`.

**Note on `get_fetch_config_from_po.ts:70`**: This calls `getFilteredValueProps` for fetch-time column selection (what to request from DB). This is intentionally separate from render-time filtering:
- At fetch time, we don't have `dateRange` yet (it comes from fetched data)
- Fetch config only needs `valuesFilter` filtering, not full effective computation
- `getFilteredValueProps` stays as a utility; `getEffectivePOConfig` uses it internally
- No change needed to `getFetchConfigFromPO`

### Task 1.6: Update `get_disaggregator_display_prop.ts`

This file calls `getFilteredValueProps` in multiple places. Update all functions to receive `effectiveValueProps` as parameter:

**getDisaggregatorDisplayProp:**
```ts
// Before
export function getDisaggregatorDisplayProp(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  props: DisaggregationDisplayOption[]
): DisaggregationOption | "--v" | undefined {
  const filteredValueProps = getFilteredValueProps(resultsValue.valueProps, config);
  ...
}

// After
export function getDisaggregatorDisplayProp(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  props: DisaggregationDisplayOption[],
  effectiveValueProps: string[]
): DisaggregationOption | "--v" | undefined {
  // Use effectiveValueProps instead of calling getFilteredValueProps
  ...
}
```

**hasDuplicateDisaggregatorDisplayOptions:**
```ts
// Before
export function hasDuplicateDisaggregatorDisplayOptions(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig
)

// After
export function hasDuplicateDisaggregatorDisplayOptions(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[]
)
```

**getNextAvailableDisaggregationDisplayOption:**
```ts
// Before
export function getNextAvailableDisaggregationDisplayOption(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption
): DisaggregationDisplayOption {
  ...
  (resultsValue.valueProps.length === 1 ||
    possibleOpt.value !== config.d.valuesDisDisplayOpt)
  ...
}

// After
export function getNextAvailableDisaggregationDisplayOption(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption,
  effectiveValueProps: string[]
): DisaggregationDisplayOption {
  ...
  (effectiveValueProps.length <= 1 ||
    possibleOpt.value !== config.d.valuesDisDisplayOpt)
  ...
}
```

### Task 1.7: Update callers of get_disaggregator_display_prop functions

All callers need to pass `effectiveValueProps`. Main callers:
- `get_figure_inputs_from_po.ts` (already has it from Task 1.4)
- `visualization_editor_inner.tsx` (compute it for duplicate check)
- `_3_disaggregation.tsx` (passed from parent, see Part 2)
- `presentation_object_editor_panel_style.tsx` (passed from parent, see Task 2.1a)
- `lib/types/presentation_objects.ts:378` — `getStartingConfigForPresentationObject`

For `getStartingConfigForPresentationObject`, it's creating a fresh config with no `valuesFilter`, so all valueProps are effective:

```ts
const disDisplayOpt = getNextAvailableDisaggregationDisplayOption(
  resultsValue,
  startingConfig,
  disOpt.value,
  resultsValue.valueProps,  // no filter yet, all valueProps are effective
);
```

---

## Part 2: Editor Disabled State UX

### Task 2.1a: Update `presentation_object_editor_panel.tsx` (parent)

Compute `effectivePOConfigResult` once in the parent and pass to children:

```ts
import { getEffectivePOConfig, getPeriodFilterExactBounds } from "lib";

// Inside component:
const resolvedPeriodBounds = () => {
  const pf = p.tempConfig.d.periodFilter;
  if (!pf) return undefined;
  return getPeriodFilterExactBounds(pf, p.resultsValueInfo.periodBounds);
};

const effectivePOConfigResult = () => {
  return getEffectivePOConfig(p.tempConfig, {
    dateRange: resolvedPeriodBounds(),
    valueProps: p.poDetail.resultsValue.valueProps,
  });
};
```

Pass to children:

```tsx
<PresentationObjectEditorPanelData
  ...
  ineffectiveDisaggregators={effectivePOConfigResult().ineffectiveDisaggregators}
  effectiveValueProps={effectivePOConfigResult().effectiveValueProps}
  hasMultipleValueProps={effectivePOConfigResult().hasMultipleValueProps}
/>

<PresentationObjectEditorPanelStyle
  ...
  effectiveValueProps={effectivePOConfigResult().effectiveValueProps}
/>
```

### Task 2.1b: Update `presentation_object_editor_panel_style.tsx`

Add `effectiveValueProps` prop and use it in `usingCells()`:

```ts
type Props = {
  ...
  effectiveValueProps: string[];
};

const usingCells = () =>
  !!getDisaggregatorDisplayProp(p.poDetail.resultsValue, p.tempConfig, ["cell"], p.effectiveValueProps);
```

### Task 2.1: Update `presentation_object_editor_panel_data.tsx`

Now receives `ineffectiveDisaggregators`, `effectiveValueProps`, `hasMultipleValueProps` from parent (Task 2.1a).

Update props:

```ts
type Props = {
  ...
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
  effectiveValueProps: string[];
  hasMultipleValueProps: boolean;
};
```

Remove local computation logic:

```ts
// DELETE these:
const TIME_COLUMNS = new Set(["period_id", "quarter_id", "year", "month"]);
const resolvedPeriodBounds = () => { ... };
const allowedDisaggregationOptions = () => { ... };

// KEEP this:
const allDisaggregationOptions = () => allowedFilterOptions();
```

Pass to `DisaggregationSection`:

```tsx
<DisaggregationSection
  poDetail={p.poDetail}
  tempConfig={p.tempConfig}
  setTempConfig={p.setTempConfig}
  allDisaggregationOptions={allDisaggregationOptions()}
  ineffectiveDisaggregators={effectivePOConfigResult().ineffectiveDisaggregators}
  effectiveValueProps={effectivePOConfigResult().effectiveValueProps}
/>
```

### Task 2.2: Update `_3_disaggregation.tsx` props

```ts
type DisaggregationSectionProps = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  allDisaggregationOptions: ResultsValue["disaggregationOptions"];
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
  effectiveValueProps: string[];
};

type DisaggregationOptionProps = {
  disOpt: DisaggregationSectionProps["allDisaggregationOptions"][number];
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
  effectiveValueProps: string[];
};
```

### Task 2.3: Update `_3_disaggregation.tsx` — DisaggregationOption

```tsx
function DisaggregationOption(p: DisaggregationOptionProps) {
  const ineffective = () => 
    p.ineffectiveDisaggregators.find(d => d.disOpt === p.disOpt.value);

  const isEnabled = () =>
    p.tempConfig.d.disaggregateBy.some(d => d.disOpt === p.disOpt.value);

  const reasonMessage = (reason: IneffectiveReason) => {
    switch (reason) {
      case "filtered_to_one_value":
        return t3(TC.disaggregation_disabled_filtered_to_one);
      case "single_period":
        return t3(TC.disaggregation_disabled_single_period);
      case "single_year":
        return t3(TC.disaggregation_disabled_single_year);
    }
  };

  return (
    <Switch>
      <Match when={!p.disOpt.isRequired}>
        <div class="ui-spy-sm">
          <Checkbox
            label={t3(getDisplayDisaggregationLabel(p.disOpt.value))}
            checked={isEnabled()}
            disabled={!!ineffective()}
            onChange={(checked) => {
              if (checked) {
                const disDisplayOpt = getNextAvailableDisaggregationDisplayOption(
                  p.poDetail.resultsValue,
                  p.tempConfig,
                  p.disOpt.value,
                  p.effectiveValueProps,
                );
                p.setTempConfig("d", "disaggregateBy", (prev) => [
                  ...prev,
                  { disOpt: p.disOpt.value, disDisplayOpt },
                ]);
                p.setTempConfig("d", "selectedReplicantValue", undefined);
              } else {
                p.setTempConfig("d", "disaggregateBy", (prev) =>
                  prev.filter((d) => d.disOpt !== p.disOpt.value),
                );
                p.setTempConfig("d", "selectedReplicantValue", undefined);
              }
            }}
          />
          <Show when={isEnabled()}>
            <Show
              when={!ineffective()}
              fallback={
                <div class="text-xs text-warning pl-4 pb-4">
                  {reasonMessage(ineffective()!.reason)}
                </div>
              }
            >
              <DisaggregationOptionSettings
                disOpt={p.disOpt}
                keyedDis={p.tempConfig.d.disaggregateBy.find(d => d.disOpt === p.disOpt.value)!}
                tempConfig={p.tempConfig}
                setTempConfig={p.setTempConfig}
              />
            </Show>
          </Show>
        </div>
      </Match>
      <Match when={p.disOpt.isRequired}>
        <div class="ui-spy-sm">
          <Checkbox
            label={
              <div class="flex flex-wrap items-center gap-x-1">
                <span>{t3(getDisplayDisaggregationLabel(p.disOpt.value))}</span>
                <span class="text-xs">
                  ({t3(TC.required_for_visualization)})
                </span>
              </div>
            }
            checked={true}
            disabled={true}
            onChange={() => {}}
          />
          <Show
            when={p.tempConfig.d.disaggregateBy.find(d => d.disOpt === p.disOpt.value)}
            fallback={
              <div class="text-danger">
                {t3(TC.error_required_disaggregator)}
              </div>
            }
            keyed
          >
            {(keyedDis) => (
              <Show
                when={!ineffective()}
                fallback={
                  <div class="text-xs text-warning pl-4 pb-4">
                    {reasonMessage(ineffective()!.reason)}
                  </div>
                }
              >
                <DisaggregationOptionSettings
                  disOpt={p.disOpt}
                  keyedDis={keyedDis}
                  tempConfig={p.tempConfig}
                  setTempConfig={p.setTempConfig}
                />
              </Show>
            )}
          </Show>
        </div>
      </Match>
    </Switch>
  );
}
```

### Task 2.4: Update `_3_disaggregation.tsx` — DisaggregationSection

```tsx
export function DisaggregationSection(p: DisaggregationSectionProps) {
  const hasMultipleValueProps = () => p.effectiveValueProps.length > 1;

  const hasValuesFilter = () => 
    !!p.tempConfig.d.valuesFilter && p.tempConfig.d.valuesFilter.length > 0;

  return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">
        {t3(TC.display_disaggregate)}
      </div>
      
      <Show when={p.poDetail.resultsValue.valueProps.length > 1}>
        <Show
          when={hasMultipleValueProps()}
          fallback={
            <div class="ui-spy-sm pb-4">
              <Checkbox
                label={t3(TC.data_values)}
                checked={true}
                disabled={true}
                onChange={() => {}}
              />
              <Show when={hasValuesFilter()}>
                <div class="text-xs text-warning pl-4">
                  {t3(TC.disaggregation_disabled_filtered_to_one)}
                </div>
              </Show>
            </div>
          }
        >
          <DataValuesDisaggregation
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
          />
        </Show>
      </Show>

      <For each={p.allDisaggregationOptions}>
        {(disOpt) => (
          <DisaggregationOption
            disOpt={disOpt}
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            ineffectiveDisaggregators={p.ineffectiveDisaggregators}
            effectiveValueProps={p.effectiveValueProps}
          />
        )}
      </For>
    </div>
  );
}
```

### Task 2.5: Add translation keys

Add to translation file:

```ts
disaggregation_disabled_filtered_to_one: {
  en: "Disabled: filtered to single value",
  fr: "Désactivé : filtré sur une seule valeur"
},
disaggregation_disabled_single_period: {
  en: "Disabled: only one time period in range",
  fr: "Désactivé : une seule période dans la plage"
},
disaggregation_disabled_single_year: {
  en: "Disabled: only one year in range", 
  fr: "Désactivé : une seule année dans la plage"
},
```

---

## Testing

### Part 1
1. Renderer: Single-value dimensions stripped from display
2. Renderer: Single valueProps → no values dimension in legend/axes
3. Editor: Duplicate check works with new signature
4. All data config builders receive effectiveValueProps

### Part 2
1. Disaggregator filtered to 1 value → shows checked + disabled + "filtered to single value" message
2. Time disaggregator with single period → shows disabled + "single period" message
3. Change filter to 2+ values → dropdown reappears with preserved setting
4. Values filtered to 1 → shows disabled values section with message
5. Required disaggregators show same disabled pattern when ineffective

---

## Rollback

Revert changes to:
- `lib/normalize_po_config.ts`
- `lib/get_disaggregator_display_prop.ts`
- `lib/types/presentation_objects.ts`
- `lib/translate/common.ts`
- `client/src/components/visualization/visualization_editor_inner.tsx`
- `client/src/components/visualization/presentation_object_editor_panel.tsx`
- `client/src/components/visualization/presentation_object_editor_panel_data.tsx`
- `client/src/components/visualization/presentation_object_editor_panel_style.tsx`
- `client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx`
- `client/src/generate_visualization/get_figure_inputs_from_po.ts`
- `client/src/generate_visualization/get_data_config_from_po.ts`
- `client/src/generate_visualization/get_data_config_for_map.ts`
