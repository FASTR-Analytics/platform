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

# S2 — Persistence Core & Schema Lifecycle

The Postgres layer everything else stands on: **one database**, the two
sanctioned connection factories and their pools, the canonical `Sql`-first
DB-function shape with its single error funnel, the **SQL-safety boundary**
(this file is the normative owner of that rule), and the schema lifecycle —
fail-stop boot running SQL and TypeScript migrations, then JSON data
transforms. Reviewed
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
database from outside the app (PROTOCOL_ACCESS_DBS) is S15's cycle. Sub-file
custody exceptions are in SYSTEMS.md §4.1: `main.ts`
is owned by S1 (S2 reader — the boot call order).

## Contract

One database; pooled cached connections acquired only through
the two factories (the `READ_ONLY` flag is _nominal_ — never enforced); every DB
function takes an `Sql` first and returns an `APIResponse` through one error
funnel; values parameterized, identifiers whitelisted; boot is fail-stop (SQL +
TypeScript migrations, then data transforms, `Deno.exit(1)` on any failure);
stored-JSON evolution via transforms with skip-gates. Trap: boot success is
bound to panther schema versions via `_figure_block.ts`.

## One database

```text
Postgres server
├── postgres            ← the server's own admin db (the bootstrap CREATE DATABASE runs here)
└── main                ← everything: users, instance config, structure
                          (indicators/facilities/admin areas), datasets, the runs
                          catalogue, and the products registry with its per-type
                          detail tables
```

There is no per-tenant database: a deck or a report is a row in `products` on
`main` with per-type detail rows beside it (`server/db/products/**`, S12), and
the **results package on the runs volume** — not a Postgres database — is where
a product's data lives (S8/S9). One database means one connection id in
practice (`"main"`, plus `"postgres"` for the bootstrap), one migration chain,
one `schema_migrations` table, and one backup artifact.

The connection id is the same string everywhere: the connection-cache key and
the argument to `getPgConnectionFromCacheOrNew`. The one place another id is
still used is migration `080`, which opens a fresh read-only pool per legacy
project database while it consolidates them.

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
- **Lifecycle is owned by postgres.js `idle_timeout`** — there is deliberately
  **no manual cleanup** (manual `end()` on pools with in-flight queries crashed
  the server; see the comment in the file).
- `closePgConnection` / `closeAllConnections` exist only for explicit teardown:
  process shutdown in `main.ts` (SIGINT/SIGTERM) and the server test suite.
