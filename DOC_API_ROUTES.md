# API Routes

How the HTTP layer works: a single route registry, declared once in `lib/api-routes/`, that the server implements and the client auto-consumes. Covers the registry-as-contract pattern, the `APIResponse` envelope, the thin-handler shape, the request-scoped streaming sub-protocol, and the enumerated exceptions that bypass all of it.

> This doc owns the HTTP request/response boundary. It does **not** cover server-side push — see [DOC_SSE_REALTIME.md](DOC_SSE_REALTIME.md) for the SSE/BroadcastChannel system (the streaming here is request-scoped NDJSON, a different thing). It does not cover authn/authz — see [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md) for the guard factories this doc only references. It does not cover the DB functions handlers call — see [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md).

---

## Principles

1. **One registry is the contract.** Every data endpoint is declared once in `lib/api-routes/`. The server types its handler off that declaration; the client generates a typed server-action from it. There is no second source of truth.
2. **Handlers are thin.** A handler extracts params/body, calls one DB function that returns an `APIResponse`, fires notify side-effects on success, and returns `c.json(res)`. Business logic lives in the DB layer, not the route.
3. **Everything is an `APIResponse` envelope.** `{ success: true, data }` or `{ success: false, err }`. The client unwraps exactly this shape. Routes never invent other shapes.
4. **Raw routes are the explicit exception, not the default.** A small enumerated set of endpoints (SSE, AI proxy, upload, public, share, health) bypass the registry. New endpoints must not.

---

## The System

```text
            lib/api-routes/                         server/routes/
  ┌──────────────────────────────┐      ┌────────────────────────────────────┐
  │ feature registries:          │      │ defineRoute(router, "createReport",  │
  │   reportRouteRegistry = {    │      │   requireProjectPermission(...),     │
  │     createReport: route({…}) │      │   async (c, { params, body }) => {   │
  │   }                          │      │     const res = await createReport(…)│
  │            │                 │      │     if (!res.success) return c.json… │
  │            ▼ spread          │      │     notify…(); return c.json(res)    │
  │   combined.ts → routeRegistry│◄─────┤   })   // types params/body off key │
  └──────────────┬───────────────┘      └────────────────────────────────────┘
                 │ same object imported by both sides
                 ▼
  client/src/server_actions/create_server_action.ts
    for each key → an async fn:
      :params → URL, requiresProject → Project-Id header,
      remaining args → JSON body, isStreaming → consumeStream
```

The registry object (`routeRegistry`, assembled in `lib/api-routes/combined.ts` from ~28 feature registries) is imported by **both** `server/routes/route-helpers.ts` (`defineRoute`) and `client/src/server_actions/create_server_action.ts`. Add an entry → the client gets a typed action and the server gets a typed handler signature for free.

### Defining a route (the `route()` helper)

`lib/api-routes/route-utils.ts` exports `route()`. Each feature file exports a `*RouteRegistry` object of `route({...})` calls. Canonical example — `lib/api-routes/project/reports.ts`:

```ts
export const reportRouteRegistry = {
  createReport: route({
    path: "/reports",
    method: "POST",
    body: {} as { label: string; folderId?: string | null },
    response: {} as { reportId: string; lastUpdated: string },
    requiresProject: true,
  }),
  getReportDetail: route({
    path: "/reports/:report_id",
    method: "GET",
    params: {} as { report_id: string },
    response: {} as ReportDetail,
    requiresProject: true,
  }),
};
```

| Field | Purpose | Runtime vs type |
|-------|---------|-----------------|
| `path` | URL path, `:name` for params | Real value at runtime |
| `method` | `GET`/`POST`/`PUT`/`DELETE`/`PATCH` | Real value at runtime |
| `params` | shape of URL params | **Type-only phantom** (`{} as T`) |
| `body` | shape of request body | **Type-only phantom** (`{} as T`) |
| `response` | success `data` shape; omit for no-data | type-only (drives `InferredResponse`) |
| `requiresProject` | needs a project context | Real boolean at runtime |
| `isStreaming` | uses the NDJSON stream protocol | Real boolean at runtime |

