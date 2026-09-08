# PLAN — Products restructure: dissolve projects; products = decks + reports

**Status 2026-08-19: BUILT. Phases 0–3 are complete on
`tim-branch-restructure` (30 commits); Phase 4 (rollout) has not started.**
`deno task typecheck` (server + client + `lint:systems`), `deno task test`,
`./validate_migrations`, `./validate_queries` and `./validate_protocols` are
all green, the fleet dry-run passes on the dev instance, and the migration has
been RUN against the dev database — 11 projects → 15 products, matching the
dry-run's plan exactly. The app runs on the migrated data. What remains is §4's
last four gates and the §5 runbook, all of which need real infrastructure —
see the per-item marks in those two sections. `main` receives the branch as one
merge once they are green.

Two defects have been found by using the app that no gate caught, both fixed:
`getRollupRowLabel` read a global store instead of the bundle's own scope (so
an export of an AA2 product's figure labelled its roll-up row "National"), and
the two create buttons shared one `createButtonAction`, whose request-id guard
discarded all but the most recent click's callback. Expect more of this class:
the automated surface is clean, so what is left is behavioural.

**All work happens on the branch
`tim-branch-restructure` — every commit of Phases 1–3, the docs, the rigs and
the ops scripts — never on `main`. The single exception is the §0 hotfix, which
was independent of the restructure and shipped on `main` first.** First written
2026-08-19 from VISION_RESTRUCTURED_APP.md after a repo-only homework sweep
(11 subsystem inventories, a completeness pass, a five-lens adversarial review
and a second-round verification; the migration mechanism in D9 was EXECUTED
in a throwaway postgres — Appendix A). **Rewritten 2026-08-19 after Tim's
review, which ruled:** products are slide decks and reports ONLY (custom
visualizations are not products; dashboards are dropped); existing custom
visualizations and dashboards are DELETED on migration; every product chooses
its own package, `follow_pinned` is dropped as a concept; figures stay as
bundles and are updated per figure after a reattach; permissions are made
permissive (the permission system will be rebuilt later — nothing new is
designed here). Every decision is RULED — there are no open questions. §1
lists the big ones; everything else follows. Where a ruling OVERRULES a
standing SYSTEM ruling it says so.

Vocabulary: **product** = a slide deck or a report; **folder** = the one flat
organising level; **package** = results package (`runs` row + run dir; "run"
stays the internal name); **pin** = the instance's pinned package; **scope** =
the product's `admin_area_2` (NULL = national); **PackageScope** = the
client-side pair `{ runId, adminArea2 }` a product carries; **figure** = a
`{ metricId, config }` rendered inside a product and stored as a
`FigureBundle`; **preset** = a default visualization derived from a package's
manifest (`deriveDefaultVisualizationsForModule`); **authoring context** =
what an author needs FROM a package to build figures (metrics, modules,
indicators, taxonomy, presets) — a pure function of the run dir.

---

## 0. Independent of this plan — a live data-loss bug found during homework

`server/db_startup.ts:479-491` `cleanupOrphanedPresentationObjects` runs on
EVERY boot for EVERY project:
`DELETE FROM presentation_objects WHERE metric_id NOT IN (SELECT id FROM metrics)`.
The project-DB `metrics` table is FROZEN since 2026-07-29 (no `INSERT INTO
metrics` exists anywhere in `server/`/`lib/`; `addProject` no longer installs
modules, `projects.ts:258-264`). On every restart of every instance a project
created after 2026-07-29 (empty `metrics`) loses EVERY user-authored
visualization, and an older project loses every visualization built on a
metric newer than its frozen table. No serving path reads project-DB
`metrics` or `modules` (readers: the two boot sweeps, two data transforms, the
pg read plane `query_rig` alone imports, `synthesize_run`/`backfill_runs` —
the closed rollout tools; `run_read.ts` reads `ctx.manifest.metrics`).

**Hotfix (needs your go; its own patch on `main`):** delete the four
frozen-table boot steps in `db_startup.ts` — `cleanupOrphanedPresentationObjects`,
`cleanupOrphanModules` (+ the now-orphan `uninstallModule` in
`db/project/modules.ts`), and the `metrics_columns` + `module_definition`
entries of `PROJECT_DATA_TRANSFORMS` (+ their two transform files). Since this
plan DELETES every custom visualization at rollout anyway, the hotfix only
protects users between now and the rollout — it is still destroying real work
on every deploy until then, so it is worth its ten lines.

---

## 0b. Boundary — the plan lives in the product plane and the package READ side

The three planes of SYSTEM_08 (instance plane = data in; results plane =
generation into an immutable package; project plane = meaning): this plan
REPLACES the project plane with products and touches the results plane only
on its read/attach side.

**Untouched — not one file named:** dataset ingestion (HMIS/HFA/ICEH wizards,
staging/import workers, import runs, scheduled imports), the DHIS2 connector,
the structure / facilities / indicators / calculated-indicators / geojson
tables and routes, the instance Data tab, the package FORMAT (manifest, run
dir, parquet, R execution, finalize) and the runs volume, the generation
pipeline's inputs capture and execution, the `/mcp` door and tools, the
headless allowlist.

**Touched outside the product plane — each because a project reference lives
there, each the minimum cut:**

- Results-plane SEAM: the wizard's launch-time attach-to-projects feature
  (`attachTargetProjectIds` in `generate_run/{launch,pipeline,types}.ts`, its
  launch concurrency guard, `publishReadyRun`'s repoint, the wizard client's
  attach-target step + confirm copy) is DELETED (D5); the catalogue's "in use
  by" / delete guard count products; `runs.summary`'s two project keys are
  stripped by a JSON transform (the catalogue row, never the package). Two
  files in `generate_run/` change only IMPORT PATHS (`prepare_inputs.ts`,
  `pipeline.ts`) because the input-capture helpers are relocated out of
  `server/db/project/` (§2.10).
- Package READ side: run-keyed figure-data reads gain a scope parameter and an
  authoring-context route (D7).
- Instance-level TABLES, only where a project column/FK exists: `users` loses
  the 17 `default_project_*` columns + `can_create_projects`; `user_logs` /
  `ai_usage_logs` / `user_logs_aggregate` lose `project_id`; `dashboard_slugs`
  is dropped (dashboards die); `instance_config` gains `ai_context`.
- Instance ops surfaces that were project features: health `/projects` +
  `/project_activity` + the `projects` field of `/health_check`; the
  per-project backup/restore routes; the project purge cron and the two
  project disk gates; the rename-email per-project sweep; the instance SSE
  channel carries product lists (transport only); the public
  `/api/d/:slug` mount and `routes/public/dashboard.ts` (dashboards die).
- Access control: ONE new guard, `requireApprovedUser()`, used by the product
  / figure-data / copilot / collab surface. `requireGlobalPermission()` and
  every existing instance route keep their exact semantics (D2).

---

## 1. The big decisions (ruled — overrule here, not later)

**D1 — Storage: one main DB, a `products` registry + per-type detail tables.**
Per-project Postgres databases are deleted. Main gets `folders`, `products`
(id, type ∈ {slide_deck, report}, label, folder_id, run_id NOT NULL,
admin_area_2, created_by, created_at, last_updated) and per-type detail
tables keyed by the same id with `ON DELETE CASCADE` (`slide_decks`+`slides`+
`deck_versions`, `reports`+`report_versions`). Rejected: two independent
tables each carrying folder/run/scope (every cross-type operation — list,
folder move, delete-run guard, "in use by", id namespace — becomes a UNION).
Rejected: keeping one hidden "workspace" project DB.

**D2 — Permissions: permissive. No new design.** The whole permission system
is rebuilt later; this plan designs NOTHING. The project tier dies with
projects (17 flags, 17 `default_project_*` mirrors, `project_user_roles`,
`role`, `is_locked`, `is_central_reporting`, presets, 6 forms, 8 routes,
`resolveProjectUserAccess`, per-family collab flags, ~20 client `canEdit`
gates). The product surface (product/folder CRUD, figure-data reads, the
authoring context, the ready-package list, the Explore tab's reads, the
copilot `/ai` + `/ai/files` mounts, the collab socket, the products filter on
the instance SSE) is guarded by **`requireApprovedUser()`** — signed in AND
`globalUser.approved` (server `approved` = `_OPEN_ACCESS || !!usersRow`,
`project_auth.ts:228`; today the zero-perm `requireGlobalPermission()` never
checks `approved`, `server/middleware/userPermission.ts:71-93`, and the
project path was the only place approval was enforced, `project_auth.ts:262`).
Nothing else changes: the six instance flags (`can_configure_users`,
`can_view_users`, `can_view_logs`, `can_configure_settings`,
`can_configure_data`, `can_view_data`; `can_create_projects` dropped) keep
guarding exactly the surfaces they guard today; package INTERNALS
(`getRunDetail`, script/logs/files viewers, the `/:run_id/outputs/*` mount,
the catalogue, generation, pin) keep `can_view_data` / `can_configure_data`;
the `/mcp` door keeps its `can_view_data` check (`server/mcp/context_cache.ts:
246-255`) — its comment (which says the run-keyed routes enforce the bit) is
rewritten as load-bearing. Every approved user is a full editor of every
product; `products.created_by` is recorded so a later owner/sharing model has
its join key; `RoomConn.canEdit` plumbing is kept (TRUE) so a later model
slots in per subscribe. Consequences accepted and named (the D13 dry-run
reports them per instance so the blast radius is known BEFORE deploy): former
project viewers become editors; `is_central_reporting` projects — hidden from
non-H users today (`routes/instance/users.ts:97`, `db/instance/instance.ts:333`)
— become ordinary visible folders unless emptied by hand before rollout
(D11); `sendSlideDeckEmail`'s recipient roster becomes the instance roster.
Doctrine for SYSTEM_01: the product id in the path IS the authority; a future
permission scheme must be a product-aware guard, never per-handler checks.

