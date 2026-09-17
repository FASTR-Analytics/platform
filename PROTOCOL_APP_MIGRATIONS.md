# PROTOCOL (App): Migrations & Stored-Schema Changes

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the *recipe*. Read it when **building** a migration,
> schema change, or data transform. It is FASTR-specific, so it lives at repo
> root, not in `panther/protocols/`. The migration machinery's *ownership* and
> architecture belong to **S2 (Persistence)**: see `SYSTEM_02_persistence.md`;
> this file is the how-to.

How database and data changes are handled and how data integrity is enforced.

Two types of migrations:

- **SQL migrations**: table/column structure changes
- **JSON data transforms**: transforming JSON data stored in columns

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
├── runner.ts              # the migration runner and TS_MIGRATIONS
├── instance/              # SQL and TypeScript migrations - the main DB
├── consolidation/         # plan.ts + execute.ts: the body of migration 091
└── data_transforms/       # JSON data transforms - one file per type
    ├── instance_config.ts
    ├── runs_summary.ts
    ├── slide_deck_config.ts
    ├── slide_config.ts
    ├── reports.ts
    ├── po_config.ts       # figure-config transform library, no table of its own
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

No `schema_migrations` tracking needed. The validation check itself determines if work is needed.

The functions are wired into `INSTANCE_DATA_TRANSFORMS` in
`server/db_startup.ts` and run in its order: `instance_config`,
`runs_summary`, `slide_deck_config`, `slide_config`, `reports`. Each has the
signature `(tx: Sql, countryIso3: string) => Promise<MigrationStats>`; a
function that does not need the country may declare `tx` alone. `tx` is the
function's own transaction on `main`. `countryIso3` is the instance country,
which the figure-block sweeps stamp into backfilled bundles.

A transform for product JSON (a deck config, a slide, a report column) goes
in the product's existing function: `slide_deck_config.ts`, `slide_config.ts`
or `reports.ts`. A new product type or a new stored column that no function
reads gets its own function, appended to `INSTANCE_DATA_TRANSFORMS` after the
functions whose output it reads.

### Writing a Migration Function

See `server/db/migrations/data_transforms/reports.ts` for a complete example.

The pattern:

1. Read all rows
2. For each row: validate against current strict schema
3. If valid: skip (already current-shape)
4. If invalid: apply transforms to bring data up to current shape, validate, write

Transform blocks are historical: they handle old data shapes from before a schema change. Once all data is migrated, they become no-ops (the "if valid: skip" branch is always taken).

**Rules:**

- One function per data type
- Transform blocks are idempotent, safe to re-run
- Always validates against **current** strict schema
- **Update `last_updated`**: invalidates Valkey cache entries automatically.
  The product transforms bump the owning `products.last_updated` on every row
  they rewrite (`slide_config` also bumps `slides.last_updated`). `slide_config`
  and `reports` also skip the write when the output is byte-identical to the
  stored row; `slide_deck_config` writes every row its gate lets through

### Transform Block Ordering

**CRITICAL: Blocks must be sequential and ordered.**

1. **Number blocks sequentially**: `// Block 1:`, `// Block 2:`, etc.
2. **New blocks go at the END**, after all existing blocks, before final validation
3. **Blocks run in order**: Block 2 may depend on Block 1 having run first
4. **Never reorder existing blocks**: later blocks may depend on earlier ones
5. **Each block is idempotent**, checking its own precondition before acting

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
block never runs, and every runtime read silently strips the user's setting.

When a transform block renames or deletes a key, the sweep gate must force the
transform for rows still carrying the old key. See
`rawJsonNeedsForcedTransform` in
`data_transforms/po_config.ts` (used by the reports and slide_config sweeps,
first for the `includeNational*` →
`adminAreaRollup*` rename, then for the
`includeAdminAreaRollup`/`adminAreaRollupPosition` → per-entry
`rollup`/`rollupPosition` move, then for the `specialScorecardTable` →
`cfMode: "indicator"` conversion), plus `rawJsonNeedsFigureBlockTransform` in
`_figure_block.ts` for the keys the figure-block transforms rewrite. There is
no metric or module-definition sweep: installed definitions are stored
parsed, and module presets reach the client from the run manifest. Add new
legacy keys to those helpers whenever a rename/delete block is added. Embedded configs are covered because
`transformFigureBlock` runs `transformPOConfigData` on BOTH `source.config`
and `bundle.config`. Without the bundle half, the sweep's re-parse would
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
3. **Deploy**: migration runs, boot validates

