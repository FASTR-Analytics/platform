# Plan: Project State Consolidation

Single plan covering all remaining work to bring project-level state in line with the architecture described in `DOC_STATE_MGT_PROJECT.md` and `DOC_STATE_MGT_TIERS.md`. Supersedes `PLAN_SSE_STATE_MANAGEMENT.md` and `PLAN_CLIENT_STATE_RESTRUCTURE.md` (both deleted; design rationale folded in here).

## Status

**Already done** (history in git):
- **SSE Phase 1 — Instance SSE.** Server endpoint, `BroadcastChannel`, notify functions, mutation-route notifications, client store + boundary. Old `getInstanceDetail` pull system removed.
- **Restructure Reorg Step 1.** All instance state moved into `client/src/state/instance/`; cache infra into `state/_infra/`; `connection-monitor` into `state/`; `ui.ts` → `t4_ui.ts`; `clear_data_cache.ts` → `clear_caches.ts`; `instance_data_caches.ts` split into `t2_indicators.ts` + `t2_structure.ts`; `caches/_archived/` deleted. Typecheck green.

**Remaining work** (this plan):
- **Step A** — Server: project SSE types + notify functions + endpoint update.
- **Step B** — Client: build new project store + boundary alongside old Provider.
- **Step C** — Migrate components off Provider hooks to direct store imports. Migrate `addLastUpdatedListener`.
- **Step D** — Delete `components/project_runner/`.
- **Step E** — Reorg Step 2: merge project caches into `state/project/t2_*.ts`; move T4 files.
- **Step F** — Reorg Step 3: delete empty `caches/` dir; finalize docs.

Steps A–D are SSE Phase 2. Steps E–F are the project-cache restructure that was blocked on Phase 2.

---

## Why

The current project state system has avoidable inconsistencies relative to instance state:

| Aspect | Current project | Target (matches instance) |
|---|---|---|
| State container | Context/Provider (`project_runner/context.tsx`) | Global `createStore` at module level |
| Data delivery | SSE sends timestamps; `ProjectDetail` fetched separately via `timQuery` | SSE carries actual data for all events |
| Stores | Two: `projectDetail` (timQuery) + `projectDirtyStates` (SSE store) | One unified `ProjectState` |
| On mutation | `notifyProjectUpdated()` signal → client `refetchProjectDetail()` HTTP round-trip | Server pushes the changed data slice directly |
| Non-reactive access | `getGlobalPDSSnapshot()` in a separate file | Getters in the store file |
| Scattered files | `provider.tsx`, `context.tsx`, `hooks.tsx`, `global_pds.ts`, `global_module_maps.ts`, `utils.ts` | `state/project/t1_store.ts` + `t1_sse.tsx` |

Per-entity `lastUpdated` timestamps stay (project T2 caches need per-entity versioning; this is a real difference from instance state).

---

## Design

### `ProjectState` shape

Merge `ProjectDetail` (`lib/types/projects.ts`) and `ProjectDirtyStates` (`lib/types/project_dirty_states.ts`) into one type:

```typescript
type ProjectState = {
  isReady: boolean;

  // From current ProjectDetail (shared data)
  id: string;
  label: string;
  isLocked: boolean;
  projectDatasets: DatasetInProject[];
  projectModules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  commonIndicators: { id: string; label: string }[];
  visualizations: PresentationObjectSummary[];
  visualizationFolders: VisualizationFolder[];
  reports: ReportSummary[];
  slideDecks: SlideDeckSummary[];
  slideDeckFolders: SlideDeckFolder[];
  projectUsers: ProjectUser[];

  // From current ProjectDirtyStates
  anyRunning: boolean;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
  moduleLastRun: Record<string, string>;
  moduleLastRunGitRef: Record<string, string>;
  lastUpdated: Record<LastUpdateTableName, Record<string, string>>;

  // R logs (currently a separate store inside provider.tsx)
  rLogs: Record<string, { latest: string }>;

  // Per-user, populated per-connection in `starting`,
  // re-derived client-side on `project_users_updated`
  thisUserPermissions: ProjectUserPermissions;
};
```

