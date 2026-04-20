# Legacy & Migration Handling

Single source of truth for **how schema changes are handled and how data integrity is enforced.**

---

## Principles

1. **All drift is fixed at deploy time.** Runtime code only sees current-shape data.
2. **One pattern:** Startup migrations transform stored data. No runtime adapters.
3. **Validate at boundaries:** User input, AI output, external imports. Trust the database.
4. **Fail fast:** Startup sweep validates all stored data. Boot fails if anything is invalid.

---

## The System

### Schema Changes

When you change a stored schema (add field, rename field, change structure):

1. **Add a transform block** to the migration function for that type
2. **Update the Zod schema** to reflect new shape
3. **Ship.** Migration runs at startup, validates, done.

No runtime adapters. No z.preprocess. No dual-checks scattered across read sites.

### Data Flow

```
[Deploy]
    │
    ▼
SQL migrations run (schema changes)
    │
    ▼
Data migrations run (per-type, per-row validation + transform)
    │
    ▼
Boot completes (or fails if any validation fails)
    │
    ▼
[Runtime]
    │
    ├─► DB reads: JSON.parse() + type assertion (trusted)
    ├─► DB writes: Zod validation before INSERT/UPDATE
    └─► External input: Zod validation (user, AI, imports)
```

---

## Migration System

### Directory Structure

```
server/db/migrations/
├── instance/              # SQL - main DB schema
├── project/               # SQL - project DB schema  
└── data_transforms/       # JS - one file per data type
    ├── po_config.ts
    ├── module_definition.ts
    ├── metrics_columns.ts
    ├── slide_deck_config.ts
    └── slide_config.ts
```

### How It Works

Each stored data type has one migration function. At startup:

1. Function runs in its own transaction
2. Reads all rows of that type
3. For each row: validates against current Zod schema
   - If valid: skip (already current-shape)
   - If invalid: apply transforms, validate result, write
4. If any row fails validation after transforms: transaction rolls back, boot fails

No `schema_migrations` tracking needed — the validation check itself determines if work is needed.

### Writing a Migration Function

