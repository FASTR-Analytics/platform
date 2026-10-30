---
system: 1
name: API Contract, Transport & Access Control
globs:
  - client/src/components/instance/logged_in_wrapper.tsx
  - client/src/server_actions/**
  - client/src/state/_infra/auth_mode.ts
  - client/src/state/_infra/clerk.ts
  - lib/api-routes/**
  - lib/server_actions/**
  - lib/types/streaming.ts
  - main.ts
  - mint_pat.ts
  - server/clerk_api.ts
  - server/db/instance/personal_access_tokens.ts
  - server/middleware/auth.ts
  - server/middleware/cache.ts
  - server/middleware/cors.ts
  - server/middleware/mod.ts
  - server/middleware/headless_allowlist.ts
  - server/middleware/static.ts
  - server/headless_app.ts
  - server/headless_auth.ts
  - server/routes/route-helpers.ts
  - server/routes/route-tracker.ts
  - server/routes/streaming.ts
  - server/routes/public/oauth_metadata.ts
  - server/tests/headless_oauth_auth_test.ts
  - server/tests/pat_identity_parity_test.ts
docs_absorbed:
---

# S1: API Contract, Transport & Access Control

The typed RPC registry both tiers are generated from, plus the auth gate every
request passes. One route declaration in `lib/api-routes/` is the whole
contract: the server types its handler off it (`defineRoute`), the client
generates a typed server-action from it, and boot fails if the two sets diverge.
Around that seam sit the `APIResponse` envelope, the request-scoped NDJSON
streaming sub-protocol, the `log()` audit middleware, and the seam where the
registry's `guard` field installs the guard that S18 owns. Reviewed against code
(first review cycle, review-only; absorbs DOC_API_ROUTES + DOC_ACCESS_CONTROL).

Boundaries: the add-a-route/add-a-guard **recipe** is
[PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md); the generic
envelope/boundary-validation/permission-first rules it builds on are panther's
`protocols/PROTOCOL_DENO_API.md`, deferred there, not restated here (one caveat:
that protocol's example code does header/permission/parse checks _inline in
handlers_, which this app centralizes in `defineRoute` + guards; follow the
rules, not the examples). Server-side **push** (SSE/ BroadcastChannel) is
**S3**. The streaming here is request-scoped NDJSON, a different thing. The DB
functions handlers call, and the error funnel that produces their envelopes, are
**S2** ([SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)). The Anthropic
proxy internals are **S13**; TUS upload is **S4**; the collaboration WebSocket
(`GET /collab`) is **S16**
([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)), where S1 owns only
its seat in the off-registry inventory below; health is **S15**. What a request
may do once its credential has become an email, the identity builder, the guard
factories, the product access policy, the flags and the user-management routes,
is **S18** ([SYSTEM_18_permissions.md](SYSTEM_18_permissions.md)): S1 owns the
credential seam and the transport, S18 the policy behind it. Client-side
consumption rules (tiers, caches) are
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md). Sub-file custody exceptions are
in SYSTEMS.md §4.1 (`main.ts` owned here, S2/S15 readers;
`instance/logged_in_wrapper.tsx` owned here, S3/S14 readers;
`routes/instance/users.ts` + `db/instance/users.ts` owned by S18, S1/S15/S13
readers; `middleware/static.ts` owned here, S18 reader).

## Contract

243 registry routes, zero direct client↔server imports; expected failures travel
as HTTP 200 + `{ success: false, err }`, and only guards and validation emit
real 4xx/5xx. This system also owns the _inventory_ of the ~30 off-registry
endpoints (each owned by its home system): that list is the erosion surface of
the registry seam and must stay deliberate and enumerated (see below).

## The registry contract (`lib/api-routes/`)

Each feature file exports a `*RouteRegistry` object of `route({...})` calls
(`route-utils.ts`); `combined.ts` spreads all 23 into `routeRegistry`, the one
object both `server/routes/route-helpers.ts` and
`lib/server_actions/create_server_action.ts` import. Add an entry → the client
gets a typed action and the server gets a typed handler signature for free;
forget to implement it → boot fails.

Canonical example (`lib/api-routes/products/reports.ts`):

```ts
export const productReportRouteRegistry = {
  getReportDetail: route({
    path: "/products/:product_id/report",
    method: "GET",
    guard: GUARD.product("view"),
    params: productIdParamsSchema, // z.object({ product_id: z.string() })
    response: {} as ReportDetail,
  }),
  updateReportBody: route({
    path: "/products/:product_id/report/body",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({
      body: z.string(),
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string; conflicted: boolean },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
```

| Field         | Purpose                                                                   | Runtime vs type                                              |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `path`        | URL path, `:name` for params                                              | real value                                                   |
| `method`      | `GET`/`POST`/`PUT`/`DELETE`/`PATCH`                                       | real value                                                   |
| `params`      | URL param schema (coercion where needed)                                  | **real Zod schema, validated per request**                   |
| `body`        | request body schema, always `z.object({…})`                               | **real Zod schema, validated per request**                   |
| `response`    | success `data` shape; omit for no-data                                    | compile-time phantom (`{} as T`), never validated at runtime |
| `isStreaming` | NDJSON stream protocol                                                    | real boolean                                                 |
| `timeoutMs`   | client fetch timeout override (default 5 min; streaming routes have none) | real number                                                  |
| `guard`       | what the caller must be (`RouteGuard`, S18); `defineRoute` installs it    | real value, mandatory on every entry                         |
| `orStatusKey` | also admits a fleet machine call carrying the status key                  | real boolean, one entry (`renameUserEmail`)                  |
| `headless`    | reachable through the headless app (`/mcp`)                               | real boolean, three entries                                  |

`params`/`body` are never phantom: `route()` requires real Zod schemas for both,
so a handler can trust they match their `z.infer<T>` types. `response` alone
stays a phantom: the server is the trusted producer, and the only response check
is the compile-time `TypedResponse` constraint on the handler return (a local
`InferredResponse` type resolves it to `APIResponseWithData<T>` when `response`
is set, else `APIResponseNoData`).

Naming: the `products/` registry files are kebab-case (`slide-decks.ts`), the
`instance/` ones snake_case (`geojson_maps.ts`); server implementation files in
`server/routes/` are snake_case throughout. Pairing is by registry key, never by
filename.

**The `X | undefined` inference trap.** `route()`'s `response?:` parameter is
optional, so `response: {} as X | undefined` silently infers as `X`: the
contract then claims `data` is always present. For a sometimes-absent payload
declare `X | null` (survives inference, and `null` is wire-honest where
`undefined` is dropped by JSON anyway). No current route declares a top-level
nullable response.

## Implementing a route: `defineRoute` (server)

`defineRoute(router, routeName, ...middlewares, handler)` in `route-helpers.ts`
looks up `routeRegistry[routeName]` for path + method, registers on the Hono
router with the lowercased method, and calls `markRouteDefined(routeName)`. Per
request it parses `:param` segments and, for `POST`/`PUT`/`PATCH`/`DELETE`, the
JSON body (empty-object fallback) against the registry Zod schemas, returning a
`400 { success: false, err }` on mismatch; params get coercion
(`z.coerce.number()`). Handlers receive `(c, { params, body })` fully typed and
validated. Hono 4.5 caches `c.req.json()` internally, so `log()`, `defineRoute`,
and a handler can all read the body safely.

**Handler returns are type-enforced against the registry.** Non-streaming
handlers must return `Response & TypedResponse<JSONParsed<Envelope>>`, i.e.
exactly what `c.json(res)` produces when `res` matches the declared envelope.
The comparison is in **wire-space**: `JSONParsed` maps `Date` → `string` the way
JSON serialization does, so DB-layer types carrying `Date` fields pass without
casts, while shape drift (wrong/missing fields, data on a no-data route, a bare
payload without the envelope) is a compile error at the `defineRoute` call.
Never cast to `any` to silence this: the error means the registry and the
implementation disagree, and one of them is wrong. `isStreaming` routes are
exempt (they return a plain `Response` from `streamResponse`).

The thin-handler shape is invariant: **call one DB fn →
`if (!res.success)
return c.json(res)` → `notify*()` on success →
`c.json(res)`.** Business logic lives in the DB layer (S2); notify side-effects
push state over SSE (S3); routes never hand-build `{ success: true, data }` when
the DB function already returns an envelope. `server/routes/products/reports.ts`
is the canonical, fully-consistent implementation file.

Three deliberate validation holes remain, all documented: `response` (above);
the `geo.data` field of a figure bundle, schema'd as `z.unknown()` because
GeoJSON is an external stable spec (`lib/types/_figure_bundle.ts`); and the
per-node `style` record of a slide layout, `z.record(z.string(),
z.unknown())`
in `lib/types/_slide_config.ts`, whose values are panther's CSS-in-JS. The
`slide`/`figures` bodies themselves parse against `slideConfigSchema` /
`reportFiguresSchema`. Don't add new `z.unknown()` body fields to dodge writing
a schema.

## Consuming a route: generated server actions (client)

`create_server_action.ts` iterates `routeRegistry` and builds one async function
per key. `buildRequestParams` substitutes `:param` segments from `args`; every
remaining arg key becomes the JSON body.

Non-streaming calls go through `tryCatchServer`, which is more than a fetch
wrapper: 2-retry exponential backoff for safe methods, a 401
token-refresh/reload path (keyed off `authError`), 503 handling, and
HTML-maintenance-page detection, all returning a parsed `APIResponse` to the
caller. `tryCatchServerRaw` runs the same request loop for an off-registry `GET`
whose body is not an envelope (the geojson serving route): the caller passes how
the body is read, and the result is still an `APIResponse`. Streaming calls
(`isStreaming: true`) go through `consumeStream`, have **no** timeout, and
pre-refresh the Clerk token before connecting.

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
`main.ts`'s `app.onError` also returns `{ success: false, err }`, at the default
HTTP **200**, a known wart, not a pattern: clients detect failure by
`success: false`, not status. Real status codes exist only at the edges:
validation 400, guards 401/403, outage 503.

## Streaming sub-protocol (request-scoped NDJSON)

For long-running request/response work (not push), set `isStreaming: true` and
use `streamResponse` from `server/routes/streaming.ts`, a single HTTP response
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
wraps the handler in try/catch: an uncaught throw becomes `writer.error(...)`,
so the stream always terminates cleanly. The client `consumeStream` mirrors it
exactly: `progress === 1` or `=== -1` returns `message.result`; anything else
fires `onProgress`. Two routes use it today, both in
`server/routes/instance/structure.ts` (the step-3 CSV and DHIS2 staging).

## The `log()` middleware

`server/middleware/logging.ts` slots into S1's per-route middleware chain
(between the permission guard and the handler) but belongs to S17. See
[SYSTEM_17_logging.md](SYSTEM_17_logging.md) for the write path, retention, and
coverage conventions.

## Startup validation (`route-tracker.ts`)

`validateAllRoutesDefined()`, called at the end of `main.ts` before
`Deno.serve`, cross-checks the contract and **`Deno.exit(1)`s on any
violation**: registry keys never implemented, implemented routes not in the
registry, duplicate `method + path` pairs, key collisions across feature
registries, `:placeholder` segments without a matching `params` key, body keys
that are also path placeholders (the client strips them from the body), a public
route other than `getInstanceMeta`, a route with a `:product_id` segment or a
`productIds` body whose guard is not `product`, and one with a `:folder_id`
segment or a `parentId` body whose guard is not `folder`, so no request can pick
the policy branch a route takes. Success prints
`✅ All N routes correctly implemented` and the guard inventory by kind. A
broken route cannot ship.

## Off-registry endpoints: the complete inventory

These register handlers directly on a `Hono()` without `defineRoute`: no
generated client action, no registry typing, invisible to
`validateAllRoutesDefined`. This is the **complete** allowed list; anything not
here uses the registry.

| File                                            | Owner | Why raw                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/instance/instance-sse.ts`               | S3    | SSE long-lived stream, not request/response                                                                                                                                                                                                                          |
| `routes/instance/collab.ts`                     | S16   | WebSocket upgrade (`GET /collab`), the instance-wide collab transport for slide and report rooms, mounted raw in `main.ts` behind the global `authMiddleware`; admission = origin + Clerk + `approved`, resolved pre-upgrade; every document frame names its product |
| `routes/instance/copilot_ai_proxy.ts`           | S13   | Anthropic passthrough (mounted `/ai` behind `requireApprovedUser()`, a thin wrapper over `routes/anthropic_messages_proxy.ts`). Returns Anthropic-shaped bodies, not `APIResponse`                                                                                   |
| `routes/instance/ai_files.ts`                   | S13   | Anthropic Files API passthrough, mounted `/ai` beside the copilot proxy, same guard                                                                                                                                                                                  |
| `routes/instance/upload.ts`                     | S4    | Hand-rolled TUS resumable-upload protocol (custom headers/handshake)                                                                                                                                                                                                 |
| `routes/instance/health.ts`                     | S15   | Diagnostics; 12 routes, bare JSON; the reads deliberately unauthenticated for external monitoring, two behind `requireStatusKey()` (exposure inventory is S15's contract)                                                                                            |
| `headless_app.ts` `GET /info/:file.md`          | S1    | The reference docs the copilot's `get_reference_doc` tool reads, as plain text, on the headless app only; admitted by the allowlist's raw pattern                                                                                                                    |
| `routes/instance/structure.ts` (2 routes only)  | S5    | CSV download `Response`s (facilities export, HFA weights export) inside an otherwise-registry file, guarded and logged, but raw                                                                                                                                      |
| `routes/instance/population.ts` (2 routes only) | S5    | CSV download `Response`s (population export, import template) inside an otherwise-registry file, guarded and logged, but raw                                                                                                                                         |
| `routes/instance/run_generation.ts` (1 route)   | S8    | A captured boundary file streamed as stored, gzipped (`GET /run_generation/run/:run_id/geojson/:family/:level`), immutable-cached; guarded, unlogged (a per-page-load fetch)                                                                                         |
| `routes/instance/geojson_maps.ts` (1 route)     | S5    | A raw GeoJSON body, not an envelope (`GET /geojson-maps/level/:family/:level/:uploaded_at`), gzipped and immutable-cached; guarded, unlogged (a per-connect fetch)                                                                                                   |
| `routes/public/oauth_metadata.ts`               | S1    | OAuth discovery documents for `/mcp` clients (three `GET`s), public by protocol                                                                                                                                                                                      |
| `main.ts` `app.all("/mcp")`                     | S13   | The remote MCP endpoint: answers the CORS preflight before auth, then hands the request to the MCP adapter                                                                                                                                                           |
| `main.ts` `app.get("/access-tokens")`           | S1    | Serves the SPA shell for the unlisted token panel with `no-cache`, registered ahead of the cache middleware and the global auth mount (the page itself signs in)                                                                                                     |

## Access control

### `authMiddleware`: Clerk (populate-not-reject); headless auth is a separate mount

`server/middleware/auth.ts`:
`_BYPASS_AUTH || _PERSONA_AUTH ? passthrough : clerkMiddleware()`, which only
**populates** `getAuth(c)`: it never rejects. Rejection is the job of a
per-route guard, so a route with no guard is reachable by any authenticated
caller. Mount order matters: the OAuth discovery well-knowns and the
`/access-tokens` SPA page are registered before the global middleware
(anonymous-reachable: Hono runs handlers registered ahead of an `app.use` before
it), and the global mount skips `/mcp`, which authenticates inside its adapter.

**The cookie mount takes session tokens ONLY.** `@hono/clerk-auth` v3's
`clerkMiddleware` calls `authenticateRequest` with `acceptsToken: "any"`, so a
machine token (API key, M2M, or an OAuth access token) presented as a Bearer
header to an ordinary cookie-mount route produces an _authenticated_ machine
auth object, one carrying a `userId` but no `sessionClaims`.
`getClerkSessionAuth()` is the single accessor for this and guards on
`tokenType === "session_token"`. Never read `c.var.clerkAuth` directly: in v3 it
is the auth **function** `getAuth()` invokes, not the auth object.

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
  `users.getUser(userId)` for the **primary email**: the OAuth auth object
  carries `userId`/`clientId`/`scopes` but no email. Matching on primary email
  is what makes an OAuth caller and a browser login resolve to the same FASTR
  user.

Contract: `null` = "judged, and bad" → 401; a **throw** = "could not judge" →
503. This distinction is load-bearing and is the reason the OAuth branch is not
a straight `isAuthenticated` check: Clerk **never throws**, folding an unknown
token, a wrong secret key, an HTTP 500 and a DNS failure into one non-throwing
signed-out state distinguished only by a `reason` string. Mapping all of those
to `null` would answer 401 during a Clerk outage, and a 401 tells every
connected client its grant is invalid, dragging every user back through consent
for a transient fault. So the mapping is allow-listed toward throwing: only
`token-invalid` and `token-type-mismatch` resolve to `null`. Pinned by
`server/tests/headless_oauth_auth_test.ts`.

**Two judgment points, both calling that one resolver**: this is the whole point
of the seam. Verifying only at the `/mcp` door is not enough: every MCP tool
call dispatches server actions in-process through `headlessApp`, which runs
`headlessAuthMiddleware` per dispatch. A door-only check would let a connector
initialize and list tools, then fail on every real tool call.

1. `server/mcp/mcp_endpoint.ts`: the `/mcp` adapter's `authenticate` hook.
2. `server/middleware/auth.ts`: `headlessAuthMiddleware`, which sets
   `c.var.headlessAuthEmail`.

In `getGlobalUser`, `headlessAuthEmail` short-circuits the Clerk branch and
feeds the same DB-backed `GlobalUser` construction, so a headless request has
exactly the user's own permissions: every guard downstream is unchanged.

**Revocation is asymmetric, permanently.** A PAT is re-verified against the DB
on every dispatch, so revocation is effectively immediate. A verified OAuth
token is cached by token for ~30 s (`OAUTH_EMAIL_TTL_MS`, aligned with the
`/mcp` context cache's `CONTEXT_TTL_MS`), so a revoked grant keeps working for
up to that long. That cache is **load-bearing, not an optimization**: Clerk's
OAuth auth object has no email, so each resolve costs a `users.getUser` call
(plus a verify call for an opaque token), and every tool call dispatches several
actions. Without it one tool call would burn a handful of rate-limited Clerk
calls. Only successes are cached: a bad token can never occupy a slot.

> **Caveat, unverified.** The ~30 s window assumes Clerk issues **opaque**
> (`oat_`) access tokens, which are verified through the Backend API and
> therefore see revocation. If the OAuth application issues **JWT** access
> tokens instead, `@clerk/backend` verifies them **locally against JWKS with no
> Backend API call**, so revocation is not observed at all until the token
> expires (~1 h). Our cache TTL is irrelevant in that case. Which format a
> dynamically-registered client receives has not been confirmed against a real
> grant; confirm during live verification and, if it is JWT, either accept the
> longer window or configure the application for opaque tokens.

**The allowlist is the registry's.** `headlessRouteAllowlist` admits the entries
declaring `headless: true` (`getCurrentUser`, `getRunPresentationObjectItems`,
`getRunResultsValueInfo`) and the raw `/info/*.md` pattern it keeps itself;
every other path answers 403 before any guard, and `validateHeadlessMounts`
reads the same flag.

**Naming.** Everything that judges both credential types is named `headless`:
`headlessAuthMiddleware`, `headlessAuthEmail`,
`headless_app.ts`/`headlessApp`/`headlessAppFetch`, and
`headless_allowlist.ts`/`headlessRouteAllowlist`. `PAT_PREFIX`,
`resolvePersonalAccessTokenEmail` and mint/revoke keep PAT names: they are
genuinely PAT-specific.

### OAuth discovery (`server/routes/public/oauth_metadata.ts`)

FASTR is only the **resource server**; Clerk is the authorization server and
owns `/authorize`, `/token` and `/oauth/register`. Three unauthenticated routes,
registered before the global middleware because they are what a client reads
_before_ it has any credential:

- `/.well-known/oauth-protected-resource/mcp` (RFC 9728), and the bare
  `/.well-known/oauth-protected-resource` too, since clients differ on which
  they probe.
- `/.well-known/oauth-authorization-server` (RFC 8414): Clerk's own document,
  proxied verbatim and cached 10 min, for clients predating RFC 9728. `issuer`
  therefore names Clerk while the document is served from the instance origin;
  that mismatch is deliberate, since rewriting `issuer` would break the
  exchange.

The authorization server URL is derived from `CLERK_PUBLISHABLE_KEY`
(`pk_(test|live)_<base64(host + "$")>`) rather than a separate env var that
could drift. The instance origin is derived **per request** (`Host` +
`X-Forwarded-Proto`, since TLS terminates at the proxy and Deno sees plain
http). `CLIENT_ORIGIN` cannot stand in for it: it is a CORS allowlist and on
testing2 is still the localhost default. The `/mcp` 401 emits
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

**Transport registration doctrine**. The prohibition that matters stands
verbatim: **no server code ever calls `setServerActionTransport`.** A
process-global registration would make the app server issue authenticated calls
under whichever identity was registered last, a confused-deputy shape with no
per-request isolation. The sanctioned shape is the opposite: an **explicit
per-context transport**, passed as an argument and never registered anywhere.
`createAllServerActions(transport?)` takes one, and
`ServerActionTransport.fetchImpl?` lets it dispatch **in-process** rather than
over the network. The `/mcp` endpoint builds one per (token, pinned package)
context carrying that caller's own token, with `fetchImpl:
headlessAppFetch`, so
every action runs the real headless middleware chain (credential verify, a PAT
also stamping `last_used_at`; the deny-by-default allowlist; zod validation; the
approval and scope-grant checks on the run-keyed package reads; no `user_logs`
row) with no loopback HTTP and no shared state. Per-request isolation is exactly
what the explicit form provides; SPA callers take both defaults
(`createAllServerActions()`, global fetch). Pinned by
`server/tests/pat_identity_parity_test.ts`, which drives the same route through
the raw PAT app, an explicit transport, and a defaulted caller and asserts all
three agree. The headless app's mount list and the registry's `headless` flags
are two lists; `validateHeadlessMounts()` (`headless_app.ts`) runs at every DEV
boot (`main.ts`, gated on `_IS_DEV`) beside `validateAllRoutesDefined()`: a
structural check of Hono's route table (every flagged entry's `method + path`
must be registered on `headlessApp`) that fail-stops on a miss (they drifted
once: flagged run-keyed reads whose route file was never mounted 404'd silently
through `/mcp`); production boots skip it. The server test suite is not run at
boot: `deno task test` is part of the verification floor
(PROTOCOL_APP_PLANS.md), and `deno task typecheck` checks `server/tests/*.ts`
too, so the suite is typed at the deploy gate. Note there is NO
compiler-enforced browser-free boundary in `lib/` either: the server typecheck
carries the TypeScript `dom` lib (`deno.json` → `"lib": [... "dom" ...]`), so a
`document`/`window` reference in a `lib/` file passes `deno check main.ts`
clean: the boundary holds by convention plus runtime guards
(`typeof document === "undefined"` branches, no browser globals at module
scope). Mechanical enforcement, if ever wanted, means a separate dom-less
`deno check` of `lib/` or a lint rule.

### After the credential: S18

Everything a request meets once `authMiddleware` or `headlessAuthMiddleware` has
run, from `getGlobalUser` through the guard factories, the matrix test, the flag
set and the special modes, is
[SYSTEM_18_permissions.md](SYSTEM_18_permissions.md). `static.ts` stays here:
its three tiers install S18's guards, and S18 reads them.

## Traps

- **`onError` responds 200**: never rely on HTTP status to detect a
  registry-route failure; check `success`.
- **Don't add raw routes** outside the inventory above to "save a registry
  entry": you silently lose client codegen, boot validation, and the guard audit
  trail.

## Open items

- **Decoupling: protect the registry seam.** Zero client↔server import edges is
  the codebase's cleanest property; the off-registry inventory (including the
  mixed `structure.ts` and `population.ts` CSV pairs) is the erosion surface.
  Keep it deliberate and small.
