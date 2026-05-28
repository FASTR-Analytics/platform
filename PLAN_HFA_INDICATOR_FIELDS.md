# Plan: Add Categories, Sub-categories, and Short Label to HFA Indicators

## Summary

Normalize HFA indicator categorization with separate tables for categories and sub-categories, enabling sort order at each level. Add `short_label` field to indicators.

**Key design decision:** Both `category_id` and `sub_category_id` are **nullable**. `null` means "uncategorized" or "no sub-category" respectively. This avoids placeholder records and keeps the schema clean.

## New Schema Design

### Instance DB (normalized)

```sql
-- New table
CREATE TABLE hfa_indicator_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- New table
CREATE TABLE hfa_indicator_sub_categories (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES hfa_indicator_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Modified table (remove category column, add FKs and short_label)
-- hfa_indicators: remove `category` column, add nullable `category_id`, nullable `sub_category_id`, `short_label`
```

### Project DB (normalized snapshot - three tables)

**IMPORTANT:** Snapshot all three tables to project DB, mirroring instance structure. This allows `getIndicatorMetadata` and other functions to query project DB (not mainDb) for consistency with exported data.

```sql
-- New table
CREATE TABLE hfa_indicator_categories_snapshot (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- New table
CREATE TABLE hfa_indicator_sub_categories_snapshot (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Modified table (remove category column, add category_id, sub_category_id, short_label)
CREATE TABLE hfa_indicators_snapshot (
  var_name TEXT PRIMARY KEY NOT NULL,
  category_id TEXT,
  sub_category_id TEXT,
  short_label TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL,
  type TEXT NOT NULL,
  aggregation TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
```

**Note:** No FK constraints in snapshot tables (they're just copies of data at export time).

---

## Files to Modify

### 1. Type Definitions

**File: `lib/types/hfa_types.ts`**

Current (lines 1-10):
```typescript
export type HfaIndicator = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
  hasSyntaxError: boolean;
  codeConsistent: boolean;
};
```

Change to:
```typescript
export type HfaIndicatorCategory = {
  id: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicatorSubCategory = {
  id: string;
  categoryId: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicator = {
  varName: string;
  categoryId: string | null;
  subCategoryId: string | null;
  shortLabel: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
  hasSyntaxError: boolean;
  codeConsistent: boolean;
};
```

---

### 1b. Disaggregation Options

**File: `lib/types/disaggregation_options.ts`**

Add `hfa_sub_category` to the list of disaggregation options (after `hfa_category`):

```typescript
export const ALL_DISAGGREGATION_OPTIONS = [
  // ...existing options...
  "hfa_indicator",
  "hfa_category",
  "hfa_sub_category",  // NEW
  "time_point",
  // ...remaining options...
] as const;
```

**Why:** Categories and sub-categories are disaggregation dimensions (like `admin_area_2` or `facility_type`), not UI grouping labels. The `hfa_category` and `hfa_sub_category` columns in results tables can be used to slice data in visualizations.

---

### 2. Instance DB Migrations

**New file: `server/db/migrations/instance/038_hfa_indicator_categories.sql`**

```sql
-- Create categories table
CREATE TABLE IF NOT EXISTS hfa_indicator_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Create sub-categories table
CREATE TABLE IF NOT EXISTS hfa_indicator_sub_categories (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES hfa_indicator_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Migrate existing non-empty categories from hfa_indicators to new table
INSERT INTO hfa_indicator_categories (id, label, sort_order)
SELECT DISTINCT
  LOWER(REPLACE(REPLACE(category, ' ', '_'), '-', '_')) AS id,
  category AS label,
  0 AS sort_order
FROM hfa_indicators
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (id) DO NOTHING;

-- Add new columns to hfa_indicators (all nullable initially)
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS sub_category_id TEXT;
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';

-- Populate category_id from existing category text (NULL if empty)
UPDATE hfa_indicators
SET category_id = CASE
  WHEN category IS NULL OR category = '' THEN NULL
  ELSE LOWER(REPLACE(REPLACE(category, ' ', '_'), '-', '_'))
END
WHERE category_id IS NULL;

-- sub_category_id stays NULL (no default assignment)

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicators_category_id_fkey'
  ) THEN
    ALTER TABLE hfa_indicators
    ADD CONSTRAINT hfa_indicators_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES hfa_indicator_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicators_sub_category_id_fkey'
  ) THEN
    ALTER TABLE hfa_indicators
    ADD CONSTRAINT hfa_indicators_sub_category_id_fkey
    FOREIGN KEY (sub_category_id) REFERENCES hfa_indicator_sub_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add CHECK constraint: sub_category_id requires category_id to be set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicators_sub_category_requires_category'
  ) THEN
    ALTER TABLE hfa_indicators
    ADD CONSTRAINT hfa_indicators_sub_category_requires_category
    CHECK (sub_category_id IS NULL OR category_id IS NOT NULL);
  END IF;
END $$;

-- Drop old category column (after migration complete)
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS category;
```

---

### 3. Project DB Migration

**New file: `server/db/migrations/project/019_hfa_indicator_snapshot_categories.sql`**

```sql
-- Create categories snapshot table
CREATE TABLE IF NOT EXISTS hfa_indicator_categories_snapshot (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Create sub-categories snapshot table
CREATE TABLE IF NOT EXISTS hfa_indicator_sub_categories_snapshot (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Modify indicators snapshot: add new columns
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS sub_category_id TEXT;
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';

-- Drop old category column
ALTER TABLE hfa_indicators_snapshot DROP COLUMN IF EXISTS category;
```

---

### 4. Live Schema Files

**File: `server/db/instance/_main_database.sql`**

Find (lines 381-395):
```sql
-- ============================================================================
-- HFA INDICATORS
-- ============================================================================

CREATE TABLE hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_syntax_error BOOLEAN NOT NULL DEFAULT FALSE,
  code_consistent BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Replace with:
```sql
-- ============================================================================
-- HFA INDICATOR CATEGORIES
-- ============================================================================

CREATE TABLE hfa_indicator_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE hfa_indicator_sub_categories (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES hfa_indicator_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- HFA INDICATORS
-- ============================================================================

CREATE TABLE hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category_id TEXT REFERENCES hfa_indicator_categories(id) ON DELETE SET NULL,
  sub_category_id TEXT REFERENCES hfa_indicator_sub_categories(id) ON DELETE SET NULL,
  short_label TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_syntax_error BOOLEAN NOT NULL DEFAULT FALSE,
  code_consistent BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**File: `server/db/project/_project_database.sql`**

Find (lines 24-31):
```sql
CREATE TABLE hfa_indicators_snapshot (
  var_name text PRIMARY KEY NOT NULL,
  category text NOT NULL,
  definition text NOT NULL,
  type text NOT NULL,
  aggregation text NOT NULL,
  sort_order integer NOT NULL
);
```

Replace with:
```sql
-- HFA indicator categories snapshot (mirrors instance table at export time)
CREATE TABLE hfa_indicator_categories_snapshot (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- HFA indicator sub-categories snapshot (mirrors instance table at export time)
CREATE TABLE hfa_indicator_sub_categories_snapshot (
  id text PRIMARY KEY NOT NULL,
  category_id text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- HFA indicators snapshot (modified structure)
CREATE TABLE hfa_indicators_snapshot (
  var_name text PRIMARY KEY NOT NULL,
  category_id text,
  sub_category_id text,
  short_label text NOT NULL DEFAULT '',
  definition text NOT NULL,
  type text NOT NULL,
  aggregation text NOT NULL,
  sort_order integer NOT NULL
);
```

---

### 5. Instance DB Layer

**File: `server/db/instance/hfa_indicators.ts`**

#### 5.1 Add new DB types (after line 9):

```typescript
export type DBHfaIndicatorCategory = {
  id: string;
  label: string;
  sort_order: number;
};

export type DBHfaIndicatorSubCategory = {
  id: string;
  category_id: string;
  label: string;
  sort_order: number;
};
```

#### 5.2 Modify DBHfaIndicator type (lines 11-21):

Change from:
```typescript
export type DBHfaIndicator = {
  var_name: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sort_order: number;
  updated_at: string;
  has_syntax_error: boolean;
  code_consistent: boolean;
};
```

To:
```typescript
export type DBHfaIndicator = {
  var_name: string;
  category_id: string | null;
  sub_category_id: string | null;
  short_label: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sort_order: number;
  updated_at: string;
  has_syntax_error: boolean;
  code_consistent: boolean;
};
```

#### 5.3 Add converter functions (after line 29):

```typescript
export function dbRowToHfaIndicatorCategory(row: DBHfaIndicatorCategory): HfaIndicatorCategory {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

export function dbRowToHfaIndicatorSubCategory(row: DBHfaIndicatorSubCategory): HfaIndicatorSubCategory {
  return {
    id: row.id,
    categoryId: row.category_id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}
```

#### 5.4 Modify dbRowToHfaIndicator (lines 30-41):

Change from:
```typescript
export function dbRowToHfaIndicator(row: DBHfaIndicator): HfaIndicator {
  return {
    varName: row.var_name,
    category: row.category,
    definition: row.definition,
    type: row.type,
    aggregation: row.aggregation,
    sortOrder: row.sort_order,
    hasSyntaxError: row.has_syntax_error,
    codeConsistent: row.code_consistent,
  };
}
```

To:
```typescript
export function dbRowToHfaIndicator(row: DBHfaIndicator): HfaIndicator {
  return {
    varName: row.var_name,
    categoryId: row.category_id,
    subCategoryId: row.sub_category_id,
    shortLabel: row.short_label,
    definition: row.definition,
    type: row.type,
    aggregation: row.aggregation,
    sortOrder: row.sort_order,
    hasSyntaxError: row.has_syntax_error,
    codeConsistent: row.code_consistent,
  };
}
```

#### 5.5 Add CRUD functions for categories (after getHfaIndicators function ~line 61):

```typescript
// ============================================================================
// Categories
// ============================================================================

export async function getHfaIndicatorCategories(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorCategory[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorCategory[]>`
      SELECT * FROM hfa_indicator_categories ORDER BY sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorCategory) };
  });
}

