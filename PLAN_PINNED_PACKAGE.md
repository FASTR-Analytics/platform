# PLAN: Instance-pinned results package

Status: ready to implement — design agreed with Tim 2026-08-13; every
decision is pre-made below. Implement the steps in order. Phase 3 (MCP) is
explicitly NOT part of this implementation pass.

**Sequencing: implement AFTER PLAN_RESULTS_PACKAGES_CATALOGUE_UI.md**
(ruled 2026-08-13). That plan rebuilds the catalogue page into
master–detail and promotes the listing to T1 (`runsCatalog` +
`runs_catalog_updated`). Two consequences for this plan: (a) step 7's
catalogue work targets the NEW layout — pinned badge in the sidebar
`SelectList` rows, pin/unpin action in the detail-pane header, and the
badge reads `instanceState.runsCatalog` (the `pinned` field on
`RunListingItem` rides the list push — no separate refetch); (b) step 4's
`pinRunAndRepointFollowers` and `unpinRun` must ALSO call
`notifyInstanceRunsCatalogUpdated(mainDb)` after the pin write, since
`pinned` is part of the catalogue rows. The unfiltered
`pinned_run_updated` event is still required regardless: `runsCatalog` is
`can_configure_data`-gated, but the project tab's follow toggle needs the
bare `pinnedRunId` for editors without that permission (ruling 12).

## Required reading before starting

