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
---

# S1 — API Contract, Transport & Access Control

The typed RPC registry both tiers are generated from, plus the auth gate every
request passes. One route declaration in `lib/api-routes/` is the whole
contract: the server types its handler off it (`defineRoute`), the client
generates a typed server-action from it, and boot fails if the two sets diverge.
Around that seam sit the `APIResponse` envelope, the request-scoped NDJSON
streaming sub-protocol, the `log()` audit middleware, and the two
permission-guard factories with the `Project-Id` scoping pipeline. Reviewed
against code 2026-07-16 (first review cycle, review-only; absorbs
DOC_API_ROUTES + DOC_ACCESS_CONTROL).

Boundaries: the add-a-route/add-a-guard **recipe** is
[PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md); the generic
envelope/boundary-validation/permission-first rules it builds on are panther's
`protocols/PROTOCOL_DENO_API.md` — deferred there, not restated here (one
caveat: that protocol's example code does header/permission/parse checks _inline
in handlers_, which this app centralizes in `defineRoute` + guards; follow the
rules, not the examples). Server-side **push** (SSE/ BroadcastChannel) is **S3**
— the streaming here is request-scoped NDJSON, a different thing. The DB
functions handlers call, and the error funnel that produces their envelopes, are
**S2** ([SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)). The Anthropic proxy internals are **S13**; TUS
upload is **S4**; the public dashboard route is **S12**; health + export_central
are **S15**, which also _writes_ the `users` / `project_user_roles` rows the
guards here evaluate — S1 owns the gate, S15 owns the admin surface behind it.
Client-side consumption rules (tiers, caches) are
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md). Sub-file custody exceptions are
in SYSTEMS.md §4.1 (`main.ts` owned here — S2/S15/S12 readers;
`LoggedInWrapper.tsx` owned here — S3/S14 readers; `routes/instance/users.ts` +
`db/instance/users.ts` owned here — S15/S13 readers).

## Contract

258 registry routes (29 feature registries), zero direct client↔server imports;
expected failures travel as HTTP 200 + `{ success: false, err }` — only guards
and validation emit real 4xx/5xx; the `Project-Id` header (not the body) selects
the per-project DB handle. This system also owns the _inventory_ of the ~30
off-registry endpoints (each owned by its home system) — that list is the
erosion surface of the registry seam and must stay deliberate and enumerated
(see below).

## The registry contract (`lib/api-routes/`)

Each feature file exports a `*RouteRegistry` object of `route({...})` calls
(`route-utils.ts`); `combined.ts` spreads all 29 into `routeRegistry`, the one
object both `server/routes/route-helpers.ts` and
`client/src/server_actions/create_server_action.ts` import. Add an entry → the
client gets a typed action and the server gets a typed handler signature for
free; forget to implement it → boot fails.

Canonical example — `lib/api-routes/project/reports.ts`:

```ts
export const reportRouteRegistry = {
  createReport: route({
    path: "/reports",
    method: "POST",
    body: z.object({ label: z.string(), ...folderBodyFields }),
    response: {} as { reportId: string; lastUpdated: string },
    requiresProject: true,
  }),
  getReportDetail: route({
    path: "/reports/:report_id",
    method: "GET",
    params: reportIdParamsSchema, // z.object({ report_id: z.string() })
    response: {} as ReportDetail,
    requiresProject: true,
  }),
};
```

| Field             | Purpose                                                                   | Runtime vs type                                              |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `path`            | URL path, `:name` for params                                              | real value                                                   |
| `method`          | `GET`/`POST`/`PUT`/`DELETE`/`PATCH`                                       | real value                                                   |
| `params`          | URL param schema (coercion where needed)                                  | **real Zod schema, validated per request**                   |
| `body`            | request body schema, always `z.object({…})`                               | **real Zod schema, validated per request**                   |
| `response`        | success `data` shape; omit for no-data                                    | compile-time phantom (`{} as T`), never validated at runtime |
| `requiresProject` | client must send `Project-Id`                                             | real boolean                                                 |
| `isStreaming`     | NDJSON stream protocol                                                    | real boolean                                                 |
| `timeoutMs`       | client fetch timeout override (default 5 min; streaming routes have none) | real number                                                  |

