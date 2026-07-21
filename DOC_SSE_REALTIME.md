# SSE & Real-Time Notifications

The server-side push system: in-process `BroadcastChannel` fan-out to two Server-Sent-Events streams (instance + project), the subscribe-before-build connection lifecycle, the typed `notify*` wrapper catalog (this doc owns it), and the `last_updated → notify → cache versionKey` triangle.

> This is **server push**. It is not the request-scoped NDJSON `StreamWriter` in [DOC_API_ROUTES.md](DOC_API_ROUTES.md) (that is one request, one response, streamed). The client *consumers* (`client/src/state/{instance,project}/t1_sse.tsx`) are governed by the client state docs ([DOC_STATE_RULES.md](DOC_STATE_RULES.md)); this doc is the producer + transport side. The `last_updated` write side is [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md); the cache version side is [DOC_VALKEY_CACHE.md](DOC_VALKEY_CACHE.md).

---

## Principles

1. **Mutations don't return fresh state — they broadcast it.** A route mutates, then `notify*()`s; clients refetch from the SSE feed. Clients never poll and never refetch off a mutation response. (This is the server half of the client rule "never manually trigger refetch.")
2. **One typed `notify*` wrapper per event type.** Call sites never build a raw SSE message — they call a named wrapper that owns the `{ type, data }` shape.
3. **Subscribe before you build.** Subscribe to the channel *first*, then build the initial snapshot, then drain anything that arrived during the build. This is the whole reason the project endpoint is "v2".
4. **`last_updated` is the universal version token.** The same timestamp that a write bumps is broadcast to SSE clients and used as the cache version key.

---

## The System

```text
  Route handler (after a successful DB write)
    │  notifyLastUpdated(projectId, "reports", [id], lastUpdated)
    │  + refetch list → notifyProjectReportsUpdated(projectId, list)
    ▼
  notify* wrapper  → broadcastChannel.postMessage({ type, data [, projectId] })
    │                 (in-process BroadcastChannel: reaches main thread AND workers)
    ▼
  SSE endpoint listener  → filters by projectId (project channel) → stream.writeSSE(JSON)
    │
    ▼
  Client EventSource (t1_sse.tsx) → updates T1 store → reactive cache versionKey changes → UI refetches
```

There are exactly **two** broadcast channels, each with one SSE endpoint:

| Channel | Endpoint | File | Guard |
|---------|----------|------|-------|
| `"instance_updates"` | `GET /instance_updates` | `routes/instance/instance-sse.ts` | `requireGlobalPermission()` (hard-deny) |
| `"project_updates_v2"` | `GET /project_sse_v2/:project_id` | `routes/project/project-sse-v2.ts` | `getGlobalUser` + `getProjectUserForSSE` (hard-deny, like instance) |

