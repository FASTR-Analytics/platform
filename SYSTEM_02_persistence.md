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
  - server/db/project/_project_database_types.ts
  - server/db/project/mod.ts
  - server/db/utils.ts
  - server/db_startup.ts
docs_absorbed:
---

# S2 — Persistence Core & Schema Lifecycle

The Postgres layer everything else stands on: the multi-database model (one
`main` plus one bare-UUID database per project), the two sanctioned connection
factories and their pools, the canonical `Sql`-first DB-function shape with its
single error funnel, the **SQL-safety boundary** (this file is the normative
owner of that rule), and the schema lifecycle — fail-stop boot running SQL
migrations then JSON data transforms, plus backup/restore mechanics. Reviewed
against code 2026-07-16 (first review cycle, review-only; absorbs
DOC_DB_ACCESS_LAYER).

Boundaries: the migration/schema-change **recipe** (transform blocks, skip-gate
gotcha, idempotency patterns, the write-time/read-time validation boundary) is
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — this system owns the
machinery and architecture, the protocol owns the how-to. The `last_updated`
bump this layer performs on every mutation is one corner of the
`last_updated → SSE → version-hash` triangle; the push and cache corners are
**S3** ([SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)). DB
functions return `APIResponse` envelopes consumed by the route layer — the
envelope and route contract are **S1**
([SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)); the generic
envelope/boundary-validation rules both build on are panther's
`protocols/PROTOCOL_DENO_API.md`, deferred there. The worker lifecycle around
worker connections is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) (S8); what
the bulk-import SQL does is **S6**
([SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md)). Operator access to the
databases from outside the app (DOC_ACCESS_DBS) is S15's cycle. Sub-file custody
exceptions are in SYSTEMS.md §4.1: `db/project/projects.ts` and
`routes/instance/backups.ts` are owned by S15 with S2 a mandatory reader — the
slices reviewed here are project-DB create/drop and the restore body; `main.ts`
is owned by S1 (S2 reader — the boot call order).

## Contract

Project DBs named by bare UUID; pooled cached connections acquired only through
the two factories (the `READ_ONLY` flag is _nominal_ — never enforced); every DB
function takes an `Sql` first and returns an `APIResponse` through one error
funnel; values parameterized, identifiers whitelisted; boot is fail-stop (SQL
migrations, then per-type data transforms, `Deno.exit(1)` on any failure);
stored-JSON evolution via transforms with skip-gates. Trap: boot success is
bound to panther schema versions via `_figure_block.ts`.

## The multi-database model

```text
Postgres server
├── postgres            ← the server's own admin db (create/drop/terminate run here)
├── main                ← reserved name. Users, projects metadata, instance config,
│                          shared structure (indicators/facilities/admin areas), datasets
├── <uuid-A>            ← one database per project, named by a BARE crypto.randomUUID()
├── <uuid-B>            │   (NOT "project_<uuid>")
└── …                   ┘
```

A project database is created with the **bare UUID** as the database name
([server/db/project/projects.ts](server/db/project/projects.ts)):

```ts
const newProjectId = crypto.randomUUID();
await mainDb`create database ${mainDb(newProjectId)}`; // identifier via db() helper
const projectDb = getPgConnectionFromCacheOrNew(newProjectId, "READ_AND_WRITE");
await projectDb.file("./server/db/project/_project_database.sql"); // base schema
await runProjectMigrations(projectDb); // then migrations, so base + migrations converge
```

The connection id (`"postgres"`, `"main"`, or the project UUID) is the same
string used everywhere: as the connection-cache key, in
`getPgConnectionFromCacheOrNew`, and threaded through `c.var.ppk.projectId`.

## Connection strategies

Two acquisition paths; pick by **who owns the lifecycle**.

### 1. Cached request connections (request handlers)

`server/db/postgres/connection_manager.ts`:

```ts
const db = getPgConnectionFromCacheOrNew(id, "READ_AND_WRITE"); // "main" or project UUID
```

- Cached in `_CACHED_CONNECTIONS`, keyed `` `${id}_${permissions}` ``.
- Pool defaults: `max: 20`, `idle_timeout: 300`,
  `statement_timeout`/`query_timeout: 300000`, `prepare: true`,
  `transform.undefined → null`.
- **Lifecycle is owned by postgres.js `idle_timeout`** — there is deliberately
  **no manual cleanup** (manual `end()` on pools with in-flight queries crashed
  the server; see the comment in the file).
