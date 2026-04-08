# Instance-Level State Management

## Overview

Instance state is shared across all projects: users, indicators, structure, datasets, config, assets, and current user permissions. Managed via SSE (Server-Sent Events) — server pushes updates, client stores state in a global Solid `createStore`, components read reactively or via non-reactive getters.

For project-level state management, see `DOC_STATE_MGT_PROJECT.md`.

## Architecture

5 files, one per concern:

| Concern | File |
| --- | --- |
| Types (state shape, SSE events) | `lib/types/instance_sse.ts` |
| Server notifications | `server/task_management/notify_instance_updated.ts` |
| Server SSE endpoint | `server/routes/instance/instance-sse.ts` |
| Client state (store + getters) | `client/src/state/instance/t1_store.ts` |
| Client SSE connection + boundary | `client/src/state/instance/t1_sse.tsx` |

---

## Five Tiers

Every piece of instance-level state belongs to exactly one tier. See `DOC_STATE_MGT_TIERS.md` for the full tier definitions, file naming conventions, and directory structure.

---

## Tier 1: SSE store (`InstanceState`)

Lightweight metadata. Pushed via SSE on every change. Components read directly from the store — no fetching, no loading states, instant on every navigation.

**File:** `client/src/state/instance/t1_store.ts`

| Data | Fields on `InstanceState` | SSE event | Version key for T2 caches |
| --- | --- | --- | --- |
| Instance config | `instanceName`, `maxAdminArea`, `countryIso3`, `facilityColumns` | `config_updated` | — |
| Projects | `projects` (full `ProjectSummary[]`) | `projects_updated` | — |
| Users | `users` (full `OtherUser[]`) | `users_updated` | — |
| Assets | `assets` (full `AssetInfo[]`) | `assets_updated` | — |
| GeoJSON maps | `geojsonMaps` (full `GeoJsonMapSummary[]`) | `geojson_maps_updated` | — |
| Structure summary | `structure` (counts), `structureLastUpdated` | `structure_updated` | `structureLastUpdated` |
| Indicator summary | `indicators` (counts), `indicatorMappingsVersion`, `hfaIndicatorsVersion` | `indicators_updated` | `indicatorMappingsVersion`, `hfaIndicatorsVersion` |
| HMIS dataset summary | `datasetsWithData`, `datasetVersions.hmis`, `hmisNVersions` | `datasets_updated` | `datasetVersions.hmis` |
| HFA dataset summary | `datasetsWithData`, `datasetVersions.hfa`, `hfaTimePoints`, `hfaCacheHash` | `datasets_updated` | `hfaCacheHash` |
| Current user | `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, `currentUserPermissions` | `users_updated` (re-derived) | — |

**Why these are on SSE state:** They're small, needed across multiple views (sidebar counts, landing cards, staleness checks, cache version keys), and benefit from real-time multi-user sync.

**Per-connection fields:** `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, and `currentUserPermissions` are per-user — each SSE connection receives its own values in the `starting` message. On `users_updated`, the client re-derives them by finding the current user in the updated list. All other T1 fields are identical across all clients.

### Reading state in components (reactive)

Import the store directly. Solid tracks which fields you read and only re-renders when those specific fields change.

```tsx
import { instanceState } from "~/state/instance/t1_store";

// In JSX -- reactive, re-renders when projects change
<For each={instanceState.projects}>{(p) => <div>{p.label}</div>}</For>
```

Use reactive access when: rendering in JSX, inside `createEffect`, inside `createMemo`.

### Reading state in caches / async code (non-reactive)

Use the exported getter functions. These call `unwrap()` to avoid creating reactive tracking dependencies.

```typescript
import { getIndicatorMappingsVersion, getDatasetVersionHmis } from "~/state/instance/t1_store";

// In cache version key computation
const version = `${getDatasetVersionHmis()}_${getIndicatorMappingsVersion()}`;
```

Use non-reactive access when: inside async functions, cache operations, event handlers, or any context where you just need the current value without triggering re-renders.

### State fields as cache version keys

Some state fields serve double duty — they're displayed in the UI AND used as version keys by the T2 reactive cache system. For example, `instanceState.datasetVersions.hmis` is shown as the current dataset version number, but it's also read by the HMIS display cache to detect when cached data is stale. When the version changes via SSE, the cache naturally misses on next access. Same for `indicatorMappingsVersion`. There's no separate cache invalidation mechanism — the version information is just regular state fields that caches happen to read.

