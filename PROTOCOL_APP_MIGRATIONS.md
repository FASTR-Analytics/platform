# PROTOCOL — App: Migrations & Stored-Schema Changes

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the *recipe* — read it when **building** a migration,
> schema change, or data transform. It is FASTR-specific, so it lives at repo
> root, not in `panther/protocols/`. The migration machinery's *ownership* and
> architecture belong to **S2 (Persistence)** — see `SYSTEM_02_persistence.md`;
> this file is the how-to.

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
    ├── slide_deck_config.ts
    ├── slide_config.ts
    ├── dashboard_config.ts
    ├── dashboard_items.ts
    ├── instance_config.ts
    ├── reports.ts
    └── _figure_block.ts   # shared: re-validates stored FigureBlock snapshots
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

### Skip-Gate Gotcha: Renames and Deleted Keys

The "already valid? skip" gate has a blind spot: zod object schemas in default
(strip) mode treat **unknown keys as valid**. A row whose only drift is a
legacy key (e.g. a field that was renamed) passes `safeParse`, so the rename
block never runs — and every runtime read silently strips the user's setting.

When a transform block renames or deletes a key, the sweep gate must force the
transform for rows still carrying the old key. See
`configNeedsForcedTransform` / `rawJsonNeedsForcedTransform` in
`data_transforms/po_config.ts` (used by the po_config, dashboard_items,
reports and slide_config sweeps — first for the `includeNational*` →
`adminAreaRollup*` rename, then for the
`includeAdminAreaRollup`/`adminAreaRollupPosition` → per-entry
`rollup`/`rollupPosition` move, then for the `specialScorecardTable` →
`cfMode: "indicator"` conversion), plus `rawJsonNeedsFigureBlockTransform` in
`_figure_block.ts` for the keys the figure-block transforms rewrite. There is
no metric or module-definition sweep: installed definitions are stored
parsed, and module presets reach the client from the run manifest. Add new
legacy keys to those helpers whenever a rename/delete block is added. Embedded configs are covered because
`transformFigureBlock` runs `transformPOConfigData` on BOTH `source.config`
and `bundle.config` — without the bundle half, the sweep's re-parse would
strip a legacy key from a bundle instead of migrating it.

### Cache Invalidation

Valkey caches use `last_updated` timestamps as version hashes (the full mechanics live in [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)). When a migration updates a row's `last_updated`:

1. Cache entry has old timestamp in version hash
2. Next request: DB returns new timestamp, cache has old
3. Version mismatch → cache miss → fresh data from DB

No explicit cache flush needed.

### Adding a Schema Change

1. **Add transform block** to the relevant migration function
2. **Update Zod schema** to new shape
3. **Deploy** — migration runs, boot validates

---

## Run Manifest Transforms

`server/runs/manifest_transform.ts` is the same pattern applied to a **file** —
a results package's `manifest.json` — instead of a DB column. Everything above
holds unchanged: one function per type, numbered blocks appended at the end and
never reordered, each idempotent and checking its own precondition,
`structuredClone` → mutate → `.parse`, and the no-op-write guard. It runs at
boot from `db_startup.ts` and again on the read path (`manifest_cache.ts`) for
packages that arrive after boot, using the same function.

Packages are immutable, so this is a deliberate amendment recorded in
SYSTEM_08 (the `manifestSchemaVersion` paragraph of the format spec):
**package outputs are immutable; the manifest is a derived descriptor and may
be transformed forward.** Without it a schema change
orphans every existing package, and "regenerate" is not a real remedy — it mints
a new `runId`, which marks every stored figure in the fleet stale.

Four things differ from a DB transform.

**1. Recompute only — never invent provenance.**

> A block may only RECOMPUTE from files already in the package. It may never
> invent provenance.

A DB transform only reshuffles fields inside the row it was handed, so it
*cannot* invent. A manifest block does file I/O, so it can. Therefore:

- **A field knowable only at generation time is nullable forever.** `createdAt`,
  `appVersion`, `rImageTag`, `label`, `provenance`, `calendar`, `countryIso3`,
  `structureSchemaHmis` / `structureSchemaHfa` (generation-only; copied forward
  from the legacy `facilityColumnsConfig` key by block 3, null for families not
  in the package), `datasets[]`, `modules[]`, `metrics[]`, `inputKey`,
  `outputFileHashes`. Carry them forward untouched; leave them null where they
  never existed. Never synthesize a plausible value.
