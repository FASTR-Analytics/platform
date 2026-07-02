# PLAN: Worker Runtime Fixes

> **Status: IMPLEMENTED 2026-07-02** — all five batches landed (commits
> ac2d020a A, 9e29af7c B, a3ad1c3c C, 61c6f059 D, 420d079a E). Decision
> points resolved as recommended: targeted race fixes (no mutex), host-owns-
> termination contract, F9 server guard included. Behavioral testing on a
> live instance pending.

Source: full worker-runtime review (2026-07-02), 13 confirmed findings across
`server/worker_routines/` + `server/task_management/`. Finding 1 (module-worker
crash) empirically re-verified on Deno 2.6.4 (dev) and 2.5.3 (prod), including
with a live `Deno.serve` host. Reachability note: everyday failures (R crashes,
bad CSVs, Docker errors, disk space) are all caught inside `runModuleIterator`
and flow through the graceful `bad-close` path — the defects below are
edge-case or race-window, which is why modules have worked all year.

The 13 findings collapse into 5 batches. Each batch = one commit, typecheck +
lint:systems between batches. Check `git status` for parallel workstreams
before staging.

---

## Batch A — Worker teardown contract (F1, F3, F5, F8)

Root cause shared by four findings: no single owner of worker termination.
Workers `self.close()` at times that lose messages (BroadcastChannel post +
immediate close = message lost, verified both Deno versions), and the module
path has no host `error` listener at all (unlike all four dataset call sites),
so `reportError` kills the whole server.

**New contract: workers never `self.close()`; the host owns termination.**

1. **Module worker host error listener** (F1 — the server-killer).
   In `triggerRunnableModules` after `instantiateRunModuleWorker`:
   ```ts
   worker.addEventListener("error", (e) => {
     e.preventDefault(); // stop propagation crashing the server
     handleModuleTaskEnded({ projectId, moduleId, runToken, successOrError: "error" });
   });
   ```
   Same shape as dataset_hfa.ts:602 etc. (`handleModuleTaskEnded` = the
   extracted, guarded body of the current broadcast listener — see A.3.)

2. **Module worker** (`run_module/worker.ts`): catch block becomes
   `console.error(...); self.reportError(error);` — DELETE the error-path
   broadcast (redundant once the host listens; it was being lost anyway) and
   DELETE `self.close()` (host terminates via removeRunningModule). Success
   path and the getModuleDetail early-return keep their broadcasts (worker
   stays alive until host terminates — verified delivered).

3. **task_ended listener hardening** (F3). Extract the listener body into
   `handleModuleTaskEnded(etd)` with try/catch:
   - try: `setModuleClean` FIRST (DB write while module still "running" in the
     map — also closes the F7 window, see Batch B)
   - finally: `removeRunningModule` (terminates worker) + fire
     `triggerRunnableModules` wrapped so a rejection can't escape
   - catch: log; module stays 'queued' in DB and out of the map → next trigger
     re-runs it (self-healing instead of stuck)
   Both the BroadcastChannel listener and the new error listener call this one
   function. Also await/guard the fire-and-forget `triggerRunnableModules` in
   `setDirtyInner` (set_module_dirty.ts:49) — `.catch(console.error)` minimum.

4. **Dataset workers converge on the same contract** (F5, F8).
   - HFA workers (integrate_hfa_data, stage_hfa_data_csv): remove `self.close()`
     from the finally (it suppresses the error report-back — verified; the
     stranded 'hfa' slot blocks all retries). finally keeps only the `.end()`
     calls; catch keeps status-write + `reportError`.
   - HMIS workers: remove inline `self.close()` if any; keep reportError shape.
   - All five host call sites (dataset_hfa.ts x2, dataset_hmis.ts x3): on
     COMPLETED message AND on error event → `clearWorker(...)` +
     `worker.terminate()`. This fixes the leaked isolate per successful HMIS
     run (F8) and makes teardown uniform.

## Batch B — Task state-machine races (F2, F6, F7)

Root cause: check-then-act across awaits on shared state
(RUNNING_MODULES_ALL_PROJECTS + modules.dirty), and completions carry no run
identity. Three targeted fixes, no new machinery (rejected alternative: a
per-project async mutex serializing all task ops — heavier, new pattern, and
still needs run tokens for stale completions):

