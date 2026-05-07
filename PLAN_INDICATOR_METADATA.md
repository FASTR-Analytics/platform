# PLAN: Indicator Metadata Refactor + Scorecard Formatting

Unify `indicatorLabelReplacements` into a richer `indicatorMetadata` structure that supports both label lookups and scorecard formatting (thresholds, decimal places, format type).

**Motivation:** The current `indicatorLabelReplacements: Record<string, string>` is ad-hoc. Phase B of the scorecard plan needs threshold/format metadata per indicator. Rather than bolting on `calculatedIndicatorsSnapshot` separately, we unify into a single extensible structure.

---

## New Type

**File:** `lib/types/indicators.ts`

```ts
export type IndicatorMetadata = {
  id: string;
  label: string;
  // Only populated for calculated indicators (from snapshot):
  format_as?: "percent" | "number" | "rate_per_10k";
  decimal_places?: number;
  threshold_direction?: "higher_is_better" | "lower_is_better";
  threshold_green?: number;
  threshold_yellow?: number;
  group_label?: string;  // For future grouped column headers
};

// Helper to extract label map for backward-compatible usage
export function indicatorMetadataToLabelMap(
  metadata: IndicatorMetadata[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of metadata) {
    map[m.id] = m.label;
  }
  return map;
}
```

---

## Part 1: Server Changes

### 1.1 Rename and enrich `getIndicatorLabelReplacements`

**File:** `server/server_only_funcs_presentation_objects/get_indicator_label_replacements.ts`

Rename to `get_indicator_metadata.ts` with function `getIndicatorMetadata`.

**Current logic:**
- If HFA module → query `hfa_indicators`, return `{var_name: definition}`
- Else → query project `indicators` table, return `{indicator_common_id: indicator_common_label}`

**New logic:**
1. Start with base indicators (same queries as today)
2. If `calculated_indicators_snapshot` has rows, merge/override with richer data
3. Return `IndicatorMetadata[]`

```ts
export async function getIndicatorMetadata(
  mainDb: Sql,
  projectDb: Sql,
  moduleId: string,
): Promise<IndicatorMetadata[]> {
  const metadata: IndicatorMetadata[] = [];

  if (moduleId.toLowerCase().startsWith("hfa")) {
    // HFA indicators - label only
    const hfaRows = await mainDb<DBHfaIndicator[]>`SELECT * FROM hfa_indicators`;
    for (const row of hfaRows) {
      metadata.push({ id: row.var_name, label: row.definition });
    }
  } else {
    // HMIS indicators - label only initially
    const rawIndicators = await projectDb<DBIndicator_IN_PROJECT[]>`SELECT * FROM indicators`;
    for (const ind of rawIndicators) {
      if (ind.indicator_common_id && ind.indicator_common_label) {
        metadata.push({ id: ind.indicator_common_id, label: ind.indicator_common_label });
      }
    }

    // Merge calculated indicators snapshot (overwrites base entries)
    const snapshot = await getAllCalculatedIndicatorsFromSnapshot(projectDb);
    const metadataById = new Map(metadata.map(m => [m.id, m]));
    for (const ci of snapshot) {
      metadataById.set(ci.calculated_indicator_id, {
        id: ci.calculated_indicator_id,
        label: ci.label,
        format_as: ci.format_as,
        decimal_places: ci.decimal_places,
        threshold_direction: ci.threshold_direction,
        threshold_green: ci.threshold_green,
        threshold_yellow: ci.threshold_yellow,
        group_label: ci.group_label,
      });
    }
    return Array.from(metadataById.values());
  }

  return metadata;
}
```

### 1.2 Update `get_presentation_object_items.ts`

**File:** `server/server_only_funcs_presentation_objects/get_presentation_object_items.ts`

- Import `getIndicatorMetadata` instead of `getIndicatorLabelReplacements`
- Call `getIndicatorMetadata(mainDb, projectDb, moduleId)`
- Return `indicatorMetadata` in the response

**Lines 48-52 change from:**
```ts
const indicatorLabelReplacements = await getIndicatorLabelReplacements(
  mainDb,
  projectDb,
  moduleId,
);
```

**To:**
```ts
const indicatorMetadata = await getIndicatorMetadata(
  mainDb,
  projectDb,
  moduleId,
);
```

**Lines 146-155 change from:**
```ts
const ih: ItemsHolderPresentationObject = {
  ...
  indicatorLabelReplacements,
};
```

**To:**
```ts
const ih: ItemsHolderPresentationObject = {
  ...
  indicatorMetadata,
};
```

### 1.3 Update types

**File:** `lib/types/instance.ts`

Change `ItemsHolderPresentationObject`:

```ts
// OLD
indicatorLabelReplacements: Record<string, string>;

// NEW
indicatorMetadata: IndicatorMetadata[];
```

---

## Part 2: Client Changes

### 2.1 Update `get_figure_inputs_from_po.ts`

**File:** `client/src/generate_visualization/get_figure_inputs_from_po.ts`