(`BroadcastChannel` in Deno is in-process: it fans out across the main thread and all Web Workers in the same process — which is how a background worker's progress reaches the main-thread SSE connection. See [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md).)

### The message contract (discriminated unions)

`lib/types/instance_sse.ts` (`InstanceSseMessage`) and `lib/types/project_sse.ts` (`ProjectSseMessage`) are discriminated unions keyed by `type`. The first message on any connection is always `{ type: "starting", data: <full state> }`; `{ type: "error", data: { message } }` terminates with an error. Project messages carry an extra `projectId` on the wire (stripped before forwarding) so the endpoint can filter to its project.

### Connection lifecycle — subscribe-before-build

Both endpoints use Hono's `streamSSE` and follow the same six steps; the project endpoint's doc-comment names this as the fix for the v1 drop race:

```text
1. Authenticate — hard-deny unauthenticated clients (both endpoints)
2. Subscribe to the BroadcastChannel  ← FIRST, so nothing is missed during build
3. Build the full initial state from the DB (buildProjectState / getInstanceDetail+summaries)
4. writeSSE({ type: "starting", data: state })
5. Drain messages queued during step 3
6. Forward all subsequent messages until the connection closes
   ↳ Abort: stream.onAbort() wakes the park loop / closes the ReadableStream controller;
     stream.aborted is checked after build and at the top of the forward loop.
     cleanup in finally (project: removeEventListener + broadcastReceiver.close();
     instance: broadcastReceiver.close(), which implicitly drops its listener).
```

The two implementations diverge mechanically (and shouldn't):
- **instance** uses a `queue: []` + `ReadableStream` controller; the listener enqueues to the controller once it exists, else pushes to the queue.
- **project** uses a `messageQueue: []` + a `notifyNewMessage` promise loop.

### The notify catalog (producer side)

**This doc is the normative owner of the notify layer.** Every broadcast goes through a typed wrapper — never call `postMessage` directly.

`server/task_management/notify_instance_updated.ts` — `notifyInstanceUpdate(message)` posts to `"instance_updates"`. Wrappers:

| Wrapper | `type` |
|---------|--------|
| `notifyInstanceConfigUpdated` | `config_updated` |
| `notifyInstanceProjectsLastUpdated` | `projects_last_updated` |
| `notifyInstanceUsersUpdated` | `users_updated` |
| `notifyInstanceAssetsUpdated` | `assets_updated` |
| `notifyInstanceGeoJsonMapsUpdated` | `geojson_maps_updated` |
| `notifyInstanceStructureUpdated` | `structure_updated` |
| `notifyInstanceIndicatorsUpdated` | `indicators_updated` |
| `notifyInstanceDatasetsUpdated` | `datasets_updated` |

`server/task_management/notify_project_v2.ts` — `notifyProjectV2(projectId, message)` spreads `projectId` in and posts to `"project_updates_v2"`. Wrappers: `notifyProjectConfigUpdated`, `notifyProjectModulesUpdated`, `notifyProjectDatasetsUpdated`, `notifyProjectVisualizationsUpdated`, `notifyProjectVisualizationFoldersUpdated`, `notifyProjectSlideDecksUpdated`, `notifyProjectSlideDeckFoldersUpdated`, `notifyProjectReportsUpdated`, `notifyProjectReportFoldersUpdated`, `notifyProjectDashboardsUpdated`, `notifyProjectUsersUpdated`, `notifyProjectLastUpdatedV2`, `notifyProjectModuleDirtyState`, `notifyProjectAnyRunning`, `notifyProjectRScript`.

### The redundant `last_updated` indirection ⚠️

`server/task_management/notify_last_updated.ts` is a **one-line passthrough**:

```ts
notifyLastUpdated(projectId, tableName, ids, lastUpdated)   // 96 call sites
  → notifyProjectLastUpdatedV2(projectId, tableName, ids, lastUpdated)
    → notifyProjectV2(projectId, { type: "last_updated", data: { tableName, ids, lastUpdated } })
```

Call sites use `notifyLastUpdated` (re-exported via `task_management/mod.ts`); the `…V2` layer has effectively no direct callers. Three layers for one event — a documented collapse candidate (see enforcement). For now: **call `notifyLastUpdated`** from routes.

### The mutation recipe

The canonical post-write sequence (see `server/routes/project/reports.ts` for every variant):

```ts
const res = await createReport(c.var.ppk.projectDb, body.label, body.folderId);
if (!res.success) return c.json(res);

// 1. row-level: tell clients this row's last_updated changed (cache invalidation)
notifyLastUpdated(c.var.ppk.projectId, "reports", [res.data.reportId], res.data.lastUpdated);

// 2. list-level: refetch the summary list and broadcast it whole
const list = await getAllReports(c.var.ppk.projectDb);
if (list.success) notifyProjectReportsUpdated(c.var.ppk.projectId, list.data);

return c.json(res);
```

One deliberate exception: **report collab checkpoints** fire the row-level
notify on every ~1.5s checkpoint but debounce the list-level rebroadcast
(~5s per project, `scheduleReportsListRebroadcast` in
`server/routes/project/project-collab.ts`) — the list rebroadcast loads every
report's body via `getAllReports`, which is far too heavy per checkpoint while
someone is typing.

### The `last_updated → SSE → cache` triangle

This single mechanism spans three docs:

```text
  DB write bumps last_updated / last_run_at        ← DOC_DB_ACCESS_LAYER (write side)
        │
        ├─► notifyLastUpdated(...) broadcast        ← THIS DOC (push side)
        │       → client T1 store stores timestamp
        │       → reactive cache versionKey changes → UI refetches
        │
        └─► same timestamp = Valkey versionHash     ← DOC_VALKEY_CACHE (invalidation side)
                next read: version mismatch → cache miss → fresh data
```

The load-bearing invariant: **every realtime/cached read model is keyed on a version column (`last_updated` / `last_run_at`) that *every* write path bumps.** A write that forgets to bump leaves clients and caches stale with no error.

---

## Rules

1. **After a successful mutation, notify — never return fresh lists for the client to install.** Bump `last_updated`, `notifyLastUpdated`, refetch the affected list, `notify*Updated`.
2. **Use a typed wrapper.** If a new event type is needed, add a `notify<Thing>Updated` wrapper and a union member in the `*SseMessage` type — don't `postMessage` a raw object.
3. **Guard the list refetch with `if (res.success)`** before broadcasting it (but see the stale-on-failure gotcha).
4. **Subscribe before building** in any new SSE endpoint, and clean up the `BroadcastChannel` in a `finally`.
5. **Reuse the canonical auth lookups** for SSE auth (`getGlobalUser`/`getProjectUser`) — see [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md).

---

## What NOT to do

- **Don't build SSE messages inline.** A raw `{ type, data }` at a call site bypasses the catalog and drifts from the union type.
- **Don't return updated data in the mutation response expecting the client to use it.** The client installs state from SSE; a mutation response is just `success`/`err`.
- **Don't add a new `_v2`/`_v3` suffix.** The existing `_v2` is vestigial (there is no surviving v1). Don't extend the pattern; ideally retire it (enforcement).
- **Don't reimplement the connection lifecycle** a third way — factor the existing two, don't add another.

---

## Gotchas

- **Project SSE hard-denies unauthenticated clients.** `getGlobalUser` is called before `streamSSE`; a `NOT_AUTHENTICATED` result returns 401 immediately. `resolveProjectUserAccess` (the same shared core the route middleware uses — central-reporting gate, admin/H_USERS grant, role row with ≥1 `can_` flag) then checks project access; a deny returns 403, a DB failure 503. Open-access mode does NOT bypass this — anonymous SSE is not supported.
- **`projectsLastUpdated` is server-stamped `new Date()` in `starting`.** Every SSE reconnect triggers a redundant `/my_projects` refetch on the client, even when the projects list hasn't changed. This is harmless but slightly wasteful; a targeted invalidation or a client-side staleness check would eliminate it.
- **A failed post-write refetch silently strands clients.** `if (list.success)` means a failed refetch sends *nothing* — clients stay stale until the next mutation. At minimum log it; better, always send `last_updated` so clients self-invalidate.
- **Channel-name strings are duplicated** between producer (`notify_*` files) and consumer (SSE endpoints). A one-character drift silently breaks delivery with no error. Use a shared constant.
- **Vestigial `_v2`** appears on the route path, channel string, filename, and `notifyProjectLastUpdatedV2` — but only on the project side; the instance side has no suffix. Don't assume a v1 exists.
- **Reconnect/parse divergence.** The two client consumers use different reconnect-attempt counts and parse strategies — align them behind one documented connection contract (client-side; noted here for completeness).

---

## Enforcement opportunities

- **Collapse the notify layers:** remove the `notify_last_updated` → `…V2` → `notifyProjectV2` indirection; document the single layer call sites use.
- **Retire the `_v2` suffix** (no v1 remains) via a deliberate one-time rename, or document why it stays.
- **Shared channel-name constants** instead of duplicated string literals.
- **Factor one canonical SSE connection helper** (subscribe-before-build, drain, forward, cleanup) used by both endpoints; drop `c: any`/`mainDb: any`.
- **Define failed-refetch handling** (log, or always emit `last_updated`).
- **Lint for raw `postMessage`/inline SSE messages** outside the `notify_*` files.

---

## Adding a real-time-updated entity — checklist

- [ ] Add a union member to `lib/types/project_sse.ts` or `instance_sse.ts` (`{ type, data }`)
- [ ] Add a `notify<Thing>Updated` wrapper in the matching `notify_*` file
- [ ] Include the entity in the `starting` snapshot builder (`buildProjectState` / `getInstanceDetail`+summaries) so a fresh connection sees it
- [ ] In each mutating route: bump `last_updated`, `notifyLastUpdated`, refetch list, `notify<Thing>Updated`
- [ ] Confirm the client consumer (`t1_sse.tsx`) handles the new `type`

---

## Key files

| File | Purpose |
|------|---------|
| `server/routes/instance/instance-sse.ts` | `/instance_updates` SSE endpoint |
| `server/routes/project/project-sse-v2.ts` | `/project_sse_v2/:project_id` SSE endpoint |
| `server/task_management/notify_instance_updated.ts` | instance notify catalog |
| `server/task_management/notify_project_v2.ts` | project notify catalog + `notifyProjectV2` |
| `server/task_management/notify_last_updated.ts` | `notifyLastUpdated` (the passthrough) |
| `lib/types/instance_sse.ts`, `lib/types/project_sse.ts` | discriminated message unions |
| `server/task_management/build_project_state.ts` | project `starting` snapshot |
| `client/src/state/{instance,project}/t1_sse.tsx` | client consumers (see client state docs) |
