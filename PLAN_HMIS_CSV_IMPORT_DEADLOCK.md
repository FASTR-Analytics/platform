# PLAN — HMIS CSV import wedges at "integrating 20%" (Ghana, 2026-08-12)

Status: DIAGNOSED + FIX VERIFIED IN HARNESS, awaiting ruling. No app code
edited.

## Problem

Angélica's 2026-08-14 email ("data upload speed"): Gafaru (Ghana Health
Service / R4D) reports HMIS CSV uploads "taking forever" since the 1.66.x
update; a half-year performance report is blocked.

It is not slowness. Ghana's first CSV import on the new `csv-runs` importer
(shipped 1.66.0, 2026-08-10) is **deadlocked** and has been for 5 days; six
more runs are queued behind it. Nothing has integrated.

## Evidence (all read-only, wb-server)

`dataset_hmis_import_runs` on ghana-postgres:

```
id | source | status  | started_at              | progress
 1 | csv    | running | 2026-08-12 21:19:30 UTC | {"phase":"integrating","percent":20}
 2–7 | csv  | queued  | 2026-08-12 21:22–21:27  |
```

Files: diab2020.csv (run 1) … diab2021–2024, diab2026, 2025dia.csv (runs
2–7). All seven still in `/app/assets` with size/mtime matching the stored
`filePin`. Run 1's staging table exists (9,985 rows). `dataset_hmis` = 10.55M
rows. Container up since 2026-08-12 08:22 UTC (1.66.8), never restarted.

`pg_stat_activity` / `pg_locks`, 4d 9h old:

- pid 62431 — `idle in transaction`, wait `Client/ClientRead`; last statement
  the `DELETE FROM uploaded_hmis_data_staging_ready_for_integration_run_1`.
  Holds `RowExclusiveLock` on `dataset_hmis_import_runs` + its transactionid.
- pid 62440 — `active`, waiting on `Lock/transactionid`;
  `pg_blocking_pids` = `{62431}`; query =
  `UPDATE dataset_hmis_import_runs SET progress = $1 WHERE id = $2 AND status = 'running'`.

Fleet sweep (every `*-postgres` container): Ghana is the only instance with
a running/queued HMIS run. Latent everywhere — any CSV import whose merge
takes > 2 s will wedge the same way.

## Root cause

`server/worker_routines/import_hmis_data_csv/integrate_staged.ts`, inside
`mainDb.begin(...)`:

1. `UPDATE dataset_hmis_import_runs SET version_id = … WHERE id = runId`
   — takes the run-row lock, held until commit.
2. then `onProgress(40)`, the big `UPDATE dataset_hmis … FROM staging`,
   `DELETE`, `onProgress(60)`, INSERT, ledger, `onProgress(70)`.

`onProgress` → `createThrottledProgressWriter` (2 s interval) → an `UPDATE
dataset_hmis_import_runs SET progress …` on a **different pooled connection**
(`mainDb`, max 2). Once the merge has run longer than the throttle interval,
the next progress write blocks on the row lock held by the transaction, and
the transaction is `await`ing that write → mutual wait Postgres cannot see
(one side is idle-in-transaction, not lock-waiting). Deterministic on any
non-trivial `dataset_hmis`; invisible on small dev/testing datasets (merge
< 2 s → every in-transaction progress write is throttled away).

The HFA (`import_hfa_data_csv/integrate_staged.ts`) and ICEH
(`import_iceh_data/ingest.ts`) integrators already follow the rule — the
run-row write is the LAST statement in the transaction, after the last
`onProgress` ("so the run-row lock is held only for the final instant"). The
DHIS2 worker's per-pair transactions write the run row last and never
`await` a progress write inside them. HMIS CSV is the one outlier.

## Proposed fix (one move, `integrate_staged.ts`)

Delete the early block:

```ts
    // Linking inside the transaction keeps the version hidden from readers
    // (running-run exclusion) until the status flip at run end.
    await sql`
      UPDATE dataset_hmis_import_runs
      SET version_id = ${versionId}
      WHERE id = ${runId}
    `;

    await onProgress(40);
```
→
```ts
    await onProgress(40);
```

and put the link at the end of the transaction body:

```ts
    await upsertHmisLedgerPairsFromData(sql, touchedPairs, "csv", versionId);

    await onProgress(70);

    // Run-row link comes LAST inside the transaction: it takes the run-row
    // lock, and the progress writer (a separate connection) updates the same
    // row — a progress write after this point would wait on this transaction
    // while this transaction awaits the write (the Ghana 2026-08-12 wedge).
    // Still inside the transaction, so version readers hide the version until
    // the status flip at run end.
    await sql`
      UPDATE dataset_hmis_import_runs
      SET version_id = ${versionId}
      WHERE id = ${runId}
    `;
  });
```

Semantics preserved: version_id still lands inside the transaction (readers
keep hiding it until the status flip). Nothing else changes.