1. **Synchronous claim** (F2 double-spawn). Map value becomes
   `{ worker: Worker | null, runToken: string }`. In the trigger loop, claim
   the slot (worker: null + fresh token) in the same synchronous segment as the
   `hasRunningModule` check, BEFORE the awaited dependency check; unclaim if
   deps not ready; fill in the real worker when spawned. Two overlapping
   trigger invocations can no longer both pass the check.
   Detail: only fire `notifyProjectAnyRunning(true)` when an actual worker
   spawns, not on claim, to avoid flicker on unclaim.

2. **Run token** (F6 stale completion). `runToken` (nanoid) passed to the
   worker in StartingTaskData, echoed in EndingTaskData, stored in the map
   entry. `handleModuleTaskEnded` ignores an etd whose token doesn't match the
   current map entry (same compare-and-identity idea as worker_store's
   clearWorker on the dataset path). A completion from a terminated/superseded
   run can no longer clobber or kill its successor.

3. **Clean-before-remove ordering** (F7 completion-window respawn). Done in
   Batch A.3: `setModuleClean` writes dirty='ready' while the module is still
   in the running map, so a concurrent trigger skips it; only then is it
   removed. The respawn window disappears.

## Batch C — Container + uninstall lifecycle (F4, F9, F12)

1. **Kill the container, not just the CLI client** (F4). In production the
   worker's child is the `docker run` client; SIGKILL leaves the container
   running (verified daemon-side `--rm` still cleans up on exit, so the cost is
   a zombie execution + the stale-CSV race into the respawned run's shared
   sandbox dir). Fix: host passes a container name in StartingTaskData
   (`fastr-run-{moduleId}-{runToken}`); iterator adds `--name` in the
   production branch; the map entry stores it; the terminate helper in
   running_tasks_map fires `docker rm -f {name}` (fire-and-forget,
   `_IS_PRODUCTION` only). Sandbox collision and zombie both gone.

2. **Uninstall reconciliation** (F12): `uninstallModule` route calls
   `removeRunningModule` (now also container-killing) before deleting rows.

3. **Server-side dependency guard on uninstall** (F9): reject uninstall when
   another installed module's definition requires a results object this module
   produces (the client already blocks this; server currently doesn't — gap
   reachable via direct API / two-tab races / cleanupOrphanModules). Minimal
   check in the route or db function.

## Batch D — Ingestion small fixes (F10, F11)

1. **Post-claim re-read** (F10): in `updateDatasetUploadAttempt_Step3Staging`
   (dataset_hmis.ts) and the HFA twin, re-read the upload-attempt row AFTER the
   conditional claim UPDATE succeeds and pass the fresh snapshot to the worker.
   A step-2 mappings save landing between read and claim can no longer stage
   under stale mappings.

2. **Validation/CHECK alignment** (F11): `isValidPeriodId` gains year bounds
   matching PERIOD_ID_CHECK_CONSTRAINT (single-source the bounds); `isValidCount`
   requires `/^\d+$/` and ≤ int4 max. A single out-of-window row is then counted
   invalid like every other bad row instead of aborting the whole 10k-row batch
   with a raw constraint error.

## Batch E — Docs (F13 + drift from A–C)

Rewrite the wrong claims and document the new contract:
- DOC_WORKER_ROUTINES.md: line 96 ("dataset workers .end() in a finally" —
  false for 3 of 5), line 154 ("finally form is safer — prefer it" — the
  finally+close shape is the F5 bug). New authoritative teardown contract:
  workers never self.close; host terminates on COMPLETED/error; finally holds
  only .end() calls.
- DOC_TASK_EXECUTION_DIRTY_STATE.md: dead-worker behavior (was: process death,
  now: handled), run-token staleness guard, clean-before-remove ordering,
  container kill; close the "host-side onerror cleanup" open item.
- run_module/worker.ts comment "This will trigger the error event listener"
  becomes true — keep it accurate to the new listener.

---

## Decision points (Tim)

1. **Batch B approach**: targeted (claim + token + reorder, recommended) vs
   per-project mutex serializing all task-state operations.
2. **Teardown contract**: confirm "workers never self.close; host owns
   termination" as the standard for all 6 workers.
3. **F9 guard**: include the server-side uninstall dependency check, or defer
   to the project-snapshot work.

## Non-goals

- No startup recovery sweep for modules left 'queued' by a crash (separate,
  pre-existing open item; Batch A makes crashes not happen instead).
- No change to the success-path BroadcastChannel mechanism.
- No fix for the lost-update race on reports figures JSON (different system).
