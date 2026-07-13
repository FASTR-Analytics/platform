---
system: 1
name: API Contract, Transport & Access Control
globs:
  - client/src/components/LoggedInWrapper.tsx
  - client/src/server_actions/**
  - lib/api-routes/**
  - lib/h_users.ts
  - lib/types/permission_labels.ts
  - lib/types/permissions.ts
  - lib/types/streaming.ts
  - main.ts
  - server/db/instance/users.ts
  - server/middleware/**
  - server/project_auth.ts
  - server/routes/instance/users.ts
  - server/routes/route-helpers.ts
  - server/routes/route-tracker.ts
  - server/routes/streaming.ts
docs_absorbed:
  - DOC_API_ROUTES
  - DOC_ACCESS_CONTROL
---
# S1 — API Contract, Transport & Access Control

The typed RPC registry both tiers are generated from, plus the two
permission guards that scope every request.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`lib/api-routes/**`; `server/routes/{route-helpers,route-tracker,streaming}.ts`;
`server/middleware/**`; `server/project_auth.ts`; `main.ts` (composition
root: mounting, onError envelope); `client/src/server_actions/**`;
`lib/types/{permissions,permission_labels,streaming}.ts`; `lib/h_users.ts`;
the APIResponse envelope symbols in `lib/types/instance.ts`;
`server/db/instance/users.ts` + `routes/instance/users.ts` (the rows the
guards evaluate); client session: `LoggedInWrapper.tsx` (Clerk singleton).

## Contract

~255 registry routes, zero direct client↔server imports; errors as HTTP 200 +
`{success:false}` (only guards emit real 4xx/5xx); `Project-Id` header mints
the per-project DB handle. Owns the inventory of ~30 off-registry endpoints
(health, TUS, SSE, AI proxy, public dashboard, CSV exports) —
each owned by its home system.

## Docs absorbed (Phase 2)

- [DOC_API_ROUTES](DOC_API_ROUTES.md)
- [DOC_ACCESS_CONTROL](DOC_ACCESS_CONTROL.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — protect the registry seam.** Zero client↔server import edges is
  the codebase's cleanest property; the ~30 off-registry endpoints are the
  erosion surface. Keep that inventory deliberate and small.
- **Decoupling — `lib/h_users.ts` ships access-policy emails in the client
  bundle.** Semantically server-side access-control data; move it server-side
  (client gets a boolean where needed). Bridge-pass move.
