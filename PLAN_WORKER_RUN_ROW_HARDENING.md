# PLAN — Worker run-row hardening (follow-ups from the Ghana CSV wedge)

Status: NOT STARTED. Four small items: three recommended by the 2026-08-17
adversarial review of the HMIS CSV import deadlock (fixed + deployed in
1.66.9, main `6bfba3b6`), one added by the 2026-08-17 plan review (item 4,
the structural fix). None is urgent; each is a separate small commit.
Suggested order: 4, 1, 2, 3 (3 documents the end state of the others).

Background in one paragraph: `import_hmis_data_csv/integrate_staged.ts`
updated its own run row at the top of the merge transaction, then awaited
progress writes that update the same row on a second pooled connection. Once
the merge outlasted the 2 s progress throttle, the progress UPDATE blocked on
the transaction's row lock while the transaction awaited it — a mutual wait
Postgres cannot detect (the holder is idle-in-transaction, not lock-waiting).
Ghana sat wedged for 4 days 10 h with six runs queued behind it. Fix: run-row
write moved to be the transaction's LAST statement (the rule HFA/ICEH already
followed). These follow-ups make the wedge impossible by construction (4),
make any recurrence of the idle-in-transaction class self-healing (1), align
the one remaining CSV outlier (2), and write the rule down (3).

Verified 2026-08-17 by execution (plan review): the mutual wait reproduces
with a postgres.js `max: 2` pool (control run wedged indefinitely), and with
`idle_in_transaction_session_timeout` set it clears at the timeout — see
item 1 for the exact mechanism, which differs from the original write-up.

## 4. Non-blocking, coalescing progress writer (structural fix)

**Problem.** The wedge needs two things: a transaction holding the run-row
lock, and that transaction AWAITING the progress writer. Items 1–3 attack the
first with an ordering rule + a backstop; a rule is what failed here (HFA/ICEH
followed it, CSV did not). Removing the second structurally makes the wedge
impossible in any statement order.

