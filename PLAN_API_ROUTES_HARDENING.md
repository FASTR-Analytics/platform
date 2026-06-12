# Plan — API Routes Hardening (bugs + contract enforcement)

> **Status: NOT STARTED.** Findings from a full review of the route/serverAction system (2026-06-12): `DOC_API_ROUTES.md`, `lib/api-routes/`, `server/routes/`, `client/src/server_actions/`. Every `file:line` was verified against the working tree that day. The registry itself is in good shape — 254 routes, zero key collisions, params/path placeholders agree everywhere (script-verified), no GET route declares a body. The problems are at the edges: the contract is enforced client-side only, and the client's non-2xx handling mangles guard rejections.
>
> Companion: [PLAN_API_ZOD.md](PLAN_API_ZOD.md) (runtime body/params validation) **depends on A1 landing first** — Zod introduces 400 responses, which today would hit the same raw-text path as the 403 bug. Absorbs [PLAN_DOC_ENFORCEMENT.md](PLAN_DOC_ENFORCEMENT.md) item 3 (see B2). Item 4 there (startup guard-audit) stays in that plan; B1/B3 here complement it.

## Goals

- **A — Fix confirmed bugs** (each independently shippable).
- **B — Enforce the contract in both directions.** Today the client trusts the registry but nothing checks what handlers return; make handler return shapes typecheck against the registry and make boot validation fail hard.
- **C — Correct DOC_API_ROUTES.md** where the review proved it wrong (cachedBody gotcha — B5; plus the stale `share.ts` rows — C1).

## Decisions (resolved with Tim, 2026-06-12)

| # | Question | Decision |
|---|----------|----------|
| D1 | Guard level for `checkModuleUpdates` (A8) | **Bare `requireGlobalPermission()`** — any signed-in user. Tim: low security, should be available to anyone who can view modules. No module-related *global* permission exists (`lib/types/permissions.ts`), and the call sites are project pages calling without a projectId, so project-scoping would be overkill. The guard's job here is only to exclude anonymous traffic (see A8). |
| D2 | `log()` body-size cap threshold (A4) | **64 KB** stringified; replace with `{ _truncated: true, bytes }` |
| D3 | Registry `audit` flag (auto-`log()`) and AbortSignal support | **Both stay deferred** — listed in §Deferred, not in this branch |

---

## Part A — Bug fixes

### A1. 4xx envelope rejections reach the UI as raw JSON text

**Problem.** Guards reject with an `APIResponse` envelope at HTTP 403: `server/project_auth.ts:80` ("Admin access required"), `:95` ("User does not have X permissions"), `:106` ("locked project"); also `server/routes/instance/custom_prompts.ts` (`c.json({...}, 403)`). But `client/src/server_actions/try_catch_server.ts:126-132` handles any non-OK, non-401/503 response with `err: await res.text()` — so the UI's `err` string is the JSON-serialized envelope, e.g. `'{"success":false,"err":"User does not have can_run_modules permissions for this project","authError":true}'`. Every permission rejection and locked-project rejection displays as a JSON blob.

**Fix.** In the `!res.ok` branch of `tryCatchServer`, attempt `JSON.parse(text)`; if the result has `success === false` and a string `err`, return it directly; else keep the current text fallback. Apply the same treatment to `consumeStream`'s `!response.ok` branch (`client/src/server_actions/create_server_action.ts:100-106`).

**Ride-along.** `project_auth.ts` sets `authError: true` on *permission* (403) rejections (`:84`, `:99`), not just authentication ones. The client only consults `authError` under the 401 branch, so removing it from the 403 bodies is behavior-neutral and fixes the semantics. Keep it on the 401 (`:71`) and the `Middleware error:` catch (`:140` area) only if that path can represent auth loss — check before removing.

### A2. Two registry entries declare a response their handlers never return

**Problem.** `lib/api-routes/project/projects.ts:129` (`setAllModulesDirty`) and `lib/api-routes/project/modules.ts:56` (`rerunModule`) declare `response: {} as { success: true }` — the envelope itself was written as the data type. Client type becomes `{ success: true; data: { success: true } }`, but the handlers return `c.json({ success: true })` with no `data` (`server/routes/project/project.ts:432`, `server/routes/project/modules.ts:260`). `res.data` is `undefined` at runtime where the type says otherwise.