- `closePgConnection` / `closeAllConnections` exist only for explicit teardown:
  process shutdown in `main.ts` (SIGINT/SIGTERM), and per-project teardown
  before a project delete or a backup restore drops its database.
- `getPgConnection(databaseId, { max?, readonly? })` creates a **fresh,
  uncached** pool — caller must `.end()`. Two call sites, both in the restore
  body of `routes/instance/backups.ts`. (`options.readonly` is dead — see
  below.)

### 2. Dedicated worker connections (background jobs)

`server/db/postgres/worker_connections.ts` — workers run in separate contexts
with no access to the request cache:

| Factory                      | `max` | `idle_timeout` | `prepare` | Use                                      |
| ---------------------------- | ----- | -------------- | --------- | ---------------------------------------- |
| `createWorkerConnection`     | 3     | 300s           | `false`   | general worker work                      |
| `createBulkImportConnection` | 5     | 600s           | `false`   | long bulk imports (no statement timeout) |
| `createWorkerReadConnection` | 2     | 120s           | `false`   | read-only worker reads                   |

`prepare: false` is required for the buffered bulk-`INSERT` style used by
importers. **These are not cached — every worker exit path must `.end()` them**
(teardown contract:
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md)).

### The `READ_ONLY` flag is cosmetic ⚠️

`getPgConnectionFromCacheOrNew(id, "READ_ONLY" | "READ_AND_WRITE")` uses
`permissions` **only to namespace the cache key**. It calls `getPgConnection`
with no options, and `getPgConnection` never reads `options.readonly` — no
`default_transaction_read_only` is ever set. Net effect: a `"READ_ONLY"`-keyed
connection can write freely, and the flag merely **doubles** the pooled
connections per database (a `_READ_ONLY` and a `_READ_AND_WRITE` entry, up to 20
each — size Postgres `max_connections` accordingly). Treat the parameter as
cache-namespacing, not a safety boundary (decision tracked as
PLAN_DOC_ENFORCEMENT item 15).

## The canonical DB-function shape

Abridged from `server/db/project/presentation_objects.ts`
(`addPresentationObject`):

```ts
export async function addPresentationObject(
  params: AddPresentationObjectParams,
): Promise<
  APIResponseWithData<{ newPresentationObjectId: string; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const id = await generateUniquePresentationObjectId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
      INSERT INTO presentation_objects (id, …, config, last_updated, folder_id)
      VALUES (${id}, …, ${
      JSON.stringify(presentationObjectConfigSchema.parse(config))
    },
              ${lastUpdated}, ${folderId ?? null})
    `;
    return {
      success: true,
      data: { newPresentationObjectId: id, lastUpdated },
    };
  });
}
```

Rules of the shape:

- **First parameter is the `Sql` connection** (`db` / `projectDb` / `mainDb`),
  passed in by the route from `c.var.ppk.projectDb` or `c.var.mainDb`. DB
  functions don't acquire their own connection.
- **Body wrapped in `tryCatchDatabaseAsync`** — converts any throw (including a
  Zod `.parse` failure) into `{ success: false, err }`.
- **Returns `APIResponseWithData<T>` or `APIResponseNoData`** — never raw rows,
  never a bare throw to the route. (Known stragglers: `ai_usage_logs.ts` and
  some log/user functions — Open items.)

### The error funnel

`server/db/utils.ts` → `tryCatchDatabaseAsync` catches, logs, and calls
`classifyDatabaseError` (`server/db/error_classifier.ts`), which maps:

- internal sentinel strings (`ERROR_CATEGORY.MODULE_NOT_RUN`, `DATA_NOT_FOUND`,
  `VALIDATION_ERROR`, …) → friendly messages;
- Postgres message patterns — `relation "ro_…" does not exist` →
  `DATA_NOT_FOUND` ("module may need to be run"), `column … does not exist` →
  `CONFIGURATION_ERROR`, `permission denied` → `PERMISSION_DENIED`;
- network error codes (`CONNECTION_ENDED`, `ECONNREFUSED`, …) → `NETWORK_ERROR`.

It returns a
`CategorizedError { category, userMessage, technicalMessage,
suggestedAction? }`
(`lib/types/errors.ts`); the wrapper sets
`err = userMessage [+ " " + suggestedAction]`. The `ro_` special-case is how a
not-yet-run module surfaces as a clean "run the module" message instead of a raw
SQL error.

### JSON column round-tripping

| Direction    | Pattern                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| **Read**     | `JSON.parse(raw)` or a domain parser (`parsePresentationObjectConfig`, `parseJsonOrThrow`) — trust the DB |
| **Write**    | `JSON.stringify(schema.parse(value))` **inline in the SQL template** — Zod-validate before write          |
| **Nullable** | `${value ?? null}`                                                                                        |

The validation boundary (which schema, where) is owned by
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md); this file documents
only the mechanical round-trip. Don't add read-time Zod validation as a matter
of course — trust the database after the startup sweep; validate on write. The
connection-level `undefined → null` transform means a missing field becomes SQL
`NULL`, not a default — be explicit with `?? null` for clarity.

### Transactions & optimistic concurrency

- **Multi-statement atomic writes use `db.begin(async (tx) => …)`**
  (`presentation_objects.ts`, `modules.ts`, `slides.ts`, `projects.ts`,
  `move_slides.ts`, `dashboards.ts`, the `datasets_in_project_*.ts` family, …).
- **Optimistic concurrency** uses a `last_updated` round-trip: the caller passes
  `expectedLastUpdated`; if it differs from the stored value, the function
  reports `conflicted: true` (e.g. `updateReportBody`,
  `updatePresentationObjectConfig`, `updateSlide`) rather than clobbering. The
  bumped `last_updated` is also the SSE/cache version key — see
  [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

## SQL safety — the normative rule

**This file owns the SQL-safety boundary.** The ingestion, PO-query, and
module-execution systems apply it to their domains but cite this rule rather
than restating it.

```text
VALUES           → tagged template ${value}            (always parameterized — safe)
IDENTIFIERS      → db(identifier) / projectDb(name)    (whitelisted by postgres.js)
DYNAMIC VALUES   → escapeSqlString(s)  ('' doubling)   (ONE sanctioned manual escaper)
RAW .unsafe(sql) → trusted-internal input ONLY         (closed unions / module-def
                                                        constants / repo-authored SQL)
