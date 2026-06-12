# State Management Tier System

> ⚠️ **Before writing state code, read `DOC_STATE_RULES.md`.** It's a short
> hit-list of rules that have each produced real production bugs (notably around
> Solid.js reactive tracking, SSE-driven invalidation, and when to use
> `createQuery` vs `createEffect`). This doc explains the architecture; the rules
> doc tells you what not to write.

This document defines the 5-tier classification used across all state management
in the app. Both instance-level (`DOC_STATE_MGT_INSTANCE.md`) and project-level
(`DOC_STATE_MGT_PROJECT.md`) state use the same tier system.

Every piece of state belongs to exactly one tier. If you can't classify it, the
tier system needs updating, not a workaround.

## Tiers

| Tier | Name              | Data origin                                            | Reactive via SSE?                                         | Has state files?                        | File prefix |
| ---- | ----------------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------- | ----------- |
| T1   | SSE store         | Server pushes to client                                | Yes — real-time, multi-user                               | Yes                                     | `t1_`       |
| T2   | Reactive cache    | Client fetches from server, version-keyed by T1 fields | Yes — refetches automatically when T1 version key changes | Yes                                     | `t2_`       |
| T3   | On-demand fetch   | Client fetches from server                             | No — fetched fresh every time, not cached, not reactive   | No — lives in components                | —           |
| T4   | Client-persistent | Originates on client                                   | No                                                        | Yes                                     | `t4_`       |
| T5   | Component-local   | Originates on client                                   | No                                                        | No — `createSignal()` inside components | —           |

## T1: SSE store

Lightweight metadata pushed via SSE on every change. Components read directly
from a global `createStore` — no fetching, no loading states, instant on every
navigation.

- **Write path:** SSE only. Never update the store from components. Server
  mutation → `BroadcastChannel` → SSE endpoint → client SSE handler → store
  setter.
- **Read path (reactive):** Import the store directly. Solid tracks field-level
  dependencies automatically.
- **Read path (non-reactive):** Use exported getter functions that call
  `unwrap()`. For use in async code, caches, and event handlers.
- **Files:** `t1_store.ts` (store, setters, getters), `t1_sse.tsx` (SSE
  connection manager + boundary component).

## T2: Reactive cache

> ⚠️ **Critical: read all reactive state at the TOP of `createEffect`, before
> any conditional logic, and before any `await`.** Solid's tracking context is
> synchronous. Reads behind an early-return or after an `await` are silently
> untracked, and the effect won't re-run when those signals change. See
> `DOC_STATE_RULES.md` rules #1 and #2.

Medium-to-heavy data too large for SSE but still needs to be reactive. Cached in
memory + IndexedDB.

### Live reads vs snapshot reads

T2 data can be consumed in two modes. Both are legitimate; the choice depends on
view lifetime.

- **Live read** — `createSignal<StateHolder<T>>` + `createEffect` watching the
  T1 version key. When SSE pushes a new version, the effect re-runs and the
  cache misses, producing fresh data. **Required for long-lived views**
  (editors, lists, thumbnails) that should stay in sync with SSE updates.
- **Snapshot read** — `createQuery`. Captures state at mount and ignores subsequent
  changes. **Acceptable only for short-lived consumers** (picker modals,
  dropdowns that close after selection) where SSE updates during the view's
  lifetime aren't consumed.

When in doubt, prefer live read. The two modes are described in detail under
`DOC_STATE_RULES.md` rule #6.

### Live-read details

- **Invalidation:** Driven by T1 version key fields. No manual `silentFetch()`
  or refetch calls needed.
- **On revisit (same version):** Cache hit — instant render, no server fetch.
- **On revisit (version changed):** Cache miss — fetch, render. Loading state
  depends on cache type (see below).
- **Multi-user sync:** SSE updates version key → `createEffect` fires → cache
  misses → fresh data fetched.
- **Files:** One `t2_` file per data domain. Each file is self-contained —
  defines its cache instances AND exports its access functions.

### Two variants of T2

There are **two distinct variants** of T2 data with different loading-state
semantics. Choosing the wrong variant produces bad UX (a flash to "Loading..."
every time something changes incrementally).

#### Variant A — Whole-collection caches

A single version key invalidates the _entire_ collection. Examples: HMIS dataset
rows (`datasetVersions.hmis`), indicator mappings (`indicatorMappingsVersion`),
structure items (`structureLastUpdated`). When the version changes, every row is
potentially different.

- **Show loading on every effect re-run.** The previous data is no longer
  trustworthy; a brief loading flash is appropriate.
- Used by: most instance-level T2 caches.

**Canonical pattern (Variant A):**

```tsx
const [data, setData] = createSignal<StateHolder<MyDataType>>({
  status: "loading",
});

createEffect(async () => {
  const version = instanceState.indicatorMappingsVersion; // reactive read from T1
  setData({ status: "loading" });
  const res = await getIndicatorsFromCacheOrFetch(version);
  if (res.success) {
    setData({ status: "ready", data: res.data });
  } else {
    setData({ status: "error", err: res.err });
  }
});

<StateHolderWrapper state={data()}>
  {(d) => <Table data={d} />}
</StateHolderWrapper>;
```

#### Variant B — Per-entity caches

A version key per individual entity, e.g. `lastUpdated.dashboards[dashboardId]`,
`lastUpdated.slide_decks[deckId]`, `lastUpdated.presentation_objects[poId]`.
When the version changes, only that ONE entity's data has changed — usually an
incremental update (one item added, one field edited).

- **DO NOT show loading on effect re-runs after the first.** The user is
  actively looking at this entity; flashing to "Loading..." every time they (or
  another user) edits it is jarring. Initialize the signal to `loading` once,
  then let stale data stay visible until the new data arrives.