`params`/`body` as phantom `{} as T` is retired — `route()` requires real Zod
schemas for both, so a handler can trust they match their `z.infer<T>` types.
`response` alone stays a phantom: the server is the trusted producer, and the
only response check is the compile-time `TypedResponse` constraint on the
handler return (a local `InferredResponse` type resolves it to
`APIResponseWithData<T>` when `response` is set, else `APIResponseNoData`).

Naming: the `project/` registry files are kebab-case
(`presentation-objects.ts`), the `instance/` ones snake_case
(`geojson_maps.ts`); server implementation files in `server/routes/` are
snake_case throughout. Pairing is by registry key, never by filename.

**The `X | undefined` inference trap.** `route()`'s `response?:` parameter is
optional, so `response: {} as X | undefined` silently infers as `X` — the
contract then claims `data` is always present. For a sometimes-absent payload
declare `X | null` (survives inference, and `null` is wire-honest where
`undefined` is dropped by JSON anyway); precedent: `getDatasetIcehUploadAttempt`
/ `getDatasetIcehUploadStatus`.

## Implementing a route — `defineRoute` (server)

`defineRoute(router, routeName, ...middlewares, handler)` in `route-helpers.ts`
looks up `routeRegistry[routeName]` for path + method, registers on the Hono
router with the lowercased method, and calls `markRouteDefined(routeName)`. Per
request it parses `:param` segments and — for `POST`/`PUT`/`PATCH`/`DELETE` —
the JSON body (empty-object fallback) against the registry Zod schemas,
returning a `400 { success: false, err }` on mismatch; params get coercion
(`z.coerce.number()`). Handlers receive `(c, { params, body })` fully typed and
validated. Hono 4.5 caches `c.req.json()` internally, so `log()`, `defineRoute`,
and a handler can all read the body safely.

**Handler returns are type-enforced against the registry.** Non-streaming
handlers must return `Response & TypedResponse<JSONParsed<Envelope>>` — i.e.
exactly what `c.json(res)` produces when `res` matches the declared envelope.
The comparison is in **wire-space**: `JSONParsed` maps `Date` → `string` the way
JSON serialization does, so DB-layer types carrying `Date` fields pass without
casts, while shape drift (wrong/missing fields, data on a no-data route, a bare
payload without the envelope) is a compile error at the `defineRoute` call.
Never cast to `any` to silence this — the error means the registry and the
implementation disagree, and one of them is wrong. Sole sanctioned exception:
`downloadBackupFile`'s binary `Response`, commented in place on both sides.
`isStreaming` routes are exempt (they return a plain `Response` from
`streamResponse`).

The thin-handler shape is invariant: **call one DB fn →
`if (!res.success)
return c.json(res)` → `notify*()` on success →
`c.json(res)`.** Business logic lives in the DB layer (S2); notify side-effects
push state over SSE (S3); routes never hand-build `{ success: true, data }` when
the DB function already returns an envelope. `server/routes/project/reports.ts`
is the canonical, fully-consistent implementation file.

Two deliberate validation holes remain, both documented: `response` (above), and
fields schema'd as `z.unknown()` — the sentinel-encoded `slide`/`figures`
passthroughs, validated in the DB layer after decode
([PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)). Don't add new
`z.unknown()` body fields to dodge writing a schema.

## Consuming a route — generated server actions (client)

`create_server_action.ts` iterates `routeRegistry` and builds one async function
per key. `buildRequestParams` substitutes `:param` segments from `args`; if
`requiresProject`, it **requires `args.projectId`** (throws otherwise) and emits
it as the `Project-Id` header — the glue `requireProjectPermission` reads
server-side; every remaining arg key becomes the JSON body.

Non-streaming calls go through `tryCatchServer`, which is more than a fetch
wrapper: 2-retry exponential backoff for safe methods, a 401
token-refresh/reload path (keyed off `authError`), 503 handling, and
HTML-maintenance-page detection — all returning a parsed `APIResponse` to the
caller. Streaming calls (`isStreaming: true`) go through `consumeStream`, have
**no** timeout, and pre-refresh the Clerk token before connecting.

## The `APIResponse` envelope

`lib/types/instance.ts` (kernel file, S00) is the source of truth:

```ts
export type APIResponseWithData<T> =
  | { success: true; data: T }
  | { success: false; err: string };

export type APIResponseNoData =
  | { success: true }
  | { success: false; err: string };
```

