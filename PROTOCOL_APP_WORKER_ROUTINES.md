# PROTOCOL — App: Writing a Worker Routine

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **adding or changing a
> background worker routine**. The machinery's ownership and architecture belong
> to the SYSTEM files: the running-tasks map, dirty machine, and `task_ended`
> semantics are **S8** (`SYSTEM_08_results_packages.md`); what the dataset workers
> _do_ (stage→integrate) is **S6**; workers reach the main thread's SSE via the
> in-process BroadcastChannel fan-out documented in **S3**; worker DB
> connections are S2's `SYSTEM_02_persistence.md`.

Heavy/blocking work (R execution, CSV staging, bulk integration, DHIS2 import
runs) runs in a Deno Web Worker, never on the request thread. Every routine
follows the same lifecycle: spawn through the generic factory, the `"READY"`
handshake, a guarded `run()`, dedicated DB connections, a tracked slot, and
host-owned termination.

```text
host (main thread)                               worker (separate context)
─────────────────                                ─────────────────────────
instantiateXxxWorker(payload)
  └ instantiateWorker("./worker.ts",
      import.meta.url, payload)
      new Worker(url, {type:"module"})  ───────► module loads
      worker.onmessage = READY handler           self.onmessage = run(e.data).catch(reportError)
      worker "error" listener: preventDefault,
        record error completion, terminate
                                        ◄──────── self.postMessage("READY")
      on "READY" → worker.postMessage(payload) ─► run(payload)   (alreadyRunning guard)
                                                    create dedicated DB connection(s)
                                                    …do the work…
                                                    report back (see below)
                                                    .end() every connection
      host terminates the worker on its
      terminal signal (COMPLETED / error /
      task_ended → removeRunningModule)
```

## The recipe

### 1. Create the folder pair

Each routine is a folder under `server/worker_routines/` with two files:

- `instantiate_worker.ts` — exports
  `instantiate<Name>Worker(payload):
  Worker`, a one-liner over the generic
  factory:

  ```ts
  export function instantiateWorker<T>(
    workerPath: string,
    callerUrl: string,
    data: T,
  ): Worker {
    const worker = new Worker(new URL(workerPath, callerUrl).href, {
      type: "module",
    });
    worker.onmessage = (e) => {
      if (e.data === "READY") worker.postMessage(data);
    };
    return worker;
  }
  ```

  (`server/worker_routines/instantiate_worker_generic.ts`.) Never `new
  Worker`
  directly and post immediately — the host must not post the payload until the
  worker says it's listening, or the post races module load.

