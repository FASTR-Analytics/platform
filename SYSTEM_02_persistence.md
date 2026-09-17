---
system: 2
name: Persistence Core & Schema Lifecycle
globs:
  - lib/types/errors.ts
  - server/db/error_classifier.ts
  - server/db/instance/_main_database_types.ts
  - server/db/instance/mod.ts
  - server/db/migrations/**
  - server/db/mod.ts
  - server/db/postgres/**
  - server/db/utils.ts
  - server/db_startup.ts
docs_absorbed:
---

# S2: Persistence Core & Schema Lifecycle

The Postgres layer everything else stands on: the database model (one `main`
database per instance), the two sanctioned connection factories and their
pools, the canonical `Sql`-first DB-function shape with its single error
funnel, the **SQL-safety boundary** (this file is the normative owner of that
rule), and the schema lifecycle: fail-stop boot running migrations then JSON
data transforms. Reviewed against code (first review cycle, review-only;
absorbs DOC_DB_ACCESS_LAYER).

Boundaries: the migration/schema-change **recipe** (transform blocks, skip-gate
gotcha, idempotency patterns, the write-time/read-time validation boundary) is
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md): this system owns the
machinery and architecture, the protocol owns the how-to. The `last_updated`
bump this layer performs on every mutation is one corner of the
`last_updated → SSE → version-hash` triangle; the push and cache corners are
**S3** ([SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)). DB
functions return `APIResponse` envelopes consumed by the route layer. The
envelope and route contract are **S1**
([SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)); the generic
envelope/boundary-validation rules both build on are panther's
`protocols/PROTOCOL_DENO_API.md`, deferred there. The worker lifecycle around
worker connections is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) (S8); what
the bulk-import SQL does is **S6**
([SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md)). Operator access to the
databases from outside the app (DOC_ACCESS_DBS) is S15's cycle. Sub-file custody
exceptions are in SYSTEMS.md §4.1; `main.ts` is owned by S1 (S2 reader, the
boot call order).

## Contract

One `main` database; pooled cached connections acquired only through the two
factories (the `READ_ONLY` flag is _nominal_, never enforced); every DB function
takes an `Sql` first and returns an `APIResponse` through one error funnel;
values parameterized, identifiers whitelisted; boot is fail-stop (migrations,
then per-type data transforms, `Deno.exit(1)` on any failure); stored-JSON
evolution via transforms with skip-gates. Trap: boot success is bound to panther
schema versions via `_figure_block.ts`.

## The database model

```text
Postgres server
├── postgres   ← the server's own admin db (CREATE DATABASE main runs here)
└── main       ← reserved name. Users, instance config, shared structure
                  (indicators/facilities/admin areas), datasets, the runs
                  catalogue, the products registry and its per-type detail
                  tables (S12)
```

The products block on `main` (`folders`, `products`, `slide_decks`, `slides`,
`reports`, `report_versions`, `slide_deck_versions`) is in the base schema and,
for existing instances, in `090_products.sql` in `IF NOT EXISTS` form.
`server/db/products/**` reads and writes it
([SYSTEM_12](SYSTEM_12_documents_sharing.md)).

The connection id (`"postgres"` or `"main"`) is the connection-cache key and the
database name passed to `getPgConnectionFromCacheOrNew`. Request handlers
receive the `main` pool as `c.var.mainDb`, set by the permission middleware.

## Connection strategies

Two acquisition paths; pick by **who owns the lifecycle**.

### 1. Cached request connections (request handlers)

`server/db/postgres/connection_manager.ts`:

```ts
const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
```

- Cached in `_CACHED_CONNECTIONS`, keyed `` `${id}_${permissions}` ``.
- Pool defaults: `max: 20`, `idle_timeout: 300`,
  `statement_timeout`/`query_timeout: 300000`, `prepare: true`,
  `transform.undefined → null`.
- **Lifecycle is owned by postgres.js `idle_timeout`**: there is deliberately
  **no manual cleanup** (manual `end()` on pools with in-flight queries crashed
  the server; see the comment in the file).
- `closeAllConnections` exists only for explicit teardown: process shutdown in
  `main.ts` (SIGINT/SIGTERM), and the end of scripts and test harnesses.
  `closePgConnection` is exported and has no caller.
- `getPgConnection(databaseId, { max?, readonly? })` creates a **fresh,
  uncached** pool: caller must `.end()`. Call sites: the consolidation's
  source pools in `db/migrations/consolidation/execute.ts`,
  `validate_consolidation_replay.ts`, and the test harnesses.
  (`options.readonly` is dead, as described below.)

### 2. Dedicated worker connections (background jobs)

`server/db/postgres/worker_connections.ts`. Workers run in separate contexts
with no access to the request cache:

| Factory                      | `max` | `idle_timeout` | `prepare` | Use                                      |
| ---------------------------- | ----- | -------------- | --------- | ---------------------------------------- |
| `createWorkerConnection`     | 3     | 300s           | `false`   | general worker work                      |
| `createBulkImportConnection` | 5     | 600s           | `false`   | long bulk imports (no statement timeout) |
| `createWorkerReadConnection` | 2     | 120s           | `false`   | read-only worker reads                   |

`prepare: false` is required for the buffered bulk-`INSERT` style used by
importers. **These are not cached, so every worker exit path must `.end()`
them** (teardown contract:
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md)).

### The `READ_ONLY` flag is cosmetic

`getPgConnectionFromCacheOrNew(id, "READ_ONLY" | "READ_AND_WRITE")` uses
`permissions` **only to namespace the cache key**. It calls `getPgConnection`
with no options, and `getPgConnection` never reads `options.readonly`: no
`default_transaction_read_only` is ever set. Net effect: a `"READ_ONLY"`-keyed
connection can write freely, and the flag merely **doubles** the pooled
connections per database (a `_READ_ONLY` and a `_READ_AND_WRITE` entry, up to 20
each, so size Postgres `max_connections` accordingly). Treat the parameter as
cache-namespacing, not a safety boundary (ruled: it stays
namespacing-only, because making it real would break legitimate writes on
`READ_ONLY`-pooled connections, e.g. `getGlobalUser`'s open-access insert).

## The canonical DB-function shape

From `server/db/products/slide_decks.ts` (`updateSlideDeckConfig`):

```ts
export async function updateSlideDeckConfig(
  mainDb: Sql,
  productId: string,
  config: SlideDeckConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated, config.label);
      await sql`
        UPDATE slide_decks
        SET config = ${JSON.stringify(slideDeckConfigSchema.parse(config))}
        WHERE id = ${productId}
      `;
    });
    return { success: true, data: { lastUpdated } };
  });
}
```

Rules of the shape:

- **First parameter is the `Sql` connection** (`mainDb`, or `tx`/`sql` for a
  helper that runs inside a caller's transaction), passed in by the route from
  `c.var.mainDb`. DB functions don't acquire their own connection.
- **Body wrapped in `tryCatchDatabaseAsync`**: converts any throw (including a
  Zod `.parse` failure) into `{ success: false, err }`.
- **Returns `APIResponseWithData<T>` or `APIResponseNoData`**: never raw rows,
  never a bare throw to the route. (Known stragglers: `ai_usage_logs.ts` and
  some log/user functions, listed in Open items.)

### The error funnel

`server/db/utils.ts` → `tryCatchDatabaseAsync` catches, logs, and calls
`classifyDatabaseError` (`server/db/error_classifier.ts`), which maps:

- internal sentinel strings (`ERROR_CATEGORY.MODULE_NOT_RUN`, `DATA_NOT_FOUND`,
  `VALIDATION_ERROR`, …) → friendly messages;
- Postgres message patterns: `relation "…" does not exist` →
  `DATA_NOT_FOUND`, `column … does not exist` → `CONFIGURATION_ERROR`,
  `permission denied` → `PERMISSION_DENIED`; the DuckDB twins on the run
  path likewise, with `Catalog Error: Table with name ro_… does not exist` →
  `DATA_NOT_FOUND` ("module may need to be run");
- network error codes (`CONNECTION_ENDED`, `ECONNREFUSED`, …) → `NETWORK_ERROR`.

It returns a
`CategorizedError { category, userMessage, technicalMessage,
suggestedAction? }`
(`lib/types/errors.ts`); the wrapper sets
`err = userMessage [+ " " + suggestedAction]`. The `ro_` special-case is how a
not-yet-run module surfaces as a clean "run the module" message instead of a raw
SQL error.

### JSON column round-tripping

| Direction    | Pattern                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Read**     | `JSON.parse(raw)` or a domain parser (`parseInstalledModuleDefinition`, `parseJsonOrThrow`). Trust the DB  |
| **Write**    | `JSON.stringify(schema.parse(value))` **inline in the SQL template**. Zod-validate before write           |
| **Nullable** | `${value ?? null}`                                                                                         |

The validation boundary (which schema, where) is owned by
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md); this file documents
only the mechanical round-trip. Don't add read-time Zod validation as a matter
of course: trust the database after the startup sweep; validate on write. The
connection-level `undefined → null` transform means a missing field becomes SQL
`NULL`, not a default, so be explicit with `?? null` for clarity.

### Transactions & optimistic concurrency

- **Multi-statement atomic writes use `db.begin(async (tx) => …)`** (the
  `db/products/*` family (`slides.ts`, `move_slides.ts`, `versions.ts`, …),
  the instance dataset, structure, users and run-generation files, …).
- **Optimistic concurrency** uses a `last_updated` round-trip: the caller passes
  `expectedLastUpdated`; if it differs from the stored value, the function
  refuses to clobber: `updateReportBody` reports `conflicted: true`, and
  `updateSlide` returns a `CONFLICT` envelope carrying the current stamp. The
  bumped `last_updated` is also the SSE/cache version key. See
  [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md). When a live
  collab room exists for the row, the mutating route offers the save to the
  room first (S16's `apply*ToLiveRoom` chokepoint) and the CRDT merge is the
  conflict resolution: the optimistic round-trip engages only on the no-room
  path. The room checkpoint stamps `last_updated` and the additive
  `crdt_state_last_updated` column equal in one write; any non-collab write
  bumps `last_updated` alone, which is exactly what invalidates the stored
  CRDT state ([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)).

## SQL safety: the normative rule

**This file owns the SQL-safety boundary.** The ingestion, PO-query, and
module-execution systems apply it to their domains but cite this rule rather
than restating it.

```text
VALUES           → tagged template ${value}            (always parameterized, safe)
IDENTIFIERS      → db(identifier)                      (whitelisted by postgres.js)
DYNAMIC VALUES   → escapeSqlString(s)  ('' doubling)   (ONE sanctioned manual escaper)
RAW .unsafe(sql) → trusted-internal input ONLY         (closed unions / module-def
                                                        constants / repo-authored SQL)
```

- **Values**: always interpolate with the tagged template, as in
  `` mainDb`… WHERE id = ${id}` ``. Never string-concatenate a value.
- **Identifiers**: dynamic table/column names go through the helper, as in
  `` mainDb`SELECT count(*) FROM ${mainDb(facilitiesTable)}` `` (see
  `instance/structure.ts`). postgres.js quotes them safely. There are **no
  parameterized table names**: a table name from config must be validated
  against a closed set before it reaches SQL.
- **`escapeSqlString`** (`server/db/utils.ts`, `s.replace(/'/g, "''")`) is the
  **only** sanctioned manual escaper for Postgres-bound SQL, used for
  hand-built `VALUES` tuples in the bulk paths (HFA/HMIS/structure staging,
  run input capture). Two DuckDB-bound call sites use it too
  (`run_query/run_read.ts` and the S9 filter values in
  `server_only_funcs_presentation_objects/query_helpers.ts`), which is safe
  because both engines escape a quote by doubling it. No call site may
  inline its own `''`-doubling.
  `escapeSqlLiteral` (`server/run_query/duckdb_executor.ts`) is its DuckDB-side
  twin.
- **`.unsafe()`** runs raw SQL with no parameterization. There are roughly a
  hundred call sites outside tests, all trusted-internal, in four groups: (1)
  the **bulk ingest and run input capture paths** (`instance/dataset_hmis.ts`,
  `instance/structure.ts`, the staging workers,
  `runs/capture_inputs/{hfa,hmis,iceh}.ts`) building large `INSERT`/DDL
  strings whose values go through `''`-doubling escaping; (2) the
  **`detectHasAnyRows` probe** (`db/utils.ts`) and `generateUniqueIdForTable`
  (`utils/id_generation.ts`) interpolating table names that are internal
  constants / closed unions; (3) the **migration runner** executing
  repo-authored `.sql` files and setting the transaction-local instance
  language; (4) the **fresh-database seed** in `db_startup.ts` (default
  instance config and initial users). **`.unsafe()` with any user-influenced
  string is forbidden.**

## Boot & the schema lifecycle

`main.ts` calls `dbStartUp()` ([server/db_startup.ts](server/db_startup.ts))
before serving; every failure path is fail-stop (`Deno.exit(1)`), so a booted
server has verified-current schema and stored-JSON shapes. The sequence:

1. **Fresh-instance bootstrap.** Connect to the `postgres` admin DB; if `main`
   doesn't exist, create it, load `_main_database.sql`, and seed it (H_USERS
   admin rows and default `instance_config` rows; the indicator dictionary
   starts empty).
2. **Instance migrations.** `runInstanceMigrations`
   (`server/db/migrations/runner.ts`): lexicographically-ordered `NNN_*.sql`
   and `NNN_*.ts` files from `migrations/instance/`, applied-set tracked in the
   `schema_migrations` table, each file in its own transaction
   (`tx.unsafe(fileContents)` for SQL; the registered `(tx) => Promise<void>`
   for TypeScript, which throws and never exits); any failure exits. A `.ts`
   file runs only through the literal-keyed `TS_MIGRATIONS` map, so
   `deno check main.ts` covers it, and an unregistered one makes the runner
   throw rather than skip. `runMigrationsInDir` is the same loop over any
   directory, throwing `MigrationFailure` instead of exiting, for harnesses.
3. **Wedged-state resets.** Structure upload attempts stuck at
   `status_type = 'importing'` with no live worker are flipped to `error` (a
   restart mid-import would otherwise block all future imports via the
   concurrency guards); stale mid-run HMIS, HFA and ICEH import runs are
   marked likewise.
4. **Instance data transforms.** `INSTANCE_DATA_TRANSFORMS`, each a
   `(tx, countryIso3) => Promise<MigrationStats>` run in its own transaction,
   in this order: `instance_config`, `runs_summary`, `slide_deck_config`,
   `slide_config`, `reports`; any failure exits. `countryIso3` is
   `_INSTANCE_COUNTRY_ISO3`, which the figure-block sweeps need and a boot
   sweep cannot read from the live instance store. `runs_summary` strips the
   `backfillSourceProjectId` and `attachTargetProjectIds` keys from
   `runs.summary`, gated by a raw key scan because `RunSummary` has no schema.
   The three product transforms bump the owning `products.last_updated` on
   every row they rewrite (`slide_config` also bumps `slides.last_updated`),
   and their figure-block conversions stamp each bundle with the owning
   product's `(run_id, admin_area_2)` pair.
5. **Runs.** The tmp-dir sweep, the DuckDB spill reset, the interrupted
   generation flip and the run-manifest transform run last; they are S8's
   ([SYSTEM_08](SYSTEM_08_results_packages.md)).

SQL migrations must be idempotent because the base schema file
(`_main_database.sql`) represents current state and a new database gets base +
all migrations. Patterns and the golden rule are in
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).
`./validate_migrations` (repo root) verifies the two paths converge by loading
`_main_database.sql` into a throwaway `postgres:15` Docker container, applying
every `*.sql` file in `migrations/instance/`, and diffing the schema before and
after; run it after touching any SQL migration. `./validate_migrations_replay`
(repo root) covers the shapes the fleet actually has: it loads the
`_main_database.sql` of seven historical deploy commits into that container,
one database each, applies every current `*.sql` instance migration to each,
and then runs `dbStartUp()` against the empty server, which must record one
`schema_migrations` row per `.sql` and `.ts` file. A statement error on any
base, a non-zero boot exit, or a count mismatch fails it. The one sanctioned
edit of an applied migration is the table-existence guard that lets a
base-owned table leave the base schema (the protocol's "Dropping a table that
older migrations touch").

### The project consolidation: 000, 091 and 092

The base schema has no project layer, but migrations 001 to 090 were written
against a base that had one: several alter `projects`, `project_user_roles` or
the `project_id` columns of the log tables, or index those columns. Three
instance migrations bridge that:

- **`000_legacy_project_shell.sql`** sorts first. It creates `projects` and
  `project_user_roles` with `IF NOT EXISTS` and adds `project_id` to
  `user_logs`, `ai_usage_logs` and `user_logs_aggregate`. On a live instance
  every object already exists and the file is a no-op; on a fresh database it
  gives 001 to 090 the shape they expect. The three `ADD COLUMN` lines are
  load-bearing: Postgres resolves an index expression before the
  `IF NOT EXISTS` name check, so the index statements in 016 and 035 fail
  without the column even though their `CREATE TABLE IF NOT EXISTS` no-ops.
  They are `ALTER TABLE IF EXISTS` because a fleet base older than a log table
  gets that table, with its `project_id` column, from the later migration that
  creates it.
- **`091_consolidate_projects.ts`** is registered in `TS_MIGRATIONS`; the file
  re-exports `consolidateProjects` from `consolidation/execute.ts`. For every
  `ready` project whose database exists, it plans with
  `consolidation/plan.ts` and inserts the plan through the migration
  transaction, opening each source project pool fresh with `getPgConnection`
  and ending it in a `finally`. `plan.ts` reads one project database and
  returns every row to insert, the id remaps, the nested folder plan, the
  bundle stamps and the dropped-row counts, and issues no write. It does not
  carry `crdt_state`: a legacy co-editing state holds figures saved without a
  scope or run id, so every migrated room re-seeds from the stamped JSON. Nor
  does it carry a live report's `body_authors`, which is trusted only beside
  a current `crdt_state`, so migrated reports start with unknown authorship;
  version snapshots keep their ledgers. A source database not at `041_drop_frozen_results_plane`, or a project with no
  `run_id` on an instance with no pinned run, throws. With no projects it
  returns at once.
- **`092_drop_project_layer.sql`** merges `user_logs_aggregate` rows that
  differ only by `project_id`, drops the `project_id` columns (which severs the
  cascade foreign keys, so the logs survive), rebuilds
  `idx_user_logs_aggregate_unique` on
  `(user_email, endpoint, endpoint_result, week_start)`, drops
  `dashboard_slugs`, `project_user_roles` and `projects`, and drops the
  `can_create_projects` and `default_project_*` columns from `users`.

`./validate_consolidation_replay` (repo root, logic in
`validate_consolidation_replay.ts`) executes the three end to end in the
throwaway container through the real runner over the real instance directory.
It reads the legacy main base, the project base schema and the project
migrations from `LEGACY_COMMIT` with `git show`. It proves (a) a seeded live
instance with two template-identical project databases, (b) the users-and-logs
path through 092, (c) the two negative controls that show 000's `ADD COLUMN`
lines are load-bearing, and (d) the fresh path; the migrated and fresh schemas
must both dump byte-identical to the base. `./validate_consolidation.ts` (repo
root) is the read-only fleet dry-run: per instance, over an ssh tunnel per
PROTOCOL_ACCESS_DBS or `--local` against the dev database, it runs the same
planner and reports the FAILs that would abort 091 and the REVIEW counts that
are irreversible once it runs; `--json` writes the planned per-instance counts
the rollout post-check compares against. The replay harness runs it against
its seeded instance and checks the planned counts against what 091 inserted.

## FigureBundle backfill: the boot-time cutover

This is S2's slice of the FigureBundle refactor; the bundle shape and the render
side live in [SYSTEM_10](SYSTEM_10_figure_render_export.md). S2 owns the
**migration** that converts every stored figure from the old
`{ figureInputs?, source? }` to the new `{ bundle? }`, a textbook
PROTOCOL_APP_MIGRATIONS data-transform (one deploy, no offline script).

- **Where.**
  [server/db/migrations/data_transforms/_figure_block.ts](server/db/migrations/data_transforms/_figure_block.ts)
  holds the shared conversion; the two per-surface sweeps (`slide_config.ts`,
  `reports.ts`) call `transformFigureBlock` then `transformFigureBlockToBundle`
  on each block. The strict `figureBlockSchema` final-parse aborts boot if any
  row is still legacy after transform (the skip-gate gotcha made safe by
  strictness).
- **chart / table / map → in-place.** The raw rows already sit in the blob
  (`figureInputs.{tableData|chartData|chartOHData|mapData}.jsonArray`, never
  stripped). Reshape to `items` (+ `valueProps` from the stored
  `jsonDataConfig`). Value-exact; values are coerced to strings to match the
  bundle's `Record<string,string>` items.
- **timeseries → reverse-transform the stored grid.** Only timeseries stored the
  transformed 5-D grid instead of `jsonArray`. The forward transform is a strict
  one-cell-one-row pivot (it throws on collisions), so the grid is **lossless
  and reversible**: emit one row per non-empty cell keyed by header id + period
  id. It is **self-validating**: `validateTimeseriesRoundTrip` does a direct
  lookup for every stored cell and **throws** if any value isn't recoverable
  (fail-fast → aborts boot). It reconstructs the original rollup-aware sort and
  `dateRange` (from `timeMin`/`nTimePoints`) so a mismatch is the only reason to
  fail. A timeseries converts from its own grid whether or not its metric
  still exists: no re-query, no blank placeholders.
- **Localization synthesis.** `getTransformLocalization(countryIso3)` builds the
  frozen `localization`, all three fields from the instance env
  (`_INSTANCE_LANGUAGE`/`_INSTANCE_CALENDAR`/`_INSTANCE_COUNTRY_ISO3`), threaded
  through both figure sweeps, so backfilled figures carry the real country
  (drives admin-area relabelling at render).
- **The (package, scope) pair.** `scope` is `{ adminArea2 }` and `provenance`
  is `{ runId }`, both taken from the owning product row
  (`FigurePairForTransform`). Both are required by `figureBundleSchema`.
- **Invalid config fails fast.** A missing/invalid `source.config` **throws**
  rather than producing a silent blank (which would masquerade as "empty" past
  `figureBlockSchema`), so the failing boot names it.
- **Shared traversal.** `walkSlideLayoutNodes` (exported from
  `_figure_block.ts`) is used by the `slide_config` boot sweep, the
  consolidation planner and `db/products/versions.ts`, so they cannot drift
  in how they walk a slide layout.
- **`resultsValue.formatAs` is INFERRED here, and nowhere else.** A stored
  bundle carries no metric definition, so `inferFormatAs` supplies the field:
  `"indicator"` for the eight ids in `INDICATOR_FORMAT_METRIC_IDS`
  ([lib/indicator_format_metrics.ts](lib/indicator_format_metrics.ts)),
  `"number"` for m9-02-01 (frozen: its CIX/SII values are derived measures over
  percent indicators), otherwise the original backfill heuristic: percent iff
  **every** stored indicator entry declares `format_as: "percent"`, so a
  label-only entry counts as disagreement. That strictness is the point: the
  function repairs history and must not improve on it. It deliberately does NOT
  run the live resolution rule, which counts only values on an indicator
  DIMENSION: a legacy figure displaying no indicator dimension would resolve
  `"number"` and freeze a percent metric's values as raw fractions, and this
  write is permanent. The flip needs a **forced** skip-gate
  (`rawJsonNeedsFigureBlockTransform` string-scans the raw row for a listed
  metric id), because a bundle whose stored `formatAs`
  still says `"number"` for a listed metric parses cleanly under the three-way
  schema and a parse-only gate would skip it forever
  ([PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md), "Skip-Gate
  Gotcha"). The same frozen list drives `manifest_transform` block 2 for run
  manifests and the definition normalization in
  `server/module_loader/load_module.ts`. The declaration itself is
  [SYSTEM_10](SYSTEM_10_figure_render_export.md)'s.

### The pre-deploy dry-run gate (passed; tool retired)

A read-only repo-root script ran the exact reshape + round-trip against every
instance's DBs before the cutover (per-outcome counts and the identity of every
failure). Result: **36/36 instances, 17,142 figures, 0 FAILs.** The script was
deleted with the results-runs Phase 4 sweep: a passed one-time
gate is history, not tooling.

## File & naming conventions

- **`_*.sql`**: the base schema file (`_main_database.sql`), loaded via
  `db.file(...)`.
- **`_*_database_types.ts`**: hand-written `DB*` row types
  (`DBFolder`, `DBUser`, …) describing raw table rows. These are
  _not_ Zod schemas (the `_*.ts` stored-schema convention is in
  [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)).
- **`mod.ts` barrels**: `db/mod.ts` re-exports the leaf `utils.ts` and the
  barrels `postgres/mod.ts`, `instance/mod.ts` and `products/mod.ts`, each of
  which aggregates most of its siblings, so a caller imports from the barrel
  instead of deep-importing.
  The aggregation is not complete and nothing enforces it: `instance/mod.ts`
  omits `dataset_iceh.ts`, `run_generation.ts` and `user_logs.ts` (Open item).
- **`generateUnique*Id`** (`server/utils/id_generation.ts`): short nanoid
  (4-char, alphabet `23456789abcdefghjkmnpqrstuvwxyz`; existing 3-char ids
  stay), retry-until-unique (10 attempts) against a specific table: one
  internal core over the closed `IdTable` union (`"products" | "slides"`), two
  thin named wrappers (`generateUniqueProductId`, `generateUniqueSlideId`).
  Folders and runs use `crypto.randomUUID()` instead.
- **PascalCase stragglers.** The DB-function convention is camelCase, but the
  log/usage families predate it (`AddLog`, `GetLogs`, `SetUserUnlimitedAi`,
  `DeleteOldLogs`, the `ai_usage_logs.ts` set, …). Don't copy them.

## Rules

1. **Acquire via a factory** (`getPgConnectionFromCacheOrNew` for requests, the
   `*WorkerConnection` factories for workers). Never instantiate `postgres()`
   directly outside `connection_manager.ts` / `worker_connections.ts`; never
   manually `.end()` a cached connection mid-request.
2. **Wrap every DB op in `tryCatchDatabaseAsync` and return an `APIResponse`.**
   No bare throws to the route, no returning raw rows.
3. **Parameterize values, whitelist identifiers.** `.unsafe()` only on
   trusted-internal input; never hand-build `VALUES` tuples outside
   `escapeSqlString`.
4. **Worker connections must `.end()` on every exit path** (they are uncached).
5. **JSON columns: `JSON.parse` on read, `JSON.stringify(schema.parse(x))` on
   write**. Never stringify without the parse (schema per
   PROTOCOL_APP_MIGRATIONS); multi-statement writes inside `db.begin`.
6. **Bump `last_updated` on mutations**: it drives SSE + cache invalidation
   (S3) and the optimistic-concurrency round-trip.
7. **Export new DB functions from the appropriate `mod.ts` barrel.**

## Open items

- `ai_usage_logs.ts` (and some log/user functions) bypass the envelope: no
  `tryCatchDatabaseAsync`, raw rows/scalars returned, throws reach the caller.
- The `mod.ts` barrels are incomplete: `instance/mod.ts` omits three siblings
  (named in the Conventions section above), whose callers deep-import them.
- Standardize the PascalCase DB-function stragglers to camelCase.
- Lint ideas (from the absorbed doc): flag `.unsafe()` call sites for
  trusted-input review; flag DB functions that throw or return non-envelope
  shapes; barrel-completeness check (`mod.ts` re-exports every sibling).
