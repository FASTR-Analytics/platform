# Migrations & Validation

How database and data changes are handled and how data integrity is enforced.

Two types of migrations:

- **SQL migrations** — table/column structure changes
- **JSON data transforms** — transforming JSON data stored in columns

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
SQL migrations run (table/column changes)
    │
    ▼
JSON data transforms run (per-type, per-row validation + transform)
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

## JSON Data Transforms

### Directory Structure

```text
server/db/migrations/
├── instance/              # SQL migrations - main DB
├── project/               # SQL migrations - project DBs
└── data_transforms/       # JSON data transforms - one file per type
    ├── po_config.ts
    ├── module_definition.ts
    ├── metric.ts
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

See `server/db/migrations/data_transforms/po_config.ts` for a complete example.

The pattern:

1. Read all rows
2. For each row: validate against current strict schema
3. If valid: skip (already current-shape)
4. If invalid: apply transforms to bring data up to current shape, validate, write

Transform blocks are historical — they handle old data shapes from before a schema change. Once all data is migrated, they become no-ops (the "if valid: skip" branch is always taken).

**Rules:**

- One function per data type
- Transform blocks are idempotent — safe to re-run
- Always validates against **current** strict schema
- **Update `last_updated`** — invalidates Valkey cache entries automatically

### Transform Block Ordering

**CRITICAL: Blocks must be sequential and ordered.**

1. **Number blocks sequentially** — `// Block 1:`, `// Block 2:`, etc.
2. **New blocks go at the END** — after all existing blocks, before final validation
3. **Blocks run in order** — Block 2 may depend on Block 1 having run first
4. **Never reorder existing blocks** — later blocks may depend on earlier ones
5. **Each block is idempotent** — checks its own precondition before acting

Example structure:

```typescript
// Already valid? Skip entire transform.
if (schema.safeParse(config).success) {
  continue;
}

// Block 1: Fill missing field X (oldest migration)
if (!("fieldX" in config)) {
  config.fieldX = "default";
}

// Block 2: Rename fieldY → fieldZ
if ("fieldY" in config && !("fieldZ" in config)) {
  config.fieldZ = config.fieldY;
  delete config.fieldY;
}

// Block 3: Transform fieldA → fieldB (newest migration)
if ("fieldA" in config && !("fieldB" in config)) {
  config.fieldB = transformFieldA(config.fieldA);
  delete config.fieldA;
}

// Final validation and write
const validated = schema.parse(config);
```

**Why order matters:** Block 3 might transform a field that Block 1 filled in. If you put Block 3 before Block 1, old data without the field would fail.

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

Before INSERT/UPDATE, validate against Zod schema. Invalid data cannot enter the database.

**Catalog of write paths:**

| Table.Column | File | Functions | Schema |
|--------------|------|-----------|--------|
| `presentation_objects.config` | `server/db/project/presentation_objects.ts` | `addPresentationObject`, `updatePresentationObjectConfig`, `batchUpdatePresentationObjectsPeriodFilter` | `presentationObjectConfigSchema` |
| `presentation_objects.config` | `server/db/project/presentation_objects.ts` | `duplicatePresentationObject` | (copies validated row) |
| `presentation_objects.config` | `server/db/project/modules.ts` | `installModule`, `updateModuleDefinition` | `presentationObjectConfigSchema` |
| `modules.module_definition` | `server/db/project/modules.ts` | `installModule`, `updateModuleDefinition` | `moduleDefinitionInstalledSchema` |
| `metrics.*` | `server/db/project/modules.ts` | `installModule`, `updateModuleDefinition` | `metricStrict` |
| `slide_decks.config` | `server/db/project/slide_decks.ts` | `createSlideDeck`, `duplicateSlideDeck`, `updateSlideDeckConfig` | `slideDeckConfigSchema` |
| `slides.config` | `server/db/project/slides.ts` | `createSlide`, `updateSlide` | `slideConfigSchema` |
| `instance_config.*` | `server/db/instance/config.ts` | `updateMaxAdminArea`, `updateFacilityColumnsConfig`, `updateCountryIso3Config`, `updateAdminAreaLabelsConfig` | Type-specific schemas |

