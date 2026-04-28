# Plan: Project State Consolidation (V2 — phased, feature-flagged)

Supersedes `PLAN_PROJECT_STATE.md`. Same end state (project state consolidated into `state/project/t1_*` mirroring the instance pattern) but restructured into many small, independently-revertable phases. At the end of **every** phase the app typechecks, runs, and behaves identically to before — except the phases that intentionally flip behavior (Phase 9).

Relates to:
- `DOC_STATE_MGT_TIERS.md` (tier definitions)
- `DOC_STATE_MGT_INSTANCE.md` (already-built reference pattern)
- `DOC_STATE_MGT_PROJECT.md` (target state — mid-migration banner removed in Phase 12)

## Guiding rules

1. **No phase removes old code.** Old Provider + new store coexist until Phase 10.
2. **No phase changes two layers at once.** Server types, server endpoint, client store, client consumers, and file moves are all separate phases.
3. **Each phase is small, typechecks at the end, and is committed standalone.**
4. **Feature flag, not hard cutover.** A single boolean (`USE_V2_PROJECT_STATE`) picks old vs new at the component-read level, so we can flip back instantly if a flow misbehaves.
5. **Dual-run before cutover.** Phases 5–8 have both systems live simultaneously so we can compare behavior and fall back instantly.
6. **Cache reorg is deferred.** All SSE migration (Phases 1–10) completes before any cache file moves (Phase 11). The old plan interleaved these; V2 does not.

---

## Core constraint

**Zero functional change.** This is a pure restructuring. If a behavior exists today — good, bad, or buggy — it exists identically after the refactor. If a behavior doesn't exist today, we do not add it. The task-running / module-running code is particularly delicate and must not change semantics.

Bug fixes and dead-code cleanup happen in separate commits outside this plan.

---

## Resolved decisions

All six open questions from the original V1 plan have been researched and resolved under the "zero functional change" constraint. Each decision is grounded in how the current code actually behaves.

### 1. `anyModuleLastRun` — **include on `ProjectState`**

Currently defined in `lib/types/project_dirty_states.ts:6`. Used today as a T2 cache version key for slide inputs / reports at `client/src/state/caches/reports.ts:41`, composed with `reportLastUpdated` and `reportItemLastUpdated` via `|`-join. Dropping it would silently break slide-input cache invalidation.

Written on `starting` and on every module transition to "ready" at `provider.tsx:227` (batch) and `provider.tsx:256` (incremental). Server source: `server/task_management/get_project_dirty_states.ts:81-82` reading from `global_last_updated` table.

**Action:** add to `ProjectState` shape. Set in `module_dirty_state` setter. Semantics identical to today.

### 2. `rLogs` — **demote to T5, component-local inside `project_modules.tsx`**

Closer investigation showed `rLogs` is **not** unbounded state — it's a one-line-per-module status ticker:
- Shape `Record<string, { latest: string }>`. Each `r_script` event overwrites `.latest` (`provider.tsx:174-180`). Memory is bounded: one line per module.
- **One consumer**, `project_modules.tsx:485`, rendering inside a `<Match when={moduleDirtyStates[id] === "running"}>` block. When the module finishes, the JSX switches branches and rLogs is never read.
- No version keys, no other subscribers, no persistence, no bearing on anything except that single `<div>`.

This is textbook T5 per `DOC_STATE_MGT_TIERS.md`: ephemeral, component-local, dies on unmount. Its current home in the Provider is historical coupling (the Provider owns the SSE EventSource, so the handler landed beside the state).

**Action:**
- `t1_store.ts` has **one** store — `projectState`. No second store.
- `t1_sse.tsx` gains a listener registry mirroring `addLastUpdatedListener`:
  ```ts
  type RScriptListener = (moduleId: string, text: string) => void;
  const rScriptListeners = new Set<RScriptListener>();
  export function addRScriptListener(fn: RScriptListener): () => void;
  ```
  The `r_script` SSE handler fans out to listeners — it does NOT touch any global store.