This file passes `ih.indicatorLabelReplacements` to many functions. Options:

**Option A (minimal change):** Derive label map at top, pass as before
```ts
const indicatorLabelReplacements = indicatorMetadataToLabelMap(ih.indicatorMetadata);
// Then use indicatorLabelReplacements everywhere as before
```

**Option B (pass full metadata):** Thread `indicatorMetadata` through and let consumers extract what they need.

**Recommendation:** Option A for Part 2 (quick migration), then Option B for scorecard-specific paths that need threshold data.

**Changes:**
- Line 51 area: derive `indicatorLabelReplacements` from `ih.indicatorMetadata`
- All existing usages continue working

**For scorecard formatting (new):**
- Pass `ih.indicatorMetadata` to `getStyleFromPresentationObject` when `config.s.specialScorecardTable`

### 2.2 Update `get_data_config_from_po.ts`

**File:** `client/src/generate_visualization/get_data_config_from_po.ts`

No changes needed if we derive `indicatorLabelReplacements` in caller. The functions here receive `Record<string, string>` and continue to work.

### 2.3 Update `lib/utils.ts` (`withReplicant`)

**File:** `lib/utils.ts`

The `withReplicant` function signature takes `indicatorLabelReplacements: Record<string, string>`. 

**No change needed** — caller derives label map and passes it.

### 2.4 Update `get_style_from_po.ts`

**File:** `client/src/generate_visualization/get_style_from_po.ts`

Add optional parameter for scorecard:

```ts
export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
  indicatorMetadata?: IndicatorMetadata[],  // NEW - only needed for scorecard
): CustomFigureStyleOptions {
  if (config.s.specialScorecardTable && indicatorMetadata) {
    return buildScorecardStyle(config, indicatorMetadata, deckStyle);
  }
  // ... existing dispatch
}
```

---

## Part 3: Scorecard Style Builder

### 3.1 Add `specialScorecardTable` to config schema

**File:** `lib/types/_presentation_object_config.ts`

Add after line 61 (`specialDisruptionsChart`):
```ts
specialScorecardTable: z.boolean(),
```

**File:** `lib/types/presentation_object_defaults.ts`

Add to `DEFAULT_S_CONFIG`:
```ts
specialScorecardTable: false,
```

### 3.2 Undo migration block 18

**File:** `server/db/migrations/data_transforms/po_config.ts`

Block 18 currently deletes `specialScorecardTable`. Change to:
```ts
// Block 18: Fill specialScorecardTable default
if (!("specialScorecardTable" in s)) s.specialScorecardTable = false;
// Remove the delete statement
```

### 3.3 Create `_5_scorecard.ts`

**File:** `client/src/generate_visualization/get_style_from_po/_5_scorecard.ts`

```ts
import { CustomFigureStyleOptions, getFormatterFunc, TableCellInfo } from "panther";
import { _CF_LIGHTER_GREEN, _CF_LIGHTER_RED, _CF_LIGHTER_YELLOW, DeckStyleContext, IndicatorMetadata, PresentationObjectConfig } from "lib";
import { getTextStyle, getTableLayoutStyle } from "./_0_common";

function scaleValueForFormat(rawValue: number, formatAs: string): number {
  if (formatAs === "percent") return rawValue * 100;
  if (formatAs === "rate_per_10k") return rawValue * 10000;
  return rawValue;
}

function getScorecardCutoffColor(
  direction: "higher_is_better" | "lower_is_better",
  green: number,
  yellow: number,
  scaledValue: number,
): string {
  if (direction === "higher_is_better") {
    if (scaledValue >= green) return _CF_LIGHTER_GREEN;
    if (scaledValue >= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  } else {
    if (scaledValue <= green) return _CF_LIGHTER_GREEN;
    if (scaledValue <= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  }
}

function formatScorecardValue(
  rawValue: number,
  formatAs: "percent" | "number" | "rate_per_10k",
  decimalPlaces: number,
): string {
  const scaled = scaleValueForFormat(rawValue, formatAs);
  const formatted = scaled.toFixed(decimalPlaces);
  if (formatAs === "percent") return `${formatted}%`;
  return formatted;
}

export function buildScorecardStyle(
  config: PresentationObjectConfig,
  indicatorMetadata: IndicatorMetadata[],
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  const metadataById = new Map(indicatorMetadata.map(m => [m.id, m]));

  return {
    scale: config.s.scale,
    text: getTextStyle(config, deckStyle),
    surrounds: { legendPosition: config.s.hideLegend ? "none" : undefined },
    grid: { showGrid: false },
    content: {
      tableCells: {
        func: (info: TableCellInfo) => {
          const meta = metadataById.get(info.colHeader);
          if (meta?.threshold_direction && info.valueAsNumber !== undefined) {
            const scaled = scaleValueForFormat(info.valueAsNumber, meta.format_as ?? "number");
            return {
              backgroundColor: getScorecardCutoffColor(
                meta.threshold_direction,
                meta.threshold_green ?? 0,
                meta.threshold_yellow ?? 0,
                scaled,
              ),
              textColorStrategy: { ifLight: "baseContent", ifDark: "base100" },
            };
          }
          return { backgroundColor: "none" };
        },
        textFormatter: (info: TableCellInfo) => {
          const meta = metadataById.get(info.colHeader);
          if (meta?.format_as && info.valueAsNumber !== undefined) {
            return formatScorecardValue(
              info.valueAsNumber,
              meta.format_as,
              meta.decimal_places ?? 0,
            );
          }
          return String(info.value);
        },
      },
    },
    table: getTableLayoutStyle(config),
  };
}
```