export async function createHfaIndicatorCategory(
  mainDb: Sql,
  category: HfaIndicatorCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_categories (id, label, sort_order)
      VALUES (${category.id}, ${category.label}, ${category.sortOrder})
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorCategory(
  mainDb: Sql,
  oldId: string,
  category: HfaIndicatorCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicator_categories
      SET id = ${category.id},
          label = ${category.label},
          sort_order = ${category.sortOrder}
      WHERE id = ${oldId}
    `;
    return { success: true };
  });
}

export async function deleteHfaIndicatorCategory(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      DELETE FROM hfa_indicator_categories WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function reorderHfaIndicatorCategories(
  mainDb: Sql,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_categories
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]}
        `;
      }
    });
    return { success: true };
  });
}

// ============================================================================
// Sub-Categories
// ============================================================================

export async function getHfaIndicatorSubCategories(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorSubCategory[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorSubCategory[]>`
      SELECT * FROM hfa_indicator_sub_categories ORDER BY category_id, sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorSubCategory) };
  });
}

export async function createHfaIndicatorSubCategory(
  mainDb: Sql,
  subCategory: HfaIndicatorSubCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_sub_categories (id, category_id, label, sort_order)
      VALUES (${subCategory.id}, ${subCategory.categoryId}, ${subCategory.label}, ${subCategory.sortOrder})
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorSubCategory(
  mainDb: Sql,
  oldId: string,
  subCategory: HfaIndicatorSubCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicator_sub_categories
      SET id = ${subCategory.id},
          category_id = ${subCategory.categoryId},
          label = ${subCategory.label},
          sort_order = ${subCategory.sortOrder}
      WHERE id = ${oldId}
    `;
    return { success: true };
  });
}

export async function deleteHfaIndicatorSubCategory(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      DELETE FROM hfa_indicator_sub_categories WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function reorderHfaIndicatorSubCategories(
  mainDb: Sql,
  categoryId: string,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_sub_categories
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]} AND category_id = ${categoryId}
        `;
      }
    });
    return { success: true };
  });
}
```

#### 5.6 Modify createHfaIndicator (lines 63-74):

Change from:
```typescript
export async function createHfaIndicator(
  mainDb: Sql,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicators (var_name, category, definition, type, aggregation, sort_order, updated_at)
      VALUES (${indicator.varName}, ${indicator.category}, ${indicator.definition}, ${indicator.type}, ${indicator.aggregation}, ${indicator.sortOrder}, CURRENT_TIMESTAMP)
    `;
    return { success: true };
  });
}
```

To:
```typescript
export async function createHfaIndicator(
  mainDb: Sql,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, short_label, definition, type, aggregation, sort_order, updated_at)
      VALUES (${indicator.varName}, ${indicator.categoryId}, ${indicator.subCategoryId}, ${indicator.shortLabel}, ${indicator.definition}, ${indicator.type}, ${indicator.aggregation}, ${indicator.sortOrder}, CURRENT_TIMESTAMP)
    `;
    return { success: true };
  });
}
```

