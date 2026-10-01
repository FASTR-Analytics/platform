# PLAN: Scopes

A scope becomes a named, admin-created entity with three dimensions (geography,
time, data). A product picks a package and a scope by label. A user can be
limited to a set of scopes, and then sees only products that carry one of them
and reads only data inside them. The scope is enforced by building it into the
DuckDB view every query runs against, in one place, instead of appending filters
to each query.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N` for steps 1 to 5. The review of step 5
deletes this file.

All work is on `version2`. Repos touched: this app only.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`. The app's floor, conditional gates
and docs rule are `PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_SCOPES.md."
- Branch: `version2` (PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides
  it, as PLAN_PRODUCTS_RESTRUCTURE does).
- Floor and conditional gates: as PROTOCOL_APP_PLANS lists them.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.
- A Surface in §4 names files and globs. Where it says "and their importers", it
  means files that fail to typecheck because of the step's type change and need
  only the mechanical edit that restores it. Each such file is listed in the
  build log by the Do session.

Vocabulary. **Scope**: a row in `scopes` (id, label, definition). **Scope
definition**: the three dimensions, each of which may be unconstrained.
**Unconstrained**: a dimension, or a whole definition, that filters nothing.
**Whole package**: a read with no scope (`scopeId: null` on the wire), allowed
only to unrestricted users. **Definition hash**: the hash of a canonical
definition, the token in every cache key and figure stamp. **Grant**: a
`user_scopes` row. **Restricted user**: a user with `all_scopes = false`.
**Unrestricted user**: everyone else, including every global admin.
**Unfilterable**: a results object with no column a constrained dimension can be
applied to. **PackageScope**: the pair `{ runId, scopeId }` a figure read
resolves under.

"Public", "private" and "published" are not concepts in this app. A scope's
label is free text and implies nothing.

---

## 1. The problem

- **Scope is one column.** `products.admin_area_2` (NULL = national,
  `server/db/instance/_main_database.sql:136`), typed
  `PackageScope =
  { runId, adminArea2 }` (`lib/types/scope.ts:8`). There is no
  time or data dimension and no name.
- **The caller supplies the scope.** The five run-keyed reads take `adminArea2`
  in the body (`lib/api-routes/instance/run_generation.ts:123-183`) behind
  `requireApprovedUser()`. SYSTEM_08 and PLAN_PRODUCTS_RESTRUCTURE D7 rule that
  any approved user may read any ready package at any scope.
- **The filter is injected per query, at three sites** in
  `server/run_query/run_read.ts`: `getPresentationObjectItemsFromRun` (:837,
  with the caller's fetch config restored onto the response at :883),
  `getPossibleValuesFromRun` (:919) and `getResultsObjectItemsFromRun` (:999,
  with a `textColumns` hint and its own count). An empty derivation needs the
  `__SCOPE_EMPTY__` sentinel (:736) because an empty filter list shows all data.
  A new read path that forgets the filter shows everything.
- **Every serving query already runs against a view.** `executeSqlOverParquet`
  (`server/run_query/duckdb_executor.ts:79`) creates
  `CREATE VIEW x AS SELECT * FROM read_parquet(...)` per query, from the list
  `viewsFor` builds (`run_read.ts:190`). The only serving query that bypasses
  `viewsFor` is the child-area derivation inside `computeScopeFilters` (:787).
- **Two reads use package-wide manifest stamps for period bounds**:
  `getRawPeriodBoundsFromRun` (`run_read.ts:976`, the replicant-options path)
  and `getResultsValueInfoFromRun` (:965). SYSTEM_09 rules that fine for
  geography. A time bound breaks it by construction.
- **Product access is a stub.** `productAccessPolicy`
  (`server/auth/product_access.ts:16`) returns `user.approved`. It is
  synchronous and runs before the guard sets `c.var.mainDb`
  (`server/middleware/userPermission.ts:150` against :157).
- **Every approved connection receives every product.** `buildInstanceState`
  (`server/task_management/build_instance_state.ts:151`) and the `forwardable`
  closure (`server/routes/instance/instance-sse.ts:112`) filter on approval
  only.
- **Collab rooms admit any approved user.** `RoomConn.canEdit` is hard-coded
  true (`server/routes/instance/collab.ts:366`) and `subscribeDoc` has no access
  check (`server/collab/doc_rooms.ts:343`).

---

## 2. The model

### 2.1 The scope definition

```ts
type ScopeDefinition = {
  geography: { adminArea2: string } | null;
  time: {
    years: { start: number; end: number } | null;
    hfaTimePoints: string[] | null;
  };
  modules: string[] | null;
  indicators: {
    hmis: string[] | null; // column indicator_common_id
    hfa: string[] | null; // column hfa_indicator
    iceh: string[] | null; // column iceh_indicator
  };
};
```

`null` means unconstrained at every level. The canonical form upper-cases
`adminArea2` and sorts and de-duplicates every list. `scopeDefinitionHash` is a
pure function of the canonical form and lives in `lib/types/scope.ts` beside the
schema, in the style of `hashFetchConfig` (`lib/get_fetch_config_from_po.ts`).
The hash is derived on read and is never stored in the database.

A scope is independent of packages. A definition that names an area, module or
indicator a package lacks attaches fine and yields no rows.

### 2.2 Tables

```sql
CREATE TABLE scopes (
  id text PRIMARY KEY NOT NULL,        -- UUID
  label text NOT NULL,
  definition text NOT NULL,            -- ScopeDefinition JSON
  created_by text,
  created_at text,
  last_updated text NOT NULL
);

