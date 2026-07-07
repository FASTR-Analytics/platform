# Access Control

Server-side authentication and authorization end to end: Clerk session population, the two permission-guard factories, the `Project-Id`-header scoping pipeline, the permission-key source of truth, and the special-mode precedence (`_BYPASS_AUTH` / `_OPEN_ACCESS` / `is_admin` / `H_USERS`).

> This doc owns authn/authz. It assumes the registry/`defineRoute` mechanics from [DOC_API_ROUTES.md](DOC_API_ROUTES.md) (guards are the middleware passed to `defineRoute`). The DB-outage→503 mapping ties into the error funnel in [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md). The client state docs ([DOC_STATE_MGT_*](DOC_STATE_RULES.md)) are about the *client*; this is the server gate.

---

## Principles

1. **Authenticate broadly, authorize per-route.** Clerk runs as global middleware and only **populates** the session — it does not reject. Rejection is the job of a per-route guard.
2. **Two guard factories, mirrored.** `requireGlobalPermission(...)` for instance routes, `requireProjectPermission(...)` for project routes. Same shape, same status codes, same `authError` contract.
3. **Authorization is by `Project-Id` header, never by body.** Project scope comes from the `Project-Id` header that the client emits because the route declared `requiresProject: true`. A mutation must act on *that* project, not a `project_id` from the payload.
4. **Fail closed and distinguish auth-failure from outage.** Missing auth/permission → `401`/`403` with `authError: true` (client logs out). DB outage → `503` **without** `authError` (client retries, does not log out).
5. **Permission keys have one source of truth:** `lib/types/permissions.ts`, with compile-time exhaustiveness checks.

---

## The System

```text
  Request
    │
    ▼
  app.use("*", authMiddleware)          ← Clerk: populates session, NEVER rejects
    │                                      (passthrough when _BYPASS_AUTH dev mode)
    ▼
  per-route guard (middleware on defineRoute)
    │
    ├─ requireGlobalPermission([opts,] ...UserPermission)      [instance routes]
    │     getGlobalUser(c) → 401 if NOT_AUTHENTICATED
    │     requireAdmin? → 403 if !isGlobalAdmin
    │     isGlobalAdmin → bypass perm checks
    │     else every perm must be true → else 403
    │     sets c.var.globalUser, c.var.mainDb
    │
    └─ requireProjectPermission([opts,] ...ProjectPermission)  [project routes]
          getGlobalUser(c) → 401 if NOT_AUTHENTICATED
          requireAdmin? → 403 if !isGlobalAdmin
          getProjectUser(c, globalUser)  ← reads Project-Id header
          isGlobalAdmin → bypass; else every perm must be true → else 403
          preventAccessToLockedProjects && isLocked → 403
          sets c.var.ppk {projectDb, projectId}, projectUser, projectLabel, globalUser, mainDb
    │
    ▼
  handler  (c.var.* now populated and authorized)
```

`getGlobalUser` and `getProjectUser` both live in `server/project_auth.ts`. `requireGlobalPermission` (in `server/middleware/userPermission.ts`) imports `getGlobalUser` across the directory boundary — they are intentionally one canonical pair.

### `authMiddleware` (Clerk, populate-not-reject)

`server/middleware/auth.ts`:

```ts
export const authMiddleware = _BYPASS_AUTH
  ? async (c, next) => await next()      // dev: no Clerk at all
  : clerkMiddleware();                    // prod: populates getAuth(c), does NOT reject
```

Mounted in `main.ts` as `app.use("*", authMiddleware)` — **after** the public/anonymous routes are registered (so they are reachable without a session) and before everything else. Because Clerk only populates, a route with **no guard** is reachable by anyone — see the `health.ts` gap below.

### `requireGlobalPermission` — instance routes

`server/middleware/userPermission.ts`. Signature: an optional leading `{ requireAdmin? }`, then a variadic list of `UserPermission` keys (AND semantics — all required).

- `OPTIONS` → skipped (CORS preflight).
- `getGlobalUser(c) === "NOT_AUTHENTICATED"` → `401 { success:false, err, authError:true }`.
- `requireAdmin && !isGlobalAdmin` → `403 … authError:true`.
- `isGlobalAdmin` → bypass all permission checks.
- otherwise each `perm` must be truthy in `globalUser.thisUserPermissions`, else `403 … authError:true`.
- on success sets `c.var.globalUser`, `c.var.mainDb`.
- any thrown DB error → `503 { success:false, err:"Service temporarily unavailable" }` (no `authError`).

### `requireProjectPermission` — project routes

`server/project_auth.ts`. Optional leading `{ requireAdmin?, preventAccessToLockedProjects? }`, then variadic `ProjectPermission` keys (AND).