**D3 — A visualization is a figure inside a product; there are no
visualization products and no dashboards.** A figure is `{ metricId, config }`
resolved under its product's PackageScope through the ONE metric-keyed
resolver (`resolveBundleFromMetricAndConfig(scope, metric, config)`) and
stored as a `FigureBundle`. It is authored from the product's own run's
PRESETS (the default visualizations `deriveDefaultVisualizationsForModule`
derives from the manifest) or from scratch via the metric wizard
(`add_visualization/` steps metric → preset → configure), and edited in place
with the embedded `VisualizationEditor` — which is ALREADY how every container
works (`slide_editor/index.tsx:807,922`, `report/index.tsx:1191,1225`; in-slide
figure co-editing binds to the SLIDE doc, `slide_editor/index.tsx:782-790`,
never to a PO room). Deleted: the standalone visualization product (rows,
list, cards, folders, settings, duplicate, save-as-new,
`create_slide_from_visualization`, the "pick a visualization" pickers, both
from-visualization resolvers, PO collab rooms + the `po_*` wire protocol, PO
presence, the `editing_visualization` view and its tools, `DraftVisualizationPreview`,
the PO detail route/cache), and dashboards whole (tables, `dashboard_slugs`,
`/api/d/:slug`, `public_viewer/`, `components/dashboards/`, replicant-group
resolution, the three dashboard exports, the slug backfill). **Existing
custom visualizations and dashboards fleet-wide are DELETED by the
consolidation — not converted (your ruling).** Consequences named: there is
no figure library (reuse = `duplicateSlides` within a deck, deck duplicate,
and the new `copySlidesToDeck`, §2.3); there is no unauthenticated surface
left (dashboards were the only public URL; decks email a PDF, reports
download — a "public deck link" is a later, far smaller feature if wanted);
the Explore tab (D6) is the only standalone place to look at a chart.
`PresentationObjectConfig` stays the figure-config type name (renaming the PO
vocabulary is a separate refactor — §8).

**D4 — Run and scope are CAPTURED into the FigureBundle; staleness is per
figure.** `figureBundleSchema` gains required `scope: { adminArea2: string |
null }` and `provenance.runId: string`. A figure is STALE when
`bundle.provenance.runId !== product.runId || bundle.scope.adminArea2 !==
product.adminArea2`. A stale figure shows an "Update to <package label>"
button (slide figure blocks, report figure embeds, the deck/report headers
get "Update all figures" with a count); pressing it re-resolves
`{ metricId, config }` under the product's current pair through the
product-run's authoring context; a failure shows the reason ON THAT FIGURE
(`issueFor`: metric absent → metric unavailable → requested disaggregation
missing, moved from `package_compatibility.ts:44-80` to `lib/`, manifest-only)
and leaves the old bundle in place. A stored replicant value missing under
the new run is auto-defaulted (today's non-strict rule,
`resolve_figure_from_visualization.ts:40-44`), never a throw. Reattach and
scope change NEVER block and have no pre-flight: `buildResultsPackageCompatibilityReport`
+ `results_package_compatibility_modal.tsx` are deleted. Mixed-package
products are a visible, intentional state (Q2 figures kept deliberately next
to Q3 figures). `getRollupRowLabel` (`get_data_config_from_po.ts:103-120`)
reads `bundle.scope`, never a global store — this also fixes the live hole
where exports of an AA2 project's figure label the roll-up row "National"
outside a project shell. The consolidation stamps both fields from the owning
project row into every figure block in the LIVE tables (slides, reports) AND
the version snapshots (`report_versions.figures`, `deck_versions.slides[].config`
— the restore paths run `transformFigureBlock` on snapshots at read time,
`versions.ts:59-79`, then parse with the current strict schema; scope/runId
cannot be derived there, so 080 stamps them and the restore hook must NOT
default them — a missing key is the intended fail-loud). Scope stays OUT of
the figure config / fetch hash (S9/S10 rule).

**D5 — Run pointer per product: `run_id NOT NULL`, no follow.** A product is
attached to exactly one package; `follow_pinned` is DELETED as a concept
(OVERRULES the SYSTEM_08 follower model for products: pin-move touches no
product row; `listFollowPinnedProjects`, `clearFollowPinnedIfNotPin`,
`setProjectFollowPinnedAndAlign`, the follower loop / `supersededMidway` /
`skippedLocked`, the follow toggle all die). The pin serves exactly three
things: the `/mcp` door, the Explore tab's default package (D6), and the
DEFAULT `run_id` for a NEW product (resolved server-side inside the insert
from `runs WHERE pinned`; creating a product requires a ready pin — zero ready
packages ⇒ "an admin must generate a results package" with a link to Results
for `can_configure_data`). The Q2→Q3 workflow: duplicate the product (clones
`(run_id, admin_area_2)` verbatim), reattach the duplicate in product
settings, update figures one by one or all (D4). Wizard launch-time attach
targets are DELETED — a generation produces a package; products point at it
afterwards. Delete guard + catalogue "in use by" count `products.run_id` by
type. Consolidation: decks/reports of a project whose `run_id IS NULL` are
attached to the instance's pin (their bundles still render; badges show
stale); an instance with such projects and NO pin is a dry-run FAIL (pin
one first).

**D6 — Explore tab: the pinned package's default visualizations, standalone.**
A new instance tab **Explore** (`components/explore/`, approved users) renders
the metric → preset gallery (the `add_visualization/` module sidebar + metric
cards + preset preview, reused as a page) for an EPHEMERAL `(package, scope)`
— package Select prefilled with the pin, scope picker default national,
neither persisted — with a "Configure" (opens the embedded editor
ephemerally) and an "Add to deck / report…" action (creates a slide / report
figure under the TARGET product's pair, re-resolving there — the
`AddToDeckModal` idiom). Presets are not products: no rows, no detail read;
they render through the run-keyed ITEMS read with their own config. The
virtual-defaults half of `getAllPresentationObjectsWithVirtualDefaults` and
`findVirtualDefault` (`run_read.ts:750-771`) die; `deriveVirtualDefaults(manifest)`
serves `getRunAuthoringContext.presets`. This is also where approved users
browse metrics and their definitions (the project Metrics tab was
`can_view_metrics`; the Results tab is `can_configure_data`-only,
`instance/index.tsx:416`) — `metric_details_modal.tsx` moves here.

**D7 — Data reads: ONE run-keyed mount, caller supplies `(runId, adminArea2)`.**
Delete the project lens (`getRunReadContext(mainDb, projectId)` and its
callers, `routes/project/{presentation_objects data half, modules}.ts`,
`getCacheStatus`). Extend `getRunPresentationObjectItems` /
`getRunResultsValueInfo` bodies with nullable `adminArea2`; add
`getRunReplicantOptions`, `getRunResultsObjectItems`, and
**`getRunAuthoringContext(run_id)`** → `{ modules, metrics (MetricWithStatus =
ResultsValue & status), datasets, commonIndicators, icehIndicators,
hfaTaxonomy (WITHOUT time points — instance T1, `run_read.ts:422-426`),
presets }` — the manifest projection `getProjectDetail` builds today
(`db/project/projects.ts:75-101`), derived from the run dir ONLY so the
client cache is immutable by identity. Guard `requireApprovedUser()`; the
DATA reads additionally require `runs.status = 'ready'`. `adminArea2` is
shape-validated + `escapeSqlString`'d exactly as today. Valkey keys keep
`runId` as the LEADING uniqueness segment (`delete_run.ts:63-74` prefix
sweep) and `scopeToken` trailing so `PO_CACHE_VERSION` needs no bump. The
headless allowlist stays byte-identical (nullable field; `/mcp` keeps
national). There is no PO detail route: the only per-id detail reads are
`getSlideDeckDetail` / `getSlide` / `getReportDetail`.

**D8 — Realtime: ONE instance SSE channel, ONE instance collab socket.** The
project channel (`project-sse-v2.ts`, `notify_project_v2.ts`,
`build_project_state.ts`, `project_last_updated.ts`, `lib/types/project_sse.ts`,
client `state/project/t1_*`) is deleted. `InstanceState` gains `products:
ProductSummary[]`, `folders: Folder[]`, `readyPackages: { id, label, createdAt
}[]` (ready-package LABELS are approved-user data — a deliberate revision of
SYSTEM_03's Q-B "run labels must not fan out", which now covers generation
telemetry only) and `lastUpdated: { products, slides }`; all withheld from
unapproved connections by the existing roster rule. `products_upserted {
products }` is the ONLY product-list message (per-row); `products_deleted {
ids }`; `folders_updated` whole-list; `last_updated` is emitted for `slides`
only; `starting` carries the full lists. The unapproved→approved transition:
on `currentUserApproved` false→true the client `reconnectForApproval()`
(instance SSE disconnect/connect + collab connect); `deleteUser` calls
`closeConnectionsForEmail`. The run-derived catalog leaves SSE
(`run_attached`, `admin_area_2_changed`, `project_config_updated` die) for the
immutable T2 `getRunAuthoringContext(runId)`. Collab: `GET /collab` (was
`/project_collab/:project_id`), auth = origin + Clerk + approved, rooms keyed
`docType::docId` for `slide` and `report` only (`po_rooms.ts` + `po_*`
messages deleted), presence keyed by PRODUCT; the project-level
page-awareness relay, list-page cursors and card presence avatars are
dropped. The server-cli nginx template becomes PATH-AGNOSTIC and is emitted
fleet-wide BEFORE the deploy. `runVersionKey` becomes cache PARAMS `(runId,
scopeToken)`; `pdsNotRequired`/`pds_not_ready` and `responseRunVersionMatches`
die; the server `_PO_DETAIL_CACHE` is DELETED; the three run-keyed Valkey
caches are untouched; client IndexedDB cache NAMES are kept (the deploy flush
clears every non-AI key on version change). Per-browser AI residue (`ai-conv*`
scoped by old project ids, `ai-documents/<projectId>`,
`panther-ai-settings-{projectId}`, old `projectTab`/sort localStorage keys)
is ACCEPTED, not migrated.

**D9 — Migration mechanism: tracked, ordered, transactional.**
`server/db/migrations/runner.ts` learns to apply `.ts` migrations beside
`.sql`: a literal-keyed static import map (so `deno check main.ts` covers
them), id = filename minus extension, sorted together, same
`schema_migrations` row, same one-transaction rule; a `.ts` migration THROWS
(never exits) so the runner's rollback + fail-stop is the single funnel; EVERY
main-DB statement in it (and every helper it calls) goes through the
migration `tx`; source project pools are read-only, opened fresh
(`getPgConnection(uuid, {max: 2})`, `.end()` in `finally`,
`rename_user_email.ts:170-176` precedent) after a `pg_database` existence
check through `tx`. `validate_migrations` globs `*.sql` and ignores them by
construction. Then:

- `000_legacy_project_shell.sql` — `CREATE TABLE IF NOT EXISTS` for
  `projects` (the FULL pre-restructure DDL — 080 SELECTs these columns and
  runs on a fresh DB too) and `project_user_roles` (+ its two indexes), PLUS
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS project_id text` on `user_logs`,
  `ai_usage_logs`, `user_logs_aggregate` (no FK): the base no longer has
  them, but 016's and 035's index STATEMENTS must resolve after their `CREATE
  TABLE IF NOT EXISTS` no-op (Postgres resolves the index expression before
  the IF-NOT-EXISTS name check — verified, Appendix A). Verbatim text in
  Appendix A; unchanged by the rewrite.
- `079_products.sql` — DDL identical to the new `_main_database.sql` (§2.1;
  SMALLER than the first draft: no `presentation_objects`, no dashboard
  tables — the Appendix A harness must be RE-RUN with this DDL, §4).
- **`080_consolidate_projects.ts`** — one main transaction. For each
  `main.projects` row with `status = 'ready'` (skip `copying`; skip rows whose
  DB is absent; D11 for `pending_deletion`): assert the source
  `schema_migrations` holds `039_metric_format_as_indicator` else throw
  ("boot the previous release first"); copy `slide_decks`, `slides`,
  `deck_versions`, `reports`, `report_versions` stamping `run_id` (the
  project's, else the pin — D5) / `admin_area_2` from the project row; folders
  per D10; `created_by` / `created_at` NULL (no invented provenance);
  `ai_context` concatenated into `instance_config.ai_context` under `##
  <label>` headings (D15); **collision check on EVERY primary key inserted**
  (`products`, `slides`, `report_versions`, `deck_versions` — WITH-TEMPLATE
  copies carry byte-identical ids, uuids included) — re-mint on collision and
  rewrite the full reference surface (`slides.slide_deck_id`,
  `deck_versions.deck_id` + `slides[].id` + `slide_editors` keys JSON,
  `report_versions.report_id`, `*.restored_from_version_id`); stamp
  `bundle.scope` / `provenance.runId` into every figure block in live AND
  version tables (D4). `presentation_objects`, `visualization_folders`,
  `dashboards`, `dashboard_items`, `dashboard_item_groups` are NOT read
  (deleted with the project DBs — your ruling; the dry-run reports their
  counts so the loss is known, not discovered).
- `081_drop_project_layer.sql` — NEVER `DELETE FROM projects` (its `ON DELETE
  CASCADE` children would wipe the logs); `DROP COLUMN IF EXISTS project_id`
  on the three log tables; rebuild `idx_user_logs_aggregate_unique`
  byte-identically WITHOUT the COALESCE term after a guarded DO-block merges
  aggregate rows that differ only by `project_id`; then `DROP TABLE IF EXISTS
  dashboard_slugs, project_user_roles, projects` WITHOUT CASCADE; `DROP COLUMN
  IF EXISTS users.default_project_*` ×17 and `users.can_create_projects`.
  Verbatim text in Appendix A; unchanged by the rewrite.

The product JSON transforms then run once on main as `INSTANCE_DATA_TRANSFORMS`
on the same boot (signature `(tx, countryIso3)`; they bump
`products.last_updated` through the join; `dashboard_config` /
`dashboard_items` / `po_config` / `metrics_columns` / `module_definition`
transforms are DELETED, not moved; `slide_config` + `reports` +
`_figure_block` survive). Old project databases are LEFT IN PLACE (rollback
path) and dropped later by an ops script (D12). Rejected: a TEMPORARY
`db_startup` step; dblink-in-SQL; guarding the old migrations.

**D10 — Folders on migration: one per project, plus one per legacy
sub-folder.** Products of project P with no sub-folder → folder "P"; products
in P's deck/report sub-folder F → folder "P / F" — same-label sub-folders
across the two families MERGE into one "P / F" folder (lossless). Rejected:
dropping the sub-folders; a data-conditional "single-project instances get no
folder" rule.

**D11 — `pending_deletion` projects are NOT migrated; central-reporting
projects are migrated as ordinary folders.** The dry-run (D13) lists both
classes per instance; the runbook step before rollout is "restore any
pending-deletion project that must survive; delete or empty any
central-reporting project that must not become visible to every approved
user". Products themselves have hard delete, no trash — with a
confirm-by-count on the batch action and the daily named main-DB dump as the
recovery path (a products trash is §8).

**D12 — Delete, don't port.** Backups (the 4 `requiresProject` routes, the
restore body, the settings-page backups panel, `create_backup_form`,
`restore_from_file_form`, `can_create/restore_backups`) — instance backups
stay a status-api/volume concern; `copyProject` (+ `WITH TEMPLATE`),
soft-delete + purge cron + `pending_deletions.tsx`, lock, central reporting +
every H_USERS project branch, `compareProjects` + `compare_projects.tsx`,
`getCacheStatus` + `project_cache.tsx`, `getProjectLogs` + `project_logs.tsx`,
`routes/project/{results_package,modules,project,cache_status,
presentation_objects,visualization_folders,dashboards}.ts` + their
registries, `attach_run.ts`, `package_compatibility.ts` (server report),
per-project disk gates, `getMyProjects` / `getProjectsForUser` /
`getOtherUser.projectUserRoles`, the pg read plane (`results_value_resolver.ts`,
`metric_enricher.ts` minus three survivors, `get_indicator_metadata.ts`, the
pg wrappers, the dead `db/utils.ts` probes), `backfill_runs.ts`,
`validate_results_runs_parity.ts`, `synthesizeRunForProject` and the
project-DB branch of `exportPgTableToParquet` (NOT the whole
`runs/synthesize_run.ts` / `runs/pg_export.ts` files — `buildRunPackageIntoTmp`,
`readCsvHeaders` and `exportRowsToParquet` are called by the LIVE generation
pipeline), `validate_figure_bundle_backfill.ts`, `rollout_fleet` / `rollout_backfill` /
`rollout_nigeria` + their Dockerfile COPY lines, the ~20 project-page tours,
`_project_database.sql` + the 41 project migration files + the runner's
project mode + `validate_migrations`' project half. **Visualization plane:**
`db/project/{presentation_objects,visualization_folders}.ts`, `server/collab/
po_rooms.ts`, `lib/types/{presentation_objects,visualization_folders}.ts`,
`lib/collab/figure_config_crdt.ts` PO half (the slide-figure map half
survives), `routes/caches/visualizations.ts`, client `components/visualization/
{index,visualization_settings,duplicate_visualization,save_as_new_visualization_modal,
create_slide_from_visualization_modal}.tsx`, `select_visualization_for_slide.tsx`,
`PresentationObjectMiniDisplay` (if orphaned), both `resolve_figure_from_visualization.ts`,
`state/project/t2_presentation_objects.ts` detail half, `project_visualizations.tsx`,
the viz tours, `ai_tools/tools/{visualizations.ts,visualization_editor.tsx}`,
`DraftVisualizationPreview.tsx`. **Dashboards:** `db/project/dashboards.ts`,
`db/instance/dashboard_slugs.ts`, `routes/public/dashboard.ts`,
`lib/types/{dashboard,_dashboard_config}.ts`, `lib/api-routes/project/dashboards.ts`,
client `components/dashboards/**`, `public_viewer/**`, `project_dashboards.tsx`,
`state/project/t2_dashboards.ts`, `exports/{_dashboard_export_model,
_dashboard_pages,export_dashboard_as_pdf,export_dashboard_as_pptx,
export_dashboard_as_xlsx}.ts`, the dashboard tours, the `app.tsx` `/d/:slug`
route, `PresentationObjectMiniDisplay` (its only consumers are the deleted
viz picker and `PresentationObjectPanelDisplay` — keep only if the latter
still needs it), the "public dashboards" comments in `static.ts` /
`oauth_metadata.ts` (the public image-asset mount itself stays — deck logos
use it). `./validate_queries`
is NOT deleted — re-based onto parquet + manifest fixtures driving the
`FromRun` wrappers. Old project DBs and legacy `sandbox/<uuid>` dirs are
purged by a new ops script after settling.

**D13 — Gate the consolidation with a read-only fleet dry-run** that SHARES
the planning code with 080 (`planConsolidation(...)` → inserts + remaps; boot
executes, dry-run only reports): per instance — projects by status incl.
`pending_deletion` and `is_central_reporting` lists, DB-absent rows, sources
not at 039, per-table row counts (INCLUDING the visualizations, dashboards
and public dashboards that will be DROPPED), id collisions + remap plan, FK
orphans, projects with `run_id NULL` + whether a pin exists, users holding
only viewer roles (the D2 blast radius), max products per instance (the D8
`starting` payload), folder counts. Zero FAIL fleet-wide = deploy. The exact
`validate_figure_bundle_backfill.ts` mould (36/36 instances, 0 FAILs).

**D14 — Ids.** Keep the nanoid scheme; ONE generator length — **4 chars**
(923k combos; 3 chars = 29,791 was fine per project, not per instance) —
product ids checked against `products`, slide ids against `slides`; versions
and folders stay `crypto.randomUUID()`; existing 3-char ids are kept unless
they collide (ids are not length-validated; registry params stay
`z.string()`, never `z.uuid()`). No stored FigureBundle references a product
id (`_figure_bundle.ts:116-133`), so bundles need no rewrite.

**D15 — AI copilot: one instance-level mount, env bound to the open product.**
`AIProjectWrapper` becomes the copilot wrapper around the Products page AND
both editor overlays (panther registers tools once per mount; the
`returnToContext` stack and the tours rely on one controller). The env
resolves the OPEN product's PackageScope while an `editing_*` view is active
(carried in the opaque view CONTEXT half, never in tool params — the "no run
id crosses the seam" ruling holds), else the pin at national scope. SPA
shared tools get the `withSourceHeader` (package label + scope) that `/mcp`
already applies, since the env's pair can differ from the pin mid-thread. The
authoring context is reconciled IN PLACE (tool-aliasing invariant,
SYSTEM_13). Views collapse to `viewing_products`, `viewing_explore`,
`editing_slide_deck`, `editing_slide`, `editing_report`;
`PROJECT_TAB_TO_VIEW` and `switch_tab` are deleted. Figure creation by the
model happens INSIDE a deck/report (the slide tools + report editor tools +
drafts); when no `editing_slide_deck` view is active, `AddToDeckModal`
RE-RESOLVES the draft slide's figure blocks under the chosen deck's pair before
`createSlide`. ONE conversation scope (`"copilot"`). Proxies: `/ai` guarded
`requireApprovedUser()`, `/ai-instance` (HFA indicator manager,
`can_configure_data`) kept — two mounts, one handler. `ai_usage_logs.project_id`
dropped. `projects.ai_context` → ONE instance-level `ai_context` in
`instance_config` (settings textarea, `can_configure_settings`). The
interactions producer consumes `products_upserted` rows (type + label) and
`last_updated(slides)`. Every "project" / "visualization as a thing you open"
/ "dashboard" in model-visible text (`lib/types/ai_input.ts`, tool
descriptions, view instructions, `client_info_topics.ts`,
`client/public/info/*.md` served to `get_info`) is swept.

**D16 — Products page, create flow, deep link.** One Drive-like page under
`client/src/components/products/`: folder sidebar (with the "General"
pseudo-group), type filter chips (deck / report), search, one sort pref,
mixed product cards (type icon, label, package label from T1 `readyPackages` +
scope badge, last updated), multi-select on the PLAIN product id — the
`${kind}:${id}` composite this plan first specified was a hangover from the
per-type routes: D1 gives products one registry and one id namespace, and
`deleteProducts` / `moveProductsToFolder` are cross-type batch routes, so
there is nothing left to dispatch per kind. **Create = two buttons, no modal:** "New deck" / "New report" insert
the `products` row + detail row in one transaction (label "Untitled deck" /
"Untitled report" localised, `folder_id` = the sidebar's current folder or
NULL, `run_id` = the pin resolved server-side, `admin_area_2` NULL) and the
editor opens immediately via `getEditorWrapper`. Empty instance = one big
"New deck / New report" card; zero ready packages = both disabled with the
"an admin must generate a results package" line. ONE shared
`product_settings.tsx` (label, folder, package Select over `readyPackages`,
scope) reachable from the card menu and both editors' headers; changing
package or scope never blocks — the D4 badges appear. Editors read the
product's PackageScope LIVE from the T1 products row (tracked), not from a
snapshot. Deep link: `?product=<id>` opens that product's editor (replaces
`?p=` / `?d=`; old links in the wild break — no shim); editors stay
signal-driven overlays. Owned by SYSTEM_12 (retitled "Products & Folders").

**D17 — Tabs.** Instance shell: **Products** (first, default) | **Explore** |
Data | Results | Assets | Users. Project Metrics / results-package / settings
tabs are dissolved (metrics → Explore; package + scope → product settings;
users/lock/central/backups/copy/delete have no product analogue; AI context →
instance settings).

**D18 — Everything ships in the same push, docs included.** SYSTEM_00/01/02/
03/05/06/08/09/10/11/12/13/14/15/16/17 prose + lint-enforced globs
(lint:systems runs inside `deno task typecheck`), SYSTEMS.md §4.1 custody
rows, PROTOCOL_APP_{ROUTES,STATE,MIGRATIONS,QUERY_RIG,DEVELOPMENT,
UI_CONVENTIONS,WORKER_ROUTINES,AI_TOOLS}, CLAUDE.md, USER_GUIDE_MCP; the
pre-existing doc drift the sweep found is fixed in passing (§7). PLAN files:
PLAN_RESULTS_RUNS (Phase 4 subsumed; sandbox→runs rename + backups follow-up
survive as two lines), PLAN_3_GEOJSON (project-scoped read → run-keyed
route), PLAN_COMMON_INDICATOR_TYPES (file paths). VISION_RESTRUCTURED_APP.md
is deleted when this plan is accepted. **Post-settle end state is named
(§5.7): the three rollout ops scripts are deleted after the purge; `000` /
`080` / `consolidation/plan.ts` (which carries a frozen copy of the old
project-DB row types) and the runner's `.ts` support are migration history and
stay until the next base squash.**

---

## 2. Target architecture

### 2.1 Data model (main DB; base schema `_main_database.sql` = final state)

```sql
CREATE TABLE folders (
  id text PRIMARY KEY,                 -- uuid
  label text NOT NULL,
  color text,
  last_updated text NOT NULL
);

CREATE TABLE products (
  id text PRIMARY KEY,                 -- 4-char nanoid (legacy 3-char kept)
  type text NOT NULL CHECK (type IN ('slide_deck','report')),
  label text NOT NULL,
  folder_id text REFERENCES folders(id) ON DELETE SET NULL,
  run_id text NOT NULL REFERENCES runs(id),   -- no cascade: the delete-run guard
  admin_area_2 text,                   -- NULL = national
  created_by text,                     -- email; NULL = pre-restructure product
  created_at text,                     -- NULL = pre-restructure product
  last_updated text NOT NULL           -- THE product version (content or metadata)
);
CREATE INDEX idx_products_folder_id ON products(folder_id);
CREATE INDEX idx_products_run_id ON products(run_id);
CREATE INDEX idx_products_type ON products(type);

CREATE TABLE slide_decks (            -- detail: type = 'slide_deck'
  id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  plan text,
  config text
);
CREATE TABLE slides (
  id text PRIMARY KEY,                 -- 4-char nanoid
  slide_deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,          -- per-slide optimistic lock + slide cache
  crdt_state text,
  crdt_state_last_updated text
);
CREATE TABLE reports (                -- detail: type = 'report'
  id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  config text,
  crdt_state text,
  crdt_state_last_updated text,
  body_authors text
);
CREATE TABLE report_versions ( … report_id → reports CASCADE … );  -- unchanged shape
CREATE TABLE deck_versions   ( … deck_id → slide_decks CASCADE … ); -- unchanged shape
```

Rules of the shape:

- `last_updated` lives on `products` (Drive: modified time on the file) and on
  `slides` (child rows with their own optimistic lock). Every content mutation
  bumps `products.last_updated` in the same transaction (the deck-touch rule,
  generalised). Optimistic-concurrency round-trips (`updateReportBody`,
  `updateSlide`) compare against `products.last_updated` / `slides.last_updated`.
  Collab checkpoints stamp `products.last_updated` and the detail row's
  `crdt_state_last_updated` equal in one write; a non-collab write bumps
  `products.last_updated` alone, which is what invalidates stored CRDT state
  (SYSTEM_16 rule). Metadata writes (label, folder, package, scope) bump it too.
- Dropped columns with no live writer: `*_folders.sort_order` +
  `reorderVisualizationFolders` (zero callers), `*_folders.description`,
  `global_last_updated` (dead). Dropped tables: everything visualization /
  dashboard (D3).
- Users: `users` loses the 17 `default_project_can_*` columns and
  `can_create_projects`; `instance_config` gains an `ai_context` row.
- Logs: `user_logs`, `ai_usage_logs`, `user_logs_aggregate` lose `project_id`
  (mechanics in D9).

### 2.2 Access control

- `requireApprovedUser()` — new, beside `requireGlobalPermission` in
  `server/middleware/userPermission.ts`: `getGlobalUser` → 401 if
  unauthenticated → 403 unless `globalUser.approved` → `c.var.globalUser` /
  `c.var.mainDb`. It replaces `requireProjectPermission` on the relocated
  product routes and guards the new ones. `requireGlobalPermission()` is NOT
  changed (its 31 zero-perm sites keep today's behaviour, including their
  hand-rolled `approved` branches).
- `server/project_auth.ts` is deleted; `getGlobalUser` / `buildGlobalUserFromDb`
  move to `server/auth/global_user.ts` (imported by `userPermission.ts`,
  `static.ts`, `mcp/context_cache.ts`); `createDevGlobalUser` stays in
  `lib/types/instance.ts`; `createDevProjectUser` and `ProjectUser` die.
- Guard map: products/folders reads + writes, run-keyed figure-data reads, the
  authoring context, `listAttachableResultsPackages`, Explore →
  `requireApprovedUser()`; package internals → `can_view_data`
  (`can_view_logs` for logs); catalogue/generation/pin → `can_configure_data`;
  users → unchanged; `/mcp` door → `can_view_data`.
- Collab WS admission = origin + Clerk + approved; `RoomConn.canEdit` kept
  (TRUE); the six per-family flags and the lock are deleted.
- H_USERS survives for: boot seed, `unlimitedAi`, `setUserUnlimitedAi` /
  `setUserContactPerson`, users-list hide toggle, `version_capture` skip,
  feedback recipients. Every project branch is deleted.
- Health surface: `/projects` and `/project_activity` deleted; `projects`
  removed from `/health_check`; `/user_logs*` rows lose `project_id`.

### 2.3 API surface

- Transport: `requiresProject` (registry flag, `RouteRequiresProject` /
  `RouteArgsWithProject` types, the `Project-Id` header emit in
  `create_server_action.ts:96-118`, the CORS allow-header, the route-tracker
  body-key check) is deleted.
- Registries: `lib/api-routes/project/*` → `lib/api-routes/products/{products,
  folders,slide-decks,slides,reports}.ts`; server `server/routes/products/*.ts`;
  `emails` moves to `instance/` (`sendSlideDeckEmail` recipients = instance
  roster); `combined.ts` re-spread. Shared product routes: `createProduct({
  type, folderId })` (server mints label + resolves the pin — D16),
  `updateProductLabel`, `moveProductsToFolder` (batch), `deleteProducts`
  (batch, any type — pre-read slide ids of any deck in the batch, close
  slide/report rooms + version accumulators, then one `DELETE FROM products
  WHERE id = ANY($1)`, emit `products_deleted`), `setProductPackage(:id,
  {runId})` (ready gate IN the UPDATE), `setProductScope(:id, {adminArea2})`,
  `duplicateProduct(:id)` (clones `(run_id, admin_area_2)`, per-type body),
  `listAttachableResultsPackages` (instance, approved). New:
  `copySlidesToDeck(:deck_id, { slideIds, targetDeckId })` (the cross-deck
  reuse path; bundles copied verbatim, so they show stale under the target if
  the pairs differ — D4). Folder routes: `createFolder` / `updateFolder` /
  `deleteFolder` (= `UPDATE products SET folder_id = NULL WHERE folder_id = $1
  RETURNING id` → `products_upserted` for those ids, then delete the folder).
  Per-type content routes keep their names minus `requiresProject`
  (`getSlideDeckDetail`, `updateSlideDeckConfig`, `createSlide`, `updateSlide`,
  `duplicateSlides`, `moveSlides`, `deleteSlides`, `getReportDetail`,
  `updateReportBody`, versions…); per-type `delete*`, `move*ToFolder`,
  `update*Label`, `duplicate*` are removed in favour of the shared ones.
- Run-keyed instance reads (D7): `getRunPresentationObjectItems(run_id, {…,
  adminArea2})`, `getRunResultsValueInfo(run_id, {…, adminArea2})`,
  `getRunReplicantOptions`, `getRunResultsObjectItems`, `getRunAuthoringContext`.
- Run generation: `launchRunGeneration` loses `attachTargetProjectIds`;
  `listFollowPinnedProjects` deleted; `RunCatalogItem.attachedProjects` →
  `attachedProducts { type, id, label }`; `deleteRun` refuses while any product
  points at it.
- AI: `/ai/v1/messages` + `/ai/files*` → `requireApprovedUser()`; SDK client
  loses the default header; `AddAiUsageLog` loses `projectId`.
- Public: `/api/d/:slug` + `routes/public/dashboard.ts` deleted; `main.ts`
  mount removed; `app.tsx` `/d/:slug` route removed.
- `renameUserEmail`: the per-project sweep becomes a main-DB sweep over
  `products.created_by`, `report_versions.editors`, `deck_versions.editors`,
  `body_authors`; `RenameEmailResult` loses `projectsUpdated/projectsFailed`;
  `change_email_modal.tsx` retry UI follows; the fleet orchestrator consumes
  the new shape (§6).

### 2.4 Realtime

Instance channel additions: `products_upserted { products: ProductSummary[] }`
(the only product-list message; every product mutation route — and every
collab checkpoint — emits the summary for that id), `products_deleted { ids }`,
`folders_updated { folders }`, `last_updated { tableName: 'slides', ids,
lastUpdated }`; `starting` carries the full `products` + `folders` +
`readyPackages` + `lastUpdated` map. `readyPackages` follows the `runsCatalog`
idiom exactly — a `starting` fill plus the EXISTING `runs_catalog_updated`
nonce triggering a `listAttachableResultsPackages` refetch (no new message
type). **That route returns `ReadyPackage[]` (`{ id, label, createdAt }`), NOT
`RunListingItem[]`** — the wide row carries `progress` / `summary` /
`provenance`, which is generation telemetry and stays at `can_configure_data`
under Q-B; the package LABEL is the whole of what D8 widens to approved users.
The `starting` fill and the refetch therefore agree by construction instead of
the client narrowing one of them by hand. The client `lastUpdated` map (`{ products, slides }`) is the
cache-version INDEX (`LastUpdateTableName`, file renamed
`lib/types/last_updated_tables.ts`, = `products | slides`).
`notifyLastUpdated(tableName, ids, ts)` (no projectId). `buildInstanceState`
is split so the `/mcp` context builder does not embed product lists or report
bodies.

`ProductSummary` = `{ id, type, label, folderId, runId, adminArea2, createdBy,
createdAt, lastUpdated }` ∪ a per-type slice (`slide_deck`: `firstSlideId,
config`; `report`: `config, preview`). Every per-type summary query today is
`WHERE id = $1` away (`slide_decks.ts:20-42`, `reports.ts:46-66`).

### 2.5 Client state

`client/src/state/project/**` is deleted. Inventory after:

| Tier | What | Home |
| --- | --- | --- |
| T1 | `products`, `folders`, `readyPackages`, `lastUpdated.{products,slides}`, `pinnedRunId` (exists), `hfaTimePoints` (exists) | `state/instance/t1_store.ts` |
| T2 | `run_authoring_context` keyed `[runId]`, immutable (the `t2_runs.ts` idiom) | `state/instance/t2_run_authoring_context.ts` |
| T2 | figure data: `po_items` / `metric_info` / `replicant_options` keyed `(runId, scopeToken, …)`, version constant (embedded figures, Explore, presets) | `state/products/t2_figure_data.ts`, `t2_replicant_options.ts` |
| T2 | `slide` by `lastUpdated.slides[id]`; `slide_deck_detail` / `report_detail` by `lastUpdated.products[id]`; `images` (moves, no change) | `state/products/t2_*.ts` |
| T4 | `productsSortMode`, `productsTypeFilter`, `productsSelectedFolder`, `exploreRunId`, `exploreAdminArea2`, `pendingEditorOpen`, `showAi`… | `t4_ui.ts` |
| T4 | AI documents keyed `ai-documents/copilot` | `state/products/t4_ai_documents.ts` |
| T1-adjacent | collab store, connected by the instance boundary when approved | `state/instance/collab.ts` |

`createReactiveCache` loses its `getSnapshotProjectState` import; version keys
are `(params, instanceState)` only. `clear_caches.ts` keeps only the AI
prefixes. `PackageScope` replaces `ProjectState` in every editor prop;
`snapshotForSlideEditor` snapshots ONLY what must not move under the editor
(the deck config at open); the PackageScope is read live from T1 (D16) and the
authoring context from the immutable T2 cache keyed by that LIVE `runId` — so
a reattach mid-edit moves items AND metrics/presets together and the D4
badges light up. `hfaTaxonomy` for the copilot is composed client-side from
the authoring context + T1 `hfaTimePoints`.

### 2.6 Client UI

- Instance shell tabs: **Products** | **Explore** | Data | Results | Assets |
  Users. `?product=<id>` opens an editor; `?p=` and `?d=` are gone.
- `components/products/`: `index.tsx` (page — built from `project_decks.tsx`'s
  skeleton: HeadingBar + search + SortControl + the two create buttons,
  `FrameLeftResizable` folder sidebar with right-click rename/delete, card
  grid, `createSelectionController`), `product_card.tsx`,
  `product_settings.tsx`, `edit_folder_modal.tsx`, `move_to_folder_modal.tsx`,
  `duplicate_products_modal.tsx`. `_shared/scope_picker.tsx` (renamed from
  `project_scope_picker.tsx`; copy says "Scope").
- `components/explore/`: `index.tsx` (page: package Select + scope picker
  (ephemeral), module sidebar, metric cards, preset gallery, render area,
  "Configure" / "Add to deck / report…"), `add_to_product_modal.tsx`,
  `metric_details_modal.tsx` (moved). `components/figures/insert_figure/**`
  (= moved `add_visualization/` + `preset_preview.tsx`, fed by an authoring
  context; used by both editors and Explore).
- Figures: `components/visualization/` keeps the embedded editor
  (`visualization_editor_inner.tsx`, the three editor panels, conditional
  formatting, `edit_common_properties_modal`, `inline_replicant_selector`) and
  is renamed `components/figure_editor/`; `stale_figure_badge.tsx` + the
  "Update to <package>" / "Update all figures" actions (D4) live beside the
  slide figure block and `ReportFigureEmbed`.
- Editors (`slide_deck/`, `report/`) take `{ productId }` and read the
  PackageScope live from T1 (+ the authoring context via T2) instead of
  `projectId` + `projectState[Snapshot]`; every `can_configure_* && !isLocked`
  gate becomes one shared `canEditProducts()` (= approved) so a later
  permission model replaces one function; header shows the scope badge, a
  Settings entry and the stale-figure count. The slide "insert figure" and
  report "insert figure" panels offer the product run's presets + the metric
  wizard (no viz-product picker). `slide_list.tsx` gains "Copy to deck…".
- Copilot: `components/copilot/` (renamed from `project_ai/`), one mount at
  the Products page; env resolves the open product's scope; view registry per
  D15.
- Onboarding: the ~20 list-page project tours collapse into one products tour
  set + one Explore tour; results-package / settings / instance-projects /
  visualization / dashboard tours are deleted; the deck/report editor tours
  survive; the instance tour catalogue stops fanning out `getProjectDetail`;
  tour ids renamed (Clerk seen-flags re-fire once, accepted); telemetry loses
  `projectId`.
- Copy sweep: every en/fr/pt literal saying project/projet/projeto (30 FR
  files, 27 PT files, `TC.goBackToProject`, `client/public/info/*.md`) and
  every "dashboard" / standalone-"visualization" literal is rewritten to
  products/folders/scope/figures.

### 2.7 Results packages: pointer, pin, presets

- `db/instance/run_generation.ts` pointer functions rewrite against
  `products`: `setProductRun(id, runId)` (ready gate IN the UPDATE), the delete
  guard, catalogue `attached_products` json_agg. The pin-move transaction
  touches only `runs.pinned` (advisory lock kept).
- Presets: `virtual_defaults.ts` keeps `deriveVirtualDefaults(manifest)` (memo
  by runId) and serves them inside `getRunAuthoringContext.presets`.
- The wizard client (`instance_results_packages/_wizard/{index,_step_data,
  _step_confirm}.tsx`) loses the attach-target multi-select and confirm copy;
  `detail.tsx` "in use by" lists products by type; the pin confirm no longer
  lists followers (there are none).
- `issueFor` (manifest-only) moves to `lib/` for the client's per-figure
  reason (D4).

### 2.8 FigureBundle

`figureBundleSchema` (strict, shared by slides/reports): add required `scope:
{ adminArea2: string | null }` and `provenance.runId: string`. Capture-on-write
from the product's PackageScope in every assembly site
(`resolve_figure_from_metric.ts:29-113`, `resolve_bundle_from_metric_and_config.ts`,
`t2_presentation_objects.ts:218-242` → `t2_figure_data.ts`). 080 stamps them
into live AND version tables from the owning project row (D4); the skip-gate
for anything it misses is the normal missing-key parse failure. The stale
predicate and the update action (D4) live in `generate_visualization/
figure_staleness.ts` (pure) + the editor components. `buildFigureInputs` reads
`bundle.scope` for the roll-up label. Bundles are stored, not cached, so no
Valkey prefix moves.

### 2.9 Migration mechanism — file list (mechanism in D9)

- `server/db/migrations/runner.ts` — `.ts` migrations via a literal-keyed
  static import map; project mode deleted.
- `server/db/migrations/instance/000_legacy_project_shell.sql`,
  `079_products.sql`, `080_consolidate_projects.ts`, `081_drop_project_layer.sql`.
- `server/db/migrations/consolidation/plan.ts` — the shared planning core
  (reads a project DB, produces the insert set + id remap + folder plan +
  bundle stamps + ai_context concatenation + the dropped-row counts); `080`
  executes it, the dry-run reports it. It carries a frozen copy of the old
  project-DB row types it reads (`_project_database_types.ts` is deleted).
- `validate_consolidation.ts` (repo root) — the read-only fleet dry-run (env
  `PG_HOST/PG_PORT/PG_PASSWORD` per instance through the PROTOCOL_ACCESS_DBS
  tunnel), exit 1 on any FAIL.
- `db_startup.ts` — the per-project loop, `backfillDashboardSlugsToMain`, both
  TEMPORARY sweeps, `PROJECT_DATA_TRANSFORMS` (the two survivors become
  instance transforms on main, signature `(tx, countryIso3)`), and the
  `runs.summary` transform block are the edits.
- `_main_database.sql` — final state (2.1); `_project_database.sql` and
  `server/db/migrations/project/**` deleted; `validate_migrations` loses the
  project call.
- Ops (repo root, ops tooling): `rollout_products` (deploy + health poll +
  post-check product/folder counts vs the dry-run plan), `restore_main` (stop
  container → `docker exec psql -d postgres` DROP DATABASE main WITH (FORCE) /
  CREATE → pipe the named status-api dump → start the previous image; verified
  once on testing-tim before the fleet), `purge_legacy_dbs` (ssh + `docker
  exec psql -d postgres`: `DROP DATABASE … WITH (FORCE)` for every UUID-named
  datname ∉ {main, postgres, template*}; rm `sandbox/<uuid>` dirs whose name ∉
  `runs.id` — never `.tmp-*`, `.duckdb-spill`, `restore_*`). All three are
  deleted after the purge (§5.7).

### 2.10 What survives from `server/db/project/**` (relocation list)

`prepare_inputs.ts:13-22` imports `calculatedIndicatorToSnapshotRow`,
`computeDataset{Hfa,Hmis,Iceh}RunCapture`, `dbRowToHfaIndicator`,
`PROJECT_FACILITY_COLUMN_NAMES`, `ProjectFacilityRow`, `DatasetCsvTarget` (from
`datasets_in_project_*.ts` and `_project_database_types.ts` — NOT from
`calculated_indicators_snapshot.ts`, whose only content is a project-DB reader
that dies; `calculatedIndicatorToSnapshotRow` lives in
`datasets_in_project_hmis.ts`, and `dbRowToHfaIndicator` is already in
`db/instance/hfa_indicators.ts` and does not move); `pipeline.ts:13` imports
`prepareModuleDefinitionForStorage` (`modules.ts`); `run_query/run_read.ts:49-50`,
`runs/package_internals.ts:9`, `runs/disaggregation_availability.ts:3-5` import
`inferMostGranularTimePeriodColumn`, `getEnabledFacilityDisaggregationOptions`,
`PHYSICAL_DISAGGREGATION_COLUMNS` (`metric_enricher.ts`) and
`parseModuleConfigSelections` (`modules.ts`); `PROJECT_FACILITY_COLUMN_NAMES` /
`ProjectFacilityRow` are renamed `RUN_FACILITY_COLUMN_NAMES` / `RunFacilityRow`
on the way (run-capture code must not carry project vocabulary past the §4
grep); `db/utils.ts` keeps
`escapeSqlString`, `tryCatchDatabaseAsync`, `getResultsObjectTableName`
(`run_read.ts:46`), `detectHasAnyRows` (live on main, `instance.ts:231-237`).
Relocate to `server/runs/capture_inputs/{hmis,hfa,iceh,calculated_indicators}.ts`
(they read MAIN and write the run workspace — instance-level code that was
misfiled), `server/runs/module_config.ts` (the two module helpers),
`server/run_query/disaggregation_columns.ts` (the three helpers). Renames:
`lib/types/datasets_in_project.ts` → `lib/types/run_datasets.ts`
(`DatasetInProject` → `RunDataset*`, used by MCP context + system prompt),
`getProjectDatasetsFromManifest` → `getRunDatasetsFromManifest`
(`run_read.ts:378`; caller `server/mcp/context_cache.ts:283`),
`lib/types/project_dirty_states.ts` → `lib/types/last_updated_tables.ts`;
`lib/types/projects.ts` deleted (`projectScopeToken` → `lib/types/scope.ts`).

---

## 3. Work breakdown

**Phases 1, 2 and 3 are all DONE.** The detail below is kept as the record of
what was built and why; a fresh reader wanting the CURRENT shape should read
the SYSTEM docs, which were rewritten against the finished code and whose file
manifests `lint:systems` enforces. Nothing in §3 remains to be done.

Deviations from the plan that were ruled during the build are recorded inline
where they occurred (§2.4's `ReadyPackage`, §2.6's multi-select key, §2.10's
paths, D12's `synthesize_run` / `pg_export`). Two additional facts a fresh
agent needs: `issueFor` landed as `figurePackageIssueFor` in
`lib/figure_package_issue.ts` and gained a second entry point
(`figurePackageIssueForMetrics`) so the client can answer from the authoring
context rather than a manifest it never holds; and
`server/routes/caches/visualizations.ts` survives — it holds the three live
run-keyed caches, only `_PO_DETAIL_CACHE` died.

Every phase is built and committed on `tim-branch-restructure` (never on
`main`). Commits on the branch may be WIP; the MERGE into `main` is what must
be greenfield-equivalent, and it happens only after every §4 gate is green.

### Phase 1 — Server (typecheck target: `deno check main.ts server/tests/*.ts` green)

1. **Schema + migrations** (§2.1, §2.9): base schema, runner `.ts` support,
   000/079/080/081, planning core, `db_startup` rewrite, `runs.summary`
   transform block, `validate_migrations` project half removed. Gate:
   `./validate_migrations` green; the Appendix A harness RE-RUN with the new
   079 DDL (fresh, live, historical shapes); a boot against an EMPTY postgres
   completes; 080 executed against the dev DB (`pg_run`, port 7001) and the
   dry-run reports zero FAIL there; version restore (report + deck) works on a
   migrated product.
2. **DB layer**: `server/db/products/{folders,products,slide_decks,slides,
   move_slides,copy_slides,reports,versions}.ts` (moved + rekeyed: `mainDb`
   first param, `products` join for summaries, shared label/folder/delete/
   package/scope/duplicate functions, product-row bump in every content
   transaction); `db/project/**` deleted after the §2.10 relocation;
   `id_generation.ts` → 4 chars (D14); `dashboard_slugs.ts` deleted;
   `_main_database_types.ts` updated; `rename_user_email.ts` sweep.
3. **Access control**: `server/auth/global_user.ts`, `requireApprovedUser`
   (§2.2; `requireGlobalPermission` untouched), `project_auth.ts` deleted,
   `lib/types/permissions.ts` trimmed to the 6 instance flags,
   `permission_labels`, `lib/types/instance.ts` (`ProjectUser`,
   `createDevProjectUser`, RenameEmail shape), `users.ts` (db + routes:
   default-project functions, `getProjectsForUser`, `getOtherUser` shape,
   notify calls, `deleteUser` closes collab connections), `instance.ts`
   (`getMyProjects`), `h_users` branches.
4. **Routes**: `lib/api-routes/products/*` + `server/routes/products/*`
   (guard swap at every handler, `c.var.mainDb`, notify rewrite); `emails` →
   instance; run-keyed reads + `getRunAuthoringContext` (`run_generation.ts`
   registry + handler, `run_data_reads.ts` bodies take `adminArea2`);
   `run_read.ts` project lens + PO detail + `findVirtualDefault` deleted;
   `virtual_defaults.ts` trimmed; `caches/visualizations.ts` deleted;
   `route-utils` / `server-action-types` / `create_server_action` /
   `route-tracker` / `cors` / `logging` transport cleanup; `main.ts` mounts
   (public dashboard mount removed); `combined.ts`; `headless_allowlist`
   unchanged; `health.ts` trims; `backups.ts` restore body + 4 routes deleted;
   `disk_space.ts` project gates deleted; purge cron deleted; `onboarding.ts`
   `projectId` field; `compareProjects` deleted; `static.ts` comments
   updated (mount kept).
5. **Packages**: `db/instance/run_generation.ts` pointer functions,
   `pin_run.ts` (pin flag only), `attach_run.ts` + `package_compatibility.ts`
   deleted, `issueFor` to lib, `generate_run/{launch,pipeline,types}.ts`
   attach targets + guard deleted, `lib/types/run_generation.ts` renames,
   `delete_run.ts` comments.
6. **Realtime + collab**: `instance_sse.ts` types, `notify_instance_updated.ts`
   (products/folders/last_updated wrappers), `build_instance_state.ts` (split
   builder, readyPackages), `instance-sse.ts` forwardable filter for
   unapproved, `notify_last_updated.ts` signature; project channel files
   deleted; `routes/instance/collab.ts` (was `project-collab.ts`), `server/
   collab/*` (projectId removed from room/ledger/accumulator keys, product-keyed
   presence registry, `po_rooms.ts` deleted, `AddLog` without projectId,
   checkpoints emit product upserts), `lib/types/collab.ts` protocol (drop
   `project_awareness_update` + `po_*`), `lib/collab/figure_config_crdt.ts` PO
   half removed.
7. **AI + MCP**: `routes/instance/ai_proxy.ts` (copilot mount, approved) +
   `ai_files.ts` moved, `anthropic_messages_proxy.ts` / `ai_usage_logs.ts`
   without projectId, `mcp/context_cache.ts` (imports, door comment rewritten
   as load-bearing, `RunDataset*`), `server/tests/*` updated, instance-config
   `ai_context` (schema + route; the concatenation runs in 080).

### Phase 2 — Client (typecheck target: `npm run typecheck` green; prototype)

1. **State**: `state/instance/t1_store.ts` + `t1_sse.tsx` (products, folders,
   readyPackages, lastUpdated, `reconnectForApproval`), `state/instance/
   collab.ts` (mounted when approved, `reconnectCollab`), `state/instance/
   t2_run_authoring_context.ts`, `state/products/t2_*.ts` (rekeyed; PO detail
   + dashboards halves deleted), `_infra/reactive_cache.ts`, `clear_caches.ts`,
   `t4_ui.ts` (products + explore prefs, `pendingEditorOpen`, `?product=`),
   `state/project/**` deleted, `server_actions` regenerate (no `projectId`
   args — the call sites go through the compiler).
2. **Products page + create + settings + folders + Explore** (§2.6);
   `components/project/**` gone (≈24 deleted, ≈9 relocated — `add_visualization/`
   → `figures/insert_figure/`, `preset_preview.tsx`, `metric_details_modal.tsx`);
   `components/dashboards/**` + `public_viewer/**` deleted; `instance/index.tsx`
   tabs; `instance_projects.tsx` / `add_project.tsx` / `pending_deletions.tsx`
   / `compare_projects.tsx` / permission forms deleted; `app.tsx` route.
3. **Editors + figures + resolvers**: live PackageScope reads;
   `_editor_snapshot.ts`; `generate_visualization/**` (`get_data_config_from_po.ts`
   reads bundle scope; `resolve_figure_from_visualization.ts` ×2 deleted;
   `figure_staleness.ts` new; `assert_replicant_valid.ts`);
   `components/visualization/` → `figure_editor/` (standalone shell, settings,
   duplicate, save-as-new, create-slide-from-viz, `select_visualization_for_slide`
   deleted); stale badge + update actions in the slide figure block and
   `ReportFigureEmbed`; "Copy to deck…" in `slide_list.tsx`;
   `generate_slide_deck/convert_slide_to_page_inputs.ts` drops the unused
   `projectId` param; `exports/**` (dashboard exports deleted);
   `PresentationObjectPanelDisplay` (takes `{ scope, authoringContext }`),
   `ReplicateByOptions`, `slide_presenter`, `slide_card`, `view_results_object.tsx`
   (run-keyed raw preview), `_shared/{connection_banner,live_cursors,
   presence_toasts}`, `cursors/` (page cursors off the list), version_history
   (no projectId, `diff_segments` editor names from the instance roster),
   `share_slide_deck` (instance roster), `download_*`.
4. **Copilot** (`components/copilot/**`): wrapper mount, `client_env.ts` env
   resolver (+ source header), `build_tools.ts`, every tool file touching
   projectId, viz tools + `DraftVisualizationPreview` deleted, view registry
   (D15), system prompt (instance `ai_context`), interactions producer on
   `products_upserted` / `last_updated(slides)`, drafts (re-resolve on
   AddToDeck), documents (`useAIDocuments`, `AIDocumentSelectorModal` headers),
   `sdk_client` default headers, `slide_ai/*` helpers (take scope + context;
   `resolve_figure_from_visualization.ts` deleted), `ai_input.ts` descriptions
   sweep.
5. **Onboarding + copy sweep + help**: `onboarding/**` per §2.6; translation
   sweep to zero; `feedback_form` (`context` instead of `projectLabel`);
   `change_email_modal.tsx`; help buttons untouched until the docs site is
   rewritten (only `viz-data-tab` is consumed).

Prototype milestone = both typechecks + `lint:systems` + `deno task test`
green, dev DB consolidated by 080, app runs against it.

### Phase 3 — Rigs, tools, docs

1. `query_rig/**` re-based onto parquet + manifest fixtures driving
   `getPresentationObjectItemsCore` / `getPossibleValuesFromRun` /
   `getResultsValueInfoFromRun` / `getIndicatorMetadataFromRun`; the 59 cases
   re-judged under DuckDB (the 3 `err` cases are `validateFetchConfig` and
   survive); PROTOCOL_APP_QUERY_RIG "verified controls" restated.
2. Delete `backfill_runs.ts`, `validate_results_runs_parity.ts`,
   `validate_figure_bundle_backfill.ts`, `rollout_fleet/backfill/nigeria`,
   Dockerfile COPY lines 34-35; and, inside `server/runs/`, `synthesizeRunForProject`
   + the project-DB branch of `exportPgTableToParquet` (their files SURVIVE —
   the generation pipeline calls `buildRunPackageIntoTmp`, `readCsvHeaders`
   and `exportRowsToParquet`);
   add `validate_consolidation.ts`, `rollout_products`, `restore_main`,
   `purge_legacy_dbs`; `.github/scripts/sync-docs.sh` terminology line 141
   ("Product", "Folder"; drop "Project"/"Data window"/"Dashboard") + the
   example image path at :180, `generate-changelog.sh:168` example text;
   `validate_protocols --update-baseline` after the `project_ai` → `copilot`
   move.
3. Docs (§7) + SYSTEM globs (13 SYSTEM files, 98 glob lines — incl.
   SYSTEM_06's five relocated files) + SYSTEMS.md §4.1 rows; PLAN edits (D18);
   `PROTOCOL_ACCESS_DBS.md` (gitignored) rewritten locally; USER_GUIDE_MCP.md
   "per-project" lines.

### Phase 4 — Rollout (runbook, §5)

---

## 4. Gates (all must be green before merge; the last four before deploy)

- **[GREEN]** `deno task typecheck` (server + client + `lint:systems`); `deno task test` (13/13).
- **[GREEN]** `./validate_migrations` (main only).
- **[GREEN, superseded]** the Appendix A harness. Replaced by a stronger check
  that was EXECUTED: a throwaway postgres seeded with the pre-restructure base
  + all 78 legacy migrations, plus TWO project databases seeded byte-identically
  (simulating `copyProject`'s `WITH TEMPLATE`), run through 000→079→080→081.
  Folders merged per D10, 7 id collisions re-minted with the full reference
  surface rewritten (incl. deck-version slide ids and `slide_editors` keys),
  all four figure surfaces stamped, and the migrated schema dump came out
  BYTE-IDENTICAL to a fresh `_main_database.sql`.
- **[GREEN]** `./validate_queries` — 76 cases, re-based on parquet + manifest
  fixtures; 13 of them new and all about scope.
- **[GREEN]** Fresh-postgres boot (000→081 + transforms) completes, exit 0.
All five greps below are **[GREEN]**. The surviving hits are the deliberate
keeps named in each line, plus the SQL verb "re-project" and the three comments
naming the legacy `sandbox/{projectId}` dirs, which are real artefacts still on
the runs volume until `purge_legacy_dbs` clears them.

- `grep -rn "projectId\|requiresProject\|state/project/\|Project-Id" client/src lib server main.ts` → 0 (excluding `server/db/migrations/**`).
- `grep -rni "dashboard\|presentation_objects\|visualization_folder\|po_rooms\|follow_pinned\|followPinned" client/src lib server main.ts` → 0 outside `server/db/migrations/**` and the figure-config vocabulary (`PresentationObjectConfig`, `getRunPresentationObjectItems`, `normalize_po_config`, … — §8).
- `grep -rli "projet\|projeto" client/src lib client/public/info` → 0 (excluding "projection").
- `grep -rni "project" client/src lib server main.ts client/public/info | grep -vi "projection"` reviewed to zero outside `server/db/migrations/**` (000/080/081 and `consolidation/plan.ts` necessarily say it). Known residue excluded: `lib/help/help_targets.generated.ts` until the docs-site rewrite.
- `git ls-files | grep -i "project\|dashboard"` → 0 excluding `server/db/migrations/**`, `panther/**` (map projections), `_archive_*/**`.
- **[GREEN]** 080 executed against the dev DB: 11 projects → 15 products
  (4 decks / 11 reports), 7 folders, 26 slides, 5 versions, 0 id remaps —
  matching the dry-run's plan exactly, which is what D13's shared planning core
  exists to guarantee. The app runs on the migrated data. Tim's own use of it
  is the browser verification and is not a plan item.
- **[PENDING — needs the fleet]** `validate_consolidation.ts` zero FAIL
  fleet-wide (read-only); the `pending_deletion`, central-reporting,
  viewer-only-user, dropped-visualization / dropped-dashboard (incl. public)
  counts REVIEWED per instance (D2, D3, D11). Passes on the dev instance:
  10 visualizations (all user-authored) and 7 dashboards (6 public) deleted,
  8 of 9 users become full editors.
- **[PENDING — needs testing-tim]** `restore_main` rehearsed once.
- **[PENDING]** `./deploy_testing` to testing-tim BEFORE the fleet; then one
  multi-product instance before the rest.

---

## 5. Rollout runbook + rollback

**Step 1 is DONE; steps 2–8 have not started.** Everything below needs real
infrastructure and is Tim's to trigger.

1. ~~Ship §0 (sweep deletion) as its own patch on `main` first.~~ **DONE** —
   shipped on both `main` and the branch (`25871ed4`).
2. Fleet dry-run (D13); fix and repeat until zero FAIL; act on the
   `pending_deletion` and central-reporting lists (D11); read the
   dropped-visualization / dropped-dashboard counts and the viewer-only-user
   counts per instance — this is the last moment to change your mind on D2/D3.
3. Server-cli: path-agnostic nginx WS-upgrade template, re-emit fleet sites
   (harmless to the old `/project_collab` path — no window).
4. Take a NAMED status-api backup of every instance immediately before rollout
   (`main` dump + previous image = rollback; the previous image cannot boot
   after 081 without that dump). Rehearse `restore_main` on testing-tim.
5. `./deploy_testing` → testing-tim FROM `tim-branch-restructure` (it ships
   the working tree, no git ops); verify products/folders/counts vs the
   dry-run plan. Only then merge the branch into `main` and run
   `rollout_products` across the fleet with the per-instance post-check.
6. Settle (days); then `purge_legacy_dbs` per instance — also retires the
   long-standing orphaned-UUID-DB open item and the legacy sandbox dirs.
7. After the purge: delete `validate_consolidation.ts`, `rollout_products`,
   `purge_legacy_dbs` (and `restore_main` unless kept as general ops tooling)
   in one commit. `000` / `080` / `consolidation/plan.ts` / the runner's `.ts`
   support remain as migration history until the next base squash.
8. External follow-ups (§6) — before or right after step 5 as marked.

Rollback = `restore_main` from step 4 + previous image; project DBs are still
on disk (untouched by 080).

---

## 6. External couplings (named, not fetched — separate repos/services)

- **status-api / Status Central Portal**: `/health_check` loses `projects`;
  `/projects` and `/project_activity` are gone; `/user_logs*` and `/ai_usage`
  rows lose `project_id`; per-project backup files stop appearing (main dump
  only); rename-email fan-out result shape. Coordinate BEFORE the fleet deploy
  (their pollers must tolerate the missing fields).
- **Fleet MCP connector** ("FASTR Results", `get_my_projects` / project-scoped
  dialect): this repo's `/mcp` is already the pinned dialect (1.67.x); no
  change expected, but the connector's project vocabulary is stale after this.
- **server-cli**: path-agnostic nginx WS-upgrade template (before deploy);
  (later, separate) sandbox→runs sites.
- **wb-fastr-site (docs)**: 15 EN + 15 FR pages mention projects; two
  wholly-project pages; the dashboard + visualization pages; 4 images; help
  tags `aproj-*` / `uproj-*` / `users-project-permissions`. After the site
  rewrite: `deno task build:help-buttons`. Not blocking (one help button
  consumed).
- **panther**: no code coupling; example snippets in `PROTOCOL_DENO_API.md`
  (`Project-Id`) and `PROTOCOL_UI_AI_CHAT.md:294` (`getSharedToolsForMetrics(env,
  projectId, …)`) — edit in panther, re-sync.
- **wb-fastr-modules**: no coupling (`PROJECT_DATA_HMIS` is an opaque token;
  `DOC_MODULES.md:36` prose stale; `createDefaultVisualizationOnInstall` keeps
  its name — it now means "is a preset").
- **Clerk**: `unsafeMetadata.onboarding` tour keys re-fire once after the
  rename; nothing else.
- **Public dashboard URLs** in the wild (`/d/<slug>`) go dark. No redirect.

---

## 7. Docs to rewrite in the same push (and drift to fix in passing)

SYSTEM_00 (`ProjectUser` kernel row), SYSTEM_01 (Project-Id pipeline, guards,
the `requireApprovedUser` guard, path-id doctrine, route counts, phantom
project streaming route, `export_central`), SYSTEM_02 (multi-DB model →
single main + runs volume, `.ts` migrations, per-project boot pass, restore
mechanics, id generation), SYSTEM_03 (channel catalog, per-row product
upserts, Q-B revision, `notifyProject*` wrappers, the `po_detail` row removed
and `PO_CACHE_VERSION` 16 — the doc still says v7/13), SYSTEM_05 (prose
crossing into project DBs), SYSTEM_06 (globs → `server/runs/capture_inputs/**`,
`lib/types/run_datasets.ts`; the "project attach/snapshot seam" section),
SYSTEM_08 (attach/pin/followers/AA2 → per product, NO followers; wizard attach
targets; MCP door as the narrower gate; "metric data is a product read"),
SYSTEM_09 (project lens → run mount with scope; no PO detail; cache table),
SYSTEM_10 (bundle `scope`/`provenance.runId`; roll-up label rule; staleness +
per-figure update; identity claim restated as "identical code path; identical
output when the pairs match"), SYSTEM_11 (library page → Products + Explore;
figure vocabulary; `ai_tools.ts` phantom), SYSTEM_12 (retitled "Products &
Folders"; registry, folders, notify catalog; dashboards section deleted),
SYSTEM_13 (mount, env, source header, views become 5; `ai_tools.ts` phantom),
SYSTEM_14 (routing `?product=`, tabs incl. Explore, `/d/` gone), SYSTEM_15
(project lifecycle/roles/backups gone; production topology "live vs orphaned
DBs" → purge script), SYSTEM_16 (one socket, `/collab`, product-keyed
presence, room keys; PO rooms gone), SYSTEM_17 (`project_id` gone),
SYSTEMS.md (§4.1 rows for `db/project/projects.ts`, `routes/project/project.ts`,
the stale `results_objects.ts` row; SYSTEM_12 title; §6 vocabulary line
"product / folder / scope / figure / preset"), CLAUDE.md (multi-database
section, Project Routes, worker list, Key Features "Visualization"), 
PROTOCOL_APP_ROUTES (single guard recipe), PROTOCOL_APP_STATE (tier
inventories), PROTOCOL_APP_MIGRATIONS (`.ts` migrations, no project dir,
transform signature), PROTOCOL_APP_QUERY_RIG (re-based rig),
PROTOCOL_APP_DEVELOPMENT (chain links 6–7), PROTOCOL_APP_UI_CONVENTIONS
(`project_data.tsx`, darkMode API), PROTOCOL_APP_WORKER_ROUTINES (dead worker
names), PROTOCOL_APP_AI_TOOLS, USER_GUIDE_MCP.

---

## 7b. Small things left open at hand-off

Two known bits of residue, both cosmetic, neither blocking:

- **`showEditingPulse` is dead UI.** The server still stamps `isEditing` and it
  does real work (suppressing idle dimming), but nothing passes the prop —
  D8 removed the list-page cards that rendered it. Delete the prop.
- One comment breadcrumb survives at
  `client/src/components/figure_editor/visualization_editor_inner.tsx:257`, and
  `client/src/app.css:33` still names the long-deleted `dark_mode_figures.ts`.

Also unresolved, and Tim's call rather than a defect: `./validate_queries` used
to take two minutes and now takes ~2s, so it could reasonably join
`deno task typecheck` and become part of the `./deploy` gate.

---

## 8. Explicitly out of scope (later plans, one line each)

The permission system rebuild (product-level permissions / sharing; join key
`products.created_by` exists; `RoomConn.canEdit` plumbing kept); a products
trash; a public deck link (the only public surface dashboards provided); a
figure library / cross-product figure clipboard beyond `copySlidesToDeck`;
the `PresentationObjectConfig` → `FigureConfig` vocabulary rename
(`lib/get_fetch_config_from_po.ts`, `normalize_po_config.ts`,
`getRunPresentationObjectItems`, `t2_figure_data` internals…); sandbox→runs
directory rename (PLAN_RESULTS_RUNS residue); an in-app main-DB backup UI;
per-entity report `preview` column; presence avatars / live cursors on the
Products list; folder nesting; a dead-glob check in `lint_systems.ts`; the
next base squash that retires `000` / `080` / the `.ts` runner.

---

## 9. Size

Roughly: ~165 files deleted (client `components/project/**` 33,
`components/dashboards/**` + `public_viewer/**` 16, `state/project/**` 10,
viz-product client files ≈12, server `db/project/**` 21 after relocation,
project routes/registries 30, dashboard + PO server/lib files ≈15, 41 project
migrations + base, ops scripts 6, tours), ~200 files edited (mostly
mechanical: `projectId` → scope, guard swaps, notify signatures, T2 keys,
translations), ~30 new files (products DB/routes/UI, Explore, figure
staleness, migrations, planning core, dry-run + rollout + restore + purge
scripts, run authoring context). Net around −14k LOC. The genuinely new logic
is small: the products registry + folders, the consolidation planner (id
remap incl. version PKs, folders, bundle stamps), the run-keyed reads with
scope + the authoring context, the Products page + Explore page, the
per-figure stale/update path, and the copilot env resolver. Everything else
is deletion or rekeying.

---

## Appendix A — The executed migration replay (D9), reproducible

Run 2026-08-19 in a throwaway `postgres:15` container (`wbf-plan-verify-54331`,
removed afterwards; the dev `pg` container untouched), AGAINST THE FIRST
DRAFT's 079 DDL (which included `presentation_objects` and the dashboard
tables). The 000 and 081 texts below are unchanged by the rewrite; 079 is now
a subset — the harness is re-run with the final DDL as a §4 gate before build
is called done. The harness mirrors `validate_migrations` exactly: `psql -v
ON_ERROR_STOP=1 -q` per file, then `pg_dump --schema-only --no-owner
--no-privileges | grep -v '^--' | grep -v '^$' | grep -v '\restrict' | sort`,
diff before/after.

Inputs drafted from this plan (nothing in the repo was touched):

- `new_base.sql` = current `_main_database.sql` minus `projects`,
  `project_user_roles`, `dashboard_slugs`; minus `users.can_create_projects` +
  the 17 `default_project_can_*`; minus `project_id` (+ FKs,
  `idx_user_logs_project_id`, `idx_ai_usage_logs_project_id`) on `user_logs` /
  `ai_usage_logs` / `user_logs_aggregate`; `idx_user_logs_aggregate_unique`
  rebuilt as `(user_email, endpoint, endpoint_result, week_start)`; `runs`
  unchanged; plus the §2.1 tables with project-DB column shapes.
- `000_legacy_project_shell.sql` — verbatim:

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

- `079_products.sql` = §2.1 DDL in `CREATE … IF NOT EXISTS` form.
- `081_drop_project_layer.sql` — verbatim:

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
  -- … the other 16 default_project_can_* columns …
  DROP COLUMN IF EXISTS default_project_can_view_script_code;
```

Results (first-draft 079):

1. Today's harness check: current base + the 81 current migrations → all ok,
   before == after (reproduces `validate_migrations` green).
2. Fresh path: `new_base` → 000 → the 81 current migrations → 079 → 081 → 84
   ok, ZERO statement errors, before == after (zero occurrences of "project").
3. Live path: current base + 81 migrations + seed (2 users with
   `default_project_*` flags, 1 run, 2 projects, a role row, a slug, 3
   `user_logs`, 2 `ai_usage_logs`, 5 aggregate rows of which 3 differ only by
   `project_id`) → 000 (no-op) → 079 → 081 → all ok; the dump is byte-identical
   to `new_base`'s; logs and users preserved; aggregate rows merged (3+4+5 →
   12, min id kept).
4. Historical fleet shapes: bases from commits 42516bec (05-05), fd1a259e
   (05-18), 68160f6e (05-25), d3c3b18d (06-29), 4791f190 (07-16), 04dfd51f
   (08-06), 3d320bb4 (08-12) + the migrations added after each + seed + 000/
   079/081 → zero errors everywhere; 3d320bb4 identical to `new_base`; the
   others differ only by pre-existing legacy `admin_areas_1..4` / iceh drift
   that is identical before and after (PLAN_REMOVE_OLD_STRUCTURE_TABLES
   territory).
5. Edge tests: `CREATE TABLE IF NOT EXISTS projects (… REFERENCES runs)` with
   `projects` present but `runs` absent → skipped without error (an instance
   behind 065 survives 000); `DROP COLUMN project_id` drops the COALESCE
   expression index by dependency.
6. Negative controls: 000 without the `user_logs_aggregate` ALTER fails at 035;
   without any log ALTER fails at 016 — the shell columns are load-bearing.
7. Runner: pending migrations sort by filename (`localeCompare`), so on a live
   instance 000 applies first (no-op), then 079 / 080 / 081; a fresh
   `db_startup` = base + all migrations; the initial user seed inserts only
   `(email, is_admin)`.