**Fix.** `server/worker_routines/worker_contract.ts`,
`createThrottledProgressWriter`: the returned function resolves immediately
and never blocks the caller. Keep at most one write in flight; while one is in
flight, hold the latest NON-THROTTLED value (a forced write always replaces
the pending one; a non-forced write inside `intervalMs` of the pending
one's stamp is throttled away, so displayed progress can lag one step, ≤ 2 s)
and issue it when the in-flight write settles. Throttle semantics unchanged;
errors stay logged, never thrown.

```ts
export function createThrottledProgressWriter<T>(
  intervalMs: number,
  write: (value: T) => Promise<void>,
): (value: T, force: boolean) => void {
  let lastWriteMs = 0;
  let inFlight = false;
  let pending: { value: T } | null = null;
  const flush = (value: T) => {
    inFlight = true;
    write(value)
      .catch((e) => console.error("Failed to write worker progress:", e))
      .finally(() => {
        inFlight = false;
        if (pending) {
          const next = pending.value;
          pending = null;
          flush(next);
        }
      });
  };
  return (value: T, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastWriteMs < intervalMs) {
      return;
    }
    lastWriteMs = now;
    if (inFlight) {
      pending = { value };
      return;
    }
    flush(value);
  };
}
```

Callers (`import_hmis_data_csv`, `import_hfa_data_csv`, `import_iceh_data`,
`import_hmis_data_dhis2` workers) keep their `onProgress: async (percent) =>
writeProgress(...)` shape — drop the now-meaningless `await`s on
`writeProgress` / `updateProgress` (typecheck will not force this; sweep them
so the contract reads truthfully). `generate_run` does not use the writer.

**Why this is safe.** A blocked progress UPDATE now just sits on the sibling
pooled connection until COMMIT/ROLLBACK releases the row lock, then lands.
It cannot resurrect a finished run: every progress write is status-guarded
(`… WHERE id = $runId AND status = 'running'`, the contract's existing rule —
re-verify all four `write` callbacks carry it), and every terminal flip
(complete / needs_review / error / cancelled) sets `progress = NULL` under
the same guard, so a late write is a no-op regardless of ordering. `.end()`
on the pool waits for the in-flight query, so worker teardown is unchanged.
A write that is still PENDING at `.end()` (rare: needs a second non-throttled
write inside one in-flight window right at teardown) flushes after the
in-flight one settles and either sneaks in before the pool closes (delaying
`.end()` by one UPDATE) or rejects `CONNECTION_ENDED` and logs "Failed to
write worker progress" — harmless and expected, not a bug: best-effort,
logged not thrown, and a no-op on the row anyway because every worker's
terminal flip (`progress = NULL`, guarded) precedes `.end()`. Bounded queue:
throttle + coalescing means at most one in-flight and one pending write,
ever.

**Verify.** Harness (the scratchpad `repro_csv_deadlock.ts` shape: `max: 2`
pool, tx writes the run row FIRST, then awaits `writeProgress` twice 3 s
apart, then commits) against the new writer → the tx commits, both progress
writes land after COMMIT (or the second coalesces), zero blocked backends.
Then `deno task typecheck`.

## 1. `idle_in_transaction_session_timeout` on worker connections

**Problem.** Nothing in the stack bounds an idle-in-transaction worker
backend: Postgres defaults `idle_in_transaction_session_timeout=0`, and a
reserved (in-transaction) pooled connection is never reclaimed by postgres.js
`idle_timeout` (`connection.js` skips `reserved` connections; Ghana proved
it). Item 4 removes the progress-writer variant; this is the generic backstop
for any future idle-in-transaction wedge (a transaction that awaits a network
call, another connection, anything non-SQL). Without it such a wedge blocks
an instance's imports silently until someone restarts it.

**Fix.** `server/db/postgres/worker_connections.ts`, `createWorkerConnection`
— it already passes server GUCs through `config.connection = {...}` (the
existing, currently unused `statement_timeout` hook; postgres.js sends every
`connection.*` entry as a StartupMessage parameter, verified in
`parseOptions` + `StartupMessage`). Add:

```ts
    connection: {
      ...(options?.statementTimeout
        ? { statement_timeout: options.statementTimeout }
        : {}),
      // Backstop for the idle-in-transaction wedge class (PROTOCOL_APP_WORKER_
      // ROUTINES.md "Gotchas"): a worker backend idle INSIDE a transaction
      // for this long is wedged, not working — terminate it so the run fails
      // loudly and the queue moves on. Never fires on a busy statement.
      idle_in_transaction_session_timeout: 5 * 60 * 1000,
    },
```

(and drop the current `if (options?.statementTimeout) { config.connection =
… }` block in favour of the always-present object).

**Why 5 min is safe.** Every `.begin(` reachable from a worker connection
(CSV/HFA/ICEH integrators, DHIS2 mint / per-pair / fail-pair / zero-success
cleanup, `run_generation.ts` `publishReadyRun`) is idle-in-transaction only
for JS turnaround or a progress write; nothing spans R execution or a network
call. The three `projects.ts` uses of `createWorkerConnection` are
non-transactional (`CREATE/DROP DATABASE`). Re-swept 2026-08-17.

**What happens when it fires** (verified by execution, postgres.js 3.4.5):
backend terminated → its locks drop → `begin` rejects IMMEDIATELY with
`CONNECTION_CLOSED` (postgres.js races `scope(fn)` against the connection's
`onclose`) → the worker's catch path starts (status='error' guarded, staging
dropped, `.end()`). BUT the transaction callback is still alive (it was
awaiting whatever it was wedged on) and its next `sql\`…\`` on the dead
reserved connection throws an UNCATCHABLE `TypeError: Cannot read properties
of null (reading 'write')` inside postgres.js's `setImmediate` (`nextWrite`)
→ the Web Worker crashes → host `error` listener (status='error' guarded,
terminate, staging dropped, `onComplete` → queue drains at the next tick).
The worker catch path and the host listener race for the status flip; both
are guarded, either error text is acceptable. Net outcome: run errors loudly,
queue moves on. Recorded here so nobody "fixes" the crash later — it is the
expected shape of this backstop firing.

**Verify.** Rung 0: the harness from item 4 against the ORIGINAL blocking
writer and the PRE-fix `integrate_staged.ts` ordering (git show
`61c466d4^`), timeout set to ~2 s → `begin` rejects with `CONNECTION_CLOSED`
at ~2 s, the blocked progress UPDATE completes, zero blocked backends, and
the process/worker dies with the postgres.js TypeError (assert the crash, not
a clean exit). Then `deno task typecheck`.

## 2. CSV completion flip inside the merge transaction

