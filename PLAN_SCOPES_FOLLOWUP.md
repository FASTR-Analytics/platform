# PLAN: Scopes follow-up

Status: written 2026-10-01, nothing built. The scopes feature was reviewed
against the panther and app protocols on that day and the quick findings were
fixed (commits `0a132ac69` to `b19c0259f`). This plan holds what was left: scope
ids are still plain strings, and a handful of small contract and conformance
gaps remain in the scope files.

**Next step: Review 1**

Branch: `version2`. Repos touched: this app only. Read first: §0.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
The app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_SCOPES_FOLLOWUP.md."
- Branch: `version2`, not the `tim-branch` the app protocol names.
- Floor and conditional gates: as PROTOCOL_APP_PLANS.md lists them.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_08` ("Scopes"),
  `SYSTEM_15` ("Scope access"), §2 and §3 of this plan, the step's own section
  in §4, and §8.
- Line numbers below are as of commit `3fff1d7f6`.

## 1. The problem

1. **Scope ids are untyped.** `scopeIdSchema` (`lib/types/scope.ts:18`)
   validates `"all-data" | uuid` at the routes, and the database now enforces
   the same shape (`CHECK` on `scopes.id`, migration 204). Between the two the
   id is `string`: `Scope.id` (`lib/types/scope.ts:120`), `PackageScope.scopeId`
   (`:306`), `ProductSummary.scopeId` (`lib/types/products.ts:31`),
   `ScopeAccess.scopeIds` (`lib/types/instance.ts:288`), `DBScope.id` and
   `DBProduct.scope_id` (`server/db/instance/_main_database_types.ts`), and
   every function and prop that takes one. Nothing stops a run id or a product
   id being passed where a scope id is wanted.
2. **"A restricted user cannot hold All data" is a runtime rule only.**
   `setUserScopeAccess` refuses it by hand (`server/db/instance/users.ts:134`),
   and `user_scopes` has a `CHECK` for it (migration 205), but the type
   `scopeIds: string[]` and the route schema
   (`lib/api-routes/instance/users.ts`, `z.array(scopeIdSchema)`) both admit it.
3. **A scope can be named like the reserved one.** The reserved scope is shown
   as the translated `TC.allData` (`scopeDisplayLabel`,
   `client/src/components/_shared/package_label.ts`). The unique index sees only
   the stored English label, so an admin can create "Toutes les données" or
   "Todos os dados", which a French or Portuguese user cannot tell apart from
   the reserved scope.
4. **`deleteScope` does not close stale collab sockets.** The contract comments
   at `server/routes/instance/users.ts:66` and
   `server/routes/instance/collab.ts:77` say every route that changes a user's
   scope access does. `deleteScope` cascades grants and only broadcasts the
   roster (`server/routes/instance/scopes.ts:81`). Harmless today, because a
   deletable scope has no products, but the comments are untrue.
5. **Conformance gaps in the scope files**, each a rule of
   `panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md`, `PROTOCOL_UI_SOLIDJS.md` or
   `PROTOCOL_UI_STYLING.md`:
   - Braces (TYPESCRIPT 9): one-line `if` in `server/db/instance/scopes.ts`,
     `server/routes/instance/scopes.ts`, `lib/types/scope.ts`,
     `lib/types/instance.ts` (`scopeAccessEqual`),
     `client/src/components/scopes/scope_editor.tsx`,
     `client/src/components/products/_shared/package_scope_modal.tsx`,
     `package_scope_chip.tsx`, and `getScopeLabels` in
     `client/src/components/users/users.tsx`.
   - Exports first (TYPESCRIPT 12): `rowToScope` and `assertLabelFree` sit above
     the exports in `server/db/instance/scopes.ts`; `failureStatus` and
     `notifyScopes` in `server/routes/instance/scopes.ts`; helpers above the
     exported components in `scopes.tsx` and `scope_editor.tsx`.
   - Const by default (TYPESCRIPT 6): `let hmis`, `let hfa`, `let iceh` at
     `scope_editor.tsx:305-323`.
   - Peer in a catch-all (SOLIDJS 10): `<Match when={true}>` at
     `scope_editor.tsx:483`.
   - Spacing tokens (STYLING 14): `pt-3` at `scope_editor.tsx:419`, and
     `gap-1.5 px-2 py-1` at `package_scope_chip.tsx:23`.

## 2. The model

- `ScopeUuid` is the id of an admin-created scope:
  `` `${string}-${string}-${string}-${string}-${string}` ``, the type
  `crypto.randomUUID()` already returns.
- `ScopeId` is `typeof ALL_DATA_SCOPE_ID | ScopeUuid`. `"all-data"` has one
  hyphen, so the two members stay distinct.
- A grant is a `ScopeUuid`. `ScopeAccess` is
  `{ all: true } | { all: false; scopeIds: ScopeUuid[] }`.
- Every scope id in lib, server and client is a `ScopeId` or a `ScopeUuid`. The
  only places a `string` becomes one are the route schemas and
  `crypto.randomUUID()`.

## 3. Rulings

1. `ScopeId` and `ScopeUuid` are template-literal types as in §2, not zod
   brands. No `enum` (TYPESCRIPT 3).
2. `scopeIdSchema` outputs `ScopeId`, and a new `scopeUuidSchema` outputs
   `ScopeUuid`. Both live in `lib/types/scope.ts`.
3. Database row types carry the types without a per-row parse:
   `DBScope.id: ScopeId`, `DBProduct.scope_id: ScopeId`, and the `user_scopes`
   reads select `scope_id` as `ScopeUuid`. The `CHECK` constraints and the
   foreign keys are what make that true.
4. The grant route schema takes `z.array(scopeUuidSchema)`. The hand-written
   check and `SCOPE_ACCESS_ALL_DATA` are deleted from
   `server/db/instance/users.ts`: the type and the schema refuse it, and the
   `user_scopes` `CHECK` is the backstop. The case in
   `server/tests/scope_grants_routes_test.ts` asserts the refusal through the
   route.
5. `createScope` and `updateScope` refuse a label that equals any language of
   `TC.allData`, compared as `assertLabelFree` compares, with a new
   `SCOPE_LABEL_RESERVED` message.
6. `deleteScope`'s route calls the same roster-and-close function
   `setUserScopeAccess`'s route calls. The contract comments stay as written.
7. Repo-wide braces and exports-first are not this plan's (§6). Step 2 fixes
   them in the files §1.5 names and nowhere else.

## 4. Steps

### Step 1: `ScopeId` and `ScopeUuid` through lib, server and client

- **Surface.** `lib/types/scope.ts`, `lib/types/instance.ts`,
  `lib/types/products.ts`, `lib/types/instance_sse.ts`,
  `lib/api-routes/instance/scopes.ts`, `lib/api-routes/instance/users.ts`,
  `lib/api-routes/products/products.ts`,
  `lib/api-routes/instance/run_generation.ts`,
  `server/db/instance/_main_database_types.ts`, `server/db/instance/scopes.ts`,
  `server/db/instance/users.ts`, `server/db/products/`, `server/auth/`,
  `server/routes/instance/`, `server/routes/products/`, `server/mcp/`,
  `server/tests/`, `query_rig/`, and any file under `client/src/` that the
  typecheck names once the lib types change. `SYSTEM_08_results_packages.md` and
  `SYSTEM_15_admin_ops.md`.
- **Deliverable.** Rulings 1 to 4. No `scopeId: string`, `scopeIds: string[]` or
  `scope_id: string` remains (`git grep` for the three is empty outside
  comments). `ScopeSelect` and its callers are typed on `ScopeId` through
  `Select`'s type parameter. No cast to `ScopeId` or `ScopeUuid` outside tests.
  SYSTEM_08 and SYSTEM_15 name the two types where they describe the id and the
  grant.
- **Not in this step.** Label rules, `deleteScope`, and every item of §1.5.
- **Gates.** The floor. The three `git grep` patterns above return nothing.
- **Ends with.** One commit.

### Step 2: reserved label names, `deleteScope`, and conformance in the scope files

- **Surface.** `server/db/instance/scopes.ts`,
  `server/routes/instance/scopes.ts`, `server/routes/instance/users.ts`,
  `server/tests/scope_routes_test.ts`, `lib/types/scope.ts`,
  `lib/types/instance.ts`, `client/src/components/scopes/scopes.tsx`,
  `client/src/components/scopes/scope_editor.tsx`,
  `client/src/components/products/_shared/package_scope_modal.tsx`,
  `client/src/components/products/_shared/package_scope_chip.tsx`,
  `client/src/components/users/users.tsx` (`getScopeLabels` only).
  `SYSTEM_08_results_packages.md`.
- **Deliverable.** Rulings 5 and 6, and every item of §1.5.
  `scope_routes_test.ts` has a case creating and a case renaming a scope to each
  language of `TC.allData`, both refused. SYSTEM_08 states the reserved label
  rule.
- **Not in this step.** The same conformance rules in any other file.
- **Gates.** The floor.
- **Ends with.** Three commits, each green: the label rule, `deleteScope`, the
  conformance edits.

## 5. Gates catalogue

| Gate                                          | First reached |
| --------------------------------------------- | ------------- |
| No plain-string scope id (`git grep`, step 1) | Step 1        |
| Reserved label names refused (route test)     | Step 2        |

## 6. Out of scope

- Braces and exports-first outside the files §1.5 names. The client alone has
  about 990 one-line `if` statements; that is a repo-wide ruling, not a scopes
  one.
- The route handler shape in `server/routes/instance/scopes.ts`
  (`if (res.success) await notify...`) and its `failureStatus` mapper.
- Duplicate translation triples ("Scopes", "No scopes", the two French spellings
  of "Save").
- The repeated SQL in migration 204 and the repeated `INSERT INTO products`
  column list in `server/db/products/products.ts`.
- Typing run ids or product ids the same way.

## 7. Rollout and rollback

Nothing here changes stored data or the schema. Both steps ship with the next
ordinary deploy after the review of step 2 passes. Rollback is a revert of the
step's commits.

## 8. Build log

| Step | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plan | 2026-10-02. Rulings 1 to 6 accepted by Tim as written; the "(proposed)" marks are removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1    | 2026-10-02, Do 1. `ScopeUuid` and `ScopeId` in `lib/types/scope.ts`; `scopeUuidSchema` is `z.custom<ScopeUuid>` over `z.uuid()`, so its input and output are both typed and no cast exists. `ScopeAccess.scopeIds`, `Scope.id`, `PackageScope.scopeId`, `ProductBase.scopeId`, `DBScope.id`, `DBProduct.scope_id` and the `user_scopes` reads carry the types; every function and prop that took a scope id follows. A `Set` of grants is read as `ReadonlySet<ScopeId>` where a product's scope is looked up in it. `canUseScope` compares with `some`, since a `ScopeUuid[]` has no `includes(ScopeId)`. The product-access guard reads the body before validation, so it parses `scopeId` with `scopeIdSchema` (`scopeIdsOf`, `server/middleware/userPermission.ts`). Ruling 4: the hand check and `SCOPE_ACCESS_ALL_DATA` are gone, and `scope_grants_routes_test.ts` asserts the 400 through `POST /user/scope-access`. Tests that used made-up ids (`"scope-kano"`, `"s1"`, `"gone"`, `"scope"`) now use uuids or `ALL_DATA_SCOPE_ID`. SYSTEM_08, SYSTEM_12 and SYSTEM_15 name the two types. Gates: typecheck, `./validate_protocols`, boot on 8011 green; `deno task test` 508 passed with the two known `report_fastr_word_test.ts` failures; the three `git grep` patterns and `as ScopeId` / `as ScopeUuid` return nothing. |