- Recomputable, therefore fair game: `runId` (the directory name),
  `assets[].sha256`, `facilitiesTables[].columns`, `resultsObjects[]`,
  `metricAvailability[]`, `inputFiles[]`.
- **Whatever a block reads becomes a permanent part of the package format.** An
  input file a transform recomputes from can never be dropped.
- A recompute is a pure function of (package files × **app code**), not of the
  files alone — e.g. `getIndicatorMetadataFromRun` branches on
  `scriptGenerationType`. That is intended (see 2), but it means recomputed
  fields are not byte-stable across app versions.

**2. The forced gate is the version integer, and blocks run only behind it.**

A parse-only gate is wrong here. A manifest from a *newer* server parses under
the current schema with its additions silently stripped, so parse success cannot
distinguish "current shape" from "newer shape we would serve wrong". This is the
same **forced skip-gate** as `configNeedsForcedTransform`, reading a version
field instead of scanning for legacy keys:

```ts
if (
  runManifestSchema.safeParse(manifest).success &&
  manifest.manifestSchemaVersion === RUN_MANIFEST_SCHEMA_VERSION
) continue;
```

The corollary the gate imposes: a manifest already stamped current is
**skipped whole** — blocks do NOT re-evaluate on every boot. **A derivation
fix therefore requires a `RUN_MANIFEST_SCHEMA_VERSION` bump**, or it reaches
only packages that arrive after the deploy. The v3→v4 bump is the worked
example: block 2 rewrites `metrics[].format_as` for the 8 pre-declaration
metrics, and block 1's catalog recompute re-runs on the same forced pass for
free.

**Each block stamps the version it produces, inside the block** (block 1
stamps 3, block 2 stamps 4). `runManifestSchema` deliberately accepts **any**
integer version — it has to, so a newer manifest is detected rather than
rejected as malformed — so the version is asserted separately after the
blocks run. Because the stamps live inside the blocks, a manifest still below
current after every block ran means the block for that step is genuinely
missing: a code defect, and boot fails. (A single trailing stamp would mask
exactly that.)

**3. The boot sweep enumerates the `runs` catalogue, never the filesystem.**

The runs volume is shared and heterogeneous: legacy `{projectId}` sandbox dirs
(left entirely alone — Phase 4 owns removing them), published-failed dirs,
`.tmp-` dirs, `.duckdb-spill`, loose `restore_*.sql.gz`. Catalogue enumeration
excludes all of them by construction and preserves the ruling that justified
sharing the directory: *every consumer addresses a NAMED entry.* Statuses
`generating` and `failed` are excluded too — those definitionally have no
manifest, so sweeping them would warn on every boot about a state working as
designed.

**4. Failure policy — operational fault vs code defect.**

| Case | Meaning | Policy |
| --- | --- | --- |
| `manifest.json` absent | Directory missing, or a published-failed generation dir | **Operational.** Skip, logged. Read path degrades as today. |
| Present, not parseable JSON | Truncated write, half-finished rsync | **Operational.** Same. |
| Parses, fails `runManifestSchema` | Real shape drift | Force the transform. Still invalid after → **fail-stop boot.** |
| Version **below** current | Same drift, no parse failure | Same as above. |
| Version **above** current | Data *not for this server* | Refuse that package (unavailable). Boot continues. |
| A LISTED **input mirror** absent, unreadable, or not parseable JSON | Half-restored backup, truncated write | **Operational.** `RunInputReadError` → the `unreadable` outcome: that package degrades to unavailable, boot proceeds. |
| Input mirror parses as JSON but fails its **row schema** | Real shape drift — a row schema changed without a migration | `RunInputRowSchemaError`. Nothing catches it → **fail-stop boot.** |

The two **input-mirror** rows are the twin of the manifest not-parseable and
schema-drift rows, and they must stay apart. Wrapping both in
`RunInputReadError` (as the first cut did) meant a code defect silently marked
every affected package unavailable fleet-wide with the deploy looking green —
the exact outcome the fail-stop rows exist to prevent. Both classes are raised
in `runDirInputRowsReader` (`server/runs/indicator_catalog.ts`) and
discriminated in `transformRunManifestFile`.