### 3.4 Scorecard legend

**File:** `client/src/generate_visualization/conditional_formatting.ts`

Add to `getLegendFromConfig` (around line 74):

```ts
if (config.s.specialScorecardTable) {
  return [
    { label: t3({ en: "On track", fr: "En bonne voie" }), color: _CF_LIGHTER_GREEN },
    { label: t3({ en: "Progress needed", fr: "Progrès nécessaire" }), color: _CF_LIGHTER_YELLOW },
    { label: t3({ en: "Not on track", fr: "Pas en bonne voie" }), color: _CF_LIGHTER_RED },
  ];
}
```

---

## Part 4: HMIS Display (Separate Context)

**File:** `server/db/instance/dataset_hmis.ts`

The `ItemsHolderDatasetHmisDisplay` type also has `indicatorLabelReplacements`. This is a **different context** (HMIS data preview, not presentation objects).

**Decision:** Leave as-is for now. This is not used for visualization rendering that needs thresholds. Can migrate later if needed.

**Affected type:** `lib/types/instance.ts` line 387 — keep `indicatorLabelReplacements` on `ItemsHolderDatasetHmisDisplay`.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `lib/types/indicators.ts` | Add `IndicatorMetadata` type, helper function |
| `lib/types/instance.ts` | Change `ItemsHolderPresentationObject.indicatorLabelReplacements` → `indicatorMetadata` |
| `lib/types/_presentation_object_config.ts` | Add `specialScorecardTable: z.boolean()` |
| `lib/types/presentation_object_defaults.ts` | Add `specialScorecardTable: false` |
| `server/server_only_funcs_presentation_objects/get_indicator_label_replacements.ts` | Rename to `get_indicator_metadata.ts`, return `IndicatorMetadata[]` |
| `server/server_only_funcs_presentation_objects/get_presentation_object_items.ts` | Use new function, return `indicatorMetadata` |
| `server/db/migrations/data_transforms/po_config.ts` | Block 18: fill default instead of delete |
| `client/src/generate_visualization/get_figure_inputs_from_po.ts` | Derive label map from metadata, pass metadata to scorecard style |
| `client/src/generate_visualization/get_style_from_po.ts` | Add `indicatorMetadata` param, dispatch to scorecard |
| `client/src/generate_visualization/get_style_from_po/_5_scorecard.ts` | **NEW** — scorecard style builder |
| `client/src/generate_visualization/conditional_formatting.ts` | Add scorecard legend case |

---

## What Does NOT Change

- `lib/utils.ts` (`withReplicant`) — caller derives label map
- `client/src/generate_visualization/get_data_config_from_po.ts` — receives label map as before
- `client/src/generate_visualization/get_data_config_for_map.ts` — receives label map as before
- `server/db/instance/dataset_hmis.ts` — separate context, keep as-is
- `lib/types/instance.ts` `ItemsHolderDatasetHmisDisplay` — keep existing `indicatorLabelReplacements`

---

## Migration Path

1. **No database migration needed** — `indicatorMetadata` is computed at runtime from existing tables
2. **No breaking API changes** — response shape changes but only TypeScript types affected
3. **Backward compatible via helper** — `indicatorMetadataToLabelMap()` lets existing code work unchanged

---

## Testing Checklist

- [ ] Regular PO renders with indicator labels (non-scorecard)
- [ ] HFA module POs still work
- [ ] Scorecard PO renders with threshold colors
- [ ] Scorecard PO shows formatted values (percent/number/rate)
- [ ] Scorecard legend displays 3 statuses
- [ ] Project without calculated indicators snapshot degrades gracefully
- [ ] HMIS data preview still works (separate context)

---

## Deferred

- **Grouped column headers** (`group_label` → `colGroupProp`) — field is included in metadata but not used yet
- **HMIS display migration** — could unify `ItemsHolderDatasetHmisDisplay` later

---

## Implementation Order

1. Add `IndicatorMetadata` type and helper (lib)
2. Create `get_indicator_metadata.ts` (server)
3. Update `get_presentation_object_items.ts` (server)
4. Update `ItemsHolderPresentationObject` type (lib)
5. Add `specialScorecardTable` to schema + defaults (lib)
6. Fix migration block 18 (server)
7. Update `get_figure_inputs_from_po.ts` — derive label map (client)
8. Create `_5_scorecard.ts` (client)
9. Update `get_style_from_po.ts` — dispatch to scorecard (client)
10. Add scorecard legend (client)
11. Test
