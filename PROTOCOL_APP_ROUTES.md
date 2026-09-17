# PROTOCOL (App): Adding an API Route

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_. Read it when **adding or changing an
> endpoint**. The registry/guard machinery's ownership and architecture belong
> to **S1**: see `SYSTEM_01_api_contract.md`; this file is the how-to. The
> generic base rules (envelope shape, validate-at-boundary, permission checks
> before business logic) are panther's `protocols/PROTOCOL_DENO_API.md`. In
> this app those rules are satisfied by `defineRoute` + the guard factories, so
> never hand-roll that protocol's inline header/parse/permission examples in a
> handler.

---

## The recipe

### 1. Declare the route in the registry

Add a `route({...})` entry to the right `lib/api-routes/*` feature registry
(`instance/` or `products/`; new feature file → spread it into `combined.ts`
and add it to `routeRegistryIndividualCount`).

```ts
createFolder: route({
  path: "/folders",
  method: "POST",
  body: z.object({
    label: z.string(),
    color: z.string().nullable(),
    parentId: z.uuid().nullable(),
  }),
  response: {} as { folderId: string; lastUpdated: string },
  access: "edit",
}),
```

- `params` / `body` are **real Zod schemas** (`z.object({…})`, coercion via
  `z.coerce.*` for numeric params), validated centrally by `defineRoute`, 400
  envelope on mismatch. Phantom `{} as T` is not accepted for these.
- `response` is a compile-time phantom (`{} as T`); omit it for a no-data route.
  For a sometimes-absent payload use `X | null`, never `X | undefined`
  (optional-parameter inference silently strips the `undefined`).
- Set `access: "view" | "edit" | "own"` on every product and folder route
  (`lib/api-routes/products/*`; the file's closing `satisfies` refuses an
  entry without it). Every product-scoped path lives under
  `/products/:product_id/...`, the param is always `product_id`, child ids
  (`slide_id`, `version_id`) follow it, folder paths use `folder_id`, and
  body targets are `productIds` and `targetProductId` (products), `folderId`
  and `parentId` (folders). The guard reads its targets from exactly those
  fields.
- Don't add `z.unknown()` body fields to dodge writing a schema; the only
  sanctioned uses are external-spec blobs (GeoJSON `geo.data` in
  `lib/types/_figure_bundle.ts`, the per-item `style` record in
  `lib/types/_slide_config.ts`).

### 2. Implement with `defineRoute`

In the matching `server/routes/*` file (pairing is by registry key, not
filename):

```ts
defineRoute(
  routesFolders,
  "createFolder",
  log("createFolder"),
  async (c, { body }) => {
    const res = await createFolder(c.var.mainDb, {
      ...body,
      createdBy: c.var.globalUser.email,
    });
    if (!res.success) {
      return respond(c, res);
    }
    await notifyFolders(c.var.mainDb);
    return respond(c, res);
  },
);
```

The thin-handler shape is invariant: **call one DB fn returning an `APIResponse`
→ `if (!res.success) return c.json(res)` → `notify*()` on success →
`c.json(res)`.** No query construction or multi-step business logic in the route
(that's the DB layer, S2); never hand-build `{ success: true, data }` when the
DB function already returns an envelope; never cast the return to `any`. A type
error at the `defineRoute` call means the registry and implementation disagree.
Product-plane handlers answer through `respond`
(`server/routes/products/_respond.ts`), which turns a not-found envelope into a
404; instance handlers use `c.json`.
`server/routes/products/reports.ts` is the canonical example file; the notify
recipe (row-level `last_updated`, per-row product summaries, whole-list
folders) is S3's mutation recipe.

### 3. Pick the guard

Every `defineRoute` gets one. A route with no guard is public-by-accident
(Clerk populates, it never rejects).

- Instance route → `requireGlobalPermission(...UserPermission)`.
- Approved-user surface (run-keyed package reads, the authoring context, the
  ready-package list) → `requireApprovedUser()`.
- Product or folder route → nothing: the registry entry's `access` field is
  the guard. `defineRoute` installs `requireProductAccess` from it, so the
  handler names only `log(...)` and the handler. Never add a permission check
  inside the handler; the policy lives in `server/auth/product_access.ts`. A
  handler that receives a `slide_id` or `version_id` still scopes its query
  by `product_id` as well, so an id from another product is a 404.
- Permission keys come from `lib/types/permissions.ts` only. Adding a key? Add
  it there (type + array + `buildUserPermissionsFromRow`), plus the DB column
  migration.
- Admin-only → `requireGlobalPermission({ requireAdmin: true })`.
- Zero permission keys = "any authenticated caller", without the `approved`
  check: real but weak; be deliberate.
- Prefer a granular permission or `requireAdmin` over any new
  `H_USERS.includes()` check.

### 4. Wire and verify

- New route file → mount the router in `main.ts` (most at `/`), **after**
  the global `authMiddleware` mount (the `app.use("*", ...)` that skips
  `/mcp`).
- Add `log("<key>")` middleware if the route should be audited (mutating routes
  generally should be).
- Boot the server: `validateAllRoutesDefined()` exits(1) on a
  missing/extra/duplicate route. Confirm
  `✅ All N routes correctly implemented`.
- The client action now exists: `args` = path params + body keys.

## Streaming variant

For long-running request/response work (NOT push, that's SSE, S3): set
`isStreaming: true` in the registry and return
`streamResponse(c, async (writer) => { … })` from `server/routes/streaming.ts`.
Report with `writer.progress(0..1, msg)`; terminate with
`writer.complete(data)` (`writer.complete()` for a no-data route) or
`writer.error(msg)`. Never write raw chunks.
Uncaught throws become `writer.error`. Client-side the generated action takes
`onProgress` and returns the terminal `APIResponse`; streaming calls have no
timeout.

## Off-registry escape hatch

There is none. Raw `.get`/`.post` on a `Hono()` is allowed only for the
enumerated inventory in SYSTEM_01 (SSE, the collab WebSocket, Anthropic
passthrough, TUS, health, the CSV exports, OAuth discovery, `/mcp`). A new
endpoint that "can't fit the registry" is a design smell. Bring it to the
inventory discussion, don't just add it.