### Writing state

**Never update the store directly from components.** State is updated exclusively through SSE events. The SSE connection manager (`t1_sse.tsx`) receives messages and calls setter functions in the state file.

After a mutation (e.g. adding a user), the server route handler broadcasts a notification via `BroadcastChannel`. The SSE endpoint forwards it to all connected clients. The client's SSE handler updates the store. All components reading the affected fields re-render automatically.

```
Component calls mutation API
  → Server route handler performs mutation
  → Server calls notifyInstanceUpdate({ type: "users_updated", data: updatedUsers })
  → BroadcastChannel forwards to SSE endpoint
  → SSE endpoint sends to all connected clients
  → Client SSE handler calls updateInstanceUsers(users) in t1_store.ts
  → Store updates, reactive components re-render
```

**Do NOT call `silentFetch()`, `fetch()`, or manually refetch after mutations.** SSE handles it.

### SSE boundary component

`InstanceSSEBoundary` manages the SSE connection lifecycle:

```tsx
<InstanceSSEBoundary>
  <Instance ... />
</InstanceSSEBoundary>
```

Handles `onMount` (connect), `onCleanup` (disconnect), and gates rendering on `instanceState.isReady`. Children import state directly — no Context, no hooks.

---

## Tier 2: Reactive cache

Medium-to-heavy data that is too large for SSE but still needs to be reactive. Cached in memory + IndexedDB. **Reactive** — a `createEffect` watches the version key from T1, so when SSE pushes a new version, the effect fires, the cache misses, and the component automatically re-fetches.

| Data | File | Cache version key(s) | Why cached, not on SSE |
| --- | --- | --- | --- |
| HMIS display items (data rows) | `instance/t2_datasets.ts` | `datasetVersions.hmis` + `indicatorMappingsVersion` | Potentially thousands of rows |
| HFA display items (data rows) | `instance/t2_datasets.ts` | `hfaCacheHash` | Potentially thousands of rows |
| Indicator full list (with mappings) | `instance/t2_indicators.ts` | `indicatorMappingsVersion` | Hundreds of objects with nested mapping arrays |
| HFA indicator full list | `instance/t2_indicators.ts` | `hfaIndicatorsVersion` | Full indicator objects (metadata + sort order) |
| Structure items (facility/admin area rows) | `instance/t2_structure.ts` | `structureLastUpdated` + `maxAdminArea` + `facilityColumnsHash` | Potentially thousands of rows |
| GeoJSON map data | `instance/t2_geojson.ts` | `uploadedAt` per admin level | Large GeoJSON feature collections |

**Client pattern** (same for all T2 data):

```typescript
// 1. StateHolder signal for loading/error/ready
const [data, setData] = createSignal<StateHolder<MyDataType>>({
  status: "loading",
  msg: "Loading...",
});

// 2. createEffect watches version key(s) from T1 store (reactive reads)
createEffect(async () => {
  const version = instanceState.indicatorMappingsVersion; // reactive — triggers re-run on SSE update
  setData({ status: "loading", msg: "Loading..." });
  const res = await getFromCacheOrFetch(version);
  if (res.success) {
    setData({ status: "ready", data: res.data });
  } else {
    setData({ status: "error", err: res.err });
  }
});

// 3. StateHolderWrapper for rendering (same as always)
<StateHolderWrapper state={data()}>
  {(keyedData) => <Table data={keyedData} ... />}
</StateHolderWrapper>
```

**How reactivity works:**

1. SSE pushes a new version key to T1 store (e.g. `indicatorMappingsVersion` changes)
2. `createEffect` re-runs because it reactively reads the version key
3. Cache `.get()` misses (version changed → different cache key)
4. Fresh data is fetched from the server and cached
5. Component re-renders with new data

**On revisit (same version):** Cache hits → instant render, no loading spinner, no server fetch.

**On revisit (version changed while away):** Cache misses → fetch → render. User sees a brief loading state.

**After own mutation:** SSE broadcasts the version change → `createEffect` fires → same flow as above. No `silentFetch()` or `silentRefreshIndicators()` callbacks needed. SSE handles propagation.