**Fix.** Delete the `response` field from both registry entries (they are no-data routes). First grep client call sites (`rerunModule`, `setAllModulesDirty`) for `.data` access — none expected (checked `client/src/components/project/project_modules.tsx:324` reads `.success` only), but verify before changing the type.

### A3. Path params substituted without URL-encoding

**Problem.** `client/src/server_actions/create_server_action.ts:65` does `url.replace(param, args[paramName])` raw. User-supplied values flow into `/user/:email`, `/api/backups/:folder/:file`, `/api/create-backup/:name`. A value containing `#` silently truncates the URL (fragment); `/` reroutes; `?` starts a query string.

**Fix.** `url.replace(param, encodeURIComponent(args[paramName]))`. Hono percent-decodes `c.req.param()` server-side, so values round-trip unchanged (emails: `@` → `%40` → `@`). No server change needed.

### A4. `log()` writes unbounded request bodies into `user_logs`

**Problem.** `server/middleware/logging.ts:45` stringifies the full body into the `details` column. `restoreBackup` carries a base64 database dump in `fileData` and has `log("restoreBackup")` applied → multi-MB rows in `user_logs`.

**Fix.** After building `details`, if it exceeds 64 KB (D2), rebuild with the body replaced by `{ _truncated: true, bytes }`. Cap the whole `details` string, not just `body`, so huge params/headers can't slip through either.

### A5. `serverActions` wrapper overrides erase typing for six actions

**Problem.** The wrappers in `client/src/server_actions/index.ts:19-64` (`createSlide`, `updateSlide`, `getSlide`, `getSlides`, `getReportDetail`, `updateReportFigures`) are all `(args: any)`, so the most structurally delicate payloads in the app have no call-site type checking.

**Fix.** Annotate each as `ServerActionsType["createSlide"]` etc. The bodies already conform; internal `as any` casts where the sentinel encode/decode changes types are acceptable — the goal is the *external* signature.

### A6. Streaming calls skip token refresh

**Problem.** `client/src/server_actions/create_server_action.ts:45` does a bare `fetch` for `isStreaming` routes — no `clerk.session?.getToken()` refresh (which `tryCatchServer` performs at `try_catch_server.ts:31`). Long-running operations are exactly the ones most likely to start with a stale session.

**Fix.** `await clerk.session?.getToken()` before the streaming fetch. Do **not** add the timeout/retry machinery: an AbortController timeout would kill legitimately long streams, and replaying a non-idempotent streaming POST is wrong. Leave a one-line comment stating that exclusion is deliberate.

### A7. `fetchMyProjects` duplicates the registry route `getMyProjects`

**Problem.** `client/src/server_actions/index.ts:67-72` hand-rolls a fetch for `/my_projects`; the registry already declares it (`lib/api-routes/instance/instance.ts:22`, key `getMyProjects`) and the generated action is unused. Sole caller: `client/src/state/instance/t1_sse.tsx:142`.

**Fix.** Replace the call with `serverActions.getMyProjects({})`, delete `fetchMyProjects`.

### A8. `checkModuleUpdates` has no permission guard (and is therefore anonymous)

**Problem.** `server/routes/instance/modules.ts:17` — one of only two guard-less registry routes (the other, `getInstanceMeta`, is deliberate — needed pre-login). Note the severity: `authMiddleware` is plain `clerkMiddleware()` (`server/middleware/auth.ts:4`), which populates the session without rejecting, so a guard-less route is reachable **without any login** — anonymous internet requests can trigger GitHub API fetches.

**Fix.** Per D1: add bare `requireGlobalPermission()` (any signed-in user — matches "available to anyone who can view modules"; do **not** use `requireAdmin` and do not project-scope it).

### A9. `consumeStream` discards the tail buffer

**Problem.** `client/src/server_actions/create_server_action.ts:123-149` — if the stream ends without a trailing newline, the final line sits in `buffer` and is never parsed; the call returns "Stream ended unexpectedly" even when a terminal message arrived. Currently safe only because `StreamWriter` always appends `\n`.

**Fix.** After the read loop, if `buffer.trim()` is non-empty, run it through the same per-line parse before returning the fallback error.

### A10. Stray args on a GET become a request body (then get retried)

**Problem.** `buildRequestParams` puts every non-param, non-projectId arg into the body regardless of method (`create_server_action.ts:77-86`). On a GET, `fetch` throws (`GET/HEAD cannot have body`), which `tryCatchServer` treats as an unknown error and **retries 3× with backoff** (GET is a "safe method") before surfacing a misleading network error. The type system mostly prevents this; this is defense in depth.

