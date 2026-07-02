---
system: 3
name: Realtime Sync & Cache Invalidation
globs:
  - client/src/components/project/project_cache.tsx
  - client/src/state/_infra/indexeddb_cache.ts
  - client/src/state/_infra/reactive_cache.ts
  - client/src/state/_infra/request_queue.ts
  - client/src/state/clear_caches.ts
  - client/src/state/instance/t1_sse.tsx
  - client/src/state/instance/t1_store.ts
  - client/src/state/project/t1_sse.tsx
  - client/src/state/project/t1_store.ts
  - lib/types/instance_sse.ts
  - lib/types/project_dirty_states.ts
  - lib/types/project_sse.ts
  - server/routes/instance/instance-sse.ts
  - server/routes/project/project-sse-v2.ts
  - server/task_management/build_project_state.ts
  - server/task_management/get_project_dirty_states.ts
  - server/task_management/notify_instance_updated.ts
  - server/task_management/notify_last_updated.ts
  - server/task_management/notify_project_v2.ts
  - server/utils/request_queue.ts
  - server/valkey/**
docs_absorbed:
  - DOC_SSE_REALTIME
  - DOC_VALKEY_CACHE
---
# S3 — Realtime Sync & Cache Invalidation

The `last_updated → BroadcastChannel/SSE → version-hash` triangle: notify
hub, SSE bridges, Valkey machinery, client store/cache infrastructure.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`server/task_management/{notify_*,build_project_state,get_project_dirty_states}.ts`;
the two SSE endpoints; `server/valkey/**` (generic machinery);
`server/utils/request_queue.ts`; client `state/_infra/**` (serves all eight
t2 caches), `state/*/t1_store.ts` + `t1_sse.tsx`, `clear_caches.ts`, the
version flush in LoggedInWrapper;
`lib/types/{project_sse,instance_sse,project_dirty_states}.ts`;
`components/project/project_cache.tsx`.

## Contract

Every mutation must stamp `last_updated` and notify — but that obligation
lives in ~26 files owned by other systems. This system's *machinery* is
reviewed here; its *convention* is a standing audit (SYSTEMS.md §4.3.1).

## Docs absorbed (Phase 2)

- [DOC_SSE_REALTIME](DOC_SSE_REALTIME.md)
- [DOC_VALKEY_CACHE](DOC_VALKEY_CACHE.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — make the notify/stamp convention structural.** The
  `last_updated → notify` triangle is enforced by hand in ~26 files. A
  write-helper that does mutate + stamp + notify together (or a dev assertion
  flagging mutations without a notify) would make audit §4.3.1 mechanical.