**Multi-user sync:** If User B changes data while User A is viewing it, User A's view updates automatically (SSE → version key change → createEffect → re-fetch).

**Cache implementation:** Uses `createReactiveCache` from `client/src/state/_infra/reactive_cache.ts`. All use `pdsNotRequired: true` since they're instance-level.

---

## Tier 3: On-demand fetch

Transient or audit data fetched fresh from the server every time. Not reactive — changes by other users do not propagate. Not cached — always hits the server.

| Data | Component | Why T3, not T2 |
| --- | --- | --- |
| Structure upload attempt | `structure/index.tsx` | Transient per-user workflow; component-local signal + polling |
| HMIS upload attempt | `instance_dataset_hmis/index.tsx` | Transient per-user workflow; component-local signal + polling |
| HFA upload attempt | `instance_dataset_hfa/index.tsx` | Transient per-user workflow; component-local signal + polling |
| User logs | `instance/instance_users.tsx` | Audit data; should be fresh; table renders instantly without it |
| HMIS version history | `instance_dataset_hmis/_previous_imports.tsx` | On-demand modal; user explicitly requests it |
| Compare projects data | `instance/compare_projects.tsx` | On-demand modal; cross-project aggregation |
| HFA indicator code | `instance/hfa_indicator_code_editor.tsx` | Editor-only; R code loaded on editor open |
| HFA dictionary for validation | `instance/hfa_indicator_code_editor.tsx` | Validation data loaded on editor open |
| User permissions | `instance/user.tsx` | Per-user editor; fetched on editor open |
| User default project permissions | `instance/project_permission_form.tsx` | Per-user per-project editor; fetched on editor open |
| Project user permissions | `instance/project_permission_form.tsx` | Per-user per-project editor; fetched on editor open |
| Instance meta (server info) | `instance/instance_meta_form.tsx` | On-demand modal; diagnostic info |
| Current user (profile refresh) | `instance/profile.tsx` | Profile modal; re-fetches GlobalUser for freshness |
| GlobalUser (bootstrap) | `LoggedInWrapper.tsx` | Fetched once at auth; per-user bootstrap for language/calendar/permissions |
| InstanceMeta (login page) | `LoggedInWrapper.tsx` | Pre-auth or diagnostic; not shared state |

**Why these are fetched fresh:** Upload attempts are actively changing during a workflow and need real-time status. Logs should always be current. GlobalUser and InstanceMeta are needed before SSE connects (pre-auth or bootstrap). The rest are on-demand modals/editors where a fresh fetch is expected.

**No state files.** T3 data lives as component-local signals or local variables. The fetch-and-use pattern is embedded directly in the component that needs the data.

---

## Tier 4: Client-persistent state

State that originates on the client, persists across component mounts and navigation, but is NOT backed by the server. Stored in localStorage, sessionStorage, or module-level signals/stores that outlive any single component.

| Data | File | Storage mechanism | Why T4, not T5 |
| --- | --- | --- | --- |
| DHIS2 session credentials | `instance/t4_dhis2_session.ts` | sessionStorage | Persists across DHIS2 import wizard steps; cleared on tab close |

**Why these have state files:** The state needs to be importable from multiple components and persist across navigation. A `createSignal()` inside a component would die on unmount; these must outlive their originating component.

---

## Tier 5: Component-local state

Temporary UI state scoped to a single component. `createSignal()` for search text, selected tabs, loading flags, form inputs. Does not persist across navigation. Does not need to be shared.

**No state files.** By definition, T5 state lives inside the component function that creates it.

---

## Key Rules

1. **Every piece of instance state belongs to exactly one tier.** If you can't classify it, the tier system needs updating, not a workaround.
2. **One state file per level exports ALL access patterns.** Reactive store, non-reactive getters, and derived lookups all live in the same file.
3. **Never update T1 state from components.** SSE is the only write path.
4. **Use reactive access in rendering, non-reactive getters in async/cache code.**
5. **No Context, no hooks, no prop threading for state.** Import directly from the state file.
6. **No `silentFetch()` or manual refetch after mutations.** SSE handles propagation.
7. **Heavy data stays in T2 cached fetches.** Use version keys from T1 for cache invalidation.
8. **Upload attempts are always T3 component-local.** They're transient per-user workflow state, not shared.