- `OPTIONS` → skipped.
- `getGlobalUser` → `401` if not authenticated.
- `requireAdmin && !isGlobalAdmin` → `403`.
- `getProjectUser(c, globalUser)` resolves the project from the **`Project-Id` header** (see next).
- non-admins: each `perm` must be truthy on `projectUser`, else `403 authError:true`.
- `preventAccessToLockedProjects && isLocked` → `403` (note: this one has **no** `authError` — it's a state error, not an auth error).
- on success sets `c.var.ppk = { projectDb, projectId }`, `projectUser`, `projectLabel`, `globalUser`, `mainDb`.
- error funnel: `"SERVICE_UNAVAILABLE"` → `503` (no authError); `"Middleware error: …"` → `403 authError:true` (message stripped of the prefix); anything else rethrows.

### `getProjectUser` — the `Project-Id` scoping pipeline

The full chain that makes project scope safe:

```text
registry route: requiresProject: true
   → client create_server_action requires args.projectId, emits header "Project-Id"
      → getProjectUser reads c.req.header("Project-Id")
         → loads projects row (label, is_locked, is_central_reporting)
            → resolves ProjectUser + sets c.var.ppk.projectDb for THAT project
```

`getProjectUser` (private to `project_auth.ts`) order of checks:
1. requires `globalUser.approved`, else `Middleware error: User is not approved`.
2. requires `Project-Id` header, else `Middleware error: Project id not in header`.
3. loads the `projects` row; missing → `Middleware error`.
4. **central-reporting gate:** `is_central_reporting && !H_USERS.includes(email)` → deny.
5. `isGlobalAdmin || H_USERS.includes(email)` → full-access project user.
6. else loads `project_user_roles`; requires at least one `can_*` column true, else deny; builds permissions from the row.

### Permission source of truth

`lib/types/permissions.ts` is authoritative:

| Export | Purpose |
|--------|---------|
| `UserPermissions` / `UserPermission` | instance-level permission shape + key union |
| `ProjectUserPermissions` / `ProjectPermission` | project-level shape + key union |
| `USER_PERMISSIONS` / `PROJECT_PERMISSIONS` | the canonical key arrays, each with a compile-time `_Assert*Exhaustive` check |
| `buildUserPermissionsFromRow` / `buildProjectPermissionsFromRow` | map a DB row → permissions object; **warn** on a missing column and default it to `false` |
| `_*_DEFAULT_FULL_ACCESS` / `_*_DEFAULT_NO_ACCESS` | the two presets used for admins / unknown users |
| `PERMISSION_PRESETS` | named role presets for the project-user UI |

Instance permissions: `can_configure_users`, `can_view_users`, `can_view_logs`, `can_configure_settings`, `can_configure_assets`, `can_configure_data`, `can_view_data`, `can_create_projects`. Project permissions are the larger `can_*` set (view/configure visualizations, reports, slide_decks, modules, data, backups, etc.).

### Special modes (precedence, highest first)

| Mode | Source | Effect |
|------|--------|--------|
| `_BYPASS_AUTH` | `BYPASS_AUTH` env, **dev only** (`&& !_IS_PRODUCTION`) | synthetic full-access dev user; Clerk disabled entirely |
| `_OPEN_ACCESS` | `OPEN_ACCESS` env | every authenticated email is auto-inserted as a global admin (`isGlobalAdmin = true`, `approved = true`) |
| `is_admin` | `users.is_admin` column | global admin — bypasses all permission checks |
| `H_USERS` | hardcoded `lib/h_users.ts` (14 emails) | access to `is_central_reporting` projects; `unlimitedAi`; full project access |
| granular permissions | `users` / `project_user_roles` columns | normal least-privilege path |

`unlimitedAi = H_USERS.includes(email) || rawUser.unlimited_ai` (see [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)).

---

## Rules

1. **Every `defineRoute` gets a guard.** Instance → `requireGlobalPermission(...)`; project → `requireProjectPermission(...)`. A route with no guard is public-by-accident.
2. **Project mutations target `c.var.ppk.projectId`** (the guard-authorized project), never a project id pulled from the body/params. Reading a separate id from the payload after authorizing a different project is a confused-deputy / IDOR bug.
3. **Use `requiresProject: true` in the registry** so the client emits `Project-Id`. Server project guards depend on that header existing.
4. **Auth failures return `authError: true`; outages don't.** Keep `401`/`403` as `authError:true` and DB-down as `503` without it — the client's logout logic keys off this.
5. **Permission keys come from `lib/types/permissions.ts`.** Add a key there (so the exhaustiveness assert and the `build*FromRow` mappers stay correct), never inline a string elsewhere.
6. **Prefer a granular permission or `requireAdmin` over a new `H_USERS.includes()` check.** `H_USERS` is a hardcoded allowlist; expanding its use spreads policy into code.

---

## What NOT to do

- **Don't write a raw, unguarded route** for anything that reads or mutates instance/project data. `health.ts` is the cautionary example — it registers ~12 raw routes (`/user_logs`, `/ai_usage`, `/project_activity`, `/pg_stat_statements`) and a **mutating** `POST /pg_stat_statements_reset` with **no auth check at all** (the handlers reference no `getAuth`/`globalUser`/guard). Behind `clerkMiddleware` that populates-not-rejects, these are effectively reachable by any caller.
- **Don't reimplement `getGlobalUser`/`getProjectUser`.** The project SSE route once forked a private soft-failing `getProjectUserForSSE`; it has been retired in favor of `resolveProjectUserAccess` (exported from `project_auth.ts`) — the shared core of `getProjectUser` that both the route middleware and the SSE endpoint now call, so the two cannot drift. Any new consumer of project access must call that function, not re-query `project_user_roles`.
- **Don't assume `globalUser` exists in a handler without a guard.** Only a guard populates `c.var.globalUser`/`c.var.ppk`.
- **Don't drop the `authError` flag** on a `401`/`403` — the client treats its absence as "retryable", which is wrong for an auth failure.

---

## Gotchas

- **`requireProjectPermission()` with no perms** still authenticates and resolves the project (sets `ppk`), it just requires no specific permission. Used where any project member may act (e.g. AI proxy, some emails). Be deliberate: "logged-in project member" is a real but weak gate.
- **Global admins bypass everything.** `isGlobalAdmin` short-circuits all permission loops in both guards. A bug masked by "I tested as admin" will bite a least-privilege user.
- **`preventAccessToLockedProjects` is opt-in per route.** Locked-project protection only applies where the option is passed — it is not global.
- **`build*FromRow` defaults missing columns to `false` and warns.** A new permission column not yet migrated reads as denied (fail-closed) but only logs — watch boot logs after adding a permission.
- **The two guards are near-duplicates.** Their status codes and message formats should match exactly; if you touch one, mirror the other so client `authError` handling stays uniform.

---

## Enforcement opportunities

- **Startup guard audit:** classify every route registered via `defineRoute` as *guarded* or *explicitly `/* PUBLIC */`*, and fail boot on an unclassified route. This closes the `health.ts`-style gap permanently (overlaps the registry check in [DOC_API_ROUTES.md](DOC_API_ROUTES.md), which owns the registry-exception list).
- **Lint the IDOR pattern:** flag handlers that read a project id from `body`/`params` for a write while a `Project-Id`-scoped `ppk` is in context.
- **Unify the two guard implementations** (or extract a shared core) so status codes / messages cannot drift. (Partially done: the project-access core is now shared via `resolveProjectUserAccess`; the global-permission side is still duplicated.)
- **Audit `H_USERS.includes()` call sites** and document, per site, why `requireAdmin` / a granular permission is insufficient.

---

## Adding a guarded route — checklist

- [ ] Pick the guard: instance → `requireGlobalPermission`, project → `requireProjectPermission`
- [ ] List the exact `UserPermission` / `ProjectPermission` keys required (from `lib/types/permissions.ts`)
- [ ] For project routes, ensure the registry entry sets `requiresProject: true`
- [ ] In the handler, scope all DB work to `c.var.ppk.projectDb` / `c.var.ppk.projectId` (never a body project id)
- [ ] Add `{ preventAccessToLockedProjects: true }` for editing routes that should be blocked on locked projects
- [ ] Verify failures return `authError:true` and outages return `503`

---

## Key files

| File | Purpose |
|------|---------|
| `server/middleware/auth.ts` | `authMiddleware` (Clerk / dev passthrough) |
| `server/middleware/userPermission.ts` | `requireGlobalPermission` factory |
| `server/project_auth.ts` | `requireProjectPermission`, `getGlobalUser`, `getProjectUser`, `resolveProjectUserAccess` |
| `lib/types/permissions.ts` | permission types, key arrays, `build*FromRow`, presets |
| `lib/h_users.ts` | `H_USERS` hardcoded allowlist |
| `server/exposed_env_vars.ts` | `_BYPASS_AUTH`, `_OPEN_ACCESS` |
| `server/routes/project/project-sse-v2.ts` | project SSE endpoint (hard-denies via `resolveProjectUserAccess`) |
| `server/routes/instance/health.ts` | the unguarded-routes gap |
| `main.ts` | mounts `authMiddleware`, public-before-auth ordering |
