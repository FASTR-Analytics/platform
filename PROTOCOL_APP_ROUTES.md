# PROTOCOL — App: Adding an API Route

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **adding or changing an
> endpoint**. The registry/guard machinery's ownership and architecture belong
> to **S1** — see `SYSTEM_01_api_contract.md`; this file is the how-to. The
> generic base rules (envelope shape, validate-at-boundary, permission checks
> before business logic) are panther's `protocols/PROTOCOL_DENO_API.md` — in
> this app those rules are satisfied by `defineRoute` + the guard factories, so
> never hand-roll that protocol's inline header/parse/permission examples in a
> handler.

---

## The recipe

### 1. Declare the route in the registry

Add a `route({...})` entry to the right `lib/api-routes/*` feature registry
(`instance/` or `products/`; new feature file → spread it into `combined.ts`).

```ts
updateReportConfig: route({
  path: "/reports/:report_id/config",
  method: "PUT",
  params: reportIdParamsSchema,          // z.object({ report_id: z.string() })
  body: z.object({ config: reportConfigSchema }),
  response: {} as { lastUpdated: string },
}),
```

- `params` / `body` are **real Zod schemas** (`z.object({…})`, coercion via
  `z.coerce.*` for numeric params) — validated centrally by `defineRoute`, 400
  envelope on mismatch. Phantom `{} as T` is not accepted for these.
- `response` is a compile-time phantom (`{} as T`); omit it for a no-data route.
  For a sometimes-absent payload use `X | null`, never `X | undefined`
  (optional-parameter inference silently strips the `undefined`).
- **Everything the route acts on is in the URL.** There is no scoping header;
  the id in the path is the whole addressing story. A body key that is also a
  path placeholder fails boot (the client strips it from the body).
- Don't add `z.unknown()` body fields to dodge writing a schema; the only
  sanctioned uses are the sentinel-encoded passthroughs
  (PROTOCOL_APP_MIGRATIONS.md).

### 2. Implement with `defineRoute`

In the matching `server/routes/*` file (pairing is by registry key, not
filename):

```ts
defineRoute(
  routesReports,
  "updateReportConfig",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.mainDb,
      params.report_id,
      body.config,
    );
    if (!res.success) return c.json(res);
    await notifyProductsUpserted(c.var.mainDb, [params.report_id]);
    return c.json(res);
  },
);
```

The thin-handler shape is invariant: **call one DB fn returning an `APIResponse`
→ `if (!res.success) return c.json(res)` → `notify*()` on success →
`c.json(res)`.** No query construction or multi-step business logic in the route
(that's the DB layer, S2); never hand-build `{ success: true, data }` when the
DB function already returns an envelope; never cast the return to `any` — a type
error at the `defineRoute` call means the registry and implementation disagree.
`server/routes/products/reports.ts` is the canonical example file; the notify
recipe is S3's mutation recipe — for a product write it is
`notifyProductsUpserted(mainDb, [id])`, plus
`notifyLastUpdated("slides", [slideId], ts)` when a slide row moved.

### 3. Pick the guard

Every `defineRoute` gets one — a route with no guard is public-by-accident
(Clerk populates, it never rejects). **There are two, and the choice is between
them, not among many:**

- **Product surface** → `requireApprovedUser()`, which takes no arguments.
  Product/folder CRUD, the run-keyed figure-data reads, the authoring context,
  the package picker's options, the Explore tab's reads, the copilot mounts.
  Act on the id the path names, from `c.var.mainDb`.
- **Everything else** → `requireGlobalPermission(...UserPermission)` — users,
  logs, settings, and the data / results-package plane. Admin-only →
  `{ requireAdmin: true }`.
- Permission keys come from `lib/types/permissions.ts` only. Adding a key? Add
  it there (type + array + `buildUserPermissionsFromRow`), plus the DB column
  migration.
- Zero permission keys (`requireGlobalPermission()`) = "any authenticated
  caller, approved or not" — real but weak; if you meant "approved", say
  `requireApprovedUser()`.
- **Never add a per-handler access check behind the guard.** With a permissive
  product tier there is nothing finer to check, and a scattered check is what a
  future product-aware guard would have to unpick (S1 doctrine).
- Prefer a granular permission or `requireAdmin` over any new
  `H_USERS.includes()` check.

### 4. Wire and verify

- New route file → mount the router in `main.ts` (most at `/`), **after**
  `app.use("*", authMiddleware)`.
- Add `log("<key>")` middleware if the route should be audited (mutating routes
  generally should be).
- Boot the server: `validateAllRoutesDefined()` exits(1) on a
  missing/extra/duplicate route — confirm
  `✅ All N routes correctly implemented`.
- The client action now exists: `args` = path params + body keys.

## Streaming variant

For long-running request/response work (NOT push — that's SSE, S3): set
`isStreaming: true` in the registry and return
`streamResponse(c, async (writer) => { … })` from `server/routes/streaming.ts`.
Report with `writer.progress(0..1, msg)`; terminate with
`writer.complete({ result })` or `writer.error(msg)` — never write raw chunks.
Uncaught throws become `writer.error`. Client-side the generated action takes
`onProgress` and returns the terminal `APIResponse`; streaming calls have no
timeout.

## Off-registry escape hatch

There is none. Raw `.get`/`.post` on a `Hono()` is allowed only for the
enumerated inventory in SYSTEM_01 (SSE, the collab WebSocket, Anthropic
passthrough, TUS, health, OAuth discovery, `/mcp`, the two CSV exports). A new
endpoint that
"can't fit the registry" is a design smell — bring it to the inventory
discussion, don't just add it.