- `project_modules.tsx` owns its own `createStore<Record<string, { latest: string }>>({})`, subscribes to `addRScriptListener` in `onMount`, unsubscribes in `onCleanup`. JSX unchanged.
- Wire format (server `r_script` event) unchanged.

**Hardcoded 8-module seed dropped.** `client/src/components/project_runner/utils.ts:21-27`'s `createInitialRLogs()` pre-populates 8 stale module IDs (`m001`–`m008`) with `{ latest: "" }`. Projects using other module IDs already fall through to the JSX's `?? "..."` fallback; seeded modules render `""`. Two different placeholders based on a stale hardcoded list. New code starts with an empty store — everyone gets `"..."` uniformly. Minor visible change for the brief pre-first-event window on legacy modules, and strictly an improvement.

### 3. `modules_updated` payload — **`{ projectModules, metrics, commonIndicators }`**

Current behavior: any module mutation → `notifyProjectUpdated()` → client full-refetches `ProjectDetail` → `projectModules`, `metrics`, AND `commonIndicators` all rebuild server-side (`server/db/project/projects.ts` — `getMetricsWithStatus()` at `server/db/project/modules.ts:975+` for metrics, `projects.ts:188-195` for commonIndicators).

`commonIndicators` is not strictly module-derived (it comes from the `indicators` table), but the current refetch re-queries it on every module change. Omitting it from `modules_updated` would subtly change behavior.

**Action:** `modules_updated` event carries all three fields. `buildProjectState` and the event producer query identically to today's full `ProjectDetail` builder.

### 4. Refetch-await sites — **old Provider stays fully live through Phase 10**

Four current call sites:
- `client/src/components/project/project_decks.tsx:86` — load-bearing `await refetchProjectDetail()` after deck editor closes.
- `client/src/components/project/project_settings.tsx:150` — `refetchProjectDetail` passed as `silentFetch` callback (SelectProjectUserRole).
- `client/src/components/project/project_settings.tsx:162` — `refetchProjectDetail` passed as `silentFetch` callback (BulkEditProjectPermissionsForm).
- `provider.tsx:281` — fire-and-forget inside the `project_updated` handler.

**Action:** Phase 8 migrates read-only consumers (list renders, permission checks, etc.). It does NOT touch `refetchProjectDetail` or its hook. The old Provider + old `project-sse` endpoint + old `notifyProjectUpdated` all remain fully operational and connected throughout Phases 5–9 — the dual-run is truly parallel.

Phase 10 handles `refetchProjectDetail` per call site. For load-bearing sites, we introduce a small `awaitNextProjectStoreUpdate()` primitive wired into the new SSE handler (resolves after the next relevant event is applied). For cosmetic sites, delete the await. See Phase 10 for details.

### 5. User-removed-mid-session navigation — **do NOT add**

Research confirmed: no such logic exists today. Current code has zero `project_users_updated` handlers, zero permission re-evaluation on user list changes, zero navigation triggers. If the current user is removed mid-session they see stale data until they navigate manually.

Adding navigation = new feature = out of scope.

**Action:** `project_users_updated` handler updates `projectUsers` and re-derives `thisUserPermissions` from the list (required to match current "on refetch, re-derive permissions" behavior). No navigation. No guard component. If the current user's email is missing from the list, `thisUserPermissions` will reflect whatever the server sent in the last `starting` — exactly as today.

### 6. `thisUserRole` — **keep with the hardcoding bug intact**

Confirmed dead code: `lib/types/projects.ts:28` defines it; server hardcodes `"viewer"` at `server/db/project/projects.ts:201`; zero client reads.

Deleting it is a change. The refactor preserves everything including dead fields and bugs.

**Action:** include `thisUserRole: "viewer" | "editor" | "admin"` on `ProjectState`. `buildProjectState` sets it to `"viewer"` exactly as today. A separate cleanup commit (outside this plan) can delete it.

---

<!--
══════════════════════════════════════════════════════════════════════════════
   PHASES 0–5 COMPLETE (server-side work done)
   NEXT: Phase 6 (client store + SSE manager)
