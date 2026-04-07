# State Management

## Overview

The app has two levels of state, both managed via SSE (Server-Sent Events) with the same architecture:

- **Instance state** -- shared across all projects (users, indicators, structure, datasets, config, assets)
- **Project state** -- scoped to a single project (modules, visualizations, reports, dirty states, metrics)

Both follow the same pattern: server pushes updates via SSE, client stores state in a global Solid `createStore`, components read reactively or via non-reactive getters.

## Architecture (same for both levels)

Each level has 5 files, one per concern:

| Concern | Instance | Project |
| --- | --- | --- |
| Types (state shape, SSE events) | `lib/types/instance_sse.ts` | `lib/types/project_sse.ts` |
| Server notifications | `server/task_management/notify_instance_updated.ts` | `server/task_management/notify_project_updated.ts` |
| Server SSE endpoint | `server/routes/instance/instance-sse.ts` | `server/routes/project/project-sse.ts` |
| Client state (store + getters) | `client/src/state/instance_state.ts` | `client/src/state/project_state.ts` |
| Client SSE connection + boundary | `client/src/state/instance_sse.ts` | `client/src/state/project_sse.ts` |

## Reading state in components (reactive)

Import the store directly. Solid tracks which fields you read and only re-renders when those specific fields change.

```tsx
import { instanceState } from "~/state/instance_state";
import { projectState } from "~/state/project_state";

// In JSX -- reactive, re-renders when projects change
<For each={instanceState.projects}>{(p) => <div>{p.label}</div>}</For>

// In JSX -- reactive, re-renders when visualizations change
<For each={projectState.visualizations}>{(v) => <div>{v.label}</div>}</For>
```

Use reactive access when: rendering in JSX, inside `createEffect`, inside `createMemo`.

## Reading state in caches / async code (non-reactive)

Use the exported getter functions. These call `unwrap()` to avoid creating reactive tracking dependencies.

```typescript
import { getIndicatorMappingsVersion, getDatasetVersionHmis } from "~/state/instance_state";
import { getModuleIdForMetric, getModuleLastRun } from "~/state/project_state";

// In cache version key computation
const version = `${getDatasetVersionHmis()}_${getIndicatorMappingsVersion()}`;

// In async function
const moduleId = getModuleIdForMetric(metricId);
const lastRun = getModuleLastRun(moduleId);
```

Use non-reactive access when: inside async functions, cache operations, event handlers, or any context where you just need the current value without triggering re-renders.

## State fields as cache version keys

Some state fields serve double duty -- they're displayed in the UI AND used as version keys by the reactive cache system. For example, `instanceState.datasetVersions.hmis` is shown as the current dataset version number, but it's also read by the HMIS display cache to detect when cached data is stale. When the version changes via SSE, the cache naturally misses on next access. Same for `indicatorMappingsVersion`. There's no separate cache invalidation mechanism -- the version information is just regular state fields that caches happen to read.

## Derived lookup tables

Some getters return values from derived lookup tables rather than directly from the store. For example, `getModuleIdForMetric()` in `project_state.ts` reads from a precomputed map that's rebuilt when modules/metrics change via SSE. From the consumer's perspective, these work identically to other non-reactive getters. The distinction is an implementation detail inside the state file.

## Writing state

**Never update the store directly from components.** State is updated exclusively through SSE events. The SSE connection manager (`instance_sse.ts` / `project_sse.ts`) receives messages and calls setter functions in the state file.

After a mutation (e.g. adding a user), the server route handler broadcasts a notification via `BroadcastChannel`. The SSE endpoint forwards it to all connected clients. The client's SSE handler updates the store. All components reading the affected fields re-render automatically.

```
Component calls mutation API
  → Server route handler performs mutation
  → Server calls notifyInstanceUpdate({ type: "users_updated", data: updatedUsers })
  → BroadcastChannel forwards to SSE endpoint
  → SSE endpoint sends to all connected clients
  → Client SSE handler calls updateInstanceUsers(users) in instance_state.ts
  → Store updates, reactive components re-render
```

**Do NOT call `silentFetch()`, `fetch()`, or manually refetch after mutations.** SSE handles it.

## SSE boundary components

Each level has a boundary component that manages the SSE connection lifecycle:

```tsx
// Instance -- wraps the entire authenticated app
<InstanceSSEBoundary>
  <Instance ... />
</InstanceSSEBoundary>

// Project -- wraps project content
<ProjectSSEBoundary projectId={projectId}>
  {/* project content */}
</ProjectSSEBoundary>
```

These handle `onMount` (connect), `onCleanup` (disconnect), and gate rendering on `isReady`. Children import state directly -- no Context, no hooks.

## What is NOT in SSE state

Some data is too heavy or too transient for SSE. These are fetched independently on demand:

**Instance level** (fetched by components, not in `InstanceState`):
- Full indicator lists (with mappings) -- much larger than the counts in state
- Structure items (facility/admin area rows)
- Dataset display items (HMIS/HFA data rows) -- use reactive cache with version keys from instance state
- Upload attempt state (structure, HMIS, HFA) -- component-local, transient workflow
- User logs, compare projects data

**Project level** (fetched by components, not in `ProjectState`):
- Presentation object detail/items -- use reactive cache with `lastUpdated` version keys from project state
- Results object data
- AI conversation history

## Other state types (not SSE-managed)

- **`GlobalUser`** -- per-user bootstrap data, fetched once at auth. Contains `email`, `isGlobalAdmin`, `thisUserPermissions`, `instanceLanguage`, `instanceCalendar`. Not reactive, not SSE-managed.
- **`InstanceMeta`** -- server health/version info, fetched on demand (pre-auth login page, server info dialog). Not reactive, not SSE-managed.
- **Component-local state** -- `createSignal()` for temporary UI state (search text, selected tab, loading flags). Does not need to be shared.

## Key rules

1. **One state file per level exports ALL access patterns.** Reactive store, non-reactive getters, and derived lookups all live in the same file.
2. **Never update state from components.** SSE is the only write path.
3. **Use reactive access in rendering, non-reactive getters in async/cache code.**
4. **No Context, no hooks, no prop threading for state.** Import directly from the state file.
5. **No `silentFetch()` or manual refetch after mutations.** SSE handles propagation.
6. **Heavy data stays in independent fetches / reactive caches.** Use version keys from state for cache invalidation.