Optional follow-ups (not needed for the fix): the rule itself belongs in
`PROTOCOL_APP_WORKER_ROUTINES.md` ("inside a run transaction, write the run
row LAST, after the final progress write — the progress writer is a second
connection"); the DHIS2 file lives with the same hazard but is currently
safe by ordering.

## Verification done

Rung-0 harness (scratchpad `repro_csv_deadlock.ts`): disposable run row +
staging table in the local main DB, the real
`integrateStagedHmisCsvData`, the worker's exact progress writer at
interval 0 (= "merge slower than the throttle"), 10 s timeout, then
`pg_stat_activity` dump and full fixture teardown.

- CURRENT file: timeout at 10 s; `pg_stat_activity` shows the identical
  pair — `idle in transaction` after `SET version_id`, progress UPDATE
  waiting on its transactionid.
- FIXED copy: completes in 126 ms (`rowsUpdated: 5`), zero blocked
  backends.

Local DB verified clean afterwards (no harness runs, no staging tables,
version max + row count restored).

## Adversarial review (2026-08-17, 4 independent agents)

- Refute diagnosis/fix — SURVIVES. Mechanism confirmed complete (the
  "last statement = DELETE" detail = onProgress(40) throttled, onProgress(60)
  the first unthrottled in-tx write); harness re-run independently (CURRENT
  wedges, FIXED 128 ms). Fix complete: no in-flight progress write can
  exist at the tail (all onProgress sequentially awaited), no other in-tx
  statement touches the run row, every other run-row toucher is a single
  autocommit statement, reader semantics unchanged (visibility still flips
  at status flip). Positive side effect: pre-fix a cancel during a long
  merge queued behind the row lock and flipped the row right after COMMIT
  (integrated + "cancelled"); post-fix that window is sub-ms. Rule note must
  record the invariant the fixed ordering depends on: the run-row pool is
  max ≥ 2 (a max=1 pool would wedge on pool starvation instead).
- Repo sweep — 100 `.begin(` sites read; HMIS CSV integrator is the ONLY
  real instance. Two sites write the run row first but are safe by
  sequencing (no concurrent writer at that moment):
  `import_hmis_data_dhis2/worker.ts:930` (zero-success cleanup) and
  `dataset_hmis_import_runs.ts:924` (`finalizeInterruptedDatasetHmisRunVersion`)
  — pointer-worthy when the rule lands, not fixes.
- Bigger fix? — one-move fix is the right level; ship alone. Rejected:
  fire-and-forget writer, progress via tx handle, lock_timeout, periodic
  sweep. Accepted as separate follow-ups: (a)
  `idle_in_transaction_session_timeout` (5 min) in `createWorkerConnection`
  via the existing `connection: {...}` GUC hook — self-heals a future wedge
  into a loud `error` run; (b) CSV completion flip inside the merge tx like
  HFA/ICEH (ms cancel-vs-commit window); (c) rule + checklist line in
  PROTOCOL_APP_WORKER_ROUTINES.md, one-line pointer in
  `createThrottledProgressWriter`.
- Recovery — holds (details below). Spotted in passing:
  `connection_manager.ts:19-20` puts `statement_timeout`/`query_timeout` at
  the top level of the postgres.js options, which are ignored — dead
  config; only `connection.statement_timeout` is honoured. Follow-up.

## Deploy + Ghana recovery

1. Apply the diff, `deno task typecheck`, deploy. The fix is fleet-wide
   (any instance's next non-trivial CSV import would wedge) — every
   instance needs the image; only Ghana needs recovery.
2. Restart Ghana. App-container connections drop → backend 62431 aborts on
   EOF, locks release (62440's progress UPDATE then commits harmlessly and
   dies). Boot sweep `markStaleRunningDatasetHmisImportRuns` marks run 1
   `error` ("interrupted by a server restart…"), drops its staging table;
   version_id is NULL (link was in the rolled-back tx) so nothing to
   finalize. Guard: right after restart,
   `SELECT pid,state FROM pg_stat_activity WHERE pid IN (62431,62440)` on
   ghana-postgres — if either survives, `pg_terminate_backend` it (the boot
   sweep's UPDATE would otherwise wait on the row lock, hanging boot).
3. First scheduler tick (+60 s) drains queued runs 2–7 FIFO by id
   (2021,2022,2023,2024,2026,2025) through
   `launchQueuedDatasetHmisCsvImportRun`; files + pins intact. Each
   integrates unattended IF staging is clean; a dirty one holds in
   `needs_review` (queue continues past it). ~10–20 min total.
4. Run 1 (diab2020.csv): either Gafaru relaunches, or (prod write, Tim's
   call) `UPDATE dataset_hmis_import_runs SET status='queued', error=NULL,
   ended_at=NULL WHERE id=1 AND status='error'` — the row still carries a
   valid csv_config + filePin, so the tick fires it through the normal spawn
   path.