**Fix.** In `createServerAction`, never attach a body for `GET`/`HEAD`.

### A11. `restoreBackup` handler ignores the defineRoute body and re-reads it

**Problem.** `server/routes/instance/backups.ts:309` does its own `await c.req.json()` with a cast claiming a `projectId` body field — which the client never sends (the client strips `projectId` into the `Project-Id` header; the handler correctly uses `c.var.ppk.projectId` anyway). Plus stray `console.log`s of request fields.

**Fix.** Use the `{ body }` arg `defineRoute` provides, fix the cast to the real wire shape (`folder?`, `fileName?`, `fileData?`), drop the manual read and the console noise.

---

## Part B — Contract enforcement

### B1. Type handler returns against the registry (the missing direction)

**Problem.** `RouteHandler` returns bare `Promise<Response>` (`server/routes/route-helpers.ts:18-24`); the `RouteResponse` type defined at `:14` is dead code. `c.json(anything)` compiles — which is how A2 happened. The DB-function passthrough is also unlinked: nothing connects a DB function's `APIResponseWithData<T>` to the registry's declared `T` except the handler body.

**Fix.** Hono 4's `c.json()` returns `Response & TypedResponse<T, …, "json">`. Constrain the handler return type per key:

- Non-streaming: `Promise<Response & TypedResponse<Envelope<K>>>` where `Envelope<K>` is the registry entry's `response` property type (it is already the full envelope — see B4).
- `isStreaming` routes: keep `Promise<Response>` (`streamResponse` returns a plain stream Response).

Implementation notes:
- `TypedResponse`'s data parameter must accept *narrowed* envelope arms (`c.json({ success: false, err })` where the envelope is a union). If variance bites, the fallback is a tiny `jsonEnvelope(c, res, status?)` helper typed against `Envelope<K>` that wraps `c.json` — same enforcement, friendlier inference. Prove out on `server/routes/project/reports.ts` (the canonical file) before sweeping.
- **Expect fallout.** Every nonconforming handler becomes a typecheck error; A2's two are known, and the sweep may surface more (this review checked all hand-built-envelope sites by hand and found only A2, but the DB-passthrough drift class was only spot-checked). Budget time to fix what surfaces; each is a real latent bug.

### B2. Boot validation fails hard *(absorbs PLAN_DOC_ENFORCEMENT item 3)*

**Problem.** `validateAllRoutesDefined` (`server/routes/route-tracker.ts:12`) only `console.error`s; a typo'd/unimplemented registry key ships as a client action that 404s.

**Fix.** Throw (or `Deno.exit(1)`) on missing/extra. Boot is currently green, so this costs nothing. Update PLAN_DOC_ENFORCEMENT.md item 3 → pointer here (done when this plan was written). Also delete the vestigial `markRouteDefinedEnhanced` alias (`route-tracker.ts:53`).

### B3. Registry collision detection at boot

**Problem.** `lib/api-routes/combined.ts` merges 28 feature registries by object spread — a duplicate key across two files silently last-wins (the earlier route becomes unreachable). No collisions exist today (verified); nothing prevents one tomorrow.

**Fix.** In `validateAllRoutesDefined` (server-side boot, *not* `combined.ts` module-init — that code runs in the client bundle, where a throw is a white screen): import the individual feature registries, assert `sum(per-registry key counts) === merged key count`, and scan the merged registry for duplicate `method + path` pairs. Optionally also assert path placeholders ↔ declared params agreement once params are runtime values (see PLAN_API_ZOD.md — not possible with phantoms).

### B4. Fix the distributive-`never` in `InferredResponse`

**Problem.** `lib/api-routes/route-utils.ts:39` — `TResponse extends never ? APIResponseNoData : …` is a distributive conditional, so for no-response routes it resolves to `never`, not `APIResponseNoData`. The system works only because `lib/api-routes/server-action-types.ts:9` independently compensates with the correct `[R] extends [never]` form. B1's `Envelope<K>` needs the origin type to be honest.

**Fix.** `[TResponse] extends [never] ? APIResponseNoData : APIResponseWithData<TResponse>`. Then simplify `RouteResponse` in `server-action-types.ts` (the `[R] extends [never]` arm becomes unreachable — keep or delete, but leave a one-line comment either way). Typecheck both sides; no runtime change.

### B5. Remove the `cachedBody` mechanism *(+ doc correction)*