Plus assertion helpers `throwIfErrWithData` / `throwIfErrNoData`. The DB layer
produces these (S2); routes pass them through; the client unwraps them.
`main.ts`'s `app.onError` also returns `{ success: false, err }` — at the
default HTTP **200**, a known wart, not a pattern: clients detect failure by
`success: false`, not status. Real status codes exist only at the edges:
validation 400, guards 401/403, outage 503.

## Streaming sub-protocol (request-scoped NDJSON)

For long-running request/response work (not push), set `isStreaming: true` and
use `streamResponse` from `server/routes/streaming.ts` — a single HTTP response
streamed as newline-delimited JSON, one request, one stream, done.

```ts
return streamResponse(c, async (writer) => {
  await writer.progress(0.5, "Halfway");
  await writer.complete({ result }); // or writer.error("...")
});
```

Wire format (`StreamWriter`), one JSON object per line: progress
`{ progress: 0..1 (clamped), message }`; complete
`{ progress: 1, message: "Complete", result: { success: true, data? } }`; error
`{ progress: -1, message, result: { success: false, err } }`. `streamResponse`
wraps the handler in try/catch — an uncaught throw becomes `writer.error(...)`,
so the stream always terminates cleanly. The client `consumeStream` mirrors it
exactly: `progress === 1` or `=== -1` returns `message.result`; anything else
fires `onProgress`. Three routes use it today: one in
`server/routes/project/project.ts`, two in
`server/routes/instance/structure.ts`.

## The `log()` middleware

`server/middleware/logging.ts` exports `log(routeName)`, applied per-route (e.g.
`log("createProject")`). It reads the JSON body (Content-Type-gated), redacts
`password`/`secret`/`token`/`apikey` body fields and strips
`authorization`/`cookie` headers, then after the handler writes a `user_logs`
row via `AddLog` — skipping users with `approved === false`, capping `details`
at 64 KB (large bodies become `{ _truncated: true, bytes }`), swallowing its own
errors so logging never breaks a response, and re-throwing any handler error.
`log()` is **not** applied to every route — audit coverage is uneven by choice
of the route author.

## Startup validation (`route-tracker.ts`)

`validateAllRoutesDefined()`, called at the end of `main.ts` before
`Deno.serve`, cross-checks the contract and **`Deno.exit(1)`s on any
violation**: registry keys never implemented, implemented routes not in the
registry, duplicate `method + path` pairs, key collisions across feature
registries, `:placeholder` segments without a matching `params` key, and body
keys that collide with the transport (a path placeholder, or `projectId` on a
`requiresProject` route). Success prints
`✅ All N routes correctly implemented`. A broken route cannot ship.

## Off-registry endpoints — the complete inventory

These register handlers directly on a `Hono()` without `defineRoute`: no
generated client action, no registry typing, invisible to
`validateAllRoutesDefined`. This is the **complete** allowed list; anything not
here uses the registry.