**Note:** `slideDeckConfigSchema` and `slideConfigSchema` are currently `z.unknown()` stubs. Validation is wired up but accepts anything until real schemas are defined.

### Read-Time

Trust the database. Parse helpers can optionally validate as defense-in-depth, but do not transform:

```ts
export function parsePresentationObjectConfig(raw: string): PresentationObjectConfig {
  return presentationObjectConfigSchema.parse(JSON.parse(raw));
}
```

The startup sweep already validated this data. Write-time validation ensures only valid data enters. Read-time validation is optional extra safety — it catches edge cases but should never trigger in practice.

### External Boundaries

External input is validated at the point it enters the system:

| Boundary | Location | Schema | Notes |
|----------|----------|--------|-------|
| GitHub module definitions | `server/module_loader/load_module.ts` | `moduleDefinitionGithubSchema` | Validated at fetch time, throws on invalid |
| User form input (PO config) | Routes → DB functions | `presentationObjectConfigSchema` | DB functions validate before write |
| API request bodies | Routes → DB functions | Various | All stored schema writes validate in DB layer |
| DHIS2 imports | `server/dhis2/` | N/A | Imports structure/analytics data, not stored JSON schemas |
| CSV uploads | `server/worker_routines/stage_*` | Row validation | Stages raw data, not stored JSON schemas |

**Note:** Routes don't need separate validation because all writes to stored schemas go through DB functions that validate before INSERT/UPDATE.

**See also:** [DOC_AI_TOOL_VALIDATION.md](DOC_AI_TOOL_VALIDATION.md) for how AI tool inputs are validated before handlers run.

---

## SQL Migrations

For table/column structure changes.

Location: `server/db/migrations/instance/` and `server/db/migrations/project/`

Naming: `NNN_description.sql`

**Rules:**

- Idempotent: `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`
- Update live schema files too (`_main_database.sql`, `_project_database.sql`)
- Don't rewrite old migrations — fix forward

**Use SQL migrations for:** Adding columns, creating tables, adding indexes, constraints.

**Use JSON data transforms for:** Transforming data in JSON columns.

---

## Stored Data Schemas

### Naming Convention

**Underscore-prefixed files** (`_*.ts`) contain Zod schemas for data stored in the database. Each file:

- Defines one primary Zod schema (the source of truth)
- Exports runtime types via `z.infer<>`
- May include a parse helper for convenience

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

## What to Do If You Want to Change a Schema-Validated Type

1. **Find the Zod schema** — underscore-prefixed files in `lib/types/` (e.g., `_presentation_object_config.ts`)
2. **Update the schema** to the new shape
3. **Find the data transform** — matching file in `server/db/migrations/data_transforms/`
4. **Add a transform block** that converts old shape → new shape
5. **Deploy** — transform runs on existing data, schema validates new writes

Example: adding a required field `sortOrder` to presentation objects:

```ts
// 1. Update lib/types/_presentation_object_config.ts
sortOrder: z.number().int(),

// 2. Add transform in server/db/migrations/data_transforms/po_config.ts
if (config.sortOrder === undefined) {
  config.sortOrder = 0; // default for existing rows
}
```

**Tip:** The transform only needs to handle data shapes that exist in production. Check actual data before writing transforms.

---

## What to Do If Server Startup Fails Because of Validation

This will happen when you deploy a schema change and existing data doesn't match the new shape.

1. **Check the error log** — it shows which data transform failed and which row caused the issue
2. **Identify the old data shape** — look at the failing row to understand what needs to transform
3. **Add a transform block** to the relevant file in `server/db/migrations/data_transforms/`
4. **Redeploy** — the transform runs, fixes the data, boot succeeds

Example: if `po_config.ts` fails because old rows have `filterType: "all"` but new schema expects `filterType: "none"`:

```ts
// In server/db/migrations/data_transforms/po_config.ts
if (config.d.periodFilter?.filterType === "all") {
  config.d.periodFilter.filterType = "none";
}
```

The transform only runs on rows that fail validation. Already-valid rows are skipped.

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
