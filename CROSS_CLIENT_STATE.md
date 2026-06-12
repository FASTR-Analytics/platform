# CROSS — Client State Tiers

> **Phase 1 stub** (PLAN_DOC_CONSOLIDATION §4). A cross-cutting doc, not a
> system: the T1–T5 client-state tier model and read-mode rules (live /
> snapshot / edit-draft) that every client feature obeys. The state *machinery*
> (stores, `_infra`, SSE bridges) is owned by S3; this doc captures the *rules*
> the features follow. Prose ported in Phase 2.

## Docs absorbed (Phase 2)

- [DOC_STATE_RULES](DOC_STATE_RULES.md) — the tier rules + read modes (index)
- [DOC_STATE_MGT_TIERS](DOC_STATE_MGT_TIERS.md) — T1–T5 definitions
- [DOC_STATE_MGT_INSTANCE](DOC_STATE_MGT_INSTANCE.md) — instance-level state inventory
- [DOC_STATE_MGT_PROJECT](DOC_STATE_MGT_PROJECT.md) — project-level state inventory

## Relationship to systems

- **S3 (Realtime Sync & Cache Invalidation)** owns the machinery: `state/_infra/**`,
  `t1_store`/`t1_sse`, the version-hash caches.
- Every client feature system (S5/S6/S11/S12/S13…) applies these rules to its
  own `t2_*`/`t4_*` state — the "edit-draft" mode is the viz/report editor
  contract (S11/S12), the live/snapshot split governs all cached reads.
- The third read mode ("edit draft": snapshot-at-open + optimistic concurrency)
  was named during the 2026-06-12 state review; see PLAN_STATE_MGT_FIXES §5.
