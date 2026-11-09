# PLAN: HFA verification runs on the server

The HFA indicator verification (SYSTEM_05 "HFA indicator verification") runs in the browser tab that starts it. A run is tied to that tab: one per tab, not per instance; it dies when the tab closes; nobody else sees it; and its findings reach the table only every ten answers. This plan moves the run into a server worker, one per instance, whose queue any Verify adds to and whose progress every client sees. Each answer is saved as it arrives. It also adds Verify as a bulk action on the manager's selection, fixes Discard dropping edits made after a drafted fix, and corrects two doc defects found in review.

**Next step: Do 2.**

Branch: `main` here and in panther. Repos: this one and panther (`/Users/timroberton/projects/panther/timroberton-panther`, whose `./sync` copies it into `panther/`). Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) "HFA indicator verification", [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Principles" and "The proxy", [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) the notify recipe, [PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md), [PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md), [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md), [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md), and panther's `DOC_AI_CHAT.md` where it describes `callAIStructured`. Start when: both trees are clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_HFA_VERIFICATION_WORKER.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 4; its close commit deletes this file.

Step 1 is worked in the panther repo on its floor (its CLAUDE.md "Commands") and ends with its `./sync` into this repo, committed here as one commit whose body names the panther commits.

Vocabulary, used throughout:

- **run**: one `hfa_verification_runs` row and the worker that drains the queue for it. At most one is in progress per instance.
- **queue**: the `hfa_verification_queue` rows: the indicators the run has still to answer, claimed or not.
- **claim**: the worker's mark (`claimed_at`) on a queue row whose call is in flight.
- **pending**: every indicator with a queue row, claimed or not.
- **queuer**: the user whose Verify put an indicator on the queue (`queued_by`); the run charges, logs and signs that indicator's answer as that user.
- **answer**: the model's result for one indicator: findings, or null.
- **run state**: `HfaVerificationRunState`, the run row and the pending ids as clients receive them on `InstanceIndicatorsSummary`.
- **governed client**: an Anthropic SDK client built for one user, whose `fetch` is `proxyAnthropicMessages` called in process, so every request takes the proxy's limits, usage logging and beta allowlist as that user's.
- **snapshot**: the HFA read input the worker builds messages and hashes from, re-read when `hfaIndicatorsVersion` moves.
- Verification, finding, rule, dismissed, rule switch, open finding, input hash, draft fix: as SYSTEM_05 "HFA indicator verification" defines them.

Rules peculiar to this plan:

- Every line number here was read from the code when the plan was written; where the code has moved, the code wins.

## §1 The problem

- **A run belongs to one browser tab.** `startRun` refuses while the tab's module-level controller is set ([runner.ts:91](client/src/components/data/hfa/indicators/verification/runner.ts#L91)). A second tab or a second user starts a second run over the same indicators, and each spends tokens on the other's work. Closing the tab ends the run. Nobody but the tab that started it sees its progress.
- **The table updates only every ten answers.** Answers are saved in batches of `SAVE_BATCH = 10` ([runner.ts:24](client/src/components/data/hfa/indicators/verification/runner.ts#L24), [:228](client/src/components/data/hfa/indicators/verification/runner.ts#L228)), so "Verifying 7 of 87" sits beside an unchanged Findings column. The batch was a network-round-trip economy for the browser; on the server a save is a local transaction.
- **A Verify during a run is refused.** The editor's Verify is disabled for the whole of a run ([indicator_code_editor.tsx:296](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L296)), so an indicator fixed mid-run cannot be re-checked until the run ends.
- **No way to verify a chosen set.** The manager offers the not-verified and changed queue ("Verify N") and every indicator ("Verify all", [manager.tsx:1162](client/src/components/data/hfa/indicators/manager.tsx#L1162)); its bulk actions hold Delete only ([manager.tsx:1230](client/src/components/data/hfa/indicators/manager.tsx#L1230)).
- **Discard drops later edits.** After a drafted fix lands, Discard restores the draft from before the fix and marks it saved ([indicator_code_editor.tsx:737-742](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L737-L742)), so an edit made after the fix, by the user or the copilot's `update_hfa_indicator_editor`, is lost without a word. `markDirty` ([:614](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L614)) leaves the banner and its Discard in place.
- **Panther's one-shot call cannot load on the server.** `callAIStructured` ([panther/\_305_ai/\_core/one_shot.ts:88](panther/_305_ai/_core/one_shot.ts#L88)) lives in `_305_ai`, whose `deps.ts` evaluates the UI kit, so Deno code cannot import it. What it uses is Deno-safe: `_110_ai_types`'s model resolvers and `renderOutgoingMessages`, and the SDK's `betaZodOutputFormat`.
- **Governance lives in the HTTP proxy.** The daily and weekly limits, the usage log and the beta allowlist are in `runProxy` ([anthropic_messages_proxy.ts:63](server/routes/anthropic_messages_proxy.ts#L63)), reached only by the `/ai` route. S13's first principle says nothing server-side talks to Anthropic but through it ([SYSTEM_13_ai_assistant.md:68-71](SYSTEM_13_ai_assistant.md#L68-L71)).
- **Doc defects.** SYSTEM_05 has code spans split across lines at [:1197](SYSTEM_05_facilities_indicators.md#L1197), [:1203](SYSTEM_05_facilities_indicators.md#L1203), [:1207](SYSTEM_05_facilities_indicators.md#L1207), [:1253](SYSTEM_05_facilities_indicators.md#L1253) and [:1277](SYSTEM_05_facilities_indicators.md#L1277). CLAUDE.md's formatting section ([CLAUDE.md:13](CLAUDE.md#L13)) names `server/tests/fixtures/fastr_pdf/`, which does not exist, and omits `report-forge/`, which `deno.json` excludes.

## §2 The model

**Two tables, S5-owned**, in a new migration and the base schema:

```sql
CREATE TABLE IF NOT EXISTS hfa_verification_runs (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running', 'stopping', 'completed', 'stopped', 'error')),
  started_by text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  done integer NOT NULL,
  not_checked text NOT NULL,
  error text
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hfa_verification_runs_one_live
  ON hfa_verification_runs ((true)) WHERE status IN ('running', 'stopping');

CREATE TABLE IF NOT EXISTS hfa_verification_queue (
  indicator_id text PRIMARY KEY REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  queued_by text NOT NULL,
  queued_at timestamptz NOT NULL,
  claimed_at timestamptz,
  requeue boolean NOT NULL DEFAULT false
);
```

The runs table holds the latest run only: a start deletes ended rows. `not_checked` is a JSON array of `{ indicatorId, stopReason }` in a text value, read and written in TypeScript. A deleted indicator takes its queue row.

**The run state**, `HfaVerificationRunState` in `lib/types/hfa_verification.ts`: `status`, `startedBy`, `startedAt`, `endedAt`, `done`, `pending` (indicator ids), `notChecked` and `error`. `InstanceIndicatorsSummary` gains `hfaVerificationRun: HfaVerificationRunState | undefined`, undefined before the first run. `getInstanceIndicatorsSummary` reads it.

**Two routes replace the save route**, in `lib/api-routes/instance/hfa_verification.ts`, both `can_configure_data`:

- `startHfaVerificationRun` (POST `/hfa-verification/run`, body `{ indicatorIds: string[] }`, `.min(1)`). In one transaction that locks the live run row: with a run `running`, insert each id into the queue with the caller as `queued_by` (`ON CONFLICT`: an unclaimed row is kept, its queuer with it; a claimed row gets `requeue = true`); with none, delete ended runs, insert a `running` run and the queue rows, and after commit spawn the worker. A run `stopping` refuses with a message. One notify.
- `stopHfaVerificationRun` (POST `/hfa-verification/run/stop`): with a run `running`, set it `stopping`, delete the unclaimed queue rows, notify; the worker sees the status at its next claim. Otherwise a no-op success.

`saveHfaIndicatorVerifications` (route, client action and permission-matrix row) is deleted. The DB function of that name stays: the worker calls it.

**The worker**, `server/worker_routines/hfa_verification/` (`worker.ts`, `instantiate_worker.ts`, and the run logic in `run.ts`, which takes its connection, its governed-client factory (a queuer's email to that user's SDK client) and its clock as arguments so a test drives it), under the recipe of PROTOCOL_APP_WORKER_ROUTINES: the standard preamble, READY, its own connection from `server/db/postgres/worker_connections.ts` ended on every exit path, report-back by `postMessage("COMPLETED")` and the run row, tracker key `"hfa_verification"` in `worker_store.ts`. Payload: `{ runId }`.

- It reads the snapshot (the route functions' own DB reads: `getHfaIndicators`, the taxonomy reads, `getAllHfaIndicatorCode`, `getAllHfaIndicatorVariantCode`, `getHfaDictionaryForValidation`, `getDatasetHfaItemsForDisplay`, and `hfaIndicatorsStatus` over them), the dismissed findings, and builds the blocks with `_INSTANCE_LANGUAGE`. Before each claim it reads the run's status and, when `getHfaIndicatorsVersion` has moved since the last read, re-reads the snapshot, so an indicator added after an edit is checked as saved.
- It claims the oldest unclaimed queue row (`FOR UPDATE SKIP LOCKED`). The first claim after every snapshot read goes alone, so the context block's cache write lands once, then four in flight.
- Each answer is one transaction: `saveHfaIndicatorVerifications` for one result with the row's queuer as `verified_by` (or the `not_checked` append for a null), the queue row deleted, or unclaimed when `requeue` is set; `done` incremented as the last statement.
- Notifies are throttled: at most one per 5 seconds while answers land, and one when the run ends.
- It finishes in a transaction that locks the run row and flips it to `completed` only when the queue is empty, so an id added at the last moment is never lost. A run found `stopping` at a claim ends the claiming; the calls in flight finish and save, then the worker flips the run to `stopped`. A thrown error (a 429, a network failure, a failed save) ends the claiming the same way: the calls in flight finish and save, the queue is deleted, and the run is flipped to `error` with the first error's message (the response body's own message for an API error). No call is aborted: an abort loses the answer and pays the partial usage.
- Every call goes through a **governed client** `createGovernedAnthropicClient({ userEmail, unlimitedAi, mainDb })`, exported from `server/routes/anthropic_messages_proxy.ts` beside `proxyAnthropicMessages`, whose `fetch` hands the SDK's request to `proxyAnthropicMessages`. The worker builds one per queuer, from the row's `queued_by` and that user's `unlimited_ai`, so the limits and the usage log charge the user whose Verify queued the indicator, as the browser run charged the user whose tab ran it. The call is panther's `callAIStructured`, now Deno-loadable (step 1), with `hfaVerificationSystem(blocks)`.

`markStaleHfaVerificationRuns` in `db_startup.ts` flips a run left `running` or `stopping` by a restart to `error` ("Interrupted by a server restart. Verify checks the indicators it did not reach.") and deletes the queue.

**Shared builders move to lib** (`lib/hfa_verification.ts`): `hfaVerificationSystem(blocks)` and `modelCallErrorMessage(e)` (the API error body's own message, read structurally, without importing the SDK's class), used by the worker and by Draft a fix.

**The client.** `verification/runner.ts` is deleted. The run state is `instanceState.hfaVerificationRun`.

- The manager's toolbar Verify sends its queue to `startHfaVerificationRun`. While a run is live it shows "Verifying n of N" (N = `done` plus the pending count), with "started by x" when another user started it, and Stop. The not-checked list and the error of the last run show above the table as now.
- The bulk action Verify, listed while HFA data exists and no run is `stopping`, sends the selection. "Verify all" leaves the actions menu: select-all selects the filtered rows, so select-all and Verify is Verify all, and a filter and select-all verifies a category or every indicator with problems.
- The editor's Verify sends its indicator, enabled except while a run is `stopping`; during a run it adds the indicator. "Verifying…" shows while its id is pending.
- Draft a fix stays in the browser through the `/ai` proxy client, using lib's `hfaVerificationSystem` and `modelCallErrorMessage`.
- The fix banner clears on any edit after the fix lands: `markDirty` calls `p.fix.clear()`, which leaves a fix still drafting alone, so the fix's own write keeps its banner.

## §3 Rulings

1. The verification run moves to a server worker, one per instance (Tim, 2026-11-03).
2. Every call of a run goes through `proxyAnthropicMessages` in process, through a governed client built for the indicator's queuer, so limits, usage logging and the beta allowlist are the proxy's and charge the user who queued each indicator, who is also its `verified_by`. S13's first principle is restated as "every model call goes through the proxy's governance". _(proposed)_
3. The one-shot structured call becomes Deno-loadable in panther and is shared by the worker and Draft a fix; the model config stays panther's default. _(proposed)_
4. Draft a fix stays in the browser: it is one interactive call by one user. _(proposed)_
5. The queue is a table. A Verify during a run adds to it; an indicator added while its call is in flight is checked again after its answer. _(proposed)_
6. Each answer is saved in its own transaction; notifies are throttled to one per 5 seconds and one at the end. _(proposed)_
7. The worker re-reads the snapshot when the indicators' stamp moves, so every message and hash comes from the state it was read from. _(proposed)_
8. Stop drops the unclaimed queue and ends the run once the calls in flight have answered and saved; no call is aborted, so no answer is paid for and lost. _(proposed)_
9. A server restart ends a live run as an error and empties the queue; nothing resumes on its own. _(proposed)_
10. The run state rides `InstanceIndicatorsSummary`; no new SSE type. _(proposed)_
11. Verify is a bulk action on the selection (Tim, 2026-11-03), and "Verify all" is removed from the actions menu, since select-all over the filtered rows covers it. _(proposed)_
12. A drafted fix's banner clears on any later edit, so Discard never drops an edit made after the fix. _(proposed)_
13. Start and Stop need `can_configure_data`; the run state reaches every user who receives the summary. _(proposed)_

## §4 Steps

### Step 1: The one-shot structured call loads on the server (panther repo)

**Surface.** `modules/_116_ai_one_shot/` (new: `one_shot_structured.ts`, `deps.ts`, `mod.ts`), `modules/_305_ai/_core/one_shot.ts`, `modules/_305_ai/mod.ts`, `modules/_305_ai/deps.ts`, `modules/mod.deno.ts`, `modules/mod.ui.ts`, `modules/_305_ai/README.md` "One-Shot Requests", the `callAI` paragraph of `DOC_AI_CHAT.md`, `FUTURE_IDEAS_AI_CHAT.md` §4, `tests/ai_one_shot_structured_test.ts` (new), `testing_sandbox/ai_one_shot/` (deleted); in this repo, `panther/**` through the sync.

**Deliverable.**

- `_116_ai_one_shot` holds `callAIStructured`, `CallAIOptions`, `CallAIResult`, `CallAIStructuredResult` and the structured parse, importing only `_110_ai_types` and the SDK, and is exported from both `mod.deno.ts` and `mod.ui.ts`.
- `_305_ai` imports and re-exports them; `callAI` stays in `_305_ai` and keeps its types from `_116`. No consumer's import changes.
- `tests/ai_one_shot_structured_test.ts` imports `callAIStructured` from `mod.deno.ts` and runs it against a stub SDK client (the test task grants no env access, which the SDK reads at construction): a parsed answer, a null on a refusal, a null on a schema miss, and the signal reaching the request. The sandbox test it replaces, kept outside the suite because `_305_ai` could not load there, is deleted.
- The README and `DOC_AI_CHAT.md` name the module and say it loads in Deno.
- `FUTURE_IDEAS_AI_CHAT.md` §4 records in one line that the one-shot structured call is hoisted to `_116`, so a ruling on PLAN_RUNS piece 3a reads the fork's current state.
- `./sync` for the `wb-fastr` target, then this repo's floor.

**Not in this step.** `callAI`'s move; any consumer in this repo.

**Gates.** Panther's floor; this repo's floor after the sync.

**Ends with.** The panther commits, then one sync commit here naming them.

### Step 2: The editor fix and the doc defects (this repo)

**Surface.** `client/src/components/data/hfa/indicators/indicator_code_editor.tsx`, SYSTEM_05, CLAUDE.md.

**Deliverable.**

- `markDirty` calls `p.fix.clear()` after `p.setNeedsSaving(true)`.
- SYSTEM_05: the code spans at :1197, :1203, :1207, :1253 and :1277 are rejoined onto one line each; the editor paragraph says what this step changed.
- CLAUDE.md's formatting section lists the `fmt.exclude` of `deno.json` as it is: `vendor/`, `client/public/`, `client/package-lock.json` and `report-forge/`.

**Not in this step.** The server run; the bulk Verify, which step 4 writes against the server run.

**Gates.** The floor.

**Ends with.** Two commits: the Discard fix; the doc fixes.

### Step 3: The server run (this repo)

**Surface.** `server/db/migrations/instance/229_hfa_verification_runs.sql` (new), `server/db/instance/_main_database.sql`, `server/db/instance/_main_database_types.ts`, `server/db/instance/hfa_verification.ts`, `server/db/instance/mod.ts`, `server/db/instance/instance.ts`, `server/db_startup.ts`, `server/worker_routines/hfa_verification/` (new: `worker.ts`, `instantiate_worker.ts`, `run.ts`), `server/worker_routines/worker_store.ts`, `server/routes/anthropic_messages_proxy.ts`, `server/routes/instance/hfa_verification.ts`, `lib/api-routes/instance/hfa_verification.ts`, `lib/types/hfa_verification.ts`, `lib/types/instance_sse.ts`, `lib/hfa_verification.ts`, `client/src/state/instance/t1_store.ts`, `server/tests/hfa_verification_test.ts`, `server/tests/hfa_verification_run_test.ts` (new), `server/tests/permission_matrix_test.ts`, SYSTEM_02, SYSTEM_03, SYSTEM_05, SYSTEM_06, SYSTEM_13, `PROTOCOL_APP_WORKER_ROUTINES.md`, `PROTOCOL_APP_STATE.md`.

**Deliverable.**

- The two tables of §2 in the migration and the base schema, idempotent.
- The DB layer: the start transaction, the stop, the claim, the per-answer transaction, the finish, `getHfaVerificationRunState`, and `markStaleHfaVerificationRuns`, called from `db_startup.ts` as the import runs' markers are.
- `HfaVerificationRunState`; `InstanceIndicatorsSummary.hfaVerificationRun`, read by `getInstanceIndicatorsSummary` and set in the T1 store.
- `createGovernedAnthropicClient` beside `proxyAnthropicMessages`.
- The worker as §2 describes it, its `"hfa_verification"` key in `worker_store.ts`, spawned by `startHfaVerificationRun` with the spawn-site `error` and `message` listeners of PROTOCOL_APP_WORKER_ROUTINES.
- `startHfaVerificationRun` and `stopHfaVerificationRun`, with their rows in the permission matrix test. The save route stays until step 4, so the client stays green.
- `hfaVerificationSystem` and `modelCallErrorMessage` in `lib/hfa_verification.ts`.
- `server/tests/hfa_verification_run_test.ts` pins, on a throwaway database with `run.ts` driven by a stub SDK `fetch`: a start queues under its caller and a second start by another user adds to the live run under that user; a start while `stopping` refuses; each call uses the client the factory built for the row's queuer; each answer saves under its queuer with its queue row gone and `done` moved; a null answer lands in `not_checked`; a re-added claimed indicator is checked twice; an id added before the finish transaction is checked, not dropped; after the stamp moves, one call goes alone before four resume; a 429 ends the run as `error` with the body's message, the other answers in flight saved and the queue emptied; Stop ends it `stopped` with the answers in flight saved; a deleted indicator's queue row goes with it; the stale marker ends a live run. `hfa_verification_test.ts` pins that the hashes the worker computes from the DB reads equal those computed from the routes' JSON bodies.
- SYSTEM_05's verification section describes the run as built (tables, routes, worker, run state, restart); SYSTEM_13's first principle and the HFA paragraph say a run's calls go through the proxy's governance in process; SYSTEM_03's catalogue names the summary's run state; SYSTEM_02 names the stale marker; SYSTEM_06 names the store's new key; the worker routines protocol's inventory and `WorkerKey` list gain the routine; `PROTOCOL_APP_STATE.md`'s T1 table gains the field; SYSTEM_05's manifest claims the new folder.

**Not in this step.** The client's switch; the save route's deletion.

**Gates.** The floor, `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Several commits, each green: the governed client; the tables and DB layer; the worker and routes; the run state on the summary; the docs.

### Step 4: The client uses the server run (this repo)

**Surface.** `client/src/components/data/hfa/indicators/verification/runner.ts` (deleted), `client/src/components/data/hfa/indicators/verification/draft_fix.ts`, `client/src/components/data/hfa/indicators/verification/mod.ts`, `client/src/components/data/hfa/indicators/manager.tsx`, `client/src/components/data/hfa/indicators/indicator_code_editor.tsx`, `lib/api-routes/instance/hfa_verification.ts`, `server/routes/instance/hfa_verification.ts`, `server/tests/permission_matrix_test.ts`, SYSTEM_05, SYSTEM_13.

**Deliverable.**

- `runner.ts` is deleted; `noAnswerReason` moves into the folder's file that the manager, the editor and the fix share, exported through `mod.ts`.
- The manager's toolbar Verify, its progress and Stop, the editor's Verify and its "Verifying…" read `instanceState.hfaVerificationRun` and call the two routes as §2 describes; every string a `t3` literal in en, fr and pt.
- The manager's bulk actions gain Verify (en, fr, pt), listed with `can_configure_data`, HFA data and no run `stopping`, sending the selected ids to `startHfaVerificationRun` and returning `"CLEAR_SELECTION"`; "Verify all" leaves `otherActions`.
- `draft_fix.ts` uses lib's `hfaVerificationSystem` and `modelCallErrorMessage`.
- `saveHfaIndicatorVerifications`'s route, its contract entry and its permission-matrix row are deleted.
- SYSTEM_05 describes the manager's run controls, its bulk Verify and the editor's run controls as built; SYSTEM_13 drops the browser runner from its HFA paragraph.

**Not in this step.** Anything of §5.

**Gates.** The floor.

**Ends with.** Several commits, each green; the close commit deletes this file.

## §5 Out of scope

- Resuming a run after a server restart.
- A history of runs: the latest run only.
- Moving Draft a fix or the copilot to the server.
- Moving `callAI` (with tools) out of `_305_ai`.
- Incremental fetches of the verification rows: the throttle bounds refetches.
- A column on `ai_usage_logs` telling a run's calls from a chat's.

## §6 Log

- Step 1: `tests/ai_one_shot_structured_test.ts` imports `callAIStructured` from `modules/_116_ai_one_shot/mod.ts`, not `mod.deno.ts`, because `mod.deno.ts` loads DuckDB's native binding, which fails under `deno task test`'s `--allow-read=modules`.
- Step 1: `modules/_116_ai_one_shot/deps.ts` also imports zod's types, because `callAIStructured` takes a `ZodType<T>` schema.
- Step 1: `DOC_MODULE_STRUCTURE.md`'s systems table lists `_116_ai_one_shot`, outside the Surface, because that table is the module map.
- Step 1: `DOC_AI_CHAT.md`'s module list gains `_116_ai_one_shot` and its intro says "these modules", outside the `callAI` paragraph, because that list is where the doc names its modules.
- Step 1: `modules/_305_ai/README.md`'s API lists gain the one-shot types and `callAIStructured()`, outside "One-Shot Requests", because those lists are `_305_ai`'s exports.