| File                                                                  | Owner | Why raw                                                                                                                                                                     |
| --------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/instance/instance-sse.ts`, `routes/project/project-sse-v2.ts` | S3    | SSE long-lived streams, not request/response                                                                                                                                |
| `routes/project/ai_proxy.ts`, `routes/instance/ai_proxy.ts`           | S13   | Anthropic passthrough (mounted `/ai` and `/ai-instance`, both thin wrappers over `routes/anthropic_messages_proxy.ts`) — returns Anthropic-shaped bodies, not `APIResponse` |
| `routes/project/ai_files.ts`                                          | S13   | Anthropic Files API passthrough                                                                                                                                             |
| `routes/instance/upload.ts`                                           | S4    | Hand-rolled TUS resumable-upload protocol (custom headers/handshake)                                                                                                        |
| `routes/public/dashboard.ts`                                          | S12   | Public/anonymous, mounted before the global `authMiddleware`                                                                                                                |
| `routes/instance/health.ts`                                           | S15   | Diagnostics; 13 routes, bare JSON, deliberately unauthenticated for external monitoring (exposure inventory is S15's contract)                                              |
| `routes/instance/export_central.ts`                                   | S15   | Central-reporting export; the `/rows` route is authenticated by an `X-Central-Secret` header for server-to-server pulls — a third auth mode outside the two guards          |
| `routes/instance/structure.ts` (2 routes only)                        | S5    | CSV download `Response`s (facilities export, HFA weights export) inside an otherwise-registry file — guarded and logged, but raw                                            |

## Access control

### `authMiddleware` — Clerk, populate-not-reject

`server/middleware/auth.ts`: `_BYPASS_AUTH ? passthrough : clerkMiddleware()`.
Clerk runs as global middleware (`app.use("*", authMiddleware)` in `main.ts`)
and only **populates** `getAuth(c)` — it never rejects. Rejection is the job of
a per-route guard, so a route with no guard is reachable by any authenticated
caller. Mount order matters: the public dashboard routes and the `/d/:slug` SPA
page are registered before the global middleware (anonymous-reachable);
`authMiddleware` is additionally mounted on `/api/d/*` first so public dashboard
routes can still read a session when one exists.

### The two guard factories

Mirrored shapes: an optional leading options object, then variadic permission
keys with AND semantics; both skip `OPTIONS` (CORS preflight); both bypass all
permission checks for global admins; both fail closed.

**`requireGlobalPermission([opts,] ...UserPermission)`** — instance routes
(`server/middleware/userPermission.ts`). `getGlobalUser(c)` returns
`"NOT_AUTHENTICATED"` → `401 { success: false, err, authError: true }`;
`requireAdmin && !isGlobalAdmin` → 403; otherwise every listed permission must
be truthy on `globalUser.thisUserPermissions`, else 403. On success sets
`c.var.globalUser`, `c.var.mainDb`. Any thrown DB error →
`503 "Service temporarily unavailable"` (no `authError`).

**`requireProjectPermission([opts,] ...ProjectPermission)`** — project routes
(`server/project_auth.ts`), options
`{ requireAdmin?, preventAccessToLockedProjects? }`. Same 401/admin steps, then
`getProjectUser(c, globalUser)` resolves the project from the **`Project-Id`
header**; non-admins need every listed permission truthy on the resolved
`projectUser`, else 403; `preventAccessToLockedProjects &&
isLocked` → 403. On
success sets `c.var.ppk = { projectDb, projectId }`, `projectUser`,
`projectLabel`, `globalUser`, `mainDb`. Error funnel: `"SERVICE_UNAVAILABLE"` →
503 (no `authError`); `"Middleware error: …"` → 403 with the prefix stripped;
anything else rethrows to `app.onError`.

**The `authError` flag is 401-only.** Only the two 401 not-authenticated
responses carry `authError: true`; no 403 in either guard does, and the client
(`tryCatchServer`) only inspects the flag on status 401, where it drives
token-refresh/logout. Auth-failure vs outage stays distinguishable by status:
401/403 = denied, 503 = retry, don't log out.

### `getProjectUser` — the `Project-Id` scoping pipeline

The chain that makes project scope safe: registry `requiresProject: true` →
client emits the `Project-Id` header → `getProjectUser` reads it → loads the
`projects` row → resolves a `ProjectUser` and mints `c.var.ppk.projectDb` for
**that** project. A mutation must act on `c.var.ppk.projectId`, never a project
id from the body/params — reading a separate id from the payload after
authorizing a different project is a confused-deputy/IDOR bug.

`getProjectUser` (private) checks in order: `_BYPASS_AUTH` short-circuit (dev
full-access user); `globalUser.approved`; `Project-Id` header present; then
delegates to **`resolveProjectUserAccess`** (exported) — loads the `projects`
row (`label`, `is_locked`, `is_central_reporting`); denies
`is_central_reporting` projects to non-`H_USERS`; grants full access to global
admins and `H_USERS`; otherwise loads `project_user_roles`, requires at least
one `can_*` column true, and builds permissions from the row.
`resolveProjectUserAccess` is the one shared core: the route middleware and the
project SSE endpoint (S3 — which takes the project id from its URL param, not
the header) both call it, so they cannot drift. Any new consumer of project
access must call it, never re-query `project_user_roles`. (The old soft-failing
`getProjectUserForSSE` fork is gone.)

`requireProjectPermission()` with **zero** permission keys still authenticates,
resolves the project, and sets `ppk` — "any project member may act". Real call
sites: the AI proxy/files routes, `getProjectDetail`, a few module reads.
Deliberately weak; be deliberate about using it.

### Permission source of truth — `lib/types/permissions.ts`

| Export                                                           | Purpose                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `UserPermissions` / `UserPermission`                             | instance-level shape + key union                                           |
| `ProjectUserPermissions` / `ProjectPermission`                   | project-level shape + key union                                            |
| `USER_PERMISSIONS` / `PROJECT_PERMISSIONS`                       | canonical key arrays, each with a compile-time `_Assert*Exhaustive` check  |
| `buildUserPermissionsFromRow` / `buildProjectPermissionsFromRow` | DB row → permissions object; **warn** on a missing column, default `false` |
| `_*_DEFAULT_FULL_ACCESS` / `_*_DEFAULT_NO_ACCESS`                | presets for admins / unknown users                                         |
| `PERMISSION_PRESETS`                                             | named role presets for the project-user UI                                 |

Seven instance permissions: `can_configure_users`, `can_view_users`,
`can_view_logs`, `can_configure_settings`, `can_configure_data`,
`can_view_data`, `can_create_projects` (`can_configure_assets` was dropped —
migration 046). Project permissions are the larger 17-key `can_*` set. Add a key
in this file (so the exhaustiveness assert and the `build*FromRow` mappers stay
correct), never inline a permission string elsewhere.

### Special modes (precedence, highest first)

| Mode           | Source                                             | Effect                                                                        |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `_BYPASS_AUTH` | `BYPASS_AUTH` env, dev only (`&& !_IS_PRODUCTION`) | synthetic full-access dev user; Clerk disabled entirely                       |
| `_OPEN_ACCESS` | `OPEN_ACCESS` env                                  | every authenticated email treated as approved global admin                    |
| `is_admin`     | `users.is_admin` column                            | global admin — bypasses all permission checks                                 |
| `H_USERS`      | hardcoded `lib/h_users.ts` (9 emails)              | access to `is_central_reporting` projects; `unlimitedAi`; full project access |
| granular       | `users` / `project_user_roles` columns             | normal least-privilege path                                                   |

`_OPEN_ACCESS` inserts unknown emails as `is_admin` rows
(`ON CONFLICT DO NOTHING` — an existing non-admin row is never promoted in the
DB; effective admin comes from the `_OPEN_ACCESS ||` short-circuit, so turning
the mode off reverts them).
`unlimitedAi = H_USERS.includes(email) ||
rawUser.unlimited_ai` (S13). Prefer a
granular permission or `requireAdmin` over a new `H_USERS.includes()` check —
it's a hardcoded allowlist, and expanding its use spreads policy into code.

## Traps

- **Global admins bypass everything.** `isGlobalAdmin` short-circuits both
  guards' permission loops. A bug masked by "I tested as admin" will bite a
  least-privilege user.
- **Don't assume `c.var.globalUser`/`c.var.ppk` exist without a guard** — only a
  guard populates them.
- **`preventAccessToLockedProjects` is opt-in per route** — locked-project
  protection only applies where the option is passed.
- **`build*FromRow` defaults missing columns to `false` and warns.** A new
  permission column not yet migrated reads as denied (fail-closed) but only logs
  — watch boot logs after adding a permission.
- **`onError` responds 200** — never rely on HTTP status to detect a
  registry-route failure; check `success`.
- **Don't add raw routes** outside the inventory above to "save a registry
  entry" — you silently lose client codegen, boot validation, and the guard
  audit trail.

## Open items

- **Decoupling — protect the registry seam.** Zero client↔server import edges is
  the codebase's cleanest property; the off-registry inventory (now including
  the mixed `structure.ts` CSV pair) is the erosion surface. Keep it deliberate
  and small.
- **Decoupling — `lib/h_users.ts` ships access-policy emails in the client
  bundle.** Semantically server-side access-control data; move it server-side
  (client gets a boolean where needed). Bridge-pass move.
- Tracked in PLAN_DOC_ENFORCEMENT: health.ts guards (item 1 — discussion
  backlog; the routes are public-by-design today), startup guard-audit /
  explicitly-public classification (item 4).
- **Decide the `authError` contract.** It is 401-only in reality (no 403 carries
  it; the client only reads it on 401) — either bless that as the contract or
  extend it to 403s deliberately; the two guards' 403 _message formats_ have
  also drifted (humanized key vs raw key) and the global-permission side shares
  no core with `resolveProjectUserAccess`.
- **Zero-perm `requireGlobalPermission()` skips the `approved` check** — any
  Clerk-authenticated email (even with no `users` row) passes; `approved` is
  only enforced on the project path (e.g. the send-email route's instance-side
  guard).
- Lint idea (from the absorbed doc): flag handlers that read a project id from
  `body`/`params` for a write while a `Project-Id`-scoped `ppk` is in context
  (the IDOR pattern).
- Audit `H_USERS.includes()` call sites; document per site why `requireAdmin` /
  a granular permission is insufficient.