The two **version** rows are principle 4 unchanged. The **absent / unreadable**
rows — manifest or input mirror — must not fail boot, and the reason is
concrete: backups are pg dumps, so a restore
brings `runs` catalogue rows back while the package directories are still
absent. The existing degrade paths are deliberate and stay — `getRunReadContext`
returns a typed "Results run unavailable", and `projects.ts` degrades the
project shell to empty lists on purpose so authored decks, reports and
dashboards stay reachable. Do not "fix" that catch. Consequence to accept: on
the **load** path a shape-drift defect also lands in that catch, so it is
visible only in the log.

### Writing to the package

Transform in memory, `.parse`, **then** persist — there is nothing to restore
from if it fails. Write `.tmp-manifest-{crypto.randomUUID()}.json` in the
package dir and rename over `manifest.json`; a unique name, never a fixed one,
so two writers can never share a temp file. `sweepAbandonedTmpRunDirs` matches
*directories*, so a leftover temp manifest has no sweeper — clean up in a
`finally`. Retain the pre-transform file as `manifest.v{n}.json`: that is what
makes both a bad block and an image rollback recoverable.

No lock is needed, on this premise: `await dbStartUp()` is top-level in
`main.ts` before any serving begins, and every `getRunManifestCached` caller is
main-realm — no Web Worker reads a manifest. Re-check if one ever does.

`runs.summary` is **not** touched. `RunSummary.manifestSchemaVersion` is
display-only provenance of how the package was originally written and is read by
nothing. A naive "refresh" would rebuild the summary from the manifest and wipe
three fields deliberately not in it — `attachTargetProjectIds` (read
structurally by the launch concurrency guard), `backfillSourceProjectId`, and
`diskSizeBytes`.

### Checklist for adding a block

- [ ] Append the block at the end, numbered, idempotent, precondition-checked
- [ ] Add it to the `TRANSFORM BLOCKS:` list in the file header
- [ ] Bump `RUN_MANIFEST_SCHEMA_VERSION` and update the Zod schema
- [ ] Recompute only — check every field you touch against the list in 1
- [ ] Bump `PO_CACHE_VERSION` and the `_PO_DETAIL_CACHE` key prefix in
      `server/routes/caches/visualizations.ts`. The first three PO caches key on
      `PO_CACHE_VERSION` (a code dimension, which the manifest now is); the
      detail cache keys on `presentationObjectLastUpdated|runId` with no code
      dimension, so it needs the prefix bump instead
- [ ] Audit the **fourth** persistence layer: a manifest field can additionally
      be snapshotted into stored `FigureBundle`s, which needs its own data
      transform with a forced skip-gate

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

| Table.Column                  | File                                        | Functions                                                                                                     | Schema                            |
|-------------------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------|-----------------------------------|
| `presentation_objects.config` | `server/db/project/presentation_objects.ts` | `addPresentationObject`, `updatePresentationObjectConfig`, `batchUpdatePresentationObjectsPeriodFilter`       | `presentationObjectConfigSchema`  |
| `presentation_objects.config` | `server/db/project/presentation_objects.ts` | `duplicatePresentationObject`                                                                                 | (copies validated row)            |
| `slide_decks.config`          | `server/db/project/slide_decks.ts`          | `createSlideDeck`, `duplicateSlideDeck`, `updateSlideDeckConfig`                                              | `slideDeckConfigSchema`           |
| `slides.config`               | `server/db/project/slides.ts`               | `createSlide`, `updateSlide`                                                                                  | `slideConfigSchema`               |
| `instance_config.*`           | `server/db/instance/config.ts`              | `setStructureSchema`, `updateAdminAreaLabelsConfig`                                                           | Type-specific schemas             |

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

| Boundary                    | Location                              | Schema                           | Notes                                                     |
|-----------------------------|---------------------------------------|----------------------------------|-----------------------------------------------------------|
| GitHub module definitions   | `server/module_loader/load_module.ts` | `moduleDefinitionGithubSchema`   | Validated at fetch time, throws on invalid                |
| User form input (PO config) | Routes → DB functions                 | `presentationObjectConfigSchema` | DB functions validate before write                        |
| API request bodies          | Routes → DB functions                 | Various                          | All stored schema writes validate in DB layer             |
| DHIS2 imports               | `server/dhis2/`                       | N/A                              | Imports structure/analytics data, not stored JSON schemas |
| CSV uploads                 | `server/worker_routines/stage_*`      | Row validation                   | Stages raw data, not stored JSON schemas                  |