```ts
// server/db/migrations/data_transforms/po_config.ts
import { presentationObjectConfigSchema } from "lib";
import type { Sql } from "postgres";

export async function migratePOConfigs(tx: Sql): Promise<void> {
  const rows = await tx`SELECT id, config FROM presentation_objects`;
  const now = new Date().toISOString();
  
  for (const row of rows) {
    const config = JSON.parse(row.config);
    
    // Already valid? Skip.
    if (presentationObjectConfigSchema.safeParse(config).success) {
      continue;
    }
    
    // Transform (idempotent blocks)
    let transformed = { ...config };
    
    // Block 1: periodOpt → timeseriesGrouping
    if (transformed.d?.periodOpt !== undefined) {
      transformed.d.timeseriesGrouping = transformed.d.periodOpt;
      delete transformed.d.periodOpt;
    }
    
    // Block 2: diffAreas → specialDisruptionsChart
    if (transformed.s?.diffAreas !== undefined) {
      transformed.s.specialDisruptionsChart = transformed.s.diffAreas === true;
      delete transformed.s.diffAreas;
    }
    
    // Future blocks go here...
    
    // Validate — throws if invalid, rolls back transaction
    const validated = presentationObjectConfigSchema.parse(transformed);
    
    // Write + update last_updated (invalidates cache)
    await tx`
      UPDATE presentation_objects 
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
  }
}
```

**Rules:**

- One function per data type
- Transform blocks are idempotent — safe to re-run on already-transformed data
- Always validates against **current** schema — no schema versioning problem
- When schema evolves, add new blocks; old blocks remain as no-ops
- **Update `last_updated`** — invalidates Valkey cache entries automatically

### Cache Invalidation

Valkey caches use `last_updated` timestamps as version hashes. When a migration updates a row's `last_updated`:

1. Cache entry has old timestamp in version hash
2. Next request: DB returns new timestamp, cache has old
3. Version mismatch → cache miss → fresh data from DB

No explicit cache flush needed.

### Adding a Schema Change

1. **Add transform block** to the relevant migration function
2. **Update Zod schema** to new shape
3. **Deploy** — migration runs, boot validates

---

## Validation

### Startup Validation

Validation happens during migration. For each row:
- If it passes current schema validation → skip (no transform needed)
- If it fails → transform → validate again → write

If any row fails validation after transforms: transaction rolls back, boot fails with error log.

This catches:
- Schema drift (data valid under old schema, invalid under new)
- Migration bugs (transform didn't work correctly)
- Manual SQL tampering

### Write-Time Validation

Before INSERT/UPDATE, validate against Zod schema:

```ts
await projectDb`
  INSERT INTO presentation_objects (id, config, ...)
  VALUES (${id}, ${JSON.stringify(presentationObjectConfigSchema.parse(config))}, ...)
`;
```

Invalid data cannot enter the database through the application.

### Read-Time

No validation. Trust the database.

```ts
export function parsePresentationObjectConfig(raw: string): PresentationObjectConfig {
  return JSON.parse(raw) as PresentationObjectConfig;
}
```

The startup sweep already validated this data. Write-time validation ensures only valid data enters.

### External Boundaries

Always validate input from outside the system:

| Source | Validation |
|--------|------------|
| User form input | Zod schema before processing |
| AI-generated content | Zod schema before storage |
| DHIS2 imports | Zod schema before storage |
| CSV uploads | Validation during staging |
| API request bodies | Zod schema in route handler |

---

## SQL Migrations

For column/table schema changes. Existing system, unchanged.

Location: `server/db/migrations/instance/` and `server/db/migrations/project/`

Naming: `NNN_description.sql`

**Rules:**
- Idempotent: `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`
- Update live schema files too (`_main_database.sql`, `_project_database.sql`)
- Don't rewrite old migrations — fix forward

**Use SQL migrations for:** Adding columns, creating tables, adding indexes, constraints.

**Use JS migrations for:** Transforming data in JSON columns.

---

## Stored Data Schemas

### Naming Convention

**Underscore-prefixed files** (`_*.ts`) contain Zod schemas for data stored in the database. Each file:

- Defines one primary Zod schema (the source of truth)
- Exports runtime types via `z.infer<>`
- May include a parse helper and legacy adapter (until Phase 5 removes adapters)

Non-prefixed type files contain plain TypeScript types that are not stored/validated schemas.

### Locations

| Data | Schema Location | Table |
|------|-----------------|-------|
| Presentation object config | `lib/types/_presentation_object_config.ts` | `presentation_objects.config` |
| Module definition (installed) | `lib/types/_module_definition_installed.ts` | `modules.module_definition` |
| Metric (full row) | `lib/types/_metric_installed.ts` | `metrics.*` |
| Metric AI description | `lib/types/_metric_installed.ts` | `metrics.ai_description` |
| Metric viz presets | `lib/types/_metric_installed.ts` | `metrics.viz_presets` |
| Viz config (d/s schemas) | `lib/types/_metric_installed.ts` | (embedded in above + PO config) |
| Slide deck config | `lib/types/_slide_deck_config.ts` | `slide_decks.config` |
| Slide config | `lib/types/_slide_config.ts` | `slides.config` |
| Instance configs | `lib/types/instance_config.ts` | `instance_config.config_json_value` |

**Note:** `report_items.config` is excluded — reports are deprecated. Legacy adapters remain for the migration tool only.

### GitHub-Authored Schemas

Module definitions fetched from GitHub use a strict schema with no drift tolerance:

Location: `lib/types/_module_definition_github.ts`

Authored `definition.json` files must match the current shape exactly. Invalid files fail at fetch time with clear error paths. No silent normalization.

---

## Adding a New Stored Schema

1. **Define the Zod schema** in `lib/types/`
2. **Add parse helper** (just JSON.parse + cast)
3. **Create migration function** in `server/db/migrations/data_transforms/`
4. **Wire into startup** in `server/db_startup.ts`
5. **Use schema for writes** — validate before INSERT/UPDATE

---

## Process: Schema Change Checklist

When changing a stored schema:

- [ ] Add transform block to the migration function for that type
- [ ] Update Zod schema to new shape
- [ ] Update GitHub schema if applicable (must stay in sync)
- [ ] Test migration against real data shapes
- [ ] Deploy — migration runs at startup, validates
- [ ] After all deployments migrated: optionally remove old field from schema

---

## What NOT to Do

- **No runtime adapters.** Don't use z.preprocess for drift handling.
- **No dual-checks.** Don't scatter `newField || oldField` across read sites.
- **No permissive fallbacks.** Don't silently return defaults for invalid data.
- **No read-time validation.** Trust the database after startup sweep.

---

## FAQ

**Q: What if a migration is slow on large datasets?**

A: First startup after schema change may take time. Subsequent startups are fast (valid rows are skipped). For very large datasets, consider running during maintenance window.

**Q: Can I roll back a migration?**

A: Data migrations are forward-only. If you need to reverse a change, add a new transform block. Code can be rolled back safely — the data shape is still valid.

**Q: What if I find invalid data in production?**

A: Boot would have failed if data was invalid. If you somehow have invalid data:
1. Add a transform block to fix it
2. Deploy — migration transforms invalid rows

**Q: Can I delete old transform blocks?**

A: Only when no deployment could ever see data in the old shape. In practice: keep them. They're no-ops for already-migrated data and serve as documentation.

**Q: What if one instance fails but another succeeds?**

A: Each instance validates independently. If Instance B fails:
1. Instance B's transaction rolls back, boot fails
2. Fix the transform block to handle the edge case
3. Redeploy — Instance A skips (already valid), Instance B runs fixed transform
