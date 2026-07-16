# Database Access Layer

The runtime (non-migration) database layer: the multi-database model and connection strategies, the canonical `Sql`-first `APIResponse` function shape, the error funnel, JSON round-tripping, and the **SQL-safety boundary** (this doc is the normative owner of that rule).

> Schema migrations, JSON data-transforms, and the write-time/read-time *validation* boundary live in [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — this doc cross-links rather than restates them. This is the authoritative source for the runtime DB **naming and connection model**. DB functions return `APIResponse` envelopes consumed by routes ([DOC_API_ROUTES.md](DOC_API_ROUTES.md)).

---

## Principles

1. **One database, one connection helper.** Acquire connections through the two sanctioned factories — never `new postgres(...)` ad hoc.
2. **Every DB function returns an `APIResponse`.** Wrap the body in `tryCatchDatabaseAsync`; return `{ success: false, err }` on failure rather than throwing into the caller.
3. **Parameterize values; whitelist identifiers.** Tagged-template `${value}` is always safe. Dynamic table/column names go through the `db(identifier)` helper or are trusted-internal constants. Raw `.unsafe()` string interpolation is the exception, not the rule.
4. **Trust the database after the startup sweep.** Read with `JSON.parse` / domain parsers; validate with Zod only on write and at external boundaries (see [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)).

---

## The multi-database model

```text
  Postgres server
  ├── main                ← reserved name. Users, projects metadata, instance config,
  │                          shared structure (indicators/facilities/admin areas), datasets
  ├── postgres            ← reserved (the server's own admin db)
  ├── <uuid-A>            ← one database per project, named by a BARE crypto.randomUUID()
  ├── <uuid-B>            │   (NOT "project_<uuid>")
  └── …                   ┘
```

A project database is created with the **bare UUID** as the database name:

```ts
// server/db/project/projects.ts
const newProjectId = crypto.randomUUID();
await mainDb`create database ${mainDb(newProjectId)}`;       // identifier via db() helper
const projectDb = getPgConnectionFromCacheOrNew(newProjectId, "READ_AND_WRITE");
await projectDb.file("./server/db/project/_project_database.sql");   // load base schema
```

> **Correction:** `CLAUDE.md` and older docs say project DBs are named `project_{uuid}`. They are not — the name **is** the raw UUID (`databaseId === crypto.randomUUID()`). This matters for anyone reasoning about connection ids or cache keys.

The connection id (`"main"` or the project UUID) is the same string used everywhere: as the cache key, in `getPgConnectionFromCacheOrNew`, and threaded through `c.var.ppk.projectId`.

---

## Connection strategies

There are two acquisition paths. Pick by **who owns the lifecycle**.

### 1. Cached request connections (request handlers)

`server/db/postgres/connection_manager.ts`:

```ts
const db = getPgConnectionFromCacheOrNew(id, "READ_AND_WRITE");   // "main" or project UUID
```

- Cached in `_CACHED_CONNECTIONS`, keyed `` `${id}_${permissions}` ``.
- Pool defaults: `max: 20`, `idle_timeout: 300`, `statement_timeout`/`query_timeout: 300000`, `prepare: true`, `transform.undefined → null`.
- **Lifecycle is owned by postgres.js `idle_timeout`** — there is deliberately **no manual cleanup** (manual `end()` on pools with in-flight queries crashed the server; see the comment in the file / `DIAGNOSIS_CONNECTION_ENDED.md`).
- `closePgConnection` / `closeAllConnections` exist only for explicit teardown (shutdown in `main.ts`).
- `getPgConnection(databaseId, { max?, readonly? })` creates a **fresh, uncached** pool — caller must `.end()`. Used rarely.

### 2. Dedicated worker connections (background jobs)

`server/db/postgres/worker_connections.ts` — workers run in separate contexts with no access to the request cache:

| Factory | `max` | `idle_timeout` | `prepare` | Use |
|---------|-------|----------------|-----------|-----|
| `createWorkerConnection` | 3 | 300s | `false` | general worker work |
| `createBulkImportConnection` | 5 | 600s | `false` | long bulk imports (no statement timeout) |
| `createWorkerReadConnection` | 2 | 120s | `false` | read-only worker reads |

`prepare: false` is required for the buffered bulk-`INSERT` style used by importers. **These are not cached — every worker exit path must `.end()` them** (see [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md)).

### The `READ_ONLY` flag is cosmetic ⚠️

`getPgConnectionFromCacheOrNew(id, "READ_ONLY" | "READ_AND_WRITE")` uses `permissions` **only to namespace the cache key**. It calls `getPgConnection(id)` with no options, and `getPgConnection` **never reads `options.readonly`** — no `default_transaction_read_only` is ever set. Net effect: a `"READ_ONLY"`-keyed connection can write freely, and the flag merely **doubles** the number of pooled connections per database (a `_READ_ONLY` and a `_READ_AND_WRITE` entry). Treat the parameter as cache-namespacing, not a safety boundary (see enforcement).

---

## The canonical DB-function shape

```ts
export async function addPresentationObject(
  params: AddPresentationObjectParams,
): Promise<APIResponseWithData<{ newPresentationObjectId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const id = await generateUniquePresentationObjectId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
      INSERT INTO presentation_objects (id, …, config, last_updated, folder_id)
      VALUES (${id}, …, ${JSON.stringify(presentationObjectConfigSchema.parse(config))},
              ${lastUpdated}, ${folderId ?? null})
    `;
    return { success: true, data: { newPresentationObjectId: id, lastUpdated } };
  });
}
```

Rules of the shape:
- **First parameter is the `Sql` connection** (`db` / `projectDb` / `mainDb`), passed in by the route from `c.var.ppk.projectDb` or `c.var.mainDb`. DB functions don't acquire their own connection.
- **Body wrapped in `tryCatchDatabaseAsync`** — converts any throw (including a Zod `.parse` failure) into `{ success: false, err }`.
- **Returns `APIResponseWithData<T>` or `APIResponseNoData`** — never raw rows, never a bare throw to the route.

### The error funnel

`server/db/utils.ts` → `tryCatchDatabaseAsync` catches, logs, and calls `classifyDatabaseError` (`server/db/error_classifier.ts`), which maps:
- internal sentinel strings (`ERROR_CATEGORY.MODULE_NOT_RUN`, `DATA_NOT_FOUND`, `VALIDATION_ERROR`, …) → friendly messages;
- Postgres message patterns — `relation "ro_…" does not exist` → `DATA_NOT_FOUND` ("module may need to be run"), `column … does not exist` → `CONFIGURATION_ERROR`, `permission denied` → `PERMISSION_DENIED`;
- network error codes (`CONNECTION_ENDED`, `ECONNREFUSED`, …) → `NETWORK_ERROR`.

It returns a `CategorizedError { category, userMessage, technicalMessage, suggestedAction? }`; the wrapper sets `err = userMessage [+ " " + suggestedAction]`. The `ro_` special-case is how a not-yet-run module surfaces as a clean "run the module" message instead of a raw SQL error.

### JSON column round-tripping

| Direction | Pattern |
|-----------|---------|
| **Read** | `JSON.parse(raw)` or a domain parser (`parsePresentationObjectConfig`, `parseJsonOrThrow`) — trust the DB |
| **Write** | `JSON.stringify(schema.parse(value))` **inline in the SQL template** — Zod-validate before write |
| **Nullable** | `${value ?? null}` ternary |

The validation boundary (which schema, where) is owned by [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md). This doc only documents the mechanical round-trip.

### Transactions & optimistic concurrency

- **Multi-statement atomic writes use `db.begin(async (tx) => …)`** (`presentation_objects.ts`, `modules.ts`, `slides.ts`, `projects.ts`, `move_slides.ts`, …).
- **Optimistic concurrency** uses a `last_updated` round-trip: the caller passes `expectedLastUpdated`; if it differs from the stored value, the function reports `conflicted: true` (e.g. `updateReportBody`) rather than clobbering. The bumped `last_updated` is also the SSE/cache version key — see [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

---

## SQL safety — the normative rule

**This doc owns the SQL-safety boundary.** The PO-query, import, and module-execution docs apply it to their domains but cite this rule rather than restating it.

```text
  VALUES           → tagged template ${value}            (always parameterized — safe)
  IDENTIFIERS      → db(identifier) / projectDb(name)    (whitelisted by postgres.js)
  DYNAMIC VALUES   → escapeSqlString(s)  ('' doubling)   (ONE sanctioned manual escaper)
  RAW .unsafe(sql) → trusted-internal input ONLY         (closed unions / module-def constants)
