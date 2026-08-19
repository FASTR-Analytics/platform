---
system: 1
name: API Contract, Transport & Access Control
globs:
  - client/src/components/LoggedInWrapper.tsx
  - client/src/server_actions/**
  - lib/api-routes/**
  - lib/h_users.ts
  - lib/server_actions/**
  - lib/types/permission_labels.ts
  - lib/types/permissions.ts
  - lib/types/streaming.ts
  - main.ts
  - server/dev_boot_checks.ts
  - mint_pat.ts
  - server/clerk_api.ts
  - server/db/instance/personal_access_tokens.ts
  - server/db/instance/rename_user_email.ts
  - server/db/instance/users.ts
  - server/middleware/auth.ts
  - server/middleware/cache.ts
  - server/middleware/cors.ts
  - server/middleware/mod.ts
  - server/middleware/headless_allowlist.ts
  - server/middleware/static.ts
  - server/middleware/userPermission.ts
  - server/auth/global_user.ts
  - server/headless_app.ts
  - server/headless_auth.ts
  - server/routes/instance/users.ts
  - server/routes/route-helpers.ts
  - server/routes/route-tracker.ts
  - server/routes/streaming.ts
  - server/routes/public/oauth_metadata.ts
  - server/tests/headless_oauth_auth_test.ts
  - server/tests/pat_identity_parity_test.ts
docs_absorbed:
---

# S1 — API Contract, Transport & Access Control

The typed RPC registry both tiers are generated from, plus the auth gate every
request passes. One route declaration in `lib/api-routes/` is the whole
contract: the server types its handler off it (`defineRoute`), the client
generates a typed server-action from it, and boot fails if the two sets diverge.
Around that seam sit the `APIResponse` envelope, the request-scoped NDJSON
streaming sub-protocol, the `log()` audit middleware, and the two
permission-guard factories. Reviewed
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
**S2** ([SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)). The Anthropic
proxy internals are **S13**; TUS upload is **S4**; the collaboration WebSocket
(`GET /collab`) is **S16**
([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)) — S1 owns only its
seat in the off-registry inventory below;
health is **S15**, which also _writes_ the `users` rows
the guards here evaluate — S1 owns the gate, S15 owns the admin surface behind
it. Client-side consumption rules (tiers, caches) are
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md). Sub-file custody exceptions are
in SYSTEMS.md §4.1 (`main.ts` owned here — S2/S15/S12 readers;
`LoggedInWrapper.tsx` owned here — S3/S14 readers; `routes/instance/users.ts` +
`db/instance/users.ts` owned here — S15/S13 readers).

## Contract

222 registry routes, zero direct
client↔server imports; expected failures travel as HTTP 200 +
`{ success: false, err }` — only guards and validation emit real 4xx/5xx. There
is no request-scoped scope header any more: **the id in the path is the whole
addressing story** (see the doctrine below). This
system also owns the _inventory_ of the off-registry endpoints (each owned
by its home system) — that list is the erosion surface of the registry seam and
must stay deliberate and enumerated (see below).

## The registry contract (`lib/api-routes/`)

Each feature file exports a `*RouteRegistry` object of `route({...})` calls
(`route-utils.ts`); `combined.ts` spreads all 23 into `routeRegistry`, the one
object both `server/routes/route-helpers.ts` and
`lib/server_actions/create_server_action.ts` import. Add an entry → the client
gets a typed action and the server gets a typed handler signature for free;
forget to implement it → boot fails.

Canonical example — `lib/api-routes/products/reports.ts`:

```ts
// report_id IS the product id.
const reportIdParamsSchema = z.object({ report_id: z.string() });

export const reportRouteRegistry = {
  getReportDetail: route({
    path: "/reports/:report_id",
    method: "GET",
    params: reportIdParamsSchema,
    response: {} as ReportDetail,
  }),
  updateReportFigures: route({
    path: "/reports/:report_id/figures",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ figures: reportFiguresSchema }),
    response: {} as { lastUpdated: string },
  }),
};
```

The per-type registries (`reports.ts`, `slide-decks.ts`, `slides.ts`) carry
**content and version routes only**: label, folder, package, scope, duplicate
and delete are cross-type batch routes on `products.ts`, because a product id
is one namespace and nothing dispatches per kind (S12, D16).

| Field             | Purpose                                                                   | Runtime vs type                                              |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `path`            | URL path, `:name` for params                                              | real value                                                   |
| `method`          | `GET`/`POST`/`PUT`/`DELETE`/`PATCH`                                       | real value                                                   |
| `params`          | URL param schema (coercion where needed)                                  | **real Zod schema, validated per request**                   |
| `body`            | request body schema, always `z.object({…})`                               | **real Zod schema, validated per request**                   |
| `response`        | success `data` shape; omit for no-data                                    | compile-time phantom (`{} as T`), never validated at runtime |
| `isStreaming`     | NDJSON stream protocol                                                    | real boolean                                                 |
| `timeoutMs`       | client fetch timeout override (default 5 min; streaming routes have none) | real number                                                  |

`params`/`body` as phantom `{} as T` is retired — `route()` requires real Zod
schemas for both, so a handler can trust they match their `z.infer<T>` types.
`response` alone stays a phantom: the server is the trusted producer, and the
only response check is the compile-time `TypedResponse` constraint on the
handler return (a local `InferredResponse` type resolves it to
`APIResponseWithData<T>` when `response` is set, else `APIResponseNoData`).

Naming: the `products/` registry files are kebab-case where the name is
multi-word (`slide-decks.ts`), the `instance/` ones snake_case
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
the DB function already returns an envelope. `server/routes/products/reports.ts`
is the canonical, fully-consistent implementation file.

Two deliberate validation holes remain, both documented: `response` (above), and
fields schema'd as `z.unknown()` — the sentinel-encoded `slide`/`figures`
passthroughs, validated in the DB layer after decode
([PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)). Don't add new
`z.unknown()` body fields to dodge writing a schema.

## Consuming a route — generated server actions (client)

`create_server_action.ts` iterates `routeRegistry` and builds one async function
per key. `buildRequestParams` substitutes `:param` segments from `args`; every
remaining arg key becomes the JSON body. There is no scoping header: the URL is
the only channel that carries identity, which is why the route-tracker's
body/transport check has exactly one rule left (a body key that is also a path
placeholder).

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
fires `onProgress`. Two routes use it today, both in
`server/routes/instance/structure.ts`.

## The `log()` middleware

`server/middleware/logging.ts` slots into S1's per-route middleware chain
(between the permission guard and the handler) but belongs to S17 — see
[SYSTEM_17_logging.md](SYSTEM_17_logging.md) for the write path, retention, and
coverage conventions.

## Startup validation (`route-tracker.ts`)

`validateAllRoutesDefined()`, called at the end of `main.ts` before
`Deno.serve`, cross-checks the contract and **`Deno.exit(1)`s on any
violation**: registry keys never implemented, implemented routes not in the
registry, duplicate `method + path` pairs, key collisions across feature
registries, `:placeholder` segments without a matching `params` key, and body
keys that collide with the transport (a body key that is also a path
placeholder — the client strips it from the body while the server's Zod
validator still requires it). Success prints
`✅ All N routes correctly implemented`. A broken route cannot ship.

## Off-registry endpoints — the complete inventory

These register handlers directly on a `Hono()` without `defineRoute`: no
generated client action, no registry typing, invisible to
`validateAllRoutesDefined`. This is the **complete** allowed list; anything not
here uses the registry.

| File                                                                 | Owner | Why raw                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/instance/instance-sse.ts`                                    | S3    | the one SSE channel: a long-lived stream, not request/response                                                                                                                                                                                    |
| `routes/instance/collab.ts`                                          | S16   | WebSocket upgrade (`GET /collab`) — long-lived bidirectional collab transport, mounted in `main.ts` behind the global `authMiddleware`; admission is origin + Clerk + `approved`, and every denial after the Origin check is a post-upgrade close |
| `routes/instance/copilot_ai_proxy.ts`, `routes/instance/ai_proxy.ts` | S13   | Anthropic passthrough (mounted `/ai` and `/ai-instance`, both thin wrappers over `routes/anthropic_messages_proxy.ts`) — returns Anthropic-shaped bodies, not `APIResponse`                                                                       |
| `routes/instance/ai_files.ts`                                        | S13   | Anthropic Files API passthrough, mounted `/ai`                                                                                                                                                                                                    |
| `routes/instance/upload.ts`                                          | S4    | Hand-rolled TUS resumable-upload protocol (custom headers/handshake)                                                                                                                                                                              |
| `routes/instance/health.ts`                                          | S15   | Diagnostics; 11 routes, bare JSON, deliberately unauthenticated for external monitoring (exposure inventory is S15's contract)                                                                                                                    |
| `routes/instance/structure.ts` (2 routes only)                       | S5    | CSV download `Response`s (facilities export, HFA weights export) inside an otherwise-registry file — guarded and logged, but raw                                                                                                                  |
| `routes/public/oauth_metadata.ts`                                    | S1    | Unauthenticated discovery documents, read before any credential exists (below)                                                                                                                                                                    |
| `/mcp` (`main.ts` → `server/mcp/mcp_endpoint.ts`)                    | S13   | The panther MCP adapter owns its own auth, sessions and CORS; `main.ts` bypasses the Clerk and CORS middleware for it                                                                                                                             |

## Access control

### `authMiddleware` — Clerk (populate-not-reject); headless auth is a separate mount

`server/middleware/auth.ts`: `_BYPASS_AUTH ? passthrough : clerkMiddleware()`,
which only **populates** `getAuth(c)` — it never rejects. Rejection is the job
of a per-route guard, so a route with no guard is reachable by any authenticated
caller. Mount order matters: the OAuth discovery well-knowns and the
`/access-tokens` SPA shell are registered before the global middleware
(anonymous-reachable — Hono runs handlers registered ahead of an `app.use`
before it), and `/mcp` is skipped by both the Clerk and the CORS middleware
because the adapter owns its own auth and headers. The only anonymous surfaces
are those discovery documents and S15's health endpoints, deliberately
unauthenticated for external monitoring; **no anonymous route reads instance
data.**

**The cookie mount takes session tokens ONLY.** Under `@hono/clerk-auth` v3 this
is no longer automatic: v3's `clerkMiddleware` calls `authenticateRequest` with
`acceptsToken: "any"`, so a machine token (API key, M2M, or an OAuth access
token) presented as a Bearer header to an ordinary `/api` route now produces an
_authenticated_ machine auth object — one carrying a `userId` but no
`sessionClaims`. `getClerkSessionAuth()` is the single accessor for this and
guards on `tokenType === "session_token"`, restoring v2's behaviour exactly.
Never read `c.var.clerkAuth` directly: in v3 it is the auth **function**
`getAuth()` invokes, not the auth object (v2 stored the object).

### The headless credential seam

**Two credential types, one resolver.** `server/headless_auth.ts` exports
`resolveHeadlessCredentialEmail(authorizationHeader)`, and it is the ONLY place
a headless credential is judged:

- `Bearer fastr_pat_…` → `personal_access_tokens` (SHA-256 hash lookup that also
  stamps `last_used_at`). Minted per user (self-service
  `createPersonalAccessToken` / `listPersonalAccessTokens` /
  `revokePersonalAccessToken`, always scoped to `c.var.globalUser.email`), shown
  once, stored only as a hash (migration 073).
- any other `Bearer …` → a Clerk **OAuth access token**, verified with
  `authenticateRequest(…, { acceptsToken: "oauth_token" })`, then
  `users.getUser(userId)` for the **primary email** — the OAuth auth object
  carries `userId`/`clientId`/`scopes` but no email. Matching on primary email
  is what makes an OAuth caller and a browser login resolve to the same FASTR
  user.

Contract: `null` = "judged, and bad" → 401; a **throw** = "could not judge" →
503. This distinction is load-bearing and is the reason the OAuth branch is not
a straight `isAuthenticated` check: Clerk **never throws**, folding an unknown
token, a wrong secret key, an HTTP 500 and a DNS failure into one non-throwing
signed-out state distinguished only by a `reason` string. Mapping all of those
to `null` would answer 401 during a Clerk outage, and a 401 tells every
connected client its grant is invalid — dragging every user back through consent
for a transient fault. So the mapping is allow-listed toward throwing: only
`token-invalid` and `token-type-mismatch` resolve to `null`. Pinned by
`server/tests/headless_oauth_auth_test.ts`.

**Two judgment points, both calling that one resolver** — this is the whole
point of the seam. Verifying only at the `/mcp` door is not enough: every MCP
tool call dispatches server actions in-process through `headlessApp`, which runs
`headlessAuthMiddleware` per dispatch. A door-only check would let a connector
initialize and list tools, then fail on every real tool call.

1. `server/mcp/mcp_endpoint.ts` — the `/mcp` adapter's `authenticate` hook.
2. `server/middleware/auth.ts` — `headlessAuthMiddleware`, which sets
   `c.var.headlessAuthEmail`.

In `getGlobalUser`, `headlessAuthEmail` short-circuits the Clerk branch and
feeds the same DB-backed `GlobalUser` construction, so a headless request has
exactly the user's own permissions — every guard downstream is unchanged.

**Revocation is asymmetric, permanently.** A PAT is re-verified against the DB
on every dispatch, so revocation is effectively immediate. A verified OAuth
token is cached by token for ~30 s (`OAUTH_EMAIL_TTL_MS`, aligned with the
`/mcp` context cache's `CONTEXT_TTL_MS`), so a revoked grant keeps working for
up to that long. That cache is **load-bearing, not an optimization**: Clerk's
OAuth auth object has no email, so each resolve costs a `users.getUser` call
(plus a verify call for an opaque token), and every tool call dispatches several
actions. Without it one tool call would burn a handful of rate-limited Clerk
calls. Only successes are cached — a bad token can never occupy a slot.

> **Caveat, unverified as of 2026-08-06.** The ~30 s window assumes Clerk issues
> **opaque** (`oat_`) access tokens, which are verified through the Backend API
> and therefore see revocation. If the OAuth application issues **JWT** access
> tokens instead, `@clerk/backend` verifies them **locally against JWKS with no
> Backend API call**, so revocation is not observed at all until the token
> expires (~1 h) — our cache TTL is irrelevant in that case. Which format a
> dynamically-registered client receives has not been confirmed against a real
> grant; confirm during live verification and, if it is JWT, either accept the
> longer window or configure the application for opaque tokens.

**Naming.** These were all `pat*` before OAuth existed and the names became
lies: `patOnlyMiddleware`/`patAuthMiddleware` → `headlessAuthMiddleware`,
`patAuthEmail` → `headlessAuthEmail`, `pat_app.ts`/`patApp`/`patAppFetch` →
`headless_app.ts`/`headlessApp`/`headlessAppFetch`, `pat_allowlist.ts`/
`patRouteAllowlist` → `headless_allowlist.ts`/`headlessRouteAllowlist`.
`PAT_PREFIX`, `resolvePersonalAccessTokenEmail` and mint/revoke keep their names
— they are genuinely PAT-specific.

### OAuth discovery (`server/routes/public/oauth_metadata.ts`)

FASTR is only the **resource server**; Clerk is the authorization server and
owns `/authorize`, `/token` and `/oauth/register`. Three unauthenticated routes,
registered before the global middleware because they are what a client reads
_before_ it has any credential:

- `/.well-known/oauth-protected-resource/mcp` (RFC 9728) — and the bare
  `/.well-known/oauth-protected-resource` too, since clients differ on which
  they probe.
- `/.well-known/oauth-authorization-server` (RFC 8414) — Clerk's own document,
  proxied verbatim and cached 10 min, for clients predating RFC 9728. `issuer`
  therefore names Clerk while the document is served from the instance origin;
  that mismatch is deliberate, since rewriting `issuer` would break the
  exchange.

The authorization server URL is derived from `CLERK_PUBLISHABLE_KEY`
(`pk_(test|live)_<base64(host + "$")>`) rather than a separate env var that
could drift. The instance origin is derived **per request** (`Host` +
`X-Forwarded-Proto`, since TLS terminates at the proxy and Deno sees plain http)
— `CLIENT_ORIGIN` cannot stand in for it: it is a CORS allowlist and on testing2
is still the localhost default. The `/mcp` 401 emits
`WWW-Authenticate: Bearer resource_metadata="…"` via panther's
`resourceMetadataUrl` option, using that **same** derivation helper, because RFC
9728 ties the pointer to the resource identifier and the two must never
disagree.

**The OAuth flow requires dynamic client registration to be enabled** on the
Clerk instance (Dashboard → Configure → OAuth applications). Without it
`/oauth/register` returns 422 and the connector cannot self-register. Enabling
it also force-enables Clerk's consent screen. The server-action layer lives in
`lib/server_actions/` (compiled into both tiers) and reaches its environment
only through the **transport seam** (`lib/server_actions/transport.ts`):
LoggedInWrapper registers the browser transport (Clerk cookie, session refresh,
reload on persistent 401) at module scope; the generated actions are identical
wherever they run.

**Transport registration doctrine** (amended 2026-08-06, PLAN_112 D4). The
prohibition that matters stands verbatim: **no server code ever calls
`setServerActionTransport`.** A process-global registration would make the app
server issue authenticated calls under whichever identity was registered last —
a confused-deputy shape with no per-request isolation. What is now sanctioned is
the opposite shape: an **explicit per-context transport**, passed as an argument
and never registered anywhere. `createAllServerActions(transport?)` takes one,
and `ServerActionTransport.fetchImpl?` lets it dispatch **in-process** rather
than over the network. The `/mcp` endpoint builds one per (token, pinned
package) context carrying that caller's own token, with `fetchImpl:
headlessAppFetch` — so every action runs the real headless middleware chain
(verify + `last_used_at` stamp, deny-by-default allowlist, zod validation,
`requireApprovedUser()` on the run-keyed package reads, logging) with no
loopback HTTP and no shared state. The stricter `can_view_data` bit those reads
used to carry now lives ONCE, at the `/mcp` door (`server/mcp/context_cache.ts`
`resolvePackageContext`) — the run-keyed routes joined the permissive product
tier at D2, so the door check is load-bearing rather than belt-and-braces.
Per-request isolation is exactly what the explicit form restores; both defaults
are unchanged, so SPA callers (`createAllServerActions()`, global fetch) behave
byte-identically. Pinned by `server/tests/pat_identity_parity_test.ts`, which
drives the same route through the raw PAT app, an explicit transport, and a
defaulted caller and asserts all three agree. The headless app's mount list
and the allowlist are two hand-kept lists; `validateHeadlessMounts()`
(`headless_app.ts`) runs at every DEV boot (`main.ts`, gated on `_IS_DEV`)
beside `validateAllRoutesDefined()`: a structural check of Hono's route
table — every allowlisted name's `method + path` must be registered on
`headlessApp` — that fail-stops on a miss (they drifted once — allowlisted
run-keyed reads whose route file was never mounted 404'd silently through
`/mcp`). **Every DEV boot then runs the whole server test suite**
(`server/dev_boot_checks.ts` → `deno task test`, a subprocess with
`BYPASS_AUTH` cleared, `--no-check`, ~2 s) and fail-stops on any failure;
production boots skip both. `deno task typecheck` checks `server/tests/*.ts`
too, so the suite is typed at the deploy gate. Note there is NO compiler-enforced
browser-free boundary in `lib/` either: the server typecheck carries the
TypeScript `dom` lib (`deno.json` → `"lib": [... "dom" ...]`), so a
`document`/`window` reference in a `lib/` file passes `deno check main.ts` clean
— the boundary holds by convention plus runtime guards
(`typeof document === "undefined"` branches, no browser globals at module
scope). Mechanical enforcement, if ever wanted, means a separate dom-less
`deno check` of `lib/` or a lint rule.

### The two guards

Both live in `server/middleware/userPermission.ts`, both skip `OPTIONS` (CORS
preflight), both resolve identity through the single `getGlobalUser(c)` in
`server/auth/global_user.ts`, and both fail closed: `"NOT_AUTHENTICATED"` →
`401 { success: false, err, authError: true }`, any thrown DB error →
`503 "Service temporarily unavailable"` (no `authError`). On success both set
`c.var.globalUser` and `c.var.mainDb` — there is no second DB handle to mint any
more, because there is one database (S2).

**`requireApprovedUser()`** — the whole product surface, and nothing finer:
product/folder CRUD, the run-keyed figure-data reads, the run authoring context,
`listAttachableResultsPackages`, the Explore tab's reads, the copilot `/ai` and
`/ai/files` mounts, and (as its own origin+Clerk+`approved` check) the collab
socket. It takes no arguments. `!globalUser.approved` → 403 "Your account is
awaiting approval"; `approved` is `_OPEN_ACCESS || !!usersRow`. Every approved
user is a full editor of every product — that is the ruled state, not an
oversight (D2); `products.created_by` is recorded so a later owner/sharing model
has its join key.

**`requireGlobalPermission([opts,] ...UserPermission)`** — everything else:
users, logs, settings, and the data / results-package plane. Options
`{ requireAdmin? }`; `requireAdmin && !isGlobalAdmin` → 403; global admins
bypass the permission loop; otherwise every listed permission must be truthy on
`globalUser.thisUserPermissions`, else 403. Its zero-permission form
(`requireGlobalPermission()`, 28 call sites) authenticates and **does not check
`approved`** — that asymmetry is deliberate and unchanged by the restructure;
routes that need approval say so by using `requireApprovedUser()` instead.
`requireGlobalPermissionOrStatusKey(...)` wraps it for the two fleet-internal
routes that a machine may call with the shared `status-api-key` header: the
machine branch gets `mainDb` but **no** `globalUser`, so a handler behind it must
treat a missing `globalUser` as the machine actor.

**The `authError` flag is 401-only.** Only the 401 not-authenticated responses
carry `authError: true`; no 403 does, and the client (`tryCatchServer`) only
inspects the flag on status 401, where it drives token-refresh/logout.
Auth-failure vs outage stays distinguishable by status: 401/403 = denied,
503 = retry, don't log out.

### Doctrine — the id in the path IS the authority

There is no request-scoped tenancy handle. A product route is addressed by
`/:product_id` (or `/:report_id`, `/:slide_deck_id`, `/:slide_id` — all of them
product or product-child ids), the guard establishes only that the caller is an
approved user, and the handler acts on the id the URL names. No handler
re-derives access from a body field, and none is expected to: with a permissive
product tier there is nothing finer to check, so a per-handler check would be
dead code that later rots into an inconsistent policy.

**A future permission scheme replaces that ONE guard with a product-aware one**
— it reads the id the route already carries and judges it. It must not be built
by scattering checks into handlers; that is the shape the project tier had, and
it is why 17 flags, 6 forms and ~20 client gates had to move together every time
the policy changed. The doctrine is restated at the `requireApprovedUser()`
definition and nowhere else.

### Permission source of truth — `lib/types/permissions.ts`

| Export                                                 | Purpose                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `UserPermissions` / `UserPermission`                   | the instance-level shape + key union                                       |
| `USER_PERMISSIONS`                                     | canonical key array with a compile-time `_AssertUserExhaustive` check      |
| `buildUserPermissionsFromRow`                          | DB row → permissions object; **warn** on a missing column, default `false` |
| `_USER_PERMISSIONS_DEFAULT_FULL_ACCESS` / `_NO_ACCESS` | presets for admins / unknown users                                         |

Six instance permissions, and no other tier: `can_configure_users`,
`can_view_users`, `can_view_logs`, `can_configure_settings`,
`can_configure_data`, `can_view_data`. There is no second tier: approval is a
boolean, and everything above it is one of these six. Add a key in this file — so the exhaustiveness assert and
`buildUserPermissionsFromRow` stay correct — never inline a permission string
elsewhere. `lib/types/permission_labels.ts` carries the six t3 labels the users
UI renders.

### Special modes (precedence, highest first)

| Mode           | Source                                             | Effect                                                                    |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `_BYPASS_AUTH` | `BYPASS_AUTH` env, dev only (`&& !_IS_PRODUCTION`) | synthetic full-access dev user; Clerk disabled entirely                   |
| `_OPEN_ACCESS` | `OPEN_ACCESS` env                                  | every authenticated email treated as approved global admin                |
| `is_admin`     | `users.is_admin` column                            | global admin — bypasses all permission checks                             |
| `H_USERS`      | hardcoded `lib/h_users.ts` (9 emails)              | `unlimitedAi`; the four superuser-only surfaces listed below              |
| granular       | `users` columns                                    | normal least-privilege path                                               |

`_OPEN_ACCESS` inserts unknown emails as `is_admin` rows
(`ON CONFLICT DO NOTHING` — an existing non-admin row is never promoted in the
DB; effective admin comes from the `_OPEN_ACCESS ||` short-circuit, so turning
the mode off reverts them).
`unlimitedAi = H_USERS.includes(email) ||
rawUser.unlimited_ai` (S13). Its remaining reach after the products
restructure, in full: the dev boot seed (`db_startup.ts`), `unlimitedAi`,
in-handler gates on `setUserUnlimitedAi` / `setUserContactPerson`, the
users-list hide toggle, the `renameUserEmail` warning, the `version_capture`
usage-stats skip, and the feedback recipients. It grants no data access of any
kind. Prefer a
granular permission or `requireAdmin` over a new `H_USERS.includes()` check —
it's a hardcoded allowlist, and expanding its use spreads policy into code.

## Traps

- **Global admins bypass everything.** `isGlobalAdmin` short-circuits
  `requireGlobalPermission`'s permission loop. A bug masked by "I tested as
  admin" will bite a least-privilege user. (`requireApprovedUser()` has no
  bypass — an admin is approved by the same `approved` field everyone else is.)
- **Don't assume `c.var.globalUser` exists without a guard** — only a guard
  populates it, and `requireGlobalPermissionOrStatusKey`'s machine branch
  deliberately leaves it undefined.
- **`buildUserPermissionsFromRow` defaults missing columns to `false` and warns.** A new
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
- **Startup guard-audit — considered and DECLINED (Tim, 2026-08-03).** A
  boot-time (or type-level) check that every `defineRoute` carries a guard or an
  explicit public marker was audited and rejected: the full registry has exactly
  one unguarded route (`getInstanceMeta`, deliberately public), so the rule
  stays convention + review. Do not re-propose without a new hole. (The old
  health.ts-guards item closed 2026-07-17: the read surface is public-by-design
  — SYSTEM_15's exposure inventory — and the mutating reset endpoint now
  requires the status-api key.)
- **Decide the `authError` contract.** It is 401-only in reality (no 403 carries
  it; the client only reads it on 401) — either bless that as the contract or
  extend it to 403s deliberately.
- **Zero-perm `requireGlobalPermission()` skips the `approved` check** — any
  Clerk-authenticated email (even with no `users` row) passes its 28 call sites.
  Deliberately left byte-identical through the products restructure so the
  blast radius stayed the product surface only; a sweep deciding which of those
  28 should be `requireApprovedUser()` is real pending work.
- **Two `H_USERS` gates live inside handlers, not guards** (`setUserUnlimitedAi`,
  `setUserContactPerson`, both behind a zero-perm `requireGlobalPermission()`).
  Audit the call sites; document per site why `requireAdmin` / a granular
  permission is insufficient, or lift the check into the guard.