- [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — before step 1
  (SQL migration + base-schema mirror; run `./validate_migrations`).
- [PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md) — before steps 4/6
  (add-a-route recipe: `defineRoute`, `route-tracker.ts`, client
  `server_actions/` functions).
- [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md) — before step 5 (the T1
  tier model this plan extends; both new fields are T1, written by SSE
  handlers ONLY, never by components).
- [PROTOCOL_APP_UI_CONVENTIONS.md](PROTOCOL_APP_UI_CONVENTIONS.md) — before
  step 7 (all UI work).

## Problem

The runs catalogue (SYSTEM_08) has no notion of "the package this instance
blesses for consumption". Two consumers need one: projects that should
always track the blessed package (today every repoint is a manual
per-project attach), and a future instance-level MCP surface whose data
tools need an answer to "which run?" without a project (SYSTEM_08 already
anticipates the mechanism — `getSharedToolsForModules` takes a run
resolver; the pin is what gives an instance-level resolver its answer).

## Design rulings (agreed 2026-08-13 — do not re-litigate)

1. **Latest is derived, pinned is stored.** "Latest" = newest ready run
   (already the picker's sort order) — never a consumer-facing pointer and
   never stored. "Pinned" is the only stored concept.
2. **Pinning is always an explicit act.** No fall-back-to-latest anywhere:
   unset pin is a typed no-pin state. Nothing auto-advances on a new ready
   run — that would kill the "generation with no attach targets touches
   nothing" escape hatch. (Future scheduled generation gets an
   `autoPinOnSuccess` flag — out of scope here.)
3. **Storage = `runs.pinned` boolean**, at-most-one enforced by a partial
   unique index (never "exactly one" — fresh instances have zero runs, and
   unpin/delete must leave a no-pin state).
4. **Followers are physically repointed, never indirected.**
   `projects.follow_pinned` means: when the pin moves, run the normal
   attach path for that project. `projects.run_id` stays the single truth
   and the cache identity everywhere. A read-time "my run = whatever is
   pinned" indirection is banned — it would reopen the stamp-propagation
   bug class the runs architecture exists to kill.
5. **The follower loop reuses `attachRunToProject` verbatim**, one call per
   follower — identical semantics to a manual attach (ready-gate in the
   UPDATE, compatibility never blocks, full `run_attached` payload). The
   payload-sharing optimization the publish pipeline does
   (`generate_run/pipeline.ts:202`) is deliberately skipped: follower
   counts are small and the manifest is cached. A mid-loop failure leaves
   the remaining followers on their old package — accepted; self-heals on
   the next pin-move or manual attach, and the route response reports it.
6. **The pin never enters the package.** `pinned` is DB catalog state like
   `status` — never written into `manifest.json` (format invariant 3). No
   manifest schema bump, no Valkey prefix bump, no cache-key change
   anywhere in this plan.
7. **Delete protection is a code guard** in `deleteRunCatalogRow` (the
   boolean gives no FK protection): refuse deleting the pinned run —
   "unpin it first".
8. **Manual attach overrides the subscription.** A follow-pinned project
   attaching (via its own picker) anything other than the current pinned
   package gets `follow_pinned` cleared in the same act. Implemented
   INSIDE `attachRunToProject` so the picker and the follower loop share
   it (followers attach TO the pin, so the clear condition is false for
   them by construction).
9. **Publish does NOT clear the flag.** A follow-pinned project selected
   as an attach target of a new generation is repointed by publish
   (existing behavior, untouched) and keeps its subscription — the next
   pin-move realigns it. Rationale: the flag is project-owned (editor
   permission class); instance-admin provisioning must not silently rewrite
   a project's subscription. `publishReadyRun` is not touched by this plan.
10. **Enabling `follow_pinned` attaches immediately** when a pin is set and
    differs from the current attachment (attach first; set the flag only if
    the attach succeeds). Enable with no pin set, or already on the pin =
    set the flag only. Locked projects are refused (route guard).
11. **Unpin moves nothing.** `pinned = FALSE`, notify — followers keep
    their current attachment (ruling 2).
12. **`pinnedRunId` is Instance T1; `followPinned` is Project T1 config.**
    The instance event broadcasts the bare id UNFILTERED (non-editors
    already see their project's attached run id via
    `getAttachedResultsPackage`; run labels/progress stay
    `can_configure_data`-filtered as today — the filter at
    `server/routes/instance/instance-sse.ts:83` is untouched). "Latest"
    gets no T1 field (derivable). The project side needs no new event
    type: followers receive real `run_attached` events, and `followPinned`
    rides the existing `project_config_updated` event (optional-field
    pattern, like `aiContext`).
13. **Permissions.** Pin/unpin = `can_configure_data` (the catalogue mount
    class). Follow toggle = `can_configure_visualizations` +
    `preventAccessToLockedProjects` (the attach class — subscribing IS
    consenting to future repoints).

## Implementation steps

### 1. Migration

New SQL file in `server/db/migrations/instance/` at the **next free
number** (077 at time of writing — verify, don't assume):

```sql
-- Instance-pinned results package (PLAN_PINNED_PACKAGE): runs.pinned marks
-- the at-most-one package the instance blesses for consumption (partial
-- unique index enforces the cardinality); projects.follow_pinned subscribes
-- a project to physical repoints whenever the pin moves.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_pinned ON runs (pinned) WHERE pinned;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS follow_pinned boolean NOT NULL DEFAULT FALSE;
```

Mirror both columns + the index in `server/db/instance/_main_database.sql`
(the fresh-install base schema — find the `runs` and `projects` CREATE
TABLE blocks). Gate: `./validate_migrations`.

### 2. Types (`lib/types/run_generation.ts`, `lib/types/project_sse.ts`, `lib/types/instance_sse.ts`)

- `RunListingItem` (run_generation.ts:91): add `pinned: boolean`. This one
  field badges every surface — `RunCatalogItem` extends it, and both
  `getAttachedRunForProject` and `listAttachableRunsForProject` return it.
- New route-response type for the pin route:
  `export type PinResultsPackageResult = { repointed: string[]; skippedLocked: string[]; failed: string[] }`
  (project labels, for the admin-facing summary).
- `project_sse.ts`: `ProjectState` gets `followPinned: boolean` (with the
  config fields, line ~26); the `project_config_updated` payload (line 95)
  gets optional `followPinned?: boolean` (same optional-field pattern as
  `aiContext` — only senders that changed it include it).
- `instance_sse.ts`: `InstanceState` gets `pinnedRunId: string | null`;
  add to the `InstanceSseMessage` union:
  `| { type: "pinned_run_updated"; data: { pinnedRunId: string | null } }`.

### 3. DB functions (`server/db/instance/run_generation.ts`)

- `setPinnedRun(mainDb, runId): Promise<APIResponseNoData>` — pin-move as
  ONE statement (can never trip the index or race), ready-gate in the
  UPDATE; zero rows → re-read and return the typed reason. Mirror
  `setProjectAttachedRun` (line ~413) exactly, including its error
  wording pattern:

  ```sql
  UPDATE runs SET pinned = (id = ${runId})
  WHERE (pinned OR id = ${runId}) AND (id != ${runId} OR status = 'ready')
  ```

- `clearPinnedRun(mainDb): Promise<APIResponseNoData>` —
  `UPDATE runs SET pinned = FALSE WHERE pinned`.
- `getPinnedRunId(mainDb): Promise<string | null>` — for
  `build_instance_state.ts` and step 4.
- `listFollowPinnedProjects(mainDb): Promise<{ id: string; label: string; isLocked: boolean }[]>`
  — `WHERE follow_pinned`.
- `setProjectFollowPinned(mainDb, projectId, follow: boolean)` — flag
  write only (orchestration lives in the route, step 6).
- `clearFollowPinnedIfNotPin(mainDb, projectId, attachedRunId)` — one
  statement for ruling 8:
  `UPDATE projects SET follow_pinned = FALSE WHERE id = ${projectId} AND follow_pinned AND NOT EXISTS (SELECT 1 FROM runs WHERE id = ${attachedRunId} AND pinned)`
  — RETURNING so the caller knows whether to notify.
- Every SELECT feeding `toRunListingItem` adds `r.pinned` (three sites:
  the catalogue listing, `getAttachedRunForProject`,
  `listAttachableRunsForProject`); extend `RunListingRow` + the mapper.
- `deleteRunCatalogRow`: add the pinned refusal to the existing guard
  (attached/generating), same reason-reporting shape — err:
  `"This results package is pinned — unpin it before deleting"`.

### 4. Pin orchestration (`server/runs/pin_run.ts`, new file — follow `attach_run.ts`'s header-comment idiom)

`pinRunAndRepointFollowers(mainDb, runId): Promise<APIResponseWithData<PinResultsPackageResult>>`:

1. `setPinnedRun` — on failure, return it.
2. `notifyInstancePinnedRunUpdated(runId)` (step 5) — pin state first, so
   the catalogue updates even if the loop then partially fails.
3. `listFollowPinnedProjects`; partition out `isLocked` →
   `skippedLocked`; skip any follower already attached to `runId`.
4. Per remaining follower: `createWorkerReadConnection(projectId)` →
   `attachRunToProject(mainDb, projectId, projectDb, runId)` →
   `projectDb.end()` in `finally` (connection pattern:
   `generate_run/pipeline.ts:206-213`). Success → `repointed`, failure →
   `failed`; never abort the loop (ruling 5).

`unpinRun(mainDb)` = `clearPinnedRun` + `notifyInstancePinnedRunUpdated(null)`.

In `server/runs/attach_run.ts`, at the end of `attachRunToProject`'s
success path: `clearFollowPinnedIfNotPin`; if it cleared, send
`project_config_updated` with `followPinned: false` (ruling 8; needs the
project's label + isLocked for the payload — read them or extend the
helper the route already uses). Export the new functions from
`server/runs/mod.ts`.

### 5. SSE plumbing

- `server/task_management/notify_instance_updated.ts`:
  `notifyInstancePinnedRunUpdated(pinnedRunId: string | null)` (mirror the
  one-liner wrappers at lines 26-90).
- `server/task_management/build_instance_state.ts`: read `getPinnedRunId`
  into the `starting` payload's `pinnedRunId`.
- `server/task_management/notify_project_v2.ts`:
  `notifyProjectConfigUpdated` (line 26) gains an optional `followPinned`
  param passed through to the payload (mirror how `isCentralReporting` is
  optional; existing callers in `routes/project/project.ts` unchanged).
- `server/task_management/build_project_state.ts`: include `followPinned`
  in the `starting` payload (extend whatever read supplies
  `detail.attachedRunId` with the `follow_pinned` column).
- Client `t1_store` handlers: `client/src/state/instance/t1_store.ts` —
  `pinned_run_updated` → `setInstanceState("pinnedRunId", ...)`;
  `client/src/state/project/t1_store.ts` — `project_config_updated`
  handler applies `followPinned` when present (same conditional pattern
  the handler uses for `aiContext`). Initial-state constants in both
  stores get the new fields (`pinnedRunId: null`, `followPinned: false`).
- SYSTEM_03's notify catalog + the instance-sse filter comment: record
  `pinned_run_updated` as deliberately unfiltered (ruling 12).

### 6. Routes

Instance (`server/routes/instance/run_generation.ts`, same
`can_configure_data` guard as the catalogue mount; register both in
`route-tracker.ts` per PROTOCOL_APP_ROUTES):

- `pinResultsPackage` — params `{ run_id }` → `pinRunAndRepointFollowers`.
- `unpinResultsPackage` — no params → `unpinRun`.

Project (`server/routes/project/results_package.ts`, mirror
`attachResultsPackage`'s guard exactly —
`requireProjectPermission({ preventAccessToLockedProjects: true }, "can_configure_visualizations")`):

- `setProjectFollowPinned` — body `{ follow: boolean }`. Handler
  implements ruling 10: if enabling and `getPinnedRunId` returns a run
  different from the project's current `run_id`, call
  `attachRunToProject` first and bail on its failure; then write the flag
  and `notifyProjectConfigUpdated(..., followPinned)`.

Client `server_actions/` functions for all three (follow the existing
results-package action file's pattern).

### 7. Client UI (read PROTOCOL_APP_UI_CONVENTIONS.md first)

- **Catalogue** (`client/src/components/instance_results_packages/index.tsx`):
  "Pinned" badge on the pinned run's card (`item.pinned`); a derived
  "Latest" badge on the first ready row (client-side, ruling 1 — no new
  data); pin action on ready runs + unpin on the pinned one, with a
  confirm step that states the follower consequence ("N projects follow
  the pinned package and will be updated"); on success surface
  `skippedLocked` / `failed` from the response. Live-read
  `instanceState.pinnedRunId` where the badge needs reactivity beyond the
  listing refetch.
- **Project package tab**
  (`client/src/components/project/project_results_package.tsx`): "Follow
  pinned package" toggle on the attached-package card, live-reading
  `projectState.followPinned`; disabled state + explanatory copy when no
  pin is set (`instanceState.pinnedRunId === null`); "Pinned" badge on
  picker candidate rows (`item.pinned`); picker copy noting that manually
  attaching a non-pinned package turns following off (ruling 8).

Write nothing to T1 from components — mutations go route → notify → SSE →
store (PROTOCOL_APP_STATE).

## Out of scope (this pass)

- **Instance-level MCP surface** — the motivating consumer, built later
  against `getPinnedRunId` through the existing `getSharedToolsForModules`
  run-resolver contract (SYSTEM_08); the 30s MCP context-cache TTL is the
  accepted pin-move propagation latency. Own plan/sizing when picked up.
- Scheduled generation + `autoPinOnSuccess` (ruling 2 keeps the model
  compatible).
- Any fall-back-to-latest behavior; read-time pin indirection (rejected —
  rulings 2/4).
- Wizard changes (`publishReadyRun` untouched — ruling 9).

## Gates

- `deno task typecheck` (includes `lint:systems`)
- `./validate_migrations`
- No query/cache-key surface is touched (ruling 6), so `./validate_queries`
  is not expected to move; run it only if attach-path code was refactored
  beyond the steps above.

## On close

Rulings land in: SYSTEM_08 (pin + follower model, delete guard, publish
non-interaction), SYSTEM_03 (notify catalog entry, unfiltered ruling),
PROTOCOL_APP_STATE (Instance T1 field row + Project T1 config row). Then
delete this file. Tim's in-app verification is not a gate.
