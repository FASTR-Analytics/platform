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

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S7).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the self-contained typed HTTP adapter for external DHIS2 instances: auth, retry, paging, analytics, geojson, credentials UX_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S7).

## Docs absorbed (Phase 2)

- [DOC_DHIS2_INTEGRATION](DOC_DHIS2_INTEGRATION.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas); plus whatever this system's review cycle adds.

- **Decoupling — split-brained DHIS2 wire types.** Unify the duplicated
  request/response type definitions.