**Critical:** `params`/`body`/`response` are erased at runtime (`{} as T` is `{}`). The registry gives **compile-time** types only — there is **no runtime validation of the request body at the route boundary** (see [What NOT to do](#what-not-to-do) and [Gotchas](#gotchas)). `InferredResponse` resolves to `APIResponseWithData<TResponse>` when `response` is set, else `APIResponseNoData`.

The registry filenames in `lib/api-routes/` are kebab-case (e.g. `project/presentation-objects.ts`); the server implementation files in `server/routes/` are snake_case (`project/presentation_objects.ts`). They are paired by the registry key, not the filename.

### Implementing a route (server, `defineRoute`)

`server/routes/route-helpers.ts`:

```ts
defineRoute(
  routesReports,                                 // the Hono router
  "createReport",                                // a routeRegistry key
  requireProjectPermission({ preventAccessToLockedProjects: true }, "can_configure_reports"),
  async (c, { params, body }) => {               // params/body typed off the key
    const res = await createReport(c.var.ppk.projectDb, body.label, body.folderId);
    if (!res.success) return c.json(res);
    notifyLastUpdated(c.var.ppk.projectId, "reports", [res.data.reportId], res.data.lastUpdated);
    const list = await getAllReports(c.var.ppk.projectDb);
    if (list.success) notifyProjectReportsUpdated(c.var.ppk.projectId, list.data);
    return c.json(res);
  },
);
```

`defineRoute(router, routeName, ...middlewares, handler)`:
1. Looks up `routeRegistry[routeName]` for `path` + `method`.
2. Parses `:param` segments out of `path` into `params`.
3. For `POST`/`PUT`/`PATCH`/`DELETE`, reads the body as `c.var.cachedBody ?? await c.req.json()` — `cachedBody` is set by the `log()` middleware (see below), avoiding a double-read of the request stream.
4. Calls `handler(c, { params, body })`.
5. Registers it on the Hono router with the lowercased method and calls `markRouteDefined(routeName)`.

The thin-handler shape is invariant: **call DB fn → `if (!res.success) return c.json(res)` → `notify*()` on success → `c.json(res)`.** Routes do not build the envelope when the DB function already returns one. See `server/routes/project/reports.ts` for the canonical, fully-consistent example. Side-effects (`notifyLastUpdated`, `notifyProject*Updated`) push state to clients over SSE — see [DOC_SSE_REALTIME.md](DOC_SSE_REALTIME.md).

### Consuming a route (client, generated)

`client/src/server_actions/create_server_action.ts` iterates `routeRegistry` and builds one async function per key. `buildRequestParams`:
- substitutes `:param` segments from `args`;
- if `requiresProject`, **requires `args.projectId`** (throws otherwise) and emits it as the `Project-Id` header — this is the glue that `requireProjectPermission` reads server-side;
- every remaining arg key (not a path param, not `projectId`) becomes the JSON body.

Non-streaming calls go through `tryCatchServer` (returns the parsed `APIResponse`). Streaming calls (`isStreaming: true`) go through `consumeStream`.

### The `APIResponse` envelope

`lib/types/instance.ts` is the source of truth:

```ts
export type APIResponseWithData<T> =
  | { success: true; data: T }
  | { success: false; err: string };

export type APIResponseNoData =
  | { success: true }
  | { success: false; err: string };
```

Plus assertion helpers `throwIfErrWithData` / `throwIfErrNoData`. The DB layer produces these (see [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md)); routes pass them through; the client unwraps them.

### Streaming sub-protocol (request-scoped NDJSON)

For long-running request/response work (not push), set `isStreaming: true` and use `streamResponse` from `server/routes/streaming.ts`. **This is distinct from SSE** — it is a single HTTP response streamed as newline-delimited JSON, one request, one stream, then done.

```ts
return streamResponse(c, async (writer) => {
  await writer.progress(0.5, "Halfway");
  await writer.complete({ result });          // or writer.error("...")
});
```

Wire format (`StreamWriter`), one JSON object per line:

| Line | Shape | Meaning |
|------|-------|---------|
| progress | `{ progress: 0..1, message }` | clamp to [0,1]; drives `onProgress` |
| complete | `{ progress: 1, message: "Complete", result: { success: true, data? } }` | terminal success |
| error | `{ progress: -1, message, result: { success: false, err } }` | terminal failure |

`streamResponse` wraps the handler in a try/catch: an uncaught throw is converted to `writer.error(...)`, so the stream always terminates cleanly. The client `consumeStream` mirrors this exactly: `progress === 1` or `=== -1` returns `message.result` (the `APIResponse`); anything else fires `onProgress`. Used today by `project.ts` and `instance/structure.ts`.

### The `log()` middleware (and why `defineRoute` depends on it)

`server/middleware/logging.ts` exports `log(routeName)`. Applied per-route (e.g. `log("createProject")` in `server/routes/project/project.ts`), it:
- reads the JSON body once and stashes it as `c.set("cachedBody", body)` — **`defineRoute` reads `cachedBody` to avoid re-reading the consumed request stream**;
- after the handler, writes a `user_logs` row via `AddLog` (sensitive `authorization`/`cookie` headers stripped), skipping users with `approved === false`;
- swallows its own errors so logging never breaks a response, then re-throws any handler error.

`log()` is **not** applied to every route today — audit coverage is therefore uneven (see enforcement).

### Startup validation

`server/routes/route-tracker.ts` exports `validateAllRoutesDefined()`, called at the end of `main.ts`. It diffs `routeRegistry` keys against the set marked by `markRouteDefined`:
- **missing** (in registry, not implemented) → `console.error`
- **extra** (implemented, not in registry) → `console.error`

It only **warns** — it does not throw or exit. A registry key with no handler ships as a broken client action that 404s at runtime.

---

## Raw-route exceptions

These files create a `Hono()` and register handlers directly (`.get`/`.post`) **without** `defineRoute` — so they are not in `routeRegistry`, get no generated client action, no registry typing, and are invisible to `validateAllRoutesDefined`:

| File | Why it's raw |
|------|--------------|
| `routes/instance/instance-sse.ts`, `routes/project/project-sse-v2.ts` | Server-sent events (long-lived stream, not request/response) |
| `routes/project/ai_proxy.ts`, `routes/project/ai_files.ts` | Anthropic passthrough — deliberately returns Anthropic-shaped bodies, not `APIResponse` (see [DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md](DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md)) |
| `routes/instance/upload.ts` | Hand-rolled TUS resumable-upload protocol (custom headers/handshake) |
| `routes/instance/share.ts`, `routes/public/share.ts`, `routes/public/dashboard.ts` | Public/anonymous + token routes mounted before `authMiddleware`; some return bespoke shapes (`{ token, slug }`) |
| `routes/instance/health.ts` | Diagnostics; bare JSON objects |

This is the **complete** allowed list. Anything not here must use the registry + `defineRoute`.

---

## Rules

1. **New data endpoints go in the registry.** Add a `route({...})` to the relevant `lib/api-routes/*` registry and implement with `defineRoute`. Raw `.get`/`.post` is allowed only for the enumerated exceptions above.
2. **Return an `APIResponse`.** `c.json(res)` where `res` is `{ success, data | err }`. Never emit a different top-level shape from a registry route.
3. **Don't hand-build `{ success: true, data }`** when the DB function already returns an envelope — pass it through.
4. **Thin handlers.** Extract params/body, call one DB fn, notify on success, return. No query construction or multi-step business logic in the route.
5. **Project routes require the `Project-Id` header** via `requiresProject: true` — never read a project id from the body/params for authorization (see [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md)).
6. **Streaming = `streamResponse` + `StreamWriter`**, terminate with `complete()` or `error()`. Don't write raw chunks.

---

## What NOT to do

- **Don't trust the request body's type.** The registry `body` is a compile-time phantom; the wire payload is unvalidated at the boundary. If the payload feeds a stored schema, validation happens in the DB layer ([DOC_MIGRATIONS.md](DOC_MIGRATIONS.md)); if it feeds an AI tool, see [DOC_AI_TOOL_SCHEMAS.md](DOC_AI_TOOL_SCHEMAS.md). Per-request HTTP body validation is the current open gap — do not assume `body` is well-formed.
- **Don't add raw routes** outside the exception list to "save a registry entry" — you silently break the client codegen and the startup check.
- **Don't return error strings or throw bare** from a handler expecting the client to parse it — return `{ success: false, err }`. (The global `app.onError` does return an envelope, but at HTTP **200**, which is a known wart, not a pattern to rely on.)
- **Don't skip `log()`** on mutating routes if you want them audited — but know that `defineRoute`'s body-read also depends on `cachedBody` it sets.

---

## Gotchas

- **`validateAllRoutesDefined` only warns.** A typo'd or unimplemented registry key won't fail boot — it surfaces as a 404 when the client calls the generated action.
- **`onError` responds 200.** `main.ts`'s `app.onError` returns `{ success: false, err }` with the default 200 status. Clients detect failure by `success: false`, not HTTP status.
- **`cachedBody` coupling.** A route using `defineRoute` without the `log()` middleware still works (it falls back to `await c.req.json()`), but mixing a manual `c.req.json()` *before* `defineRoute` reads the body will throw "body already consumed".
- **Mount order matters for auth.** Public routes are mounted before `app.use("*", authMiddleware)`; everything after is behind Clerk. See [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md).

---

## Enforcement opportunities

These are patterns the codebase mostly follows but does not enforce; documenting them is the first step to enforcing them.

- **Make `validateAllRoutesDefined` fail** (throw / non-zero exit, or a CI check) instead of warning, so a missing handler cannot ship.
- **Classify every registered route** as guarded or explicitly-public at startup (overlaps [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md)) so an unguarded route fails loudly.
- **Envelope lint:** the raw routes drift in response shape (`health.ts` bare objects, `share.ts` `{ token, slug }`, `ai_proxy` Anthropic errors). Each is defensible, but the divergence should be a documented exception, not incidental.
- **Per-request body validation** is unaddressed. Decide whether to wire a Zod schema into the registry/`defineRoute` boundary, or document that body trust is delegated to the DB layer.

---

## Adding a new endpoint — checklist

- [ ] Add a `route({...})` entry to the right `lib/api-routes/*` registry (set `requiresProject`/`isStreaming` as needed)
- [ ] Implement with `defineRoute(router, "<key>", <guard>, handler)` in the matching `server/routes/*` file
- [ ] Attach a permission guard (`requireGlobalPermission` / `requireProjectPermission`) — see [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md)
- [ ] Handler stays thin: call a DB fn returning `APIResponse`, `notify*()` on success, `c.json(res)`
- [ ] Mount the router in `main.ts` (most at `/`) if it's a new file
- [ ] Add `log("<key>")` if the route should be audited
- [ ] Confirm boot prints `✅ All N routes correctly implemented`

---

## Key files

| File | Purpose |
|------|---------|
| `lib/api-routes/route-utils.ts` | `route()` helper; `InferredResponse` |
| `lib/api-routes/combined.ts` | merges feature registries into `routeRegistry` |
| `lib/api-routes/**/*.ts` | per-feature route declarations (the contract) |
| `server/routes/route-helpers.ts` | `defineRoute` (server consumption) |
| `server/routes/route-tracker.ts` | `markRouteDefined`, `validateAllRoutesDefined` |
| `server/routes/streaming.ts` | `StreamWriter`, `streamResponse` (NDJSON) |
| `server/middleware/logging.ts` | `log()` — `cachedBody` + `user_logs` audit |
| `client/src/server_actions/create_server_action.ts` | generates one server-action per registry key |
| `lib/types/instance.ts` | `APIResponseWithData` / `APIResponseNoData` |
| `main.ts` | router mounting, `authMiddleware`, `onError`, startup validation |
| `server/routes/project/reports.ts` | canonical thin-handler implementation |