---

## Run Manifest Transforms

`server/runs/manifest_transform.ts` is the same pattern applied to a **file**
(a results package's `manifest.json`) instead of a DB column. Everything above
holds unchanged: one function per type, numbered blocks appended at the end and
never reordered, each idempotent and checking its own precondition,
`structuredClone` → mutate → `.parse`, and the no-op-write guard. It runs at
boot from `db_startup.ts` and again on the read path (`manifest_cache.ts`) for
packages that arrive after boot, using the same function.

Packages are immutable, so this is a deliberate amendment recorded in
SYSTEM_08 (the `manifestSchemaVersion` paragraph of the format spec):
**package outputs are immutable; the manifest is a derived descriptor and an
input mirror's vocabulary is the app's, and both may be transformed forward.**
Without it a schema change
orphans every existing package, and "regenerate" is not a real remedy. It mints
a new `runId`, which marks every stored figure in the fleet stale.

Four things differ from a DB transform.

**1. Recompute only, never invent provenance.**

> A block may only RECOMPUTE from files already in the package. It may never
> invent provenance. Input mirrors are brought to the current vocabulary
> before any block reads them (§ Run Input Transforms).

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
  files alone, e.g. `getIndicatorMetadataFromRun` branches on
  `scriptGenerationType`. That is intended (see 2), but it means recomputed
  fields are not byte-stable across app versions.

**2. The forced gate is the version integer, and blocks run only behind it.**

A parse-only gate is wrong here. A manifest from a *newer* server parses under
the current schema with its additions silently stripped, so parse success cannot
distinguish "current shape" from "newer shape we would serve wrong". This is the
same **forced skip-gate** as `rawJsonNeedsForcedTransform`, reading a version
field instead of scanning for legacy keys:

```ts
if (
  runManifestSchema.safeParse(manifest).success &&
  manifest.manifestSchemaVersion === RUN_MANIFEST_SCHEMA_VERSION
) continue;
```

The corollary the gate imposes: a manifest already stamped current is
**skipped whole**: blocks do NOT re-evaluate on every boot. **A derivation
fix therefore requires a `RUN_MANIFEST_SCHEMA_VERSION` bump**, or it reaches
only packages that arrive after the deploy. The v3→v4 bump is the worked
example: block 2 rewrites `metrics[].format_as` for the 8 pre-declaration
metrics, and block 1's catalog recompute re-runs on the same forced pass for
free.

**Each block stamps the version it produces, inside the block** (block 1
stamps 3, block 2 stamps 4). `runManifestSchema` deliberately accepts **any**
integer version (it has to, so a newer manifest is detected rather than
rejected as malformed), so the version is asserted separately after the
blocks run. Because the stamps live inside the blocks, a manifest still below
current after every block ran means the block for that step is genuinely
missing: a code defect, and boot fails. (A single trailing stamp would mask
exactly that.)

**3. The boot sweep enumerates the `runs` catalogue, never the filesystem.**

The runs volume is heterogeneous: package dirs, published-failed dirs,
`.tmp-` dirs, `.duckdb-spill`, loose scratch files (`iceh_indicators_*.xlsx`,
and `restore_*.sql.gz` left by the retired in-app restore). Catalogue enumeration
excludes all of them by construction and preserves the ruling that justified
sharing the directory: *every consumer addresses a NAMED entry.* Statuses
`generating` and `failed` are excluded too: those definitionally have no
manifest, so sweeping them would warn on every boot about a state working as
designed.

**4. Failure policy: operational fault vs code defect.**

| Case | Meaning | Policy |
| --- | --- | --- |
| `manifest.json` absent | Directory missing, or a published-failed generation dir | **Operational.** Skip, logged. Read path degrades as today. |
| Present, not parseable JSON | Truncated write, half-finished rsync | **Operational.** Same. |
| Parses, fails `runManifestSchema` | Real shape drift | Force the transform. Still invalid after → **fail-stop boot.** |
| Version **below** current | Same drift, no parse failure | Same as above. |
| Version **above** current | Data *not for this server* | Refuse that package (unavailable). Boot continues. |
| A LISTED **input mirror** absent, unreadable, or not parseable JSON | Half-restored backup, truncated write | **Operational.** `RunInputReadError` → the `unreadable` outcome: that package degrades to unavailable, boot proceeds. |
| Input mirror parses as JSON but fails its **row schema** | Real shape drift: a row schema changed without a migration | `RunInputRowSchemaError`. Nothing catches it → **fail-stop boot.** |

The two **input-mirror** rows are the twin of the manifest not-parseable and
schema-drift rows, and they must stay apart. Wrapping both in
`RunInputReadError` (as the first cut did) meant a code defect silently marked
every affected package unavailable fleet-wide with the deploy looking green,
the exact outcome the fail-stop rows exist to prevent. Both classes are raised
in `runDirInputRowsReader` (`server/runs/indicator_catalog.ts`) and
discriminated in `transformRunManifestFile`.

The two **version** rows are principle 4 unchanged. The **absent / unreadable**
rows, manifest or input mirror, must not fail boot, and the reason is
concrete: backups are pg dumps, so a restore
brings `runs` catalogue rows back while the package directories are still
absent. The existing degrade path is deliberate and stays:
`getReadyRunReadContext` and `getRunReadContextForRun` return a typed "Results
run unavailable". Do not "fix" that catch. Consequence to accept: on
the **load** path a shape-drift defect also lands in that catch, so it is
visible only in the log.

### Writing to the package

Transform in memory, `.parse`, **then** persist. There is nothing to restore
from if it fails. Write `.tmp-manifest-{crypto.randomUUID()}.json` in the
package dir and rename over `manifest.json`; a unique name, never a fixed one,
so two writers can never share a temp file. `sweepAbandonedTmpRunDirs` matches
*directories*, so a leftover temp manifest has no sweeper. Clean up in a
`finally`. Retain the pre-transform file as `manifest.v{n}.json`: that is what
makes both a bad block and an image rollback recoverable.

No lock is needed, on this premise: `await dbStartUp()` is top-level in
`main.ts` before any serving begins, and every `getRunManifestCached` caller is
main-realm: no Web Worker reads a manifest. Re-check if one ever does.

`runs.summary` is **not** touched. `RunSummary.manifestSchemaVersion` is
display-only provenance of how the package was originally written and is read by
nothing. A naive "refresh" would rebuild the summary from the manifest and wipe
`diskSizeBytes`, which is deliberately not in it. The summary's own shape
changes go through the `runs_summary` data transform.

### Checklist for adding a block

- [ ] Append the block at the end, numbered, idempotent, precondition-checked
- [ ] Add it to the `TRANSFORM BLOCKS:` list in the file header
- [ ] Bump `RUN_MANIFEST_SCHEMA_VERSION` and update the Zod schema; add the
      version to the history in `lib/types/run_manifest.ts` and to the
      `manifestSchemaVersion` paragraph in `SYSTEM_08_results_packages.md`
- [ ] Recompute only: check every field you touch against the list in 1
- [ ] Bump `PO_CACHE_VERSION` in `server/routes/caches/visualizations.ts`.
      The three run-keyed PO caches key on it (a code dimension, which the
      manifest now is)
- [ ] Audit the **fourth** persistence layer: a manifest field can additionally
      be snapshotted into stored `FigureBundle`s, which needs its own data
      transform with a forced skip-gate
- [ ] A change to a value or key stored in an input mirror is an input block,
      not a reader accommodation: see Run Input Transforms

## Run Input Transforms

`server/runs/input_transform.ts` applies the manifest pattern to a package's
`inputs/*.json` mirrors. Same numbered blocks, appended at the end and never
reordered, each idempotent and checking its own precondition, and the same
no-op write guard on bytes. It runs inside `transformRunManifest` before
manifest block 1, on a forced pass only, behind `RUN_MANIFEST_SCHEMA_VERSION`,
so it reaches boot and the read path through the one entry point
`transformRunManifestFile`, and a manifest block never reads a mirror the
stage has not seen.

It exists because the strict row schemas in `server/runs/indicator_catalog.ts`
fail-stop boot on a value they no longer name, and without a forward transform
renaming a stored vocabulary means either a legacy value accepted forever in
the reader or a hand edit on every host. Input block 1 is the worked example:
it rewrites every `derived` row of `inputs/indicators.json` to `calculated`,
the formula indicator type's current code name.

**The rule is the manifest's own: rename or recompute, never invent, and
never read outside the package.** An input block is a pure function of the
package's files and the app's code. It may rename a value or a key, or
recompute a field from files already in the package. It may not add a fact
those files do not hold, fill a null, drop a row, or read the database or live
instance state. The boundary case is `base`: a v2 mirror written before PLAN_A5
stamps `base` on every count, and the count's real type (`uploaded`,
`dhis2_element`, `sum`) lives only in the live dictionary, so no input block
may resolve it. `PACKAGE_INDICATOR_TYPES` keeps `base` and the display
projection strips it.

