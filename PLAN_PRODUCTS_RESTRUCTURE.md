# PLAN: Products restructure, second pass

Dissolve projects. Products are slide decks and reports, kept in nested
folders, each attached to one results package at one scope. One main
database, one realtime channel, one copilot. An Explore tab replaces the
project Metrics tab and the standalone visualization library; this plan
creates the tab, and its page, the results explorer, is a later plan.

**Next step: Review 3.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 10's review passes the
file is deleted instead of advanced.

All work is on `version2`. A first attempt, preserved as
`version2-reference`, is a worked example read through `git show` and never
a source of commits (§0). It deleted first and gated last, and paid for
both; this plan does the reverse.

---

## 0. How to work this plan

The whole instruction to a fresh agent is: **"Do the next step of
PLAN_PRODUCTS_RESTRUCTURE.md."** Everything else is here.

A session does exactly one thing, named by the **Next step** line at the
top of this file: `Do N` builds step N; `Review N` reviews it; `Fix N`
builds the work list a review left. Steps alternate Do, Review, and the
line moves on only when a review passes. A session never does two of these.

**Session start.** The branch is `version2`; confirm it with `git branch
--show-current` and confirm `git status` is clean (sessions are serial; a
dirty tree means another session did not finish, so stop and say so). Never
create a branch; commit to `version2`. Every session ends with a closing row
in §9 (`Step N built`, `Step N reviewed: pass` or `Step N reviewed: N
findings`, `Step N fixed`); if the **Next step** line and the last closing
row disagree, stop and say so. `version2-reference` is read only
through `git show version2-reference:<path>`; never check it out, merge it
or cherry-pick from it. Then read, in this order: `CLAUDE.md`, `SYSTEMS.md`,
the SYSTEM file for each area the step names, §1 and §2 of this plan, §3 for
the target shape, the step's own section in §4, and §9. Nothing else in this
plan is required reading for a step.

**A Do session** builds the step as its §4 section says, within its Surface,
and ends when the step's gates and the §0 floor are green, §9 has the rows
the step produced plus its closing row, the **Next step** line says `Review
N`, and the last commit is made. Then it stops.

**A Review session** is a fresh agent that did not write the code. It lists
the step's commits (`git log` from the commit that last set the **Next
step** line to `Do N` or `Fix N`) and checks four things. Nothing outside
the step's Surface changed (`git diff --stat` against the surface list;
every file outside it is a finding). Every item in the step's Deliverable is
present in the code, established by reading the code, never the commit
message or the log. Every gate in the step's Gates and the §0 floor passes
when the reviewer runs it; a gate the reviewer cannot run from a file in
the repo or a command in this plan is itself a finding. §9 has the rows the
step should have produced (deviations, facts found wrong, defects found by
running the app). Each finding is one row in §9 with the file and line,
followed by the closing row. The review ends with the **Next step** line set
to `Do N+1` if there are no findings that change code, or `Fix N` if there
are. After step 10's review passes, the reviewer deletes this file in its
last commit instead of setting the line. Then it stops.

**A Fix session** is a Do session whose work list is the review's findings
in §9 and nothing else. It ends with its closing row and the line set to
`Review N`.

**Every session edits exactly two things in this file:** the **Next step**
line and §9. It never rewrites a ruling, a step section or a fact, even one
it has shown to be wrong; it records the disagreement in §9, and the code
wins. The edit to this file rides the session's last commit, so the tree and
the plan always agree. If a session cannot finish, it leaves the tree green
at the last good commit, records in §9 exactly what is done and what is not,
leaves the **Next step** line unchanged, and says so. The deletion of this
file after step 10's review is the one exception to the two-things rule.

Rules that bind every step:

- **The step ends green and booting.** `deno task typecheck`, `deno task
  test`, `./validate_protocols`, and `./run` starting against the dev
  database are the floor. A step that touches migrations also passes
  `./validate_migrations`; one that touches the query engine also passes
  `./validate_queries`. The step's own gates in §4 come on top. Every gate
  is something the reviewer can run: a script in the repo, a `deno task`,
  or a harness file the Do session committed (under `server/tests/` or as a
  named root-level `validate_*` file), never a one-off the doer ran and
  described. Where a step's Gates say "a harness", the harness is a
  committed file.
- **Touch only the surface the step names.** A typecheck error outside that
  surface is reported, not fixed. A rename, a cleanup, or a deletion that the
  step does not list waits for the step that does. The first attempt
  produced 102-file commits this way.
- **The reference is read, never cherry-picked.** Each step names the
  reference commits and final-state files that show one worked answer. Read
  them with `git show version2-reference:<path>`. Re-derive against
  `version2`: the reference sits on a tree three weeks behind this one, and
  `server/runs`, `server/run_query`, `lib/types` and `server/db` have all
  changed since. Where the reference and this plan disagree, this plan
  wins; where this plan and the code disagree, the code wins and the build
  log records it.
- **Docs move with the code.** `lint:systems` fails the typecheck when a file
  is not claimed by exactly one SYSTEM manifest, so globs change in the step
  that moves the file. Prose in the SYSTEM file for a changed contract is
  rewritten in the same step, not deferred to step 10.
- **Append to the build log (§9) before committing.** Every deviation from
  §2 or §3, every fact the step found wrong in this plan, and every defect
  found by running the app goes in the log with the step number and the
  reason. The next agent reads the log first.
- **One thing per session.** Commit with a message that says why. Where a
  step says "several commits", each one is green on its own.
- **Do not ship.** `./deploy_testing` ships the working tree; only steps 1
  and 2 are safe to deploy on their own, and the runbook in §6 says when.

Vocabulary: **product** = a slide deck or a report; **folder** = a node in
the products tree (folders nest through `parent_id`; the root is `NULL`);
**package** = results package (`runs` row plus run dir; "run" stays the
internal name); **pin** = the instance's pinned package; **scope** = the
product's `admin_area_2` (`NULL` = national); **PackageScope** = the
client-side pair `{ runId, adminArea2 }` a product carries; **figure** = a
`{ metricId, config }` rendered inside a product and stored as a
`FigureBundle`; **preset** = a default visualization derived from a package's
manifest (`deriveDefaultVisualizationsForModule`); **authoring context** =
what an author needs from a package to build figures (metrics, modules,
indicators, taxonomy, presets), a pure function of the run dir; **product
explorer** = the Products page (D16, step 7b); **results explorer** = the
page the Explore tab will hold (D6), built by a later plan.

**Naming rule for the slide-deck type (Tim, 2026-09-08).** The identifier
stem is `slide_deck` / `SlideDeck` / `slide-deck` in every name that
denotes the type, its tables, its columns, its row and lib types, its DB
functions and its route paths: `slide_decks`, `slide_deck_versions`,
`slides.slide_deck_id`, `slide_deck_versions.slide_deck_id`,
`slide_deck_versions.slide_deck_config`, `DBSlideDeckVersion`,
`SlideDeckVersionSummary`, `insertSlideDeckVersion`,
`/products/:product_id/slide-deck/...`, `copySlidesToSlideDeck`. The bare
word "deck" is for prose and UI copy only ("New deck", "Copy to deck…"),
never a schema or code identifier, and `deckId` / `deckConfig` local
shorthand is not carried into new code. Existing `Deck*` identifiers in live
project code (`lib/types/versions.ts`, `server/db/project/versions.ts`,
the client) are renamed in the step that rebuilds them on the new tables,
never earlier. The legacy project-DB `deck_versions` (`deck_id`,
`deck_config`) keeps its name until 9b deletes it; the step 2 planner maps
those columns onto `slide_deck_versions`.

---

## 1. Boundary: the product plane and the package read side

SYSTEM_08 describes three planes: the instance plane (data in), the results
plane (generation into an immutable package) and the project plane (what
people build from a package). This plan replaces the project plane with
products and touches the results plane only on its read and attach side.

**Untouched. No step names a file in any of these areas:** dataset
ingestion (HMIS, HFA and ICEH
wizards, staging and import workers, import runs, scheduled imports), the
DHIS2 connector, the structure, facilities, indicators, population and
geojson tables and routes, the instance Data tab, the package format
(manifest, run dir, parquet, R execution, finalize) and the runs volume, the
generation pipeline's inputs capture and execution, the `/mcp` door and its
tools, the headless allowlist.

**Touched outside the product plane, each because a project reference lives
there, and each limited to removing that reference:**

