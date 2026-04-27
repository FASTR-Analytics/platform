# Plan: Metric Picker Stepper for Add Visualization

## Problem

Current "Add Visualization" UX is poor:
- Single flat list of metrics (RadioGroup → Select when >6 items)
- No categorization by module
- No search
- Metric selection, presets, type, and disaggregations all crammed together

## Solution

Replace with a 3-step stepper modal:

1. **Select Metric** - Two-panel browser with modules and search
2. **Choose Visualization Type** - Presets (if available) + custom type options
3. **Configure** - Disaggregation selection (pre-filled if preset, editable if custom)

### Step Skipping Rules

**Step 3 is skipped when:**

- User selected a preset in Step 2

Presets are fully-specified configurations (`config.d.disaggregateBy` defines all disaggregations). There's nothing to configure - skip straight to Create.

When Step 3 is skipped, the "Create" button appears on Step 2 instead of "Next".

**Step 1 is skipped when:**

- Modal opened with `preselectedMetric` prop (from Metrics page "Visualize" button)

When Step 1 is skipped, the stepper progress bar shows Step 1 as completed (not hidden). User can click back to Step 1 to change their selection.

---

## Step 1: Select Metric

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1 of 3: Select Metric                          [progress bar] │
├─────────────────────────────────────────────────────────────────────┤
│ 🔍 Search metrics...                                                │
├──────────────────────┬──────────────────────────────────────────────┤
│                      │                                              │
│ ● All modules (24)   │  ┌────────────────────────────────────────┐  │
│                      │  │ Stockout rate                          │  │
│ ○ Data quality       │  │ 📊 period · area · facility  [3 presets]│  │
│   assessment (8)     │  │ ○                                      │  │
│                      │  └────────────────────────────────────────┘  │
│ ○ Data quality       │                                              │
│   adjustments (4)    │  ┌────────────────────────────────────────┐  │
│                      │  │ Reporting completeness                 │  │
│ ○ Service            │  │ 📊 period · area           [1 preset]  │  │
│   utilization (6)    │  │ ○                                      │  │
│                      │  └────────────────────────────────────────┘  │
│ ○ Coverage           │                                              │
│   estimates (4)      │  ┌────────────────────────────────────────┐  │
│                      │  │ Adjusted outpatient visits             │  │
│ ○ Health facility    │  │ 📊 period · area · facility            │  │
│   assessment (2)     │  │   ├─ Default                       ○   │  │
│                      │  │   └─ Per capita                    ○   │  │
│                      │  └────────────────────────────────────────┘  │
│                      │                                              │
├──────────────────────┴──────────────────────────────────────────────┤
│                                                      [Cancel] [Next]│
└─────────────────────────────────────────────────────────────────────┘
```

### Behavior

- **Left panel**: Module list from `projectModules`, with metric counts
- **Right panel**: Metric cards for selected module (or all)
- **Search**: Filters across all modules, highlights matches
  - When search is active, auto-switch to "All modules"
  - When search is cleared, restore previous module filter
- **Metric card shows**:
  - Label (bold)
  - Disaggregation tags (period, area, facility, etc.)
  - Preset count badge if `vizPresets.length > 0`
  - Variants inline if `variants.length > 1` — each variant has its own radio button
  - Status indicator (ready = normal, not ready = grayed with tooltip)
- **Variant selection**: Click variant radio directly to select. Parent label is grouping header, not selectable.
- **Not-ready metrics**: Shown grayed out with tooltip explaining why (module not run, etc.). Not hidden — discoverability matters.
- **Next enabled**: When a metric (or variant) is selected
- **On metric change**: Reset Step 2 and Step 3 selections (preset, type, disaggregations)

### Data

Reuse pattern from `project_metrics.tsx`:

```typescript
type MetricsByModule = {
  moduleId: ModuleId;
  moduleLabel: string;
  metricGroups: MetricGroup[]; // grouped by label, contains variants
};

function organizeMetrics(metrics: MetricWithStatus[], modules: InstalledModuleSummary[]): MetricsByModule[]
```

---

## Step 2: Choose Visualization Type

### Layout - With Presets

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2 of 3: Choose Visualization Type              [progress bar] │
├─────────────────────────────────────────────────────────────────────┤
│ Metric: Stockout rate                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Recommended                                                         │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐              │
│ │   [map img]   │ │  [chart img]  │ │  [trend img]  │              │
│ │               │ │               │ │               │              │
│ │  By district  │ │   Monthly     │ │    Yearly     │              │
│ │      ○        │ │      ○        │ │      ○        │              │
│ └───────────────┘ └───────────────┘ └───────────────┘              │
│                                                                     │
│ ─────────────────────────── or ────────────────────────────────────│
│                                                                     │
│ Build custom                                                        │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│ │  Table  │ │  Time   │ │  Bar    │ │   Map   │                    │
│ │   ○     │ │ series  │ │  chart  │ │    ○    │                    │
│ │         │ │   ○     │ │   ○     │ │         │                    │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                              [Back] [Cancel] [Next] │
└─────────────────────────────────────────────────────────────────────┘
```