**Versioning.** There is no second version integer. An input block names the
manifest version that first carries it; that version's manifest block is the
stamp, and is allowed to be only a stamp (manifest blocks 7 and 8 are the
precedents). The forced-gate corollary applies: a mirror fix requires a
`RUN_MANIFEST_SCHEMA_VERSION` bump to reach existing packages.

**Writing.** Transform in memory, parse, then persist, for both files. The
stage returns pending writes and nothing lands until `runManifestSchema.parse`
has passed; then the mirrors are written first and the manifest second. A
crash between the two leaves a current mirror beside an old manifest, which
the next forced pass repairs (the stage finds nothing to rename and the blocks
complete); the reverse order would stamp the new version over a mirror still
in the old vocabulary, and no later pass revisits a current manifest. A mirror
is serialized exactly as `writeInputJson` in
`server/worker_routines/generate_run/prepare_inputs.ts` writes it
(`JSON.stringify(rows)`, no indent), skipped when the bytes are unchanged, and
retained as `inputs/<name>.v{n}.json` with `n` the stored manifest version,
through `persistPackageFile`, the one persist helper the manifest uses
(retain, unique temp name, rename, `finally`). The manifest's own no-op guard
gates the manifest write alone, never a pending mirror write. Retained copies
are not in `inputFiles` and no reader opens them; they are the rollback path:
restore `inputs/<name>.v{n}.json` over the mirror and `manifest.v{n}.json`
over the manifest, then start the previous image. A rewrite is reported: the
`ok` outcome names the mirrors rewritten in `rewrittenInputs`, and the boot
sweep line in `db_startup.ts` counts them beside the manifests transformed.