```

- **Values**: always interpolate with the tagged template —
  `` projectDb`… WHERE id = ${id}` ``. Never string-concatenate a value.
- **Identifiers**: dynamic table/column names go through the helper —
  `` projectDb`SELECT * FROM ${projectDb(tableName)}` `` (see
  `results_objects.ts`). postgres.js quotes them safely. There are **no
  parameterized table names** — a table name from config must be validated
  against a closed set before it reaches SQL.
- **`escapeSqlString`** (`server/db/utils.ts`, `s.replace(/'/g, "''")`) is the
  **only** sanctioned manual escaper, used for hand-built `VALUES` tuples in the
  bulk paths (the HFA dataset functions and the HFA staging worker). The
  HMIS/structure staging paths still inline their own `''`-doubling — one shared
  helper + a ban on manual tuple escaping is PLAN_DOC_ENFORCEMENT item 6.
- **`.unsafe()`** runs raw SQL with no parameterization — ~20 call sites, all
  trusted-internal, in four groups: (1) the **bulk ingest paths** (S6-owned:
  `datasets_in_project_{hfa,hmis,iceh}.ts`, `instance/dataset_{hfa,hmis}.ts`,
  `instance/structure.ts`, staging workers) building large `INSERT`/DDL strings
  whose values go through `''`-doubling escaping; (2) the three **`detect*`
  probes** (`detectColumnExists`, `detectHasPeriodId`, `detectHasAnyRows` in
  `db/utils.ts`) interpolating table/column names that are internal constants /
  closed unions; (3) the **migration runner** executing repo-authored `.sql`
  files; (4) the **restore body** interpolating an internal project UUID into
  `DROP/CREATE DATABASE` and `pg_terminate_backend`. **`.unsafe()` with any
  user-influenced string is forbidden.**

## Boot & the schema lifecycle

`main.ts` calls `dbStartUp()` ([server/db_startup.ts](server/db_startup.ts))
before serving; every failure path is fail-stop (`Deno.exit(1)`), so a booted
server has verified-current schema and stored-JSON shapes. The sequence:

1. **Fresh-instance bootstrap.** Connect to the `postgres` admin DB; if `main`
   doesn't exist, create it, load `_main_database.sql`, and seed it (H_USERS
   admin rows, default `instance_config` rows, the common-indicator dictionary).