- `worker.ts` — the worker entry point, opening with the standard preamble
  (hand-copied into every routine — copy it verbatim, don't improvise):

  ```ts
  (self as unknown as Worker).onmessage = (e) => {
    run(e.data).catch((error) => {
      console.error("Worker error:", error);
      self.reportError(error);   // surfaces to the host's "error" listener,
    });                          // which records the error and terminates us
  };
  (self as unknown as Worker).postMessage("READY");   // tell host we're listening

  let alreadyRunning = false;
  async function run(payload) {
    if (alreadyRunning) { self.close(); return; }      // re-entrancy guard
    alreadyRunning = true;
    …
  }
  ```

Extra files are fine when they earn their place: `run_module/` has
`run_module_iterator.ts` (the R streaming generator) and `container_name.ts`;
`import_hmis_data_dhis2/` has `dispatch.ts` (pure dispatcher logic importable
outside a worker context) and `scheduler.ts` (the 60 s scheduled-import tick).

### 2. Never `self.close()` in a worker

The host owns termination. Two empirically verified failure modes: a
`BroadcastChannel` message posted immediately before `self.close()` is silently
lost, and a `self.close()` in a `finally` runs before the rethrown error reaches
the preamble's `reportError`, so the host's `error` listener never fires and the
tracker slot is stranded. The only exception is the `alreadyRunning` re-entrancy
guard (nothing is pending there). Note the two report-back transports differ
here: worker→host `postMessage("COMPLETED")` survives host-side
terminate-on-receipt; a `BroadcastChannel` post immediately before a close is
lost. Don't reason from one to the other.

### 3. Attach the spawn-site listeners

**Every spawn site attaches an `error` listener with `e.preventDefault()`** —
without it, `reportError` propagates as an unhandled rejection and exits the
whole server process (verified on Deno 2.5.3 and 2.6.4). The listener records
the error completion, clears the tracker, and terminates the worker. Spawn sites
today: `task_management/trigger_runnable_tasks.ts` (module runs),
`db/instance/dataset_hfa_import_runs.ts` (HFA import runs), and
`db/instance/dataset_hmis_import_runs.ts` (`spawnRunWorker` /
`spawnCsvRunWorker`, HMIS import runs).
The dataset shape:

```ts
setWorker("hmis", worker); // per-family worker slot
worker.addEventListener("error", async (e) => {
  e.preventDefault(); // don't crash the server
  await mainDb`UPDATE …upload_attempts SET status_type='error', status=…`;
  clearWorker("hmis", worker); // compare-and-delete
  worker.terminate(); // host owns termination
});
worker.addEventListener("message", (e) => {
  if (e.data === "COMPLETED") {
    clearWorker("hmis", worker);
    worker.terminate(); // else the isolate leaks
  }
});
```

### 4. Dedicated DB connections, ended on every exit path

Workers must not use the request connection cache (it isn't shared across worker
contexts). Create dedicated pools via the worker factories
(`server/db/postgres/worker_connections.ts`, uncached, `prepare: false`):
`createWorkerReadConnection(id)` for read work,
`createBulkImportConnection("main")` for bulk staging/integration inserts.
**Every exit path must `.end()` them** — a `finally` holding only `.end()` calls
is fine (connection teardown only — never `self.close()` there). On a crash path
the host's terminate drops whatever the worker didn't end — acceptable, since
the isolate dies with its sockets.

### 5. Pick the report-back mechanism

- **(A) `task_ended` broadcast** — when completion should chain dependent work.
  The module worker posts an `EndingTaskData`
  (`{ projectId, moduleId, runToken, successOrError }`) to
  `BroadcastChannel("task_ended")`; a decoupled listener in
  `set_module_clean.ts` flips the DB row, clears the map entry, terminates, and
  re-triggers dependents. Crashes reach the same handler via the spawn site's
  `error` listener with `successOrError: "error"` — the worker's catch does
  `reportError` only, no broadcast. S8 owns these semantics.
- **(B) `postMessage("COMPLETED")` + status row** — a single tracked job the
  caller awaits. The worker writes progress/terminal state into its run/ attempt
  row (`status` JSON + denormalized `status_type` enum) for client polling, and
  finishes with `self.postMessage("COMPLETED")`; the caller-attached listeners
  clear the tracker and terminate.

The consumers are not interchangeable: dataset clients poll the `status_type`
enum; the results-package catalogue reacts to instance-SSE
`run_progress`/`r_script`. Wire the matching one.

### 6. Register a tracker, and clear it on every terminal path

- **`worker_store.ts`** — at most one live worker per import family:
  `Map<WorkerKey, Worker>` with `WorkerKey = "hmis" | "hfa" | "hmis_dhis2_run"`
  (extend the union when adding a family), `setWorker` / `getWorker` /
  `clearWorker`. `clearWorker` is compare-and-delete (deletes only if the stored
  worker IS this worker), so a stale worker's late error/COMPLETED event cannot
  clobber a successor under the same key. The caller checks `getWorker(key)`
  before starting and refuses if one is in flight.
- **The running-tasks map** (module runs) — keyed `projectId` + `moduleId` with
  a per-run `runToken`; claim → attach → guaranteed
  `removeRunningModule`/`releaseClaimedModule`. Owned by S8 — new module-run
  completion paths go through `handleModuleTaskEnded`, nothing else.

An unterminated completed worker leaks its isolate and threads for the life of
the process; a worker that dies without clearing its tracker blocks future work.

## The routine inventory

| Folder                   | Payload                                            | Report-back                                              | Tracker                           |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| `run_module`             | `{ projectId, moduleId, runToken }`                | `task_ended` broadcast (success) / `reportError` (crash) | running-tasks map                 |
| `import_hmis_data_csv`   | `{ runId, config, csvFilePath, stagingResult? }`   | `postMessage("COMPLETED")` + run row                     | `worker_store` (`hmis`)           |
| `import_hmis_data_dhis2` | `{ runId, credentialsSource, selection }`          | `postMessage("COMPLETED")` + run row + ledger            | `worker_store` (`hmis_dhis2_run`) |
| `import_hfa_data_csv`    | `{ runId, config, csvFilePath, xlsFormFilePath, stagingResult? }` | `postMessage("COMPLETED")` + run row       | `worker_store` (`hfa`)            |
| `import_iceh_data`       | `{ runId, config, zipFilePath }`                   | `postMessage("COMPLETED")` + run row                     | `worker_store` (`iceh`)           |

## Gotchas

- **READY is load-bearing.** A worker that does work before posting READY may
  miss its payload; one that posts READY late races the host.
- **`alreadyRunning` guards re-delivery.** If the host posts twice, the second
  `run` self-closes. Don't rely on one worker handling multiple payloads.
- **Don't diverge the preamble.** It's copy-pasted per routine; subtle drift
  (READY string, error semantics) is a latent bug. Today only the
  `console.error` prefix varies — keep it that way until item 8 factors it.
- **The progress writer is a second connection — a run transaction must
  never wait on it while holding the run row.** `createThrottledProgressWriter`
  updates the run row (`… WHERE id AND status='running'`) on the worker's
  read connection. Inside a `begin(...)`, any statement touching the run row
  (`version_id`, counters, the completion flip) holds that row's lock until
  COMMIT; a progress write issued after it blocks on that lock. If the
  transaction then AWAITED the write, the two waited on each other forever —
  Postgres cannot detect it (the holder is idle-in-transaction), and Ghana
  sat wedged 4 days (2026-08-12). Two defences, in order: (1) the writer is
  non-blocking and coalescing — it NEVER blocks the caller, so a blocked
  write just lands after COMMIT (harmless: every progress write is
  status-guarded and every terminal flip NULLs progress); (2) inside a run
  transaction the run-row write is still the LAST statement, after the final
  `onProgress`, so the lock is held only for the final instant —
  HFA/ICEH/CSV's guarded in-transaction completion flip is the model. Both
  assume the run-row pool is `max ≥ 2` (a max=1 pool wedges on pool
  starvation instead). Worker connections carry
  `idle_in_transaction_session_timeout` (5 min) as the generic backstop for
  the whole idle-in-transaction class; when it fires, `begin` rejects AND the
  still-running transaction callback crashes the worker on its next statement
  (postgres.js `nextWrite` on a dead socket) — the host crash listener is the
  expected exit, not a bug.

## Checklist

- [ ] `server/worker_routines/<name>/instantiate_worker.ts` (factory over
      `instantiateWorker`) + `worker.ts` (standard preamble + `run`; no
      `self.close()` except the `alreadyRunning` guard)
- [ ] Spawn site attaches `error` (with `e.preventDefault()`) + `message`
      listeners — mandatory for both report-back models
- [ ] `createWorkerReadConnection` / `createBulkImportConnection`; `.end()` on
      every exit path (a `finally` may hold `.end()` calls only)
- [ ] Report-back matches the need: `task_ended` (chains work) or
      `postMessage("COMPLETED")` + status row (tracked job)
- [ ] Tracker registered and cleared + worker terminated on every terminal path
- [ ] Inside any run transaction, the run-row write is the last statement
      (after the final `onProgress`)
- [ ] Every progress `write` callback is guarded `AND status = 'running'`;
      every terminal flip sets `progress = NULL` under the same guard