══════════════════════════════════════════════════════════════════════════════
-->

## Phase 0 — Prep & audits (no code changes) ✅ COMPLETE

**Goal:** know exactly what will be touched before touching anything.

### 0.1 Server notify call-site map

**Done.** 26 call sites across 7 files:

| File | Line | Mutation | Target v2 event |
|------|------|----------|-----------------|
| `project.ts` | 251 | updateProjectConfig | `project_config_updated` |
| `project.ts` | 277 | setModulesDirtyForDataset | `datasets_updated` |
| `modules.ts` | 85 | installModule | `modules_updated` |
| `modules.ts` | 103 | uninstallModule | `modules_updated` |
| `modules.ts` | 146 | updateModuleConfig | `modules_updated` |
| `set_module_clean.ts` | 112 | setModuleClean (after run) | `modules_updated` |
| `presentation_objects.ts` | 74 | createPresentationObject | `visualizations_updated` |
| `presentation_objects.ts` | 103 | updatePresentationObject | `visualizations_updated` |
| `presentation_objects.ts` | 219 | duplicatePresentationObject | `visualizations_updated` |
| `presentation_objects.ts` | 255 | movePresentationObject | `visualizations_updated` |
| `presentation_objects.ts` | 291 | movePresentationObjectToFolder | `visualizations_updated` |
| `presentation_objects.ts` | 314 | deletePresentationObject | `visualizations_updated` |
| `visualization_folders.ts` | 33 | createVisualizationFolder | `visualization_folders_updated` |
| `visualization_folders.ts` | 55 | updateVisualizationFolder | `visualization_folders_updated` |
| `visualization_folders.ts` | 74 | deleteVisualizationFolder | `visualization_folders_updated` |
| `visualization_folders.ts` | 93 | duplicateVisualizationFolder | `visualization_folders_updated` |
| `visualization_folders.ts` | 113 | moveVisualizationFolder | `visualization_folders_updated` |
| `visualization_folders.ts` | 132 | moveVisualizationFolderToFolder | `visualization_folders_updated` |
| `slide_decks.ts` | 64 | createSlideDeck | `slide_decks_updated` |
| `slide_decks.ts` | 94 | updateSlideDeck | `slide_decks_updated` |
| `slide_decks.ts` | 170 | duplicateSlideDeck | `slide_decks_updated` |
| `slide_decks.ts` | 191 | moveSlideDeck | `slide_decks_updated` |
| `slide_decks.ts` | 207 | deleteSlideDeck | `slide_decks_updated` |
| `slide_deck_folders.ts` | 28 | createSlideDeckFolder | `slide_deck_folders_updated` |
| `slide_deck_folders.ts` | 50 | updateSlideDeckFolder | `slide_deck_folders_updated` |
| `slide_deck_folders.ts` | 69 | deleteSlideDeckFolder | `slide_deck_folders_updated` |

### 0.2 Client consumer map

**Done.** Summary by hook:

| Hook | Count | Files |
|------|-------|-------|
| `useProjectDetail` | 14 | project_ai/ (4), project/ (9), project_runner/ (def) |
| `useProjectDirtyStates` | 12 | project/ (2), report/ (4), slide_deck/ (3), root (3) |
| `getGlobalPDSSnapshot` | 1 | state/_infra/reactive_cache.ts:127 |
| `useRefetchProjectDetail` | 2 | project/project_decks.tsx:62, project/project_settings.tsx:80 |
| `useRLogs` | 1 | project/project_modules.tsx:228 |
| `useLastUpdatedListener` | 1 | project_ai/index.tsx:29 |

<details>
<summary>Full list (click to expand)</summary>

**useProjectDetail:**
- `project_ai/ai_tools/DraftSlidePreview.tsx:42`
- `project_ai/ai_tools/DraftVisualizationPreview.tsx:47`
- `project_ai/chat_pane.tsx:33`
- `project_ai/index.tsx:28`
- `project/index.tsx:104`
- `project/project_cache.tsx:8`
- `project/project_data.tsx:30`
- `project/project_decks.tsx:61`
- `project/project_metrics.tsx:40`
- `project/project_modules.tsx:48`
- `project/project_reports.tsx:49`
- `project/project_settings.tsx:79`
- `project/project_visualizations.tsx:28`