```

- **Values**: always interpolate with the tagged template — `` projectDb`… WHERE id = ${id}` ``. Never string-concatenate a value.
- **Identifiers**: dynamic table/column names go through the helper — `` projectDb`SELECT * FROM ${projectDb(tableName)}` `` (see `results_objects.ts`). postgres.js quotes them safely.
- **`escapeSqlString`** (`server/db/utils.ts`, `s.replace(/'/g, "''")`) is the **only** sanctioned manual escaper, used for the hand-built `IN (VALUES …)` bulk case. Do not invent another.
- **`.unsafe()`** runs raw SQL with no parameterization. The `detect*` probes (`detectColumnExists`, `detectHasPeriodId`, `detectHasAnyRows`) interpolate a table/column name directly into `.unsafe(\`SELECT ${col} FROM ${table}\`)`. This is only safe because those names are internal constants / closed unions — **`.unsafe()` with any user-influenced string is forbidden.**

---

## File & naming conventions

- **`_*.sql`** — base schema files (`_main_database.sql`, `_project_database.sql`), loaded via `db.file(...)`.
- **`_*_database_types.ts`** — hand-written `DB*` row types (`DBPresentationObject`, `DBUser`, …) describing raw table rows. These are *not* Zod schemas (the `_*.ts` stored-schema convention is in [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)).
- **`mod.ts` barrels** — `db/mod.ts`, `db/instance/mod.ts`, `db/project/mod.ts` aggregate and re-export. Routes import from `lib` (cross-package) or `../../db/mod.ts`.
- **`generateUnique*Id`** (`server/utils/id_generation.ts`) — short nanoid (3-char alphabet `23456789abcdefghjkmnpqrstuvwxyz`), retry-until-unique (10 attempts) against a specific table. There are **6 near-identical copies** (deck/slide/report/presentation-object/dashboard/dashboard-item) differing only by table name. (Projects/folders/tokens use `crypto.randomUUID()` instead.)

---

## Rules

1. **Acquire via a factory** (`getPgConnectionFromCacheOrNew` for requests, the `*WorkerConnection` factories for workers). Never instantiate `postgres()` directly outside `connection_manager.ts` / `worker_connections.ts`.
2. **Wrap every DB op in `tryCatchDatabaseAsync` and return an `APIResponse`.** No bare throws to the route, no returning raw rows.
3. **Parameterize values, whitelist identifiers.** `.unsafe()` only on trusted-internal input; never hand-build `VALUES` tuples outside `escapeSqlString`.
4. **Worker connections must `.end()` on every exit path** (they are uncached).
5. **`mod.ts` barrels re-export every non-helper sibling** so callers never deep-import.

---

## What NOT to do

- **Don't treat `"READ_ONLY"` as a safety boundary** — it doesn't prevent writes. If you need a true read-only connection, set `default_transaction_read_only` (it isn't, today — see enforcement).
- **Don't `.unsafe()` a user-influenced string.** If a column/table name comes from config, validate it against a closed set first.
- **Don't add read-time Zod validation** as a matter of course — trust the DB after startup ([PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)). Validate on write.
- **Don't manually `.end()` a cached connection** mid-request — postgres.js owns that lifecycle.
- **Don't `JSON.stringify` without `schema.parse`** when writing a stored-schema column.

---

## Gotchas

- **PascalCase stragglers.** Most DB functions are camelCase, but some are PascalCase (`AddLog`, `GetLogs`, `SetUserUnlimitedAi`, `DeleteOldLogs`, …). The convention is camelCase; the PascalCase ones predate it.
- **`undefined → null` transform.** The connection options transform `undefined` to SQL `NULL`, so a missing field becomes `NULL`, not a default. Be explicit with `?? null` for clarity.
- **`statement_timeout` is 5 min for cached pools but absent for bulk-import connections** — a runaway bulk import won't be killed by the DB.
- **Two cache entries per DB.** Because of the `READ_ONLY`/`READ_AND_WRITE` key split, each database can hold two pools of up to 20 — size your Postgres `max_connections` accordingly.

---

## Enforcement opportunities

- **Resolve the `READ_ONLY` boundary:** either set `default_transaction_read_only` on those connections, or rename the parameter to make clear it only namespaces the cache key.
- **Standardize on camelCase** DB-function names (migrate the PascalCase stragglers).
- **Lint `.unsafe()`** call sites to confirm trusted-input-only, and forbid hand-built `VALUES` outside `escapeSqlString`.
- **Consolidate `generateUnique*Id`** into one `generateUniqueId(db, tableName)`.
- **Barrel completeness check:** `mod.ts` must re-export every sibling (some omissions force deep imports today).
- **Require `tryCatchDatabaseAsync`**: flag DB functions that throw or return non-envelope shapes (a few raw-throwing paths exist in `ai_usage_logs.ts`, etc.).

---

## Adding a DB function — checklist

- [ ] Signature `(db: Sql, ...args) => Promise<APIResponse…>`, connection passed in
- [ ] Body wrapped in `tryCatchDatabaseAsync`
- [ ] Values via tagged template; dynamic identifiers via `db(name)`; no `.unsafe()` on external input
- [ ] JSON columns: `JSON.parse` on read, `JSON.stringify(schema.parse(x))` on write (schema per [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md))
- [ ] Multi-statement writes inside `db.begin`
- [ ] Bump `last_updated` on mutations (drives SSE + cache invalidation)
- [ ] Export from the appropriate `mod.ts` barrel

---

## Key files

| File | Purpose |
|------|---------|
| `server/db/postgres/connection_manager.ts` | cached request connections, pool defaults, teardown |
| `server/db/postgres/worker_connections.ts` | dedicated worker pools (`prepare:false`) |
| `server/db/utils.ts` | `tryCatchDatabaseAsync`, `escapeSqlString`, `detect*`, table-name helpers |
| `server/db/error_classifier.ts` | `classifyDatabaseError` → `CategorizedError` |
| `lib/types/errors.ts` | `ERROR_CATEGORY`, `CategorizedError` |
| `server/utils/id_generation.ts` | the 6 `generateUnique*Id` helpers |
| `server/db/{instance,project}/_*_database.sql` | base schema files |
| `server/db/{instance,project}/_*_database_types.ts` | raw `DB*` row types |
| `server/db/{mod,instance/mod,project/mod}.ts` | barrels |
| `server/db/project/presentation_objects.ts` | canonical function shape |
| `server/db/project/projects.ts` | project DB creation (bare-UUID naming) |
