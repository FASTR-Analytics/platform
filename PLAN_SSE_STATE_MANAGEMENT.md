# SSE State Management Plan

## Background

### The problem

FASTR's client-side state management has two levels: **instance** (shared across all projects - users, indicators, structure, datasets, config, assets) and **project** (scoped to a single project - modules, visualizations, reports, dirty states).

**Project-level** already has a push-based SSE system that works well. A single SSE connection per project pushes real-time updates (module execution status, dirty states, timestamps) to all connected clients. This is implemented in:
- Server: `server/routes/project/project-sse.ts` (SSE endpoint using Hono's `streamSSE`)
- Server: `server/task_management/notify_last_updated.ts` (BroadcastChannel-based pub/sub)
- Client: `client/src/components/project_runner/provider.tsx` (Context/Provider with `createStore` + `reconcile()`)
- Client: `client/src/components/project_runner/global_pds.ts` (non-reactive access for async/cache code)
- Types: `lib/types/project_dirty_states.ts` (`ProjectSseUpdateMessage` discriminated union with 6 event types)

The server-side pattern: mutation routes post typed messages to a `BroadcastChannel("dirty_states")`. The SSE endpoint subscribes and forwards messages to connected clients, filtered by projectId.

**Instance-level** has no such system. It's entirely pull-based:
- `client/src/components/instance/index.tsx` creates a `timQuery` (panther library fetch wrapper) that calls `getInstanceDetail()` to fetch the entire `InstanceDetail` object
- This `timQuery` is passed as a prop down through every instance sub-component
- After any mutation (add user, upload structure, delete asset, etc.), the component calls `instanceDetail.silentFetch()` or `instanceDetail.fetch()` to re-pull the entire InstanceDetail
- There is no multi-user sync - if User A uploads structure data, User B doesn't see it until they manually refresh
- The current types are defined in `lib/types/instance.ts` (`InstanceDetail`, `InstanceMeta`)
- The server builds InstanceDetail in `server/db/instance/instance.ts` (`getInstanceDetail()`)

### What we want

1. Replace the pull-based instance-level state with push-based SSE, following the same general pattern as project SSE
2. All connected clients see all mutations in real time (multi-user)
3. A clear, easy-to-reason-about state management system with one set of files in one place
4. After instance SSE works, refactor project SSE to match the same patterns (eliminating inconsistencies between the two systems)

---

## Design Decisions (Agreed)

### SSE message strategy

- First message on connect: full state (`starting` event). This is a large-ish JSON payload (especially for project state which includes all visualizations, reports, slide decks, modules, metrics, users). We accept this - the same data is already being sent over HTTP in the current system (via `getInstanceDetail` and `getProjectDetail` / `refetchProjectDetail`). SSE just changes the transport. On reconnect after a dropped connection, the full state is sent again.
- Subsequent messages: granular by event type, carrying the actual changed data (not just signals/hashes)
- Heavy data (HMIS dataset items, structure items, HFA items) is NOT sent via SSE. These stay fetched independently with the existing reactive cache system (`client/src/state/caches/reactive_cache.ts`)
- Cache versioning for heavy data does NOT use separate `lastUpdated` timestamps. The version information is already embedded in the regular state fields (e.g. `datasetVersions.hmis`, `indicatorMappingsVersion`). Caches read these from the store as version keys. This differs from project SSE which uses per-entity `lastUpdated` timestamps because project caches track per-entity freshness (e.g. per-presentation-object). Instance-level caches don't need that granularity.

### Server-side notification

- `BroadcastChannel("instance_updates")` for in-process pub/sub (same pattern as project's `BroadcastChannel("dirty_states")`)
- `notifyInstanceUpdate(message: InstanceSseMessage)` posts typed messages to the channel
- SSE endpoint subscribes to the BroadcastChannel and forwards to connected clients
- Route handlers that perform mutations call `notifyInstanceUpdate(...)` with the changed data included in the message. The mutation code already has the data (it just wrote it), so this is natural - same pattern as project SSE where e.g. `set_module_clean.ts` includes status and timestamps in the broadcast message.

### Client-side state container

- Global `createStore<InstanceState>()` at module level (NOT inside a component, NO Context/Provider needed)
- Components read from the store directly via import - Solid's fine-grained reactivity means only components reading a changed field re-render
- Non-component/async code (caches, event handlers) uses plain getter functions that `unwrap()` the store to avoid reactive tracking. This follows the existing pattern in `client/src/components/project_runner/global_module_maps.ts` (plain variables + getter functions for non-reactive access) and `client/src/components/project_runner/global_pds.ts` (`unwrap()` for async contexts)
- Replaces the current `timQuery` + `getInstanceDetail` fetch + prop threading entirely

### Which mutations trigger SSE notifications

- Only mutations that change shared/finalized instance data
- Upload workflow intermediate steps (step 0-3 for structure/datasets) do NOT trigger SSE - these are transient per-user workflow state
- Final import steps (step 4), deletes, and all other mutations DO trigger SSE
- TUS file uploads: notification is triggered directly in the TUS PATCH handler when upload completes (`upload.offset >= upload.size`). Assets are files on disk (no DB access needed), so the handler calls `getAssetsForInstance()` and broadcasts `assets_updated`.

### Upload attempts are NOT instance state

- `structureUploadAttempt`, HMIS upload attempts, and HFA upload attempts are transient per-user workflow state
- HMIS and HFA already manage their own upload attempt state (component-local signals + polling in `client/src/components/instance_dataset_hmis/index.tsx` and `client/src/components/instance_dataset_hfa/index.tsx`)
- Structure upload attempt currently lives in `InstanceDetail` - it needs to be pulled out to match the HMIS/HFA pattern
- All three upload workflows follow the same pattern: component-local fetch on mount, refetch after mutation
- When an import finalizes (step 4), the SSE sends `structure_updated` / `datasets_updated` with the new data - that's the part other users care about

### No separate `lastUpdated` timestamps for instance SSE

- Unlike project-level SSE (which tracks per-entity timestamps across multiple table types for cache versioning via `ProjectDirtyStates.lastUpdated`), instance-level SSE does not need a `lastUpdated` mechanism
- The HMIS display cache (`client/src/state/dataset_cache.ts`) is keyed on `datasetVersions.hmis` + `indicatorMappingsVersion` - both are regular fields in `InstanceState`, updated by their respective SSE events
- The HFA display cache is keyed on `cacheHash` from the server response, not from instance state
- When these fields change via SSE, caches naturally miss on next access - no separate invalidation needed

---

## Phase 1: Instance SSE

### 1.0 Pre-work: Pull structureUploadAttempt out of InstanceDetail

Before building SSE, refactor the structure upload attempt to be component-local:

1. Remove `structureUploadAttempt` from the `InstanceDetail` type (`lib/types/instance.ts`)
2. Remove it from the `getInstanceDetail()` DB function (`server/db/instance/instance.ts`)
3. The structure component (`client/src/components/structure/index.tsx`) fetches upload attempt state independently on mount via the existing `getStructureUploadAttempt` endpoint
4. After mutations (create/delete upload attempt, step 4 import), the component refetches its own upload attempt state
5. This aligns structure upload handling with HMIS/HFA which already work this way

### 1.1 Define types

**File: `lib/types/instance_sse.ts`**

The SSE message is a discriminated union - 9 event types over a single SSE connection, each carrying only the relevant data for that change:

```typescript
type InstanceSseMessage =
  | { type: "starting"; data: InstanceState }
  | { type: "config_updated"; data: InstanceConfig }
  | { type: "projects_updated"; data: ProjectSummary[] }
  | { type: "users_updated"; data: OtherUser[] }
  | { type: "assets_updated"; data: AssetInfo[] }
  | { type: "geojson_maps_updated"; data: GeoJsonMapSummary[] }
  | { type: "structure_updated"; data: InstanceStructureSummary }
  | { type: "indicators_updated"; data: InstanceIndicatorsSummary }
  | { type: "datasets_updated"; data: InstanceDatasetsSummary }
  | { type: "error"; data: { message: string } }
```

**`InstanceState`** is the unified client-side state type. It replaces `InstanceDetail` (defined in `lib/types/instance.ts`) as the live source of truth for shared instance data.

**Relationship to other types:**
- **`InstanceMeta`** (`lib/types/instance.ts`) - stays as-is. Used pre-auth for the login page (`instanceName`, `instanceRedirectUrl`) and on-demand for server info dialog (`serverVersion`, `uptimeMs`, `isHealthy`). Neither use case fits SSE.
- **`GlobalUser`** (`lib/types/instance.ts`) - stays as-is. It's bootstrap data for the current user, fetched once at auth time. It includes `instanceLanguage` and `instanceCalendar` because these are needed immediately to render the app before SSE connects. It also includes per-user fields (`email`, `isGlobalAdmin`, `thisUserPermissions`, `approved`). Minor overlap with `InstanceState` on `instanceName` is accepted - `GlobalUser` is the bootstrap snapshot, `InstanceState` is the live source of truth.
- **`InstanceDetail`** - fully replaced by `InstanceState`. Removed after migration.

```typescript
type InstanceState = {
  // Client and server share one type. The server sends `isReady: true` in the
  // `starting` message. The client initializes the store with `isReady: false`
  // and applies the full starting payload via `reconcile()`, which flips it to
  // true in a single atomic update. No special client-side logic needed.
  isReady: boolean;

  // Immutable (set from env vars at server startup, never changes at runtime,
  // only sent in the `starting` message, no SSE event updates these)
  instanceName: string;

  // Config (rarely changes, updated via `config_updated` event)
  maxAdminArea: number;
  countryIso3: string | undefined;
  facilityColumns: InstanceConfigFacilityColumns;

  // Lists (sent as full arrays on change)
  projects: ProjectSummary[];
  users: OtherUser[];
  assets: AssetInfo[];
  geojsonMaps: GeoJsonMapSummary[];

  // Summaries (lightweight aggregates)
  structure: { adminArea1s: number; adminArea2s: number; adminArea3s: number; adminArea4s: number; facilities: number } | undefined;
  structureLastUpdated: string | undefined;
  indicators: { commonIndicators: number; rawIndicators: number; hfaIndicators: number };
  datasetsWithData: DatasetType[];
  datasetVersions: { hmis?: number; hfa?: number };

  // Cache versioning (regular fields, read by dataset caches as version keys)
  indicatorMappingsVersion: string;
};
```

**Event data types** - each is a subset of `InstanceState` matching the fields affected by that event:

```typescript
type InstanceConfig = {
  maxAdminArea: number;
  countryIso3: string | undefined;
  facilityColumns: InstanceConfigFacilityColumns;
};

type InstanceStructureSummary = {
  structure: { adminArea1s: number; adminArea2s: number; adminArea3s: number; adminArea4s: number; facilities: number } | undefined;
  structureLastUpdated: string | undefined;
};

type InstanceIndicatorsSummary = {
  indicators: { commonIndicators: number; rawIndicators: number; hfaIndicators: number };
  indicatorMappingsVersion: string;
};

type InstanceDatasetsSummary = {
  datasetsWithData: DatasetType[];
  datasetVersions: { hmis?: number; hfa?: number };
};
```

### 1.2 Server: BroadcastChannel and notify function

**File: `server/task_management/notify_instance_updated.ts`**

Same pattern as existing `server/task_management/notify_last_updated.ts` (which handles project-level notifications):

```typescript
const broadcastInstanceUpdates = new BroadcastChannel("instance_updates");

export function notifyInstanceUpdate(message: InstanceSseMessage) {
  broadcastInstanceUpdates.postMessage(message);
}
```

Convenience wrappers for common cases (keeps route handler code concise):

```typescript
export function notifyInstanceUsersUpdated(users: OtherUser[]) {
  notifyInstanceUpdate({ type: "users_updated", data: users });
}

export function notifyInstanceConfigUpdated(config: InstanceConfig) {
  notifyInstanceUpdate({ type: "config_updated", data: config });
}

// etc. for each event type
```

### 1.3 Server: SSE endpoint

**File: `server/routes/instance/instance-sse.ts`**

Route: `GET /instance_updates`

Pattern mirrors `server/routes/project/project-sse.ts`, but fixes a race condition present in the current project SSE implementation:

1. Authenticate the request (require appropriate permission)
2. **Subscribe to `BroadcastChannel("instance_updates")` FIRST, queuing any messages received**
3. Build initial `InstanceState` from the database (reuse/refactor the existing `getInstanceDetail()` function in `server/db/instance/instance.ts`)
4. Send `starting` message with full state
5. **Drain any queued messages that arrived between steps 2 and 4**
6. Forward all subsequent messages from the BroadcastChannel to the SSE stream
7. Handle disconnection cleanup

Step 3 (build initial state) is wrapped in try/catch. On failure, send `{ type: "error", data: { message: "..." } }` and close the stream. The client shows a meaningful error instead of retrying a doomed request.

The subscribe-before-build ordering prevents a gap where messages could be lost: if a mutation occurs between building the initial state (step 3) and subscribing (step 2 in the old ordering), the client would never see that update. By subscribing first and queuing, no messages are lost. The current project SSE (`server/routes/project/project-sse.ts`) has this bug - fix it there too when refactoring in Phase 2.

Unlike project SSE, no projectId filtering is needed - all instance events go to all connected clients.

### 1.4 Server: Add notify calls to mutation routes

These are the routes that need `notifyInstanceUpdate()` calls after their mutations. Currently none of these routes have any notification mechanism (unlike project routes which call `notifyProjectUpdated()` / `notifyLastUpdated()`).

**Users** (`server/routes/instance/users.ts`) - 8 endpoints:

- `addUsers` -> `notifyInstanceUsersUpdated(updatedUsersList)`
- `toggleUserAdmin` -> `notifyInstanceUsersUpdated(updatedUsersList)`
- `deleteUser` -> `notifyInstanceUsersUpdated(updatedUsersList)`
- `batchUploadUsers` -> `notifyInstanceUsersUpdated(updatedUsersList)`
- `updateUserPermissions` -> `notifyInstanceUsersUpdated(updatedUsersList)`
- `updateUserDefaultProjectPermissions` -> no SSE notification needed (default project permissions are not included in `OtherUser` and are not visible in the instance user list)
- `bulkUpdateUserPermissions` -> `notifyInstanceUsersUpdated(updatedUsersList)`
- `bulkUpdateUserDefaultProjectPermissions` -> no SSE notification needed (same reason)

**Config** (`server/routes/instance/instance.ts`) - 3 endpoints:

- `updateMaxAdminArea` -> `notifyInstanceConfigUpdated({...})`
- `updateFacilityColumnsConfig` -> `notifyInstanceConfigUpdated({...})`
- `updateCountryIso3` -> `notifyInstanceConfigUpdated({...})`

**Structure** (`server/routes/instance/structure.ts`) - only finalization:

- `structureStep4_ImportData` -> `notifyInstanceUpdate({ type: "structure_updated", data: { structure: newCounts, structureLastUpdated: timestamp } })`
- `deleteAllStructureData` -> same

**Indicators** (`server/routes/instance/indicators.ts`) - 9 endpoints:

- All create/update/delete/batch operations -> `notifyInstanceUpdate({ type: "indicators_updated", data: { indicators: newCounts, indicatorMappingsVersion: newHash } })`

**HFA Indicators** (`server/routes/instance/hfa_indicators.ts`) - 5 of 6 mutation endpoints:

- `createHfaIndicator` -> `notifyInstanceUpdate({ type: "indicators_updated", data: { indicators: newCounts, indicatorMappingsVersion: newHash } })`
- `updateHfaIndicator` -> same
- `deleteHfaIndicators` -> same
- `batchUploadHfaIndicators` -> same
- `saveHfaIndicatorFull` -> same (updates both indicator metadata and code in one operation)
- `updateHfaIndicatorCode` -> **NO notification**. This endpoint only updates R script code (`r_code`, `r_filter_code`) in the `hfa_indicator_code` table. Nothing in `InstanceState` changes: the `hfaIndicators` count is unchanged, and `indicatorMappingsVersion` does not include HFA tables (it only hashes `indicators`, `indicators_raw`, and `indicator_mappings` — see `server/db/instance/instance.ts:32-44`). Module execution is unaffected because HFA modules always read live code from the database at runtime (`server/worker_routines/run_module/run_module_iterator.ts:113-122`) — the R script is generated dynamically with current code, no caching or dirty-marking needed. The HFA code editor fetches its own data independently on open via `timQuery`, so multi-user code editor sync is not expected or needed.

**Datasets** (`server/routes/instance/datasets.ts`) - only finalization and deletes:

- `finalizeDatasetIntegration` -> `notifyInstanceUpdate({ type: "datasets_updated", data: { datasetsWithData, datasetVersions } })`
- `finalizeDatasetHfaIntegration` -> same
- `deleteAllDatasetHmisData` -> same
- `deleteDatasetHfaData` -> same

**GeoJSON** (`server/routes/instance/geojson_maps.ts`) - 2 endpoints:

- `saveGeoJsonMap` -> `notifyInstanceUpdate({ type: "geojson_maps_updated", data: updatedList })`
- `deleteGeoJsonMap` -> same

**Assets** (`server/routes/instance/assets.ts`) - 1 endpoint + TUS:

- `deleteAssets` -> `notifyInstanceUpdate({ type: "assets_updated", data: updatedList })`
- TUS upload completion (in `server/routes/instance/upload.ts`): when a file upload completes (PATCH handler, `upload.offset >= upload.size`), call `getAssetsForInstance()` and `notifyInstanceUpdate({ type: "assets_updated", data: updatedList })` directly in the handler. Assets are files on disk (no DB needed), so the TUS handler can build the list. This also means other connected clients see new assets immediately without relying on the uploader's client to trigger a refresh.

**Projects** (`server/routes/project/project.ts`) - routes that change the instance project list:

- `createProject` (addProject) -> `notifyInstanceUpdate({ type: "projects_updated", data: updatedList })`
- `deleteProject` -> same
- `copyProject` (copyProjectInBackground) -> same, after async copy completes
- `updateProject` (label/settings changes) -> same (changes `ProjectSummary` fields displayed in the list)
- `setProjectLockStatus` -> same (changes lock status visible in list)

Note: `addProjectUserRole` does NOT need this — all projects are sent to all users regardless of permissions (per design decision in Resolved Questions #2).

### 1.5 Client: Global instance store

**File: `client/src/state/instance_state.ts`**

This is the single source of truth for instance-level state on the client. It provides two access patterns:

**1. Reactive access** (for components) - import the store directly, Solid tracks dependencies automatically:

```typescript
const [instanceState, setInstanceState] = createStore<InstanceState>({
  isReady: false,
  // ... defaults
});

export { instanceState };
// Components use: instanceState.projects, instanceState.users, etc.
```

**2. Non-reactive access** (for caches and async code) - plain getter functions that unwrap the store:

```typescript
export function getIndicatorMappingsVersion(): string {
  return unwrap(instanceState).indicatorMappingsVersion;
}

export function getInstanceFacilityColumns(): InstanceConfigFacilityColumns {
  return unwrap(instanceState).facilityColumns;
}

export function getDatasetVersionHmis(): number | undefined {
  return unwrap(instanceState).datasetVersions.hmis;
}
```

**3. Setter functions** (called by the SSE handler, not by components directly):

```typescript
export function initInstanceState(data: InstanceState): void {
  setInstanceState(reconcile(data));
}

export function updateInstanceConfig(data: InstanceConfig): void {
  setInstanceState("maxAdminArea", data.maxAdminArea);
  setInstanceState("countryIso3", data.countryIso3);
  setInstanceState("facilityColumns", reconcile(data.facilityColumns));
}

export function updateInstanceUsers(users: OtherUser[]): void {
  setInstanceState("users", reconcile(users));
}

// ... one function per event type
```

### 1.6 Client: SSE connection manager and boundary component

**File: `client/src/state/instance_sse.ts`**

Manages the EventSource connection:

```typescript
export function connectInstanceSSE(): void { ... }
export function disconnectInstanceSSE(): void { ... }
```

Responsibilities:

- Opens EventSource to `/instance_updates`
- Parses incoming `InstanceSseMessage` (discriminated union, routes on `type` field)
- Routes each message type to the corresponding setter in `instance_state.ts`
- Retry with exponential backoff (same logic as project SSE in `provider.tsx`)
- **On reconnect: `isReady` is NOT reset.** Stale data stays visible while reconnecting - far better than a loading spinner on every network blip. The fresh `starting` message overwrites via `reconcile()` without touching `isReady`.
- **On permanent failure** (max retries exhausted): set an error flag on the store (e.g. `connectionStatus: "failed"`). The boundary component shows an error state, not an infinite spinner.

**Boundary component: `InstanceSSEBoundary`**

A thin wrapper component (exported from `instance_sse.ts` or its own file) that makes the SSE lifecycle visible in the component tree:

```typescript
export function InstanceSSEBoundary(props: { children: JSX.Element }) {
  onMount(() => connectInstanceSSE());
  onCleanup(() => disconnectInstanceSSE());
  return <Show when={instanceState.isReady} fallback={<LoadingSpinner />}>
    {props.children}
  </Show>;
}
```

Used in `client/src/components/LoggedInWrapper.tsx` (or `routes/index.tsx`) to wrap the authenticated app:

```tsx
<InstanceSSEBoundary>
  <Instance globalUser={globalUser} attemptSignOut={attemptSignOut} />
</InstanceSSEBoundary>
```

Children import `instanceState` directly from `instance_state.ts` - no Context, no hooks. The boundary is purely for lifecycle management and rendering gate.

### 1.7 Client: Update components to use the store

Replace all current patterns:

- Remove `timQuery` for `getInstanceDetail` in `client/src/components/instance/index.tsx`
- Remove `instanceDetail` prop threading through all instance sub-components
- Components import `instanceState` directly from `client/src/state/instance_state.ts`
- Remove all `instanceDetail.silentFetch()` / `instanceDetail.fetch()` calls (SSE handles updates automatically)
- Remove `StateHolderWrapper` usage for instance data (the store is always available once SSE connects; use `instanceState.isReady` for loading state)

**Components that need updating:**

Instance-level components (currently receive `instanceDetail` as timQuery prop):

- `client/src/components/instance/index.tsx` - remove timQuery, remove prop passing
- `client/src/components/instance/instance_projects.tsx`
- `client/src/components/instance/instance_data.tsx`
- `client/src/components/instance/instance_users.tsx`
- `client/src/components/instance/instance_assets.tsx`
- `client/src/components/instance/instance_settings.tsx` - reads `facilityColumns`, `maxAdminArea`, `countryIso3`
- `client/src/components/instance/hfa_indicators_manager.tsx`
- `client/src/components/instance/add_project.tsx`
- `client/src/components/indicators/indicators_manager.tsx`
- `client/src/components/structure/index.tsx`
- `client/src/components/instance_dataset_hmis/index.tsx`
- `client/src/components/instance_dataset_hfa/index.tsx`
- `client/src/components/instance_geojson/geojson_manager.tsx`

Project-level components (receive `instanceDetail` across the project boundary - trickier migration):

- `client/src/components/project/index.tsx` - entry point, currently receives `instanceDetail` and threads it to all children below. Use **reactive** `instanceState` for rendering, remove `silentRefreshInstance` pattern entirely.
- `client/src/components/project/project_data.tsx` - reads `facilityColumns`, `cacheVersions.indicatorMappings`, `datasetVersions`, `structureLastUpdated`, `maxAdminArea`, `datasetsWithData` in `createMemo` for staleness checks. Use **reactive** `instanceState.*`.
- `client/src/components/project/project_settings.tsx` - uses `silentRefreshInstance` in async callbacks. Remove entirely (SSE handles updates).
- `client/src/components/project/project_visualizations.tsx` - passes `instanceDetail` to `snapshotForVizEditor()`. Use **non-reactive getter** since it's a snapshot for an editor.
- `client/src/components/project/project_metrics.tsx` - passes `instanceDetail` to child components. Use **non-reactive getter** for editor snapshots.
- `client/src/components/project/project_reports.tsx` - passes `instanceDetail` to Report component. Use **non-reactive getter**.
- `client/src/components/project/project_decks.tsx` - passes `instanceDetail` to slide deck components. Use **non-reactive getter**.
- `client/src/components/project/settings_for_project_dataset_hmis.tsx` - receives `facilityColumns`, `indicatorMappingsVersion`. Use **non-reactive getter** (passed to cache).
- `client/src/components/visualization/index.tsx` - receives `instanceDetail` in editor mode props. Use **non-reactive getter**.
- `client/src/components/visualization/visualization_editor_inner.tsx` - uses `instanceDetail` for visualization rendering. Use **reactive** `instanceState` if rendering, **non-reactive getter** if snapshotting.
- `client/src/components/slide_deck/index.tsx` - passes `instanceDetail` to inner components. Use **non-reactive getter**.
- `client/src/components/slide_deck/slide_editor/index.tsx` - uses `instanceDetail` in visualization generation. Use **non-reactive getter** for editor snapshots.
- `client/src/components/report/index.tsx` - passes `instanceDetail` to report editor. Use **non-reactive getter**.
- `client/src/components/report/duplicate_report.tsx` - reads `instanceDetail.projects` to render dropdown. Use **reactive** `instanceState.projects`.
- `client/src/components/project_ai/index.tsx` - uses `instanceDetail` in `createMemo` for AI system prompt. Use **reactive** `instanceState`.
- `client/src/components/structure_import/index.tsx` - receives `facilityColumns`, `silentRefreshInstance`. Use **non-reactive getter** for `facilityColumns`, remove `silentRefreshInstance`.
- `client/src/components/instance_dataset_hmis/dataset_items_holder.tsx` - uses `facilityColumns`, `indicatorMappingsVersion` for cache fetch. Use **non-reactive getter**.
- `client/src/components/instance_dataset_hmis/_delete_data.tsx` - passes `facilityColumns` to child. Use **non-reactive getter**.

### 1.8 Client: Eliminate redundant independent fetches

Some components currently make their own fetches for data that `InstanceState` already provides. These independent fetches should be removed in favor of reading from the store:

- **GeoJSON maps**: `client/src/components/instance_geojson/geojson_manager.tsx` makes its own `timQuery` via `serverActions.getGeoJsonMaps({})`, returning identical `GeoJsonMapSummary[]` that's already in `InstanceState`. Remove the independent fetch, read `instanceState.geojsonMaps` instead.
- **Assets (file pickers)**: 11+ import wizard / file picker components (e.g. `instance_geojson/geojson_upload_wizard.tsx`, `instance_dataset_hmis_import/step_1_csv.tsx`, `structure_import/step_1_csv.tsx`, `indicators/batch_upload_form.tsx`, `slide_deck/slide_editor/editor_panel_content.tsx`, etc.) independently fetch `serverActions.getAssets({})`. These return identical `AssetInfo[]` that's already in `InstanceState`. Read `instanceState.assets` instead.

**Data that correctly stays as independent fetches** (not in `InstanceState`, fetched on demand):

| Data | Component | Why it's separate |
| --- | --- | --- |
| Indicator full lists (with mappings) | `indicators/indicators_manager.tsx` | Much more data than the counts in InstanceState |
| HFA indicator full list | `instance/hfa_indicators_manager.tsx` | Full objects, not just count |
| HFA indicator code + validation | `instance/hfa_indicator_code_editor.tsx` | Editor-only, on-demand |
| Structure items (rows) | `structure/with_csv.tsx` | Actual row data, not counts |
| HMIS dataset detail (upload attempt) | `instance_dataset_hmis/index.tsx` | Component-local workflow state |
| HFA dataset detail (upload attempt) | `instance_dataset_hfa/index.tsx` | Component-local workflow state |
| HMIS display items (data rows) | `instance_dataset_hmis/dataset_items_holder.tsx` | Heavy data, reactive cache |
| HFA display items (data rows) | `instance_dataset_hfa/dataset_items_holder.tsx` | Heavy data, reactive cache |
| User logs | `instance/instance_users.tsx` | Audit log, on-demand |
| Compare projects | `instance/compare_projects.tsx` | On-demand modal |

### 1.9 Client: Update caches to use instance store

The dataset caches currently derive version keys from `InstanceDetail.cacheVersions` (an MD5 hash computed in `server/db/instance/instance.ts`). Update them to read from the global instance store instead:

- `client/src/state/dataset_cache.ts` - `_DATASET_HMIS_DISPLAY_INFO_CACHE` should use `getIndicatorMappingsVersion()` and `getDatasetVersionHmis()` as part of its version key

### 1.10 Remove old instance detail fetch infrastructure

Once all components and caches use the new store:

- Remove `getInstanceDetail` server action from client (the server-side function is still used by the SSE endpoint to build initial state)
- Remove `cacheVersions` field from the old `InstanceDetail` type (replaced by `indicatorMappingsVersion` in `InstanceState`)
- Clean up any unused imports/types

---

## Phase 2: Refactor Project SSE to Match

### Goal

Align project-level SSE with the instance-level pattern established in Phase 1. The current project SSE has inconsistencies we want to eliminate:

| Aspect | Current project SSE | Target (matching instance SSE) |
|---|---|---|
| State container | Context/Provider (`ProjectDirtyStateContext` in `client/src/components/project_runner/context.tsx`) | Global store at module level |
| Data delivery | SSE sends metadata/timestamps; `ProjectDetail` fetched separately via `timQuery` | SSE sends actual data for all events |
| Stores | Two separate: `projectDetail` (from timQuery) + `projectDirtyStates` (from SSE store) | One unified store |
| On mutation | `notifyProjectUpdated()` sends signal -> client calls `refetchProjectDetail()` (second HTTP round-trip) | Server sends the changed data slice directly via SSE |
| Non-reactive access | `getGlobalPDSSnapshot()` in separate file | Getter functions in the store file |

Note: Project SSE has a legitimate use for `lastUpdated` per-entity timestamps (unlike instance SSE) because project caches do per-entity versioning (e.g. `pds.lastUpdated.presentation_objects[poId]` in the reactive cache system). This stays.

### 2.1 Define unified ProjectState type

Merge `ProjectDetail` (`lib/types/projects.ts`) and `ProjectDirtyStates` (`lib/types/project_dirty_states.ts`) into one `ProjectState`:

```typescript
type ProjectState = {
  isReady: boolean;

  // From current ProjectDetail (shared data)
  id: string;
  label: string;
  // NOTE: aiContext is excluded from ProjectState. It's an unbounded string
  // (users can paste large documents) and is only consumed by the AI panel.
  // Fetch independently when the AI panel opens.
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

  // R logs (currently a separate store in provider.tsx)
  rLogs: Record<string, { latest: string }>;

  // Per-user data (NOT broadcast via SSE - resolved on initial connection,
  // re-derived client-side when project_users_updated event arrives)
  // NOTE: thisUserRole is intentionally excluded. No client code reads it —
  // all access control uses thisUserPermissions (granular per-capability booleans).
  // The server also has a pre-existing bug where it hardcodes thisUserRole: "viewer"
  // (server/db/project/projects.ts:190) instead of using the calculated value (line 114).
  // Removing it rather than fixing dead code.
  thisUserPermissions: ProjectUserPermissions;
};
```

### 2.2 Define granular ProjectSseMessage types

Replace the current 6 message types (`ProjectSseUpdateMessage` in `lib/types/project_dirty_states.ts`) with more granular events that carry actual data:

```typescript
type ProjectSseMessage =
  | { type: "starting"; data: ProjectState }
  // Module execution (keep these - they're already granular with data)
  | { type: "any_running"; data: { anyRunning: boolean } }
  | { type: "r_script"; data: { moduleId: string; text: string } }
  | { type: "module_dirty_state"; data: { ids: string[]; dirtyOrRunStatus: DirtyOrRunStatus; lastRun?: string; lastRunGitRef?: string } }
  // Data updates (replace current "project_updated" catch-all with specific events carrying data)
  | { type: "project_config_updated"; data: { label: string; isLocked: boolean; /* etc */ } }
  | { type: "modules_updated"; data: InstalledModuleSummary[] }
  | { type: "visualizations_updated"; data: PresentationObjectSummary[] }
  | { type: "visualization_folders_updated"; data: VisualizationFolder[] }
  | { type: "reports_updated"; data: ReportSummary[] }
  | { type: "slide_decks_updated"; data: SlideDeckSummary[] }
  | { type: "slide_deck_folders_updated"; data: SlideDeckFolder[] }
  | { type: "datasets_updated"; data: DatasetInProject[] }
  | { type: "project_users_updated"; data: ProjectUser[] }
  // lastUpdated per-entity timestamps (kept - project caches use per-entity versioning)
  | { type: "last_updated"; data: { tableName: LastUpdateTableName; ids: string[]; lastUpdated: string } }
  | { type: "error"; data: { message: string } }
```

### 2.3 Server: Update notification functions

Replace `notifyProjectUpdated()` in `server/task_management/notify_last_updated.ts` (which triggers a full client-side refetch) with specific notify functions that include data:

```typescript
// Replace this:
notifyProjectUpdated(projectId, lastUpdated);

// With specific calls like:
notifyProjectVisualizationsUpdated(projectId, updatedVizList);
notifyProjectModulesUpdated(projectId, updatedModuleList);
// etc.
```

Each route handler that currently calls `notifyProjectUpdated()` is updated to call the appropriate specific function with the relevant data slice.

### 2.4 Server: Update SSE endpoint

Update `server/routes/project/project-sse.ts`:

- Build full `ProjectState` for the `starting` message (merge current PDS build from `server/task_management/get_project_dirty_states.ts` + ProjectDetail fetch)
- Forward granular messages (no change to BroadcastChannel subscription logic)

### 2.5 Client: Global project store with reset semantics

**File: `client/src/state/project_state.ts`**

Same pattern as instance store, but with one critical difference: **project state must be fully reset when switching projects.**

The current Context/Provider naturally resets on unmount (provider unmounts, new one mounts with new projectId). A global store persists across navigation. Without explicit reset, entering Project B could briefly render stale data from Project A.

```typescript
const EMPTY_PROJECT_STATE: ProjectState = {
  isReady: false,
  // ... all fields at empty/default values
};

export function resetProjectState(): void {
  setProjectState(reconcile(EMPTY_PROJECT_STATE));
}
```

`resetProjectState()` is called by `disconnectProjectSSE()` - the store is always cleared when leaving a project. Components gate rendering on `projectState.isReady` (equivalent to the current `Show when={isReady}` in the provider).

Otherwise same as instance store:
- Setter functions per event type
- Reactive access via store
- Non-reactive access via getter functions (replaces `getGlobalPDSSnapshot()` in `client/src/components/project_runner/global_pds.ts`)

Reconnection and failure semantics (same as instance):
- **On reconnect within the same project: `isReady` is NOT reset.** Stale data stays visible. Fresh `starting` message overwrites via `reconcile()`.
- **On permanent failure** (max retries exhausted): set error flag. Boundary shows error state.
- **On project switch: `isReady` IS reset** (via `resetProjectState()` in `disconnectProjectSSE()`).

### 2.6 Client: SSE connection manager and boundary component

**File: `client/src/state/project_sse.ts`**

Same pattern as instance SSE, but with reset semantics:

```typescript
export function connectProjectSSE(projectId: string): void {
  disconnectProjectSSE(); // Close any existing connection + reset store + clear listeners
  // Open EventSource to /project_updates/{projectId}
  // ...
}

export function disconnectProjectSSE(): void {
  // Close EventSource
  // Clear listeners
  listeners.clear();
  // Reset store to empty state
  resetProjectState();
}
```

**Boundary component: `ProjectSSEBoundary`**

Same pattern as `InstanceSSEBoundary` - makes lifecycle visible, gates rendering, manages cleanup:

```typescript
export function ProjectSSEBoundary(props: { projectId: string; children: JSX.Element }) {
  onMount(() => connectProjectSSE(props.projectId));
  onCleanup(() => disconnectProjectSSE());
  return <Show when={projectState.isReady} fallback={<LoadingSpinner />}>
    {props.children}
  </Show>;
}
```

Used in `client/src/components/project/index.tsx` (or wherever the project entry point is):

```tsx
<ProjectSSEBoundary projectId={projectId}>
  {/* project content - imports projectState directly, no hooks */}
</ProjectSSEBoundary>
```

`disconnectProjectSSE()` resets the store and clears listeners, ensuring no stale state or subscriptions persist after leaving a project. `onCleanup` fires when the user navigates away from the project (same trigger as today's Provider unmount).

### 2.7 Client: Remove Context/Provider

- Remove `ProjectDirtyStateContext` (`client/src/components/project_runner/context.tsx`) and the provider in `client/src/components/project_runner/provider.tsx`
- Remove hooks like `useProjectDetail()`, `useProjectDirtyStates()` (`client/src/components/project_runner/hooks.tsx`)
- Components import from `project_state.ts` directly - no Context, no hooks
- `ProjectSSEBoundary` replaces the Provider as the lifecycle boundary (but does NOT provide context - children import state directly)

### 2.8 Client: Migrate addLastUpdatedListener

The current provider (`client/src/components/project_runner/provider.tsx`) manages a `Set<LastUpdatedListener>` that components subscribe to for push notifications when specific tables change. The AI system (`client/src/components/project_ai/index.tsx`) is the primary consumer - it subscribes to `slides`, `presentation_objects`, `slide_decks`, and `reports` table changes to feed context updates to the AI.

This listener management moves to `client/src/state/project_sse.ts` (since it's triggered by SSE events):

```typescript
type LastUpdatedListener = (tableName: LastUpdateTableName, ids: string[], timestamp: string) => void;

const listeners = new Set<LastUpdatedListener>();

export function addLastUpdatedListener(listener: LastUpdatedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Called internally when a "last_updated" SSE event arrives:
function fireLastUpdatedListeners(tableName: LastUpdateTableName, ids: string[], timestamp: string) {
  for (const listener of listeners) {
    listener(tableName, ids, timestamp);
  }
}
```

Listeners are cleared on `disconnectProjectSSE()` (same as store reset - clean slate when leaving a project).

### 2.9 Client: Update all project components

Replace context hook usage with direct store imports:

- `useProjectDetail()` -> `import { projectState } from "~/state/project_state"`
- `useProjectDirtyStates()` -> same store, different fields
- `getGlobalPDSSnapshot()` -> `getProjectStateSnapshot()` or specific getters
- `useLastUpdatedListener()` -> `import { addLastUpdatedListener } from "~/state/project_sse"`

### 2.10 Migrate global_pds.ts and global_module_maps.ts

- `global_pds.ts` is replaced by the non-reactive getters in `project_state.ts`
- `global_module_maps.ts` is **deleted**. The derived lookup tables (`metricToModule`, `resultsObjectToModule`, `metricToFormatAs`) move into `project_state.ts` as private module-level variables with exported getter functions (`getModuleIdForMetric()`, `getModuleIdForResultsObject()`, `getFormatAsForMetric()`). They are recomputed internally when the `starting` message or `modules_updated` event updates `projectModules`/`metrics`, and reset naturally when `resetProjectState()` is called. No separate lifecycle management needed.

---

## File Structure (End State)

### Design principle

Each level (instance, project) has the same 5-file structure, one file per concern. You should be able to answer any question about the SSE system by knowing which file to look at:

| Question | Instance file | Project file |
| --- | --- | --- |
| What's in the state? What events exist? | `lib/types/instance_sse.ts` | `lib/types/project_sse.ts` |
| How does the server send notifications? | `server/task_management/notify_instance_updated.ts` | `server/task_management/notify_project_updated.ts` |
| How does data get to the client (SSE endpoint)? | `server/routes/instance/instance-sse.ts` | `server/routes/project/project-sse.ts` |
| Where is the client state? How do I read/write it? | `client/src/state/instance_state.ts` | `client/src/state/project_state.ts` |
| How does the SSE connection get managed? | `client/src/state/instance_sse.ts` | `client/src/state/project_sse.ts` |

### What each file contains

**Types** (`lib/types/{instance,project}_sse.ts`):
- The SSE message discriminated union (all event types in one place)
- The state type (`InstanceState` / `ProjectState`)
- Event data subtypes (e.g. `InstanceConfig`, `InstanceStructureSummary`)
- This is the single file you read to understand the full shape of state and all possible events

**Server notify** (`server/task_management/notify_{instance,project}_updated.ts`):
- BroadcastChannel setup
- `notifyInstanceUpdate()` / `notifyProjectUpdate()` core function
- Convenience wrappers per event type (e.g. `notifyInstanceUsersUpdated()`)

**Server SSE endpoint** (`server/routes/{instance,project}/*-sse.ts`):
- SSE route handler using Hono's `streamSSE`
- Builds initial state on connection, sends `starting` message
- Subscribes to BroadcastChannel, forwards messages (dumb pipe)

**Client state** (`client/src/state/{instance,project}_state.ts`):
- `createStore()` at module level (global, no Provider)
- Setter functions per event type (called by SSE handler only)
- Reactive export of the store (for components)
- Non-reactive getter functions using `unwrap()` (for caches/async code)
- Derived lookup tables recomputed from state (e.g. metric→module maps in project)
- **Rule: each level has one state file that exports ALL access patterns.** If you need data from instance or project state - reactive, non-reactive, or derived - you look in one file.

**Client SSE connection + boundary** (`client/src/state/{instance,project}_sse.ts`):
- `connect*SSE()` / `disconnect*SSE()`
- EventSource management, message parsing, routing to setters
- Retry with exponential backoff
- `*SSEBoundary` component: thin wrapper for lifecycle (`onMount`/`onCleanup`) + rendering gate (`Show when={isReady}`). Makes SSE lifecycle visible in the component tree. Children import global store directly - no Context, no hooks.

### What gets removed (Phase 2)

The current project SSE has its logic scattered across 6+ files in `client/src/components/project_runner/`:

- `provider.tsx` - SSE connection + store + setters (all mixed together)
- `context.tsx` - Context definition
- `hooks.tsx` - `useProjectDetail()`, `useProjectDirtyStates()`, etc.
- `global_pds.ts` - Non-reactive access for async contexts
- `utils.ts` - `validateTimestamp()`

All of this collapses into `client/src/state/project_state.ts` + `client/src/state/project_sse.ts`.

`global_module_maps.ts` is also deleted - its derived lookup tables and getter functions move into `project_state.ts`.

---

## Migration Strategy

### Phase 1 can be done incrementally:

1. Pre-work: Pull `structureUploadAttempt` out of `InstanceDetail` (step 1.0)
2. Add server-side infrastructure (types, BroadcastChannel, SSE endpoint, notify function) - no client changes yet, existing system still works
3. Add `notifyInstanceUpdate()` calls to all mutation routes - notifications flow but are unused by old client
4. Build client store + SSE connection manager
5. Migrate components one tab at a time (Projects tab, Data tab, Users tab, Assets tab, Settings tab)
6. Remove old `timQuery` / `instanceDetail` prop infrastructure

### Phase 2 is higher risk:

- Project SSE is load-bearing with module execution, dirty states, R logs
- Recommend building the new system alongside the old one first
- Switch over once the new system is proven
- Then remove old Context/Provider/hooks

---

## Resolved Questions

1. **Upload attempt state**: All upload attempts are component-local, not instance state. Structure upload attempt will be pulled out of InstanceDetail as pre-work (step 1.0). HMIS and HFA already work this way.

2. **Permissions / per-user data**: SSE broadcasts shared data only. SSE stays a dumb pipe - no per-connection filtering in the message forwarding path.
   - **Instance level**: All projects are sent to all users (it's fine for users to see project names they can't access). The client already hides UI based on permissions. No filtering needed.
   - **Project level**: `thisUserPermissions` is per-user metadata, not shared project state. It lives in the `ProjectState` store on the client, but is NOT included in broadcast SSE events. It is populated per-connection in the `starting` message (since the server knows who's connecting). When a `project_users_updated` event arrives, the client derives its own permissions from the broadcast data — `ProjectUser` already includes all `ProjectUserPermissions` fields, so the client finds its own email in the updated `ProjectUser[]` and extracts permissions directly. No extra HTTP request needed. If the user's email is not in the list, they've been removed from the project — navigate back to instance view. This keeps the SSE broadcast path simple (dumb pipe for all events except the initial `starting`). Note: `thisUserRole` is intentionally excluded from `ProjectState` — no client code reads it (all access control uses the granular `thisUserPermissions` booleans), and the server has a pre-existing bug hardcoding it to `"viewer"` anyway.
   - **Rule**: SSE broadcasts shared data. Per-user data is resolved on initial connection and re-fetched on relevant events.

3. **Project list notification**: Routes in `server/routes/project/project.ts` that change the project list need `notifyInstanceUpdate({ type: "projects_updated", data: updatedList })`: `createProject`, `deleteProject`, `copyProject` (after async copy), `updateProject` (label/settings), `setProjectLockStatus`. `addProjectUserRole` does NOT need this — all projects are sent to all users regardless of permissions (see #2 above).

4. **SSE connection lifecycle**: Connect after authentication completes (in `LoggedInWrapper.tsx`), stays open for the entire session. Instance data changes are infrequent so the connection is near-zero cost. Project views also benefit from up-to-date instance state (e.g. the project list). Disconnect on sign-out.

5. **Error recovery**: No action needed. On reconnect, the server sends a fresh `starting` message with complete current state, which overwrites the entire store via `reconcile()`. Any events missed during the gap are irrelevant. The only edge case (cache reads stale version during gap) is harmless - the stale cache entry sits unused and gets evicted by LRU once the new version arrives via the reconnect.
