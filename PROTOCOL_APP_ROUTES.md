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
(`instance/` or `project/`; new feature file → spread it into `combined.ts`).

```ts
createReport: route({
  path: "/reports",
  method: "POST",
  body: z.object({ label: z.string(), ...folderBodyFields }),
  response: {} as { reportId: string; lastUpdated: string },
  requiresProject: true,
}),
```

- `params` / `body` are **real Zod schemas** (`z.object({…})`, coercion via
  `z.coerce.*` for numeric params) — validated centrally by `defineRoute`, 400
  envelope on mismatch. Phantom `{} as T` is not accepted for these.
- `response` is a compile-time phantom (`{} as T`); omit it for a no-data route.
  For a sometimes-absent payload use `X | null`, never `X | undefined`
  (optional-parameter inference silently strips the `undefined`).
- Set `requiresProject: true` on every project route — that is what makes the
  client emit the `Project-Id` header the project guard reads.
- Don't add `z.unknown()` body fields to dodge writing a schema; the only
  sanctioned uses are the sentinel-encoded passthroughs
  (PROTOCOL_APP_MIGRATIONS.md).

### 2. Implement with `defineRoute`

In the matching `server/routes/*` file (pairing is by registry key, not
filename):

```ts
defineRoute(
  routesReports,
  "createReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await createReport(
      c.var.ppk.projectDb,
      body.label,
      body.folderId,
    );
    if (!res.success) return c.json(res);
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.reportId],
      res.data.lastUpdated,
    );
    const list = await getAllReports(c.var.ppk.projectDb);
    if (list.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, list.data);
    }
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
`server/routes/project/reports.ts` is the canonical example file; the notify
recipe (row-level `last_updated` + whole-list broadcast) is S3's mutation
recipe.

### 3. Pick the guard

Every `defineRoute` gets one — a route with no guard is public-by-accident
(Clerk populates, it never rejects).

- Instance route → `requireGlobalPermission(...UserPermission)`.
- Project route → `requireProjectPermission(...ProjectPermission)`, and scope
  ALL DB work to `c.var.ppk.projectDb` / `c.var.ppk.projectId` — never a project
  id from the body/params (confused-deputy/IDOR).
- Permission keys come from `lib/types/permissions.ts` only. Adding a key? Add
  it there (type + array + `build*FromRow`), plus the DB column migration.
- Admin-only → `{ requireAdmin: true }`. Editing routes that must respect locked
  projects → `{ preventAccessToLockedProjects: true }` (opt-in, not global).
- Zero permission keys = "any authenticated (project) member" — real but weak;
  be deliberate.
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
- The client action now exists: `args` = path params + `projectId` (if
  required) + body keys.

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
enumerated inventory in SYSTEM_01 (SSE, Anthropic passthrough, TUS, public
dashboard, health, export_central, the two CSV exports). A new endpoint that
"can't fit the registry" is a design smell — bring it to the inventory
discussion, don't just add it.