### Layout - No Presets

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2 of 3: Choose Visualization Type              [progress bar] │
├─────────────────────────────────────────────────────────────────────┤
│ Metric: Adjusted outpatient visits - Per capita                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Choose visualization type                                           │
│                                                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│ │   [icon]    │ │   [icon]    │ │   [icon]    │ │   [icon]    │    │
│ │             │ │             │ │             │ │             │    │
│ │    Table    │ │ Time series │ │  Bar chart  │ │     Map     │    │
│ │      ○      │ │      ○      │ │      ○      │ │      ○      │    │
│ │             │ │  (grayed)   │ │             │ │  (grayed)   │    │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │
│                                                                     │
│ ⓘ Time series requires period disaggregation                       │
│ ⓘ Map requires area disaggregation                                 │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                              [Back] [Cancel] [Next] │
└─────────────────────────────────────────────────────────────────────┘
```

### Behavior

- **If metric has presets**: Show preset grid (reuse `PresetSelector` component) + custom type options
- **If no presets**: Show only type options
- **Gray out unavailable types**: Based on metric's `disaggregationOptions`
- **Selection state**:
  - `selectedPresetId?: string` - if preset chosen
  - `selectedType?: PresentationOption` - if custom type chosen
  - These are mutually exclusive
- **Next enabled**: When preset OR type is selected

---

## Step 3: Configure

### Layout - From Preset

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3 of 3: Configure                              [progress bar] │
├─────────────────────────────────────────────────────────────────────┤
│ Metric: Stockout rate                                               │
│ Starting from: By district (preset)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Disaggregations (from preset)                                       │
│                                                                     │
│ ☑ Admin area level 2 (required)                                    │
│ ☐ Period                                                           │
│ ☐ Facility type                                                    │
│                                                                     │
│ ⓘ You can adjust these after creating the visualization            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                            [Back] [Cancel] [Create] │
└─────────────────────────────────────────────────────────────────────┘
```

### Layout - From Custom Type

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3 of 3: Configure                              [progress bar] │
├─────────────────────────────────────────────────────────────────────┤
│ Metric: Stockout rate                                               │
│ Type: Bar chart                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Disaggregate by                                                     │
│                                                                     │
│ ☑ Period (required for time-based analysis)                        │
│ ☐ Admin area level 2                                               │
│ ☐ Admin area level 3                                               │
│ ☐ Facility type                                                    │
│ ☐ Facility ownership                                               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                            [Back] [Cancel] [Create] │
└─────────────────────────────────────────────────────────────────────┘
```

### Behavior

- **From preset**: Show preset's disaggregations as pre-selected, allow modification
- **From custom**: Show all valid disaggregations for the selected type
- **Required disaggregations**: Locked checkbox with explanation
- **Create enabled**: Always (disaggregations have sensible defaults)
- **Skip this step**: If preset defines all disaggregations with no optional ones, skip Step 3 entirely (Create button appears on Step 2)

---

## Components

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `MetricPickerStep` | `client/src/components/project/add_visualization/metric_picker_step.tsx` | Step 1: Two-panel metric browser |
| `TypePickerStep` | `client/src/components/project/add_visualization/type_picker_step.tsx` | Step 2: Presets + type selection |
| `ConfigureStep` | `client/src/components/project/add_visualization/configure_step.tsx` | Step 3: Disaggregation selection |
| `ModuleSidebar` | `client/src/components/project/add_visualization/module_sidebar.tsx` | Left panel for Step 1 |
| `MetricCard` | `client/src/components/project/add_visualization/metric_card.tsx` | Metric display card for Step 1 |
| `TypeCard` | `client/src/components/project/add_visualization/type_card.tsx` | Visualization type option card |

### Modified Components

| Component | Changes |
|-----------|---------|
| `AddVisualization` | Rewrite to use stepper, orchestrate 3 steps |
| `PresetSelector` | Minor: ensure works standalone in Step 2 |

### Reused from Panther

- `getStepper()` + `StepperProgressBar` or `StepperChipsWithTitles`
- `ModalContainer` (already using via `AlertFormHolder`)
- `Checkbox`, `RadioGroup` (already using)

---

## Shared Utilities

### New: `groupMetricsByModule`

```typescript
// lib/group_metrics.ts

export type MetricsByModule = {
  moduleId: ModuleId;
  moduleLabel: string;
  metrics: MetricWithStatus[]; // flat list, not grouped by label
  metricGroups: MetricGroup[]; // grouped by label for variant display
};

export function groupMetricsByModule(
  metrics: MetricWithStatus[],
  modules: InstalledModuleSummary[],
  options?: { onlyReady?: boolean }
): MetricsByModule[];
```

### Existing: Reuse

- `groupMetricsByLabel` - for variant grouping within module
- `get_PRESENTATION_SELECT_OPTIONS` - for valid type options
- `getStartingConfigForPresentationObject` - for building config

---

## State Management

### Stepper State

```typescript
// Skip Step 3 if preset is selected (presets are fully-specified configs)
const shouldSkipStep3 = () => !!selectedPresetId();

