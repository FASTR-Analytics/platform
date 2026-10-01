# FUTURE IDEA: Scopes as named entities, tied to packages and user accounts

> Status: idea under discussion (opened 2026-10-01). Nothing here is ruled.
> These are review notes against the code as of commit 58d2ddc5e, kept so the
> discussion can resume. When the higher-level questions below are settled this
> becomes a `PLAN_*` file and this file is deleted.

## The idea (Tim)

1. **Three dimensions.** A scope is geography (as today), time, and data (which
   indicators or modules). Collectively this is the "Scope".
2. **Scopes are admin-created entities** with a UUID and a label. Example:
   "Nutrition public" = national, 2021 to 2025, six nutrition indicators. Admins
   can create many.
3. **A product picks a results package and a scope** by the scope's label. The
   author never sets the dimensions individually.
4. **Users can be limited to one or more scopes.** A user limited to "Nutrition
   public" sees ONLY products that carry that scope.

## What exists today

- **Scope is a column, not an entity.** `products.admin_area_2` (NULL =
  national) in `server/db/instance/_main_database.sql`, typed as
  `PackageScope = { runId, adminArea2 }` in `lib/types/scope.ts`. SYSTEMS.md
  defines scope as a product's `(package, admin area 2)` pair.
- **The caller supplies the scope.** Every run-keyed read
  (`getRunPresentationObjectItems`, `getRunResultsValueInfo`,
  `getRunReplicantOptions`, `getRunResultsObjectItems`) takes
  `(runId, adminArea2)` from the request body
  (`lib/api-routes/instance/run_generation.ts`). `computeScopeFilters` in
  `server/run_query/run_read.ts` injects a filter per results object, decided at
  runtime from the manifest's column stamps: direct on `admin_area_2`, derived
  child values for `admin_area_3`/`admin_area_4`, unfiltered when the results
  object has no admin column, and a fail-closed sentinel when the scope cannot
  be applied.
- **It is explicitly not a security boundary.** SYSTEM_08 ("Admin Area 2 scope")
  and PLAN_PRODUCTS_RESTRUCTURE ruling D7: package data is an instance-level
  resource, and any approved user may read any ready package at any scope. D7
  also says data-level restriction, if ever wanted, is "a separate scope-based
  design on these read routes". SYSTEM_08 records user permissions keyed on the
  product's AA2 as a future direction that nothing precludes.
- **Product access is a stub.** `productAccessPolicy` in
  `server/auth/product_access.ts` returns `user.approved` for every level and
  every target. The route registry already declares `access: view | edit | own`
  per product route, and `requireProductAccess` resolves the target ids, so the
  insertion point for a real policy exists.
- **User permissions are six instance booleans** on the `users` row
  (`lib/types/permissions.ts`) plus `is_admin`. There is nothing per product or
  per scope.
- **The scope pair keys the caches.** Server Valkey keys are
  `runId | ... | scopeToken`, and the client version key carries the same pair.
  The pair is deliberately kept out of the figure config and the fetch hash.
- **Stored figures record the scope they were resolved under.**
  `FigureBundle.scope = { adminArea2 }` and `provenance.runId`
  (`lib/types/_figure_bundle.ts`), compared against the product's pair to show a
  stale badge.

## The central concern: view versus boundary

Points 1 to 3 keep scope as a view: a filter that shapes what a product shows.
Point 4 makes it a boundary: a restricted user must not be able to reach data
outside their scopes. That reverses D7 and the "not a security boundary" ruling.
Tim agrees this is the main concern (2026-10-01). How strict the boundary is
remains open (question 1).

The useful observation: making scope a server-side entity is what makes
enforcement cheap. Today the caller sends the dimensions, so there is nothing to
check them against. Once the caller sends only a `scopeId`, the check is "is
this id in the user's grants", applied once at the read context.

## Broad shape (recommended starting point, not ruled)

1. A `scopes` table (id, label, definition) and `products.scope_id`, replacing
   `products.admin_area_2`.
2. The run-keyed reads take `scopeId` in place of `adminArea2`. The server
   resolves the definition and, for a restricted user, checks the grant.
3. Time and data become two more injected filters beside the geography one,
   decided per results object from the manifest columns, as today.
4. Scopes stay independent of packages, as AA2 is now: a scope naming an area or
   indicator that a package lacks attaches fine and degrades to empty.
5. A user-to-scope grant table, read by `productAccessPolicy` and by the data
   read context.

## Issues found

### Time dimension

