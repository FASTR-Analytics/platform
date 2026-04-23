# Plan: Unify Effective Dimension Logic (V2 - Minimal Churn)

Extends `getEffectivePOConfig` to return richer information, enabling editor UX improvements without changing downstream function signatures.

## Problem

1. **Editor can't show disabled state** — Currently filters out ineffective disaggregators; can't show them disabled with explanation
2. **Scattered `getFilteredValueProps().length > 1` checks** — duplicated in `_3_disaggregation.tsx` and elsewhere

## Solution (V2)

Update `getEffectivePOConfig` return type only. Downstream functions (`getDisaggregatorDisplayProp`, data config builders) continue to work as before — they still call `getFilteredValueProps` internally.

```ts
type EffectivePOConfigResult = {
  config: PresentationObjectConfig;
  effectiveValueProps: string[];
  hasMultipleValueProps: boolean;
  ineffectiveDisaggregators: {
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

**What changes:**
- `getEffectivePOConfig` returns richer object
- 2 existing callers updated to destructure `.config`
- Editor uses `ineffectiveDisaggregators` for disabled UX

**What stays the same:**
- `getDisaggregatorDisplayProp` signature unchanged
- `hasDuplicateDisaggregatorDisplayOptions` signature unchanged
- `getNextAvailableDisaggregationDisplayOption` signature unchanged
- All data config builders unchanged
- `getFilteredValueProps` still called internally by these functions

**Tradeoff:** Less elegant (scattered `getFilteredValueProps` calls remain), but dramatically reduced scope and risk.

---

## Part 1: Update getEffectivePOConfig

### Task 1.1: Update `lib/normalize_po_config.ts`

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
    if (hasOnlyOneFilteredValue(config, d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "filtered_to_one_value" });
      return false;
    }
    
    if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "single_period" });
      return false;
    }
    
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

Already exports `* from "./normalize_po_config.ts"` — types auto-export.

### Task 1.3: Update `visualization_editor_inner.tsx`

```ts
// Before (~line 793)
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
// Before (~line 55)
const effectiveConfig = getEffectivePOConfig(config, ih.dateRange);

// After
const { config: effectiveConfig } = getEffectivePOConfig(config, {
  dateRange: ih.dateRange,
});
```

Note: We don't pass `valueProps` here — the data config builders still call `getFilteredValueProps` internally, which is fine.

---

## Part 2: Editor Disabled State UX

### Task 2.1: Update `presentation_object_editor_panel_data.tsx`

Replace the manual filtering logic with `getEffectivePOConfig`:

```ts
// Before
const TIME_COLUMNS = new Set(["period_id", "quarter_id", "year", "month"]);

const allowedDisaggregationOptions = () => {
  const resolved = resolvedPeriodBounds();
  const singlePeriod = !!resolved && resolved.min === resolved.max;
  const singleYear = !!resolved && Math.floor(resolved.min / 100) === Math.floor(resolved.max / 100);
  return allowedFilterOptions().filter((disOpt) => {
    if (hasOnlyOneFilteredValue(p.tempConfig, disOpt.value)) return false;
    if (singlePeriod && TIME_COLUMNS.has(disOpt.value)) return false;
    if (singleYear && disOpt.value === "year") return false;
    return true;
  });
};

// After
const allDisaggregationOptions = () => allowedFilterOptions();

const effectivePOConfigResult = () => {
  const resolved = resolvedPeriodBounds();
  return getEffectivePOConfig(p.tempConfig, {
    dateRange: resolved,
    valueProps: p.poDetail.resultsValue.valueProps,
  });
};
```

Remove `TIME_COLUMNS` and `hasOnlyOneFilteredValue` import (no longer needed here).

Pass to `DisaggregationSection`:

```tsx
<DisaggregationSection
  poDetail={p.poDetail}
  tempConfig={p.tempConfig}
  setTempConfig={p.setTempConfig}
  allDisaggregationOptions={allDisaggregationOptions()}
  ineffectiveDisaggregators={effectivePOConfigResult().ineffectiveDisaggregators}
  hasMultipleValueProps={effectivePOConfigResult().hasMultipleValueProps}
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
  hasMultipleValueProps: boolean;
};

type DisaggregationOptionProps = {
  disOpt: DisaggregationSectionProps["allDisaggregationOptions"][number];
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
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
  const hasValuesFilter = () => 
    !!p.tempConfig.d.valuesFilter && p.tempConfig.d.valuesFilter.length > 0;

  return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">
        {t3(TC.display_disaggregate)}
      </div>
      
      <Show when={p.poDetail.resultsValue.valueProps.length > 1}>
        <Show
          when={p.hasMultipleValueProps}
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

## Comparison: V1 vs V2

| Aspect | V1 (Original) | V2 (This plan) |
|--------|---------------|----------------|
| Files modified | ~10 | ~5 |
| Signature changes | 6+ functions | 1 function |
| `getDisaggregatorDisplayProp` | Signature changed | Unchanged |
| Data config builders | Signature changed | Unchanged |
| `getFilteredValueProps` calls | Centralized | Still scattered |
| Risk | Medium | Low |
| Editor UX improvement | Yes | Yes |

---

## Testing

### Part 1
1. Renderer: Single-value dimensions stripped from display (unchanged behavior)
2. Editor: Duplicate check works with new return type

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
- `visualization_editor_inner.tsx`
- `get_figure_inputs_from_po.ts`
- `presentation_object_editor_panel_data.tsx`
- `_3_disaggregation.tsx`
- Translation file
