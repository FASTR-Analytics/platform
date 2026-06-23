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

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S3).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the last_updated -> SSE -> version-hash triangle: notify hub, SSE bridges, Valkey machinery, client store/cache infrastructure_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S3).

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