2. **Instance SQL migrations.** `runInstanceMigrations`
   (`server/db/migrations/runner.ts`): lexicographically-ordered `NNN_*.sql`
   files from `migrations/instance/`, applied-set tracked in a
   `schema_migrations` table per database, each file in its own transaction via
   `tx.unsafe(fileContents)`; any failure exits.
3. **Wedged-state resets.** Upload attempts stuck at an in-flight `status_type`
   (`staging`/`integrating`/`importing`) with no live worker are flipped to
   `error` (a restart mid-import would otherwise block all future imports via
   the concurrency guards); stale mid-run DHIS2 import runs are marked likewise.
4. **Instance data transforms.** Per-type JSON transforms (`instance_config`),
   each in its own transaction; any failure exits.
5. **Per-project pass.** `countryIso3` is read **once** from the main DB, then
   for each row in `projects`: project SQL migrations (`migrations/project/`,
   same runner), then the eight project data transforms in fixed order
   (`po_config`, `module_definition`, `metrics_columns`, `slide_deck_config`,
   `slide_config`, `reports`, `dashboard_config`, `dashboard_items`), each in
   its own transaction, fail-stop; plus explicitly-`TEMPORARY` cleanup sweeps
   (orphan modules, orphaned POs, dashboard-slug backfill) that self-identify in
   the file.

SQL migrations must be idempotent because the base schema files
(`_main_database.sql`, `_project_database.sql`) represent current state and new
databases get base + all migrations — patterns and the golden rule are in
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).
`./validate_migrations` (repo root) verifies the two paths converge by diffing
schemas in a throwaway `postgres:15` Docker container; run it after touching any
SQL migration.

### Backup / restore mechanics

The restore body of `routes/instance/backups.ts` (S15-owned file, this slice
reviewed here): terminate the project DB's backends, `DROP`/`CREATE` the
database via a fresh uncached admin pool, pipe the decompressed dump into `psql`
via `docker exec` on the postgres container, then `runProjectMigrations` on the
restored DB so an older dump is brought up to current schema immediately. The
JSON data transforms do **not** run until the next server restart, and the fresh
pool opened for the migration re-run is never `.end()`ed (both Open items).

## FigureBundle backfill — the boot-time cutover (shipped 2026-06-13)

This is S2's slice of the FigureBundle refactor; the bundle shape and the render
side live in [SYSTEM_10](SYSTEM_10_figure_render_export.md). S2 owns the
**migration** that converts every stored figure from the old
`{ figureInputs?, source? }` to the new `{ bundle? }` — a textbook
PROTOCOL_APP_MIGRATIONS data-transform (one deploy, no offline script).

- **Where.**
  [server/db/migrations/data_transforms/_figure_block.ts](server/db/migrations/data_transforms/_figure_block.ts)
  holds the shared conversion; the four per-surface sweeps (`slide_config.ts`,
  `dashboard_config.ts`, `dashboard_items.ts`, `reports.ts`) call
  `transformFigureBlock` then `transformFigureBlockToBundle` on each block. The
  strict `figureBlockSchema` final-parse aborts boot if any row is still legacy
  after transform (the skip-gate gotcha made safe by strictness).
- **chart / table / map → in-place.** The raw rows already sit in the blob
  (`figureInputs.{tableData|chartData|chartOHData|mapData}.jsonArray`, never
  stripped). Reshape to `items` (+ `valueProps` from the stored
  `jsonDataConfig`). Value-exact; values are coerced to strings to match the
  bundle's `Record<string,string>` items.
- **timeseries → reverse-transform the stored grid.** Only timeseries stored the
  transformed 5-D grid instead of `jsonArray`. The forward transform is a strict
  one-cell-one-row pivot (it throws on collisions), so the grid is **lossless
  and reversible**: emit one row per non-empty cell keyed by header id + period
  id. It is **self-validating** — `validateTimeseriesRoundTrip` does a direct
  lookup for every stored cell and **throws** if any value isn't recoverable
  (fail-fast → aborts boot). It reconstructs the original rollup-aware sort and
  `dateRange` (from `timeMin`/`nTimePoints`) so a mismatch is the only reason to
  fail. **Orphans dissolve**: a timeseries whose metric is uninstalled
  in-project converts from its own grid exactly like any other — no re-query, no
  `mainDb`, no blank placeholders.