#### 5.7 Modify updateHfaIndicator (lines 76-95):

Change from:
```typescript
export async function updateHfaIndicator(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicators
      SET var_name = ${indicator.varName},
          category = ${indicator.category},
          definition = ${indicator.definition},
          type = ${indicator.type},
          aggregation = ${indicator.aggregation},
          sort_order = ${indicator.sortOrder},
          updated_at = CURRENT_TIMESTAMP
      WHERE var_name = ${oldVarName}
    `;
    return { success: true };
  });
}
```

To:
```typescript
export async function updateHfaIndicator(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicators
      SET var_name = ${indicator.varName},
          category_id = ${indicator.categoryId},
          sub_category_id = ${indicator.subCategoryId},
          short_label = ${indicator.shortLabel},
          definition = ${indicator.definition},
          type = ${indicator.type},
          aggregation = ${indicator.aggregation},
          sort_order = ${indicator.sortOrder},
          updated_at = CURRENT_TIMESTAMP
      WHERE var_name = ${oldVarName}
    `;
    return { success: true };
  });
}
```

#### 5.8 Modify batchUploadHfaIndicators (lines 144-148):

Change from:
```typescript
        await sql`
          INSERT INTO hfa_indicators (var_name, category, definition, type, aggregation, sort_order, has_syntax_error, code_consistent, updated_at)
          VALUES (${ind.varName}, ${ind.category}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, ${ind.hasSyntaxError}, ${ind.codeConsistent}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name) DO NOTHING
        `;
```

To:
```typescript
        await sql`
          INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, short_label, definition, type, aggregation, sort_order, has_syntax_error, code_consistent, updated_at)
          VALUES (${ind.varName}, ${ind.categoryId}, ${ind.subCategoryId}, ${ind.shortLabel}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, ${ind.hasSyntaxError}, ${ind.codeConsistent}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name) DO NOTHING
        `;
```

#### 5.9 Modify saveHfaIndicatorFull (lines 178-190):

Change from:
```typescript
      await sql`
        UPDATE hfa_indicators
        SET var_name = ${indicator.varName},
            category = ${indicator.category},
            definition = ${indicator.definition},
            type = ${indicator.type},
            aggregation = ${indicator.aggregation},
            sort_order = ${indicator.sortOrder},
            has_syntax_error = ${hasSyntaxError},
            code_consistent = ${codeConsistent},
            updated_at = CURRENT_TIMESTAMP
        WHERE var_name = ${oldVarName}
      `;
```

To:
```typescript
      await sql`
        UPDATE hfa_indicators
        SET var_name = ${indicator.varName},
            category_id = ${indicator.categoryId},
            sub_category_id = ${indicator.subCategoryId},
            short_label = ${indicator.shortLabel},
            definition = ${indicator.definition},
            type = ${indicator.type},
            aggregation = ${indicator.aggregation},
            sort_order = ${indicator.sortOrder},
            has_syntax_error = ${hasSyntaxError},
            code_consistent = ${codeConsistent},
            updated_at = CURRENT_TIMESTAMP
        WHERE var_name = ${oldVarName}
      `;
```

---

### 6. API Routes

**File: `server/routes/instance/hfa_indicators.ts`**

Add imports at top (update line 3-14):
```typescript
import {
  getHfaIndicators,
  getHfaIndicatorCategories,
  getHfaIndicatorSubCategories,
  createHfaIndicatorCategory,
  updateHfaIndicatorCategory,
  deleteHfaIndicatorCategory,
  reorderHfaIndicatorCategories,
  createHfaIndicatorSubCategory,
  updateHfaIndicatorSubCategory,
  deleteHfaIndicatorSubCategory,
  reorderHfaIndicatorSubCategories,
  getInstanceIndicatorsSummary,
  createHfaIndicator,
  updateHfaIndicator,
  deleteHfaIndicators,
  batchUploadHfaIndicators,
  getHfaIndicatorCode,
  getAllHfaIndicatorCode,
  updateHfaIndicatorCode,
  saveHfaIndicatorFull,
  getHfaDictionaryForValidation,
  bulkUpdateHfaIndicatorValidation,
} from "../../db/mod.ts";
```

Add new route definitions (after line 30):
```typescript
defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorCategories",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getHfaIndicatorCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createHfaIndicatorCategory(c.var.mainDb, body.category);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorCategory(c.var.mainDb, body.oldId, body.category);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorCategories",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorCategories(c.var.mainDb, body.orderedIds);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorSubCategories",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getHfaIndicatorSubCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorSubCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createHfaIndicatorSubCategory(c.var.mainDb, body.subCategory);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorSubCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorSubCategory(c.var.mainDb, body.oldId, body.subCategory);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorSubCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorSubCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorSubCategories",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorSubCategories(c.var.mainDb, body.categoryId, body.orderedIds);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);
```

---

### 7. API Route Registry

**File: `lib/api-routes/instance/hfa_indicators.ts`**

Add new route definitions for categories and sub-categories:

```typescript
import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorCategory,
  HfaIndicatorSubCategory,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const hfaIndicatorRouteRegistry = {
  // ... existing routes ...

  // Categories
  getHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories",
    method: "GET",
    response: {} as HfaIndicatorCategory[],
  }),

  createHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories",
    method: "POST",
    body: {} as { category: HfaIndicatorCategory },
  }),

  updateHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/update",
    method: "POST",
    body: {} as { oldId: string; category: HfaIndicatorCategory },
  }),

  deleteHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/delete",
    method: "POST",
    body: {} as { id: string },
  }),

  reorderHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories/reorder",
    method: "POST",
    body: {} as { orderedIds: string[] },
  }),

  // Sub-categories
  getHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories",
    method: "GET",
    response: {} as HfaIndicatorSubCategory[],
  }),

  createHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories",
    method: "POST",
    body: {} as { subCategory: HfaIndicatorSubCategory },
  }),

  updateHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/update",
    method: "POST",
    body: {} as { oldId: string; subCategory: HfaIndicatorSubCategory },
  }),

  deleteHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/delete",
    method: "POST",
    body: {} as { id: string },
  }),

  reorderHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories/reorder",
    method: "POST",
    body: {} as { categoryId: string; orderedIds: string[] },
  }),
} as const;
```