**Excluded — `aiContext`.** Unbounded user content (paste-large-documents). Stays T3, fetched on AI panel open.

**Excluded — `thisUserRole`.** Dead code: no client reads it; access control uses the granular `thisUserPermissions` booleans. The server also has a pre-existing bug hardcoding it to `"viewer"` (`server/db/project/projects.ts:190`) — drop it instead of fixing dead code.

### `ProjectSseMessage` union

Replace the current 6-message `ProjectSseUpdateMessage` with granular events that carry data:

```typescript
type ProjectSseMessage =
  | { type: "starting"; data: ProjectState }
  // Module execution (already granular today — keep)
  | { type: "any_running"; data: { anyRunning: boolean } }
  | { type: "r_script"; data: { moduleId: string; text: string } }
  | { type: "module_dirty_state"; data: { ids: string[]; dirtyOrRunStatus: DirtyOrRunStatus; lastRun?: string; lastRunGitRef?: string } }
  // Data updates (replace current "project_updated" catch-all)
  | { type: "project_config_updated"; data: { label: string; isLocked: boolean } }
  | { type: "modules_updated"; data: InstalledModuleSummary[] }
  | { type: "visualizations_updated"; data: PresentationObjectSummary[] }
  | { type: "visualization_folders_updated"; data: VisualizationFolder[] }
  | { type: "reports_updated"; data: ReportSummary[] }
  | { type: "slide_decks_updated"; data: SlideDeckSummary[] }
  | { type: "slide_deck_folders_updated"; data: SlideDeckFolder[] }
  | { type: "datasets_updated"; data: DatasetInProject[] }
  | { type: "project_users_updated"; data: ProjectUser[] }
  // Per-entity timestamps (kept — project caches use per-entity versioning)
  | { type: "last_updated"; data: { tableName: LastUpdateTableName; ids: string[]; lastUpdated: string } }
  | { type: "error"; data: { message: string } };
```

### Reset on project switch

Instance state is a session-singleton. Project state must be **fully reset** when the user switches projects, otherwise stale data from Project A could briefly leak into Project B (the current Provider gets this for free via unmount; a global store does not).

```typescript
const EMPTY_PROJECT_STATE: ProjectState = { isReady: false, /* ... */ };

export function resetProjectState(): void {
  setProjectState(reconcile(EMPTY_PROJECT_STATE));
}
```

`disconnectProjectSSE()` calls `resetProjectState()` and clears listeners. Reset semantics:
- **Reconnect within same project:** `isReady` NOT reset — stale data stays visible during reconnect.
- **Permanent failure** (max retries): set error flag; boundary shows error state.
- **Project switch:** `isReady` IS reset.

### Per-user data is not broadcast

`thisUserPermissions` is per-connection. Server populates it in the `starting` message. On `project_users_updated`, the client re-derives by finding its own email in the updated `ProjectUser[]` (`ProjectUser` already carries all `ProjectUserPermissions` fields). If the current user's email isn't in the list, they've been removed — navigate back to instance view. SSE stays a dumb pipe (no per-connection filtering on the broadcast path).

### Subscribe-before-build (race fix)

Both project SSE today and instance SSE pre-fix had the same race: build initial state → subscribe → forward, leaving a window where mutations broadcast during the build are dropped. Phase 1 fixed this for instance; Step A fixes it for project.

Order:
1. Subscribe to `BroadcastChannel("dirty_states")` first, queuing messages.
2. Build full `ProjectState` from DB (wrapped in try/catch — on failure send `{ type: "error" }` and close).
3. Send `starting` with full state.
4. Drain queued messages.
5. Forward subsequent messages.

### Derived module-lookup maps

`global_module_maps.ts` is **deleted**. Its three derived tables (`metricToModule`, `resultsObjectToModule`, `metricToFormatAs`) move into `state/project/t1_store.ts` as private module-level variables, recomputed internally whenever `starting` or `modules_updated` updates `projectModules`/`metrics`. Exported via getters (`getModuleIdForMetric()`, `getModuleIdForResultsObject()`, `getFormatAsForMetric()`). Reset naturally via `resetProjectState()`.