- `getPgConnection(databaseId, { max?, readonly? })` creates a **fresh,
  uncached** pool — caller must `.end()`. One call site: migration `080`
  opening each legacy project database with `{ max: 2 }` and `.end()`ing it in
  a `finally`. (`options.readonly` is dead — see below.)

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
cache-namespacing, not a safety boundary (ruled 2026-08-03: it stays
namespacing-only — making it real would break legitimate writes on
`READ_ONLY`-pooled connections, e.g. `getGlobalUser`'s open-access insert).

## The canonical DB-function shape

Abridged from `server/db/products/products.ts` (`createProduct`):

```ts
export async function createProduct(
  mainDb: Sql,
  args: { type: ProductType; folderId: string | null; createdBy: string },
): Promise<APIResponseWithData<{ productId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const productId = await generateUniqueProductId(mainDb);
    const lastUpdated = new Date().toISOString();
    const inserted = await mainDb.begin(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO products (id, type, label, folder_id, run_id, …, last_updated)
        SELECT ${productId}, ${args.type}, ${label}, ${args.folderId},
               r.id, …, ${lastUpdated}
        FROM runs r WHERE r.pinned AND r.status = 'ready'
        RETURNING id
      `;
      if (rows.length === 0) return false; // no ready pin — a typed failure
      await insertNewDetailRow(sql, args.type, productId, label);
      return true;
    });
    if (!inserted) return { success: false, err: NO_READY_PINNED_PACKAGE };
    return { success: true, data: { productId, lastUpdated } };
  });
}
```

Note the `SELECT … FROM runs WHERE pinned AND status = 'ready'` in place of a
read-then-insert: the readiness gate is **inside** the write, so it cannot race
a pin move, and "zero rows inserted" is the gate's failure signal.

Rules of the shape:

- **First parameter is the `Sql` connection** (`db` / `mainDb`), passed in by
  the route from `c.var.mainDb`. DB functions don't acquire their own
  connection.
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

- **Multi-statement atomic writes use `db.begin(async (tx) => …)`** — the whole
  `db/products/**` family (a product write always touches at least the
  `products` row and a detail row), `run_generation.ts`, `users.ts`,
  `rename_user_email.ts`, the dataset families, …
- **`products.last_updated` is THE version of a product**, deck or report,
  content or metadata alike: every content mutation bumps it in the same
  transaction as the detail write (the deck-touch rule, generalised), and so
  does every metadata write (label, folder, package, scope). `slides` is the
  one child table with its own stamp, because a slide is separately locked and
  separately cached.
- **Optimistic concurrency** uses a `last_updated` round-trip: the caller passes
  `expectedLastUpdated`; if it differs from the stored value, the function
  reports `conflicted: true` (e.g. `updateReportBody`, `updateSlide`) rather
  than clobbering. The comparison is against
  `products.last_updated` for a product-level write and `slides.last_updated`
  for a slide. The
  bumped `last_updated` is also the SSE/cache version key — see
  [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md). When a live
  collab room exists for the row, the mutating route offers the save to the
  room first (S16's `apply*ToLiveRoom` chokepoint) and the CRDT merge is the
  conflict resolution — the optimistic round-trip engages only on the no-room
  path. The room checkpoint stamps `last_updated` and the additive
  `crdt_state_last_updated` column equal in one write; any non-collab write
  bumps `last_updated` alone, which is exactly what invalidates the stored
  CRDT state ([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)).

## SQL safety — the normative rule

**This file owns the SQL-safety boundary.** The ingestion, PO-query, and
module-execution systems apply it to their domains but cite this rule rather
than restating it.

```text
VALUES           → tagged template ${value}            (always parameterized — safe)
IDENTIFIERS      → db(identifier)                      (whitelisted by postgres.js)
DYNAMIC VALUES   → escapeSqlString(s)  ('' doubling)   (ONE sanctioned manual escaper)
RAW .unsafe(sql) → trusted-internal input ONLY         (closed unions / module-def
                                                        constants / repo-authored SQL)
```

- **Values**: always interpolate with the tagged template —
  `` db`… WHERE id = ${id}` ``. Never string-concatenate a value.
- **Identifiers**: dynamic table/column names go through the helper —
  `` db`SELECT * FROM ${db(tableName)}` ``. postgres.js quotes them safely.
  There are **no
  parameterized table names** — a table name from config must be validated
  against a closed set before it reaches SQL.
- **`escapeSqlString`** (`server/db/utils.ts`, `s.replace(/'/g, "''")`) is the
  **only** sanctioned manual escaper for Postgres-bound SQL, used for
  hand-built `VALUES` tuples in the bulk paths (HFA/HMIS/structure staging,
  `db_startup`, the run-capture writers). No call site may inline its own
  `''`-doubling.
  `escapeSqlLiteral` (`server/run_query/duckdb_executor.ts`) is its DuckDB-side
  twin.
- **`.unsafe()`** runs raw SQL with no parameterization — ~90 call sites across
  17 files, all trusted-internal, in four groups: (1) the **bulk ingest paths**
  (S6-owned: `instance/dataset_hmis.ts`, `instance/structure.ts`, the staging
  workers and `server_only_funcs_importing/**`) building large `INSERT`/DDL
  strings whose values go through `''`-doubling escaping; (2) the **run-capture
  writers** (`server/runs/capture_inputs/**`, S6/S8) doing the same into the run
  workspace; (3) `detectHasAnyRows` (`db/utils.ts`) and
  `generateUniqueIdForTable` (`utils/id_generation.ts`), both interpolating a
  table name drawn from a compile-time closed union with the value still a bound
  parameter; (4) the **migration runner** executing repo-authored `.sql` files.
  **`.unsafe()` with any user-influenced string is forbidden.**

## Boot & the schema lifecycle

`main.ts` calls `dbStartUp()` ([server/db_startup.ts](server/db_startup.ts))
before serving; every failure path is fail-stop (`Deno.exit(1)`), so a booted
server has verified-current schema and stored-JSON shapes. The sequence:

1. **Fresh-instance bootstrap.** Connect to the `postgres` admin DB; if `main`
   doesn't exist, create it, load `_main_database.sql`, and seed it (H_USERS
   admin rows, default `instance_config` rows, the common-indicator dictionary).
2. **Migrations.** `runInstanceMigrations`
   (`server/db/migrations/runner.ts`) — **one pass on `main`, no loop.**
3. **Wedged-state resets.** Upload attempts stuck at an in-flight `status_type`
   with no live worker are flipped to
   `error` (a restart mid-import would otherwise block all future imports via
   the concurrency guards); stale mid-run HMIS/HFA/ICEH import runs are marked
   likewise.
4. **Data transforms.** `INSTANCE_DATA_TRANSFORMS`, in fixed order —
   `instance_config`, `runs_summary`, `slide_deck_config`, `slide_config`,
   `reports` — each in its own transaction on `main`, signature
   `(tx, countryIso3)`, fail-stop. Strictly AFTER the migrations, because `080`
   is what populates the product plane the last three sweep.
5. **Runs-volume housekeeping.** Create the runs dir, sweep abandoned `.tmp-`
   dirs and the DuckDB spill dir, mark interrupted `generating` catalogue rows
   failed, then run the run-manifest transforms (S8) — last, so the manifest
   sweep never sees debris the preceding lines remove.

### The migration chain

Migration ids are `NNN_*` filenames minus the extension, sorted together and
tracked in one `schema_migrations` table, each applied inside its own
transaction. **`.ts` migrations run beside `.sql` ones**: `TS_MIGRATIONS` in
`runner.ts` is a literal-keyed static import map (so `deno check main.ts`
covers every migration module), and a `.ts` file with no entry **throws** rather
than being silently skipped. A `.ts` migration receives the transaction and must
THROW on failure — never `Deno.exit` — so the runner stays the single rollback
and fail-stop funnel, exactly as it is for a `.sql` file; every statement it
issues, and every helper it calls, goes through that `tx`.

The four migrations that carry the consolidation, in order:

- `000_legacy_project_shell.sql` — `CREATE TABLE IF NOT EXISTS` for the
  pre-restructure `projects` / `project_user_roles` shells plus
  `ADD COLUMN IF NOT EXISTS project_id` on the three log tables. The base schema
  no longer has them, and Postgres resolves an index expression before the
  IF-NOT-EXISTS name check, so migrations `016` and `035` would not parse on a
  fresh database without it.
- `079_products.sql` — the products/folders DDL, identical to `_main_database.sql`.
- `080_consolidate_projects.ts` — one transaction that reads every ready
  `projects` row's own database (fresh `{ max: 2 }` pool, `.end()` in a
  `finally`, `pg_database` existence check first) and copies its decks, slides,
  reports and version rows into the product plane, remapping colliding primary
  keys and stamping `bundle.scope` / `provenance.runId` into every figure block.
  The planning core it shares with the read-only fleet dry-run
  (`validate_consolidation.ts`) is `server/db/migrations/consolidation/plan.ts`,
  which also carries a frozen copy of the old project-DB row types it reads.
- `081_drop_project_layer.sql` — drops the shells, the log `project_id` columns
  and the per-project user columns.

After the consolidation chain:

- `082_folder_nesting.sql` — adds `folders.parent_id` (self-referencing,
  `ON DELETE SET NULL` as a backstop only — the delete path reparents
  explicitly) plus its index, giving folders unlimited nesting (S12).

SQL migrations must be idempotent because `_main_database.sql` represents
current state and a new database gets base + all migrations — patterns and the
golden rule are in
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).
`./validate_migrations` (repo root) verifies the two paths converge by diffing
the schema in a throwaway `postgres:15` Docker container: one base schema, one
migration directory, and it globs `*.sql` so the `.ts` migrations are excluded
by construction. Run it after touching any SQL migration.

### Backups

Backups are a status-api / volume concern outside the app: one database means
one named `pg_dump` of `main`, taken by the fleet tooling, and the app ships no
backup or restore route. The recovery path for a bad product write is that daily
dump — products have hard delete and no trash.

## FigureBundle conversion — the stored-figure transform

This is S2's slice of the FigureBundle contract; the bundle shape and the render
side live in [SYSTEM_10](SYSTEM_10_figure_render_export.md). S2 owns the
**transform** that converts any stored figure still holding the old
`{ figureInputs?, source? }` into `{ bundle? }` — a textbook
PROTOCOL_APP_MIGRATIONS data-transform, run at boot with no offline script.

- **Where.**
  [server/db/migrations/data_transforms/_figure_block.ts](server/db/migrations/data_transforms/_figure_block.ts)
  holds the shared conversion; the two per-surface sweeps (`slide_config.ts`,
  `reports.ts`) call
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
  fail. **Orphans dissolve**: a timeseries whose metric is absent from the
  package converts from its own grid exactly like any other — no re-query, no
  `mainDb`, no blank placeholders.
- **Localization synthesis.** `getTransformLocalization(countryIso3)` builds the
  frozen `localization`, all three fields from the instance env —
  `_INSTANCE_LANGUAGE`/`_INSTANCE_CALENDAR`/`_INSTANCE_COUNTRY_ISO3` — threaded
  through every sweep, so converted figures carry the real country
  (drives admin-area relabelling at render). `provenance.moduleLastRun`
  is best-effort (= `snapshotAt`); the Phase-4 stale-flag is therefore
  approximate for backfilled figures (accepted).
- **Invalid config fails fast.** A missing/invalid `source.config` **throws**
  rather than producing a silent blank (which would masquerade as "empty" past
  `figureBlockSchema`), so the dry-run surfaces it by id.
- **Shared traversal.** `walkSlideLayoutNodes` (exported from
  `_figure_block.ts`) is used by both the `slide_config` boot sweep and the
  dry-run, so the two cannot drift in how they walk a slide layout.
- **`resultsValue.formatAs` is INFERRED here, and nowhere else.** A stored
  bundle carries no metric definition, so `inferFormatAs` supplies the field:
  `"indicator"` for the eight ids in `INDICATOR_FORMAT_METRIC_IDS`
  ([lib/indicator_format_metrics.ts](lib/indicator_format_metrics.ts)),
  `"number"` for m9-02-01 (frozen: its CIX/SII values are derived measures over
  percent indicators), otherwise the original backfill heuristic — percent iff
  **every** stored indicator entry declares `format_as: "percent"`, so a
  label-only entry counts as disagreement. That strictness is the point: the
  function repairs history and must not improve on it. It deliberately does NOT
  run the live resolution rule, which counts only values on an indicator
  DIMENSION: a legacy figure displaying no indicator dimension would resolve
  `"number"` and freeze a percent metric's values as raw fractions, and this
  write is permanent. The flip needs a **forced** skip-gate
  (`rawJsonNeedsIndicatorFormatFlip`), because a bundle whose stored `formatAs`
  still says `"number"` for a listed metric parses cleanly under the three-way
  schema and a parse-only gate would skip it forever
  ([PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md), "Skip-Gate
  Gotcha"). The same frozen list drives `manifest_transform` block 2 for run
  manifests. The declaration itself is
  [SYSTEM_10](SYSTEM_10_figure_render_export.md)'s.

## File & naming conventions

- **`_*.sql`** — the base schema file (`_main_database.sql`), loaded via
  `db.file(...)`.
- **`_*_database_types.ts`** — hand-written `DB*` row types
  (`DBProduct`, `DBUser`, …) describing raw table rows. These are
  _not_ Zod schemas (the `_*.ts` stored-schema convention is in
  [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)).
- **`mod.ts` barrels** — `db/mod.ts`, `db/instance/mod.ts`, `db/products/mod.ts`
  aggregate and re-export every non-helper sibling so callers never deep-import.
- **`generateUnique*Id`** (`server/utils/id_generation.ts`, S12) — short nanoid,
  **4 chars** over the alphabet `23456789abcdefghjkmnpqrstuvwxyz`
  (923,521 combinations — the namespace is now the whole instance, not one
  project), retry-until-unique (10 attempts) against a specific table: one
  internal core over a closed `IdTable` union (`products` | `slides`) and two
  thin wrappers. Decks and reports share the `products` namespace. Ids are never
  length-validated, so pre-existing 3-char ids stay as they are and registry
  params stay `z.string()`, never `z.uuid()`. (Folders, versions and tokens use
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
- **The next base squash retires migration history.** `000`, `080` and
  `consolidation/plan.ts` (which carries a frozen copy of the old project-DB row
  types) exist only to consolidate an instance coming from the project layer,
  and the runner's `.ts` support exists only for `080`. Once every instance is
  past it, squash the base and delete all four.
- Standardize the PascalCase DB-function stragglers to camelCase.
- Lint ideas (from the absorbed doc): flag `.unsafe()` call sites for
  trusted-input review; flag DB functions that throw or return non-envelope
  shapes; barrel-completeness check (`mod.ts` re-exports every sibling).