**Note:** Server actions are auto-generated from the route registry, so `serverActions.getHfaIndicatorCategories({})` etc. will be available after rebuilding.

---

### 8. Project DB Layer - Snapshot

**File: `server/db/project/datasets_in_project_hfa.ts`**

#### 8.1 Add queries to fetch all three tables from mainDb (around line 106):

```typescript
    // Fetch HFA categories from instance DB for snapshot
    const hfaCategoriesForSnapshot = await mainDb<{
      id: string;
      label: string;
      sort_order: number;
    }[]>`
      SELECT id, label, sort_order FROM hfa_indicator_categories ORDER BY sort_order, label
    `;

    // Fetch HFA sub-categories from instance DB for snapshot
    const hfaSubCategoriesForSnapshot = await mainDb<{
      id: string;
      category_id: string;
      label: string;
      sort_order: number;
    }[]>`
      SELECT id, category_id, label, sort_order FROM hfa_indicator_sub_categories ORDER BY category_id, sort_order, label
    `;

    // Fetch HFA indicators from instance DB for snapshot
    const hfaIndicatorRowsForSnapshot = await mainDb<{
      var_name: string;
      category_id: string | null;
      sub_category_id: string | null;
      short_label: string;
      definition: string;
      type: string;
      aggregation: string;
      sort_order: number;
    }[]>`
      SELECT var_name, category_id, sub_category_id, short_label, definition, type, aggregation, sort_order
      FROM hfa_indicators
      ORDER BY sort_order, var_name
    `;
```

#### 8.2 Modify snapshot statements (around line 264):

**Important:** The existing `sql`DELETE FROM hfa_indicators_snapshot`` at line 206 needs to be updated. Replace the existing DELETE/INSERT block for HFA snapshots with:

```typescript
      // Clear all HFA snapshot tables first (order matters for referential integrity if any)
      sql`DELETE FROM hfa_indicators_snapshot`,
      sql`DELETE FROM hfa_indicator_sub_categories_snapshot`,
      sql`DELETE FROM hfa_indicator_categories_snapshot`,
      
      // Insert categories first, then sub-categories, then indicators
      ...hfaCategoriesForSnapshot.map(
        (cat) =>
          sql`INSERT INTO hfa_indicator_categories_snapshot (id, label, sort_order)
            VALUES (${cat.id}, ${cat.label}, ${cat.sort_order})`,
      ),
      ...hfaSubCategoriesForSnapshot.map(
        (subCat) =>
          sql`INSERT INTO hfa_indicator_sub_categories_snapshot (id, category_id, label, sort_order)
            VALUES (${subCat.id}, ${subCat.category_id}, ${subCat.label}, ${subCat.sort_order})`,
      ),
      ...hfaIndicatorRowsForSnapshot.map(
        (ind) =>
          sql`INSERT INTO hfa_indicators_snapshot
            (var_name, category_id, sub_category_id, short_label, definition, type, aggregation, sort_order)
            VALUES (${ind.var_name}, ${ind.category_id}, ${ind.sub_category_id}, ${ind.short_label}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${ind.sort_order})`,
      ),
```

**Note:** This replaces the existing `hfa_indicators_snapshot` DELETE/INSERT block, not adds to it.

#### 8.3 Add helper functions to read from snapshot tables:

```typescript
export async function getAllHfaIndicatorCategoriesFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorCategory[]> {
  const rows = await projectDb<DBHfaIndicatorCategory[]>`
    SELECT id, label, sort_order FROM hfa_indicator_categories_snapshot ORDER BY sort_order, label
  `;
  return rows.map(dbRowToHfaIndicatorCategory);
}

export async function getAllHfaIndicatorSubCategoriesFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorSubCategory[]> {
  const rows = await projectDb<DBHfaIndicatorSubCategory[]>`
    SELECT id, category_id, label, sort_order FROM hfa_indicator_sub_categories_snapshot ORDER BY category_id, sort_order, label
  `;
  return rows.map(dbRowToHfaIndicatorSubCategory);
}
```

#### 8.4 Modify getAllHfaIndicatorsFromSnapshot (lines 293-308):

Change from:
```typescript
export async function getAllHfaIndicatorsFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicator[]> {
  const rows = await projectDb<DBHfaIndicator[]>`
    SELECT
      var_name,
      category,
      definition,
      type,
      aggregation,
      sort_order,
      '' as updated_at
    FROM hfa_indicators_snapshot
    ORDER BY sort_order, var_name
  `;
  return rows.map(dbRowToHfaIndicator);
}
```

To:
```typescript
export async function getAllHfaIndicatorsFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicator[]> {
  const rows = await projectDb<DBHfaIndicator[]>`
    SELECT
      i.var_name,
      i.category_id,
      i.sub_category_id,
      i.short_label,
      i.definition,
      i.type,
      i.aggregation,
      i.sort_order,
      '' as updated_at,
      false as has_syntax_error,
      true as code_consistent
    FROM hfa_indicators_snapshot i
    LEFT JOIN hfa_indicator_categories_snapshot c ON i.category_id = c.id
    LEFT JOIN hfa_indicator_sub_categories_snapshot sc ON i.sub_category_id = sc.id
    ORDER BY COALESCE(c.sort_order, 999999), COALESCE(sc.sort_order, 999999), i.sort_order, i.var_name
  `;
  return rows.map(dbRowToHfaIndicator);
}
```

---

### 9. getIndicatorMetadata (Disaggregation Label Mappings)

**File: `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`**

**Key concept:** HFA categories and sub-categories are **disaggregation dimensions** (like `admin_area_2` or `facility_type`), NOT UI grouping labels. The `IndicatorMetadata` returned by this function provides a `labelMap` used to display human-readable labels for disaggregation values in dropdowns and charts.

**IMPORTANT:** Query from `projectDb` (snapshot tables), NOT `mainDb`. This ensures presentation objects use data consistent with the exported project state.

#### 9.1 Rewrite HFA section (lines 45-57)

Change from:
```typescript
  if (isHfaModule) {
    const hfaRows = await mainDb<DBHfaIndicator[]>`SELECT * FROM hfa_indicators`;
    for (const row of hfaRows) {
      const format_as = row.type === "binary" && row.aggregation === "avg" ? "percent" : "number";
      metadata.push({
        id: row.var_name,
        label: row.definition,
        format_as,
        group_label: row.category,
        sort_order: row.sort_order,
      });
    }
    return metadata;
  }
```