**Failure policy.** The stage raises the two classes of the table's
input-mirror rows. Bytes unavailable or not JSON: `RunInputReadError` from
`readRunInputJson`, the `unreadable` outcome, the package degrades and boot
proceeds. A block that throws for any other reason is a code defect and fails
boot. A mirror the stage leaves in a shape the row schema rejects is drift and
fails boot through `RunInputRowSchemaError`: the stage does not validate, the
readers do, after the stage.

### Checklist for adding an input block

- [ ] Append the block at the end of `input_transform.ts`, numbered,
      idempotent, precondition-checked, renaming or recomputing from package
      files only
- [ ] Add it to the `INPUT TRANSFORM BLOCKS:` list in that file's header
- [ ] Bump `RUN_MANIFEST_SCHEMA_VERSION`; add a manifest block that stamps it
      (and does nothing else if the manifest's shape is unchanged); add the
      version to the history in `lib/types/run_manifest.ts` and to the
      `manifestSchemaVersion` paragraph in `SYSTEM_08_results_packages.md`
- [ ] Update the strict row schema in `indicator_catalog.ts` and its enum in
      `lib` to the new vocabulary in the same commit; never add the old value
      to a reader
- [ ] Bump `PO_CACHE_VERSION`
- [ ] Audit the fourth persistence layer (stored `FigureBundle`s) for the
      renamed value
- [ ] Extend `server/tests/run_input_transform_test.ts` with a mirror carrying
      the old value

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

| Table.Column                               | File                                | Functions                                                                                          | Schema                                                             |
|--------------------------------------------|-------------------------------------|----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| `slide_decks.config`                       | `server/db/products/slide_decks.ts` | `insertNewSlideDeckDetail`, `duplicateSlideDeckDetail`, `updateSlideDeckConfig`                    | `slideDeckConfigSchema`                                            |
| `slides.config`                            | `server/db/products/slides.ts`      | `createSlide`, `updateSlide`                                                                       | `slideConfigSchema`                                                |
| `slides.config`                            | `server/db/products/slides.ts`      | `saveSlideCheckpoint`                                                                              | (parsed by the room checkpoint)                                    |
| `reports.config` / `figures` / `images`    | `server/db/products/reports.ts`     | `insertNewReportDetail`, `updateReportConfig`, `updateReportFigures`, `updateReportImages`         | `reportConfigSchema`, `reportFiguresSchema`, `reportImagesSchema`  |
| `slide_decks.config`, `slides.config`      | `server/db/products/versions.ts`    | `restoreSlideDeckStructure`, `copySlideDeckFromVersion`                                            | `slideDeckConfigSchema`, `slideConfigSchema`                       |
| `reports.figures` / `images`               | `server/db/products/versions.ts`    | `restoreReportContent`, `copyReportFromVersion`                                                    | `reportFiguresSchema`, `reportImagesSchema`                        |
| `instance_config.*`                        | `server/db/instance/config.ts`      | `setStructureSchema`, `updateAdminAreaLabelsConfig`, `updateRunGenerationDefaultsConfig`           | Type-specific schemas                                              |

### Read-Time

Trust the database. Parse helpers can optionally validate as defense-in-depth, but do not transform:

```ts
export function parsePresentationObjectConfig(raw: string): PresentationObjectConfig {
  return presentationObjectConfigSchema.parse(JSON.parse(raw));
}
```

The startup sweep already validated this data. Write-time validation ensures only valid data enters. Read-time validation is optional extra safety: it catches edge cases but should never trigger in practice.

### External Boundaries

External input is validated at the point it enters the system:

| Boundary                    | Location                              | Schema                           | Notes                                                     |
|-----------------------------|---------------------------------------|----------------------------------|-----------------------------------------------------------|
| GitHub module definitions   | `server/module_loader/load_module.ts` | `moduleDefinitionGithubSchema`   | Validated at fetch time, throws on invalid                |
| User form input (products)  | Routes → DB functions                 | Product schemas (table above)    | DB functions validate before write                        |
| API request bodies          | Routes → DB functions                 | Various                          | All stored schema writes validate in DB layer             |
| DHIS2 imports               | `server/dhis2/`                       | N/A                              | Imports structure/analytics data, not stored JSON schemas |
| CSV uploads                 | `server/worker_routines/stage_*`      | Row validation                   | Stages raw data, not stored JSON schemas                  |

**Note:** Routes don't need separate validation because all writes to stored schemas go through DB functions that validate before INSERT/UPDATE.

**See also:** [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) for how AI tool inputs are validated before handlers run.

---

## SQL Migrations

For table/column structure changes.

Location: `server/db/migrations/instance/`, applied to the `main` database

Naming: `NNN_description.sql`, or `NNN_description.ts` for a TypeScript
migration (below)

### The Golden Rule: Idempotency

**Every migration must be idempotent.** Running the same migration twice must produce the same result as running it once. The base schema (`_main_database.sql`) represents the current state, and migrations run on top of it, so they must handle the case where their changes already exist.

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

Example: renaming a column safely:

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

Example: adding a constraint safely:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'my_constraint_name') THEN
    ALTER TABLE my_table ADD CONSTRAINT my_constraint_name CHECK (...);
  END IF;