### `addLastUpdatedListener`

The current Provider manages a `Set<LastUpdatedListener>`. Primary consumer is `project_ai/index.tsx`, which subscribes to `slides`, `presentation_objects`, `slide_decks`, `reports` table changes to feed AI context. Move this set into `state/project/t1_sse.tsx`:

```typescript
type LastUpdatedListener = (tableName: LastUpdateTableName, ids: string[], timestamp: string) => void;

const listeners = new Set<LastUpdatedListener>();

export function addLastUpdatedListener(listener: LastUpdatedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Fired when a "last_updated" SSE event arrives:
function fireLastUpdatedListeners(tableName, ids, timestamp) {
  for (const l of listeners) l(tableName, ids, timestamp);
}
```

Cleared in `disconnectProjectSSE()` (clean slate per project).

---

## Execution sequence

### Step A — Server (project SSE backend)

1. **Types:** create `lib/types/project_sse.ts` with `ProjectState` and `ProjectSseMessage`. Mark old `ProjectSseUpdateMessage` and `ProjectDirtyStates` as deprecated (don't remove — Phase 2 proceeds alongside the old system).
2. **Notify functions:** create `server/task_management/notify_project_updated.ts` with `notifyProjectUpdate(projectId, message)` core + per-event convenience wrappers (`notifyProjectVisualizationsUpdated`, `notifyProjectModulesUpdated`, etc.).
3. **SSE endpoint:** update `server/routes/project/project-sse.ts` with subscribe-before-build ordering. Build full `ProjectState` (refactor `get_project_dirty_states.ts` + the `getProjectDetail` DB function into a single builder). Forward granular messages.
4. **Mutation routes:** replace `notifyProjectUpdated()` calls with the appropriate granular notifier. Each call site must already have the data — this is mechanical, not a refactor.

**Verification:** server typecheck. Manual smoke test: connect to SSE endpoint with curl, mutate via API, observe granular events.

### Step B — Client store + boundary (built alongside old Provider)

1. Create `client/src/state/project/t1_store.ts`:
   - `createStore<ProjectState>(EMPTY_PROJECT_STATE)`
   - Setter functions per event type (called only by SSE handler)
   - Non-reactive getters: `getProjectId()`, `getProjectStateSnapshot()`, etc.
   - Private derived maps + getters (`getModuleIdForMetric`, etc.)
   - `resetProjectState()`

2. Create `client/src/state/project/t1_sse.tsx`:
   - `connectProjectSSE(projectId)` / `disconnectProjectSSE()`
   - EventSource management, message routing, retry/backoff
   - `addLastUpdatedListener` set + `fireLastUpdatedListeners`
   - `ProjectSSEBoundary` component (mount/cleanup + `Show when={projectState.isReady}`)

The old `project_runner/` Provider stays untouched in this step. Both systems run side-by-side. New code is dead until Step C wires it up.

**Verification:** client typecheck.

### Step C — Migrate components

1. Wrap project entry point with `<ProjectSSEBoundary>` (replacing the existing Provider) at `client/src/components/project/index.tsx`.
2. Replace context hook usages everywhere:
   - `useProjectDetail()` → `import { projectState } from "~/state/project/t1_store"`
   - `useProjectDirtyStates()` → same store, different fields
   - `getGlobalPDSSnapshot()` → `getProjectStateSnapshot()` or specific getters
   - `useLastUpdatedListener()` → `addLastUpdatedListener` from `~/state/project/t1_sse`
3. Remove `silentRefreshInstance` / `refetchProjectDetail` calls — SSE handles propagation.
4. Update T2 cache files (`po_cache.ts`, `ri_cache.ts`, etc.) to import derived maps from `t1_store.ts` instead of `global_module_maps.ts`. (These caches will move in Step E; for now just update the import.)

**Verification:** client typecheck + manual run-through of every project tab.

### Step D — Delete old project_runner

Once Step C is solid:

1. Delete `client/src/components/project_runner/{provider.tsx,context.tsx,hooks.tsx,global_pds.ts,global_module_maps.ts,utils.ts,types.ts,mod.ts}`.
2. Delete the entire `components/project_runner/` directory.
3. Update `client/src/state/_infra/reactive_cache.ts` — it currently imports `getGlobalPDSSnapshot` from `~/components/project_runner/mod`. Change to import from `~/state/project/t1_store` (`getProjectStateSnapshot()`).

**Verification:** typecheck. No file in `components/project_runner/` should remain.

### Step E — Reorg Step 2 (project caches into `state/project/`)

Now project files have stable import targets. Merge cache instances with their access functions:

| Action | Old | New |
|---|---|---|
| Merge | `caches/visualizations.ts` (`_PO_DETAIL_CACHE`, `_PO_ITEMS_CACHE`, `_METRIC_INFO_CACHE`) + `po_cache.ts` (access functions) | `state/project/t2_presentation_objects.ts` |
| Merge | `caches/visualizations.ts` (`_REPLICANT_OPTIONS_CACHE`) + `replicant_options_cache.ts` | `state/project/t2_replicant_options.ts` |
| Merge | `caches/reports.ts` (`_REPORT_DETAIL_CACHE`, `_REPORT_ITEM_CACHE`, `_SLIDE_INPUTS_CACHE`) + `ri_cache.ts` | `state/project/t2_reports.ts` |
| Move | `caches/slides.ts` | `state/project/t2_slides.ts` |
| Move | `img_cache.ts` | `state/project/t2_images.ts` |
| Move | `ai_documents.ts` | `state/project/t4_ai_documents.ts` |
| Move | `ai_interpretations.ts` | `state/project/t4_ai_interpretations.ts` |
| Move | `long_form_editor.ts` | `state/project/t4_long_form_editor.ts` |

**Merge check:** after merging, every `t2_` file is self-contained. No cache instance is exported to another file. No more split between "here's the cache" and "here's how to use it".

Update all import sites across the codebase (mechanical find-replace, similar to Reorg Step 1).

**Verification:** typecheck.

### Step F — Reorg Step 3 (cleanup)

1. Delete empty `client/src/state/caches/` directory.
2. Confirm `client/src/state/` root contains only: `_infra/`, `instance/`, `project/`, `clear_caches.ts`, `t4_connection_monitor.ts`, `t4_ui.ts`.
3. Update `DOC_STATE_MGT_PROJECT.md` — remove the "target, not yet built" status banner; the file paths in the doc are now real.
4. Update `DOC_STATE_MGT_TIERS.md` — directory structure block already shows the end state; verify it matches.

---

## Risk and verification

- **Step A** is server-only and additive — low risk.
- **Step B** is client-only and additive (dead code until Step C) — low risk.
- **Step C** is the cutover. Highest-risk step. Project SSE is load-bearing for module execution, dirty states, R logs. Recommendation: migrate one tab at a time (Visualizations → Reports → Decks → Modules → Data → Settings), typecheck and smoke-test after each.
- **Step D** is pure deletion — relies on Step C being complete.
- **Step E** is mechanical file moves with import-site updates — same shape as Reorg Step 1. Low risk.
- **Step F** is cleanup + doc edits — trivial.

Each step ends with `deno task typecheck` (server + client) passing. Steps C and onward also need a manual run-through of project flows: open a project, run a module, edit a viz, generate a report, switch projects, observe SSE behavior.

---

## Resolved questions (apply throughout)

1. **Per-user data path.** SSE broadcasts shared data only. `thisUserPermissions` is set per-connection in `starting`, re-derived client-side from `project_users_updated`. No per-connection filtering in the broadcast forwarder.
2. **`thisUserRole`** is dropped (dead code; no consumers; server has a hardcoding bug).
3. **`aiContext`** stays T3 (unbounded user content; fetch on AI panel open).
4. **SSE connection lifecycle.** Project SSE connects on project entry, disconnects on project exit (mirrors current Provider lifecycle).
5. **Error recovery.** On reconnect within the same project, the fresh `starting` message overwrites the store via `reconcile()`. Missed events during the gap are irrelevant.
6. **Subscribe-before-build** in the SSE endpoint to prevent the dropped-message race.