-- products: admin_area_2 is replaced by
  scope_id text NOT NULL REFERENCES scopes(id),  -- no cascade: the delete guard

-- users gains
  all_scopes boolean NOT NULL DEFAULT TRUE,

CREATE TABLE user_scopes (
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  scope_id text NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  PRIMARY KEY (email, scope_id)
);
```

### 2.3 The scoped view

`executorFor` takes a resolved scope and no query can be built without one. For
each view, a pure function `scopePredicateFor(definition, ro, manifest)` returns
a SQL predicate, or nothing when the definition does not constrain that results
object, and the view becomes
`CREATE VIEW x AS SELECT * FROM read_parquet(...) WHERE <predicate>`. The query
builders above the executor are unchanged.

The predicate for a results object is the AND of four parts. A part is absent
when its dimension is unconstrained.

| Dimension  | Results object has                                   | Predicate                                                          |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Geography  | `admin_area_2`                                       | `UPPER(admin_area_2) = UPPER('<aa2>')`                             |
|            | only `admin_area_3` or `admin_area_4`                | child column `IN` a subquery on the family facilities parquet      |
|            | a child column but no facilities parquet             | `FALSE`                                                            |
|            | no admin-area-2-or-lower column                      | `FALSE`                                                            |
| Years      | a physical time column                               | range on that column, converted with `lib/convert_period_value.ts` |
|            | `time_point` and no physical time column             | none (governed by `hfaTimePoints`)                                 |
|            | neither                                              | `FALSE`                                                            |
| HFA rounds | `time_point`                                         | `time_point IN (...)`                                              |
|            | no `time_point`                                      | none                                                               |
| Modules    | a `moduleId` outside the list                        | `FALSE`                                                            |
| Indicators | one of the three indicator columns, and its list set | that column `IN (...)`                                             |
|            | one of the three indicator columns, its list not set | none                                                               |
|            | none of the three columns, and any list set          | `FALSE`                                                            |

The facilities views take the geography part only.

Manifest stamps are package-wide, so three reads change. Period bounds read from
`ro.periodBounds` are clamped to `time.years`. `ro.rowCount` is used only when
the view has no predicate. `getRunAuthoringContext` takes the scope and drops
modules, metrics and presets outside `modules`.

### 2.4 Reads and enforcement

The run-keyed reads take `scopeId: string | null` in place of `adminArea2`.
`getReadyRunReadContext(mainDb, runId, scopeId, user)` loads the scope and
answers 404 for an unknown id, and 403 when the user is restricted and either
`scopeId` is null or the scope is not granted. `RunReadContext` carries the
resolved scope, and `scopeToken` is the definition hash. Every cache key keeps
its shape with the hash in the token's place.

### 2.5 Products, figures, staleness

`ProductBase.scopeId` replaces `adminArea2`. `createProduct` takes `runId` and
`scopeId` from a create dialog. `setProductScope` and `duplicateProduct` take
`scopeId`.

```ts
// FigureBundle.scope
{
  definitionHash: string;
  adminArea2: string | null;
}
```

A figure is stale when its `provenance.runId` differs from the product's package
or its `definitionHash` differs from the current hash of the product's scope.
Editing a scope's definition therefore marks every figure resolved under it as
stale. `adminArea2` stays in the bundle because the roll-up row label is
rendered from the frozen bundle.

### 2.6 Access

`GlobalUser.scopeAccess` is `{ all: true }` or
`{ all: false, scopeIds: string[] }`. Global admins and open-access instances
are always `{ all: true }`.

| Surface                                               | Restricted user                                  |
| ----------------------------------------------------- | ------------------------------------------------ |
| Product routes                                        | every target product's scope must be granted     |
| A `scopeId` in a product route body                   | must be granted                                  |
| Folder routes                                         | unchanged                                        |
| Run-keyed data reads, authoring context               | the named scope must be granted; null is refused |
| Instance SSE: products, slide stamps, scopes          | only rows in granted scopes                      |
| Instance SSE: folders, ready packages                 | unchanged                                        |
| Collab subscribe                                      | the product's scope must be granted              |
| `/mcp`                                                | refused                                          |
| Explore, Results, Data, Scopes tabs                   | hidden                                           |
| `can_view_data`, `can_configure_data`,`can_view_logs` | read as false                                    |
| Copilot                                               | unchanged (it reads through the product's scope) |

### 2.7 Screens

- **Scopes tab** (global admins): list, create, edit, delete. Delete is refused
  while a product carries the scope.
- **User editor**: a Scopes card with "All scopes" and a multi-select, hidden
  for global admins.
- **Named scope select** replaces the national-or-area picker on the product
  package-and-scope modal, the duplicate modal and Explore. The package page's
  select adds "Whole package" and defaults to it. The area picker survives only
  inside the scope editor.

---

## 3. Rulings

Rulings marked _(proposed)_ were derived while writing the plan and stand unless
overruled here before `Do 1`.

**R1. Three dimensions.** A scope is geography, time and data. (Tim)

**R2. Scopes are admin-created entities with a UUID and a label.** (Tim)

**R3. A product picks a package and a scope by label.** The author never sets
the dimensions. (Tim)

**R4. A user can be limited to a set of scopes**, and then sees only products
that carry one of them. (Tim)

**R5. The scope is a security boundary for data values only.** Package metadata
(which periods, modules and indicators exist) is not restricted. (Tim)

**R6. Enforcement is the scoped view.** No scoped copies of packages, and no
per-query filters. (Tim)

**R7. The data routes enforce grants**, not only product visibility. (Tim)

**R8. An unfilterable results object is empty**, for every scope and every
dimension. Today's single-area products lose their national tables. (Tim)

**R9. Geography is national or one admin area 2.** A set of areas is a later
change. (Tim)

**R10. The data dimension is a module list and an indicator list.** (Tim)

**R11. Scopes are editable after products attach.** Caches and figure staleness
key on the definition hash. (Tim)

**R12. `users.all_scopes` is an explicit flag**, true for every existing user.
(Tim)

**R13. A restricted user can create and edit products in their scopes and use
the copilot, and has no Explore, no `/mcp` and no package page.** (Tim)

**R14. A user can set a product's scope only to a scope they hold.** (Tim)

**R15. No new protection against wider figures entering a narrower product.**
Rescope, copy slides, duplicate and version restore carry stored figure data as
they do today. (Tim)

**R16. Scope ids are UUIDs from `crypto.randomUUID()`**, as `folders.id` and
`runs.id` are. _(proposed)_

**R17. The indicator list is one list per indicator column**:
`indicator_common_id`, `hfa_indicator`, `iceh_indicator`. A results object with
none of the three columns is empty when any list is set. _(proposed)_

**R18. The time dimension is whole years plus an optional list of HFA time
points.** Health facility assessment outputs carry `time_point`, a text label
with no date, so a year range cannot filter them. A results object with
`time_point` is governed by the time-point list alone. A results object with
neither kind of time column is empty when `years` is set. _(proposed)_

**R19. The predicate is decided by column presence, never by dataset family.**
The family is undeclarable for modules whose inputs are all upstream results
objects (the comment above `computeScopeFilters`). _(proposed)_

**R20. `scopeId: null` on the wire means the whole package**, and is refused for
a restricted user. `/mcp` and the package page's default use it. Products always
carry a scope. _(proposed)_

**R21. The migration seeds one unconstrained scope labelled "All data" and one
scope per distinct `products.admin_area_2`**, labelled with the area name.
National products move to "All data". Seeded scopes are ordinary rows.
_(proposed)_

**R22. Creating a product opens a dialog for package and scope.** The package
defaults to the pin. The scope has no default unless the user can use exactly
one. _(proposed)_

**R23. Folders are not restricted.** Every approved user sees and edits the
folder tree as today. A folder holds a label and no data. _(proposed)_

**R24. A new user is unrestricted** (`all_scopes` defaults to true), as today.
_(proposed)_

**R25. Scopes are managed by global admins only** (`requireAdmin`), on a new
Scopes tab. Grants are edited in the user editor under `can_configure_users`.
_(proposed)_

**R26. A restricted user's `can_view_data`, `can_configure_data` and
`can_view_logs` read as false**, forced where the row becomes a `GlobalUser`
(`buildGlobalUserFromDb`). Those bits expose whole packages and raw datasets.
_(proposed)_

**R27. Period bounds from the manifest are clamped to the scope's years.** The
geography ruling in SYSTEM_09 (the replicant path keeps the package-wide stamp)
stands. _(proposed)_

**R28. The authoring context is filtered by `modules` only.** Indicator lists in
it are metadata (R5). _(proposed)_

**R29. A client whose own scope access changes reconnects its SSE stream**, as
it does on moving from unapproved to approved. The server closes that user's
collab sockets with `closeConnectionsForEmail`. _(proposed)_

**R30. Supersedes.** PLAN_PRODUCTS_RESTRUCTURE D7's "any approved user can read
any ready package at any scope" and SYSTEM_08's "not a security boundary" are
replaced by R5 to R7. The steps rewrite the SYSTEM prose. That plan's file is
not edited.

---

## 4. Steps

| Step | Does                                                 |
| ---- | ---------------------------------------------------- |
| 1    | The scoped view, geography only, no behaviour change |
| 2    | The scope entity end to end, geography only          |
| 3    | Time and data dimensions, and the unfilterable rule  |
| 4    | The Scopes tab                                       |
| 5    | Grants and enforcement                               |

### Step 1: The scoped view, geography only

**Surface.** `server/run_query/duckdb_executor.ts`;
`server/run_query/run_read.ts`; `server/run_query/mod.ts`;
`server/runs/delete_run.ts`; `query_rig/**`; `PROTOCOL_APP_QUERY_RIG.md`;
SYSTEM_08 and SYSTEM_09 prose.

**Deliverable.** `ParquetView` carries an optional predicate and
`executeSqlOverParquet` appends it to the view. `scopePredicateFor` is a pure
exported function producing today's geography behaviour exactly: the direct
filter, the child-column subquery on the facilities parquet, `FALSE` where
`computeScopeFilters` returns the sentinel today, and no predicate for a results
object with no admin column (R8 arrives in step 3). The three injection sites,
`computeScopeFilters`, `SCOPE_EMPTY_SENTINEL`, the derivation cache with
`evictRunFromScopeDerivationCache`, the fetch-config restore and the
`textColumns` hint are deleted. `rowCount` from the manifest is used only when
the view has no predicate. The wire, the cache keys and `PO_CACHE_VERSION` are
unchanged.

**Not in this step.** Any change to `adminArea2` on the wire, in
`RunReadContext` or in the rig's case type. The unfilterable rule.

**Gates.** `./validate_queries` green with every existing case unchanged. The
rig's mutation table in PROTOCOL_APP_QUERY_RIG gets the row "`scopePredicateFor`
returns no predicate" in place of the `computeScopeFilters` row, with the same
red and green counts.

**Ends with.** One commit.

### Step 2: The scope entity end to end, geography only

**Surface.**

- Schema: `server/db/instance/_main_database.sql`, `_main_database_types.ts`,
  `server/db/migrations/instance/204_scopes.sql`.
- Transforms: `server/db/migrations/data_transforms/_figure_block.ts`,
  `slide_config.ts`, `reports.ts`.
- lib: `lib/types/scope.ts`, `products.ts`, `_figure_bundle.ts`,
  `instance_sse.ts`, `lib/api-routes/products/products.ts`,
  `lib/api-routes/instance/run_generation.ts`, a new
  `lib/api-routes/instance/scopes.ts`, `lib/explore_grid_query.ts`.
- Server: a new `server/db/instance/scopes.ts` and
  `server/routes/instance/scopes.ts`, `main.ts` (the mount),
  `server/db/products/products.ts`, `versions.ts`,
  `server/routes/products/products.ts`, `server/run_query/**`,
  `server/routes/instance/run_generation.ts`,
  `server/routes/caches/visualizations.ts`, `server/mcp/env.ts`,
  `server/task_management/build_instance_state.ts`,
  `notify_instance_updated.ts`, `server/routes/instance/instance-sse.ts`.
- Client: `client/src/state/instance/t1_store.ts`, `t1_sse.tsx`,
  `client/src/state/products/t2_*.ts`, `client/src/state/t4_explore.ts`,
  `client/src/generate_visualization/**`,
  `client/src/components/_shared/{scope_picker,package_label,figure_preview}.ts*`,
  `client/src/components/_shared/figure_editor/**`,
  `client/src/components/products/**`, `client/src/components/explore/**`,
  `client/src/components/results_packages/**`, and their importers.
- Tests and rig: `server/tests/**`, `query_rig/**`.
- Docs: SYSTEMS.md vocabulary, SYSTEM_02, 03, 08, 09, 10, 12 prose and globs,
  PROTOCOL_APP_QUERY_RIG, PROTOCOL_APP_STATE's cache table.

**Deliverable.**

- `ScopeDefinition` (zod, strict), its canonical form and `scopeDefinitionHash`
  in `lib/types/scope.ts`, with all four dimensions in the type. `PackageScope`
  is `{ runId, scopeId }`.
- Migration 204, idempotent and guarded on the existence of
  `products.admin_area_2`: create `scopes`, seed per R21, add and backfill
  `products.scope_id`, set NOT NULL and the foreign key, drop `admin_area_2`.
  The base schema matches. The two data transforms that select `p.admin_area_2`
  read the area from the product's scope definition.
- Scope CRUD (db functions and routes) guarded per R25, with the delete guard,
  and a `scopes_updated` SSE event carrying the whole list. `InstanceState`
  gains `scopes` (id, label, definition, definitionHash, lastUpdated).
- §2.4 without the user check: the reads take `scopeId`, null included, and
  `RunReadContext` carries the resolved scope. `/mcp` passes null.
- §2.5 in full. A new block at the end of `transformFigureBlock` rewrites
  `scope: { adminArea2 }` to the new shape, computing the hash from the bundle's
  own area with the other dimensions unconstrained, so a figure that was fresh
  stays fresh and a stale one stays stale. The strict schema forces the
  transform.
- Client cache keys use the definition hash from T1, and each client cache name
  is bumped. `PO_CACHE_VERSION` is bumped.
- The named scope select replaces the area picker on the package-and-scope
  modal, the duplicate modal, Explore and the package page (with "Whole
  package"). The create dialog of R22. `scope_picker.tsx` is renamed to describe
  what it now is, an area picker, and is unused until step 4.

**Not in this step.** The time and data predicates (definitions may hold them,
and the view ignores them). The Scopes tab. Grants.

**Gates.** `./validate_migrations`, `./validate_fresh_boot`,
`./validate_migrations_replay`, `./validate_consolidation_replay`,
`./validate_queries` (the case axis becomes a scope definition). A committed
test proves the hash is stable across key order, list order and area case. A
committed test runs the figure transform over a legacy bundle whose area matches
the product and one whose area differs, and asserts fresh and stale
respectively.

**Ends with.** Several commits, each green: schema with migration and
transforms; server reads and routes with lib; client.

### Step 3: Time and data dimensions, and the unfilterable rule

**Surface.** `server/run_query/**`;
`server/server_only_funcs_presentation_objects/**` (period bounds only);
`server/routes/instance/run_generation.ts`;
`lib/api-routes/instance/run_generation.ts`;
`lib/types/run_authoring_context.ts`;
`client/src/state/instance/t2_run_authoring_context.ts` and its importers;
`client/src/components/products/copilot/**` (the scope line in the prompt);
`query_rig/**`; `PROTOCOL_APP_QUERY_RIG.md`; SYSTEM_08, 09, 13 prose.

**Deliverable.** `scopePredicateFor` implements the whole table in §2.3,
including R8 for geography. Values are escaped with `escapeSqlLiteral`. Period
bounds are clamped per R27 on both stamp readers. `getRunAuthoringContext` takes
`scopeId` and filters per R28, and its client cache key adds the definition
hash. `PO_CACHE_VERSION` is bumped, since a results object that was unfiltered
under an area scope is now empty under the same hash.

**Not in this step.** Any UI to author the new dimensions.

**Gates.** `./validate_queries` with new cases for each row of the §2.3 table on
each read kind (items, possible values, metric info, replicant options, raw
preview), and a mutation row per dimension in PROTOCOL_APP_QUERY_RIG. A fixture
with an HFA-shaped results object (`time_point`, `hfa_indicator`) and one with
`iceh_indicator`.

**Ends with.** One commit.

### Step 4: The Scopes tab

**Surface.** A new `client/src/components/scopes/**`;
`client/src/components/instance/instance.tsx`;
`client/src/onboarding/catalogue.ts`; the renamed area picker in
`client/src/components/_shared/`; SYSTEM_14 and SYSTEM_15 prose and globs.

**Deliverable.** §2.7's Scopes tab, gated per R25: a table of scopes and an
editor for label, geography (the area picker), years, HFA time points, modules
and the three indicator lists. A stored value that is absent from the offered
options renders as an annotated option and is kept, as the area picker does for
an orphaned area. The editor shows how many products carry the scope. The Do
session records in §8 where each option list comes from.

**Not in this step.** Grants.

**Gates.** The floor.

**Ends with.** One commit.

### Step 5: Grants and enforcement

**Surface.**

- Schema: `_main_database.sql`, `_main_database_types.ts`,
  `server/db/migrations/instance/205_user_scopes.sql`,
  `server/db/instance/rename_user_email.ts`.
- lib: `lib/types/instance.ts`, `lib/api-routes/instance/users.ts`,
  `lib/api-routes/route-utils.ts`.
- Server: `server/auth/global_user.ts`, `server/auth/product_access.ts`,
  `server/middleware/userPermission.ts`, `server/db/instance/users.ts`,
  `instance.ts` (the roster), `server/routes/instance/users.ts`,
  `server/run_query/run_read.ts`, `server/routes/instance/run_generation.ts`,
  `scopes.ts`, `instance-sse.ts`,
  `server/task_management/build_instance_state.ts`,
  `server/routes/instance/collab.ts`, `server/collab/**`,
  `server/mcp/context_cache.ts`.
- Client: `client/src/components/users/**`,
  `client/src/components/instance/instance.tsx`,
  `client/src/state/instance/{t1_store,t1_sse,product_access}.ts*`.
- Tests: `server/tests/**`.
- Docs: SYSTEM_01, 03, 08, 09, 12, 13, 15, 16 prose and globs.

**Deliverable.** §2.2's `all_scopes` and `user_scopes`, and §2.6 in full.
`productAccessPolicy` becomes async and looks up its targets' scopes, and
`requireProductAccess` also resolves a body `scopeId`. `getReadyRunReadContext`
and the authoring-context route take the user and apply §2.4. The SSE starting
payload and the `forwardable` closure filter by grant, and a `products_upserted`
row outside the connection's grants is rewritten as `products_deleted` for that
connection. Collab checks the product on subscribe. The roster row carries scope
access, and the user editor gets the Scopes card and its route. R26, R29 and the
tab gating.

**Not in this step.** R15's protections. Owner, edit and view levels.

**Gates.** A committed route test with one unrestricted and one restricted user
covering: product list, product detail, a data read inside a grant, a data read
outside a grant, a whole-package read, a scope set to an ungranted scope, a
collab subscribe to an ungranted product, and `/mcp`. A committed test that
feeds the SSE filter an upsert outside the grants and asserts the rewrite.
`./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Several commits, each green. The review deletes this file.

---

## 5. Gates catalogue

| Gate                                  | First reached |
| ------------------------------------- | ------------- |
| The floor                             | 1             |
| `./validate_queries`                  | 1             |
| `./validate_migrations`               | 2             |
| `./validate_fresh_boot`               | 2             |
| `./validate_migrations_replay`        | 2             |
| `./validate_consolidation_replay`     | 2             |
| Hash stability test                   | 2             |
| Figure transform fresh and stale test | 2             |
| Restricted-user route test            | 5             |
| SSE filter test                       | 5             |

---

## 6. Out of scope

- Protection against wider stored figures entering a narrower product (R15).
- A scoped projection of package metadata (R5).
- Scoped copies of packages (R6).
- Geography as a set of areas (R9).
- Owner, edit and view levels on products and folders. This plan gives
  `productAccessPolicy` its first real rule, and that rebuild adds levels to it.
- Restricting folders (R23).
- Explore, `/mcp` and the package page for restricted users (R13).
- Emitting `admin_area_2` on the admin-3 module outputs
  (`wb-fastr-modules/PLAN_ADMIN_AREA_2_ON_ADMIN3_OUTPUTS.md`). The child-column
  subquery keeps the duplicate-district-name caveat SYSTEM_08 records.

---

## 7. Rollout and rollback

Nothing ships until step 5's review passes, and not before
PLAN_PRODUCTS_RESTRUCTURE has finished its fleet deploy (its step 13), so
migrations 204 and 205 never ride the same deploy as 200 to 203. After that it
ships as one release through `./deploy_testing`, then `./deploy`.

Every existing user stays unrestricted and every existing product keeps its
data, with one visible change: a product on a single-area scope loses national
tables (R8).

Rollback is a restore of the main database from the pre-deploy backup plus the
previous image. Migration 204 drops `products.admin_area_2`, so there is no
in-place downgrade.

---

## 8. Build log

| Date | Step | Entry |
| ---- | ---- | ----- |