**Problem.** `import_hmis_data_csv/worker.ts:146-151` writes
`status='complete'` a moment AFTER `integrateStagedHmisCsvData` commits. HFA
(`import_hfa_data_csv/integrate_staged.ts:92-110`) and ICEH
(`import_iceh_data/ingest.ts:355-366`) do the status-guarded flip INSIDE the
transaction, last, throwing on 0 rows. In the CSV gap a cancel can flip the row
to `cancelled` right after COMMIT → data integrated + "Nothing was integrated"
+ `finalizeInterruptedDatasetHmisRunVersion` sees `succeeded_pairs = 0` (CSV
never increments it), takes the delete branch, FK-aborts three times against
the committed `dataset_hmis` rows (`ON DELETE RESTRICT`), and falls through
to `reconcileRunVersionRow`, which overwrites the CSV `staging_result` with a
dhis2-shaped one (`sourceType: "dhis2"`, `n_rows_updated = 0`). Sub-ms window
post-1.66.9; the special case at `dataset_hmis_import_runs.ts:600` ("crash
between commit and the status flip") exists only because of this gap.

**Fix (a).** Move the completion UPDATE into the tail of the `mainDb.begin` in
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
needs `stagingResult` already (it has it). Version readers hide on
`status = 'running' AND version_id IS NOT NULL` (`dataset_hmis.ts:89`), which
stays correct: version_id and `complete` now commit atomically.

**Fix (b) — DELETE the CSV crash listener's finalize call**
(`dataset_hmis_import_runs.ts:602`, plus its "crash between commit and the
status flip" comment). After (a), the only way a CSV run reaches the crash
listener with `version_id` set is a POST-commit throw (e.g. the staging
`DROP TABLE` failing → catch → rethrow → `reportError`) — status is already
`complete`, and `finalizeInterruptedDatasetHmisRunVersion` would run the same
delete→FK-abort×3→dhis2-shape overwrite against a successfully completed CSV
version. That function is DHIS2 placeholder-version reconciliation and is
never correct for a CSV run. The cancel (`:875`) and restart-sweep (`:1026`)
calls become no-ops for CSV after (a) (a CSV run's `version_id` can only be
non-null with status `complete`, which neither path reaches) — guard both on
`source === "dhis2"` so that reads as intent rather than coincidence.

**Verify.** Harness (`repro_csv_deadlock.ts`) still completes; a second
harness variant that flips the fixture row to `cancelled` mid-transaction
(from a third connection, after `onProgress(60)` — the transaction holds no
run-row lock at that point, so the flip lands immediately) must see the merge
rolled back and no version row. Grep confirms
`finalizeInterruptedDatasetHmisRunVersion` has exactly three callers left
(DHIS2 worker catch, cancel-guarded, sweep-guarded). `deno task typecheck`.

## 3. Protocol rule

**Where.** `PROTOCOL_APP_WORKER_ROUTINES.md` — one Gotchas bullet + one
Checklist line; one-line pointer in the `createThrottledProgressWriter`
comment in `worker_contract.ts`. Nothing restated in SYSTEM_06.

**Gotchas bullet (proposed wording, end state after items 1, 2, 4):**

> - **The progress writer is a second connection — a run transaction must
>   never wait on it while holding the run row.** `createThrottledProgressWriter`
>   updates the run row (`… WHERE id AND status='running'`) on the worker's
>   read connection. Inside a `begin(...)`, any statement touching the run row
>   (`version_id`, counters, the completion flip) holds that row's lock until
>   COMMIT; a progress write issued after it blocks on that lock. If the
>   transaction then AWAITED the write, the two waited on each other forever —
>   Postgres cannot detect it (the holder is idle-in-transaction), and Ghana
>   sat wedged 4 days (2026-08-12). Two defences, in order: (1) the writer
>   is non-blocking and coalescing — it NEVER blocks the caller, so a blocked
>   write just lands after COMMIT (harmless: every progress write is
>   status-guarded and every terminal flip NULLs progress); (2) inside a run
>   transaction the run-row write is still the LAST statement, after the final
>   `onProgress`, so the lock is held only for the final instant —
>   HFA/ICEH/CSV's guarded in-transaction completion flip is the model. Both
>   assume the run-row pool is `max ≥ 2` (a max=1 pool wedges on pool
>   starvation instead). Worker connections carry
>   `idle_in_transaction_session_timeout` (5 min) as the generic backstop for
>   the whole idle-in-transaction class; when it fires, `begin` rejects AND
>   the still-running transaction callback crashes the worker on its next
>   statement (postgres.js `nextWrite` on a dead socket) — the host crash
>   listener is the expected exit, not a bug.

**Checklist lines:**

> - [ ] Inside any run transaction, the run-row write is the last statement
>       (after the final `onProgress`)
> - [ ] Every progress `write` callback is guarded `AND status = 'running'`;
>       every terminal flip sets `progress = NULL` under the same guard

**Pointer-worthy sites** (both write the run row FIRST inside a transaction
— cite the rule in a one-line comment): `import_hmis_data_dhis2/worker.ts:930`
(zero-success cleanup) and `dataset_hmis_import_runs.ts:924`
(`finalizeInterruptedDatasetHmisRunVersion`). The reason they are safe is the
general one, not sequencing: each transaction awaits nothing but its own two
statements, so a concurrent progress write (after item 4 the writer may still
be in flight when the row lock is taken) only ever waits for COMMIT — there
is no mutual wait to form. Word the comment that way; "the last progress
write was awaited before this" stops being true the moment item 4 lands.

## Spotted in passing (report only, separate decision)

`server/db/postgres/connection_manager.ts:19-20` puts `statement_timeout` /
`query_timeout` at the top level of the postgres.js options, which
`parseOptions` ignores (only `defaults` keys and `connection.*` are lifted;
verified 2026-08-17) — dead config. Only `connection.statement_timeout` is
honoured, so the route pools currently run with NO statement timeout at all.
Worth fixing or deleting when someone is in that file.
