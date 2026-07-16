# Task Execution & Dirty State

How module execution is orchestrated: a DB-persisted dirty state machine with an in-memory "running" overlay, recursive dependency propagation, runnable gating, and the `task_ended` cleanup/re-trigger loop.

> This doc owns the **dirty/dependency/trigger machine** and the in-memory **running-tasks map invariant**. The worker *lifecycle* (spawn, READY handshake, connection teardown) is [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md) — it cites this doc for the map-cleanup rule. The R-script *load + execute + ingest* mechanics are [DOC_MODULE_EXECUTION.md](DOC_MODULE_EXECUTION.md). What happens when a module *definition* changes is [DOC_MODULE_UPDATES.md](DOC_MODULE_UPDATES.md) (a caller of `setModuleDirty`). Notifications and the `last_run`→cache coupling are [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

---

## Principles

1. **Dirty state is persisted; "running" is in-memory.** `modules.dirty` stores only `queued` / `ready` / `error`. The fourth status, `running`, is synthesized at read time from a process-local map.
2. **Dirtying cascades; running is gated.** Marking a module dirty recursively marks everything downstream of it. A queued module only *runs* once all its upstream dependencies are `ready`.
3. **Completion is decoupled via a channel.** A finished worker posts to the `task_ended` BroadcastChannel; a single listener flips the DB row, clears the map entry, and re-triggers newly-runnable modules.
4. **Every running-map add must be matched by a remove.** The map is the source of truth for "running" — a leaked entry reports a module as running forever and blocks all its dependents.

---

## The System

```text
  route / dataset import / module update
        │  setModuleDirty(ppk, moduleId)
        ▼
  collect dependents (recursive)  ──────────────► [moduleId, ...downstream]
        │  setDirtyInner:
        │    remove any running worker (terminates it + its docker container)
        │    UPDATE modules SET dirty='queued'
        │    notifyProjectModuleDirtyState(..., "queued")
        ▼
  triggerRunnableModules(ppk)
        │  per queued module: not already running/claimed
        │    → CLAIM the map slot (synchronous, fresh runToken)
        │    → await areUpstreamDependenciesOfModuleAllReady
        │      (release the claim if not ready)
        ▼
  for each runnable: instantiateRunModuleWorker(+ error listener)
        │  attach worker to its claimed slot; notify "running"
        ▼
  ┌─────────────── worker runs the R script (DOC_MODULE_EXECUTION) ───────────────┐
  └─► posts EndingTaskData to BroadcastChannel("task_ended") on completion;        │
      a crashed worker instead reportErrors → the spawn site's error listener      │
      feeds the same handler                                                       │
        │                                                                          │
        ▼   handleModuleTaskEnded (set_module_clean.ts)                            │
  runToken matches map entry? → setModuleClean(db, etd) →                          │
        │   success: dirty='ready', last_run_at=now, last_run_git_ref=compute_ref  │
        │            bump global_last_updated, notify, bump dependent PO           │
        │            last_updated, refetch modules+metrics, notify                 │
        │   error:   dirty='error', notify                                         │
        ▼   finally: removeRunningModule(map)                                      │
  triggerRunnableModules(ppk)  ◄── re-trigger: dependents may now be runnable ─────┘
```

### The dirty state machine (split source of truth)

`modules.dirty` (the DB column) holds **only** `queued` | `ready` | `error`. The client-facing `DirtyOrRunStatus` adds a fourth value, `running`, synthesized in `running_tasks_map.ts`:

```ts
export function getModuleDirtyOrRunning(projectId, moduleId, dirtyStatus): DirtyOrRunStatus {
  if (dirtyStatus === "queued") return hasRunningModule(projectId, moduleId) ? "running" : "queued";
  if (dirtyStatus === "ready") return "ready";
  if (dirtyStatus === "error") return "error";
  throw new Error("Bad dirty status for id: " + moduleId);   // any other string throws
}
```

So "is it running?" is answered by the **in-memory map**, never the DB. A module is `queued` in the DB the entire time it runs; the map distinguishes queued-and-waiting from queued-and-executing.

### Recursive dependency propagation (`set_module_dirty.ts` + `get_dependents.ts`)

Three entry points collect a `moduleIds` accumulator, then call `setDirtyInner`:
- `setModuleDirty(ppk, moduleId)` → that module + `addOtherModulesThatDependOnModule` (recursive).
- `setModulesDirtyForDataset(ppk, datasetType)` → `addModulesThatDependOnDataset` (modules whose `dataSources` include that dataset) + their downstream.
- `setAllModulesDirty(ppk)` → every module.

Propagation walks each module's stored `module_definition.dataSources`:
- a `dataset` source matching the changed `datasetType` → that module is a dependent;
- a `results_object` source with `ds.moduleId === changedModuleId` → that module is a dependent.

`includes()` guards against revisiting (handles diamonds/cycles). `setDirtyInner` then, per module: terminates+removes any running worker, sets `dirty='queued'`, notifies, and calls `triggerRunnableModules`.

### Runnable gating (`trigger_runnable_tasks.ts` + `areUpstreamDependenciesOfModuleAllReady`)

`triggerRunnableModules` selects `dirty='queued'`, and per module: skips any already in the running map, **claims the map slot in the same synchronous segment as that check** (a fresh `runToken`, worker still `null`), then gates on `areUpstreamDependenciesOfModuleAllReady`:
- every required **dataset** must exist in `datasets`;
- every module that **produces a required results object** must be `dirty='ready'` (an absent producer passes vacuously — the server-side uninstall guard in `routes/project/modules.ts` prevents reaching that state).

If not ready, the claim is released; otherwise the worker is spawned (`instantiateRunModuleWorker` + the mandatory `error` listener) and attached to its claimed slot, and a `running` notification fires. The synchronous claim is what makes concurrent trigger invocations (two `task_ended` handlers, a route racing a completion, a double-clicked rerun) unable to double-spawn the same module.

### The running-tasks map (`running_tasks_map.ts`)

`RUNNING_MODULES_ALL_PROJECTS: Map<projectId, Map<moduleId, RunningModuleEntry>>` — pure in-memory, where `RunningModuleEntry = { worker: Worker | null, runToken: string }` (`worker` is `null` between claim and spawn).

- `claimRunningModule` — reserve the slot with a fresh `runToken`. Must be called in the same synchronous segment as the `hasRunningModule` check. Silent (no SSE).
- `releaseClaimedModule` — token-checked delete of an unattached claim (deps weren't ready).
- `attachRunningModuleWorker` — token-checked; fills in the worker and fires `notifyProjectAnyRunning(true)` on the first attach (tracked in `NOTIFIED_RUNNING` so claim/release cycles produce no SSE noise). If the claim was superseded, the just-spawned worker is terminated and it returns false.
- `removeRunningModule` — `worker.terminate()` **plus `docker rm -f` of the run's named container in production** (killing the `docker run` CLI client alone leaves the container executing against the sandbox dir — see `run_module/container_name.ts`), delete; schedule `notifyProjectAnyRunning(false)` after a **200ms debounce** (re-checks before firing). The debounce prevents UI flicker when one module finishes microseconds before the next starts.
- `getAnyRunningModules` / `hasRunningModule` / `getRunningModuleEntry` — read accessors.

### The `task_ended` handshake (`set_module_clean.ts`)

A module-load-time listener on `BroadcastChannel("task_ended")` routes into `handleModuleTaskEnded`, which the module spawn site's `error` listener also calls for crashed workers:

```ts
export async function handleModuleTaskEnded(etd: EndingTaskData) {
  const entry = getRunningModuleEntry(etd.projectId, etd.moduleId);
  if (entry === undefined || entry.runToken !== etd.runToken) return; // stale run
  const projectDb = getPgConnectionFromCacheOrNew(etd.projectId, "READ_AND_WRITE");
  try {
    await setModuleClean(projectDb, etd);   // DB write FIRST, while still in the map
  } catch (error) {
    console.error(...);                     // row stays 'queued' → next trigger re-runs it
  } finally {
    removeRunningModule(etd.projectId, etd.moduleId);
    triggerRunnableModules({ projectDb, projectId: etd.projectId }).catch(...);
  }
}
```

The ordering is load-bearing twice over: the `runToken` check stops a stale completion from clobbering (or killing) a successor run, and writing the DB row *before* removing the map entry means there is no window where the module is `queued`-and-unmapped — the exact state a concurrent trigger would re-spawn.

`setModuleClean` on success: `dirty='ready'`, `last_run_at=now`, copies `compute_def_git_ref → last_run_git_ref`, bumps `global_last_updated('any_module_last_run')`, then **bumps `last_updated` on every dependent presentation object** (this is what invalidates their Valkey cache entries — [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)), then refetches modules+metrics and broadcasts. On error: `dirty='error'` + notify. The `ProjectPk { projectDb, projectId }` handle is reconstructed in the listener via `getPgConnectionFromCacheOrNew` because the message crosses a thread boundary.

---

## Rules

1. **Trigger dirtiness through `setModuleDirty` / `setModulesDirtyForDataset`** — never `UPDATE modules SET dirty` directly. The entry points handle propagation, worker termination, notification, and re-trigger.
2. **The DB `dirty` column is only `queued`/`ready`/`error`.** Never write `running` to it — `running` is derived from the map. Writing anything else makes `getModuleDirtyOrRunning` throw and breaks the whole project's dirty read.
3. **Every claim/attach needs a guaranteed `removeRunningModule` (or `releaseClaimedModule`)** — normal/error completions go through `handleModuleTaskEnded`; crashed workers reach it via the spawn site's `error` listener. (This rule is owned here; [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md) cites it.)
4. **Re-trigger after completion.** `setModuleClean` calls `triggerRunnableModules` so a freshly-`ready` module unblocks its dependents. A new completion path must do the same.
5. **Keep propagation and readiness in agreement** (see the two-key invariant below).

---

## What NOT to do

- **Don't assume crash recovery exists — it doesn't.** `RUNNING_MODULES_ALL_PROJECTS` is purely in-memory and `main.ts` has no resume step. After a server crash/deploy, modules left `dirty='queued'` are never re-triggered until some later action calls `triggerRunnableModules`. Don't write code that relies on queued work surviving a restart (see enforcement).
- **Don't add a completion path that bypasses `handleModuleTaskEnded`.** The token guard, clean-before-remove ordering, and re-trigger live there; a path that removes the map entry directly reintroduces the stale-clobber and respawn races.
- **Don't bypass the gating.** Spawning a module whose upstreams aren't `ready` will run it against missing/stale results.

---

## Gotchas

- **The two-key results-object edge.** Propagation matches `ds.moduleId` (`addOtherModulesThatDependOnModule`), but readiness gating queries by `ds.resultsObjectId` joined through `results_objects → modules` (`areUpstreamDependenciesOfModuleAllReady`). Both must resolve to the *same* producing module — if a `dataSource` has a `moduleId` and `resultsObjectId` that disagree, "downstream is dirty" and "upstream is ready" silently diverge. Related: the gate treats a producer with **no** `results_objects` rows as vacuously ready — the uninstall route's dependent guard is what keeps that state unreachable.
- **`running` is invisible to the DB.** A long-running module looks `queued` in any direct SQL query — only the running map (or `getModuleDirtyOrRunning`) knows it's executing.
- **The 200ms `anyRunning` debounce is deliberate.** It exists to stop the UI "running" indicator from flickering between back-to-back module runs. Don't "simplify" it away.
- **Setting dirty terminates a running worker.** Re-dirtying a module mid-run kills its worker (and, in production, its docker container by name) and re-queues — the in-flight results are discarded. Its eventual `task_ended` broadcast, if any, is rejected by the `runToken` guard.

---

## Enforcement opportunities

- **Startup recovery sweep:** on boot, per project, re-trigger runnable `queued` modules (and decide the fate of rows that were mid-run). Closes the crash/deploy gap.
- **Constrain `modules.dirty`** to `queued|ready|error` via a `CHECK` constraint or shared constant — a stray value throws on read.
- **Assert the two-key invariant** when installing/updating a module definition (a `results_object` dataSource's `moduleId` must own its `resultsObjectId`).
- **Document/encode the 200ms debounce intent** so it survives refactors.

---

## Adding an execution-affecting change — checklist

- [ ] Trigger via `setModuleDirty` / `setModulesDirtyForDataset` (never a raw `dirty` UPDATE)
- [ ] If adding a new dependency type, update **both** `get_dependents.ts` propagation and `areUpstreamDependenciesOfModuleAllReady` gating, keeping them consistent
- [ ] Any new running-state add goes through claim → attach with a guaranteed `removeRunningModule`/`releaseClaimedModule`, and completions go through `handleModuleTaskEnded`
- [ ] New completion paths bump `last_run_at`, notify dirty state, bump dependent PO `last_updated`, and call `triggerRunnableModules`
- [ ] Only `queued`/`ready`/`error` ever written to `modules.dirty`

---

## Key files

| File | Purpose |
|------|---------|
| `server/task_management/set_module_dirty.ts` | dirty entry points + `setDirtyInner` |
| `server/task_management/get_dependents.ts` | recursive propagation + readiness gating |
| `server/task_management/trigger_runnable_tasks.ts` | `triggerRunnableModules`: claim → gate → spawn (+ error listener) |
| `server/task_management/running_tasks_map.ts` | in-memory running map (claim/attach/release, runToken, container kill), `getModuleDirtyOrRunning`, debounce |
| `server/task_management/set_module_clean.ts` | `task_ended` listener, `handleModuleTaskEnded`, `setModuleClean`, re-trigger |
| `server/task_management/build_project_state.ts` | assembles dirty/run status into the SSE `starting` snapshot |
| `server/server_only_types/mod.ts` | `ProjectPk`, `StartingTaskData`, `EndingTaskData` |
