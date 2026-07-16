# Worker Routines

The Deno Web Worker background-job pattern: the `instantiate_worker` / `worker` folder pairing, the `"READY"` handshake, the mandatory worker-entry preamble, dedicated DB connections, and the two report-back mechanisms (`task_ended` broadcast vs `postMessage("COMPLETED")` + status row).

> This doc owns the **worker lifecycle** (spawn → handshake → run → teardown). The dirty-state semantics and the running-tasks-map cleanup *invariant* are owned by [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md) (this doc cites it). Worker DB connections are [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md). What the dataset workers actually *do* (stage→integrate, bulk insert) is [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md); what the module worker does is [DOC_MODULE_EXECUTION.md](DOC_MODULE_EXECUTION.md). Workers reach the main thread's SSE via [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

---

## Principles

1. **Heavy/blocking work runs in a Web Worker, never on the request thread.** R execution, CSV staging, and bulk integration are all workers.
2. **Spawn through the generic factory + `"READY"` handshake.** The host never posts the payload until the worker says it's listening — this closes the post-before-listener race.
3. **Workers use dedicated DB connections and must close them on every exit path.** Worker connections are uncached (`prepare:false`); a leaked one accumulates until background jobs stall.
4. **Every running worker is tracked, and every terminal path clears its tracker.** Module runs use the running-tasks map; dataset jobs use `worker_store`. A worker that dies without clearing its tracker blocks future work.
5. **The host owns termination — a worker never `self.close()`.** Two verified failure modes: a `BroadcastChannel` message posted immediately before `self.close()` is silently lost, and a `self.close()` in a `finally` runs before the rethrown error reaches the preamble's `reportError`, so the host's `error` listener never fires. The host terminates on `COMPLETED`/`error` (dataset workers) or via `removeRunningModule` (module workers).

---

## The System

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

### Folder convention

Each routine is a folder under `server/worker_routines/` with **two files**:
- `instantiate_worker.ts` — exports `instantiate<Name>Worker(payload): Worker`, a thin wrapper over the generic factory.
- `worker.ts` — the worker entry point (`self.onmessage` + `run`).

`run_module` additionally has `mod.ts` (barrel) and `run_module_iterator.ts` (the R streaming generator — see [DOC_MODULE_EXECUTION.md](DOC_MODULE_EXECUTION.md)). `import_hmis_data_dhis2` additionally has `dispatch.ts` (pure dispatcher logic, importable outside a worker context). The six routines:

| Folder | Payload | Report-back | Tracker |
|--------|---------|-------------|---------|
| `run_module` | `{ projectId, moduleId, runToken }` | `task_ended` broadcast (success) / `reportError` (crash) | running-tasks map |
| `stage_hmis_data_csv` | `{ rawDUA }` | `postMessage("COMPLETED")` + status row | `worker_store` (HMIS) |
| `import_hmis_data_dhis2` | `{ runId, credentials, selection }` | `postMessage("COMPLETED")` + run row + ledger | `worker_store` (`hmis_dhis2_run`) |
| `stage_hfa_data_csv` | `{ rawDUA }` | `postMessage("COMPLETED")` + status row | `worker_store` (HFA) |
| `integrate_hmis_data` | `{ rawDUA }` | `postMessage("COMPLETED")` + status row | `worker_store` (HMIS) |
| `integrate_hfa_data` | `{ rawDUA }` | `postMessage("COMPLETED")` + status row | `worker_store` (HFA) |

### The generic instantiation + handshake

`server/worker_routines/instantiate_worker_generic.ts`:

```ts
export function instantiateWorker<T>(workerPath: string, callerUrl: string, data: T): Worker {
  const worker = new Worker(new URL(workerPath, callerUrl).href, { type: "module" });
  worker.onmessage = (e) => { if (e.data === "READY") worker.postMessage(data); };
  return worker;
}
```

Every `instantiate_worker.ts` is a one-liner over this — e.g. `instantiateRunModuleWorker` passes `"./worker.ts"`, `import.meta.url`, and `{ projectId, moduleId, runToken }`.

**Every spawn site attaches an `error` listener** with `e.preventDefault()` — without it, `reportError` propagates as an unhandled rejection and exits the whole server process (verified on Deno 2.5.3 and 2.6.4). Dataset spawn sites live in `db/instance/dataset_{hmis,hfa}.ts`; the module spawn site is `task_management/trigger_runnable_tasks.ts`.