- Results-plane seam: the wizard's launch-time attach-to-projects feature
  (`attachTargetProjectIds` in `generate_run/{launch,pipeline,types}.ts` and
  `build_run_package.ts`, its launch concurrency guard, `publishReadyRun`'s
  repoint, the wizard client's attach-target step and confirm copy) is
  deleted (D5). The catalogue's "in use by", the delete guard, and the new
  package-prune UI (`instance_results_packages/_prune*.ts*`, which reads
  `run.attachedProjects`) count products instead. `runs.summary`'s two
  project keys are stripped by a JSON transform (the catalogue row, never the
  package). `prepare_inputs.ts` and `pipeline.ts` change import paths only,
  because the input-capture helpers move out of `server/db/project/` (§3.10).
- Package read side: run-keyed figure-data reads gain a scope parameter and
  an authoring-context route (D7).
- Instance-level tables, only where a project column or FK exists: `users`
  loses the 17 `default_project_*` columns and `can_create_projects`;
  `user_logs`, `ai_usage_logs` and `user_logs_aggregate` lose `project_id`;
  `dashboard_slugs` is dropped; `instance_config` gains `ai_context`.
- Instance ops surfaces that were project features: health `/projects`,
  `/project_activity` and the `projects` field of `/health_check`; the
  per-project backup and restore routes; the project purge cron and the two
  project disk gates; the rename-email per-project sweep; the instance SSE
  channel carries product lists (transport only); the public `/api/d/:slug`
  mount and `routes/public/dashboard.ts`.
- Access control: one new guard, `requireApprovedUser()`, for the
  figure-data, copilot and collab surface, and one declared-access
  middleware, `requireProductAccess`, for every product and folder route,
  whose policy today grants everything to an approved user.
  `requireGlobalPermission()` and every existing instance route keep their
  exact semantics (D2).

---

## 2. The rulings (ruled; overrule here, not later)

**D1: Storage. One main DB, a `products` registry, per-type detail tables,
nested folders.** Per-project Postgres databases are deleted. Main gets
`folders` (with a nullable `parent_id` self-reference: an adjacency list, no
stored path, no depth cap, acyclic by server enforcement), `products` (id,
type in {slide_deck, report}, label, folder_id, run_id NOT NULL,
admin_area_2, created_by, created_at, last_updated), and per-type detail
tables keyed by the same id with `ON DELETE CASCADE` (`slide_decks` plus
`slides` plus `slide_deck_versions`; `reports` plus `report_versions`). Each
detail table carries a fixed `type` column and a composite FK `(id, type)
REFERENCES products(id, type)`, so a row can exist only in the detail table
its registry type names (Tim's ruling, 2026-09-08). Existence of the detail
row is not schema-enforced; it is the one-transaction rule on every writer
that creates a product (`createProduct`, `duplicateProduct`, the two
`copy*Version` routes, 085). Rejected:
two independent tables each carrying folder, run and scope (every cross-type
operation becomes a UNION); a hidden "workspace" project DB; flat folders
(the first attempt ruled flat, built nested a day later, and the nested model
is what its docs describe).

**D2: Permissions. Permissive. No new design.** The permission system is
rebuilt later; this plan designs nothing. The project tier dies with
projects (17 flags, 17 `default_project_*` mirrors, `project_user_roles`,
`role`, `is_locked`, `is_central_reporting`, the permission-preset sets, 6
forms, 8 routes,
`resolveProjectUserAccess`, per-family collab flags, around 20 client
`canEdit` gates). The approved-user surface (figure-data reads, the
authoring context, the ready-package list, the Explore tab, the
copilot `/ai` and `/ai/files` mounts, the collab socket, the products filter
on the instance SSE) is guarded by **`requireApprovedUser()`**: signed in
AND `globalUser.approved` (server `approved` = `_OPEN_ACCESS || !!usersRow`
in `project_auth.ts`; today the zero-perm `requireGlobalPermission()` never
checks `approved`, and the project path was the only place approval was
enforced). **Every product and folder route declares its access level**
(`access: "view" | "edit" | "own"` on the registry entry) and is guarded by
one middleware, **`requireProductAccess`**, which reads the declaration and
the route's target ids and asks one policy function,
`productAccessPolicy(user, level, targets)`. Today that policy returns true
for any approved user at every level, so the behaviour is the same as
`requireApprovedUser()`. The point is the shape: the future permission
system replaces the policy function and gains the per-route access
inventory for free, instead of rediscovering it across forty handlers.
Nothing else changes: the six instance
flags (`can_configure_users`, `can_view_users`, `can_view_logs`,
`can_configure_settings`, `can_configure_data`, `can_view_data`;
`can_create_projects` dropped) keep guarding exactly the surfaces they guard
today; package internals (`getRunDetail`, script, logs and files viewers, the
`/:run_id/outputs/*` mount, the catalogue, generation, pin) keep
`can_view_data` / `can_configure_data`; the `/mcp` door keeps its
`can_view_data` check in `server/mcp/context_cache.ts`, and the comment
above that check, which today says the run-keyed routes enforce
`can_view_data`, is rewritten to say that this check is now the only place
it is enforced. Every approved user is a full editor of every product and
folder. `products.created_by` and `folders.created_by` are recorded as
provenance only: they are NOT ownership, and the later owner role comes
from an ACL table, never from these columns (migrated rows have them NULL).
`RoomConn.canEdit` plumbing is kept (TRUE) so a later model slots in per
subscribe. Consequences accepted and named (the D13 dry-run reports
them per instance so the blast radius is known before deploy): former
project viewers become editors; `is_central_reporting` projects, hidden from
non-H users today, become ordinary visible folders unless emptied by hand
before rollout (D11); `sendSlideDeckEmail`'s recipient roster becomes the
instance roster. Doctrine for SYSTEM_01: the product id in the path IS the
authority; a future permission scheme must be a product-aware guard, never
per-handler checks.

**D3: A visualization is a figure inside a product. There are no
visualization products and no dashboards.** A figure is `{ metricId, config }`
resolved under its product's PackageScope through the one metric-keyed
resolver (`resolveBundleFromMetricAndConfig(scope, metric, config)`) and
stored as a `FigureBundle`. It is authored from the product's own run's
presets (the default visualizations `deriveDefaultVisualizationsForModule`
derives from the manifest) or from scratch via the metric wizard
(`add_visualization/` steps metric, preset, configure), and edited in place
with the embedded `VisualizationEditor`. Editing in place is already how
every container works (in-slide figure co-editing binds to the slide doc,
never to a PO room). Deleted: the standalone visualization product (rows, list, cards,
folders, settings, duplicate, save-as-new, `create_slide_from_visualization`,
the "pick a visualization" pickers, both from-visualization resolvers, PO
collab rooms and the `po_*` wire protocol, PO presence, the
`editing_visualization` view and its tools, `DraftVisualizationPreview`, the
PO detail route and cache), and dashboards whole (tables, `dashboard_slugs`,
`/api/d/:slug`, `public_viewer/`, `components/dashboards/`, replicant-group
resolution, the three dashboard exports, the slug backfill). **Existing
custom visualizations and dashboards fleet-wide are deleted by the
consolidation, not converted (Tim's ruling).** Consequences named: there is
no figure library (reuse = `duplicateSlides` within a deck, deck duplicate,
and the new `copySlidesToSlideDeck`, §3.3); there is no unauthenticated surface
left (dashboards were the only public URL; a deck reaches recipients as an
emailed PDF, and a report is downloaded by the signed-in user; a public deck
link is a later, far smaller feature if wanted); the
results explorer (D6, a later plan) will be the only standalone place to
look at a chart, and until it lands there is none.
`PresentationObjectConfig` stays the figure-config type name (renaming the PO
vocabulary is a separate refactor, §8).

**D4: Run and scope are captured into the FigureBundle. Staleness is per
figure.** `figureBundleSchema` gains `scope: { adminArea2: string | null }`
and `provenance.runId: string`. A figure is stale when
`bundle.provenance.runId !== product.runId || bundle.scope.adminArea2 !==
product.adminArea2`. A stale figure shows an "Update to [package label]"
button (slide figure blocks, report figure embeds; the deck and report
headers get "Update all figures" with a count). Pressing it re-resolves
`{ metricId, config }` under the product's current pair through the
product-run's authoring context. A failure shows the reason on that figure
(`figurePackageIssueFor`: metric absent, then metric unavailable, then
requested disaggregation missing; manifest-only, in `lib/`) and leaves the
old bundle in place. A stored replicant value missing under the new run is
auto-defaulted (today's non-strict rule), never a throw. Reattach and scope
change never block and have no pre-flight:
`buildResultsPackageCompatibilityReport` and
`results_package_compatibility_modal.tsx` are deleted. Mixed-package products
are a visible, intentional state. `getRollupRowLabel` reads `bundle.scope`,
never a global store (the first attempt's first behavioural defect: an
export of an AA2 product's figure labelled its roll-up row "National"). The
consolidation stamps both fields from the owning project row into every
figure block in the live tables (slides, reports) AND the version snapshots
(`report_versions.figures`, `slide_deck_versions.slides[].config`); the restore
paths parse snapshots with the strict schema, so a missing key is the
intended fail-loud once the consolidation has run. Scope stays OUT of the
figure config and the fetch hash (the S9/S10 rule). **Sequencing (new in
this pass):** the two fields are added to the schema as optional in step 4
and captured on every write from then on; step 9b's consolidation stamps
every stored bundle and flips both to required in the same commit. Between
those steps the stale predicate treats a missing field as "not stale".

**D5: Run pointer per product. `run_id NOT NULL`, no follow.** A product is
attached to exactly one package; `follow_pinned` is deleted as a concept
(this overrules the SYSTEM_08 follower model for products: pin-move touches
no product row; `listFollowPinnedProjects`, `clearFollowPinnedIfNotPin`,
`setProjectFollowPinnedAndAlign`, the follower loop, `supersededMidway`,
`skippedLocked` and the follow toggle all die). The pin serves exactly three
things: the `/mcp` door; the results explorer's default package (D6); and the
default `run_id` for a new product, resolved server-side inside the insert
from `runs WHERE pinned AND status = 'ready'`. Creating a product therefore
requires a ready pin. With zero ready packages the UI says "An admin must
generate a results package", with a link to Results for users holding
`can_configure_data`. The Q2 to Q3
workflow: duplicate the product (clones `(run_id, admin_area_2)` verbatim),
reattach the duplicate in product settings, update figures one by one or all
(D4). Wizard launch-time attach targets are deleted: a generation produces a
package; products point at it afterwards. Delete guard, catalogue "in use
by" and the prune UI count `products.run_id` by type. Consolidation: decks
and reports of a project whose `run_id IS NULL` are attached to the
instance's pin (their bundles still render; badges show stale); an instance
with such projects and no pin is a dry-run FAIL (pin one first).

**D6: Explore tab. This plan creates the tab; the results explorer is a
later plan.** A new instance tab **Explore** (`components/explore/`,
approved users) is added by step 6 as an empty page: the shell entry and
the guard, so the tab set in D17 is settled. The page it will hold, the
results explorer, renders the metric and preset gallery for an ephemeral
`(package, scope)` with the pin preselected and national scope, has a
"Configure" action and an "Add to deck / report…" action, and is where
approved users browse metrics and their definitions once the project
Metrics tab goes (the Metrics tab was `can_view_metrics`; the Results tab
is `can_configure_data`-only). That page, with `add_to_product_modal.tsx`,
the `exploreRunId` / `exploreAdminArea2` state, the copilot's
`viewing_explore` view and its tour, is a separate plan (§8) and nothing
in this plan builds it. `metric_details_modal.tsx` stays with the project
Metrics tab and is deleted with it in 9a; the later plan recovers it from
the pre-9a tree. What this plan does build, because the editors need it
(7a): the `add_visualization/` module sidebar, metric cards and preset
preview move to `components/figures/insert_figure/**`, fed by an authoring
context, and the scope-keyed T2 figure caches. Presets are not products: no
rows, no detail read; they render through the run-keyed items read with
their own config. The virtual-defaults half of
`getAllPresentationObjectsWithVirtualDefaults` and `findVirtualDefault`
(`server/run_query/virtual_defaults.ts`) die; `deriveVirtualDefaults(manifest)`
serves `getRunAuthoringContext.presets`. Consequence accepted (Tim,
2026-09-08): from 9a until the results explorer lands, metrics and presets
are browsed only inside an editor's insert-figure wizard.

**D7: Data reads. One run-keyed mount; the caller supplies `(runId,
adminArea2)`.** Delete the project lens (`getRunReadContext(mainDb,
projectId)` and its callers, `routes/project/{presentation_objects data half,
modules}.ts`, `getCacheStatus`). Extend `getRunPresentationObjectItems` and
`getRunResultsValueInfo` with nullable `adminArea2`; add
`getRunReplicantOptions`, `getRunResultsObjectItems`, and
**`getRunAuthoringContext(run_id)`** returning `{ modules, metrics
(MetricWithStatus = ResultsValue & status), datasets, commonIndicators,
icehIndicators, hfaTaxonomy (without time points; those are instance T1),
presets }`. This is the same manifest projection `getProjectDetail` builds
today in `db/project/projects.ts`. It is derived from the run dir alone, so
its value never changes for a given `runId` and the client caches it by that
id without revalidating. Guard `requireApprovedUser()`; the data reads
additionally require `runs.status = 'ready'`. This makes package data an
instance-level resource: any approved user can read any ready package at
any scope. A later view permission on a product governs the document, not
the numbers behind it; data-level restriction, if ever wanted, is a
separate scope-based design on these read routes. `adminArea2` is
shape-validated and `escapeSqlString`'d exactly as today. Valkey keys keep
`runId` as the leading uniqueness segment (the `delete_run.ts` prefix sweep)
and `scopeToken` trailing, so `PO_CACHE_VERSION` needs no bump. The headless
allowlist stays byte-identical (nullable field; `/mcp` keeps national). There
is no PO detail route: the only per-id detail reads are `getSlideDeckDetail`,
`getSlide` and `getReportDetail`.

**D8: Realtime. One instance SSE channel, one instance collab socket.** The
project channel (`project-sse-v2.ts`, `notify_project_v2.ts`,
`build_project_state.ts`, `project_last_updated.ts`, `lib/types/project_sse.ts`,
client `state/project/t1_*`) is deleted. `InstanceState` gains `products:
ProductSummary[]`, `folders: Folder[]`, `readyPackages: { id, label, createdAt
}[]` (ready-package labels are approved-user data: a deliberate revision of
SYSTEM_03's Q-B "run labels must not fan out", which narrows Q-B to
generation telemetry only) and `lastUpdated: { products, slides }`; all
withheld from unapproved connections by the existing roster rule.
`products_upserted { products }` is the only product-list message (per
row); `products_deleted { ids }`; `folders_updated` whole-list;
`last_updated` is emitted for `slides` only; `starting` carries the full
lists. When `currentUserApproved` goes from false to true, the client calls
`reconnectForApproval()`, which disconnects and reconnects the instance SSE
and connects collab; `deleteUser` calls `closeConnectionsForEmail`. The
run-derived
catalog leaves SSE (`run_attached`, `admin_area_2_changed`,
`project_config_updated` die) for the immutable T2
`getRunAuthoringContext(runId)`. Collab: `GET /collab` (was
`/project_collab/:project_id`), auth = origin plus Clerk plus approved; the
subscribe message carries the product id and rooms are keyed
`productId::docType::docId` for `slide` and `report` only (`po_rooms.ts`
and the `po_*` messages deleted), so a per-subscribe permission check has
its subject without a lookup; presence keyed by product; the project-level
page-awareness relay, list-page cursors and card presence avatars are
dropped. The server-cli nginx template becomes path-agnostic and is emitted
fleet-wide before the deploy. `runVersionKey` becomes cache params `(runId,
scopeToken)`; `pdsNotRequired`, `pds_not_ready` and
`responseRunVersionMatches` die; the server `_PO_DETAIL_CACHE` is deleted;
the three run-keyed Valkey caches are untouched; client IndexedDB cache names
are kept (the deploy flush clears every non-AI key on version change).
Per-browser AI residue (`ai-conv*` scoped by old project ids,
`ai-documents/<projectId>`, `panther-ai-settings-{projectId}`, old
`projectTab` and sort localStorage keys) is accepted, not migrated.

**D9: Migration mechanism. Tracked, ordered, transactional, and numbered
after what has shipped.** `server/db/migrations/runner.ts` gains `.ts`
migration support beside `.sql`. The rules: a literal-keyed static import
map, so `deno check main.ts` covers every migration module; id = filename
minus extension; `.sql` and `.ts` sorted together; the same
`schema_migrations` row and the same one-transaction rule. A `.ts` migration
throws and never exits, so the runner's rollback and fail-stop stays the
single funnel. Every main-DB statement in a `.ts` migration, and in every
helper it calls, goes through the migration `tx`. Source project pools are
opened fresh and read-only (`getPgConnection(uuid, {max: 2})`, `.end()` in
`finally`, the `rename_user_email.ts` precedent) after a `pg_database`
existence check through `tx`. `validate_migrations` globs `*.sql` and
ignores `.ts` files by construction. Instance migrations 079 to 083 are
shipped, so the numbers below assume 084 is the next free one when step 1
lands; if another migration lands first, take the next free number and
record it in §9.

- `084_products.sql` (step 1): the §3.1 DDL in `CREATE ... IF NOT EXISTS`
  form, additive, including `folders.parent_id`. Nothing reads these tables
  until step 5. Safe to ship on its own.
- `000_legacy_project_shell.sql` (authored in step 2, activated in 9b):
  `CREATE TABLE IF NOT EXISTS` for `projects` (the full pre-restructure DDL;
  085 SELECTs these columns and runs on a fresh DB too) and
  `project_user_roles` (plus its two indexes), PLUS `ALTER TABLE ... ADD
  COLUMN IF NOT EXISTS project_id text` on `user_logs`, `ai_usage_logs`,
  `user_logs_aggregate` (no FK). The base no longer has those columns, but
  migrations 016 and 035 create indexes over `project_id`; when their
  `CREATE TABLE IF NOT EXISTS` does nothing on an existing table, Postgres
  still resolves the index expression, so the column must be present
  (verified, Appendix A).
- **`085_consolidate_projects.ts`** (authored in step 2, activated in 9b).
  For each `main.projects` row with `status = 'ready'` (skip `copying`; skip
  rows whose DB is absent; D11 for `pending_deletion`) it does the following,
  in one main transaction:
  1. Assert the source `schema_migrations` holds the latest project
     migration id, today **`041_drop_frozen_results_plane`**, else throw
     ("boot the previous release first").
  2. Copy `slide_decks`, `slides`, `deck_versions` (into
     `slide_deck_versions`), `reports` and `report_versions`, stamping `run_id` (the project's, else the pin; D5)
     and `admin_area_2` from the project row.
  3. Create folders per D10.
  4. Leave `created_by` and `created_at` NULL on the products and on the
     folders item 3 creates (no invented provenance).
  5. Concatenate `ai_context` into `instance_config.ai_context` under
     `## <label>` headings (D15).
  6. **Check every inserted primary key for collision** (`products`,
     `slides`, `report_versions`, `slide_deck_versions`; WITH-TEMPLATE copies carry
     byte-identical ids, uuids included). Re-mint on collision and rewrite
     the full reference surface: `slides.slide_deck_id`,
     `slide_deck_versions.slide_deck_id` plus `slides[].id` plus the `slide_editors`
     keys JSON, `report_versions.report_id`, `*.restored_from_version_id`.
  7. Stamp `bundle.scope` and `provenance.runId` into every figure block in
     the live tables AND the version tables (D4).

  `presentation_objects`, `visualization_folders`, `dashboards`,
  `dashboard_items` and `dashboard_item_groups` are not read. They are
  deleted with the project DBs; the dry-run reports their counts before the
  deploy, so the loss is quantified in advance.
- `086_drop_project_layer.sql` (authored in step 2, activated in 9b): never
  `DELETE FROM projects` (its
  `ON DELETE CASCADE` children would wipe the logs); `DROP COLUMN IF EXISTS
  project_id` on the three log tables; rebuild `idx_user_logs_aggregate_unique`
  byte-identically without the COALESCE term after a guarded DO-block merges
  aggregate rows that differ only by `project_id`; then `DROP TABLE IF EXISTS
  dashboard_slugs, project_user_roles, projects` without CASCADE; `DROP COLUMN
  IF EXISTS users.default_project_*` times 17 and `users.can_create_projects`.
  Verbatim text in Appendix A.

The surviving product JSON transforms (`slide_deck_config`, `slide_config`,
`reports`, plus the shared `_figure_block`) then run once on main as
`INSTANCE_DATA_TRANSFORMS` on the same boot (signature `(tx, countryIso3)`;
they bump `products.last_updated` through the join). `po_config`,
`dashboard_config` and `dashboard_items` transforms are deleted, not moved.
Old project databases are left in place (rollback path) and dropped later by
an ops script (D12). Rejected: a temporary `db_startup` step; dblink-in-SQL;
guarding the old migrations.

**D10: Folders on migration. One per project, with legacy sub-folders as
children.** Products of project P with no sub-folder go into a root folder
"P"; products in P's deck or report sub-folder F go into a child folder "F"
under "P". Same-label deck and report sub-folders of one project merge into
one child (lossless). Rejected: dropping the sub-folders; a data-conditional
"single-project instances get no folder" rule; the first attempt's flat
"P / F" label concatenation, which nesting makes unnecessary.

**D11: `pending_deletion` projects are not migrated; central-reporting
projects are migrated as ordinary folders.** The dry-run (D13) lists both
classes per instance; the runbook step before rollout is "restore any
pending-deletion project that must survive; delete or empty any
central-reporting project that must not become visible to every approved
user". Products themselves have hard delete, no trash, with a
confirm-by-count on the batch action and the daily named main-DB dump as the
recovery path (a products trash is §8).

**D12: Delete, don't port.** Everything below is deleted, in the step named,
never rewritten. The list was re-verified against `version2` on 2026-09-08;
items the first attempt listed that are already gone (`backfill_runs.ts`,
`validate_results_runs_parity.ts`, `validate_figure_bundle_backfill.ts`, the
three `rollout_*` scripts, `synthesize_run.ts`, the pg read plane
`results_value_resolver.ts` / `metric_enricher.ts` /
`get_indicator_metadata.ts`, `calculated_indicators_snapshot.ts`) are not
repeated here.

- *Step 7a (the switch):* `server/db/project/{slide_decks,slides,reports,
  versions,move_slides,slide_deck_folders,report_folders}.ts` and their
  `lib/api-routes/project/*` registries and `server/routes/project/*`
  handlers (`server/db/project/mod.ts` pruned to match); the slide and
  report room handling inside `server/routes/project/project-collab.ts` (the
  file itself, with its PO rooms, goes in 9b); `lib/api-routes/project/
  emails.ts` and `server/routes/project/emails.ts` (moved to `instance/`);
  the client `components/project/{project_decks,project_reports,add_deck,
  add_report,duplicate_deck_modal,duplicate_report_modal,
  edit_deck_folder_modal,edit_report_folder_modal,move_deck_to_folder_modal,
  move_report_to_folder_modal,move_to_folder_modal,edit_folder_modal}.tsx`;
  `state/project/{t2_slide_decks,t2_slides,t2_images}.ts`
  (`state/project/collab.ts` is moved to `state/instance/`, not deleted).
- *Step 9a (client strip):* `components/project/**` (the remainder),
  `components/project_ai/**` (replaced by `copilot/` in step 8),
  `components/dashboards/**`, `components/public_viewer/**`,
  `components/visualization/{index,visualization_settings,
  duplicate_visualization,save_as_new_visualization_modal,
  create_slide_from_visualization_modal}.tsx`,
  `slide_deck/select_visualization_for_slide.tsx`, both
  `resolve_figure_from_visualization.ts`, `PresentationObjectMiniDisplay.tsx`
  (keep only if `PresentationObjectPanelDisplay` still needs it),
  `exports/{_dashboard_export_model,_dashboard_pages,export_dashboard_as_pdf,
  export_dashboard_as_pptx,export_dashboard_as_xlsx}.ts`,
  `components/instance/{instance_projects,add_project,compare_projects,
  pending_deletions}.tsx` and the project permission forms,
  `state/project/**` (the remainder), the `app.tsx` `/d/:slug` route, the 33
  project-area tours (decks 12, reports 7, visualizations 5, dashboards 5,
  results_package 3, settings 1) and `tour_catalogue_instance_modal.tsx`.
- *Step 9b (server strip):* `server/db/project/**` (whatever remains after
  §3.10's relocation), `server/routes/project/**`, `lib/api-routes/project/**`,
  `server/project_auth.ts` (after `getGlobalUser` moves), `server/collab/
  po_rooms.ts`, `lib/collab/figure_config_crdt.ts` PO half (the slide-figure
  map half survives), `server/routes/caches/visualizations.ts` PO detail
  cache (the three run-keyed caches in that file survive), `server/routes/
  public/dashboard.ts`, `server/db/instance/dashboard_slugs.ts`,
  `lib/types/{visualization_folders,dashboard,_dashboard_config,projects,
  project_sse}.ts` (`lib/types/presentation_objects.ts` is trimmed of the
  PO-product types, not deleted: `ALL_DISAGGREGATION_OPTIONS`,
  `DisaggregationOption`, `PeriodBounds`,
  `ResultsValueInfoForPresentationObject` and
  `ReplicantOptionsForPresentationObject` have nine live importers under
  `lib/`; `lib/types/datasets_in_project.ts` is renamed in step 3), the
  backups feature (the 4 `requiresProject` routes in `lib/api-routes/instance/
  backups.ts`, the restore body, the settings-page backups panel,
  `create_backup_form`, `restore_from_file_form`, `can_create/restore_backups`;
  instance backups stay a status-api and volume concern), `copyProjectSync` /
  `copyProjectInBackground` and `WITH TEMPLATE`, soft-delete plus the purge
  cron in `main.ts` (`runProjectPurge`, `purgeExpiredProjects`), lock, central
  reporting and every H_USERS project branch (`routes/instance/users.ts`,
  `db/instance/instance.ts`), `compareProjects` (`lib/api-routes/instance/
  modules.ts`), `getCacheStatus`, `getProjectLogs`, the `getMyProjects` route
  (`lib/api-routes/instance/instance.ts`, `server/routes/instance/
  instance.ts`), `getProjectsForUser` (`server/db/instance/instance.ts`),
  `getOtherUser.projectUserRoles` (`server/db/instance/users.ts`), the two
  project disk gates in `server/utils/disk_space.ts`,
  `server/runs/attach_run.ts`,
  `server/runs/package_compatibility.ts`, `server/task_management/
  {build_project_state,notify_project_v2,project_last_updated}.ts`, the
  `rename_user_email.ts` per-project sweep, `_project_database.sql` plus the
  43 project migration files plus the runner's project mode plus
  `validate_migrations`' project half, `db_startup.ts`'s per-project loop
  (`backfillDashboardSlugsToMain`, `runProjectMigrations`,
  `runProjectDataTransforms`, `dropOrphanProjectDatabases`), the
  `requiresProject` transport (`route-utils.ts`, `create_server_action.ts`,
  `route-tracker.ts`, `cors.ts`), and the follower model in
  `db/instance/run_generation.ts` (`listAttachableRunsForProject`,
  `setProjectAttachedRun`, `getProjectAttachedRunId`,
  `listFollowPinnedProjects`, `setProjectAttachedRunIfPinned`,
  `setProjectFollowPinned`, `clearFollowPinnedIfNotPin`,
  `getGeneratingRunIdForAttachTargets`, `getIneligibleAttachTargetNames`).
- *Step 10:* `.github/scripts/sync-docs.sh` terminology line and image path,
  `generate-changelog.sh` example text. `./validate_queries` is not deleted;
  it must stay green at every step and gains the scope axis in step 3. Old
  project DBs and legacy `sandbox/<uuid>` dirs are purged by a new ops script
  after settling.

**D13: Gate the consolidation with a read-only fleet dry-run** that shares
the planning code with 085: `planConsolidation(...)` produces the inserts
and remaps; the migration executes them and the dry-run only reports them.
Per instance it reports:

- projects by status, including the `pending_deletion` and
  `is_central_reporting` lists;
- rows whose project DB is absent, and sources not at the latest project
  migration;
- per-table row counts, including the visualizations, dashboards and public
  dashboards that will be dropped;
- id collisions and the remap plan;
- FK orphans;
- projects with `run_id NULL`, and whether a pin exists;
- users holding only viewer roles (the D2 blast radius);
- max products per instance (the size of the D8 `starting` payload);
- folder counts.

The deploy is blocked until the dry-run reports zero FAIL across the fleet.
It runs from step 2 onward, against production, through the read-only path
in `PROTOCOL_ACCESS_DBS.md`.

**D14: Ids.** Keep the nanoid scheme; one generator length, **4 chars**
(923,000 combinations; the old 3-char space of 29,791 was large enough
inside a single project database, but not for one instance-wide namespace);
product ids checked against `products`, slide ids against `slides`; versions
and folders stay `crypto.randomUUID()`; existing 3-char ids are kept unless
they collide (ids are not length-validated; registry params stay
`z.string()`, never `z.uuid()`). No stored FigureBundle references a product
id, so bundles need no rewrite.

**D15: AI copilot. One instance-level mount, env bound to the open
product.** `AIProjectWrapper` becomes the copilot wrapper around the Products
page AND both editor overlays (panther registers tools once per mount; the
`returnToContext` stack and the tours rely on one controller). The env
resolves the open product's PackageScope while an `editing_*` view is active
(carried in the view context, the half of the AI env the model never sees,
and never in tool params; the "no run id crosses the seam" ruling holds),
else the pin at national scope. SPA
shared tools get the `withSourceHeader` (package label plus scope) that
`/mcp` already applies, since the env's pair can differ from the pin
mid-thread. The authoring context is reconciled in place (the tool-aliasing
invariant, SYSTEM_13). Views collapse to `viewing_products`,
`editing_slide_deck`, `editing_slide`, `editing_report` (the results
explorer plan adds its own view);
`PROJECT_TAB_TO_VIEW` and `switch_tab` are deleted. Figure creation by the
model happens inside a deck or report (the slide tools, the report editor
tools, drafts); when no `editing_slide_deck` view is active, `AddToDeckModal`
re-resolves the draft slide's figure blocks under the chosen deck's pair
before `createSlide`. One conversation scope (`"copilot"`). Proxies: `/ai`
guarded `requireApprovedUser()`; `/ai-instance` (HFA indicator manager,
`can_configure_data`) kept; two mounts, one handler. `ai_usage_logs.project_id`
dropped. `projects.ai_context` becomes one instance-level `ai_context` in
`instance_config` (settings textarea, `can_configure_settings`). The
interactions producer consumes `products_upserted` rows (type plus label)
and `last_updated(slides)`. Every "project", "visualization as a thing you
open" and "dashboard" in model-visible text (`lib/types/ai_input.ts`, tool
descriptions, view instructions, `client_info_topics.ts`,
`client/public/info/*.md` served to `get_info`) is swept.

**D16: The Products page works like a file browser.** The user is always
inside one folder. The page shows the sub-folders and the products of that
folder, and nothing from any other folder. Clicking a sub-folder opens it.
A breadcrumb at the top shows the path from the root to the current folder
and takes the user back up; it always shows the root and the current
folder, and collapses the folders in between when the path is long. The
page is not a flat list of every product with a folder column, and it is
not a tree of folders beside a list. It is one page under
`client/src/components/products/`, reading `instanceState.products` and
`instanceState.folders` from T1 (no list route). The current folder is
stored as one folder id (`null` = root) in localStorage beside the view
mode; the path is derived by walking `parentId` and is never stored. The
header toggles two views, cards and list, over the same folder contents. In the
card grid a product tile is a type icon plus one "package · scope" caption,
so product and folder tiles share a height. The list is hand-built rather
than assembled from the shared table component; that is a sanctioned
exception to the UI component rule, because the rows open editors and mix
two entity kinds, and header and rows share one CSS grid template.
Type-filter chips filter products only; folders are always visible in
a location, with counts of direct children reflecting the filter. Search (3+
characters) is global and flat: it escapes the location and lists matching
folders then products from anywhere, each with its path. One sort vocabulary
drives the header Select and the list's clickable Name and Last updated
headers; folders sort by the same mode and always come first. Multi-select
runs over the plain product id (one registry, one id namespace, cross-type
batch routes); folders are never multi-selectable and act through their own
menu. One menu builder per kind serves grid tiles, list rows and the
right-click menu: **Move into ▸** (this location's folders, capped at 10, then More…),
**Move up to "parent"**, **Move to top level**, **Move to folder…**; no
drag-and-drop, no batch action bar. The full picker (`MoveToFolderModal`)
moves a product batch or one folder, lists flat full paths sorted by path
with "No folder" first, and excludes a moved folder's own subtree.
**Create is two buttons, no modal:** "New deck" / "New report" call
`createProduct({ type, folderId })` with the location as the folder; the
server mints the localised label ("Untitled deck" / "Untitled report"),
resolves `run_id` from the pin inside the insert and inserts the detail row
in the same transaction; the editor opens immediately via `getEditorWrapper`.
Each button is its own `createButtonAction` (the first attempt's second
behavioural defect: two buttons on one action, whose request-id guard
discarded all but the most recent click's callback). With no ready pinned
package the buttons are disabled before the click, and the server's typed
`NO_READY_PINNED_PACKAGE` still comes back through the envelope to cover the
race. **One settings surface** (`product_settings.tsx`: label, folder,
package Select over T1 `readyPackages`, scope picker) is reached from the
menu and from both editor headers; changing package or scope never blocks
and has no pre-flight (staleness is surfaced afterwards by the D4 badge);
the package
options always include the product's current package even when it is no
longer ready. **Folders nest** through `parent_id`; a move is `updateFolder`
(label, colour and parent are one metadata write); a move into the folder
itself or any descendant is refused inside the move transaction by a
recursive-CTE walk and returned as the typed `FOLDER_CYCLE` failure through
the envelope; folders have no GET route (`starting` and `folders_updated`);
**deleting a folder reparents one level and never cascades**, and the freed
product ids come back so the route emits `products_upserted` for them.
**Delete is hard, and rooms close with it.** `deleteProducts` reads the
batch's product types before opening the delete transaction, then reads the
slide ids of any deck in the batch inside that transaction, so the route can
close the slide and report rooms afterwards; detail rows, slides and
versions go by CASCADE. **Deep link:** `?product=<id>` is consumed
into the same `pendingEditorOpen` request the tours and the copilot use (one
opener, one place that waits for hydration); `?p=` and `?d=` are gone with no
shim. Editors read the product's PackageScope live from the T1 products row,
not from a snapshot. Owned by SYSTEM_12 (retitled "Products & Folders").

**D17: Tabs.** Instance shell: **Products** (first, default) | **Explore** |
Data | Results | Assets | Users. Today's set is projects | data |
results_packages | assets | users. Project Metrics, results-package and
settings tabs are dissolved (metrics to Explore; package and scope to
product settings; users, lock, central, backups, copy and delete have no
product analogue; AI context to instance settings).

**D18: Docs move with the code, per step, and the merge is greenfield.**
SYSTEM prose and globs change in the step that changes the contract (§0);
step 10 is a read-through, not the rewrite. SYSTEMS.md custody rows, the
PROTOCOL_APP files, CLAUDE.md and USER_GUIDE_MCP follow the same rule. Other
`PLAN_*.md` files are Tim's to rework after this plan lands; no step edits
them. When step 10's review passes, the reviewer deletes this file in its
last commit (the CLAUDE.md rule that a finished plan is deleted).

---

## 3. Target architecture

### 3.1 Data model (main DB; base schema `_main_database.sql` = final state)

The products block, as `084_products.sql` creates it (in `IF NOT EXISTS`
form) and as the base schema carries it. This is the reference branch's
final DDL with nesting folded in; the two version tables keep their current
shape with FKs repointed.

```sql
CREATE TABLE folders (
  id text PRIMARY KEY NOT NULL,        -- uuid
  label text NOT NULL,
  color text,
  parent_id text REFERENCES folders(id) ON DELETE SET NULL,  -- NULL = root
  created_by text,                     -- email; NULL = pre-restructure folder
  created_at text,                     -- NULL = pre-restructure folder
  last_updated text NOT NULL
);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);

CREATE TABLE products (
  id text PRIMARY KEY NOT NULL,        -- 4-char nanoid (legacy 3-char kept)
  type text NOT NULL CHECK (type IN ('slide_deck', 'report')),
  label text NOT NULL,
  folder_id text REFERENCES folders(id) ON DELETE SET NULL,
  run_id text NOT NULL REFERENCES runs(id),  -- no cascade: the delete-run guard
  admin_area_2 text,                   -- NULL = national
  created_by text,                     -- email; NULL = pre-restructure product
  created_at text,                     -- NULL = pre-restructure product
  last_updated text NOT NULL,          -- THE product version (content or metadata)
  UNIQUE (id, type)                    -- target of the detail tables' composite FK
);
CREATE INDEX idx_products_folder_id ON products(folder_id);
CREATE INDEX idx_products_run_id ON products(run_id);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_last_updated ON products(last_updated);

CREATE TABLE slide_decks (            -- detail: type = 'slide_deck'
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL DEFAULT 'slide_deck' CHECK (type = 'slide_deck'),
  plan text,
  config text,
  FOREIGN KEY (id, type) REFERENCES products(id, type) ON DELETE CASCADE
);

CREATE TABLE slides (
  id text PRIMARY KEY NOT NULL,        -- 4-char nanoid
  slide_deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,          -- per-slide optimistic lock + slide cache
  crdt_state text,
  crdt_state_last_updated text
);
CREATE INDEX idx_slides_slide_deck_id ON slides(slide_deck_id);
CREATE INDEX idx_slides_slide_deck_sort ON slides(slide_deck_id, sort_order);
CREATE INDEX idx_slides_last_updated ON slides(last_updated);

CREATE TABLE reports (                -- detail: type = 'report'
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL DEFAULT 'report' CHECK (type = 'report'),
  body text NOT NULL DEFAULT '',
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  config text,
  crdt_state text,
  crdt_state_last_updated text,
  body_authors text,
  FOREIGN KEY (id, type) REFERENCES products(id, type) ON DELETE CASCADE
);

CREATE TABLE report_versions ( ... report_id REFERENCES reports(id) ON DELETE CASCADE ... );
CREATE INDEX idx_report_versions_report ON report_versions(report_id, created_at DESC);
CREATE TABLE slide_deck_versions ( ... slide_deck_id REFERENCES slide_decks(id) ON DELETE CASCADE, slide_deck_config ... );
CREATE INDEX idx_slide_deck_versions_slide_deck ON slide_deck_versions(slide_deck_id, created_at DESC);
```

Rules of the shape:

- `last_updated` lives on `products` (modified time on the file) and on
  `slides` (child rows with their own optimistic lock). Every content
  mutation bumps `products.last_updated` in the same transaction (the
  deck-touch rule, generalised). Optimistic-concurrency round-trips
  (`updateReportBody`, `updateSlide`) compare against `products.last_updated`
  / `slides.last_updated`. Collab checkpoints write the same timestamp to
  `products.last_updated` and to the detail row's `crdt_state_last_updated`
  in one write; a
  non-collab write bumps `products.last_updated` alone, which is what
  invalidates stored CRDT state (SYSTEM_16 rule). Metadata writes (label,
  folder, package, scope) bump it too.
- Dropped columns with no live writer: `*_folders.sort_order` and
  `reorderVisualizationFolders`, `*_folders.description`,
  `global_last_updated`. Dropped tables: everything visualization and
  dashboard (D3).
- `created_by` and `created_at` exist on both `products` and `folders` so a
  folder can carry the same provenance a product does when permissions
  arrive. Provenance, not ownership (D2).
- Users: `users` loses the 17 `default_project_can_*` columns and
  `can_create_projects`; `instance_config` gains an `ai_context` row.
- Logs: `user_logs`, `ai_usage_logs`, `user_logs_aggregate` lose `project_id`
  (mechanics in D9).

### 3.2 Access control

- `requireApprovedUser()`, new, beside `requireGlobalPermission` in
  `server/middleware/userPermission.ts`: `getGlobalUser`, 401 if
  unauthenticated, 403 unless `globalUser.approved`, sets `c.var.globalUser`
  and `c.var.mainDb`. It guards the run-keyed reads, the authoring context,
  the ready-package list, the copilot proxies and the collab socket.
  `requireGlobalPermission()` is not changed (its zero-perm sites keep
  today's behaviour, including their hand-rolled `approved` branches).
- `requireProductAccess`, new, beside it. Every entry in
  `lib/api-routes/products/*` carries `access: "view" | "edit" | "own"`; the
  `route()` helper in `lib/api-routes/route-utils.ts` gains an optional
  `access` field that comes back non-optional on the returned type, so a
  `satisfies` over each registry can require it. `defineRoute` in
  `server/routes/route-helpers.ts` already holds the registry entry, so it
  installs `requireProductAccess` whenever `access` is set; that is the
  mechanism behind "a handler never checks access itself". The middleware
  resolves the route's targets from the id fields the route declares and
  nowhere else: path `product_id` or `folder_id`; body `productIds` (batch
  targets), `folderId` or `parentId` (a destination folder), and
  `targetProductId` (a destination product). It answers 401 when
  unauthenticated and 403 when `productAccessPolicy(user, level, targets)`
  in `server/auth/product_access.ts` returns false. Today's policy is a pure
  boolean: true for any approved user at every level. Folder routes declare
  their level the same way (`createFolder` edit on the parent, `updateFolder`
  edit on the folder and on a new parent, `deleteFolder` own).
- `server/project_auth.ts` is deleted in step 9b; `getGlobalUser` /
  `buildGlobalUserFromDb` move to `server/auth/global_user.ts` in step 5
  (imported by `userPermission.ts`, `static.ts`, `mcp/context_cache.ts` and
  `server/tests/pat_identity_parity_test.ts`; `project_auth.ts` re-exports
  them until 9b); `createDevGlobalUser` stays in `lib/types/instance.ts`;
  `createDevProjectUser` and `ProjectUser` die in 9b.
- Guard map: product and folder routes: `requireProductAccess` with the
  declared level. Run-keyed figure-data reads, the authoring context,
  `listAttachableResultsPackages`, Explore: `requireApprovedUser()`. Package
  internals: `can_view_data`
  (`can_view_logs` for logs). Catalogue, generation, pin: `can_configure_data`.
  Users: unchanged. `/mcp` door: `can_view_data`.
- Collab WS admission = origin plus Clerk plus approved; each subscribe
  names its product id, and `RoomConn.canEdit` (kept, TRUE) is where a
  per-product check slots in; the six per-family flags and the lock are
  deleted.
- H_USERS survives for: boot seed, `unlimitedAi`, `setUserUnlimitedAi` /
  `setUserContactPerson`, users-list hide toggle, `version_capture` skip,
  feedback recipients. Every project branch is deleted.
- Health surface: `/projects` and `/project_activity` deleted; `projects`
  removed from `/health_check`; `/user_logs*` rows lose `project_id`.

### 3.3 API surface

- Transport: `requiresProject` (registry flag, `RouteRequiresProject` /
  `RouteArgsWithProject` types, the `Project-Id` header emit in
  `create_server_action.ts`, the CORS allow-header, the route-tracker
  body-key check) is deleted in 9b.
- Registries: `lib/api-routes/products/{products,folders,slide-decks,slides,
  reports}.ts`; server `server/routes/products/*.ts`; `emails` moves to
  `instance/` (`sendSlideDeckEmail` recipients = instance roster);
  `combined.ts` re-spread. **Path rule:** every product-scoped route lives
  under `/products/:product_id/...`, the param is always `product_id`, and
  child ids (`slide_id`, `version_id`) follow it; the handler scopes its
  query by both, so a slide id from another product is a 404. The reference's
  flat paths (`/slide-decks/:deck_id`, `/slides/slide/:slide_id`,
  `/reports/:report_id`) are not reused. Batch routes carry their targets in
  the body under one key, `productIds`. Every entry declares `access`
  (§3.2).
- Shared product routes: `createProduct({ type, folderId })` (`POST
  /products`; access edit on the folder, or approved at the root; server
  mints label and resolves the pin; D16), `updateProductLabel` (`PUT
  /products/:product_id/label`, edit), `moveProductsToFolder` (`PUT
  /products/folder`, body `{ productIds, folderId }`, edit on each product
  and on the target folder), `deleteProducts` (`DELETE /products`, body
  `{ productIds }`, own; any type; pre-read slide ids of any deck in the
  batch, close slide and report rooms and version accumulators, then one
  `DELETE FROM products WHERE id = ANY($1)`, emit `products_deleted`),
  `setProductPackage` (`PUT /products/:product_id/package`, edit; calls
  `setProductRun(id, runId)` in `db/instance/run_generation.ts`, where the
  ready gate lives in the UPDATE), `setProductScope` (`PUT
  /products/:product_id/scope`, edit), `duplicateProduct` (`POST
  /products/:product_id/duplicate`, view on the source, edit on the target
  folder; clones `(run_id, admin_area_2)`, per-type body),
  `listAttachableResultsPackages` (instance, approved).
- Per-type content routes, all under the product: decks `GET
  /products/:product_id/slide-deck` (`getSlideDeckDetail`), `PUT
  .../slide-deck/plan`, `PUT .../slide-deck/config`, `GET
  .../slide-deck/versions`, `GET .../slide-deck/versions/:version_id`, `POST
  .../slide-deck/versions/:version_id/{restore,copy}`; slides `GET .../slides`, `GET .../slides/:slide_id`,
  `POST .../slides`, `PUT .../slides/:slide_id`, `DELETE .../slides`, `POST
  .../slides/duplicate`, `PUT .../slides/move`, and the new `POST
  .../slides/copy-to-slide-deck` (`copySlidesToSlideDeck`, body `{ slideIds,
  targetProductId }`; view on the source, edit on the target; bundles copied
  verbatim, so they show stale under the target if the pairs differ; D4);
  reports `GET /products/:product_id/report` (`getReportDetail`), `PUT
  .../report/{body,figures,images,config}`, `GET .../report/versions`, `GET
  .../report/versions/:version_id`, `GET .../report/versions/:version_id/
  lineage`, `POST .../report/versions/:version_id/{restore,copy}`. Reads
  declare view, writes edit; the two `copy*Version` routes create a new
  product from a version (body `{ label, folderId }`) and declare view on
  the source and edit on the target folder, like `duplicateProduct`. Route
  NAMES keep today's registry keys minus `requiresProject`; only the paths
  and params change. Removed in favour of the shared routes or the SSE list:
  per-type `getAll*`, `create*`, `delete*`, `move*ToFolder`, `update*Label`,
  `duplicate*`.
- Folder routes: `createFolder` (`POST /folders`, `{ label, color, parentId
  }`, edit on the parent), `updateFolder` (`PUT /folders/:folder_id`, `{
  label, color, parentId }`, edit; the cycle check lives here),
  `deleteFolder` (`DELETE /folders/:folder_id`, own; reparents children and
  products one level, returns `freedProductIds`).
- Run-keyed instance reads (D7): `getRunPresentationObjectItems(run_id,
  {resultsObjectId, fetchConfig, adminArea2})`, `getRunResultsValueInfo(run_id,
  {metricId, adminArea2})`, `getRunReplicantOptions(run_id, {metricId,
  replicateBy, fetchConfig, adminArea2})`, `getRunResultsObjectItems(run_id,
  results_object_id, {adminArea2})`, `getRunAuthoringContext(run_id)`.
- Run generation: `launchRunGeneration` loses `attachTargetProjectIds`;
  `listFollowPinnedProjects` deleted; `RunCatalogItem.attachedProjects`
  becomes `attachedProducts { type, id, label }` (consumers: `detail.tsx`,
  the wizard, `_prune.tsx`, `_prune_plan.ts`); `deleteRun` refuses while any
  product points at it.
- AI: `/ai/v1/messages` and `/ai/files*` under `requireApprovedUser()`; SDK
  client loses the default header; `AddAiUsageLog` loses `projectId`.
- Public: `/api/d/:slug` and `routes/public/dashboard.ts` deleted; `main.ts`
  mount removed; `app.tsx` `/d/:slug` route removed.
- `renameUserEmail`: the per-project sweep becomes a main-DB sweep over
  `products.created_by`, `folders.created_by`, `report_versions.editors`,
  `slide_deck_versions.editors`,
  `body_authors`; `RenameEmailResult` loses `projectsUpdated/projectsFailed`;
  `change_email_modal.tsx` retry UI follows; the fleet orchestrator consumes
  the new shape (§7).

### 3.4 Realtime

Instance channel additions: `products_upserted { products: ProductSummary[] }`
(the only product-list message; every product mutation route, and every
collab checkpoint, emits the summary for that id), `products_deleted { ids }`,
`folders_updated { folders }`, `last_updated { tableName: 'slides', ids,
lastUpdated }`; `starting` carries the full `products`, `folders`,
`readyPackages` and `lastUpdated` map. `readyPackages` follows the
`runsCatalog` idiom exactly: a `starting` fill plus the existing
`runs_catalog_updated` nonce triggering a `listAttachableResultsPackages`
refetch (no new message type). That route returns `ReadyPackage[]` (`{ id,
label, createdAt }`), not `RunListingItem[]`. `RunListingItem` carries
progress, summary and provenance, which is generation telemetry and stays at
`can_configure_data` under Q-B; the package label is the whole of what D8
widens to approved users. The client `lastUpdated` map (`{ products, slides
}`) is the cache-version index. Its key type is `ProductLastUpdateTableName
= "products" | "slides"` in `lib/types/last_updated_tables.ts`, added beside
the project union in step 5 and left as the only union in 9b; the emitter is
`notifyInstanceLastUpdated(tableName, ids, ts)`, added beside the project
`notifyLastUpdated(projectId, ...)` in step 5, which 9b deletes.
`buildInstanceState`
is split so the `/mcp` context builder does not embed product lists or
report bodies.

`ProductSummary` = `{ id, type, label, folderId, runId, adminArea2, createdBy,
createdAt, lastUpdated }` plus one per-type existence flag (`slide_deck`:
`firstSlideId: string | null`; `report`: `hasEmbeds: boolean`, computed in
SQL so no body crosses the DB boundary). Detail-table content never rides
the summary.

### 3.5 Client state

`client/src/state/project/**` is deleted (partly in 7a, the rest in 9a).
Inventory after:

| Tier | What | Home |
| --- | --- | --- |
| T1 | `products`, `folders`, `readyPackages`, `lastUpdated.{products,slides}`, `pinnedRunId` (exists), `hfaTimePoints` (exists) | `state/instance/t1_store.ts` |
| T2 | `run_authoring_context` keyed `[runId]`, immutable (the `t2_runs.ts` idiom) | `state/instance/t2_run_authoring_context.ts` |
| T2 | figure data: `po_items` / `metric_info` / `replicant_options` keyed `(runId, scopeToken, ...)`, version constant (embedded figures, Explore, presets) | `state/products/t2_figure_data.ts`, `t2_replicant_options.ts` |
| T2 | `slide` by `lastUpdated.slides[id]`; `slide_deck_detail` / `report_detail` by `lastUpdated.products[id]`; `images` (moves, no change) | `state/products/t2_*.ts` |
| T4 | `productsOpenFolder`, `productsViewMode`, `productsSortMode`, `productsTypeFilter`, `pendingEditorOpen`, `showAi` | `t4_ui.ts` |
| T4 | AI documents keyed `ai-documents/copilot` (the store; the UI is `components/copilot/ai_documents/*`) | `state/products/t4_ai_documents.ts` |
| T1-adjacent | collab store, connected by the instance boundary when approved | `state/instance/collab.ts` |

`createReactiveCache` loses its `getSnapshotProjectState` import; version
keys are `(params, instanceState)` only. `clear_caches.ts` keeps only the AI
prefixes. `PackageScope` replaces `ProjectState` in every editor prop;
`snapshotForSlideEditor` snapshots only what must not move under the editor
(the deck config at open); the PackageScope is read live from T1 (D16) and
the authoring context from the immutable T2 cache keyed by that live
`runId`, so a mid-edit reattach moves the figure data, the metrics and the
presets together, and the D4 stale badges appear. `hfaTaxonomy` for the
copilot is composed
client-side from the authoring context plus T1 `hfaTimePoints`.

### 3.6 Client UI

- Instance shell tabs: **Products** | **Explore** | Data | Results | Assets |
  Users. `?product=<id>` opens an editor; `?p=` and `?d=` are gone.
- `components/products/`: `index.tsx` (the product explorer page),
  `folder_tree.ts` (pure derivations over the flat `Folder[]`: children,
  ancestors, path labels, descendant sets, flat full-path picker options;
  every walk carries a visited set), `folder_card.tsx`, `product_card.tsx`, `list_view.tsx`,
  `product_menu.ts`, `folder_menu.ts`, `move_to_folder_modal.tsx`,
  `edit_folder_modal.tsx`, `product_settings.tsx`,
  `duplicate_products_modal.tsx`. `_shared/scope_picker.tsx` (renamed from
  `project_scope_picker.tsx`; copy says "Scope").
- `components/explore/`: `index.tsx`, the empty Explore tab page (the
  results explorer is a later plan, D6). `components/figures/insert_figure/**`
  (= moved `add_visualization/` plus `preset_preview.tsx`, fed by an
  authoring context; used by both editors, and by the results explorer when
  it lands).
- Figures: `components/visualization/` keeps the embedded editor
  (`visualization_editor_inner.tsx`, the three editor panels, conditional
  formatting, `edit_common_properties_modal`, `inline_replicant_selector`)
  and is renamed `components/figure_editor/`; `stale_figure_badge.tsx` and
  the "Update to [package]" / "Update all figures" actions (D4) live beside
  the slide figure block and `ReportFigureEmbed`.
- Editors (`slide_deck/`, `report/`) take `{ productId }` and read the
  PackageScope live from T1 (plus the authoring context via T2) instead of
  `projectId` plus `projectState[Snapshot]`; every `can_configure_* &&
  !isLocked` gate becomes one shared `canEditProduct(productId)` (returns
  approved today; takes the id so a later permission model replaces one
  function and no call site); the header shows the scope
  badge, a Settings entry and the stale-figure count. The slide and report
  "insert figure" panels offer the product run's presets and the metric
  wizard (no viz-product picker). `slide_list.tsx` gains "Copy to deck…".
- Copilot: `components/copilot/` (renamed from `project_ai/`), one mount at
  the Products page; env resolves the open product's scope; view registry per
  D15.
- Product types: one registry object in `client/src/components/products/
  product_types.ts`, typed `Record<ProductType, { label, icon, editor,
  createLabel, detailCache, figureTarget }>`, is the only place the client
  knows what a type is. Cards, list rows, create buttons, filter chips,
  `getEditorWrapper` and the copilot's deck and report pickers all read
  it. The rule, on client and server alike: every per-type
  dispatch is a `Record<ProductType, ...>` object, never a switch with a
  default, so adding a type is a compile error at each object until it is
  filled in. Server per-type logic lives in `server/db/products/<type>.ts`
  and the shared routes branch on the row's `type` once, through the same
  kind of object.
- Onboarding: the 33 project-area tours collapse into one products tour set
  (the results explorer plan adds its own); results-package, settings,
  instance-projects,
  visualization and dashboard tours are deleted; the deck and report editor
  tours survive; the instance tour catalogue stops fanning out
  `getProjectDetail`; tour ids renamed (Clerk seen-flags re-fire once,
  accepted); telemetry loses `projectId`.
- Copy sweep: every en, fr and pt literal saying project, projet or projeto,
  `TC.goBackToProject`, `client/public/info/*.md`, and every "dashboard" or
  standalone-"visualization" literal is rewritten to products, folders,
  scope, figures.

### 3.7 Results packages: pointer, pin, presets

- `db/instance/run_generation.ts` pointer functions rewrite against
  `products`: `setProductRun(id, runId)` (the DB function behind the
  `setProductPackage` route), the delete guard, catalogue
  `attached_products` json_agg. The pin-move
  transaction touches only `runs.pinned` (advisory lock kept).
- Presets: `virtual_defaults.ts` keeps `deriveVirtualDefaults(manifest)`
  (memo by runId) and serves them inside `getRunAuthoringContext.presets`.
- The wizard client (`instance_results_packages/_wizard/{index,_step_data,
  _step_confirm}.tsx`) loses the attach-target multi-select and confirm copy;
  `detail.tsx` "in use by" lists products by type; the pin confirm no longer
  lists followers (there are none); `_prune*.ts*` count products.
- `figurePackageIssueFor` (manifest-only) lives in `lib/figure_package_issue.ts`,
  extracted from the private `issueFor` in `server/runs/package_compatibility.ts`,
  with a second entry point, `figurePackageIssueForMetrics`, so the client can
  compute the same issue from the authoring context, since the client never
  holds the manifest.

### 3.8 FigureBundle

`figureBundleSchema` (strict, shared by slides and reports) gains `scope: {
adminArea2: string | null }` and `provenance.runId: string` (optional from
step 4, required from step 9b; D4). Every assembly site
(`resolve_figure_from_metric.ts`, `resolve_bundle_from_metric_and_config.ts`,
the T2 figure-data cache) captures the two fields on write from the
product's PackageScope, or, until 7a, the project's. 085 stamps them into
live AND version tables from the owning project row; anything 085 misses is
caught later by the normal missing-key parse failure, so no separate
skip-gate is needed. The stale predicate and the update action live in
`generate_visualization/figure_staleness.ts` (pure:
`isFigureBundleStale`, `findStaleFiguresInLayout`, `findStaleFiguresInReport`)
plus the editor components. `buildFigureInputs` reads `bundle.scope` for the
roll-up label. Bundles are stored, not cached, so no Valkey prefix moves.

### 3.9 Migration mechanism: file list (mechanism in D9)

- `server/db/migrations/runner.ts`: `.ts` migrations via a literal-keyed
  static import map (step 2); project mode deleted (step 9b).
- `server/db/migrations/instance/084_products.sql` (step 1);
  `000_legacy_project_shell.sql`, `085_consolidate_projects.ts`,
  `086_drop_project_layer.sql` (authored in step 2 under
  `server/db/migrations/consolidation/staged/`, which the runner does not
  scan; moved into `instance/` and registered in 9b).
- `server/db/migrations/consolidation/plan.ts` (step 2): the shared planning
  core (reads a project DB, produces the insert set, id remap, folder plan,
  bundle stamps, ai_context concatenation and the dropped-row counts); 085
  executes it, the dry-run reports it. It carries a frozen copy of the
  project-DB row types it reads, copied from `version2`'s
  `_project_database_types.ts`, not the reference's.
- `server/db/migrations/consolidation/execute.ts` (step 2):
  `consolidateProjects(tx)`, the function 085 registers; opens each source
  pool read-only, asserts the source migration id, calls the planner and
  applies the plan through `tx`. The reference's worked answer is the body
  of its `080_consolidate_projects.ts`.
- `validate_consolidation.ts` (repo root, step 2): the read-only fleet
  dry-run (per instance through the `PROTOCOL_ACCESS_DBS` path; `--local`
  for the dev DB; `--json` for the rollout post-check), exit 1 on any FAIL.
- `validate_consolidation_replay` (repo root, step 2): the throwaway-postgres
  harness described in step 2's gates, mirroring `validate_migrations`.
- `db_startup.ts` (step 9b): the per-project loop,
  `backfillDashboardSlugsToMain`, `dropOrphanProjectDatabases`,
  `PROJECT_DATA_TRANSFORMS` (the three survivors become instance transforms
  on main, signature `(tx, countryIso3)`), and the `runs.summary` transform
  block are the edits.
- `_main_database.sql`: products block added in step 1; projects and the
  project columns removed in 9b. `_project_database.sql` and
  `server/db/migrations/project/**` deleted in 9b; `validate_migrations`
  loses the project call in 9b.
- Ops (repo root, step 10): `rollout_products` (deploy plus health poll plus
  post-check product and folder counts against the dry-run's `--json` plan),
  `restore_main` (stop container, `docker exec psql -d postgres` DROP DATABASE
  main WITH (FORCE) / CREATE, pipe the named status-api dump, start the
  previous image; rehearsed once on testing-tim before the fleet),
  `purge_legacy_dbs` (ssh plus `docker exec psql -d postgres`: `DROP DATABASE
  ... WITH (FORCE)` for every UUID-named datname not in {main, postgres,
  template*}; rm `sandbox/<uuid>` dirs whose name is not in `runs.id`; never
  `.tmp-*`, `.duckdb-spill`, `restore_*`). All three are deleted after the
  purge (§6, item 7).

### 3.10 What survives from `server/db/project/**` (relocation list)

Re-derived against `version2` on 2026-09-08. Imports into live code from
`server/db/project/**` (directly or through `server/db/mod.ts`, which
re-exports `./project/mod.ts`):

| Symbol(s) | Lives in | Live importers | Goes to |
| --- | --- | --- | --- |
| `computeDataset{Hfa,Hmis,Iceh}RunCapture`, `PROJECT_FACILITY_COLUMN_NAMES`, `ProjectFacilityRow`, `DatasetCsvTarget` | `datasets_in_project_{hfa,hmis,iceh}.ts` | `generate_run/prepare_inputs.ts`; `query_rig/build_package.ts` | `server/runs/capture_inputs/{hfa,hmis,iceh}.ts` (they read main and write the run workspace: instance-level code that was misfiled); renamed `RUN_FACILITY_COLUMN_NAMES` / `RunFacilityRow` on the way |
| `prepareModuleDefinitionForStorage`, `parseModuleConfigSelections` | `modules.ts` | `generate_run/pipeline.ts`; `run_query/run_read.ts`, `runs/package_internals.ts`, `routes/instance/modules.ts` | `server/runs/module_config.ts` |
| `getAllPresentationObjectsForProject` | `presentation_objects.ts` | `run_query/virtual_defaults.ts`, `runs/package_compatibility.ts` | dies with both callers (D6, D4) |
| `getProjectUsers` | `projects.ts` | `routes/instance/users.ts` | dies (D2) |
| `purgeExpiredProjects` | `projects.ts` | `main.ts` | dies (D12) |
| `getProjectDetail` | `projects.ts` | `task_management/build_project_state.ts` | dies (D8); its manifest projection is the model for `buildRunAuthoringContext` |
| `getDashboardDetail` | `dashboards.ts` | `routes/public/dashboard.ts` | dies (D3) |
| `getReportDetail`, `getReportBodyAuthors`, `stripPersistedBodyAuthorTombstones`, `REPORT_NOT_FOUND`, `getSlideDeckDetail`, `SLIDE_DECK_NOT_FOUND`, `getSlides`, `insertDeckVersion`, `insertReportVersion`, `latestDeckVersionHash`, `latestReportVersionHash` | `reports.ts`, `slide_decks.ts`, `slides.ts`, `versions.ts` | `server/collab/version_capture.ts` | `server/db/products/*` (step 5 builds them, with `insertDeckVersion` and `latestDeckVersionHash` renamed `insertSlideDeckVersion` and `latestSlideDeckVersionHash` per the §0 naming rule; 7a repoints `version_capture`) |
| project-DB row types | `_project_database_types.ts` | `db/instance/rename_user_email.ts` | frozen copy in `consolidation/plan.ts`; the rename sweep dies |

`server/db/utils.ts` stays as it is: its four exports (`escapeSqlString`,
`tryCatchDatabaseAsync`, `getResultsObjectTableName`, `detectHasAnyRows`)
are all live on main and in the run read path. `dbRowToHfaIndicator` already
lives in `db/instance/hfa_indicators.ts` and does not move.
`getEnabledFacilityDisaggregationOptions` and
`PHYSICAL_DISAGGREGATION_COLUMNS` already live in
`server/runs/disaggregation_availability.ts`. Renames, all in step 3:
`getProjectDatasetsFromManifest` becomes `getRunDatasetsFromManifest`
(`run_read.ts`; caller `server/mcp/context_cache.ts`); the live callers of
`projectScopeToken` (`lib/types/projects.ts`) switch to `scopeToken` in
`lib/types/scope.ts` (step 1 creates it; the callers are `run_read.ts` and
`query_rig/build_package.ts`; two more die in 9b);
`lib/types/datasets_in_project.ts` is renamed `lib/types/run_datasets.ts`
with its types renamed `RunDataset*` (importers: `lib/ai_tools/
build_system_prompt.ts`, `lib/types/mod.ts`; the `RunDataset` type already in
`lib/types/run_manifest.ts` is checked for overlap first).

---

## 4. Steps

Ten steps in twelve parts (7 and 9 split in two). Each row below is one Do
session followed by one Review session, plus a Fix and another Review when
a review fails (§0). Sessions are serial, in table order. **Depends on**
records the true dependency graph so a reordering (step 3 before 1, say) is
known to be safe if ever wanted; it is not an invitation to run sessions in
parallel.

| Step | Name | Depends on | Ships alone? | The one thing it proves |
| --- | --- | --- | --- | --- |
| 1 | Additive products schema | none | yes | 084 applies on every fleet shape |
| 2 | Consolidation planner, fleet dry-run, `.ts` runner | 1 | yes | the fleet's blast radius is known |
| 3 | Run-keyed reads with scope, and the authoring context | none | no | scope is a parameter on each read, with no project wrapper required |
| 4 | FigureBundle scope and runId, staleness, the update action | 3 | no | every stored figure records its own run and scope |
| 5 | Products DB layer, routes, guard, SSE | 1, 3 | no | the product plane exists beside projects |
| 6 | Empty Explore tab and the insert-figure wizard | 4, 5 | no | the wizard renders from an authoring context, with no project |
| 7a | The switch. Editors live on products | 4, 5, 6 | no | a deck lives in main and edits live |
| 7b | The product explorer | 7a | no | the Products page navigates nested folders |
| 8 | Copilot remount | 7b | no | one mount whose env follows the product |
| 9a | Client strip | 8 | no | the client has no project |
| 9b | Server strip and consolidation | 9a, 2 | no | the server has no project; 085 runs on dev |
| 10 | Ops scripts, docs read-through, close | 9b | no | the repo reads as written today |

Format of each step below: **Surface** (the files and areas it may touch;
anything else is out of bounds), **Deliverable**, **Not in this step**,
**Gates** (on top of the §0 floor), **Reference** (worked answers on
`version2-reference`), **Ends with** (what is true when the session stops).

**Intermediate states the build passes through.** Building beside the old
code means two of some things exist for a while. Each is listed here with
the steps it spans so no agent mistakes it for the end state or closes it
early.

| State | From | Until |
| --- | --- | --- |
| The three consolidation migrations exist under `consolidation/staged/`, unscanned by the runner | 2 | 9b |
| `figureBundleSchema`'s `scope` and `provenance.runId` are optional; `getRollupRowLabel` falls back to the container's scope; the stale predicate treats a missing field as not stale | 4 | 9b |
| `components/figure_editor/` (new files) exists beside `components/visualization/` (the embedded editor and the standalone files) | 4 | 7a renames the embedded editor into it; 9a deletes the standalone files |
| Two deck and report DB layers, `db/project/*` and `db/products/*` | 5 | 7a |
| `ProductLastUpdateTableName` and `notifyInstanceLastUpdated` beside the project `LastUpdateTableName` and `notifyLastUpdated` | 5 | 9b |
| `attached_products` beside `attached_projects` in the run catalogue row and `RunCatalogItem` | 5 | 9b |
| T1 holds `products`, `folders`, `readyPackages`, `lastUpdated` with no consumer | 5 | 6 (readyPackages), 7a (the rest) |
| Two figure-data caches with two version-key shapes: `state/project/t2_presentation_objects.ts` (keyed by `ProjectState`) and `state/products/t2_figure_data.ts` (keyed by scope) | 6 | 9a |
| Two instance tabs, Projects and Products; Explore sits after Projects | 6 | 9a |
| Two collab sockets: `/collab` (slide and report rooms) and `/project_collab/:id` (PO rooms only; slide and report handling stripped). PO co-editing on the project Visualizations tab is dead from 7a; accepted, since 9a deletes that tab | 7a | 9b |
| `reactive_cache.ts` accepts two version sources, `ProjectState` and `InstanceState` | 7a | 9a |
| Editors opened from the Products page have no copilot; the project shell keeps `project_ai/` | 7a | 8 |
| `/ai` is remounted to `copilot_ai_proxy.ts`; the project `ai_proxy.ts` file is unmounted but present | 8 | 9b |
| `components/project_ai/**` remnants the project shell imports exist beside `components/copilot/**` | 8 | 9a |
| `lib/api-routes/project/**` and `server/routes/project/**` exist with no client importer | 9a | 9b |

### Step 1: Additive products schema

**Surface.** `server/db/migrations/instance/084_products.sql`;
`server/db/instance/_main_database.sql` (products block added, nothing
removed); `server/db/instance/_main_database_types.ts` (row types for the
new tables); `lib/types/products.ts` (`ProductType`, `PRODUCT_TYPES`,
`Folder` with `createdBy: string | null` and `createdAt: string | null`,
`ProductBase`, `ProductSummary`, `productScope`);
`lib/types/scope.ts` (`PackageScope`, `scopeToken`, `packageScopesEqual`;
no caller switches to `scopeToken` until step 3); SYSTEM_02 and SYSTEM_12
globs and prose for the new tables and types.

**Deliverable.** The §3.1 DDL, additive, `IF NOT EXISTS` throughout,
including `folders.parent_id`, `folders.created_by`, `folders.created_at`
and every index. The migration number is the
next free one; if it is not 084, record it in §9 and use the recorded
number everywhere this plan says 084.

**Not in this step.** Anything that reads or writes the new tables. The
runner's `.ts` support (step 2). Any change to `projects` or its columns.

**Gates.** `./validate_migrations`. A fresh-postgres boot (`db_startup`
against an empty database) exits 0. The historical-shape replay described
in Appendix A, re-run for 084 alone: the seven fleet-shape bases plus their
migrations plus 084 apply with zero statement errors.

**Reference.** Commits 1c5acebc, caaa2666. Files:
`server/db/migrations/instance/079_products.sql`,
`082_folder_nesting.sql`, `server/db/instance/_main_database.sql` (the
products block), `lib/types/products.ts`, `lib/types/scope.ts`.

**Ends with.** One commit. The tree is deployable on a normal release and
nothing user-visible changed.

### Step 2: Consolidation planner, fleet dry-run, `.ts` runner

**Surface.** `server/db/migrations/runner.ts` (the `TS_MIGRATIONS` literal
map, `.ts` discovery, the throw for an unregistered `.ts` file; the map is
empty until 9b); `server/db/migrations/consolidation/plan.ts`
(`planConsolidation`, pure); `server/db/migrations/consolidation/execute.ts`
(`consolidateProjects(tx)`: opens each source pool read-only, asserts the
source is at `041_drop_frozen_results_plane`, calls the planner, applies the
plan through `tx`); the three staged migration files under
`server/db/migrations/consolidation/staged/` (`000_legacy_project_shell.sql`,
`085_consolidate_projects.ts`, `086_drop_project_layer.sql`), which the
runner does not scan and step 9b moves into `instance/`;
`validate_consolidation.ts` at the repo root (`--local` against the dev DB,
fleet mode through the `PROTOCOL_ACCESS_DBS` path, `--json` output for the
step 10 post-check); `validate_consolidation_replay` at the repo root (the
throwaway-postgres harness, mirroring `validate_migrations`);
PROTOCOL_APP_MIGRATIONS (the `.ts` migration rules); SYSTEM_02 globs and
prose.

**Deliverable.** Everything D9 and D13 describe for 085, the planner and the
dry-run, executable end to end in a throwaway database, with the live
migration files staged but not active. The planner's frozen row types are
copied from `version2`'s `_project_database_types.ts`. The folder plan is
D10's nested shape. The dry-run report per instance lists what D13 names.

**Not in this step.** Placing any file in `migrations/instance/` other than
084. Any change to `db_startup.ts`. Any product read or write in the app.

**Gates.** `deno check server/db/migrations/consolidation/**/*.ts` on top of
the typecheck. `validate_consolidation_replay` green, which means three
things. (a) A throwaway postgres is seeded with the pre-restructure base,
all current instance migrations, and two project databases seeded
byte-identically (the `WITH TEMPLATE` case), each holding at least one
figure in a live table and one in a version snapshot. Run through 000, 084,
085 and 086, it ends with: folders nested per D10; every id collision
re-minted and the full reference surface rewritten; all four figure surfaces
stamped; and a schema dump byte-identical to "fresh base plus 084 plus 086".
(b) A second database seeded with users carrying `default_project_*` flags,
logs with `project_id`, and aggregate rows that differ only by `project_id`
comes out with logs and users preserved and the aggregate rows merged. (c)
The two negative controls Appendix A names (000 without the
`user_logs_aggregate` ALTER; 000 without any log ALTER) still fail at 035
and 016. `validate_consolidation.ts --local` against the dev DB reports zero
FAIL and
its counts are recorded in §9. The fleet run is done from this step's
session if the read-only access is configured, otherwise the session ends
with the command ready and the log says so.

**Reference.** Commits 1c5acebc, 3c93b798, d32d555b. Files:
`server/db/migrations/consolidation/plan.ts` (732 lines; the header comment
is the best statement of the collision and stamping rules),
`server/db/migrations/instance/080_consolidate_projects.ts`,
`validate_consolidation.ts`, `server/db/migrations/runner.ts`,
`PROTOCOL_APP_MIGRATIONS.md`. The reference asserted source migration 039;
this tree is at 041.

**Ends with.** Two or three commits (runner; planner and replay; dry-run
tool). The tree is deployable on a normal release. §9 carries the dev-DB
dry-run counts and, if run, the fleet totals: instances, FAILs,
pending-deletion and central-reporting projects, dropped visualizations and
dashboards, viewer-only users.

### Step 3: Run-keyed reads with scope, and the authoring context

**Surface.** `lib/api-routes/instance/run_generation.ts` (the five routes in
§3.3, added; existing routes untouched); `lib/types/run_authoring_context.ts`;
`server/routes/instance/run_generation.ts`; `server/run_query/
{run_data_reads,run_read,virtual_defaults}.ts` (nullable `adminArea2` on the
read bodies; `deriveVirtualDefaults(manifest)` memoised by runId; the
project lens and `findVirtualDefault` stay, unused by the new routes);
`server/run_query/authoring_context.ts` (`buildRunAuthoringContext`); the
§3.10 relocation of the run-capture and module-config helpers into
`server/runs/capture_inputs/{hfa,hmis,iceh}.ts` and
`server/runs/module_config.ts`, with the old `db/project` files becoming
re-exports of nothing (deleted) and every importer updated;
the three §3.10 renames (`RUN_FACILITY_COLUMN_NAMES` / `RunFacilityRow`,
`getRunDatasetsFromManifest`, `lib/types/datasets_in_project.ts` to
`run_datasets.ts`) and the switch of `projectScopeToken`'s live callers to
`scopeToken`; `query_rig/**` (scope as an axis, new cases); SYSTEM_06,
SYSTEM_08, SYSTEM_09 globs and prose; PROTOCOL_APP_QUERY_RIG "verified
controls".

**Deliverable.** D7 without the deletions. Every new route is guarded by
`requireGlobalPermission()` with no permission for now and swapped to
`requireApprovedUser()` in step 5 when the guard exists (record this in
§9). The data reads require `runs.status = 'ready'`. The Valkey key shape
keeps `runId` leading and `scopeToken` trailing; `PO_CACHE_VERSION` is not
bumped, and the step proves it by showing an existing national key is
unchanged.

**Not in this step.** Deleting the project lens, `getCacheStatus`, or the
project `presentation_objects` data half. Any client change. The
`server/db/project/presentation_objects.ts` reader (dies in 9b).

**Gates.** `./validate_queries` with the scope axis: every existing case
under national, plus cases for an AA2 scope on each read kind (the reference
added 13). A ten-line harness calls `buildRunAuthoringContext` for the dev
pin and `getProjectDetail`'s projection for a project attached to the same
run and diffs them (equal modulo time points and key order).
`./mcp_probe` against local: the `/mcp` tools' output is byte-identical
before and after (the headless allowlist and national default are
untouched).

**Reference.** Commits a2c74c04, a988418f, c322098e, 30c73212 (the rig's
scope axis). Files:
`server/run_query/authoring_context.ts`, `server/run_query/run_data_reads.ts`,
`lib/types/run_authoring_context.ts`, `lib/api-routes/instance/run_generation.ts`
(the five route definitions are printed in §3.3), `server/runs/capture_inputs/*`,
`server/runs/module_config.ts`, `query_rig/cases.ts`. The reference's
`run_read.ts` and `disaggregation_availability.ts` had already moved once
(commit 6e0f8aa7 corrected the plan); re-derive homes from this tree.

**Ends with.** Two commits (relocation; reads and rig). Nothing user-visible
changed; the project pages still read through the lens.

### Step 4: FigureBundle scope and runId, staleness, the update action

**Surface.** `lib/types/_figure_bundle.ts` (`scope` and `provenance.runId`,
optional); `lib/figure_package_issue.ts` (`figurePackageIssueFor`,
`figurePackageIssueForMetrics`, `requestedDisaggregationOptions`; extracted
from the private `issueFor` in `server/runs/package_compatibility.ts`, which
imports the lib version back); `client/src/state/instance/
t2_run_authoring_context.ts` (the immutable T2 cache over step 3's route,
keyed `[runId]`, the `t2_runs.ts` idiom);
`client/src/generate_visualization/figure_staleness.ts` (pure);
`generate_visualization/{resolve_figure_from_metric,
resolve_bundle_from_metric_and_config,get_data_config_from_po,
assert_replicant_valid}.ts` (capture-on-write from the container's
PackageScope; `getRollupRowLabel` reads `bundle.scope` and falls back to the
container's scope only when the bundle predates step 4);
`client/src/components/figure_editor/stale_figure_badge.tsx` (a new
directory; 7a moves the embedded editor into it),
`components/slide_deck/deck_stale_figures.ts`, the slide figure block and
`ReportFigureEmbed.tsx` (badge and "Update to" action, taking a
`PackageScope` prop from their container); the deck and report headers
("Update all figures" with a count); `components/slide_deck/slide_ai/
resolve_figure_from_metric.ts`; SYSTEM_10 prose (bundle contract, roll-up
label rule, identity claim restated as "identical code path; identical
output when the pairs match").

**Deliverable.** D4 with the container being the project editor for now (it
supplies `{ runId: project.run_id ?? pin, adminArea2: project.admin_area_2
}`) and the product editor from 7a. The update action re-resolves through
the step 3 authoring context.

**Not in this step.** Deleting `buildResultsPackageCompatibilityReport` or
the compatibility modal (9b, 9a). Making the two fields required (9b). Any
server change beyond the lib move.

**Gates.** A `deno task test` case in `server/tests/` for the lib schema: a
stored bundle without the two fields parses; one with them parses. A
harness (`deno run --allow-all -c deno.json`, absolute-path import of the
client file) for `isFigureBundleStale` on the four combinations of matching
and mismatching pair, plus the missing-field case returning false; if the
client file cannot be imported under Deno because of its own imports, the
predicate is split into a dependency-free module so it can be. In dev: an
existing deck renders unchanged; a figure added
now carries both fields (inspect the stored config); changing the project's
attached package makes that figure's badge appear and "Update" re-resolves
it; a metric absent from the new package shows the reason on the figure.

**Reference.** Commits 1c5acebc (schema), a2c74c04 (`issueFor` to lib),
e424264f (staleness, badges, `getRollupRowLabel`). Files:
`lib/types/_figure_bundle.ts` lines 114 to 147, `lib/figure_package_issue.ts`,
`client/src/generate_visualization/figure_staleness.ts`,
`client/src/components/figure_editor/stale_figure_badge.tsx`,
`client/src/components/slide_deck/deck_stale_figures.ts`,
`client/src/generate_visualization/get_data_config_from_po.ts` lines 97 to
135 (the first behavioural defect's fix).

**Ends with.** One or two commits. The transitional optional state is
recorded in §9 with "closed by 9b".

### Step 5: Products DB layer, routes, guard, SSE

**Surface.** `server/db/products/{mod,products,folders,slide_decks,slides,
reports,versions,move_slides,copy_slides}.ts` (built from the `db/project`
counterparts, rekeyed to `mainDb` and the `products` join; the originals stay
until 7a); `server/utils/id_generation.ts` (4 chars, table-aware collision
check); `server/middleware/userPermission.ts` (`requireApprovedUser`,
`requireProductAccess`); `server/auth/global_user.ts` (`getGlobalUser`,
`buildGlobalUserFromDb` moved here; `project_auth.ts` imports them back);
`server/auth/product_access.ts` (`productAccessPolicy`, approved at every
level); `lib/api-routes/route-utils.ts` (the `access` field on the route
definition type, optional so instance routes are untouched);
`lib/api-routes/products/{products,folders,slide-decks,slides,reports}.ts`
(the §3.3 paths under `/products/:product_id`, every entry with `access`);
`server/routes/products/*.ts`; `lib/api-routes/combined.ts`; `main.ts`
mounts; `lib/api-routes/
instance/run_generation.ts` (`listAttachableResultsPackages` returning
`ReadyPackage[]`; the step 3 routes swapped to `requireApprovedUser`);
`server/db/instance/run_generation.ts` (`setProductRun`, the product delete
guard, `attached_products` json_agg beside `attached_projects` until 9b);
`lib/types/instance_sse.ts` (the §3.4 additions to `InstanceState` and the
message union); `lib/types/last_updated_tables.ts`
(`ProductLastUpdateTableName` added beside the project union, which stays
until 9b); `lib/types/run_generation.ts` (`attachedProducts` added beside
`attachedProjects` on `RunCatalogItem`, additive);
`server/task_management/{build_instance_state,notify_instance_updated}.ts`
and a new `notifyInstanceLastUpdated(tableName, ids, ts)` beside the project
`notifyLastUpdated`, which is not touched; `server/routes/instance/
instance-sse.ts` (withhold the product lists from unapproved connections);
`client/src/state/instance/{t1_store.ts,t1_sse.tsx}` for exactly one reason:
`EMPTY_INSTANCE_STATE` is a typed literal of `InstanceState`, so the new
fields must be added there and applied from `starting` and the new messages,
with no consumer yet; SYSTEM_01, SYSTEM_03, SYSTEM_12 globs and prose;
PROTOCOL_APP_ROUTES (the single guard recipe).

**Deliverable.** D1, D8's additions, §3.2's two guards, every product and
folder route in §3.3 at its stated path with its stated access level,
including `duplicateProduct` and `copySlidesToSlideDeck`, §3.4's messages and
`ProductSummary`. No handler checks access itself; a handler that receives
a `slide_id` or `version_id` scopes the query by `product_id` as well. The
folder cycle check is a recursive CTE
inside the `updateFolder` transaction returning the typed `FOLDER_CYCLE`
failure through the envelope. `deleteFolder` reparents one level and returns
`freedProductIds`. `createProduct` resolves the pin inside the insert and
returns the typed `NO_READY_PINNED_PACKAGE` through the envelope.

**Not in this step.** Collab (7a). `version_capture` (7a). Any client file
other than the two T1 files named above, and in those, nothing beyond
storing the new fields. Deleting any project route. The `emails` move (7a).

**Gates.** Before writing a mount, list the current `main.ts` mounts and the
project registries' paths and show that `/products` and `/folders` collide
with nothing. A typecheck-level gate: every entry in
`lib/api-routes/products/*` has `access` set (a `satisfies` over the
registry, or a test that walks it). A rung 1a harness against local: an
unauthenticated call to any product route is 401 and an unapproved user's
is 403; a slide id requested under the wrong `product_id` is 404; create a
deck and a report (4-char ids; label
localised; `run_id` = the pin), `starting` carries both with the right
summary shape, set package to a ready run and to a non-ready run (the second
refused in the UPDATE), set scope, create three nested folders, move a
folder into its own descendant (`FOLDER_CYCLE`), delete the middle folder
(children and products reparent one level; `products_upserted` for the freed
ids), duplicate a deck (the copy carries the same `(run_id, admin_area_2)`),
copy two slides to another deck (bundles verbatim), delete all products in
one batch (`products_deleted`, CASCADE verified by counting `slides`). An
unapproved connection's `starting` carries no products, folders or ready
packages. `deleteRun` refuses while a product points at the run. The client
typecheck passes with the new T1 fields stored and unread.

**Reference.** Commits 0477beb9, c322098e, 3c93b798, 28d138de, caaa2666,
714fd4e4 (server half). Files: everything under `server/db/products/`,
`lib/api-routes/products/`, `server/routes/products/`;
`server/middleware/userPermission.ts` line 28; `server/auth/global_user.ts`;
`lib/types/instance_sse.ts`; `server/task_management/notify_instance_updated.ts`.
The route names are printed in §3.3. `ProductSummary` was trimmed after the
first build (commit 28d138de); build the trimmed shape.

**Ends with.** Three commits (guard and global_user; DB layer; routes, SSE
and the passive T1 fields). The Products tab does not exist yet; the new
plane is reachable only through the API.

### Step 6: Empty Explore tab and the insert-figure wizard

**Surface.** `client/src/components/explore/index.tsx` (the empty page);
`client/src/components/figures/insert_figure/**` (moved from
`components/project/add_visualization/` plus `project/preset_preview.tsx`,
fed by an authoring context; the project page imports from the new path);
`client/src/components/_shared/scope_picker.tsx` (renamed from
`project_scope_picker.tsx`; copy says "Scope"; its importers, project
settings and `instance/add_project.tsx`, switch to the new name);
`client/src/state/products/{t2_figure_data,t2_replicant_options}.ts` (keyed
`(runId, scopeToken, ...)`, version constant; the project caches untouched);
`client/src/components/instance/index.tsx` (the Explore tab, approved users,
after Projects for now); translations for the new strings; SYSTEM_11 and
SYSTEM_14 globs and prose.

**Deliverable.** The parts of D6 this plan builds: the insert-figure wizard
under `figures/insert_figure/**`, fed by step 4's authoring-context cache
and reading figure data through the scope-keyed T2 caches, with the
project's add-visualization flow importing it from the new path; the scope
picker rename; the Explore tab entry, approved users, rendering an empty
page.

**Not in this step.** Any write. Any product. The results explorer page and
everything D6 defers with it. Deleting `project_metrics.tsx` or the
project's `add_visualization` (they now import the moved files).

**Gates.** `./validate_protocols` with no new baseline entries. In dev: the
Explore tab opens empty for an approved user; the project's
add-visualization flow still offers the pin's presets at national and at an
AA2 scope through the moved wizard; reopening a preset preview under the
same `(runId, scopeToken)` does not refetch items already in the T2 cache;
the project Metrics tab still works.

**Reference.** Commit bc1bbc31. Files:
`client/src/components/figures/insert_figure/*`,
`client/src/components/_shared/scope_picker.tsx`,
`client/src/state/products/t2_figure_data.ts`. The reference's
`client/src/components/explore/*` is the results explorer plan's reference,
not this step's.

**Ends with.** Two commits (move and rename; the tab). The insert-figure
wizard renders from an authoring context with no project, and the Explore
tab exists, empty.

### Step 7a: The switch. Editors live on products

**Surface.** Editors: `client/src/components/slide_deck/**` and
`client/src/components/report/**` take `{ productId }`, derive `scope()`
from the T1 products row, read the authoring context from T2 by that live
`runId`, and gate edits on one `canEditProduct(productId)` in
`client/src/state/instance/product_access.ts` (returns `currentUserApproved`
today); `client/src/components/products/product_types.ts` (the §3.6 type
registry, with the two types);
`components/_editor_snapshot.ts`; `components/visualization/` renamed
`components/figure_editor/` (the embedded editor and its panels only; the
standalone files stay in the old directory until 9a and import the inner
editor from the new path); `PresentationObjectPanelDisplay` takes `{ scope,
authoringContext }`; `ReplicateByOptions`, `slide_presenter`, `slide_card`,
`view_results_object.tsx` (run-keyed raw preview), `version_history/**`
(no projectId; editor names from the instance roster), `share_slide_deck`
(instance roster), `download_*`, `_shared/{connection_banner,live_cursors,
presence_toasts}`, `cursors/` (page cursors off the list),
`generate_slide_deck/convert_slide_to_page_inputs.ts`. State:
`client/src/state/instance/{t1_store,t1_sse.tsx}` (products, folders,
readyPackages, lastUpdated, `reconnectForApproval`),
`state/instance/collab.ts` (moved from `state/project/`, connected by the
instance boundary when approved; its importers on the project side,
`visualization_editor_inner.tsx`, `PresentationObjectPanelDisplay.tsx`,
`project_ai/.../presence_guard.ts` and `cursors/page_cursors.tsx`, switch to
the new path; the store's PO-room half stays until 9a and gets no server),
`state/products/{t2_slide_deck_detail,t2_report_detail,t2_slides,
t2_images}.ts`, `state/_infra/reactive_cache.ts` (a second version source
over `InstanceState` beside the `ProjectState` one, which
`state/project/{t2_dashboards,t2_presentation_objects,t2_replicant_options}.ts`
still use until 9a), `state/t4_ui.ts` (`pendingEditorOpen`). Server:
`server/routes/instance/collab.ts` (`GET /collab`),
`server/routes/project/project-collab.ts` (the slide and report room
handling stripped out; the file and its PO rooms stay until 9b, and
`project_awareness_update` stays in `lib/types/collab.ts` with it),
`server/db/project/mod.ts` (pruned of the deleted files), `server/collab/*`
(projectId out of room, ledger and accumulator keys; the subscribe message
carries `productId` and rooms are keyed `productId::docType::docId`;
product-keyed presence; checkpoints emit `products_upserted`),
`lib/types/collab.ts` (the subscribe shape), `server/collab/version_capture.ts`
repointed to `db/products`, `lib/api-routes/instance/emails.ts` and
`server/routes/instance/emails.ts` (moved from project; recipients =
instance roster). Products page, minimal:
`client/src/components/products/{index,product_card,product_settings,
duplicate_products_modal}.tsx` (two create buttons, each its own
`createButtonAction`; a flat card grid; open on click; the settings surface;
no folders UI yet). Instance shell: Products tab first and default; the
project shell's Decks and Reports tabs removed with their files (the D12
step 7a list). SYSTEM_10, SYSTEM_12, SYSTEM_14, SYSTEM_16 globs and prose;
PROTOCOL_APP_STATE tier inventories.

**Deliverable.** A deck or report is created, opened, edited alone and
together, versioned, restored, emailed, downloaded, reattached and rescoped
as a product. The project shell keeps Metrics, Visualizations, Dashboards,
Results package and Settings until 9a.

**Not in this step.** Folders UI, list view, menus, search, deep link,
copy-to-deck (7b). Copilot (8): the project AI wrapper
still mounts on the project shell, and the editors opened from the Products
page have no copilot until step 8; say so in §9. Deleting `po_rooms.ts`,
`project-collab.ts` or `project_awareness_update`.

**Gates.** `./validate_protocols` (baseline entries only for moved paths,
each shown in §9). In dev, with two browser sessions: create both product
types; edit a slide in both sessions and see the co-edit; a checkpoint bumps
`products.last_updated` and the summary arrives on the other session; save
and restore a version; change the package in settings and see the D4 badges
in both sessions without reload; "Update all figures"; delete the product
and see both sessions' editors close. The project Decks and Reports tabs
are gone; the remaining project tabs render, with PO co-editing on the
Visualizations tab dead as the intermediate-states table says. An
unapproved user sees no Products tab content and the SSE carries nothing.

**Reference.** Commits 838039a5, e424264f, 3c93b798 (collab and
`version_capture`), bc1bbc31 (the first, flat Products page). Files:
`client/src/components/slide_deck/index.tsx` and `report/index.tsx` (the
`Props` shape and `scope()`), `client/src/state/instance/t1_store.ts`,
`t1_sse.tsx`, `collab.ts`, `client/src/state/products/*`,
`server/routes/instance/collab.ts`, `server/collab/*`,
`client/src/components/products/index.tsx` lines 241 to 265 (the second
behavioural defect's fix), `product_settings.tsx`.

**Ends with.** Several commits, each green: state and SSE consumption;
collab; editors; minimal page and the project tab removal. Record every
defect found while running the app in §9.

### Step 7b: The product explorer

**Surface.** `client/src/components/products/{index,folder_tree,folder_card,
product_card,list_view,product_menu,folder_menu,move_to_folder_modal,
edit_folder_modal,product_types}.ts*` (the registry gains the fields the
list rows and chips read); `client/src/state/t4_ui.ts`
(`productsOpenFolder`,
`productsViewMode`, `productsSortMode`, `productsTypeFilter`,
`_PRODUCT_QUERY_PARAM`, `productDeepLinkHref`); `components/_shared/
sort_control.tsx` if shared; `slide_deck/slide_list.tsx` ("Copy to deck…")
and `copy_slides_to_deck_modal.tsx`; translations; SYSTEM_12 and SYSTEM_14
prose (the product explorer model, the deep link).

**Deliverable.** D16 in full, on top of 7a's minimal page.

**Not in this step.** Drag-and-drop, a batch action bar, folder
multi-select, a trash (all ruled out). Copilot. Any server change (the
routes exist since step 5; if one is missing, it is a §9 entry and a small
server commit, not a redesign).

**Gates.** A harness (`deno run --allow-all -c deno.json`, absolute-path
import; `folder_tree.ts` must stay dependency-free so this works) over
children, ancestors, path labels, descendant sets and picker options, each
on a tree with a deliberately corrupted cycle (the walk terminates). In dev:
navigate three
levels deep, breadcrumb collapses, view mode and location survive reload;
chips filter products only and folder counts follow; search escapes the
location and shows paths; Move into ▸ caps at 10 and offers More…; Move up
and Move to top level; the picker excludes the moved folder's subtree;
deleting a folder reparents; `?product=<id>` opens the editor after
hydration and a dead id is dropped; Copy to deck lands the slides stale
under a deck with a different pair.

**Reference.** Commits bd899322, caaa2666, 714fd4e4, ee7c28d8, 6e847ae3,
e3b9bf83, fcea838c, cbd8375f, 03822f32. Files: everything under
`client/src/components/products/` (the file-by-file descriptions are in the
reference's SYSTEM_12, "The Products page" section, which D16 restates).
The reference's scattered per-type dispatch (`PRODUCT_TYPE_ICONS`,
`productTypeLabel` in `product_card.tsx` and `list_view.tsx`) and its
`canEditProducts()` are not the model; §3.6's registry and
`canEditProduct(productId)` are.

**Ends with.** Several commits. The Products page is the only route to a
deck or report.

### Step 8: Copilot remount

**Surface.** `client/src/components/copilot/**` (renamed from
`project_ai/`; the wrapper mounts once around the Products page and both
editor overlays; the Explore tab is empty until its own plan);
`copilot/ai_tools/{client_env,source_header,
reresolve_slide_figures,add_slide_to_deck}.ts`, `AddToDeckModal.tsx`,
`DeckSelector.tsx`, `DraftSlidePreview.tsx` (the deck and report pickers
read `client/src/components/products/product_types.ts`, which may gain a
field here); `copilot/ai_tools/tools/*` and
`tools/_internal/format_*_for_ai.ts` (products list with folder paths; the
viz tools, `visualization_editor.tsx` and `DraftVisualizationPreview.tsx`
deleted here, since no mount reaches them); `copilot/{ai_views,
build_system_prompt,build_tools,interactions,authoring_context,types}.ts`;
`copilot/ai_documents/*` and the store `client/src/state/products/
t4_ai_documents.ts` (moved from `state/project/`, keyed
`ai-documents/copilot`); `copilot/ai_tools/client_info_topics.ts` and
`client/public/info/*.md`;
`lib/types/ai_input.ts` descriptions; `lib/ai_tools/{env,build_system_prompt,
tools_metrics,tools_info,info_catalog}.ts`; `lib/types/instance.ts`
(`InstanceConfig.aiContext`), `server/db/instance/config.ts` and the settings
route, `client/src/components/instance/ai_context_form.tsx`
(`can_configure_settings`); `server/routes/instance/copilot_ai_proxy.ts` and
`ai_files.ts` (moved from project, `requireApprovedUser`) and the `main.ts`
`/ai` mount, which today points at the project proxy and is repointed at the
copilot one (the project `ai_proxy.ts` file stays, unmounted, until 9b);
`indicator_manager_hfa/ai/sdk_client.ts`
(default headers); `slide_deck/slide_ai/*` (take scope and context);
`server/mcp/{env,mcp_tools,context_cache}.ts` (source header shared);
`server/tests/*`; `validate_protocols_baseline.json` (path rename only);
SYSTEM_13 globs and prose; PROTOCOL_APP_AI_TOOLS.

**Deliverable.** D15.

**Not in this step.** Deleting `project_ai/` remnants that the project shell
still imports (9a). `ai_usage_logs.project_id` (9b).

**Gates.** `deno task test` (the MCP source-header test and its SPA twin).
`./validate_protocols` with the baseline diff limited to the path rename and
shown in §9. In dev: the copilot opens on the Products page with the pin
env; opening a deck attached to a different package switches the env and
the source header names that package and scope; a drafted slide added to a
deck from the Products page re-resolves under the chosen deck's pair; the
instance AI context textarea saves and appears in the system prompt.

**Reference.** Commits 02471d74, c2993b2a, cad2f083, ee7c28d8. Files:
`client/src/components/copilot/index.tsx`, `ai_views.ts` line 92 (the
reference's five views; D15 has four), `ai_tools/client_env.ts`, `ai_tools/source_header.ts`,
`ai_tools/reresolve_slide_figures.ts`, `client/src/components/instance/
ai_context_form.tsx`, `server/routes/instance/copilot_ai_proxy.ts`.

**Ends with.** Two or three commits. One copilot mount serves the Products
page and both editors.

### Step 9a: Client strip

**Surface.** The D12 step 9a list. `client/src/components/instance/index.tsx`
(Projects tab removed; final tab set per D17). `client/src/app.tsx`
(`/d/:slug` route). `client/src/onboarding/**` (the 33 project-area tours
deleted; one products tour set added; the instance tour
catalogue stops fanning out `getProjectDetail`; tour ids renamed; telemetry
loses `projectId`; `tour_catalogue_instance_modal.tsx` deleted).
`lib/translate/*` and every en, fr and pt literal (§3.6 copy sweep).
`feedback_form` (`context` instead of `projectLabel`),
`change_email_modal.tsx`, `state/clear_caches.ts`, `state/_infra/
reactive_cache.ts` (`getSnapshotProjectState`, `pdsNotRequired`,
`responseRunVersionMatches` and the `ProjectState` version source gone),
`state/project/**` remainder, `exports/**` dashboard files. SYSTEM_11,
SYSTEM_14 globs and prose.

**Deliverable.** A client with no project, except the results-package
wizard's attach step and confirm copy, which depend on the launch body type
and go in 9b. Server registries under `lib/api-routes/project/` still exist
and are simply unimported.

**Not in this step.** Any server or `lib/api-routes` file. Any migration.
`lib/types/last_updated_tables.ts` (9b). `instance_results_packages/**`
(9b).

**Gates.** The greps from §5, items 1 to 3, restricted to `client/src`,
`client/public/info` and `lib/translate`, at zero, with
`client/src/components/instance_results_packages/**` excluded until 9b.
`./validate_protocols`. Dev boot with the final tab set; every tab renders;
the tours menu offers the new sets.

**Reference.** Commits 5bb7f672, 39fb59cb, bc1bbc31, e63c7b97, cad2f083,
57d4c684 (client halves). Files: `client/src/onboarding/{index,tours,
catalogue}.ts`, `lib/translate/common.ts`, `client/src/components/instance/
index.tsx`.

**Ends with.** Two or three commits (project shell and dashboards and viz
products; tours; copy sweep).

### Step 9b: Server strip and consolidation

**Surface.** The D12 step 9b list. The staged migrations moved from
`migrations/consolidation/staged/` into `migrations/instance/` and 085
registered in `TS_MIGRATIONS`. `_main_database.sql` final (projects,
`project_user_roles`, `dashboard_slugs`, the 18 user columns, the three
`project_id` columns and their indexes removed; `idx_user_logs_aggregate_unique`
without COALESCE). `db_startup.ts` (per-project loop, slug backfill, orphan
DB drop, `PROJECT_DATA_TRANSFORMS` gone; the three survivors as instance
transforms; the `runs.summary` transform block). `runner.ts` project mode
and `validate_migrations` project half. The transport (`route-utils.ts`,
`create_server_action.ts`, `route-tracker.ts`, `cors.ts`). The follower
model and attach targets (`db/instance/run_generation.ts`,
`lib/types/run_generation.ts` with `attachedProducts` final,
`lib/types/run_manifest.ts`, `generate_run/{launch,pipeline,types}.ts`,
`build_run_package.ts`, the wizard client's attach step and confirm copy,
`detail.tsx`, `_prune*.ts*`). `main.ts` (the project-collab, project-SSE,
public dashboard and unmounted project AI proxy imports; the purge cron).
`health.ts`, `backups.ts`, `disk_space.ts`, `users.ts` columns and H_USERS
branches, the `getMyProjects` route, `getProjectsForUser`,
`rename_user_email.ts` (main-DB sweep), `lib/types/permissions.ts` trimmed
to the six instance flags, `permission_labels`, `lib/types/instance.ts`
(`ProjectUser`, `createDevProjectUser`, `RenameEmailResult`),
`lib/types/last_updated_tables.ts` (the project union and its emitter
deleted; `ProductLastUpdateTableName` becomes the only union, renamed
`LastUpdateTableName`), `figure_config_crdt.ts` PO half,
`caches/visualizations.ts` PO detail cache, `project_auth.ts` deleted
(`server/tests/pat_identity_parity_test.ts` repointed to
`server/auth/global_user.ts`), `static.ts` and `oauth_metadata.ts`
comments, `anthropic_messages_proxy.ts` and `ai_usage_logs.ts` without
projectId, `lib/types/collab.ts` (`po_*` and `project_awareness_update`),
`server/collab/po_rooms.ts`, `server/collab/presence_registry.ts`
(`relayProjectAwareness`), `project-collab.ts`. D4 closed:
`scope` and `provenance.runId` required; the `getRollupRowLabel` fallback
and the staleness missing-field branch removed. SYSTEM_00, SYSTEM_01,
SYSTEM_02, SYSTEM_03, SYSTEM_05, SYSTEM_08, SYSTEM_15, SYSTEM_16, SYSTEM_17
globs and prose; PROTOCOL_APP_MIGRATIONS (no project dir; transform
signature); PROTOCOL_APP_WORKER_ROUTINES.

**Deliverable.** A server with no project, and the consolidation live.

**Not in this step.** The ops scripts (10). CI scripts (10). This plan's
deletion (10).

**Gates.** `./validate_migrations` (main only). `./validate_queries`.
`validate_consolidation_replay` green with the files in their final places.
A fresh-postgres boot (000 through 086 plus transforms) exits 0. The dev DB
consolidated by `./run`: the products, folders, slides and versions counts
match the step 2 `--local` plan exactly; a report and a deck version restore
on a migrated product; a migrated AA2 product's export labels its roll-up
row by the bundle's scope. §5 greps 1 to 4 at zero. `./mcp_probe` output
unchanged from step 3's baseline.

**Reference.** Commits 0477beb9, 57d4c684, 5bb7f672, c52bb81d, c322098e,
41e95a2c, a2c74c04, 941c7f1e. Files: `server/db/migrations/instance/
{000_legacy_project_shell.sql,081_drop_project_layer.sql}`, `server/db_startup.ts`,
`server/db/instance/run_generation.ts`, `lib/api-routes/route-utils.ts`,
`lib/server_actions/create_server_action.ts`.

**Ends with.** Several commits, ordered so each is green: transport and
follower model; ops surfaces; project DB layer and routes; migrations and
`db_startup`; D4 closed. The app runs on migrated data.

### Step 10: Ops scripts, docs read-through, close

**Surface.** `rollout_products`, `restore_main`, `purge_legacy_dbs` (repo
root; §3.9). `.github/scripts/sync-docs.sh` (terminology line and image
path) and `generate-changelog.sh` (example text). SYSTEMS.md custody rows
and its own section 6 vocabulary line ("product / folder / scope / figure /
preset").
Every SYSTEM file whose globs changed, read against the code once more.
PROTOCOL_APP_{ROUTES,STATE,MIGRATIONS,QUERY_RIG,DEVELOPMENT,UI_CONVENTIONS,
WORKER_ROUTINES,AI_TOOLS}, CLAUDE.md, USER_GUIDE_MCP ("per-project" lines),
`PROTOCOL_ACCESS_DBS.md` (git-ignored, rewritten locally).
`validate_protocols_baseline.json` reviewed entry by entry. `lib/help/
help_targets.generated.ts` left as is until the docs site is rewritten.
This file is deleted by step 10's reviewer, not by the Do session.

**Deliverable.** The repo reads as if written today. The rollout tooling
exists and `rollout_products` consumes the step 2 dry-run's `--json`.

**Gates.** Every gate in §5. `git ls-files | grep -i "project\|dashboard"`
at zero excluding `server/db/migrations/**`, `panther/**` and
`_archive_*/**`. `restore_main` is rehearsed in the runbook, not here.

**Reference.** Commits 3c93b798 (the three scripts), 941c7f1e, 514a11ce,
587ca8a6 (docs). Files: `rollout_products`, `restore_main`,
`purge_legacy_dbs`, and the reference's SYSTEM files as prose models, each
checked against this tree's code before a sentence is reused.

**Ends with.** One or two commits and the line set to `Review 10`. The
review that passes deletes this file.

---

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-project gates; the
step that first reaches zero is named, and every later step keeps it there.

1. `grep -rn "projectId\|requiresProject\|state/project/\|Project-Id"
   client/src lib server main.ts` at zero, excluding
   `server/db/migrations/**`. Client half in 9a; server half in 9b.
2. `grep -rni "dashboard\|presentation_objects\|visualization_folder\|
   po_rooms\|follow_pinned\|followPinned" client/src lib server main.ts` at
   zero outside `server/db/migrations/**` and the figure-config vocabulary
   (`PresentationObjectConfig`, `getRunPresentationObjectItems`,
   `normalize_po_config`; §8). Client half in 9a; server half in 9b.
3. `grep -rli "projet\|projeto" client/src lib client/public/info` at zero
   (excluding "projection"). 9a.
4. `grep -rni "project" client/src lib server main.ts client/public/info |
   grep -vi "projection"` reviewed to zero outside `server/db/migrations/**`
   (000, 085, 086 and `consolidation/plan.ts` necessarily say it). Known
   residue excluded: `lib/help/help_targets.generated.ts` until the docs
   site rewrite. 9b.
5. `git ls-files | grep -i "project\|dashboard"` at zero excluding
   `server/db/migrations/**`, `panther/**`, `_archive_*/**`. 10.
6. `validate_consolidation_replay` green (step 2; re-run in 9b).
7. `validate_consolidation.ts` zero FAIL fleet-wide, counts reviewed (D2,
   D3, D11). Step 2 onward; a precondition of the runbook, not of any step.
8. 085 executed against the dev DB with counts matching the `--local` plan
   (9b).
9. Fresh-postgres boot exit 0 (1, 2, 9b).
10. `./mcp_probe` output byte-identical to the pre-step-3 baseline (3, 9b).

---

## 6. Rollout runbook and rollback

Everything here needs real infrastructure and is Tim's to trigger. Steps 1
and 2 of the plan ship early; everything else ships once, after step 10.

1. **After plan steps 1 and 2:** ship 084, the runner support and the
   dry-run tooling on a normal release. Run `validate_consolidation.ts`
   fleet-wide; fix and repeat until zero FAIL. Act on the `pending_deletion`
   and central-reporting lists (D11). Read the dropped-visualization,
   dropped-dashboard and viewer-only-user counts per instance: this is the
   last moment to change D2 or D3, and it comes before any product code is
   written.
2. Server-cli: path-agnostic nginx WS-upgrade template, re-emit fleet sites
   (harmless to the old `/project_collab` path; no window).
3. Coordinate the status-api field changes (§7) before the fleet deploy.
4. Take a named status-api backup of every instance immediately before
   rollout (`main` dump plus previous image = rollback; the previous image
   cannot boot after 086 without that dump). Rehearse `restore_main` on
   testing-tim.
5. `./deploy_testing` to testing-tim from `version2` after step 10 (it
   ships the working tree; check `git status`); verify products, folders and
   counts against the dry-run plan. Then merge `version2` into `main` and
   run `rollout_products` across the fleet with the per-instance post-check,
   one multi-product instance before the rest.
6. Wait at least a week with the fleet running on migrated data, then run
   `purge_legacy_dbs` per instance, which also retires the long-standing
   orphaned-UUID-DB open item and the legacy sandbox dirs.
7. After the purge: delete `validate_consolidation.ts`,
   `validate_consolidation_replay`, `rollout_products`, `purge_legacy_dbs`
   (and `restore_main` unless kept as general ops tooling) in one commit.
   `000`, `085`, `consolidation/plan.ts` and the runner's `.ts` support
   remain as migration history until the next base squash.
8. External follow-ups (§7), at the points §7 marks.

Rollback = `restore_main` from runbook item 4 plus the previous image;
project DBs are still on disk, untouched by 085.

---

## 7. External couplings (named, not fetched; separate repos and services)

- **status-api / Status Central Portal**: `/health_check` loses `projects`;
  `/projects` and `/project_activity` are gone; `/user_logs*` and `/ai_usage`
  rows lose `project_id`; per-project backup files stop appearing (main dump
  only); rename-email fan-out result shape. Coordinate before the fleet
  deploy: their pollers must tolerate the missing fields.
- **Fleet MCP connector** ("FASTR Results", `get_my_projects` and the
  project-scoped dialect): this repo's `/mcp` is already the pinned dialect;
  no change expected, but the connector's project vocabulary is stale after
  this.
- **server-cli**: path-agnostic nginx WS-upgrade template (before deploy);
  later and separately, sandbox-to-runs sites.
- **wb-fastr-site (docs)**: 15 EN and 15 FR pages mention projects; two
  wholly-project pages; the dashboard and visualization pages; 4 images; help
  tags `aproj-*`, `uproj-*`, `users-project-permissions`. After the site
  rewrite: `deno task build:help-buttons`. Not blocking (one help button
  consumed).
- **panther**: no code coupling; example snippets in `PROTOCOL_DENO_API.md`
  (`Project-Id`) and `PROTOCOL_UI_AI_CHAT.md` (`getSharedToolsForMetrics(env,
  projectId, ...)`). Edit in panther, re-sync.
- **wb-fastr-modules**: no coupling (`PROJECT_DATA_HMIS` is an opaque token;
  `DOC_MODULES.md` prose stale; `createDefaultVisualizationOnInstall` keeps
  its name and now means "is a preset").
- **Clerk**: `unsafeMetadata.onboarding` tour keys re-fire once after the
  rename; nothing else.
- **Public dashboard URLs** already shared (`/d/<slug>`) stop working. No
  redirect is provided.

---

## 8. Explicitly out of scope (later plans)

- The permission system rebuild (owner, edit and view on products and
  folders; the route access declarations, `productAccessPolicy`,
  `canEditProduct` and `RoomConn.canEdit` are its insertion points).
- A products trash.
- A public deck link (the only public surface dashboards provided).
- A figure library or cross-product figure clipboard beyond
  `copySlidesToSlideDeck`.
- Drag-and-drop in the product explorer.
- The results explorer, the Explore tab's page (D6): package Select and
  scope picker, module sidebar, metric cards, preset gallery, render area,
  "Configure", "Add to deck / report…" with `add_to_product_modal.tsx`,
  `metric_details_modal.tsx`, the `exploreRunId` / `exploreAdminArea2`
  state, the copilot's `viewing_explore` view and its tour. Its own plan;
  reference `version2-reference` commit bc1bbc31,
  `client/src/components/explore/*`.
- The `PresentationObjectConfig` to `FigureConfig` vocabulary rename
  (`lib/get_fetch_config_from_po.ts`, `normalize_po_config.ts`,
  `getRunPresentationObjectItems`, `t2_figure_data` internals).
- The sandbox-to-runs directory rename.
- An in-app main-DB backup UI.
- Presence avatars and live cursors on the Products list.
- A dead-glob check in `lint_systems.ts`.
- Folding `./validate_queries` into `deno task typecheck` now that it runs
  in seconds.
- The next base squash that retires `000`, `085` and the `.ts` runner.
- Reworking the other `PLAN_*.md` files for the product world.

---

## 9. Build log

Append-only. One row per decision, deviation, correction or defect, and one
closing row per session (`Step N built`, `Step N reviewed: pass`, `Step N
reviewed: K findings`, `Step N fixed`). Newest last. The next agent reads
this section before its step.

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-08 | plan | Rewritten for the second pass on `version2`. Every file path re-verified against the tree; the D12 list dropped what tim-branch had already deleted (backfill and parity scripts, rollout scripts, `synthesize_run.ts`, the pg read plane, `calculated_indicators_snapshot.ts`); §3.10 re-derived from live imports. |
| 2026-09-08 | plan | Migrations renumbered: 084 products, then 000, 085, 086 at step 9b. The consolidation asserts `041_drop_frozen_results_plane`, not 039. |
| 2026-09-08 | plan | Folder nesting (`parent_id`) folded into D1, D10, D16 and the base DDL; the first attempt added it after its plan ruled flat. |
| 2026-09-08 | plan | D4's two bundle fields are optional from step 4 and required from 9b: a named transitional state so that capture-on-write can land before the consolidation stamps stored bundles. Alternative rejected: a throwaway project data transform stamping from the project row, which would need the pair at version-restore read time too. |
| 2026-09-08 | plan | Order changed from tier-by-tier to build-beside-then-strip. Steps 1 and 2 ship early. Deletion is 7a (deck and report project tabs), 9a (client) and 9b (server). |
| 2026-09-08 | plan | Extensibility pass (Tim's two future requirements: per-product and per-folder permissions; more product types). Product types need nothing: `products.type` plus one detail table per type is the extension point. For permissions: every product-scoped route moves under `/products/:product_id`, route entries declare `access`, one `requireProductAccess` middleware and one `productAccessPolicy` (approved at every level today), `canEditProduct(productId)` on the client, the product id in the collab subscribe and room key, `created_by`/`created_at` on `folders`, and `created_by` is provenance not ownership. D7 records that package data stays instance-level. A client type registry object replaces scattered per-type dispatch. |
| 2026-09-08 | plan | Two review passes over the draft (writing; consistency against the tree and the reference) applied. Notable corrections: step 4 depends on 3 and owns the authoring-context cache; step 5 adds the passive T1 fields, a separate `ProductLastUpdateTableName` and `notifyInstanceLastUpdated` so nothing project-keyed changes before 9b; `lib/types/presentation_objects.ts` is trimmed, not deleted; the intermediate-states table in §4 was added. |
| 2026-09-08 | 1 | Migration number confirmed: 084 was the next free one, so every 084 reference in this plan stands. |
| 2026-09-08 | 1 | Outside the Surface: `lib/types/mod.ts` gained two `export *` lines for `products.ts` and `scope.ts`. Without them `_main_database_types.ts` cannot type `products.type` as `ProductType` through the `lib` specifier the server uses everywhere, and steps 3 and 5 need the symbols reachable from the barrel. |
| 2026-09-08 | 1 | Outside the Surface, under the §0 rule that a gate is a committed harness: `validate_migrations_replay` at the repo root is the historical-shape replay (the seven Appendix A bases, every current instance migration, then `dbStartUp()` against the empty throwaway server). It is the reviewer's command for both the replay gate and the fresh-boot gate. Result: all seven shapes replayed with zero statement errors; fresh boot exited 0 with 87 migrations recorded. |
| 2026-09-08 | 1 | Deviation from the Deliverable: only `DBFolder` and `DBProduct` were added to `_main_database_types.ts`. `DBSlideDeck`, `DBSlide`, `DBReport`, `DBReportVersion` and `DBDeckVersion` already exist in `_project_database_types.ts`, and both files are star-exported through `server/db/mod.ts`, so adding them is a TS2308 ambiguity error. Every importer of the project versions uses the direct file path, so the collision is only in the barrel chain. The five detail row types land in step 5 with the `db/products/*` layer that reads them; that step must decide how the barrel carries both sets until 9b deletes the project file. This intermediate state is missing from the §4 table. |
| 2026-09-08 | 1 | `lib/types/scope.ts` is claimed by SYSTEM_12, as the step's Surface says; the reference claimed it under SYSTEM_09. |
| 2026-09-08 | 1 | Step 1 built. |
| 2026-09-08 | 1 | Tim's ruling, applied in a second commit: the version table is `slide_deck_versions` with `slide_deck_id` and `slide_deck_config` (was `deck_versions`, `deck_id`, `deck_config`), and the three related indexes follow (`idx_slides_slide_deck_id`, `idx_slides_slide_deck_sort`, `idx_slide_deck_versions_slide_deck`). The naming rule is now in §0 and every plan mention was rewritten (D1, D4, D9, §3.1, §3.3, §3.10, step 5). 084 was amended in place rather than followed by a rename migration, because it had been applied only to the dev database; dev was reset by dropping `deck_versions` and the 084 row of `schema_migrations`, then booting. |
| 2026-09-08 | 1 | Tim's ruling, applied in a third commit: `products` gains `UNIQUE (id, type)`, and `slide_decks` and `reports` each gain a fixed `type` column (`CHECK`, defaulted) with a composite FK `(id, type) REFERENCES products(id, type) ON DELETE CASCADE` in place of the single-column FK. A detail row can now exist only in the table its registry type names. Detail-row existence stays a writer rule (D1). Step 5's `DBSlideDeck` and `DBReport` row types carry `type`; its inserts may omit it (the default fills it). Dev was reset by dropping the seven product tables and the 084 row, then booting. |
| 2026-09-08 | 1 | Review 1. Commits b26a2792, 0964532c, eb507f27 read against the Surface, the Deliverable and §3.1: the 084 DDL is the §3.1 block byte-for-byte after `IF NOT EXISTS` normalisation, the base schema carries the same block, the lib contracts match the reference plus `Folder.createdBy`/`createdAt`, and `scopeToken` is identical to the live `projectScopeToken`, so the step 3 swap is safe. No caller uses the new symbols. The two files outside the Surface (`lib/types/mod.ts`, `validate_migrations_replay`) are accepted for the reasons already logged. Gates run by the reviewer, all green: `deno task typecheck`, `deno task test`, `./validate_protocols`, `./validate_migrations`, `./validate_migrations_replay` (seven shapes, 87 migrations each, fresh boot 87 recorded), and a server boot against the dev database, which listens in 6 s with its 14 boot tests passing; dev `main` carries the 084 row and the composite FKs. |
| 2026-09-08 | 1 | Finding: the D1 contract is restated in two code comments. `server/db/instance/_main_database.sql:173-183` and `lib/types/products.ts:1-9` (plus the `lastUpdated` field comment at `lib/types/products.ts:42-43`) both say, in the same words, that `products` is the registry every cross-type operation goes through, that folders nest by adjacency list, that `created_by`/`created_at` are provenance not ownership, and that `last_updated` is the product version. CLAUDE.md: one authoritative doc comment per contract, single-line pointers everywhere else. Keep the SQL block as the authority and reduce the TypeScript header to a pointer. |
| 2026-09-08 | 1 | Finding: `SYSTEM_02_persistence.md:325` joins the new replay sentence onto the existing "The one sanctioned edit" sentence in a 129-character line; the file is hard-wrapped at 80. Re-wrap the paragraph. |
| 2026-09-08 | 1 | Step 1 reviewed: 2 findings. |
| 2026-09-08 | 1 | Fix 1. Both findings applied in one commit: the `lib/types/products.ts` header and its `lastUpdated` field comment are now single-line pointers to the SQL block, which stays the one authoritative statement of the D1 contract; the `SYSTEM_02_persistence.md` replay paragraph is re-wrapped at 80 columns. Floor gates green: `deno task typecheck`, `deno task test` (14 passed), `./validate_protocols`, and a server boot against the dev database that listens with its 14 boot tests passing. No migration or query-engine file changed, so the two conditional gates do not apply. |
| 2026-09-08 | 1 | Step 1 fixed. |
| 2026-09-08 | 1 | Review of Fix 1, done by the fixing agent at Tim's direction (deviation from §0's fresh-reviewer rule, accepted for a two-comment fix). Commit 0edf2246 touches only the two finding targets plus the plan. The D1 contract now has one statement (`_main_database.sql:173-183`); `lib/types/products.ts` carries two single-line pointers. The SYSTEM_02 paragraph at 315-328 has no line over 80 (line 307 is 99 characters but pre-dates step 1 and is outside the finding). Gates were run green in the fix session. |
| 2026-09-08 | 1 | Step 1 reviewed: pass. |
| 2026-09-08 | 2 | Runner shape: `runMigrationsInDir(sql, dir, tsMigrations, label)` is exported and throws `MigrationFailure` (with the filename) at the first failed file; `runInstanceMigrations` and `runProjectMigrations` wrap it with the existing log-and-`Deno.exit(1)`. Reason: the replay harness drives the real runner over a throwaway directory holding the instance migrations plus the staged files, and the two negative controls have to catch the failure rather than die with the process. One map, `TS_MIGRATIONS = {}`, serves both directories. |
| 2026-09-08 | 2 | The replay's logic lives in `validate_consolidation_replay.ts` beside the bash wrapper `validate_consolidation_replay` (the `validate_protocols` and `validate_protocols.ts` precedent); the wrapper owns the container and passes `REPLAY_CONTAINER` for `pg_dump`. Neither root tool is in `deno task typecheck`; the reviewer's command is `deno check validate_consolidation.ts validate_consolidation_replay.ts` on top of the step's `deno check server/db/migrations/consolidation/**/*.ts`. |
| 2026-09-08 | 2 | D10 detail the plan does not rule: folders are emitted lazily, so a legacy sub-folder holding no deck or report, and a project holding no products, produce no folder (there is nothing to put in them). The reference did the same; the replay asserts it. |
| 2026-09-08 | 2 | Fact: `version2`'s `_project_database_types.ts` `DBSlide` omits `crdt_state` and `crdt_state_last_updated`, which the table carries since project migration 030 and the consolidation must copy. The planner's frozen copy adds the two columns. |
| 2026-09-08 | 2 | The dry-run tool exports `dryRunInstance` and `plannedCounts` and runs `main` only under `import.meta.main`. The replay calls it against the seeded instance before the migrations run and checks its zero FAIL, its D11 and D2 lists, and its planned counts against what 085 then inserted (8 products, 4 folders, 6 slides, 4 plus 4 versions, 11 remaps). That is gate 8's mechanism, reusable by 9b and by the step 10 post-check. The seeded live database is named `main` because the dry-run connects to `main`, as it must on an instance. |
| 2026-09-08 | 2 | Skip and hard-stop rules (`REQUIRED_SOURCE_MIGRATION`, `readProjects`, `readPinnedRunId`, `projectDatabaseExists`, `isSourceAtRequiredMigration`, `seedTakenIds`) live once in `execute.ts` and the dry-run imports them; the reference duplicated them. `seedTakenIds` tolerates absent product tables so the dry-run can run on the fleet before 084 ships. |
| 2026-09-08 | 2 | Replay result, 46 checks green through the real runner: live path (000, 085, 086 pending on an instance with 001 to 084 recorded; two WITH TEMPLATE project databases, a pending_deletion copy, a `copying` row), nested folders with the same-label deck and report sub-folders merged, 11 id remaps with `slides.slide_deck_id`, both version FKs, `slides[].id`, `slide_editors` keys and `restored_from_version_id` rewritten, 14 bundles stamped on all four surfaces and placeholders untouched, `ai_context` appended under a heading; users, logs and aggregates through 086 with the aggregate rows merged and the unique index rebuilt without COALESCE; both negative controls fail at 035 and 016; the fresh path records 90 migrations; both end schemas dump byte-identical to the base plus 086. |
| 2026-09-08 | 2 | Dev-DB dry-run (`--local`), zero FAIL: 12 ready projects, pin present, 1 project with `run_id NULL`; plan 15 products (4 decks, 11 reports), 7 folders, 26 slides, 6 versions, 0 remaps; dropped 11 visualizations (all user-authored), 0 visualization folders, 7 dashboards (6 public, 3 slugs), 59 dashboard items, 4 item groups; 9 users, 1 viewer-only, 7 with no project role; 0 pending-deletion, 0 central-reporting. |
| 2026-09-08 | 2 | Fleet dry-run (`./validate_consolidation.ts --json`, read-only, every running instance over ssh, about 70 minutes): 41 instances, 34 pass, 7 FAIL. Six FAILs are testing instances (`testing`, `testing-hfa`, `testing-tim`, `testing2`, `testing3`, `testing4`) with `run_id NULL` projects and no pin, the D5 hard stop; the runbook fix is to pin a package there. The seventh, `central-testing`, has no `runs` table (an instance that never reached the runs model), reported as "could not be checked". Every reachable source project database is at 041; no FK orphans; no absent databases. Totals: 3478 products; max 687 on one instance (nigeria; the D8 `starting` payload); 6320 visualizations deleted, all user-authored (default visualizations are no longer stored rows); 71 dashboards deleted, all public; 821 viewer-only users and 559 users with no project role become editors; 6 central-reporting projects; 10 pending-deletion projects not migrated. The per-instance log is not committed; the `--json` plan is in the git-ignored `rollout_logs/consolidation_plan.json`. |
| 2026-09-08 | 2 | Gates run green in this session: `deno task typecheck` (with `lint:systems`), `deno task test` (14 passed), `./validate_protocols`, `./validate_migrations`, `./validate_migrations_replay` (seven shapes, fresh boot through the new runner recorded 87 migrations), `./validate_consolidation_replay` (46 checks), `deno check` of the consolidation directory and the two root tools, and a server boot against the dev database that listens with its 14 boot tests passing. |
| 2026-09-08 | 2 | Step 2 built. |
| 2026-09-08 | 2 | Review 2. Commits e92be1ab, 6bd15343, a1b2efd6 read against the Surface, the Deliverable, D9, D10, D13 and D14. Surface: every changed file is in the list except `validate_consolidation_replay.ts`, accepted for the reason already logged (the `validate_protocols` split). Deliverable: the runner's literal `TS_MIGRATIONS` map, `.ts` discovery and the throw for an unregistered file; the planner's frozen row types (checked column by column against `_project_database.sql`), D10 nesting with lazy emission, the D14 4-char mint against `products` and `slides` with the live alphabet, the D9 item 6 collision remap over the full reference surface, D4 stamping on all four surfaces; the executor's per-project read-only pool after a `pg_database` check through `tx`, the 041 assertion, the D5 hard stop, every main statement through `tx`, the D15 `ai_context` merge; 000 byte-equal to the base's `projects` and `project_user_roles` DDL, 086 dropping exactly the base's 17 `default_project_*` columns and severing all five FKs into `projects`; the dry-run listing every D13 item. The planner's claim that a deck restore re-mints a taken snapshot slide id is true today (`server/db/project/versions.ts:533-544`). Gates run by the reviewer, all green: `deno task typecheck` (with `lint:systems`), `deno task test` (14 passed), `./validate_protocols`, `./validate_migrations`, `./validate_migrations_replay` (seven shapes, fresh boot 87 recorded), `./validate_consolidation_replay`, `deno check` of the consolidation directory and the two root tools, `./validate_consolidation.ts --local` (zero FAIL; the counts equal the logged row), and a server boot against the dev database that listens with its 14 boot tests passing. The fleet path was not re-exercised: ssh to the fleet host is blocked in this session, and the fleet run is not a reviewer gate. |
| 2026-09-08 | 2 | Fact: the replay executes 41 checks, not 46 as the two step 2 rows say (39 `check(` sites, with `schemasMatch` and `expectFailureAt` each running twice). |
| 2026-09-08 | 2 | Fact, a D10 detail the plan does not rule: `folderIdFor` keys children by label alone (`plan.ts`), so two same-label sub-folders of the same kind (two deck folders both called "Drafts") also merge into one child, not only a deck and a report folder. Products are preserved; only the second folder's identity and colour are lost. Left as built; overrule in a ruling if the distinction matters. |
| 2026-09-08 | 2 | Finding: the table-existence query is written out three times in new code: `server/db/migrations/consolidation/plan.ts:425-436` (`countIfTableExists`), `server/db/migrations/consolidation/execute.ts:73-94` (`seedTakenIds`) and `validate_consolidation.ts:273-279` (`tableExists`). CLAUDE.md: extract duplicated logic. One exported `tableExists(db, table)` in `execute.ts`, used by all three. |
| 2026-09-08 | 2 | Finding: `validate_consolidation.ts:297-299` says the remap plan reported "is the one the migration produces", and line 571 prints `from -> to` for each remap. The colliding ids and their count are the migration's; the replacements are random 4-char and uuid mints, so 085 will mint different ones. Rewrite the comment to claim only what holds (same collisions, same count) and print the colliding id with its entity, not an invented replacement. |
| 2026-09-08 | 2 | Finding: `server/db/migrations/consolidation/plan.ts:12-16` says the file "must not import live code that can drift underneath it", and lines 48-53 import `ProductType` from `lib` and `walkSlideLayoutNodes` from `_figure_block.ts`. Both imports are sound (the slide layout shape and the product type survive the restructure), so the comment is what is wrong: narrow it to the legacy project-DB types and the id alphabet, which is what is actually frozen. |
| 2026-09-08 | 2 | Step 2 reviewed: 3 findings. |
| 2026-09-08 | 2 | Fix 2, done by the reviewing agent at Tim's direction (deviation from §0's fresh-fixer rule, accepted as for Fix 1). All three findings applied in one commit. The table-existence query is one exported `tableExists(db, table)`; it lives in `plan.ts`, not `execute.ts` as the finding suggested, because `execute.ts` imports from `plan.ts` and the reverse import would make a cycle. `validate_consolidation.ts` prints each colliding id with its entity and "(re-minted by 085)", and its comment claims only the collisions and their count. The `plan.ts` header now says the legacy row types and the alphabet are frozen because 9b deletes their source files, and names the two live imports as surviving the restructure. Gates green: `deno task typecheck` (with `lint:systems`), `deno task test` (14 passed), `./validate_protocols`, `deno check` of the consolidation directory and the two root tools, `./validate_consolidation_replay` (41 checks), `./validate_consolidation.ts --local` (zero FAIL, same counts), and a server boot against the dev database that listens with its 14 boot tests passing. No migration or query-engine file changed. |
| 2026-09-08 | 2 | Step 2 fixed. |
| 2026-09-08 | 2 | Review of Fix 2 by a fresh agent. Commit 0795b04a touches only the three finding targets plus the plan. The table-existence query now exists once, as the exported `tableExists` in `plan.ts:424-430`; `execute.ts` and `validate_consolidation.ts` import it, and a grep of the consolidation directory and both root tools finds one `information_schema.tables` query. Placing it in `plan.ts` rather than `execute.ts` is right: `execute.ts` imports from `plan.ts`, so the reverse would be a cycle. The dry-run prints each colliding id with its entity and no replacement, its comment claims only the collisions and their count, and the `--json` payload carries counts only, so no minted id reaches either output. The `plan.ts` header names the legacy row types and the alphabet as frozen because 9b deletes their sources, and names the two live imports as surviving. Gates run by the reviewer, all green: `deno task typecheck` (with `lint:systems`), `deno task test` (14 passed), `./validate_protocols`, `deno check` of the consolidation directory and the two root tools, `./validate_consolidation_replay` (41 checks), `./validate_consolidation.ts --local` (zero FAIL; counts equal the logged row), and a server boot against the dev database that listens with its 14 boot tests passing. No migration or query-engine file changed, so `./validate_migrations` and `./validate_queries` do not apply. |
| 2026-09-08 | 2 | Step 2 reviewed: pass. |
| 2026-09-08 | plan | Tim's ruling: the plan's vocabulary is "product explorer" (the Products page, D16, step 7b) and "results explorer" (the page the Explore tab will hold, D6); UI tab labels are unchanged. The results explorer page is cordoned off into its own later plan (§8). Step 6 keeps the insert-figure wizard move, the scope picker rename, the scope-keyed T2 caches and an empty Explore tab; 7b loses "Add to deck / report…"; D15 and step 8 lose `viewing_explore`. Consequence accepted: from 9a until that plan lands, metrics and presets are browsed only inside an editor. |
| 2026-09-08 | 3 | Relocation (commit 1). The HFA and ICEH capture files carried project-snapshot readers (`getAll*FromSnapshot`, `getHfaTaxonomyForAI`, `getHfaSentinelRowsFromSnapshot`) with no importer since the frozen results plane went; they read a project DB and die with the move rather than landing in `server/runs/`. `server/runs/capture_inputs/**` is S6-owned (its SYSTEMS.md §4.1 row replaces the `db/project/modules.ts` row) and the S8 manifest narrows `server/runs/**` to `server/runs/*.ts` so the lint sees one owner, as the reference did. |
| 2026-09-08 | 3 | Fact: the `RunDataset` overlap in §3.10 is real. `lib/types/run_manifest.ts` exported `RunDataset` for the raw manifest row, so the projection could not take the name through the barrel. The manifest row is now `RunManifestDataset` / `runManifestDatasetSchema` (the reference's answer); importers `build_run_package.ts`, `prepare_inputs.ts` and `query_rig/build_package.ts` follow. |
| 2026-09-08 | 3 | Fact: §3.10's importer lists are short. `getProjectDatasetsFromManifest` also had callers in `db/project/projects.ts` and `runs/attach_run.ts`, and `DatasetInProject` in `lib/types/projects.ts` and `lib/types/project_sse.ts`; all renamed in place (each dies in 9b). A comment in `server/db/instance/dataset_iceh.ts` pointed at the old file name and was repointed. |
| 2026-09-08 | 3 | Deviation, guard: all five run-keyed routes carry `requireGlobalPermission()` with no permission, including `getRunPresentationObjectItems` and `getRunResultsValueInfo`, which were `can_view_data`. The Deliverable names the zero-perm guard for the new routes; the two pre-existing names are among §3.3's five and end at `requireApprovedUser()` with the others in step 5, so they take the same intermediate state now rather than a third guard for two steps. Not shipped (steps 3+ are not deployed). Step 5 must swap all five. |
| 2026-09-08 | 3 | `adminArea2` on the four data-read bodies is `z.string().min(1).nullable()` (the shape `projects.admin_area_2` has always been written under): a required key whose null is national, so a body cannot mean national by omission. Outside the Surface: `server/mcp/env.ts` therefore passes `adminArea2: null` on its two calls (the typed server actions demand it); the headless allowlist is byte-identical. |
| 2026-09-08 | 3 | `getHfaTaxonomyFromManifestInputs(ctx)` lost its `timePoints` parameter and returns `RunAuthoringContextHfaTaxonomy`: the authoring context is a pure function of the run dir, and time points are instance T1. Its two callers outside the Surface, `db/project/projects.ts` (`getProjectDetail`) and `server/mcp/context_cache.ts`, compose the full `HfaTaxonomyForAI` with `getHfaTimePointsForAI` themselves (the reference's shape). `buildRunAuthoringContext` takes `commonIndicators` from the manifest's own list, not from an input mirror as the reference did (manifest v6). |
| 2026-09-08 | 3 | Outside the Surface, forced by the shared cache: `ReplicantOptionsForPresentationObject` carried `projectId`, which no run-keyed payload can hold, and `_REPLICANT_OPTIONS_CACHE` is one Valkey cache for both mounts. `lib/types/presentation_objects.ts` now defines `RunReplicantOptions` and the project type as `{ projectId } & RunReplicantOptions`; the cache is typed on the run shape; and the project `getReplicantOptions` handler in `server/routes/project/presentation_objects.ts` calls the shared `readRunReplicantOptions` and stamps `projectId` on the way out, which deletes its 200-line copy of the read body and the `resultsValueInfoQueue` export. No client reads `projectId` off the payload (it keys its cache on the request's project id). |
| 2026-09-08 | 3 | `getRunReplicantOptions` is metric-keyed on the wire (§3.3) while the shared read and its cache key are results-object-keyed; the route narrows with `resolveMetricFromRun` first. `getRunAuthoringContext` uses the national manifest lens (`getRunReadContextForRun`, no ready gate: the same exposure as `getRunDetail`); D7's `runs.status = 'ready'` gate is `getReadyRunReadContext`, used by the four data reads, checked against the catalog because a failed run can have a published partial dir. `getRunReadContext` (project lens), `getRunReadContextForRun` and `findVirtualDefault` stay, as the Surface says. |
| 2026-09-08 | 3 | Outside the Surface: `lib/types/mod.ts` gained one `export *` line for `run_authoring_context.ts` (the step 1 precedent), and `lib/types/run_authoring_context.ts` is claimed by SYSTEM_09 (the reference's claim). |
| 2026-09-08 | 3 | Rig: `Case.adminArea2` is the scope axis; `contextFor` builds the `(run, scope)` context and every items case now asserts the echoed `fetchConfig` is the request and the holder's `runId`/`scopeToken` are the context's. 13 scope cases over three new pairs: F1 direct filter (plus a case-insensitive scope), F13 `hfa_divergent_schema` for the metric-info pair (F1 declares no metric, so the reference's F1 metric-info cases moved there), F14 `hmis_admin3_only` (derivation, plus an unknown area hitting the empty-derivation sentinel), F15 `admin3_no_family` (fail-closed) and F11 (no admin column). 76 cases, 15 packages. Control verified: `computeScopeFilters` returning `[]` turns the 8 scoped cases red and leaves the 5 paired national readings green; recorded in PROTOCOL_APP_QUERY_RIG. |
| 2026-09-08 | 3 | Parity harness: `server/tests/run_authoring_context_parity_test.ts` (in `deno task test` and the boot tests) diffs `buildRunAuthoringContext` for the dev pin against `getProjectDetail` for a ready national project attached to it, field by field, modulo `timePoints`. Pass on the dev pin `e30ab955` (project "Test"). |
| 2026-09-08 | 3 | Cache keys: `./mcp_probe local` outputs (`--info`, `--list`, `get_overview`, `get_available_metrics`, the `get_metric_data` schema and two calls) are byte-identical before and after (7 files, `diff -r` clean); the first run-keyed reads after the change were Valkey HITs on entries the old code wrote, and the live keys read `cache:po_items:<runId>\|<roId>\|<hash>\|national` and `cache:metric_info:<runId>::<metricId>::national`, so `PO_CACHE_VERSION` stays "19". |
| 2026-09-08 | 3 | Gates green: `deno task typecheck` (server, client, `lint:systems`), `deno task test` (15 passed), `./validate_protocols`, `./validate_queries` (76 cases), and a server boot against the dev database that listens with its 15 boot tests passing. No migration changed. |
| 2026-09-08 | 3 | Step 3 built. |

---

## Appendix A: the migration replay of 2026-08-19, and what still stands

Run in a throwaway `postgres:15` container against the first draft's DDL
and numbering (079, 080, 081). The step 2 replay harness supersedes these
results; they are kept because three findings from them are load-bearing
and are cheaper to read here than to rediscover.

- **The 000 shell columns are load-bearing.** Without the
  `user_logs_aggregate` `ALTER`, a fresh boot fails at migration 035;
  without any log `ALTER`, at 016. Postgres resolves an index expression
  before the `IF NOT EXISTS` name check.
- **`CREATE TABLE IF NOT EXISTS projects (... REFERENCES runs)`** with
  `projects` present but `runs` absent is skipped without error, so an
  instance behind 065 survives 000.
- **`DROP COLUMN project_id`** drops the COALESCE expression index by
  dependency; the unique index is rebuilt explicitly afterwards.

The historical-shape replay: seven fleet-shape bases (commits 42516bec,
fd1a259e, 68160f6e, d3c3b18d, 4791f190, 04dfd51f, 3d320bb4), each with the
migrations added after it, all applied with zero errors. Comparing each
database's schema before and after the replay showed only pre-existing
legacy drift, present identically in both dumps.

`000_legacy_project_shell.sql`, verbatim (unchanged by the rewrite):

```sql
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  ai_context text NOT NULL,
  is_locked boolean NOT NULL DEFAULT FALSE,
  is_central_reporting boolean NOT NULL DEFAULT FALSE,
  status text NOT NULL DEFAULT 'ready',
  deletion_scheduled_at TIMESTAMPTZ,
  run_id text,
  admin_area_2 text,
  follow_pinned boolean NOT NULL DEFAULT FALSE,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);
CREATE TABLE IF NOT EXISTS project_user_roles (
  email text NOT NULL, project_id text NOT NULL, role text NOT NULL,
  -- the 17 can_* boolean NOT NULL DEFAULT FALSE columns, as in the current base
  PRIMARY KEY (email, project_id),
  FOREIGN KEY (email) REFERENCES users (email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_user_roles_email ON project_user_roles(email);
CREATE INDEX IF NOT EXISTS idx_project_user_roles_project_id ON project_user_roles(project_id);
ALTER TABLE user_logs ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE user_logs_aggregate ADD COLUMN IF NOT EXISTS project_id text;
```

`086_drop_project_layer.sql`, verbatim (was 081):

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'user_logs_aggregate' AND column_name = 'project_id') THEN
    UPDATE user_logs_aggregate a SET count = m.total
    FROM (SELECT min(id) AS keep_id, sum(count) AS total FROM user_logs_aggregate
          GROUP BY user_email, endpoint, endpoint_result, week_start HAVING count(*) > 1) m
    WHERE a.id = m.keep_id;
    DELETE FROM user_logs_aggregate a
    USING (SELECT id, min(id) OVER (PARTITION BY user_email, endpoint, endpoint_result, week_start) AS keep_id
           FROM user_logs_aggregate) d
    WHERE a.id = d.id AND a.id <> d.keep_id;
  END IF;
END $$;
ALTER TABLE user_logs DROP COLUMN IF EXISTS project_id;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS project_id;
ALTER TABLE user_logs_aggregate DROP COLUMN IF EXISTS project_id;
DROP INDEX IF EXISTS idx_user_logs_aggregate_unique;
CREATE UNIQUE INDEX idx_user_logs_aggregate_unique
  ON user_logs_aggregate (user_email, endpoint, endpoint_result, week_start);
DROP TABLE IF EXISTS dashboard_slugs, project_user_roles, projects;
ALTER TABLE users
  DROP COLUMN IF EXISTS can_create_projects,
  DROP COLUMN IF EXISTS default_project_can_configure_settings,
  -- ... the other 16 default_project_can_* columns ...
  DROP COLUMN IF EXISTS default_project_can_view_script_code;
```
