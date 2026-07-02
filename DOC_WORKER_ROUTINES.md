# Worker Routines

The Deno Web Worker background-job pattern: the `instantiate_worker` / `worker` folder pairing, the `"READY"` handshake, the mandatory worker-entry preamble, dedicated DB connections, and the two report-back mechanisms (`task_ended` broadcast vs `postMessage("COMPLETED")` + status row).

> This doc owns the **worker lifecycle** (spawn → handshake → run → teardown). The dirty-state semantics and the running-tasks-map cleanup *invariant* are owned by [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md) (this doc cites it). Worker DB connections are [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md). What the dataset workers actually *do* (stage→integrate, bulk insert) is [SYSTEM_05_ingestion.md](SYSTEM_05_ingestion.md); what the module worker does is [DOC_MODULE_EXECUTION.md](DOC_MODULE_EXECUTION.md). Workers reach the main thread's SSE via [DOC_SSE_REALTIME.md](DOC_SSE_REALTIME.md).

---

## Principles

1. **Heavy/blocking work runs in a Web Worker, never on the request thread.** R execution, CSV staging, and bulk integration are all workers.
2. **Spawn through the generic factory + `"READY"` handshake.** The host never posts the payload until the worker says it's listening — this closes the post-before-listener race.
3. **Workers use dedicated DB connections and must close them on every exit path.** Worker connections are uncached (`prepare:false`); a leaked one accumulates until background jobs stall.
4. **Every running worker is tracked, and every terminal path clears its tracker.** Module runs use the running-tasks map; dataset jobs use `worker_store`. A worker that dies without clearing its tracker blocks future work.

---

## The System

```text
  host (main thread)                               worker (separate context)
  ─────────────────                                ─────────────────────────
  instantiateXxxWorker(payload)
    └ instantiateWorker("./worker.ts",
        import.meta.url, payload)
        new Worker(url, {type:"module"})  ───────► module loads
        worker.onmessage = READY handler           self.onmessage = run(e.data).catch(reportError+close)
                                          ◄──────── self.postMessage("READY")
        on "READY" → worker.postMessage(payload) ─► run(payload)   (alreadyRunning guard)
                                                      create dedicated DB connection(s)
                                                      …do the work…
                                                      report back (see below)
                                                      .end() every connection
```

### Folder convention

Each routine is a folder under `server/worker_routines/` with **two files**:
- `instantiate_worker.ts` — exports `instantiate<Name>Worker(payload): Worker`, a thin wrapper over the generic factory.
- `worker.ts` — the worker entry point (`self.onmessage` + `run`).

`run_module` additionally has `mod.ts` (barrel) and `run_module_iterator.ts` (the R streaming generator — see [DOC_MODULE_EXECUTION.md](DOC_MODULE_EXECUTION.md)). The six routines:

| Folder | Payload | Report-back | Tracker |
|--------|---------|-------------|---------|
| `run_module` | `{ projectId, moduleId }` | `task_ended` broadcast | running-tasks map |
| `stage_hmis_data_csv` | `{ rawDUA }` | `postMessage("COMPLETED")` + status row | `worker_store` (HMIS) |
| `stage_hmis_data_dhis2` | `{ rawDUA, failFastMode }` | `postMessage("COMPLETED")` + status row | `worker_store` (HMIS) |
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

Every `instantiate_worker.ts` is a one-liner over this — e.g. `instantiateRunModuleWorker` passes `"./worker.ts"`, `import.meta.url`, and `{ projectId, moduleId }`.

### The mandatory worker-entry preamble

Every `worker.ts` opens with the **same** preamble (currently hand-copied into all six):

```ts
(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    /* (module worker also posts a task_ended "error" here) */
    self.reportError(error);   // surfaces to the host's "error" listener
    self.close();              // terminate after reporting
  });
};
(self as unknown as Worker).postMessage("READY");   // tell host we're listening

let alreadyRunning = false;
async function run(payload) {
  if (alreadyRunning) { self.close(); return; }      // re-entrancy guard
  alreadyRunning = true;
  …
}
```

### Dedicated connections