**useProjectDirtyStates:**
- `PresentationObjectMiniDisplay.tsx:18,72`
- `ReportItemMiniDisplay.tsx:24`
- `project/index.tsx:119`
- `project/project_modules.tsx:227`
- `report/index.tsx:83`
- `report/report_item.tsx:59,152`
- `report/select_presentation_object.tsx:32,151`
- `slide_deck/index.tsx:37`
- `slide_deck/slide_card.tsx:26`
- `slide_deck/slide_deck_thumbnail.tsx:18`

</details>

### 0.3 Resolve open questions
Done — see "Resolved decisions" above. No remaining open questions.

**Verification:** none (no code). Commit the doc updates.

---

## Phase 1 — Shared types (additive) ✅ COMPLETE

**Goal:** types exist; nothing imports them.

- Create `lib/types/project_sse.ts` exporting `ProjectState` and `ProjectSseMessage`.
- Do NOT mark existing `ProjectSseUpdateMessage` or `ProjectDirtyStates` as deprecated yet — leave them fully alive.
- `ProjectState` includes (per decisions above): all current `ProjectDetail` fields including `thisUserRole` (kept with bug intact), all current `ProjectDirtyStates` fields **including `anyModuleLastRun`**, `thisUserPermissions`. Does NOT include `rLogs` — that lives in its own store. Does NOT include `aiContext` — stays T3.
- `modules_updated` message carries `{ projectModules, metrics, commonIndicators }`.
- No `navigate_away` / `user_removed` event — current code has no such behavior.

**Verification:** `deno task typecheck` passes. No runtime change.

**Completed:**
- `lib/types/project_sse.ts` created with `ProjectState` and `ProjectSseMessage` types
- Exported from `lib/types/mod.ts`

---

## Phase 2 — Server state builder (additive, not wired) ✅ COMPLETE

**Goal:** a single pure function that returns a complete `ProjectState` for a projectId.

- Create `server/task_management/build_project_state.ts` exporting `buildProjectState(projectId): Promise<ProjectState>`.
- Internally it may call (or duplicate queries from) the existing `getProjectDetail` DB function and `get_project_dirty_states.ts`. **Does not modify or delete either.**
- No route uses it yet.

**Verification:** typecheck. Optional: call it once from a throwaway script or test route to confirm the shape.

**Completed:**
- `server/task_management/build_project_state.ts` created
- Signature: `buildProjectState(mainDb, ppk, projectUser)` — takes `mainDb` as separate param since `ProjectPk` doesn't include it
- Calls existing `getProjectDetail()` and `getProjectDirtyStates()` in parallel, merges results

---

## Phase 3 — Server notify functions (additive, not called) ✅ COMPLETE

**Goal:** granular notifier functions exist; no call site invokes them.

- Create `server/task_management/notify_project_updated.ts`.
- Exports: `notifyProjectV2(projectId, message: ProjectSseMessage)` + per-event wrappers (`notifyProjectVisualizationsUpdated`, `notifyProjectModulesUpdated`, `notifyProjectConfigUpdated`, etc.).
- Posts to a **new** `BroadcastChannel("project_updates_v2")` — distinct from the existing channel — so nothing can cross-pollute.

**Verification:** typecheck.

**Completed:**
- Created as `server/task_management/notify_project_v2.ts` (slightly different filename)
- Exports `notifyProjectV2` core function + 12 per-event wrappers
- Uses `BroadcastChannel("project_updates_v2")` — no subscribers yet

---

## Phase 4 — Server SSE endpoint V2 (additive) ✅ COMPLETE

**Goal:** a new SSE route serves `ProjectSseMessage` from `build_project_state.ts`. Old route untouched.

