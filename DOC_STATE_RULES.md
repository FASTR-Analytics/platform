# State Management Rules

**Read this before writing any state code.** The "why" lives in
`DOC_STATE_MGT_TIERS.md`, `DOC_STATE_MGT_INSTANCE.md`, and
`DOC_STATE_MGT_PROJECT.md`. This doc is the short hit-list.

Every rule below has produced a real production bug. Most look reasonable until
you understand the underlying model.

---

## Solid.js reactivity (apply everywhere)

### 1. Read all reactive state at the TOP of `createEffect` / `createMemo`, before any conditional logic.

Early returns silently break tracking. The effect runs ONCE in dev (looks fine),
then never re-runs when the un-read signals change.

```tsx
// ❌ WRONG — `data()` only tracked when isReady() is true.
createEffect(() => {
  if (!isReady()) return;
  const value = data();
});

// ✅ RIGHT — read all tracked signals first.
createEffect(() => {
  const ready = isReady();
  const value = data();
  if (ready) doSomething(value);
});
```

### 2. After any `await`, you can no longer set up new tracking dependencies in that effect run.

Solid's tracking context is synchronous. Reads after `await` are silently
untracked.

```tsx
// ❌ WRONG — `someSignal()` after the await is not tracked.
createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[id]; // tracked
  await fetch(...);
  const x = someSignal();                              // NOT tracked
});

// ✅ RIGHT — read everything synchronously first.
createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[id];
  const x = someSignal();                              // tracked
  await fetch(...);
});
```

### 3. No conditional returns inside component functions. Use `<Show>`.

Components run ONCE. An early return prevents the rest of the component from
setting up tracking — bugs that are hard to find.

```tsx
// ❌ WRONG
export function MyComponent(p: Props) {
  if (!p.data) return <div>No data</div>;
  return <div>{p.data.value}</div>;
}

// ✅ RIGHT
export function MyComponent(p: Props) {
  return (
    <Show when={p.data} fallback={<div>No data</div>}>
      {(d) => <div>{d().value}</div>}
    </Show>
  );
}
```

---

## Two reading modes (applies to all tiers)

Every read of server-derived state is either **live** or **snapshot**. Picking
the wrong one is the source of most state-management bugs.

| Mode              | Behavior                                                             | Tools                                                                                                        |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Live read**     | Subscribes to changes. View stays in sync with the server.           | Reactive reads in JSX / `createEffect` / `createMemo`; `createEffect` watching a T1 version key for T2 data. |
| **Snapshot read** | Captures state at a moment in time. View ignores subsequent changes. | Non-reactive getters (`unwrap`-based); `createQuery`; cache `.get()` from async code.                           |

**When in doubt, prefer live read.** A view that should have stayed in sync but
used a snapshot read goes silently stale — the worst failure mode. A view that
used a live read where snapshot would have sufficed has only minor cost (extra
reactive subscription).

The term "snapshot" also appears in the codebase for _stored_ snapshots — e.g.
`FigureBlock.source.snapshotAt` is a snapshot of viz data persisted onto a
slide. That's the same idea (state captured at a moment, decoupled from future
updates) with a different downstream action (persist to DB vs. display
ephemerally). Both are correctly called snapshots.

---

## T1 — SSE store

### 4. NEVER write to T1 state from components.

SSE is the only write path. Server mutation → `BroadcastChannel` → SSE → client
store setter.

### 5. Pick live or snapshot read deliberately when reading T1 state.

```tsx
// ✅ Live read — reactive subscription. Use in JSX / createEffect / createMemo.
<For each={instanceState.projects}>{(p) => <div>{p.label}</div>}</For>;

// ✅ Snapshot read — non-reactive getter. Use in async code, caches, event handlers.
const version = getIndicatorMappingsVersion();
```

Reading the store directly inside JSX or a reactive context produces a **live
read** (Solid tracks the read). Calling a non-reactive getter (which unwraps the
store internally) produces a **snapshot read**. Use the right one for the
context.

---

## T2 — reactive cache

### 6. Pick live or snapshot read deliberately when reading T2 data.

Both modes are legitimate for T2; the choice depends on view lifetime, not on
the data:

- **Live read — use `createEffect` watching the T1 version key.** Required for
  any long-lived view (editors, lists, thumbnails) that should stay in sync with
  SSE updates during its lifetime.