END $$;
```

### Other Rules

- Update the base schema file too (`_main_database.sql`)
- Don't rewrite old migrations, fix forward (one exception, below)
- **Always run `./validate_migrations` after adding or modifying SQL migrations**
- SQL-safety (parameterize values, whitelist identifiers, `.unsafe()` on trusted-internal input only) is owned by [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md). Migration files are repo-authored SQL run via `.unsafe()`, so never build them from runtime input

**Dropping a table that older migrations touch.** A fresh database loads the
base schema and then replays EVERY migration, and `./validate_migrations`
requires that replay to leave the schema byte-identical. So a table can only
leave the base schema if every older migration that creates, alters or
updates it (or a table with a foreign key to it) survives a replay on a base
that never had it. Migration-owned tables (created by an earlier migration
with `IF NOT EXISTS`, no foreign key to a base-owned table) need nothing:
the old migration re-creates them and the drop migration removes them. A
base-owned table, or anything referencing one, needs every such statement
wrapped in a table-existence guard,
`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE
table_schema = 'public' AND table_name = '…') THEN … END IF; END $$;`, so
the fresh replay never creates the plane and the drop is a no-op there.
This is the one sanctioned edit of an applied migration: every instance has
already applied those files and the runner never re-fires them, so
production behaviour is unchanged. `079` and `086` guard their statements on
`indicators_raw` this way.

When too many older migrations touch the dropped layer to guard each one, a
shell migration that sorts first recreates just enough of it instead:
`000_legacy_project_shell.sql` creates `projects` and `project_user_roles`
and adds the log tables' `project_id` columns so that 001 to 090 resolve on a
fresh database, and `092_drop_project_layer.sql` drops them again. Every
object in a shell uses `IF NOT EXISTS`, so it is a no-op on a live instance.
Keep a column add even when a `CREATE TABLE IF NOT EXISTS` for the same table
would no-op: Postgres resolves an index expression before the
`IF NOT EXISTS` name check, so a later index over the column fails without
it. Write the add as `ALTER TABLE IF EXISTS`, because an older fleet base may
not have the table yet and gets it, column included, from a later migration.
`./validate_consolidation_replay` proves the adds are load-bearing with two
negative controls.

**Use SQL migrations for:** Adding columns, creating tables, adding indexes, constraints.

**Use JSON data transforms for:** Transforming data in JSON columns.

### TypeScript Migrations

A migration that has to read data to decide what to write (a cross-database
copy, an id remap, anything one SQL statement cannot express) is a `.ts` file
in the same directory. It sorts by the same filename order, is recorded in
the same `schema_migrations` row, and runs under the same one-transaction
rule as a `.sql` file.

The rules that make it safe:

- **Register it in `TS_MIGRATIONS`** (`server/db/migrations/runner.ts`), a
  literal-keyed static import map, so `deno check main.ts` covers the
  migration module. The runner throws on an unregistered `.ts` file rather
  than skipping it: a silently skipped migration is the one failure that
  would not announce itself.
- **Signature is `(tx: Sql) => Promise<void>`.** `tx` is the migration
  transaction and the only handle to the database being migrated. Every
  statement, in the migration and in everything it calls, goes through it.
- **Throw on failure, never `Deno.exit`.** The runner is the single rollback
  and fail-stop funnel, exactly as it is for a `.sql` file.
- **Another database is read through a fresh pool.** Open it with
  `getPgConnection(id, { max: 2 })` after a `pg_database` existence check
  through `tx`, read only by discipline, and `.end()` it in a `finally`.
- **`./validate_migrations` ignores `.ts` files by construction** (it globs
  `*.sql`, as does the per-shape replay in `./validate_migrations_replay`,
  whose fresh boot does run and count them). A `.ts` migration changes data, not schema, so the schema
  idempotency check has nothing to say about it. Prove it by executing it
  against a throwaway Postgres seeded with realistic legacy data, and diff
  the resulting schema against the base so a migrated instance and a fresh
  one converge. `./validate_consolidation_replay` is the worked example.
- **Share the planning core with the pre-deploy gate.** When a migration is
  risky enough to want a dry-run, factor the read-and-decide half into a
  pure function the migration executes and the gate only reports
  (`server/db/migrations/consolidation/plan.ts`). What is gated is then
  the thing that runs.

---

## Stored Data Schemas

### Naming Convention

**Underscore-prefixed files** (`_*.ts`) contain Zod schemas for data stored in the database. Each file:

- Defines one primary Zod schema (the source of truth)
- Exports runtime types via `z.infer<>`
- May include a parse helper for convenience

Non-prefixed type files contain plain TypeScript types that are not stored/validated schemas.

### Locations

| Data                          | Schema Location                             | Stored in                                               |
|-------------------------------|---------------------------------------------|---------------------------------------------------------|
| Figure config                 | `lib/types/_presentation_object_config.ts`  | figure bundles in `slides.config` and `reports.figures` |
| Figure bundle                 | `lib/types/_figure_bundle.ts`               | figure blocks in `slides.config` and `reports.figures`  |
| Module definition (installed) | `lib/types/_module_definition_installed.ts` | run manifest `modules[].moduleDefinition`               |
| Viz config (d/s schemas)      | `lib/types/_metric_installed.ts`            | (embedded in figure config)                             |
| Slide deck config             | `lib/types/_slide_deck_config.ts`           | `slide_decks.config`                                    |
| Slide config                  | `lib/types/_slide_config.ts`                | `slides.config`                                         |
| Report config                 | `lib/types/reports.ts`                      | `reports.config`                                        |
| Instance configs              | `lib/types/instance.ts`                     | `instance_config.config_json_value`                     |

(`instance.ts` is the kernel grab-bag: the instance-config Zod schemas live there by symbol, not in a dedicated `_instance_config.ts`.)

### GitHub-Authored Schemas

Module definitions fetched from GitHub use a strict schema with no drift tolerance:

Location: `lib/types/_module_definition_github.ts`

Authored `definition.json` files must match the current shape exactly. Invalid files fail at fetch time with clear error paths. No silent normalization.

**"No silent normalization" bans coercion, not breadth.** The rule is about the schema quietly changing what it parsed (`.transform()`, `z.preprocess()`, defaulting a missing field), so that the value a caller receives is not the value the file contained. Declaring a union because the boundary genuinely accepts two shapes is not a violation: the schema still states exactly what is valid, and nothing is rewritten behind the caller's back. When two accepted shapes must converge on one internal form, the narrowing belongs in a named, exported function that consumers call explicitly (see `getAssetName` for `assetsToImport`), never inside the schema.

---

## Adding a New Stored Schema

1. **Define the Zod schema** in `lib/types/`
2. **Add parse helper** (just JSON.parse + cast)
3. **Create migration function** in `server/db/migrations/data_transforms/`
4. **Wire into startup**: append it to `INSTANCE_DATA_TRANSFORMS` in `server/db_startup.ts`
5. **Use schema for writes**: validate before INSERT/UPDATE

---

## Process: Schema Change Checklist

When changing a stored schema:

- [ ] Add transform block to the migration function for that type
- [ ] Update Zod schema to new shape
- [ ] Update GitHub schema if applicable (must stay in sync)
- [ ] Test migration against real data shapes
- [ ] Deploy: migration runs at startup, validates
- [ ] After all deployments migrated: optionally remove old field from schema

---

## What to Do If You Want to Change a Schema-Validated Type

1. **Find the Zod schema**: underscore-prefixed files in `lib/types/` (e.g., `_presentation_object_config.ts`)
2. **Update the schema** to the new shape
3. **Find the data transform**: matching file in `server/db/migrations/data_transforms/`
4. **Add a transform block** that converts old shape → new shape
5. **Deploy**: transform runs on existing data, schema validates new writes

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

1. **Check the error log**: it shows which data transform failed and which row caused the issue
2. **Identify the old data shape**: look at the failing row to understand what needs to transform
3. **Add a transform block** to the relevant file in `server/db/migrations/data_transforms/`
4. **Redeploy**: the transform runs, fixes the data, boot succeeds

Example: if the `slide_config` sweep fails because old figure configs have `filterType: "all"` but new schema expects `filterType: "none"`:

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

A: Data migrations are forward-only. If you need to reverse a change, add a new transform block. Code can be rolled back safely: the data shape is still valid.

**Q: What if I find invalid data in production?**

A: Boot would have failed if data was invalid. If you somehow have invalid data:
1. Add a transform block to fix it
2. Deploy: migration transforms invalid rows

**Q: Can I delete old transform blocks?**

A: Only when no deployment could ever see data in the old shape. In practice: keep them. They're no-ops for already-migrated data and serve as documentation.

**Q: What if one instance fails but another succeeds?**

A: Each instance validates independently. If Instance B fails:
1. Instance B's transaction rolls back, boot fails
2. Fix the transform block to handle the edge case
3. Redeploy: Instance A skips (already valid), Instance B runs fixed transform
