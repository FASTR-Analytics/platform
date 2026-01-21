# Plan: Metric Variants

## Goal

Group similar metrics (e.g., "Actual vs expected" at National/AA2/AA3/AA4 levels) in the UI while keeping the underlying data model simple.

## Approach

Add optional `variantLabel` field to metrics. Metrics with the same `label` and different `variantLabel` values are grouped together in the UI.

---

## Changes

### 1. Types

**`lib/types/module_definitions.ts`**

```typescript
export type MetricDefinition = {
  // ... existing fields
  variantLabel?: string;  // NEW
};
```

**`lib/types/presentation_objects.ts`**

```typescript
export type ResultsValue = {
  // ... existing fields
  variantLabel?: string;  // NEW
};
```

### 2. Database

**`server/db/migrations/project/008_add_variant_label_to_metrics.sql`**

```sql
ALTER TABLE metrics ADD COLUMN variant_label TEXT;
```

### 3. Module Definitions

Update M003, M005, M006 to use shared labels with `variantLabel`:

**Before (M003):**
```typescript
{ id: "m3-02-01", label: "Actual vs expected service volume (National)", ... }
{ id: "m3-03-01", label: "Actual vs expected service volume (Admin area 2)", ... }
```

**After:**
```typescript
{ id: "m3-02-01", label: "Actual vs expected service volume", variantLabel: "National", ... }
{ id: "m3-03-01", label: "Actual vs expected service volume", variantLabel: "Admin area 2", ... }
```

### 4. Module Builder Validation

**`build_module_definitions.ts`**

Add validation:
- If multiple metrics share the same `label`, ALL must have `variantLabel`
- If a metric has `variantLabel`, at least one sibling must share the same `label`

### 5. Server - Store variant_label

**`server/db/project/modules.ts`**

Update `installModule()` to include `variant_label` in INSERT.

### 6. Server - Enrich with variantLabel

**`server/db/project/metric_enricher.ts`**

Add `variantLabel` to the enriched ResultsValue.

### 7. Client - Group Metrics

**`client/src/components/project/add_visualization.tsx`**

Group metrics by `label`:
- If group has multiple metrics → show group label, then variant dropdown/selector
- If group has single metric → show label directly

---

## UI Behavior

**Metric list shows:**
```
- Number of services reported (standalone - no variants)
- Actual vs expected service volume
    ├─ National
    ├─ Admin area 2
    ├─ Admin area 3
    └─ Admin area 4
- Difference between actual and expected
    ├─ National
    ├─ Admin area 2
    ...
```

User picks a specific metric (variant). From that point, everything works exactly as today.

---

## AI Behavior

AI sees metrics with variants grouped. AI picks specific metric ID. No special handling needed.

---

## Files to Modify

1. `lib/types/module_definitions.ts` - add variantLabel to MetricDefinition
2. `lib/types/presentation_objects.ts` - add variantLabel to ResultsValue
3. `server/db/migrations/project/008_add_variant_label_to_metrics.sql` - new migration
4. `server/db/project/modules.ts` - store variant_label on install
5. `server/db/project/metric_enricher.ts` - include variantLabel in enrichment
6. `build_module_definitions.ts` - add validation
7. `module_defs/m003/1.0.0/definition.ts` - update labels + add variantLabel
8. `module_defs/m005/1.0.0/definition.ts` - update labels + add variantLabel
9. `module_defs/m006/1.0.0/definition.ts` - update labels + add variantLabel
10. `client/src/components/project/add_visualization.tsx` - group metrics in UI

---

## Migration

None needed. Existing metrics have NULL `variant_label` and display as standalone.

---

## Verification

1. `deno task typecheck`
2. `deno task build:modules` - should validate variant consistency
3. Create new project - metrics should group correctly in "Add visualization" UI
4. AI should see grouped metrics
