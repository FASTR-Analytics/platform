# PLAN: Indicator Sort Order

Add drag-and-drop sorting for calculated indicators and apply sort order in scorecard tables.

## Part 1: Sort Indicators Modal

### 1.1 Add reorder endpoint

**File:** `server/routes/instance/calculated_indicators.ts`

Add endpoint following `reorderHfaTimePoints` pattern:

```ts
defineRoute(
  routesCalculatedIndicators,
  "reorderCalculatedIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await reorderCalculatedIndicators(c.var.mainDb, body.order);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);
```

**File:** `server/db/instance/calculated_indicators.ts`

Add function:

```ts
export async function reorderCalculatedIndicators(
  db: Sql,
  order: string[],
): Promise<APIResponseNoData> {
  return tryCatchDatabaseAsync(async () => {
    for (let i = 0; i < order.length; i++) {
      await db`
        UPDATE calculated_indicators
        SET sort_order = ${i + 1}
        WHERE calculated_indicator_id = ${order[i]}
      `;
    }
  });
}
```

### 1.2 Add route definition

**File:** `lib/api-routes/instance.ts`

Add route:

```ts
reorderCalculatedIndicators: {
  method: "post",
  path: "/calculated-indicators/reorder",
  body: z.object({
    order: z.array(z.string()),
  }),
  response: APIResponseNoDataSchema,
},
```

### 1.3 Create sort modal component

**File:** `client/src/components/indicator_manager_hmis/sort_calculated_indicators_modal.tsx`

```tsx
import { Button, ModalBox, TimSortableVertical } from "panther";
import { createStore } from "solid-js/store";
import { t3, type CalculatedIndicator } from "lib";
import { serverActions } from "~/server_actions";
import { createSignal } from "solid-js";

type Props = {
  calculatedIndicators: CalculatedIndicator[];
  onClose: () => void;
};

export function SortCalculatedIndicatorsModal(p: Props) {
  const [items, setItems] = createStore(
    [...p.calculatedIndicators]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ci) => ({ id: ci.calculated_indicator_id, label: ci.label }))
  );
  const [saving, setSaving] = createSignal(false);

  async function handleSave() {
    setSaving(true);
    const order = items.map((i) => i.id);
    await serverActions.reorderCalculatedIndicators({ order });
    setSaving(false);
    p.onClose();
  }

  return (
    <ModalBox
      title={t3({ en: "Sort calculated indicators", fr: "Trier les indicateurs calculés" })}
      onClose={p.onClose}
      width={500}
    >
      <div class="ui-pad">
        <TimSortableVertical items={items} setItems={setItems}>
          {(item) => (
            <div class="bg-base-200 rounded px-3 py-2">
              <span class="font-mono text-xs text-neutral mr-2">{item.id}</span>
              {item.label}
            </div>
          )}
        </TimSortableVertical>
      </div>
      <div class="ui-pad flex justify-end gap-2 border-t">
        <Button onClick={p.onClose} intent="base-200">
          {t3({ en: "Cancel", fr: "Annuler" })}
        </Button>
        <Button onClick={handleSave} intent="primary" loading={saving()}>
          {t3({ en: "Save order", fr: "Enregistrer l'ordre" })}
        </Button>
      </div>
    </ModalBox>
  );
}
```

### 1.4 Add button to table

**File:** `client/src/components/indicator_manager_hmis/calculated_indicators_table.tsx`

Add "Sort indicators" button next to "Create" button:

```tsx
<Show when={p.isGlobalAdmin}>
  <Button onClick={handleSort} iconName="arrows-up-down" intent="base-200">
    {t3({ en: "Sort indicators", fr: "Trier les indicateurs" })}
  </Button>
  <Button onClick={handleCreate} iconName="plus" intent="primary">
    ...
  </Button>
</Show>
```

Add handler:

```tsx
async function handleSort() {
  await openComponent({
    element: SortCalculatedIndicatorsModal,
    props: {
      calculatedIndicators: p.calculatedIndicators,
    },
  });
}
```

---

## Part 2: Add sort_order to IndicatorMetadata

**File:** `lib/types/indicators.ts`

```ts
export type IndicatorMetadata = {
  id: string;
  label: string;
  format_as?: "percent" | "number" | "rate_per_10k";
  decimal_places?: number;
  threshold_direction?: "higher_is_better" | "lower_is_better";
  threshold_green?: number;
  threshold_yellow?: number;
  group_label?: string;
  sort_order?: number;  // NEW
};
```

**File:** `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`

Add sort_order to the metadata:

```ts
metadataById.set(ci.calculated_indicator_id, {
  id: ci.calculated_indicator_id,
  label: ci.label,
  format_as: ci.format_as,
  decimal_places: ci.decimal_places,
  threshold_direction: ci.threshold_direction,
  threshold_green: ci.threshold_green,
  threshold_yellow: ci.threshold_yellow,
  group_label: ci.group_label,
  sort_order: ci.sort_order,  // NEW
});
```

---

## Part 3: Apply sort order in scorecard

When `specialScorecardTable` is true, pre-sort the data items by indicator sort_order before passing to panther.

**File:** `client/src/generate_visualization/get_figure_inputs_from_po.ts`

Add helper function:

```ts
function sortItemsByIndicatorMetadata(
  items: Record<string, string>[],
  indicatorMetadata: IndicatorMetadata[],
  indicatorProp: string,
): Record<string, string>[] {
  const sortOrderMap = new Map<string, number>();
  for (const m of indicatorMetadata) {
    if (m.sort_order !== undefined) {
      sortOrderMap.set(m.id, m.sort_order);
      sortOrderMap.set(m.label, m.sort_order);
    }
  }
  
  return [...items].sort((a, b) => {
    const aOrder = sortOrderMap.get(a[indicatorProp]) ?? Infinity;
    const bOrder = sortOrderMap.get(b[indicatorProp]) ?? Infinity;
    return aOrder - bOrder;
  });
}
```

In table rendering path, when `config.s.specialScorecardTable`:

```ts
const sortedItems = config.s.specialScorecardTable
  ? sortItemsByIndicatorMetadata(ih.items, ih.indicatorMetadata, indicatorProp)
  : ih.items;
```

Use `sortedItems` instead of `ih.items` for table data.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `lib/api-routes/instance.ts` | Add `reorderCalculatedIndicators` route |
| `lib/types/indicators.ts` | Add `sort_order` to `IndicatorMetadata` |
| `server/routes/instance/calculated_indicators.ts` | Add reorder endpoint |
| `server/db/instance/calculated_indicators.ts` | Add `reorderCalculatedIndicators` function |
| `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts` | Include `sort_order` |
| `client/src/components/indicator_manager_hmis/sort_calculated_indicators_modal.tsx` | **NEW** |
| `client/src/components/indicator_manager_hmis/calculated_indicators_table.tsx` | Add sort button |
| `client/src/generate_visualization/get_figure_inputs_from_po.ts` | Sort items when scorecard |

---

## Implementation Order

1. Add `reorderCalculatedIndicators` route definition
2. Add server endpoint and db function
3. Create sort modal component
4. Add button to calculated indicators table
5. Test sorting UI
6. Add `sort_order` to `IndicatorMetadata`
7. Update `get_indicator_metadata.ts` to include sort_order
8. Add pre-sort logic in `get_figure_inputs_from_po.ts` for scorecard tables
9. Test scorecard respects sort order