- Add `server/routes/project/project-sse-v2.ts` (route path e.g. `/project/:id/sse-v2`).
- ~~Registered in `route-tracker.ts`.~~ (SSE routes are not tracked — existing v1 SSE route isn't either)
- Implements subscribe-before-build ordering: subscribe to v2 broadcast channel (queue), `buildProjectState()`, send `starting`, drain queue, forward.
- Error handling: on build failure send `{ type: "error" }` and close.

**Verification:** typecheck. Manual curl smoke test: connect to v2 endpoint for a real project, confirm `starting` arrives with a well-formed payload. No client change.

**Completed:**
- `server/routes/project/project-sse-v2.ts` created
- Route path: `/project_sse_v2/:project_id`
- Registered in `main.ts` (not route-tracker — SSE endpoints aren't tracked there)
- Subscribe-before-build ordering implemented with message queue
- Gets project user via Clerk auth for `thisUserPermissions`
- Message ordering guaranteed: event handler queues, single loop drains with await, resolver pattern (no polling) wakes loop when messages arrive
- No client connects yet — old endpoint still in use

---

## Phase 5 — Dual-notify (server fires both old and new) ✅ COMPLETE

**Goal:** every mutation that currently notifies also notifies v2. Old UI continues to drive off the old channel; v2 channel has no subscribers yet.

- Walk the call-site map from 0.1. At each site, add a parallel call to the matching granular v2 notifier. Old `notifyProjectUpdated()` calls stay.
- Each call site must already have the data it needs (verified in 0.1). If a site requires a DB reload to build the payload, do that reload locally at the call site — do NOT refactor the mutation.

**Verification:** typecheck. Run app. Exercise normal flows (edit viz, run module, add user). Everything behaves identically — new channel is firing into the void. Optional: temporarily log v2 messages to confirm they emit.

**Completed:**

Files updated with dual-notify pattern (v1 `notifyProjectUpdated` + v2 granular notifier):

| File | Routes | V2 notifier |
|------|--------|-------------|
| `visualization_folders.ts` | 6 routes (create, update, delete, reorder, updatePresentationObjectFolder, reorderPresentationObjects) | `notifyProjectVisualizationFoldersUpdated`, `notifyProjectVisualizationsUpdated` |
| `slide_deck_folders.ts` | 3 routes (create, update, delete) | `notifyProjectSlideDeckFoldersUpdated` |
| `slide_decks.ts` | 5 routes (create, updateLabel, move, duplicate, delete) | `notifyProjectSlideDecksUpdated` |
| `presentation_objects.ts` | 6 routes (create, duplicate, updateLabel, updateConfig, batchUpdatePeriodFilter, delete) | `notifyProjectVisualizationsUpdated` |
| `modules.ts` | 3 routes (install, uninstall, updateDefinition) | `notifyProjectModulesUpdated` |
| `project.ts` | 2 routes (addDataset, removeDataset) | `notifyProjectDatasetsUpdated` |
| `set_module_clean.ts` | 1 site (task completion callback) | `notifyProjectModulesUpdated` |

Helper function added:
- `getAllDatasetsForProject` in `server/db/project/projects.ts` — returns `DatasetInProject[]` for dataset mutations

Notes:
- `set_module_clean.ts` is in `server/task_management/`, not `server/routes/project/` — it's a BroadcastChannel listener for task completion, not a route
- Phase 0 audit listed `project.ts:251 updateProjectConfig → project_config_updated`, but those routes (`updateProject`, `setProjectLockStatus`) call `notifyInstanceProjectsLastUpdated` (instance-level), not `notifyProjectUpdated` — audit was wrong, no v2 notifier needed there
- `getMetricsWithStatus` used instead of `getAllMetrics` for modules notifier (correct type)

---

## Phase 6 — Client store + SSE manager (dead code)

**Goal:** the new client files exist and typecheck; nothing imports them yet.

### 6.1 `client/src/state/project/t1_store.ts`

- **Single** `createStore<ProjectState>(EMPTY_PROJECT_STATE)`. No rLogs carve-out — rLogs is T5 (Phase 8.4).
- Private setter functions, one per SSE event type (except `r_script`, which is handled in `t1_sse.tsx` as a listener fan-out, not a store write).
- Non-reactive getters: `getProjectStateSnapshot`, `getProjectId`, `getModuleIdForMetric`, `getModuleIdForResultsObject`, `getFormatAsForMetric`, etc.
- Private derived module-lookup maps, recomputed inside `starting` and `modules_updated` setters.
- `resetProjectState()`.

### 6.2 `client/src/state/project/t1_sse.tsx`

- `connectProjectSSE(projectId)` / `disconnectProjectSSE()`.
- Points at the v2 endpoint.
- EventSource lifecycle, retry/backoff, reconnect-within-same-project semantics (do not reset `isReady`), permanent-failure error flag.
- `addLastUpdatedListener` set + `fireLastUpdatedListeners` (for `last_updated` events).
- `addRScriptListener` set + `fireRScriptListeners` (for `r_script` events). Fan-out only; no store writes. Consumers are responsible for their own state (see Phase 8.4).
- `ProjectSSEBoundary` component: `onMount` connect, `onCleanup` disconnect, gates children on `projectState.isReady`.
- `project_users_updated` handler updates `projectUsers` and re-derives `thisUserPermissions` from the list. **No navigation, no guard.** Matches current behavior (which has neither).
- `disconnectProjectSSE()` clears both listener sets (clean slate per project).

**Verification:** typecheck. New files are unreferenced.

---

## Phase 7 — Feature flag & parallel mount

**Goal:** both old Provider and new Boundary run simultaneously behind a flag. Zero consumer reads from the new store yet.

- Add `client/src/state/project/_v2_flag.ts` exporting `const USE_V2_PROJECT_STATE = false`.
- In `components/project/index.tsx`, when the flag is `true`, mount `<ProjectSSEBoundary>` **in addition to** the existing Provider (wrapping children, or alongside — whichever composes cleanly).
- When flag is `false`, structure is identical to today.

**Verification:** typecheck with flag `false` (shipped). Flip flag to `true` locally: confirm both EventSources open, both stores populate, no console errors. Flip back to `false`, commit.

---

## Phase 8 — Migrate consumers, one slice at a time

**Goal:** when the flag is `true`, components read from the new store. When `false`, they read from the old Provider. Achieved via a shim layer.

### 8.0 Shim layer — read-only hooks ONLY

Modify only the **read** hooks (`useProjectDetail`, `useProjectDirtyStates`, `getGlobalPDSSnapshot`, `useLastUpdatedListener`, `useRLogs`) to internally branch on `USE_V2_PROJECT_STATE`:

- Flag off → return old values (current behavior).
- Flag on → return equivalent values read from the new stores in `t1_store.ts` / listeners in `t1_sse.tsx`.

**Do NOT shim `refetchProjectDetail` / `useRefetchProjectDetail`.** It continues to call the old Provider's refetch under both flag states. The old Provider, old `project-sse` endpoint, and old `notifyProjectUpdated` remain fully live throughout Phases 5–9.

Consumers don't change in 8.0. Typecheck. Flip flag locally, exercise app broadly, confirm nothing obviously broken. Flip back, commit.

### Sub-phases (smallest blast radius first)
Each sub-phase: migrate the listed component(s) off the shim'd hooks onto direct imports from `~/state/project/t1_store` / `~/state/project/t1_sse`. Flag stays off in main. After each sub-phase: typecheck + locally flip flag on and exercise *only that area*.

- **8.1** Project settings tab
- **8.2** Project users tab
- **8.3** Datasets tab
- **8.4** Modules tab — migrates the dirty-states / last-run / module-list reads onto the new store. **`useRLogs` is NOT touched in this sub-phase.** rLogs continues to be served by the old Provider's store, and `project_modules.tsx` keeps importing `useRLogs` from the old `project_runner/` hooks. The reason: `addRScriptListener` only fires from the new v2 SSE connection, which is conditionally mounted under the flag — under flag-off (default in main), migrating rLogs early would break the running-module ticker. The rLogs demotion happens in Phase 10.
- **8.5** Visualizations tab
- **8.6** Reports tab
- **8.7** Slide decks tab
- **8.8** Cross-cutting:
  - `client/src/state/_infra/reactive_cache.ts` — swap `getGlobalPDSSnapshot` import source (behind flag via the shim, or directly if all consumers are migrated).
  - T2 cache files that import from `global_module_maps.ts` — swap to `getModuleIdForMetric` etc. from `t1_store.ts`.
  - `project_ai/index.tsx` — swap `addLastUpdatedListener` source.

**Verification (each sub-phase):** typecheck + manual test *of that tab only* with flag on, then flag off for commit.

---

## Phase 9 — Flip the flag

**Goal:** production runs on the new system. Old system still present.

- Change `USE_V2_PROJECT_STATE = true`. Single-line diff.
- Ship to staging. Exercise every project flow: open/switch projects, run modules, edit viz, generate reports, add/remove users, reconnect after network drop, multi-tab sync.
- If any regression → flip back to `false` in one commit. Diagnose, fix, re-flip.

**Verification:** full manual smoke. Once stable in staging → merge and ship.

---

## Phase 10 — Remove old system

**Goal:** delete all old project-state code and the flag. Broken into substeps; the `refetchProjectDetail` migration is its own substep because it's the only place in Phase 10 that requires real thought.

### 10.1 Migrate `refetchProjectDetail` call sites

Before deleting the old Provider, each of the four call sites needs a replacement under the new store:

- **`project_decks.tsx:86` (load-bearing `await`)** — introduce a small `awaitNextProjectStoreUpdate(predicate)` primitive in `t1_sse.tsx`. It returns a Promise that resolves the next time an SSE message matching the predicate is applied to the store (e.g. next `slide_decks_updated`). Replace the `await refetchProjectDetail()` with `await awaitNextProjectStoreUpdate(m => m.type === "slide_decks_updated")` — or whichever event the deck editor mutation triggers. The await still gates UI update on fresh server state; mechanism differs.
- **`project_settings.tsx:150` (cosmetic `silentFetch` callback)** — delete the callback; the child form (SelectProjectUserRole) will observe store updates reactively via SSE.
- **`project_settings.tsx:162` (cosmetic `silentFetch` callback)** — delete the callback; the child form (BulkEditProjectPermissionsForm) will observe store updates reactively via SSE.
- **`provider.tsx:281` (inside the old Provider)** — disappears with the Provider itself.

Typecheck. Manually test deck editor round-trip and settings role change.

### 10.2 Demote rLogs to T5 (component-local)

Rewrite the rLogs consumer in `client/src/components/project/project_modules.tsx`:

- Delete the `useRLogs` import.
- Add a component-local `createStore<Record<string, { latest: string }>>({})` at the top of `InstalledModulePresentation` (or wherever the subscription should live — pick the narrowest scope that still covers the JSX read site).
- In `onMount`, subscribe via `addRScriptListener((moduleId, text) => setRLogs(moduleId, "latest", text))`. Unsubscribe in `onCleanup`.
- Existing JSX at `project_modules.tsx:485` is unchanged (still reads `rLogs[id]?.latest ?? "..."`).
- No seed. `createInitialRLogs()` is no longer used.

Because Phase 9 already flipped the flag, the new v2 SSE connection is the only one live by the time this runs. No flag gating needed.

Small visible change: modules whose IDs were in the stale hardcoded seed list (`m001`–`m008`) will now render `"..."` instead of `""` during the brief pre-first-event window after they start running. All other modules behave identically.

### 10.3 Delete the shim branching

`useProjectDetail`, `useProjectDirtyStates`, `getGlobalPDSSnapshot`, `useLastUpdatedListener` become thin re-exports from the new store (or delete the hook files entirely and migrate the final readers to direct imports). `useRLogs` and `createInitialRLogs` are deleted outright — no replacement, no shim — because 10.2 already migrated the sole consumer.

### 10.4 Delete old client code

Delete `client/src/components/project_runner/` (`provider.tsx`, `context.tsx`, `hooks.tsx`, `global_pds.ts`, `global_module_maps.ts`, `utils.ts`, `types.ts`, `mod.ts`).

### 10.5 Delete old server code

Delete old `project-sse.ts` route, old `getProjectDetail` DB function (if `build_project_state.ts` fully replaces it — else leave it for now), `get_project_dirty_states.ts`, old `notifyProjectUpdated`, old `BroadcastChannel` name. Delete deprecated types `ProjectSseUpdateMessage`, `ProjectDirtyStates`.

### 10.6 Rename v2 → canonical

`project-sse-v2.ts` → `project-sse.ts`, `BroadcastChannel("project_updates_v2")` → `"project_updates"`, `notifyProjectV2` → `notifyProjectUpdate`. Delete `_v2_flag.ts`.

**Verification:** typecheck. No file under `components/project_runner/` remains. Full manual smoke (all project tabs, module run, deck editor round-trip, reconnect). Commit.

---

## Phase 11 — Cache reorg (the old Step E, deferred)

**Goal:** consolidate project caches into `state/project/t2_*.ts` / `t4_*.ts`. Pure mechanical file moves — one file/commit at a time.

Each sub-phase: move or merge, update all import sites, typecheck, commit.

- **11.1** `img_cache.ts` → `state/project/t2_images.ts`
- **11.2** `ai_documents.ts` → `state/project/t4_ai_documents.ts`
- **11.3** `ai_interpretations.ts` → `state/project/t4_ai_interpretations.ts`
- **11.4** `long_form_editor.ts` → `state/project/t4_long_form_editor.ts`
- **11.5** Merge `caches/visualizations.ts` (PO detail / items / metric info) + `po_cache.ts` → `state/project/t2_presentation_objects.ts`
- **11.6** Merge `caches/visualizations.ts` (replicant options) + `replicant_options_cache.ts` → `state/project/t2_replicant_options.ts`
- **11.7** Merge `caches/reports.ts` + `ri_cache.ts` → `state/project/t2_reports.ts`
- **11.8** `caches/slides.ts` → `state/project/t2_slides.ts`

**Merge check after each merge:** the resulting `t2_` file defines its own cache instances AND its access functions. No cache instance is exported across files.

---

## Phase 12 — Cleanup & docs

- Delete empty `client/src/state/caches/` directory.
- Confirm `client/src/state/` root contains only: `_infra/`, `instance/`, `project/`, `clear_caches.ts`, `t4_connection_monitor.ts`, `t4_ui.ts`.
- Update `DOC_STATE_MGT_PROJECT.md`: remove the "target, not yet built" banner; file paths in the doc are now real.
- Verify `DOC_STATE_MGT_TIERS.md` directory structure block still matches reality.
- Delete `PLAN_PROJECT_STATE.md` (V1) and this V2 plan.

---

## Risk summary by phase

| Phase | Surface | Risk | Revert cost |
|---|---|---|---|
| 0 | Docs/audits | None | Free |
| 1 | New types file | None | Delete file |
| 2 | New server file | None | Delete file |
| 3 | New notify file, new BroadcastChannel | None (unsubscribed) | Delete file |
| 4 | New SSE route | None (no client) | Delete route |
| 5 | Mutation routes | Low — additive call | Revert the dual-notify commit |
| 6 | New client files | None (unreferenced) | Delete files |
| 7 | `project/index.tsx` mount + flag file | Low (flag off) | Revert one commit |
| 8.x | Per-tab migration behind flag | Low per slice | Revert one sub-phase |
| 9 | Flag flip | Medium — real cutover | Flip flag back (one line) |
| 10 | Deletions | Medium — no going back | Requires git revert |
| 11.x | File moves | Low per move | Revert one sub-phase |
| 12 | Doc edits | None | Free |

Phase 9 is the only hard cutover, and its blast radius is one constant.