// minStep is always 0, but Step 1 shows as "completed" if preselectedMetric
const hasPreselectedMetric = () => !!preselectedMetric;

const stepper = getStepper(null, {
  minStep: 0,
  maxStep: shouldSkipStep3() ? 1 : 2, // 0=Metric, 1=Type, 2=Configure
  initialStep: hasPreselectedMetric() ? 1 : 0, // Start at Step 2 if metric preselected
  getValidation: (step) => ({
    canGoPrev: step > 0, // Can always go back to Step 1, even if preselected
    canGoNext: step === 0 ? !!selectedMetricId()
             : step === 1 ? !!(selectedPresetId() || selectedType())
             : true,
  }),
});

// Progress bar shows "Step X of Y" where Y is dynamic:
// - "Step 2 of 2" when preset selected (Step 3 skipped)
// - "Step 2 of 3" when custom type selected
const totalSteps = () => shouldSkipStep3() ? 2 : 3;
```

### Selection State

```typescript
// Step 1
const [selectedModuleFilter, setSelectedModuleFilter] = createSignal<ModuleId | "all">("all");
const [searchText, setSearchText] = createSignal("");
const [selectedMetricId, setSelectedMetricId] = createSignal<string>("");

// Step 2
const [selectedPresetId, setSelectedPresetId] = createSignal<string | undefined>();
const [selectedType, setSelectedType] = createSignal<PresentationOption | undefined>();

// Step 3
const [selectedDisaggregations, setSelectedDisaggregations] = createSignal<DisaggregationOption[]>([]);
```

---

## Implementation Order

### Phase 1: Foundation

1. Add `groupMetricsByModule` to `lib/group_metrics.ts`
2. Create folder `client/src/components/project/add_visualization/`
3. Move existing `add_visualization.tsx` → `add_visualization_old.tsx` (backup)

### Phase 2: Step Components

1. Create `MetricCard` component
2. Create `ModuleSidebar` component
3. Create `MetricPickerStep` (Step 1)
4. Create `TypeCard` component
5. Create `TypePickerStep` (Step 2)
6. Create `ConfigureStep` (Step 3)

### Phase 3: Integration

1. Create new `AddVisualization` with stepper orchestration
2. Add Enter key to confirm current step (don't defer keyboard support)
3. Wire up to existing entry points (`project_visualizations.tsx`, `project_metrics.tsx`)
4. Test both paths: preset and custom
5. Test Step 3 skip logic
6. Remove old backup file

### Phase 4: Polish

1. Add search highlighting
2. Add arrow key navigation in metric list
3. Ensure proper focus management between steps
4. Test with real data (many modules, many metrics)

---

## Open Questions

1. **Step indicator style**: `StepperProgressBar` (minimal) or `StepperChipsWithTitles` (more prominent)?
   - Recommendation: `StepperChipsWithTitles` with labels "Metric", "Type", "Configure"

## Resolved Decisions

1. **Modal width**: Use "xl" (1000px). Two-panel layouts don't work well in 800px.

2. **Step 3 for presets**: Skip Step 3 entirely when preset selected. Presets are fully-specified configs — nothing to configure. Create button appears on Step 2.

3. **Search + module filter**: Auto-switch to "All modules" when search is active. Restore previous filter when search cleared.

4. **Variant selection**: Click variant radio directly. Parent label is grouping header only.

5. **Not-ready metrics**: Show grayed out with tooltip. Don't hide — discoverability matters.

6. **Back navigation**: Reset Step 2/3 selections when metric changes in Step 1.

7. **Keyboard support**: Enter to confirm from Phase 2 (not deferred to Phase 4).

8. **Progress bar text**: Dynamic based on path. Shows "Step 2 of 2" when preset selected, "Step 2 of 3" for custom path.

9. **Preselected metric**: Step 1 shows as completed in progress bar, not hidden. User can navigate back to change selection.

---

## Success Criteria

- [ ] User can browse metrics by module
- [ ] User can search across all modules (auto-switches to "All modules")
- [ ] Each metric shows disaggregation tags, preset count, and status
- [ ] Variants are visible inline with direct selection (not nested)
- [ ] Not-ready metrics shown grayed with tooltip
- [ ] Preset path: 4 clicks (metric → Next → preset → Create) — Step 3 always skipped for presets
- [ ] Preset path with preselected metric: 2 clicks (preset → Create)
- [ ] Custom path: 6 clicks (metric → Next → type → Next → disaggregations → Create)
- [ ] Works when launched from Metrics page with preselected metric (skip Step 1)
- [ ] Back navigation resets downstream selections
- [ ] Enter key confirms current step
- [ ] No regression in functionality