- **Localization synthesis.** `getTransformLocalization(countryIso3)` builds the
  frozen `localization`: `language`/`calendar` from the instance env
  (`_INSTANCE_LANGUAGE`/`_INSTANCE_CALENDAR`), and `countryIso3` read **once**
  from the main DB at startup ([db_startup.ts](server/db_startup.ts)) and
  threaded through every project sweep — so backfilled figures carry the real
  country (drives admin-area relabelling at render). `provenance.moduleLastRun`
  is best-effort (= `snapshotAt`); the Phase-4 stale-flag is therefore
  approximate for backfilled figures (accepted).
- **Invalid config fails fast.** A missing/invalid `source.config` **throws**
  rather than producing a silent blank (which would masquerade as "empty" past
  `figureBlockSchema`), so the dry-run surfaces it by id.
- **Shared traversal.** `walkSlideLayoutNodes` (exported from
  `_figure_block.ts`) is used by both the `slide_config` boot sweep and the
  dry-run, so the two cannot drift in how they walk a slide layout.

### The mandatory pre-deploy dry-run gate

[validate_figure_bundle_backfill.ts](validate_figure_bundle_backfill.ts) (repo
root) runs the exact reshape + round-trip in **read-only** mode against every
instance's DBs before the cutover: per-outcome counts (in-place ok / timeseries
round-trip ok / FAIL / already-bundle / empty) and the identity of every
failure. The cutover deploys only when it is clean (zero round-trip failures) on
all instances. Result of the gate: **36/36 instances, 17,142 figures, 0 FAILs.**

## File & naming conventions

- **`_*.sql`** — base schema files (`_main_database.sql`,
  `_project_database.sql`), loaded via `db.file(...)`.
- **`_*_database_types.ts`** — hand-written `DB*` row types
  (`DBPresentationObject`, `DBUser`, …) describing raw table rows. These are
  _not_ Zod schemas (the `_*.ts` stored-schema convention is in
  [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)).
- **`mod.ts` barrels** — `db/mod.ts`, `db/instance/mod.ts`, `db/project/mod.ts`
  aggregate and re-export every non-helper sibling so callers never deep-import.
- **`generateUnique*Id`** (`server/utils/id_generation.ts`) — short nanoid
  (3-char, alphabet `23456789abcdefghjkmnpqrstuvwxyz`), retry-until-unique (10
  attempts) against a specific table. There are **7 near-identical copies**
  (deck/slide/report/presentation-object/dashboard/dashboard-item/
  dashboard-item-group) differing only by table name — consolidation is
  PLAN_DOC_ENFORCEMENT item 16. (Projects/folders/tokens use
  `crypto.randomUUID()` instead.)
- **PascalCase stragglers.** The DB-function convention is camelCase, but the
  log/usage families predate it (`AddLog`, `GetLogs`, `SetUserUnlimitedAi`,
  `DeleteOldLogs`, the `ai_usage_logs.ts` set, …) — don't copy them.

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
   write** — never stringify without the parse (schema per
   PROTOCOL_APP_MIGRATIONS); multi-statement writes inside `db.begin`.
6. **Bump `last_updated` on mutations** — it drives SSE + cache invalidation
   (S3) and the optimistic-concurrency round-trip.
7. **Export new DB functions from the appropriate `mod.ts` barrel.**

## Open items

- `ai_usage_logs.ts` (and some log/user functions) bypass the envelope: no
  `tryCatchDatabaseAsync`, raw rows/scalars returned, throws reach the caller.
- Restore runs SQL migrations but **not** the JSON data transforms — a restored
  dump's stored-JSON shapes stay stale until the next server restart.
- The restore body's fresh `getPgConnection(projectId)` pool is never `.end()`ed
  — one leaked pool per restore.
- Tracked in PLAN_DOC_ENFORCEMENT: one bulk-escape helper + ban hand-built
  `VALUES` (item 6), decide the `READ_ONLY` flag (item 15), consolidate
  `generateUnique*Id` — now 7 copies (item 16).
- Standardize the PascalCase DB-function stragglers to camelCase.
- Lint ideas (from the absorbed doc): flag `.unsafe()` call sites for
  trusted-input review; flag DB functions that throw or return non-envelope
  shapes; barrel-completeness check (`mod.ts` re-exports every sibling).
