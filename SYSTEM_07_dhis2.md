---
system: 7
name: DHIS2 Connector
globs:
  - client/src/components/Dhis2CredentialsEditor.tsx
  - client/src/state/instance/t4_dhis2_session.ts
  - server/dhis2/**
  - server/routes/instance/indicators_dhis2.ts
docs_absorbed:
  - DOC_DHIS2_INTEGRATION
---
# S7 — DHIS2 Connector

The self-contained typed HTTP adapter for external DHIS2 instances: auth,
retry, paging, analytics, geojson, credentials UX. The cleanest system.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`server/dhis2/**`; `routes/instance/indicators_dhis2.ts`; client
`Dhis2CredentialsEditor.tsx` + `state/instance/t4_dhis2_session.ts`. Known
wart: `stage_structure_from_dhis2.ts` re-implements org-unit paging inline.

## Contract

Every call funnels through `fetchFromDHIS2 → withRetry` (5 attempts,
backoff+jitter); never-throw boundary; two-phase connection validation; no DB
writes. Consumed by S6, S5.

## Docs absorbed (Phase 2)

- [DOC_DHIS2_INTEGRATION](DOC_DHIS2_INTEGRATION.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas); plus whatever this system's review cycle adds.

- **Decoupling — split-brained DHIS2 wire types.** Unify the duplicated
  request/response type definitions.