### The mandatory worker-entry preamble

Every `worker.ts` opens with the **same** preamble (currently hand-copied into all six):

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

No `self.close()` after `reportError` — the host terminates the worker from its `error` listener. Closing here (or in a `finally` inside `run`) suppresses the report-back (Principle 5).

### Dedicated connections

Workers **must not** use the request connection cache (it's not shared across worker contexts). They create dedicated pools via the worker factories ([SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)):
- `createWorkerReadConnection(id)` — read-only work (module worker reads module/config).
- `createBulkImportConnection("main")` — bulk staging/integration inserts.

**Every exit path must `.end()` them.** The module worker ends both `projectDb` and `mainDb` inline on each exit branch; the HFA workers `.end()` in a `finally` (connection teardown **only** — never `self.close()` there); the HMIS workers end inline in both the try and the catch. On a crash path the host's terminate drops whatever the worker didn't end — acceptable, since the isolate dies with its sockets.

### Two report-back mechanisms

**(A) Module runs → `task_ended` broadcast (decoupled listener).** `run_module/worker.ts` consumes `runModuleIterator`, streams R output to clients via `notifyProjectRScript`, and on completion posts an `EndingTaskData` (`{ projectId, moduleId, runToken, successOrError }`) to `BroadcastChannel("task_ended")`. A *separate* listener in `set_module_clean.ts` routes it into `handleModuleTaskEnded` (validate runToken against the map entry, flip DB row, remove map entry + terminate, re-trigger dependents). Crash completions take a second path: the spawn site's `error` listener calls the same `handleModuleTaskEnded` with `successOrError: "error"` — the worker's catch does `reportError` only, no broadcast (a broadcast posted right before a close would be lost anyway). Use this model when completion should chain dependent work. See [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).

**(B) Dataset jobs → `postMessage("COMPLETED")` + status row (caller-attached listener).** The worker writes progress/terminal state into the `dataset_*_upload_attempts` row (`status` JSON + denormalized `status_type` enum: `staging`/`integrating`/`complete`/`error`) for SSE-driven client polling, and finishes with `self.postMessage("COMPLETED")`. The caller (`db/instance/dataset_hmis.ts` / `dataset_hfa.ts`) attaches the listeners:

```ts
setWorker("hmis", worker);                           // per-family worker slot
worker.addEventListener("error", async (e) => {
  e.preventDefault();                                // don't crash the server
  await mainDb`UPDATE …upload_attempts SET status_type='error', status=…`;
  clearWorker("hmis", worker);                       // compare-and-delete
  worker.terminate();                                // host owns termination
});
worker.addEventListener("message", (e) => {
  if (e.data === "COMPLETED") {
    clearWorker("hmis", worker);
    worker.terminate();                              // else the isolate leaks
  }
});
```

### Single-worker locking

- **`worker_store.ts`** holds at most one live worker per import family in a
  `Map<WorkerKey, Worker>` (`WorkerKey = "hmis" | "hfa"` — extend the union
  when adding a family): `setWorker(key, worker)` / `getWorker(key)` /
  `clearWorker(key, worker)`. `clearWorker` is compare-and-delete (deletes
  only if the stored worker IS this worker), so a stale worker's late
  error/COMPLETED event cannot clobber a successor stored under the same key.
  The caller checks `getWorker(key)` before starting and refuses if one is in
  flight ("operation already in progress"), and claims the lock by setting
  `status_type='staging'` immediately.
- **The running-tasks map** (module runs) is keyed by `projectId` + `moduleId` with a per-run `runToken`, allowing concurrency across modules/projects and rejecting stale completions — owned by [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).

---

## Rules

1. **New routine = a folder with `instantiate_worker.ts` (factory over `instantiateWorker`) + `worker.ts` (preamble + `run`).**
2. **Spawn only via `instantiateWorker`** so the `"READY"` handshake is preserved. Don't `new Worker` directly and post immediately.
3. **Start `worker.ts` with the standard preamble**: `onmessage → run().catch(console.error + reportError)`, `postMessage("READY")`, module-level `alreadyRunning` guard. **No `self.close()`** in the catch or in any `finally`.
4. **Every spawn site attaches an `error` listener with `e.preventDefault()`** that records the error completion, clears the tracker, and terminates the worker. A missing listener = an unhandled worker error exits the server process.
5. **Create dedicated worker connections and `.end()` them on every exit path** (a `finally` holding only `.end()` calls is fine).
6. **Pick the report-back to match the need:** chaining dependent work → `task_ended` broadcast; a single tracked dataset job the caller awaits → `postMessage("COMPLETED")` + status row.
7. **Clear the tracker AND terminate on every terminal path** — `removeRunningModule` (map, terminates internally) or `clearWorker` + `worker.terminate()` (store). An unterminated completed worker leaks its isolate and threads for the life of the process.

---

## What NOT to do

- **Never `self.close()` in a worker.** Both failure modes are empirically verified: it silently drops a `BroadcastChannel` message posted just before it, and in a `finally` it runs before the rethrown error reaches `reportError`, so the host's `error` listener never fires and the worker slot/map entry is stranded. The only exception is the `alreadyRunning` re-entrancy guard (nothing is pending there).
- **Don't spawn a worker without an `error` listener + `e.preventDefault()`.** An unhandled worker error is an unhandled rejection on the main thread and exits the entire server process.
- **Don't leak a worker connection.** Every connection created must be ended on *every* branch.
- **Don't use the request connection cache in a worker** — it isn't shared across contexts; use the worker factories.
- **Don't diverge the preamble.** It's copy-pasted six times; subtle drift (READY string, error semantics) is a latent bug.

---

## Gotchas

- **READY handshake is load-bearing.** The host posts the payload *only* after `"READY"`; a worker that does work before posting READY may miss its payload, and one that posts READY late races the host.
- **`alreadyRunning` guards re-delivery.** If the host posts twice, the second `run` self-closes. Don't rely on a single worker handling multiple payloads.
- **`finally` is for `.end()` only.** A `finally` holding connection teardown is fine; a `finally` holding `self.close()` is the exact shape that stranded the HFA worker slot on every failure (the close beat `reportError`).
- **Worker→host `postMessage` and `BroadcastChannel` have different loss semantics.** `postMessage("COMPLETED")` survives host-side terminate-on-receipt; a `BroadcastChannel` post immediately followed by `self.close()` is lost. Don't reason from one to the other.
- **Status row vs broadcast are not interchangeable.** Dataset clients poll the `status_type` enum over SSE; module clients react to `module_dirty_state`/`r_script`. Wire the matching consumer.

---

## Enforcement opportunities

- **Shared `runWorker()` wrapper** that owns the preamble (READY post, `alreadyRunning`, `run().catch(console.error + reportError)`) so the six copies converge.
- **Shared spawn helper** that pairs `instantiateWorker` with the mandatory `error` listener, so a new spawn site can't forget `preventDefault`.
- **Shared `updateProgress` helper + uniform status JSON shape** for dataset workers so failure UX is consistent (some write a clean error row, some surface a generic crash).
- **Assert every tracker add has a matching clear + terminate** on all terminal paths.

---

## Adding a worker routine — checklist

- [ ] Create `server/worker_routines/<name>/instantiate_worker.ts` (factory over `instantiateWorker`)
- [ ] Create `<name>/worker.ts` with the standard preamble + `run` — no `self.close()` anywhere except the `alreadyRunning` guard
- [ ] Use `createWorkerReadConnection` / `createBulkImportConnection`; `.end()` on every exit path (a `finally` may hold `.end()` calls only)
- [ ] Choose report-back: `task_ended` (chains work) or `postMessage("COMPLETED")` + status row (tracked job)
- [ ] Register/clear the appropriate tracker (running map or `worker_store`) on every terminal path, and terminate the worker from the host
- [ ] Caller attaches `error` (with `e.preventDefault()`) + `message` listeners — mandatory, not just for the dataset model

---

## Key files

| File | Purpose |
|------|---------|
| `server/worker_routines/instantiate_worker_generic.ts` | `instantiateWorker` + READY handshake |
| `server/worker_routines/worker_store.ts` | keyed per-family worker slots |
| `server/worker_routines/run_module/worker.ts` | module-run worker (task_ended model) |
| `server/worker_routines/run_module/instantiate_worker.ts` | `instantiateRunModuleWorker` |
| `server/worker_routines/integrate_hmis_data/worker.ts` | bulk-integration worker (COMPLETED model) |
| `server/worker_routines/stage_*/worker.ts` | staging workers |
| `server/db/instance/dataset_hmis.ts` | caller: lock, spawn, attach listeners |
| `server/db/postgres/worker_connections.ts` | dedicated worker connection factories |
