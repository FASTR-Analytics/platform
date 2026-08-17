# PLAN — Worker run-row hardening (follow-ups from the Ghana CSV wedge)

Status: NOT STARTED. Three small items recommended by the 2026-08-17
adversarial review of the HMIS CSV import deadlock (fixed + deployed in
1.66.9, main `6bfba3b6`). None is urgent; each is a separate small commit.

Background in one paragraph: `import_hmis_data_csv/integrate_staged.ts`
updated its own run row at the top of the merge transaction, then awaited
progress writes that update the same row on a second pooled connection. Once
the merge outlasted the 2 s progress throttle, the progress UPDATE blocked on
the transaction's row lock while the transaction awaited it — a mutual wait
Postgres cannot detect (the holder is idle-in-transaction, not lock-waiting).
Ghana sat wedged for 4 days 10 h with six runs queued behind it. Fix: run-row
write moved to be the transaction's LAST statement (the rule HFA/ICEH already
followed). These follow-ups make a recurrence self-healing, align the one
remaining CSV outlier, and write the rule down.

## 1. `idle_in_transaction_session_timeout` on worker connections

**Problem.** Nothing in the stack bounds an idle-in-transaction worker
backend: Postgres defaults `idle_in_transaction_session_timeout=0`, and the
Ghana wedge proved a reserved pooled connection is never reclaimed by
postgres.js `idle_timeout` either. A future wedge of this class blocks an
instance's imports silently until someone restarts it.

**Fix.** `server/db/postgres/worker_connections.ts`, `createWorkerConnection`
— it already passes server GUCs through `config.connection = {...}` (the
existing, currently unused `statement_timeout` hook). Add:

```ts
    connection: {
      ...(options?.statementTimeout
        ? { statement_timeout: options.statementTimeout }
        : {}),
      // Backstop for the run-row/progress-writer hazard (PROTOCOL_APP_WORKER_
      // ROUTINES.md "Gotchas"): a worker backend idle INSIDE a transaction
      // for this long is wedged, not working — terminate it so the run fails
      // loudly and the queue moves on. Never fires on a busy statement.
      idle_in_transaction_session_timeout: 5 * 60 * 1000,
    },
```

(and drop the current `if (options?.statementTimeout) { config.connection =
… }` block in favour of the always-present object).

**Why 5 min is safe.** Every worker `.begin(` (CSV/HFA/ICEH integrators, DHIS2
per-pair transactions, `run_generation.ts` publish) is idle-in-transaction only
for JS turnaround or a throttled progress write; nothing spans R execution or a
network call. Reviewer swept all of them.

**What happens when it fires.** Backend terminated → locks drop → the blocked
progress UPDATE completes → the worker's next in-transaction statement fails on
the dead connection → `begin` rejects → worker catch path (status='error',
staging dropped, `.end()`) → host error listener → onComplete → queue drains
at the next tick.

**Verify.** Rung 0: the scratchpad harness `repro_csv_deadlock.ts` (this
session) against the PRE-fix `integrate_staged.ts` (git show `61c466d4^`) with
the timeout set to ~2 s → `begin` rejects with FATAL 57P01, zero blocked
backends. Then `deno task typecheck`.

## 2. CSV completion flip inside the merge transaction

**Problem.** `import_hmis_data_csv/worker.ts:146-151` writes
`status='complete'` a moment AFTER `integrateStagedHmisCsvData` commits. HFA
(`import_hfa_data_csv/integrate_staged.ts:92-110`) and ICEH
(`import_iceh_data/ingest.ts:355-366`) do the status-guarded flip INSIDE the
transaction, last, throwing on 0 rows. In the CSV gap a cancel can flip the row
to `cancelled` right after COMMIT → data integrated + "Nothing was integrated"
+ `finalizeInterruptedDatasetHmisRunVersion` overwrites the CSV
`staging_result` with a dhis2-shaped one. Sub-ms window post-fix; the special
case at `dataset_hmis_import_runs.ts:600` ("crash between commit and the
status flip") exists only because of this gap.

**Fix.** Move the completion UPDATE into the tail of the `mainDb.begin` in
`integrate_staged.ts`, merged with the version link so the run row is written
exactly once, last:

```ts
    await onProgress(70);

    // Single run-row write, LAST in the transaction (see PROTOCOL_APP_WORKER_
    // ROUTINES.md "Gotchas"): version link + completion flip together, guarded
    // on status='running' so a cancel that landed first rolls the merge back.
    const flipped = await sql`
      UPDATE dataset_hmis_import_runs
      SET version_id = ${versionId}, status = 'complete', ended_at = now(),
        progress = NULL,
        run_stats = ${JSON.stringify({ csvStagingResult: stagingResult })}
      WHERE id = ${runId} AND status = 'running'
    `;
    if (flipped.count === 0) {
      throw new Error(
        "The run was cancelled during integration — nothing was merged.",
      );
    }
  });
```

and delete the post-integrate `UPDATE … SET status = 'complete'` in
`worker.ts` (the `.end()` + `COMPLETED` stay). `integrateStagedHmisCsvData`
needs `stagingResult` already (it has it). Re-check the crash-listener comment
at `dataset_hmis_import_runs.ts:600` and trim it if the gap is closed.

**Verify.** Harness (`repro_csv_deadlock.ts`) still completes; a second
harness variant that flips the fixture row to `cancelled` mid-transaction
(from a third connection, after `onProgress(60)`) must see the merge rolled
back and no version row. `deno task typecheck`.

## 3. Protocol rule

**Where.** `PROTOCOL_APP_WORKER_ROUTINES.md` — one Gotchas bullet + one
Checklist line; one-line pointer in the `createThrottledProgressWriter`
comment in `worker_contract.ts`. Nothing restated in SYSTEM_06.

**Gotchas bullet (proposed wording):**

> - **The progress writer is a second connection — a run transaction must
>   never wait on it while holding the run row.** `createThrottledProgressWriter`
>   updates the run row (`… WHERE id AND status='running'`) on the worker's
>   read connection. Inside a `begin(...)`, any statement touching the run row
>   (`version_id`, counters, the completion flip) holds that row's lock until
>   COMMIT; an awaited progress write after it blocks on the lock while the
>   transaction awaits the write — a mutual wait Postgres cannot detect (the
>   holder is idle-in-transaction), so the run wedges forever (Ghana,
>   2026-08-12, 4 days). Rule: inside a run transaction the run-row write is
>   the LAST statement, after the final `onProgress`, with nothing awaited
>   after it — HFA/ICEH's guarded in-transaction completion flip is the model.
>   This also assumes the run-row pool is `max ≥ 2` (a max=1 pool wedges on
>   pool starvation instead). Worker connections carry
>   `idle_in_transaction_session_timeout` as the backstop, not the rule.

**Checklist line:**

> - [ ] Inside any run transaction, the run-row write is the last statement
>       (after the final `onProgress`)

**Pointer-worthy sites** (safe today by sequencing, not ordering — cite the
rule in a one-line comment): `import_hmis_data_dhis2/worker.ts:930` (zero-
success cleanup writes the run row first) and
`dataset_hmis_import_runs.ts:924` (`finalizeInterruptedDatasetHmisRunVersion`).

## Spotted in passing (report only, separate decision)

`server/db/postgres/connection_manager.ts:19-20` puts `statement_timeout` /
`query_timeout` at the top level of the postgres.js options, which
`parseOptions` ignores — dead config. Only `connection.statement_timeout` is
honoured. Worth fixing or deleting when someone is in that file.