- Used by: project-level per-entity T2 caches (dashboards, slide decks,
  presentation objects, slides).

**Canonical pattern (Variant B) — initialize-once, no loading flash on
re-runs:**

```tsx
const [data, setData] = createSignal<StateHolder<MyDataType>>({
  status: "loading",
});

createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[dashboardId]; // reactive read for tracking only
  // NOTE: No setData({ status: "loading" }) here.
  // Stale data stays visible while the refetch is in flight.
  const res = await getDashboardDetailFromCacheOrFetch(projectId, dashboardId);
  if (res.success) {
    setData({ status: "ready", data: res.data });
  } else {
    setData({ status: "error", err: res.err });
  }
});

<StateHolderWrapper state={data()}>
  {(d) => <DashboardView dashboard={d} />}
</StateHolderWrapper>;
```

This gives:

- ✅ Loading flash on first mount (signal default)
- ✅ No flash on SSE-triggered refetches — stale data stays visible until new
  data arrives
- ⚠️ Error replaces the stale data if refetch fails (acceptable trade-off; rare
  in practice)

### Anti-patterns (do not write these)

These look reasonable but break the SSE-driven model. They are the most common
mistakes made by people who haven't read this section carefully.

```tsx
// ❌ WRONG — snapshot read (createQuery) used in a long-lived editor.
// The editor stays mounted for minutes; SSE updates will not be reflected.
// Use a live read here.
const dataQuery = createQuery(
  () => getDashboardDetailFromCacheOrFetch(projectId, dashboardId),
);
// (createQuery for the SAME function in a short-lived picker modal is fine — see rule #6.)
```

```tsx
// ❌ WRONG — `createQuery` has no `queryKey`. Unlike TanStack Query /
// React Query, signal reads inside `queryFunc` are NOT tracked.
// `queryFunc` runs exactly once on mount; `refreshKey()` is dead code
// and `refresh()` does nothing.
const [refreshKey, setRefreshKey] = createSignal(0);
const dataQuery = createQuery(async () => {
  refreshKey();                                // does nothing
  return getDashboardDetailFromCacheOrFetch(...);
});
function refresh() { setRefreshKey(refreshKey() + 1); }

// ✅ RIGHT — for reactive inputs, use createEffect
const [data, setData] = createSignal<StateHolder<T>>({ status: "loading" });
createEffect(async () => {
  const _v = refreshKey();                     // tracked
  const res = await getDashboardDetailFromCacheOrFetch(...);
  setData(/* ... */);
});
```

```tsx
// ❌ WRONG — manually calling refetch after a mutation duplicates work.
// SSE will already push the version change; the createEffect will fire on its own.
async function save() {
  await serverActions.updateDashboard(...);
  dataQuery.silentFetch();   // remove this — SSE handles it
  refresh();                 // remove this — SSE handles it
}
```

```tsx
// ❌ WRONG — Variant B cache that flashes to loading on SSE re-runs.
createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[id];
  setData({ status: "loading" });          // ⚠️ flash on every edit
  const res = await getDashboardDetailFromCacheOrFetch(...);
  setData(/* ... */);
});
```

### When to use `createQuery` vs `createEffect`

| Need                                               | Use                                             | Read mode |
| -------------------------------------------------- | ----------------------------------------------- | --------- |
| Long-lived view of T2 data that must react to SSE  | `createSignal<StateHolder<T>>` + `createEffect` | live      |
| Short-lived picker modal selecting from T2 data    | `createQuery`                                      | snapshot  |
| Pure T3 (loaded once at modal open; not T2-cached) | `createQuery`                                      | snapshot  |
| Form submission with validation                    | `createFormAction`                                 | —         |
| Button action with loading state                   | `createButtonAction`                               | —         |

If you ever find yourself wanting to "refresh" a `createQuery` result after a
mutation, that view is long-lived enough that it should be using `createEffect`
watching a version key — convert it, don't add manual refetches.

## T3: On-demand fetch

Transient or audit data fetched fresh from the server every time. Not reactive —
changes by other users do not propagate. Not cached — always hits the server.

- **No state files.** The fetch-and-use pattern lives directly in the component
  that needs the data, as component-local signals or variables.
- **Typical uses:** Upload workflows (transient per-user state + polling),
  on-demand modals, editors that load data on open, bootstrap data fetched once
  at auth.

## T4: Client-persistent state

State that originates on the client, persists across component mounts and
navigation, but is NOT backed by the server. Stored in localStorage,
sessionStorage, module-level signals/stores, or IndexedDB.

- **Files:** One `t4_` file per concern. Importable from multiple components.
- **Distinction from T5:** T4 state survives component unmount. A
  `createSignal()` inside a component would die on unmount; T4 state must
  outlive its originating component.

## T5: Component-local state

Temporary UI state scoped to a single component. `createSignal()` for search
text, selected tabs, loading flags, form inputs. Does not persist across
navigation. Does not need to be shared.

- **No state files.** By definition, T5 state lives inside the component
  function that creates it.

## File naming

State files are prefixed with their tier: `t1_`, `t2_`, `t4_`. Tiers 3 and 5
have no files. The prefix makes the tier visible in the file explorer and
ensures files sort by tier within each directory.

## Directory structure

```
state/
  instance/          ← instance-scoped state (T1, T2, T4)
  project/           ← project-scoped state (T1, T2, T4)
  _infra/            ← cache infrastructure (not state itself)
  t4_*.ts            ← cross-cutting T4 state (UI prefs, connection monitor)
  clear_caches.ts    ← utility (not state)
```
