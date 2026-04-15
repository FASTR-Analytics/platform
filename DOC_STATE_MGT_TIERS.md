# State Management Tier System

This document defines the 5-tier classification used across all state management in the app. Both instance-level (`DOC_STATE_MGT_INSTANCE.md`) and project-level (`DOC_STATE_MGT_PROJECT.md`) state use the same tier system.

Every piece of state belongs to exactly one tier. If you can't classify it, the tier system needs updating, not a workaround.

## Tiers

| Tier | Name | Data origin | Reactive via SSE? | Has state files? | File prefix |
| --- | --- | --- | --- | --- | --- |
| T1 | SSE store | Server pushes to client | Yes — real-time, multi-user | Yes | `t1_` |
| T2 | Reactive cache | Client fetches from server, version-keyed by T1 fields | Yes — refetches automatically when T1 version key changes | Yes | `t2_` |
| T3 | On-demand fetch | Client fetches from server | No — fetched fresh every time, not cached, not reactive | No — lives in components | — |
| T4 | Client-persistent | Originates on client | No | Yes | `t4_` |
| T5 | Component-local | Originates on client | No | No — `createSignal()` inside components | — |

## T1: SSE store

Lightweight metadata pushed via SSE on every change. Components read directly from a global `createStore` — no fetching, no loading states, instant on every navigation.

- **Write path:** SSE only. Never update the store from components. Server mutation → `BroadcastChannel` → SSE endpoint → client SSE handler → store setter.
- **Read path (reactive):** Import the store directly. Solid tracks field-level dependencies automatically.
- **Read path (non-reactive):** Use exported getter functions that call `unwrap()`. For use in async code, caches, and event handlers.
- **Files:** `t1_store.ts` (store, setters, getters), `t1_sse.tsx` (SSE connection manager + boundary component).

## T2: Reactive cache

Medium-to-heavy data too large for SSE but still needs to be reactive. Cached in memory + IndexedDB. A `createEffect` watches version keys from the T1 store; when SSE pushes a new version, the cache misses and fresh data is fetched automatically.

- **Invalidation:** Driven by T1 version key fields. No manual `silentFetch()` or refetch calls needed.
- **On revisit (same version):** Cache hit — instant render, no server fetch.
- **On revisit (version changed):** Cache miss — fetch, render. Brief loading state.
- **Multi-user sync:** SSE updates version key → `createEffect` fires → cache misses → fresh data fetched.
- **Files:** One `t2_` file per data domain. Each file is self-contained — defines its cache instances AND exports its access functions.

**Canonical pattern** — component consuming T2 data:

```tsx
const [data, setData] = createSignal<StateHolder<MyDataType>>({ status: "loading" });

createEffect(async () => {
  const version = instanceState.indicatorMappingsVersion; // reactive read from T1
  setData({ status: "loading" });
  const res = await getIndicatorsFromCacheOrFetch(version); // T2 access function
  if (res.success) {
    setData({ status: "ready", data: res.data });
  } else {
    setData({ status: "error", err: res.err });
  }
});

<StateHolderWrapper state={data()}>
  {(d) => <Table data={d} />}
</StateHolderWrapper>
```

The `createEffect` reactively reads a T1 version key. When SSE pushes a new version, the effect re-runs, the cache misses, fresh data is fetched, and the component re-renders. On revisit with the same version, the cache hits and no server fetch occurs.

## T3: On-demand fetch

Transient or audit data fetched fresh from the server every time. Not reactive — changes by other users do not propagate. Not cached — always hits the server.

- **No state files.** The fetch-and-use pattern lives directly in the component that needs the data, as component-local signals or variables.
- **Typical uses:** Upload workflows (transient per-user state + polling), on-demand modals, editors that load data on open, bootstrap data fetched once at auth.

## T4: Client-persistent state

State that originates on the client, persists across component mounts and navigation, but is NOT backed by the server. Stored in localStorage, sessionStorage, module-level signals/stores, or IndexedDB.

- **Files:** One `t4_` file per concern. Importable from multiple components.
- **Distinction from T5:** T4 state survives component unmount. A `createSignal()` inside a component would die on unmount; T4 state must outlive its originating component.

## T5: Component-local state

Temporary UI state scoped to a single component. `createSignal()` for search text, selected tabs, loading flags, form inputs. Does not persist across navigation. Does not need to be shared.

- **No state files.** By definition, T5 state lives inside the component function that creates it.

## File naming

State files are prefixed with their tier: `t1_`, `t2_`, `t4_`. Tiers 3 and 5 have no files. The prefix makes the tier visible in the file explorer and ensures files sort by tier within each directory.

## Directory structure

```
state/
  instance/          ← instance-scoped state (T1, T2, T4)
  project/           ← project-scoped state (T1, T2, T4)
  _infra/            ← cache infrastructure (not state itself)
  t4_*.ts            ← cross-cutting T4 state (UI prefs, connection monitor)
  clear_caches.ts    ← utility (not state)
```

See `PLAN_PROJECT_STATE.md` for the remaining migration work (project state consolidation + project cache restructure).