Workers **must not** use the request connection cache (it's not shared across worker contexts). They create dedicated pools via the worker factories ([DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md)):
- `createWorkerReadConnection(id)` — read-only work (module worker reads module/config).
- `createBulkImportConnection("main")` — bulk staging/integration inserts.

**Every exit path must `.end()` them.** The module worker's success path ends both `projectDb` and `mainDb`; the dataset workers `.end()` in a `finally`.

### Two report-back mechanisms

**(A) Module runs → `task_ended` broadcast (decoupled listener).** `run_module/worker.ts` consumes `runModuleIterator`, streams R output to clients via `notifyProjectRScript`, and on completion posts an `EndingTaskData` (`{ projectId, moduleId, successOrError }`) to `BroadcastChannel("task_ended")`. A *separate* listener in `set_module_clean.ts` handles it (flip DB row, clear map, re-trigger dependents). The host attaches **no** `onmessage`/`onerror` after the READY handshake — the channel is the only completion signal. Use this when completion should chain dependent work. See [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).

**(B) Dataset jobs → `postMessage("COMPLETED")` + status row (caller-attached listener).** The worker writes progress/terminal state into the `dataset_*_upload_attempts` row (`status` JSON + denormalized `status_type` enum: `staging`/`integrating`/`complete`/`error`) for SSE-driven client polling, and finishes with `self.postMessage("COMPLETED")`. The caller (`db/instance/dataset_hmis.ts` / `dataset_hfa.ts`) attaches the listeners:

```ts
setHmisWorker(worker);                               // single-worker lock
worker.addEventListener("error", async (e) => {
  e.preventDefault();                                // don't crash the server
  await mainDb`UPDATE …upload_attempts SET status_type='error', status=…`;
  setHmisWorker(null);
});
worker.addEventListener("message", (e) => { if (e.data === "COMPLETED") setHmisWorker(null); });
```

### Single-worker locking

- **`worker_store.ts`** holds at most one HMIS worker and one HFA worker (`getHmisWorker`/`setHmisWorker`, `getHfaWorker`/`setHfaWorker`). The caller checks `getHmisWorker()` before starting and refuses if one is in flight ("operation already in progress"), and claims the lock by setting `status_type='staging'` immediately.
- **The running-tasks map** (module runs) is keyed by `projectId` + `moduleId`, allowing concurrency across modules/projects — owned by [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).

---

## Rules

1. **New routine = a folder with `instantiate_worker.ts` (factory over `instantiateWorker`) + `worker.ts` (preamble + `run`).**
2. **Spawn only via `instantiateWorker`** so the `"READY"` handshake is preserved. Don't `new Worker` directly and post immediately.
3. **Start `worker.ts` with the standard preamble**: `onmessage → run().catch(reportError + close)`, `postMessage("READY")`, module-level `alreadyRunning` guard.
4. **Create dedicated worker connections and `.end()` them on every exit path** (prefer a `finally`).
5. **Pick the report-back to match the need:** chaining dependent work → `task_ended` broadcast; a single tracked dataset job the caller awaits → `postMessage("COMPLETED")` + status row.
6. **Clear the tracker on every terminal path** — `removeRunningModule` (map) or `setXxxWorker(null)` (store), including the host `error` listener.

---

## What NOT to do

- **Don't leak a worker connection.** `run_module/worker.ts` ends `mainDb` but **not** `projectDb` on the early `getModuleDetail`-failure return — a real leak. Every connection created must be ended on *every* branch.
- **Don't use the request connection cache in a worker** — it isn't shared across contexts; use the worker factories.
- **Don't leave a module worker without a death fallback.** Because the host attaches no `onerror` to module workers, a worker that dies without posting `task_ended` strands its running-map entry (and blocks dependents — see [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md)).
- **Don't forget `e.preventDefault()` in the host `error` listener** for dataset workers — without it a worker crash propagates and takes down the server.
- **Don't diverge the preamble.** It's copy-pasted six times; subtle drift (READY string, error semantics) is a latent bug.

---

## Gotchas

- **READY handshake is load-bearing.** The host posts the payload *only* after `"READY"`; a worker that does work before posting READY may miss its payload, and one that posts READY late races the host.
- **`alreadyRunning` guards re-delivery.** If the host posts twice, the second `run` self-closes. Don't rely on a single worker handling multiple payloads.
- **Teardown style diverges per file.** Module worker ends connections inline at each exit; dataset workers use `finally`. The `finally` form is safer — prefer it.
- **Status row vs broadcast are not interchangeable.** Dataset clients poll the `status_type` enum over SSE; module clients react to `module_dirty_state`/`r_script`. Wire the matching consumer.

---

## Enforcement opportunities

- **Shared `runWorker()` wrapper** that owns the preamble (READY post, `alreadyRunning`, `run().catch(reportError+close)`) so the six copies converge.
- **`finally`-based connection teardown on every worker** (fixes the `run_module` `projectDb` leak; standardizes the divergent styles).
- **Host-side `onerror`/exit fallback for module workers** that clears the running-map entry and marks the module `error` — pairs with the map-cleanup invariant in [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).
- **Shared `updateProgress` helper + uniform status JSON shape** for dataset workers so failure UX is consistent (some write a clean error row, some surface a generic crash).
- **Assert every tracker add has a matching clear** on all terminal paths.

---

## Adding a worker routine — checklist

- [ ] Create `server/worker_routines/<name>/instantiate_worker.ts` (factory over `instantiateWorker`)
- [ ] Create `<name>/worker.ts` with the standard preamble + `run`
- [ ] Use `createWorkerReadConnection` / `createBulkImportConnection`; `.end()` in a `finally`
- [ ] Choose report-back: `task_ended` (chains work) or `postMessage("COMPLETED")` + status row (tracked job)
- [ ] Register/clear the appropriate tracker (running map or `worker_store`) on every terminal path
- [ ] Caller attaches `error` (with `e.preventDefault()`) + `message` listeners if using the dataset model

---

## Key files

| File | Purpose |
|------|---------|
| `server/worker_routines/instantiate_worker_generic.ts` | `instantiateWorker` + READY handshake |
| `server/worker_routines/worker_store.ts` | single-worker HMIS/HFA locks |
| `server/worker_routines/run_module/worker.ts` | module-run worker (task_ended model) |
| `server/worker_routines/run_module/instantiate_worker.ts` | `instantiateRunModuleWorker` |
| `server/worker_routines/integrate_hmis_data/worker.ts` | bulk-integration worker (COMPLETED model) |
| `server/worker_routines/stage_*/worker.ts` | staging workers |
| `server/db/instance/dataset_hmis.ts` | caller: lock, spawn, attach listeners |
| `server/db/postgres/worker_connections.ts` | dedicated worker connection factories |
