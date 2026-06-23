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

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S1).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the typed RPC registry both tiers are generated from, plus the two permission guards that scope every request_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S1).

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
