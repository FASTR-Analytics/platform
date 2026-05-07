# PLAN: Population Types for Calculated Indicators

Replace `denom_population_fraction` with `denom_population_type` + `denom_population_multiplier` in calculated indicators schema.

**Note:** `CalculatedIndicator` is a plain TypeScript type (not Zod), stored as separate SQL columns (not JSON). So this uses SQL migrations only, no JSON data transforms.

## 1. Type Definitions

**File:** `lib/types/indicators.ts`

Add enum and update `CalculatedIndicator.denom`:

```ts
export const POPULATION_TYPES = [
  { id: "total_population", label: "Total population" },
  { id: "u5", label: "Under 5 population" },
  { id: "u1", label: "Under 1 population" },
  { id: "wra", label: "Women of reproductive age (15-49)" },
  { id: "births", label: "Expected births" },
  { id: "pregnancies", label: "Expected pregnancies" },
] as const;

export type PopulationType = typeof POPULATION_TYPES[number]["id"];

// Update denom from:
denom:
  | { kind: "indicator"; indicator_id: string }
  | { kind: "population"; population_fraction: number };

// To:
denom:
  | { kind: "indicator"; indicator_id: string }
  | { kind: "population"; population_type: PopulationType; multiplier: number };
```

## 2. Database Migrations (Idempotent)

**Instance migration:** `server/db/migrations/instance/025_population_type_enum.sql`

```sql
-- Add new columns (idempotent)
ALTER TABLE calculated_indicators 
  ADD COLUMN IF NOT EXISTS denom_population_type TEXT,
  ADD COLUMN IF NOT EXISTS denom_population_multiplier DOUBLE PRECISION;

-- Migrate existing data: fraction → total_population with that fraction as multiplier
UPDATE calculated_indicators 
SET denom_population_type = 'total_population',
    denom_population_multiplier = denom_population_fraction
WHERE denom_kind = 'population' 
  AND denom_population_type IS NULL;

-- Drop old column (idempotent via DO block)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'calculated_indicators' 
             AND column_name = 'denom_population_fraction') THEN
    ALTER TABLE calculated_indicators DROP COLUMN denom_population_fraction;
  END IF;
END $$;
```

**Project migration:** `server/db/migrations/project/016_population_type_enum.sql`

Same pattern for `calculated_indicators_snapshot`.

## 3. Update Main Database Schema

**File:** `server/db/instance/_main_database.sql`

Change `denom_population_fraction` to `denom_population_type` + `denom_population_multiplier`.

**File:** `server/db/project/_project_database.sql`

Same change for snapshot table.

## 4. Seed Data

**File:** `server/db/instance/calculated_indicators.ts`

Update from:
```ts
{ denom: { kind: "population", population_fraction: 0.04 } }
```
To:
```ts
{ denom: { kind: "population", population_type: "births", multiplier: 1 } }
```

## 5. Server Routes

**File:** `server/routes/instance/calculated_indicators.ts`

Update INSERT/UPDATE queries to use new columns.

## 6. Client UI

**File:** `client/src/components/indicator_manager_hmis/calculated_indicator_editor.tsx`

Replace fraction number input with:
- Dropdown for `population_type` (using `POPULATION_TYPES`)
- Number input for `multiplier` (default 1)

## 7. Codegen

**File:** `server/server_only_funcs/get_script_with_parameters_calculated_indicators.ts`

Change from:
```ts
denomExpr = `data$total_population * ${ci.denom.population_fraction} * PERIOD_FRACTION`;
```
To:
```ts
denomExpr = `data[["${ci.denom.population_type}"]] * ${ci.denom.multiplier} * PERIOD_FRACTION`;
```

## 8. m008 Script

**File:** `wb-fastr-modules/m008/script.R`

Change population handling to pivot wide:

```r
population <- read_csv(POPULATION_FILE, show_col_types = FALSE)
# Pivot so each population_type becomes a column
population <- population %>%
  pivot_wider(names_from = population_type, values_from = count)
```

Then in `get_population_for_period`, return all population type columns, not just `total_population`.

## 9. Validation

**File:** `lib/types/calculated_indicator_id.ts`

Add validation that `population_type` is a valid enum value:

```ts
export function isValidPopulationType(value: string): boolean {
  return POPULATION_TYPES.some(pt => pt.id === value);
}
```

---

## Checklist

- [ ] Add `POPULATION_TYPES` constant and `PopulationType` type to `indicators.ts`
- [ ] Update `CalculatedIndicator.denom` type in `indicators.ts`
- [ ] Instance DB migration (025) - idempotent
- [ ] Project DB migration (016) - idempotent
- [ ] Update `_main_database.sql` schema
- [ ] Update `_project_database.sql` schema
- [ ] Update seed data
- [ ] Update server CRUD routes
- [ ] Update client editor UI
- [ ] Update codegen
- [ ] Update m008 script.R to pivot population wide
- [ ] Add population_type validation