To:
```typescript
  if (isHfaModule) {
    // 1. Indicator metadata (for hfa_indicator disaggregation)
    const hfaIndicators = await projectDb<{
      var_name: string;
      short_label: string;
      definition: string;
      type: string;
      aggregation: string;
      sort_order: number;
    }[]>`
      SELECT var_name, short_label, definition, type, aggregation, sort_order
      FROM hfa_indicators_snapshot
      ORDER BY sort_order, var_name
    `;
    for (const row of hfaIndicators) {
      const format_as = row.type === "binary" && row.aggregation === "avg" ? "percent" : "number";
      metadata.push({
        id: row.var_name,
        label: row.short_label || row.definition,
        format_as,
        sort_order: row.sort_order,
      });
    }

    // 2. Category metadata (for hfa_category disaggregation labels)
    const hfaCategories = await projectDb<{ id: string; label: string; sort_order: number }[]>`
      SELECT id, label, sort_order FROM hfa_indicator_categories_snapshot ORDER BY sort_order, label
    `;
    for (const cat of hfaCategories) {
      metadata.push({
        id: cat.id,
        label: cat.label,
        sort_order: cat.sort_order,
      });
    }

    // 3. Sub-category metadata (for hfa_sub_category disaggregation labels)
    const hfaSubCategories = await projectDb<{ id: string; label: string; sort_order: number }[]>`
      SELECT id, label, sort_order FROM hfa_indicator_sub_categories_snapshot ORDER BY sort_order, label
    `;
    for (const subCat of hfaSubCategories) {
      metadata.push({
        id: subCat.id,
        label: subCat.label,
        sort_order: subCat.sort_order,
      });
    }

    return metadata;
  }
```

**Note:** Do NOT modify the `IndicatorMetadata` type. The `group_label` field is used by calculated indicators for UI grouping, which is a different concept from HFA disaggregation.

---

### 10. R Script Generation

**File: `server/server_only_funcs/get_script_with_parameters_hfa.ts`**

#### 10.1 Update indicator metadata generation (line 255)

Change from:
```typescript
  const indicatorMetadata = [
    `  hfa_indicator = c(${ordered.map((i) => `"${i.varName}"`).join(", ")})`,
    `  hfa_category = c(${ordered.map((i) => `"${i.category}"`).join(", ")})`,
    `  ind_type = c(${ordered.map((i) => `"${i.type}"`).join(", ")})`,
    `  ind_aggregation = c(${ordered.map((i) => `"${i.aggregation}"`).join(", ")})`,
  ].join(",\n");
```

To:
```typescript
  const indicatorMetadata = [
    `  hfa_indicator = c(${ordered.map((i) => `"${i.varName}"`).join(", ")})`,
    `  hfa_category = c(${ordered.map((i) => `"${i.categoryId ?? ""}"`).join(", ")})`,
    `  hfa_sub_category = c(${ordered.map((i) => `"${i.subCategoryId ?? ""}"`).join(", ")})`,
    `  hfa_short_label = c(${ordered.map((i) => `"${i.shortLabel.replace(/"/g, '\\"')}"`).join(", ")})`,
    `  ind_type = c(${ordered.map((i) => `"${i.type}"`).join(", ")})`,
    `  ind_aggregation = c(${ordered.map((i) => `"${i.aggregation}"`).join(", ")})`,
  ].join(",\n");
```

**Note:** `hfa_category` and `hfa_sub_category` now contain IDs (e.g., `"maternal_health"`), not labels. Empty string `""` represents NULL/uncategorized. The R script should include these in the output CSV for use as disaggregation columns.

---

### 11. HFA Module Results Object and R Script

#### 11.1 Results Object Definition

**File: `wb-fastr-modules/m010/_results_objects.ts`**

Update the results object definition to include `hfa_sub_category` and make `hfa_category` nullable:

Change from:
```typescript
hfa_category: "TEXT NOT NULL",
```

To:
```typescript
hfa_category: "TEXT",              // Changed: nullable (empty string for uncategorized)
hfa_sub_category: "TEXT",          // NEW: nullable
```

#### 11.2 R Script Changes

**File: `wb-fastr-modules/m010/script.R`**

The R script receives indicator metadata via the `indicator_metadata` data frame (generated by `get_script_with_parameters_hfa.ts`). The new columns are:

- `hfa_sub_category` - sub-category ID or empty string
- `hfa_short_label` - short display label for the indicator

**Changes required:**