- Results objects carry one of three physical time columns (`period_id`,
  `quarter_id`, `year`) or none (`runPhysicalTimeColumnSchema`,
  `lib/types/run_manifest.ts`). HFA uses `time_point`, which is not a date. A
  scope's year range needs a rule for each case, including what happens to
  results objects with no time column (today's geography rule is "unfiltered").
- Non-Gregorian calendars: a year range must say which calendar it is in
  (calendar semantics are a cross-cutting audit in SYSTEMS.md §4.3).
- Relative period filters ("last 12 months") anchor on the maximum period. The
  items path re-anchors to the scoped subset (`getPeriodBoundsCore`), while the
  replicant-options path keeps the package-wide manifest stamp. SYSTEM_09 rules
  that gap fine for geography, on the measurement that no area lags the package
  maximum. A time bound breaks that premise by construction.

### Data dimension

- "Modules", "metrics" and "indicators" hit different layers. A module or metric
  list filters the authoring context (metrics, presets) and rejects reads of
  anything outside it. An indicator list is a row filter, and works only where
  the results object has an indicator column.
- Not yet checked: how many results objects carry an indicator column, and what
  identifies an indicator in the HFA and ICEH families. The "six nutrition
  indicators" example implies indicator level, which is the hardest of the
  three.
- The authoring context (`getRunAuthoringContext`) is cached on the client by
  `runId` alone, on the grounds that it never changes for a run. A scope that
  hides metrics makes it vary by scope too.

### Geography dimension

- `computeScopeFilters` already passes a list of values, so a set of areas is
  possible in the read layer. The roll-up labels (`getRollupRowLabel`) and
  `scopeLevel` in `lib/explore_grid_query.ts` assume national or exactly one
  area.
- The existing latent stays: derived child-area matching is by district name, so
  duplicate district names across regions would fold together.

### Scope as an editable entity

- If a scope's definition can change after products attach, every attached
  product changes with it. The cache token and the figure staleness check then
  need a hash of the definition, not only the scope id. A hash also lets two
  scopes with identical definitions share cache entries.
- `FigureBundle.scope` changes shape (stored JSON). That triggers the lockstep
  rules in CLAUDE.md: a transform block with a forced skip-gate, a cache-prefix
  bump (`PO_CACHE_VERSION`), and the stored-FigureInputs sweep.
- Id scheme: the idea says UUID. The repo's product and folder ids are short
  nanoids from `server/utils/id_generation.ts`, and S2 owns the id-scheme rules.

### Stored figures hold frozen data

A `FigureBundle` stores its data rows (`items`) inside the product. After a
product moves to a narrower scope, the wider data stays until each figure is
re-resolved. That is harmless for a view and a leak for a boundary. The same
applies to version-history snapshots and to exports made from stored bundles.

### Fan-out and side doors (matter only if scope is a boundary)

- The instance SSE channel sends every `ProductSummary`, every folder and the
  ready-package labels to every approved connection
  (`server/task_management/build_instance_state.ts`). It would need filtering
  per connection.
- The Explore tab and the package page use the free `ScopePicker` and read at
  any scope the user chooses.
- The copilot reads through the product's scope, but the proxy guard is
  `requireApprovedUser()` and nothing finer.
- `/mcp` is hard-coded to national scope on the pinned package
  (`server/mcp/env.ts`).
- Collab socket admission is origin plus Clerk plus approved. `RoomConn.canEdit`
  is the per-product slot.
- Duplicate, `copySlidesToSlideDeck` and version restore move stored figures
  between products, and so between scopes.
- Package internals (scripts, logs, raw downloads) sit behind `can_view_data`
  and show the package as-is. A restricted user would simply not get that bit.
- Structure and geojson reads sit behind the zero-permission guard, so area
  names are visible to any signed-in user.
- Folders: a restricted user's tree either shows every folder or is pruned to
  folders that contain a visible product.

### Migration

- Existing products need scopes synthesised: one national scope plus one per
  distinct `products.admin_area_2` in use, then `scope_id` backfilled and the
  old column dropped.
- Existing users need a starting grant state that keeps today's access.

### Sequencing

- PLAN_PRODUCTS_RESTRUCTURE is still open at its rollout steps (11 to 14), with
  migrations 200 to 202 not yet through the fleet. This work changes the same
  tables and should follow it.
- That plan lists "the permission system rebuild (owner, edit and view on
  products and folders)" as a later plan. Scope grants would be the first real
  `productAccessPolicy`. The two are separate axes (which products a user can
  reach, and what they can do to them) and need to be ordered or designed
  together.
- A possible phasing: (1) scope entity and `scope_id`, geography only, which is
  a refactor with a migration; (2) time and data filters in the read layer; (3)
  the admin screen; (4) user grants and enforcement.

## Open questions

1. **How strict is the boundary?** Either restricted users simply do not see
   other products while the data routes stay open to anyone calling the API
   directly, or the data routes enforce grants too. Recommendation: enforce,
   since the `scopeId` change makes the check cheap.
2. **What is the "data" dimension?** Modules, metrics, indicators, or a mix.
3. **Are scopes editable after products attach?** Recommendation: yes, with a
   definition hash driving caches and staleness.
4. **Does geography stay national-or-one-AA2, or become a set of areas?**
5. **What does a user with no grants see?** Recommendation: an explicit "all
   scopes" flag on the user, not "no rows means everything", so removing the
   last grant does not open access.
6. **What can a restricted user do?** Create and edit products within their
   scopes or view only, and whether they get Explore, the copilot and `/mcp` at
   all.
7. **What happens to stored figures on a rescope under a boundary?** Force
   re-resolution, block the rescope, or accept the frozen data.
8. **How do results objects with no matching column behave?** Today's geography
   rule shows them unfiltered. Under a boundary, unfiltered may need to become
   hidden for the time and data dimensions.
9. **Do unrestricted users still need ad hoc scopes in Explore**, or do they
   also pick from the named list (with a seeded "National, all data" scope)?
10. **Ordering against the owner/edit/view permission rebuild.**