**Note:** Routes don't need separate validation because all writes to stored schemas go through DB functions that validate before INSERT/UPDATE.

**See also:** [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) for how AI tool inputs are validated before handlers run.

---

## SQL Migrations

For table/column structure changes.

Location: `server/db/migrations/instance/` and `server/db/migrations/project/`

Naming: `NNN_description.sql`

### The Golden Rule: Idempotency

**Every migration must be idempotent.** Running the same migration twice must produce the same result as running it once. The base schema (`_main_database.sql`, `_project_database.sql`) represents the current state — migrations run on top of it, so they must handle the case where their changes already exist.

Common patterns:

| Operation | Idempotent Pattern |
|-----------|-------------------|
| Create table | `CREATE TABLE IF NOT EXISTS` |
| Add column | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| Drop column | `ALTER TABLE ... DROP COLUMN IF EXISTS` |
| Create index | `CREATE INDEX IF NOT EXISTS` |
| Drop table | `DROP TABLE IF EXISTS` |
| Insert seed data | `INSERT ... ON CONFLICT DO NOTHING` |
| Rename column | Wrap in `DO $$ ... END $$` with existence check |
| Add constraint | Wrap in `DO $$ ... END $$` checking `pg_constraint` |
| Complex logic | Use `DO $$ BEGIN ... END $$` with `IF EXISTS` checks |

Example — renaming a column safely:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'my_table' AND column_name = 'old_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'my_table' AND column_name = 'new_name') THEN
    ALTER TABLE my_table RENAME COLUMN old_name TO new_name;
  END IF;
END $$;
```

Example — adding a constraint safely:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'my_constraint_name') THEN
    ALTER TABLE my_table ADD CONSTRAINT my_constraint_name CHECK (...);
  END IF;
END $$;
```

### Other Rules

- Update live schema files too (`_main_database.sql`, `_project_database.sql`)
- Don't rewrite old migrations — fix forward
- **Always run `./validate_migrations` after adding or modifying SQL migrations**
- SQL-safety (parameterize values, whitelist identifiers, `.unsafe()` on trusted-internal input only) is owned by [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) — migration files are repo-authored SQL run via `.unsafe()`, so never build them from runtime input

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

| Data                          | Schema Location                             | Table                               |
|-------------------------------|---------------------------------------------|-------------------------------------|
| Presentation object config    | `lib/types/_presentation_object_config.ts`  | `presentation_objects.config`       |
| Module definition (installed) | `lib/types/_module_definition_installed.ts` | `modules.module_definition`         |
| Metric (full row)             | `lib/types/_metric_installed.ts`            | `metrics.*`                         |
| Metric AI description         | `lib/types/_metric_installed.ts`            | `metrics.ai_description`            |
| Metric viz presets            | `lib/types/_metric_installed.ts`            | `metrics.viz_presets`               |
| Viz config (d/s schemas)      | `lib/types/_metric_installed.ts`            | (embedded in above + PO config)     |
| Slide deck config             | `lib/types/_slide_deck_config.ts`           | `slide_decks.config`                |
| Slide config                  | `lib/types/_slide_config.ts`                | `slides.config`                     |
| Dashboard config              | `lib/types/_dashboard_config.ts`            | `dashboards.config`                 |
| Report config                 | `lib/types/reports.ts`                      | `reports.config`                    |
| Instance configs              | `lib/types/instance.ts`                     | `instance_config.config_json_value` |

(`instance.ts` is the kernel grab-bag — the instance-config Zod schemas live there by symbol, not in a dedicated `_instance_config.ts`.)

### GitHub-Authored Schemas

Module definitions fetched from GitHub use a strict schema with no drift tolerance:

Location: `lib/types/_module_definition_github.ts`

Authored `definition.json` files must match the current shape exactly. Invalid files fail at fetch time with clear error paths. No silent normalization.

**"No silent normalization" bans coercion, not breadth.** The rule is about the schema quietly changing what it parsed — `.transform()`, `z.preprocess()`, defaulting a missing field — so that the value a caller receives is not the value the file contained. Declaring a union because the boundary genuinely accepts two shapes is not a violation: the schema still states exactly what is valid, and nothing is rewritten behind the caller's back. When two accepted shapes must converge on one internal form, the narrowing belongs in a named, exported function that consumers call explicitly (see `getAssetName` for `assetsToImport`), never inside the schema.

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