The `indicator_metadata` data frame now has additional columns - no R code changes needed to read them (they're auto-included).

When building the results CSV, ensure `hfa_sub_category` is included in the output columns. Find where `hfa_category` is selected and add `hfa_sub_category` alongside it:

```r
# Find the select() or output column list and add hfa_sub_category after hfa_category
results <- results %>%
  select(
    facility_id,
    admin_area_4, admin_area_3, admin_area_2, admin_area_1,
    hfa_indicator,
    hfa_category,
    hfa_sub_category,  # ADD THIS
    time_point,
    # ... rest of columns
  )
```

Values will be empty string `""` for indicators without a category/sub-category. The database import handles this correctly.

---

### 12. Client UI - Edit Indicator Form

**File: `client/src/components/forms_editors/edit_hfa_indicator.tsx`**

#### 12.1 Add imports (line 1)

Add `HfaIndicatorCategory`, `HfaIndicatorSubCategory`, `Select` to imports.

#### 12.2 Update props type (lines 13-20)

Change from:
```typescript
export function EditHfaIndicator(
  p: AlertComponentProps<
    {
      existingIndicator?: HfaIndicator;
      sortOrder: number;
    },
    undefined
  >,
) {
```

To:
```typescript
export function EditHfaIndicator(
  p: AlertComponentProps<
    {
      existingIndicator?: HfaIndicator;
      sortOrder: number;
      categories: HfaIndicatorCategory[];
      subCategories: HfaIndicatorSubCategory[];
    },
    undefined
  >,
) {
```

#### 12.3 Update signals (lines 24-28)

Change from:
```typescript
  const [varName, setVarName] = createSignal(p.existingIndicator?.varName ?? "");
  const [category, setCategory] = createSignal(p.existingIndicator?.category ?? "");
  const [definition, setDefinition] = createSignal(p.existingIndicator?.definition ?? "");
  const [type, setType] = createSignal<"binary" | "numeric">(p.existingIndicator?.type ?? "binary");
  const [aggregation, setAggregation] = createSignal<"sum" | "avg">(p.existingIndicator?.aggregation ?? "sum");
```

To:
```typescript
  const [varName, setVarName] = createSignal(p.existingIndicator?.varName ?? "");
  const [categoryId, setCategoryId] = createSignal<string | null>(p.existingIndicator?.categoryId ?? null);
  const [subCategoryId, setSubCategoryId] = createSignal<string | null>(p.existingIndicator?.subCategoryId ?? null);
  const [shortLabel, setShortLabel] = createSignal(p.existingIndicator?.shortLabel ?? "");
  const [definition, setDefinition] = createSignal(p.existingIndicator?.definition ?? "");
  const [type, setType] = createSignal<"binary" | "numeric">(p.existingIndicator?.type ?? "binary");
  const [aggregation, setAggregation] = createSignal<"sum" | "avg">(p.existingIndicator?.aggregation ?? "sum");

  const filteredSubCategories = () => {
    const catId = categoryId();
    if (!catId) return [];
    return p.subCategories.filter((sc) => sc.categoryId === catId);
  };
```

#### 12.4 Update indicator object construction (lines 39-48)

Change from:
```typescript
      const indicator: HfaIndicator = {
        varName: trimmedVarName,
        category: category().trim(),
        definition: definition().trim(),
        type: type(),
        aggregation: aggregation(),
        sortOrder: p.sortOrder,
        hasSyntaxError: false,
        codeConsistent: true,
      };
```

To:
```typescript
      const indicator: HfaIndicator = {
        varName: trimmedVarName,
        categoryId: categoryId(),
        subCategoryId: subCategoryId(),
        shortLabel: shortLabel().trim(),
        definition: definition().trim(),
        type: type(),
        aggregation: aggregation(),
        sortOrder: p.sortOrder,
        hasSyntaxError: false,
        codeConsistent: true,
      };
```

#### 12.5 Update form fields (lines 76-97)

Change from:
```typescript
      <div class="ui-spy">
        <Input
          label={t3({ en: "Variable name", fr: "Nom de la variable" })}
          value={varName()}
          onChange={setVarName}
          fullWidth
          autoFocus
          mono
        />
        <Input
          label={t3({ en: "Category", fr: "Catégorie" })}
          value={category()}
          onChange={setCategory}
          fullWidth
        />
        <TextArea
          label={t3({ en: "Definition", fr: "Définition" })}
          value={definition()}
          onChange={setDefinition}
          fullWidth
          height="160px"
        />
```

To:
```typescript
      <div class="ui-spy">
        <Input
          label={t3({ en: "Variable name", fr: "Nom de la variable" })}
          value={varName()}
          onChange={setVarName}
          fullWidth
          autoFocus
          mono
        />
        <Select
          label={t3({ en: "Category", fr: "Catégorie" })}
          value={categoryId() ?? ""}
          onChange={(v) => {
            setCategoryId(v || null);
            setSubCategoryId(null);
          }}
          options={[
            { value: "", label: t3({ en: "— None —", fr: "— Aucune —" }) },
            ...p.categories.map((c) => ({ value: c.id, label: c.label })),
          ]}
          fullWidth
        />
        <Select
          label={t3({ en: "Sub-category", fr: "Sous-catégorie" })}
          value={subCategoryId() ?? ""}
          onChange={(v) => setSubCategoryId(v || null)}
          options={[
            { value: "", label: t3({ en: "— None —", fr: "— Aucune —" }) },
            ...filteredSubCategories().map((sc) => ({ value: sc.id, label: sc.label })),
          ]}
          fullWidth
          disabled={!categoryId()}
        />
        <Input
          label={t3({ en: "Short label", fr: "Libellé court" })}
          value={shortLabel()}
          onChange={setShortLabel}
          fullWidth
        />
        <TextArea
          label={t3({ en: "Definition", fr: "Définition" })}
          value={definition()}
          onChange={setDefinition}
          fullWidth
          height="160px"
        />
```

---

### 13. Client UI - HFA Indicator Code Editor

**File: `client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx`**

This editor also allows editing indicator metadata and needs the same updates.

#### 14.1 Update TempState type (lines 31-38)

Change from:
```typescript
type TempState = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  code: TempCodeEntry[];
};
```

To:
```typescript
type TempState = {
  varName: string;
  categoryId: string | null;
  subCategoryId: string | null;
  shortLabel: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  code: TempCodeEntry[];
};
```

#### 14.2 Update props to include categories/subCategories

Change props type (lines 40-48) to include:
```typescript
export function HfaIndicatorCodeEditor(
  p: EditorComponentProps<
    {
      indicator: HfaIndicator;
      dictionary: HfaDictionaryForValidation;
      allIndicatorVarNames: string[];
      categories: HfaIndicatorCategory[];
      subCategories: HfaIndicatorSubCategory[];
    },
    undefined
  >,
) {
```

#### 14.3 Update state initialization (lines 149-156)

Change from:
```typescript
  const [state, setState] = createStore<TempState>({
    varName: p.indicator.varName,
    category: p.indicator.category,
    definition: p.indicator.definition,
    type: p.indicator.type,
    aggregation: p.indicator.aggregation,
    code: initialCode,
  });
```

To:
```typescript
  const [state, setState] = createStore<TempState>({
    varName: p.indicator.varName,
    categoryId: p.indicator.categoryId,
    subCategoryId: p.indicator.subCategoryId,
    shortLabel: p.indicator.shortLabel,
    definition: p.indicator.definition,
    type: p.indicator.type,
    aggregation: p.indicator.aggregation,
    code: initialCode,
  });

  const filteredSubCategories = () => {
    if (!state.categoryId) return [];
    return p.subCategories.filter((sc) => sc.categoryId === state.categoryId);
  };
```

#### 14.4 Update save function indicator object (lines 274-283)

Change from:
```typescript
      indicator: {
        varName: trimmedVarName,
        category: state.category.trim(),
        definition: state.definition.trim(),
        type: state.type,
        aggregation: state.aggregation,
        sortOrder: p.indicator.sortOrder,
        hasSyntaxError,
        codeConsistent,
      },
```

To:
```typescript
      indicator: {
        varName: trimmedVarName,
        categoryId: state.categoryId,
        subCategoryId: state.subCategoryId,
        shortLabel: state.shortLabel.trim(),
        definition: state.definition.trim(),
        type: state.type,
        aggregation: state.aggregation,
        sortOrder: p.indicator.sortOrder,
        hasSyntaxError,
        codeConsistent,
      },
```

#### 14.5 Update form UI (lines 312-319)

Change category input from free-text to dropdown selectors with "None" options:
```typescript
<Select
  label={t3({ en: "Category", fr: "Catégorie" })}
  value={state.categoryId ?? ""}
  onChange={(v) => {
    setState("categoryId", v || null);
    setState("subCategoryId", null);
    markDirty();
  }}
  options={[
    { value: "", label: t3({ en: "— None —", fr: "— Aucune —" }) },
    ...p.categories.map((c) => ({ value: c.id, label: c.label })),
  ]}
/>
<Select
  label={t3({ en: "Sub-category", fr: "Sous-catégorie" })}
  value={state.subCategoryId ?? ""}
  onChange={(v) => {
    setState("subCategoryId", v || null);
    markDirty();
  }}
  options={[
    { value: "", label: t3({ en: "— None —", fr: "— Aucune —" }) },
    ...filteredSubCategories().map((sc) => ({ value: sc.id, label: sc.label })),
  ]}
  disabled={!state.categoryId}
/>
<Input
  label={t3({ en: "Short label", fr: "Libellé court" })}
  value={state.shortLabel}
  onChange={(v) => {
    setState("shortLabel", v);
    markDirty();
  }}
/>
```

#### 14.6 Update caller in hfa_indicators_manager.tsx

Update `handleOpenCodeEditor` function to pass categories/subCategories:
```typescript
  async function handleOpenCodeEditor(
    indicator: HfaIndicator,
    allIndicators: HfaIndicator[],
  ) {
    const dictState = dictionary();
    const catSt = categories();
    const subCatSt = subCategories();
    if (dictState.status !== "ready" || catSt.status !== "ready" || subCatSt.status !== "ready") return;
    await openEditor({
      element: HfaIndicatorCodeEditor,
      props: {
        indicator,
        dictionary: dictState.data,
        allIndicatorVarNames: allIndicators.map((i) => i.varName),
        categories: catSt.data,
        subCategories: subCatSt.data,
      },
    });
  }
```

---

### 14. Client UI - Manager Component

**File: `client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`**

#### 14.1 Add state for categories and sub-categories (after line 48):

```typescript
  const [categories, setCategories] = createSignal<StateHolder<HfaIndicatorCategory[]>>({
    status: "loading",
  });
  const [subCategories, setSubCategories] = createSignal<StateHolder<HfaIndicatorSubCategory[]>>({
    status: "loading",
  });
```

#### 14.2 Add effects to load categories/sub-categories (after line 63):

```typescript
  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await serverActions.getHfaIndicatorCategories({});
    setCategories(getQueryStateFromApiResponse(res));
  });

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await serverActions.getHfaIndicatorSubCategories({});
    setSubCategories(getQueryStateFromApiResponse(res));
  });
```

#### 14.3 Update handleCreate (lines 152-161):

Change from:
```typescript
  async function handleCreate() {
    const st = indicators();
    const sortOrder = st.status === "ready" ? st.data.length : 0;
    await openComponent({
      element: EditHfaIndicator,
      props: {
        sortOrder,
      },
    });
  }
```

To:
```typescript
  async function handleCreate() {
    const st = indicators();
    const catSt = categories();
    const subCatSt = subCategories();
    if (catSt.status !== "ready" || subCatSt.status !== "ready") return;
    const sortOrder = st.status === "ready" ? st.data.length : 0;
    await openComponent({
      element: EditHfaIndicator,
      props: {
        sortOrder,
        categories: catSt.data,
        subCategories: subCatSt.data,
      },
    });
  }
```

#### 14.4 Update table columns (lines 285-339):

Change category column from:
```typescript
    {
      key: "category",
      header: t3({ en: "Category", fr: "Catégorie" }),
      sortable: true,
    },
```

To (displaying "—" for null, label otherwise):
```typescript
    {
      key: "categoryId",
      header: t3({ en: "Category", fr: "Catégorie" }),
      sortable: true,
      render: (ind) => {
        if (!ind.categoryId) return "—";
        const catSt = categories();
        if (catSt.status !== "ready") return ind.categoryId;
        const cat = catSt.data.find((c) => c.id === ind.categoryId);
        return cat?.label ?? ind.categoryId;
      },
    },
    {
      key: "subCategoryId",
      header: t3({ en: "Sub-category", fr: "Sous-catégorie" }),
      sortable: true,
      render: (ind) => {
        if (!ind.subCategoryId) return "—";
        const subCatSt = subCategories();
        if (subCatSt.status !== "ready") return ind.subCategoryId;
        const subCat = subCatSt.data.find((sc) => sc.id === ind.subCategoryId);
        return subCat?.label ?? ind.subCategoryId;
      },
    },
```

#### 14.5 Add "Manage Categories" and "Manage Sub-categories" buttons (in header bar, after line 398):

```typescript
                <Button iconName="folder" onClick={handleManageCategories}>
                  {t3({ en: "Categories", fr: "Catégories" })}
                </Button>
                <Button iconName="folderTree" onClick={handleManageSubCategories}>
                  {t3({ en: "Sub-categories", fr: "Sous-catégories" })}
                </Button>
```

#### 14.6 Add handler functions for category management:

```typescript
  async function handleManageCategories() {
    const catSt = categories();
    if (catSt.status !== "ready") return;
    await openEditor({
      element: HfaCategoriesEditor,
      props: {
        categories: catSt.data,
      },
    });
  }

  async function handleManageSubCategories() {
    const catSt = categories();
    const subCatSt = subCategories();
    if (catSt.status !== "ready" || subCatSt.status !== "ready") return;
    await openEditor({
      element: HfaSubCategoriesEditor,
      props: {
        categories: catSt.data,
        subCategories: subCatSt.data,
      },
    });
  }
```

---

### 15. New UI Components - Category Editors

**New file: `client/src/components/indicator_manager_hfa/hfa_categories_editor.tsx`**

Create editor component with:
- List of categories with `TimSortableVertical` for reordering
- Add button to create new category (opens modal)
- Edit/delete buttons per row
- Save reorder calls `serverActions.reorderHfaIndicatorCategories`

**New file: `client/src/components/indicator_manager_hfa/hfa_sub_categories_editor.tsx`**

Create editor component with:
- Category selector dropdown at top
- List of sub-categories for selected category with `TimSortableVertical`
- Add button to create new sub-category (opens modal)
- Edit/delete buttons per row
- Save reorder calls `serverActions.reorderHfaIndicatorSubCategories`

**New file: `client/src/components/forms_editors/edit_hfa_indicator_category.tsx`**

Simple form with:
- ID input (auto-generated from label if creating)
- Label input
- Save calls `createHfaIndicatorCategory` or `updateHfaIndicatorCategory`

**New file: `client/src/components/forms_editors/edit_hfa_indicator_sub_category.tsx`**

Simple form with:
- Category dropdown (read-only if editing)
- ID input
- Label input
- Save calls `createHfaIndicatorSubCategory` or `updateHfaIndicatorSubCategory`

---

### 16. CSV Upload/Download

**File: `client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`**

#### 16.1 Update handleDownloadCsv (lines 216-274):

Change headers from:
```typescript
    const headers = [
      "varName",
      "category",
      "definition",
      "type",
      "aggregation",
    ];
```

To:
```typescript
    const headers = [
      "varName",
      "categoryId",
      "subCategoryId",
      "shortLabel",
      "definition",
      "type",
      "aggregation",
    ];
```

Change row mapping from:
```typescript
    const rows = data.map((ind) => {
      const row: string[] = [
        ind.varName,
        ind.category,
        ind.definition,
        ind.type,
        ind.aggregation,
      ];
```

To:
```typescript
    const rows = data.map((ind) => {
      const row: string[] = [
        ind.varName,
        ind.categoryId ?? "",
        ind.subCategoryId ?? "",
        ind.shortLabel,
        ind.definition,
        ind.type,
        ind.aggregation,
      ];
```

**File: `client/src/components/indicator_manager_hfa/hfa_indicators_csv_upload_form.tsx`**

#### 16.2 Update required headers (line 69):

Change from:
```typescript
      const requiredHeaders = ["varName", "category", "definition", "type", "aggregation"];
```

To:
```typescript
      const requiredHeaders = ["varName", "definition", "type", "aggregation"];
```

**Note:** `categoryId`, `subCategoryId`, and `shortLabel` are all optional in CSV upload. Empty string or missing column means null.

#### 16.3 Update indicator construction (lines 187-196):

Change from:
```typescript
        indicators.push({
          varName,
          category: row.category || "",
          definition: row.definition || "",
          type: normalizedType,
          aggregation: normalizedAgg,
          sortOrder: i,
          hasSyntaxError,
          codeConsistent,
        });
```

To:
```typescript
        indicators.push({
          varName,
          categoryId: row.categoryId || null,
          subCategoryId: row.subCategoryId || null,
          shortLabel: row.shortLabel || "",
          definition: row.definition || "",
          type: normalizedType,
          aggregation: normalizedAgg,
          sortOrder: i,
          hasSyntaxError,
          codeConsistent,
        });
```

#### 16.4 Update UI header display (lines 220-222):

Change from:
```typescript
          <div class="font-700 mt-2 ml-3 font-mono text-xs">
            varName, category, definition, type, aggregation
            {sortedTimePoints.map((_, k) => `, r_code_${k + 1}, r_filter_code_${k + 1}`).join("")}
          </div>
```

To:
```typescript
          <div class="font-700 mt-2 ml-3 font-mono text-xs">
            varName, categoryId*, subCategoryId*, shortLabel*, definition, type, aggregation
            {sortedTimePoints.map((_, k) => `, r_code_${k + 1}, r_filter_code_${k + 1}`).join("")}
          </div>
          <div class="mt-1 ml-3 text-xs opacity-60">
            {t3({ en: "* = optional", fr: "* = optionnel" })}
          </div>
```

---

### 17. State/Cache Updates

**File: `client/src/state/instance/t2_indicators.ts`**

Add cache functions for categories and sub-categories if caching is desired (follow existing pattern for `getHfaIndicatorsFromCacheOrFetch`).

---

### 18. Type Exports

**File: `lib/types/mod.ts`**

Add exports for new types:
```typescript
export type {
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorCategory,
  HfaIndicatorSubCategory,
  HfaDictionaryForValidation,
} from "./hfa_types.ts";
```

---

## Execution Order

1. Type definitions (`lib/types/hfa_types.ts`)
2. Disaggregation options (`lib/types/disaggregation_options.ts`) - add `hfa_sub_category`
3. Type exports (`lib/types/mod.ts`)
4. Instance DB migration (`server/db/migrations/instance/038_...`)
5. Project DB migration (`server/db/migrations/project/019_...`)
6. Live schema files (`_main_database.sql`, `_project_database.sql`)
7. Instance DB layer functions (`server/db/instance/hfa_indicators.ts`)
8. API route registry (`lib/api-routes/instance/hfa_indicators.ts`)
9. API routes (`server/routes/instance/hfa_indicators.ts`)
10. Project DB snapshot functions (`server/db/project/datasets_in_project_hfa.ts`)
11. getIndicatorMetadata (`server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`)
12. R script generation (`server/server_only_funcs/get_script_with_parameters_hfa.ts`)
13. HFA module results object (`wb-fastr-modules/m010/_results_objects.ts`)
14. HFA module R script (`wb-fastr-modules/m010/script.R`) - add `hfa_sub_category` to output
15. Client state/cache (`client/src/state/instance/t2_indicators.ts`)
16. Edit indicator form (`client/src/components/forms_editors/edit_hfa_indicator.tsx`)
17. HFA indicator code editor (`client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx`)
18. New category/sub-category editor components
19. Manager component (`client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`)
20. CSV upload/download updates

---

## Testing Checklist

- [ ] Server starts without migration errors
- [ ] Existing indicators with categories are migrated; empty categories become NULL
- [ ] Indicators with NULL category display "—" in table
- [ ] Can create/edit/delete categories
- [ ] Can create/edit/delete sub-categories
- [ ] Can reorder categories via drag-and-drop
- [ ] Can reorder sub-categories via drag-and-drop
- [ ] Can reorder indicators via drag-and-drop
- [ ] Indicator edit form shows category/sub-category dropdowns with "None" option
- [ ] Selecting "None" for category sets categoryId to null
- [ ] Sub-category dropdown is disabled when category is null
- [ ] Sub-category dropdown filters by selected category
- [ ] HFA indicator code editor shows category/sub-category dropdowns with "None" option
- [ ] CSV download includes new fields (`categoryId`, `subCategoryId`, `shortLabel`), empty for null
- [ ] CSV upload accepts new fields as optional (empty = null)
- [ ] Project snapshot exports denormalized data correctly with NULL handling
- [ ] getIndicatorMetadata returns category/sub-category labels for disaggregation dropdowns
- [ ] R script generation uses categoryId/subCategoryId (empty string for null)
- [ ] HFA modules run successfully with new indicator structure
- [ ] Presentation objects can disaggregate by `hfa_category` and `hfa_sub_category`
- [ ] Disaggregation dropdown shows correct labels (from category/sub-category tables)