**Problem.** **Verified empirically 2026-06-12 on Hono 4.5.3** (`jsr:@hono/hono@^4.5.3`): `c.req.json()` caches internally — calling it twice returns the body both times, no "body already consumed" error. So `log()`'s `c.set("cachedBody", …)` (`server/middleware/logging.ts:14`) and `defineRoute`'s `c.var.cachedBody ?? await c.req.json()` (`server/routes/route-helpers.ts:53`) solve a problem that doesn't exist, and DOC_API_ROUTES.md's gotcha ("mixing a manual `c.req.json()` before defineRoute reads the body will throw") is **false**.

**Fix.** `defineRoute` reads `await c.req.json()` unconditionally (keep the try/catch for empty/invalid bodies); `log()` stops setting `cachedBody` (its own `c.req.json()` read for the audit row is fine — cached). Update DOC_API_ROUTES.md: the `log()` section (drop the cachedBody coupling), the Gotchas entry (delete), the defineRoute step list.

### B6. Per-route `timeoutMs` in the registry

**Problem.** `client/src/server_actions/try_catch_server.ts:36-44` hardcodes URL-substring sniffing (`step3_dhis2_stage_data`, `/project/` + `/copy`) to pick 10-min vs 5-min timeouts — route knowledge living in the wrong layer, silently broken by any path rename.

**Fix.** Add optional `timeoutMs?: number` to `route()` as a **real runtime field** (alongside `requiresProject`). `createServerAction` passes it to `tryCatchServer` as a parameter; delete the sniffing. Set `timeoutMs: 600000` on `structureStep3Dhis2StageData` (`lib/api-routes/instance/structure.ts`) and `copyProject` (`lib/api-routes/project/projects.ts`). Note: both are `isStreaming`? — if either is, the timeout doesn't apply on the streaming path (see A6); set it anyway for documentation value.

---

## Part C — Doc corrections

### C1. Remove the deleted `share.ts` routes from DOC_API_ROUTES.md

**Problem.** The viz-share removal (2026-06-10) deleted `routes/instance/share.ts` and `routes/public/share.ts`, but DOC_API_ROUTES.md still lists them: the raw-route table (`:181`, the `{ token, slug }` row) and the envelope-lint exception bullet (`:223`). A reader auditing raw routes hunts for files that no longer exist.

**Fix.** Drop both share.ts mentions. The remaining raw/public routes there (`public/dashboard.ts`, `health.ts`, `ai_proxy`, TUS `upload.ts`, the two SSE endpoints, `export_central.ts`) are the live set — reconcile the table against the actual off-registry inventory while editing (the systems review enumerated ~30 off-registry endpoints; this table should match). Pairs naturally with B5's doc edit — same file, one pass.

---

## Deferred (do not bundle)

- **Registry `audit` flag** auto-applying `log()` in `defineRoute` — changes audit coverage (today 16 of 25 route files apply it manually); needs a deliberate pass deciding per-route. Revisit after this branch.
- **AbortSignal passthrough** for cancellable requests — touches `ServerActionsType` signature; bundle with the Zod migration's signature changes if wanted.
- **`onError` returns HTTP 200** (`main.ts:105-110`) — documented wart; changing to 500 interacts with rolling deploys and the A1 fix. Leave.
- Raw-route envelope drift (`health.ts`, `ai_proxy`) — already tracked as a documented exception in DOC_API_ROUTES.md.

## Order of work

1. A2, B4 (registry/type fixes, zero runtime risk) → typecheck.
2. A1 + ride-along, A3, A5, A7, A9, A10 (client) → typecheck client.
3. A4, A6, A8, A11, B5 + C1 (server + DOC_API_ROUTES.md edits, one pass) → boot server.
4. B2, B3 (boot hardening) → boot server, confirm green.
5. B1 (TypedResponse) last — it's the one that surfaces unknown fallout; fix what it finds.
6. B6 (timeoutMs) — registry + client together.

## Verification

- `deno task typecheck` green (server + client).
- Boot prints `✅ All N routes correctly implemented` (and now *throws* if not — test by commenting out one `defineRoute`).
- Browser: as a non-admin, hit an admin route (e.g. toggle another user's permission) → error toast shows the human message, not JSON.
- Browser: create a backup named `a b#c` → round-trips.
- Browser: slide create/edit/reload (exercises A5's retyped wrappers + sentinel paths).
- `user_logs`: run `restoreBackup` with a file → `details` row is capped.