- **Snapshot read — use `createQuery`.** Acceptable only for short-lived consumers
  (picker modals, dropdowns that close after selection) where SSE updates during
  the view's lifetime aren't consumed.

When in doubt, prefer live read.

```tsx
// ✅ LIVE — long-lived editor; createEffect watching the version key.
const [data, setData] = createSignal<StateHolder<T>>({ status: "loading" });
createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[id];   // reactive
  const res = await getDashboardDetailFromCacheOrFetch(...);
  setData(res.success
    ? { status: "ready", data: res.data }
    : { status: "error", err: res.err });
});

// ✅ SNAPSHOT — picker modal; createQuery is fine.
const poDetailQuery = createQuery(
  () => getPODetailFromCacheorFetch(projectId, vizId),
);
```

```tsx
// ❌ WRONG — createQuery used in a long-lived editor.
// Editor is open for minutes; SSE updates from other users (or this user's
// own mutations) will not be reflected.
const dataQuery = createQuery(() => getDashboardDetailFromCacheOrFetch(...));

// ❌ WRONG — `createQuery` has no `queryKey`. Unlike TanStack Query /
// React Query, signal reads inside `queryFunc` are NOT tracked.
// `queryFunc` runs exactly once on mount; this `refreshKey()` is dead code.
const [refreshKey, setRefreshKey] = createSignal(0);
const q = createQuery(async () => {
  refreshKey();                       // does nothing
  return getDashboardDetailFromCacheOrFetch(...);
});

// ✅ RIGHT — for reactive inputs, use createEffect
const [data, setData] = createSignal<StateHolder<T>>({ status: "loading" });
createEffect(async () => {
  const _v = refreshKey();            // tracked
  const res = await getDashboardDetailFromCacheOrFetch(...);
  setData(/* ... */);
});
```

### 7. NEVER call `silentFetch()` / `fetch()` / any manual `refresh()` after a mutation.

SSE handles invalidation. Server route handlers already call
`notifyLastUpdated(...)`; the version key flips; the `createEffect` re-runs
automatically.

```tsx
// ❌ WRONG — duplicates work, races with SSE.
async function save() {
  await serverActions.updateDashboard(...);
  refresh();
}

// ✅ RIGHT — let SSE drive it.
async function save() {
  const res = await serverActions.updateDashboard(...);
  if (!res.success) await openAlert({ text: res.err, intent: "danger" });
}
```

### 8. For per-entity caches (Variant B), do NOT set `{ status: "loading" }` on effect re-runs.

A user editing one field would otherwise see the entire view flash to
"Loading..." on every keystroke-equivalent change. Initialize the signal to
`loading` once; let stale data stay visible until fresh data arrives.

Also add an `AbortController` guard to discard stale in-flight responses when two SSE bumps fire faster than a single fetch resolves. The canonical Variant B pattern:

```tsx
// ✅ RIGHT — no loading flash, stale-response guard.
createEffect(() => {
  const _v = projectState.lastUpdated.dashboards[id]; // reactive
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  async function load() {
    const res = await getDashboardDetailFromCacheOrFetch(projectId, id);
    if (controller.signal.aborted) return;  // discard if superseded
    if (res.success) {
      setData({ status: "ready", data: res.data });
    } else {
      setData({ status: "error", err: res.err });
    }
  }
  load();
});

// ❌ WRONG — flashes loading on every SSE update.
createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[id];
  setData({ status: "loading" });          // ⚠️ flash
  const res = await getDashboardDetailFromCacheOrFetch(...);
  setData(/* ... */);
});
```

Variant A (whole-collection caches, e.g. `indicatorMappingsVersion`) keeps the
loading flash — see `DOC_STATE_MGT_TIERS.md`.

---

## What not to use

### 9. NEVER use `createResource`.

Triggers Suspense boundaries, which can cause full-page re-renders / flash
reloads. Use `createQuery` (T3) or `createEffect` + `createSignal<StateHolder<T>>`
(T2).

---

## Quick reference

| Need                                      | Use                                             |
| ----------------------------------------- | ----------------------------------------------- |
| Reactive to SSE (T2)                      | `createSignal<StateHolder<T>>` + `createEffect` |
| Load once on mount (T3 — modals, editors) | `createQuery`                                      |
| Form submission with validation           | `createFormAction`                                 |
| Button action with loading state          | `createButtonAction`                               |
| Delete with confirmation                  | `createDeleteAction`                               |
