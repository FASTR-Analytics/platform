# Import Pipeline (Stage → Integrate)

The two-phase ingestion pattern for HMIS / HFA / structure data from CSV and DHIS2: UNLOGGED staging tables, the upload-attempt step state machine, the per-phase validation funnel, the buffered bulk-`INSERT`, and the transactional merge into canonical tables.

> The worker lifecycle (spawn, handshake, teardown) is [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md); this doc owns the *ingestion flow* inside those workers. SQL-safety/escaping rules are owned by [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md). Period (`period_id` = `YYYYMM`) validation is [DOC_period_column_handling.md](DOC_period_column_handling.md). DHIS2 fetching/retry is [DOC_DHIS2_INTEGRATION.md](DOC_DHIS2_INTEGRATION.md). Stored-schema validation/naming is [DOC_MIGRATIONS.md](DOC_MIGRATIONS.md). `population.csv` (a different, module-specific format) is [DOC_POPULATION_CSV.md](DOC_POPULATION_CSV.md).

---

## Principles

1. **Stage, then integrate — two phases.** Phase 1 streams/fetches *validated* rows into an UNLOGGED staging table outside any transaction (for speed). Phase 2 merges staging → canonical tables inside the **only** DB transaction, then drops staging.
2. **Validate at the boundary, twice.** Row-level checks (required fields, period, count) happen while reading; reference checks (facility exists, indicator mapped) happen against the DB. Drops are counted and surfaced, not silently swallowed.
3. **Bulk-insert through a buffer.** Rows accumulate into a `VALUES`-tuple buffer flushed every N rows — never one INSERT per row, never one giant statement.
4. **Clean up staging on every exit.** Staging/temp tables are `DROP TABLE IF EXISTS`-ed in `catch` blocks and after a successful merge.

---

## The System

```text
  file (TUS upload) / DHIS2 fetch
        │
        ▼  PHASE 1 — STAGE  (no transaction; speed)
  stream rows  → row-level validation → buffered VALUES → flush every BUFFER_SIZE
        │           (drops counted)        into CREATE UNLOGGED TABLE <staging>
        ▼
  step_3_result (JSON): counts, sampled drops, preview   ← persisted on the upload attempt
        │
        ▼  PHASE 2 — INTEGRATE  (single mainDb.begin transaction)
  verify staging exists → reference validation (LEFT JOIN facilities …)
        → INSERT dataset_*_versions (new version record)
        → UPDATE existing rows  → DELETE matched from staging  → INSERT remaining (new rows)
        → update version counts
        ▼
  DROP staging table
```

### Two execution models

| Model | Used by | Mechanics | Cap |
|-------|---------|-----------|-----|
| **Background worker** (async) | HMIS, HFA datasets | `stage_*` / `integrate_*` worker routines; progress via `status`/`status_type` row + SSE; `worker_store` lock | none (bulk connection, no statement timeout) |
| **Synchronous in-request** (streamed) | structure (admin areas + facilities) | `stage_structure_from_csv` / `…_from_dhis2` run in the request via `streamResponse`; `onProgress` callback | **100 MB** file size limit |

The choice criterion is undocumented today (see enforcement): datasets are large and asynchronous; structure is interactive (a preview is returned to the client before integration).

### Phase 1 — staging

Canonical example `server/server_only_funcs_importing/stage_structure_from_csv.ts`:

1. **Setup/validation** — file-size check (structure: 100 MB), load config (`maxAdminArea`, facility columns).
2. **Parse** — `getCsvStreamComponents` returns `{ encodedHeaderToIndexMap, processRows }`; column mappings resolve header → index via `getCsvColumnIndex`.
3. **Create staging** — `DROP TABLE IF EXISTS` then `CREATE UNLOGGED TABLE <staging> (…)`. UNLOGGED = no WAL = fast, non-durable (fine, it's transient).
4. **Stream + validate + buffer** — `processRows(async (row) => …)`: extract fields, run row-level validation (`cleanValStrForSql`, required-field/period/count checks), `invalidRows++` and `return` on failure, else push a `VALUES` tuple to `rowBuffer`; flush via `INSERT … VALUES <tuples>` when `rowBuffer.length >= BUFFER_SIZE`.
5. **Index + preview** — create indexes, compute `DISTINCT` counts for the client preview.
6. **Return `StagingResult`** — counts + preview; for datasets this is persisted as `step_3_result`.

### The 4-level admin-area model (structure)

Staging always materializes `admin_area_1..4`. When `maxAdminArea < 4`, the highest present level is **duplicated** up to level 4 (so downstream code always has 4 levels). Integration does `DISTINCT` level-by-level inserts of admin areas and `ROW_NUMBER` dedup of facilities.

### The upload-attempt step state machine (datasets)

Dataset imports track progress on `dataset_*_upload_attempts`:
- `step` integer (0–4) + `step_N_result` JSON blobs (read with `parseJsonOrThrow`);
- `status` (JSON: `{ status, progress, err? }`) + a **denormalized `status_type` enum** (`staging` / `integrating` / `complete` / `error`) the client polls over SSE;
- the worker claims the lock by immediately setting `status_type='staging'`, then updates progress as it runs.

### Phase 2 — integration

`server/worker_routines/integrate_hmis_data/worker.ts`:

1. **Verify** staging table exists (`information_schema.tables`).
2. **Reference validation** — `LEFT JOIN facilities … WHERE f.facility_id IS NULL`; throw listing orphans. (This re-checks references that staging already filtered — guarding the facilities-deleted-between-phases case.)
3. **New version** — `newVersionId = max + 1`; `ANALYZE` both tables.
4. **Transaction** (`mainDb.begin`) with tuned `SET LOCAL` (`work_mem`, `synchronous_commit = OFF`, `maintenance_work_mem`):
   - INSERT the `dataset_hmis_versions` record (FK target);
   - `UPDATE` existing rows (faster than `ON CONFLICT`) → `DELETE` the matched rows from staging → `INSERT` the remaining (genuinely new) rows;
   - update the version record with actual `n_rows_inserted` / `n_rows_updated`.
5. **Cleanup** — `DROP TABLE IF EXISTS <staging>`.

### CSV/XLSForm parsing (folded in)

`server/server_only_funcs_csvs/`:
- `getCsvStreamComponents` (`get_csv_components_streaming_fast.ts`) is the **mandatory streaming entry point** for large files — it returns header indexing + a `processRows` iterator rather than loading the whole file.
- Headers are addressed via `encodeRawCsvHeader(i, str)` (Col-N style), and a `:::` suffix on a header is stripped (it carries select-option metadata).
- HFA staging expands `select_multiple` XLSForm vars into one column per choice (`<var>_<choice>`).

---

## Rules

1. **Stage to an UNLOGGED table, integrate in one transaction.** Don't write canonical tables row-by-row from the parse loop; stage first, merge once.
2. **Buffer bulk inserts.** Accumulate `VALUES` tuples and flush at a buffer size; never one statement per row, never an unbounded single statement.
3. **Count and surface drops.** Row-level validation increments a drop counter; persist sampled (first N) + total drops into `step_3_result`. Don't silently discard rows.
4. **Clean up staging on every exit** (`catch` blocks and success path), via `DROP TABLE IF EXISTS`.
5. **Escaping goes through the sanctioned path** — see [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md) for the SQL-safety rule. Bulk `VALUES` tuples are user data; they must be escaped consistently (today they aren't — see below).
6. **Create a new dataset version on integrate** (`dataset_*_versions`) so the cache version key and history advance ([DOC_VALKEY_CACHE.md](DOC_VALKEY_CACHE.md)).

---

## What NOT to do

- **Don't build `VALUES` tuples with ad-hoc escaping.** Today the three pipelines diverge: structure uses `cleanValStrForSql` **and** `''`-doubling (`v.replace(/'/g, "''")`); HFA uses `cleanValStrForSql` only with **no** doubling (embedded directly in `'…'`); HMIS facility id uses `''`-doubling **without** `cleanValStrForSql`. That's a correctness and injection risk on user-supplied data. Consolidate to one helper.
- **Don't add a pipeline with a fixed staging-table name and no concurrency guard.** Only `stage_structure_from_dhis2` takes a `pg_try_advisory_lock(12345, 67890)`; the others share one fixed staging name per DB with no lock, so two concurrent same-type imports can corrupt each other.
- **Don't assume references validated at staging are still valid at integrate.** Facilities can be deleted between phases — integrate re-validates and throws.
- **Don't skip the version record.** It's the FK target for the data rows and the source of the cache version.

---

## Gotchas

- **UNLOGGED ≠ temporary.** UNLOGGED tables survive a connection but not a crash, and are not auto-dropped — the explicit `DROP` is what cleans them up. A forgotten drop leaves a stale staging table that the next run must overwrite.
- **Fixed staging-table names per instance DB.** `UPLOADED_HMIS_DATA_STAGING_TABLE_NAME` / `UPLOADED_HFA_DATA_STAGING_TABLE_NAME` (env) and `temp_structure_staging` (hardcoded) are single names — concurrent imports of the same type collide.
- **`BUFFER_SIZE` and progress ranges are copy-pasted and differ per pipeline** (e.g. structure flushes at 10 000). An oversized buffer risks a too-large statement / OOM.
- **The structure import is synchronous** and capped at 100 MB; a larger structure file must use a worker (which doesn't exist yet for structure).
- **`status_type` is denormalized** from `status` JSON — both must be updated together or the client polls a stale state.

---

## Enforcement opportunities

- **One bulk-escape helper** (e.g. `sqlBulkLiteral`) used by all pipelines; ban hand-built `VALUES` escaping. Resolves the three-way divergence.
- **Uniform concurrency protection** — advisory locks everywhere, or attempt-id-namespaced staging tables so concurrent same-type imports can't collide.
- **Declare where reference validation is authoritative** (staging-time filter vs integrate-time re-check) and document the deleted-between-phases edge.
- **Centralize `BUFFER_SIZE` / progress-scaling constants** to prevent oversized-statement/OOM regressions.
- **Register staging tables in one list/helper** so a new temp table can't be forgotten in a `catch` (and to dedupe the per-table drop blocks).
- **Document the worker-vs-synchronous criterion** and the 100 MB cap rationale.

---

## Adding an import pipeline — checklist

- [ ] Decide model: background worker (large/async) or synchronous streamed (interactive, with a size cap)
- [ ] Phase 1: `getCsvStreamComponents` (or DHIS2 fetch) → row-level validate (count drops) → buffered `VALUES` → `CREATE UNLOGGED TABLE`
- [ ] Persist a staging result (`step_3_result` for datasets) with sampled + total drop counts
- [ ] Phase 2: verify staging → reference-validate → `INSERT versions` → UPDATE/DELETE/INSERT merge in one `begin` → update counts
- [ ] `DROP TABLE IF EXISTS` staging on success AND in every `catch`
- [ ] Concurrency guard (advisory lock or namespaced staging name)
- [ ] Escape bulk values through the sanctioned helper ([DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md))

---

## Key files

| File | Purpose |
|------|---------|
| `server/server_only_funcs_importing/stage_structure_from_csv.ts` | structure staging (synchronous, streamed) |
| `server/server_only_funcs_importing/stage_structure_from_dhis2.ts` | structure staging from DHIS2 (advisory-locked) |
| `server/server_only_funcs_importing/integrate_structure_from_staging.ts` | structure merge into admin_areas/facilities |
| `server/worker_routines/stage_hmis_data_csv/worker.ts`, `stage_hfa_data_csv/`, `stage_hmis_data_dhis2/` | dataset staging workers |
| `server/worker_routines/integrate_hmis_data/worker.ts`, `integrate_hfa_data/` | dataset integration workers |
| `server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts` | `getCsvStreamComponents` (streaming entry point) |
| `server/server_only_funcs_csvs/parse_xlsform.ts`, `read_xlsx_raw.ts` | XLSForm / XLSX parsing |
| `server/db/instance/dataset_hmis.ts`, `dataset_hfa.ts` | upload-attempt state machine + worker spawn |
| `server/exposed_env_vars.ts` | staging-table-name constants |
