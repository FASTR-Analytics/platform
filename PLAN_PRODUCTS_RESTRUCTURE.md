# PLAN — Products restructure: dissolve projects, products at instance level

Status: PLAN, not built. Branch `tim-branch-restructure`. Written 2026-08-19 from
VISION_RESTRUCTURED_APP.md after a repo-only homework sweep (11 subsystem
inventories, a completeness pass, a five-lens adversarial review and a
second-round verification whose findings are folded in below; every claim was
verified against code, file:line pointers included where they matter; the
migration mechanism in D9 was EXECUTED in a throwaway postgres — Appendix A).
Every decision in this plan is RULED — there are no open questions. §1 lists
the big ones so you can overrule any of them before we build; everything else
follows from those. Where a ruling OVERRULES a standing SYSTEM ruling it says
so.

Vocabulary: **product** = one of visualization (PO) / slide deck / report /
dashboard; **folder** = the one flat organising level; **package** = results
package (`runs` row + run dir; "run" stays the internal name); **scope** = the
product's `admin_area_2` (NULL = national); **PackageScope** = the client-side
pair `{ runId, adminArea2 }` a product carries; **authoring context** = what an
author needs FROM a package to build products (metrics, modules, indicators,
taxonomy, presets) — a pure function of the run dir.

---

## 0. Independent of this plan — a live data-loss bug found during homework

`server/db_startup.ts:479-491` `cleanupOrphanedPresentationObjects` runs on
EVERY boot for EVERY project:
`DELETE FROM presentation_objects WHERE metric_id NOT IN (SELECT id FROM metrics)`.
The project-DB `metrics` table is FROZEN since 2026-07-29 (no `INSERT INTO
metrics` exists anywhere in `server/`/`lib/` — verified; `addProject` no longer
installs modules, `projects.ts:258-264`). Consequences today, on every
restart/deploy of every instance:

- a project created after 2026-07-29 has an EMPTY `metrics` table → `NOT IN
  (empty)` is TRUE → **every user-authored visualization in that project is
  deleted at boot**;
- an older project loses every visualization built on a metric id that entered
  the modules after its frozen install (new metrics in newer packages).

Dev DB check (read-only): the projects with `metrics = 0` all have `POs = 0`,
consistent with the sweep having fired.

**Is the project-DB `metrics` table needed at all? No — verified by tracing
every reader (2026-08-19, independently of the research agents):**

| Reader of project-DB `metrics` | Live? |
| --- | --- |
| `db_startup.ts:484` `cleanupOrphanedPresentationObjects` | yes, every boot — the bug |
| `data_transforms/metric.ts` `migrateMetricsColumns` (`db_startup.ts:262`) | runs every boot, transforms a table nothing reads (fail-stop teeth for nobody) |
| `db/project/modules.ts:39` (inside `uninstallModule`) | only from the `cleanupOrphanModules` sweep (`db_startup.ts:468`) |
| `results_value_resolver.ts:25` `resolveMetricById` | callers: pg `getPresentationObjectDetail` (`presentation_objects.ts:159` — ZERO call sites; the route uses `getPresentationObjectDetailFromRun`, `routes/project/presentation_objects.ts:237`) and pg `getResultsValueInfoForPresentationObject` (imported only by `query_rig/mod.ts:8`) |
| `synthesize_run.ts:270` | only `backfill_runs.ts` (operator rollout tool; rollout closed) |
| `query_rig/seed.ts:55` | the rig seeds its own rows in a throwaway DB |

The serving path never touches it: `run_read.ts` reads `ctx.manifest.metrics`
(581, 602, 649, 710) and imports only the pure `buildResultsValueInfo` /
`indicatorFormatsFrom` helpers from `get_results_value_info.ts` (run_read.ts:
70-73); the pg-wrapper barrel `server_only_funcs_presentation_objects/mod.ts`
is imported by `query_rig/mod.ts` alone. The same holds for the frozen
`modules` table (readers: the two sweeps, the `module_definition` transform,
`project_last_updated.ts:54`'s SSE stamp, the pg plane, `synthesize_run`). This
is already the ruled design — PLAN_RESULTS_RUNS Phase 4 drops
`modules`/`metrics`/`results_objects`/`ro_*` and SYSTEM_08 calls them frozen,
"read by nothing" — and this plan's D9/D12 deletes them with the project DBs.

**Hotfix (needs your go; its own patch on `main` BEFORE anything else):**
delete the four frozen-table boot steps in `db_startup.ts` —
`cleanupOrphanedPresentationObjects`, `cleanupOrphanModules` (+ the now-orphan
`uninstallModule` in `db/project/modules.ts`), and the `metrics_columns` +
`module_definition` entries of `PROJECT_DATA_TRANSFORMS` (+ their two
transform files). Nothing reads what they police; the sweep deletes real
data; the transforms can only fail-stop a boot for a table no one serves. The
restructure's consolidation copies product rows out of the project DBs, so
anything the sweep deletes before that boot is gone for good.

---

## 0b. Boundary — the plan lives in the product plane and the package READ side

Checked against every file the plan names (2026-08-19). The three planes of
SYSTEM_08 (instance plane = data in; results plane = generation into an
immutable package; project plane = meaning) — this plan replaces the PROJECT
plane with products and touches the RESULTS plane only on its read/attach
side.

**Untouched — not one file named:** dataset ingestion (HMIS/HFA/ICEH
wizards, staging/import workers, import runs, scheduled imports), the DHIS2
connector, the structure / facilities / indicators / calculated-indicators /
geojson tables and routes, the instance Data tab, the package FORMAT
(manifest, run dir, parquet, R execution, finalize) and the runs volume, the
generation pipeline's inputs capture and execution.

**Touched outside the product plane — each because a project reference
lives there, and each the minimum cut:**

- Results-plane SEAM, not generation itself: the wizard's launch-time
  attach-to-projects feature (`attachTargetProjectIds` in
  `generate_run/{launch,pipeline,types}.ts`, its launch concurrency guard,
  `publishReadyRun`'s repoint, the wizard client's attach-target step and
  confirm copy) is DELETED because its targets are projects (D5); the
  catalogue's "in use by" / delete guard count products instead of projects;
  `runs.summary`'s two project keys are stripped by a JSON transform (the
  catalogue row, never the package). Two files in `generate_run/` change
  only their IMPORT PATHS (`prepare_inputs.ts`, `pipeline.ts`) because the
  input-capture helpers they use are relocated out of `server/db/project/`
  (§2.10) — behaviour unchanged.
- Package READ side (allowed — this is the "results-package infra" the plan
  is about): run-keyed data reads gain a scope parameter and an authoring
  context route; pin/follow/compatibility/attach rewrite against products;
  the `/mcp` door and headless allowlist are unchanged.
- Instance-level TABLES, only where a project column/FK exists: `users`
  loses the 17 `default_project_*` columns + `can_create_projects` (the
  project permission tier); `user_logs` / `ai_usage_logs` /
  `user_logs_aggregate` lose `project_id` (FKs to `projects`);
  `dashboard_slugs` (project-plane data that lived in main) folds into
  `dashboards`; `instance_config` gains `ai_context` (moved from
  `projects.ai_context`). No dataset/structure/indicator row is read or
  written by any migration.
- Instance ops surfaces that were project features: health `/projects` +
  `/project_activity` + the `projects` field of `/health_check`; the
  per-project backup/restore routes; the project purge cron and the two
  project disk gates; the rename-email per-project sweep; the instance SSE
  channel carries product lists (transport only).
- Access control: ONE new guard, `requireApprovedUser()`, used by the product
  / package-read / copilot / collab surface only. `requireGlobalPermission()`
  and every existing instance route keep their exact semantics (D2).

---

## 1. The big decisions (ruled — overrule here, not later)

**D1 — Storage: one main DB, a `products` registry + per-type detail tables.**
Per-project Postgres databases are deleted. Main gets `folders`, `products`
(id, type, label, folder_id, run_id, admin_area_2, follow_pinned, created_by,
created_at, last_updated) and per-type detail tables keyed by the same id with
`ON DELETE CASCADE` (`presentation_objects`, `slide_decks`+`slides`, `reports`
+`report_versions`, `dashboards`+`dashboard_items`+`dashboard_item_groups`,
`deck_versions`). Rejected: four independent tables each carrying
folder/run/scope (every cross-type operation — list, folder move, pin-move,
delete-run guard, "in use by", id namespace — becomes a 4-way UNION). Rejected:
keeping one hidden "workspace" project DB (a lie about the model).

**D2 — Permissions: an approved instance user is a full editor of every
product.** No project tier survives (17 flags, 17 `default_project_*` mirrors,
`project_user_roles`, `role`, `is_locked`, `is_central_reporting`, presets, 6
forms, 8 routes, `resolveProjectUserAccess`, per-family collab flags, ~20 client
`canEdit` gates). Instance flags become exactly six (`can_create_projects`
dropped). Product CRUD, folders, product DATA reads (metric items / value-info
/ replicant options / raw preview under an explicit `(runId, adminArea2)`), the
authoring context and the ready-package list are guarded by a new
**`requireApprovedUser()`** — a sibling of `requireGlobalPermission` that
additionally requires `globalUser.approved` (today the zero-perm
`requireGlobalPermission()` never checks `approved`,
`server/middleware/userPermission.ts:71-93`, and the project path was the
only place approval was enforced, `project_auth.ts:262`). It is used ONLY on
the new surface (product/folder routes, the run-keyed data reads + authoring
context + ready-package list, the copilot `/ai` + `/ai/files` mounts, the
collab socket, the products filter on the instance SSE); every existing
instance route, the static mount and the instance SSE endpoint keep their
exact guards (SYSTEM_01's "zero-perm routes never check approved" open item
stays open and out of scope). Package INTERNALS
(`getRunDetail`, script/logs/files viewers, the `/:run_id/outputs/*` download
mount, the catalogue, generation, pin) keep `can_view_data` /
`can_configure_data`. **Package reads are therefore two classes**: INTERNALS
(`can_view_data`) and METRIC DATA (a product read, approved) — this narrows
SYSTEM_08's 2026-08-19 "Metric DATA is package contents too" (which made the
run-keyed data reads `can_view_data`); restate it in SYSTEM_08. The `/mcp`
door keeps its explicit `can_view_data` check
(`server/mcp/context_cache.ts:246-255`) as a DELIBERATELY NARROWER gate for a
long-lived credential (a leaked PAT reaches less than the user's SPA, never
more); the door check becomes load-bearing (its comment, which says the
run-keyed routes enforce the bit, is rewritten) and its 30 s revocation window
is accepted. Rejected: gating products on `can_view_data` (forces raw-data +
package-internals access onto every deck/report viewer and makes a freshly
approved user see an empty shell until an admin ticks a bit — the opposite of
"big Create button"). Rejected: a new `can_edit_products` flag (a permission
tier you said to scrap; defaults either lock everyone out or mean nothing).
Consequence accepted: former project "viewers" become editors; product-level
permissions are a later feature (`products.created_by` is recorded now so a
later owner/sharing model has its join key). Doctrine change for SYSTEM_01:
the product id in the path IS the authority; a future product-permission
scheme must be a product-aware guard, never per-handler checks.

**D3 — The container's PackageScope governs every embedded figure.** A
deck/report/dashboard has ONE `(run_id, admin_area_2)`; every figure inside it
— picked from a visualization product, edited ephemerally, or created from
the wizard — resolves under the container's pair. A container embed consumes
ONLY the viz row's `{ metricId, config }` and resolves through the CONTAINER's
authoring context (`authoringContext.metrics.find(metricId)` →
`resolveBundleFromMetricAndConfig(scope, metric, config)`); the
from-visualization resolvers (`resolveFigureBundleFromVisualization`,
`resolveFigureAndGeoFromVisualization`) collapse onto the metric-keyed resolver
taking a PackageScope. A visualization product's own pair governs only its
standalone card/editor. Grounding: two of the three embed paths have no source
visualization at all and already resolve under their host (slide_editor
828-843/936-950, dashboard_editor 243-256, report/index 1008-1015); bundles key
re-resolution off `metricId`, never a viz id
(`resolve_bundle_from_metric_and_config.ts:11-12`); it matches today's
semantics exactly (deck and viz shared the project's pair), so migration is
loss-free. Compatibility is the full three-condition check (metric absent →
metric unavailable → requested disaggregation missing, `package_compatibility.ts:44-80`
`issueFor`, moved to `lib/` since it is manifest-only): the pickers grey out an
incompatible viz naming the reason, thumbnails render under the container
scope, AI `from_visualization` embeds refuse with an `AIToolFailure` naming
the reason. The collapsed from-viz embed path keeps today's NON-strict
replicant handling (`resolve_figure_from_visualization.ts:40-44` auto-defaults
an unset/absent replicant) — a stored replicant value missing under the
container's run is auto-defaulted, never a throw, so no fourth picker
condition is needed. Duplicate clones `(run_id, admin_area_2, follow_pinned)` verbatim;
"use this preset" and every save-as-new take the pair of the context they are
invoked from (the open container's pair, else the create modal's / copilot
env's current pair). Copilot drafts: when no `editing_slide_deck` view is
active, `AddToDeckModal` RE-RESOLVES the draft slide's figure blocks under the
chosen deck's PackageScope + authoring context before `createSlide`;
"Save as new visualization" takes the env's current pair with
`follow_pinned = (runId === pinnedRunId)`. SYSTEM_10's identity claim is
restated as "identical code path; identical output when the pairs match".
Rejected: the viz's own pair (silently mixes packages inside one deck; "change
this deck's package" becomes undefined).

**D4 — Scope and run are CAPTURED into the FigureBundle.** `figureBundleSchema`
gains required `scope: { adminArea2: string | null }` and
`provenance.runId: string | null`. `getRollupRowLabel`
(`client/src/generate_visualization/get_data_config_from_po.ts:103-120`) reads
`bundle.scope`, never a global store — this also fixes a live hole: the public
viewer / exports render an AA2 project's roll-up row as "National" today
because they read `projectState.adminArea2` outside a project shell. The
consolidation stamps both from the owning project row into every figure block
in the LIVE tables (slides, dashboard_items, dashboards, reports — the shared
figure-block sweep; three schemas: `_slide_config.ts:159`,
`_dashboard_config.ts:11`, `reports.ts:34`) AND in the version snapshots
(`report_versions.figures`, `deck_versions.slides[].config`): the restore
paths run `transformFigureBlock` on snapshots at read time
(`versions.ts:59-79` `upgradeSnapshotFigures` / `upgradeSnapshotSlideConfig`,
applied at :204, :280, :319, :459, :645) and then parse with the current
strict schema — but scope/runId cannot be derived there (no project row), so
080 stamps them and the restore hook must NOT default them (a missing key is
the intended fail-loud). Scope stays OUT of the PO config / fetch hash
(S9/S10 rule).

**D5 — Run pointer per product: physical `run_id` + `follow_pinned`.** Honours
SYSTEM_08's ban on read-time pin indirection. New products default
`follow_pinned = TRUE`, `admin_area_2 = NULL`, and when `followPinned` is true
the SERVER resolves `run_id` from `runs WHERE pinned` inside the insert (a
stale client `pinnedRunId` must not mint a follower already behind the pin);
the client's `runId` is authoritative only when `followPinned` is false. The
create modal shows the pin prefilled and lets the user change it. Pin-move
becomes ONE statement inside the existing advisory-locked transaction:
`UPDATE products SET run_id = $pin WHERE follow_pinned` (the follower loop,
`supersededMidway`, `skippedLocked`, per-follower connections all die). Manual
pick of a non-pin clears `follow_pinned` (existing rule). This OVERRULES
SYSTEM_08 "new projects and copies start unsubscribed" — for products the
friction goal wins (copies/duplicates clone the flag verbatim per D3). Wizard
launch-time attach targets are DELETED (`attachTargetProjectIds`, the
target-keyed launch concurrency guard, `publishReadyRun`'s repoint; a
`runs.summary` transform strips `attachTargetProjectIds` /
`backfillSourceProjectId`) — a generation produces a package; products point
at it afterwards, the pin is the explicit act. Delete guard + catalogue "in
use by" count `products.run_id` by type.

**D6 — Virtual default visualizations are NOT products.** They are presets of
a package (`derive_default_visualizations.ts`, keyed by manifest.runId) and
surface in two places: the create-visualization flow (metric → preset) and the
container's insert-figure picker (the container run's presets). "Use this
preset" materialises a real product row (today's duplicate-to-customize path).
They never appear in the Products list; the virtual-defaults half of
`getAllPresentationObjectsWithVirtualDefaults` and the `findVirtualDefault`
branch of the detail read move into `getRunAuthoringContext.presets`; the
`isVirtualDefaultId` write guards go. Rejected: a "Presets" section on the
Products page keyed to the pin (a second surface for the same thing).

**D7 — Data reads: ONE run-keyed mount, caller supplies `(runId, adminArea2)`.**
Delete the project lens (`getRunReadContext(mainDb, projectId)` and its five
callers, `routes/project/{presentation_objects data half, modules}.ts`,
`getCacheStatus`). Extend `getRunPresentationObjectItems` /
`getRunResultsValueInfo` bodies with nullable `adminArea2`; add
`getRunReplicantOptions`, `getRunResultsObjectItems`, and
**`getRunAuthoringContext(run_id)`** → `{ modules, metrics (MetricWithStatus =
ResultsValue & status), datasets, commonIndicators, icehIndicators,
hfaTaxonomy (WITHOUT time points — those are instance T1, not run content:
`run_read.ts:422-426`), presets }` — the manifest projection `getProjectDetail`
builds today (`db/project/projects.ts:75-101`), derived from the run dir ONLY
so the client cache is immutable by identity. **PO detail becomes a pure
content row** — `{ id, metricId, config, lastUpdated }` (+ the crdt fields for
the room) and nothing else: label, folder, run, scope, follow are read from
the T1 `ProductSummary` ONLY, and the client derives `resultsValue` from the
authoring context of WHATEVER run it renders under (the product's own run for
its card/editor, the container's run for embeds). That is what lets the detail
cache version on `lastUpdated.products[id]` alone and lets a pin-move not touch
`last_updated`; every OTHER metadata write (label, folder, scope, package,
follow) bumps `last_updated` as today. Guard: `requireApprovedUser()` for the
data reads and the authoring context; the run-keyed DATA reads additionally
require `runs.status = 'ready'` (the same gate a product pointer has — nothing
legitimate reads metric data of a generating/failed run; package INTERNALS
keep their no-READY-check exposure). `adminArea2` is shape-validated +
`escapeSqlString`'d exactly as today (no structure lookup exists today either
— `projects.ts:382-395` is a plain UPDATE). Valkey keys keep `runId` as the
LEADING uniqueness segment (`delete_run.ts:63-74` prefix sweep) and
`scopeToken` trailing so `PO_CACHE_VERSION` needs no bump. The headless
allowlist stays byte-identical (nullable field; `/mcp` keeps national).
SYSTEM_08's "no caller-supplied runId on a project route" objection was the
project-vs-instance permission gap, which D2 removes. A viz whose `run_id` is
NULL is a typed "no package" state: detail returns a typed failure, its
card/editor render the existing no-package empty state with a Settings link,
the picker still lists it (embeddable by metric under a container's pair);
creating a viz requires a package.

**D8 — Realtime: ONE instance SSE channel, ONE instance collab socket.** The
project channel (`project-sse-v2.ts`, `notify_project_v2.ts`,
`build_project_state.ts`, `project_last_updated.ts`, `lib/types/project_sse.ts`,
client `state/project/t1_*`) is deleted. `InstanceState` gains `products:
ProductSummary[]`, `folders: Folder[]`, `readyPackages: { id, label,
createdAt }[]` (every approved connection — ready-package LABELS are
approved-user data, a deliberate revision of SYSTEM_03's Q-B "run labels must
not fan out", which now covers generation telemetry only), and `lastUpdated:
{ products, slides }`; all withheld from unapproved connections by the
existing roster rule. **`products_upserted { products }` is the ONLY
product-list message** (per-row; the T1 handler patches
`lastUpdated.products[id]` from `row.lastUpdated`); `products_deleted { ids }`;
`folders_updated` whole-list (small); `last_updated` is emitted for `slides`
only; `starting` carries the full lists. Whole-list reads (`getAllReports`
loads bodies) happen only on `starting`. The unapproved→approved transition is
ruled: on `currentUserApproved` false→true the client reconnects BOTH streams
(`reconnectForApproval()` = instance SSE disconnect/connect + collab connect);
collab is mounted only when approved and keeps a `reconnectCollab()`
primitive (the per-family flag reconnect triggers die); `deleteUser` and any
approval revocation call `closeConnectionsForEmail` (the rename precedent).
The run-derived catalog leaves SSE (`run_attached`, `admin_area_2_changed`,
`project_config_updated` die) for the immutable T2
`getRunAuthoringContext(runId)`. Collab: `GET /collab` (was
`/project_collab/:project_id`), auth = origin + Clerk + approved, rooms keyed
`docType::docId`, presence keyed by PRODUCT (registry `productId →
connectionId → entry`, productId = deckId ?? reportId ?? poId;
`presence_update` moves a connection between scopes; `broadcastPresence`
per product scope) — the project-level page-awareness relay, list-page
cursors and card presence avatars are dropped. The server-cli nginx template
becomes PATH-AGNOSTIC (standard `map $http_upgrade …` + Upgrade/Connection
headers on the app `location /`) and is emitted fleet-wide BEFORE the deploy,
so the rename has no window and no future path coupling. `runVersionKey`
becomes cache PARAMS `(runId, scopeToken)`; `pdsNotRequired`/`pds_not_ready`
and `responseRunVersionMatches` die; the server `_PO_DETAIL_CACHE` (the only
projectId-keyed Valkey cache) is DELETED, not bumped; the three run-keyed
Valkey caches are untouched; client IndexedDB cache NAMES are kept (the
deploy flush clears every non-AI key on version change and the key shapes
change anyway — no `_v2` suffixes). Per-browser AI residue (`ai-conv*`
entries scoped by old project ids, `ai-documents/<projectId>`,
`panther-ai-settings-{projectId}`, the old `projectTab`/sort localStorage
keys) is ACCEPTED, not migrated.

**D9 — Migration mechanism: tracked, ordered, transactional.**
`server/db/migrations/runner.ts` learns to apply `.ts` migrations beside
`.sql`: a literal-keyed static import map (so `deno check main.ts` covers
them), id = filename minus extension, sorted together, same
`schema_migrations` row, same one-transaction rule; a `.ts` migration THROWS
(never exits) so the runner's rollback + fail-stop is the single funnel; EVERY
main-DB statement in it (and every helper it calls — id generator, slug
minting) goes through the migration `tx`; source project pools are read-only,
opened fresh (`getPgConnection(uuid, {max: 2})`, `.end()` in `finally`,
`rename_user_email.ts:170-176` precedent) after a `pg_database` existence
check through `tx`. `validate_migrations` globs `*.sql` and ignores them by
construction. Then:

- `000_legacy_project_shell.sql` — `CREATE TABLE IF NOT EXISTS` for
  `projects` (the FULL pre-restructure DDL: id, label, ai_context, is_locked,
  is_central_reporting, status, deletion_scheduled_at, run_id, admin_area_2,
  follow_pinned — 080 SELECTs these columns and runs on a fresh DB too) and
  `project_user_roles` (+ its two indexes), PLUS `ALTER TABLE … ADD COLUMN IF
  NOT EXISTS project_id text` on `user_logs`, `ai_usage_logs`,
  `user_logs_aggregate` (no FK): the base no longer has them, but 016's
  `CREATE INDEX … ON ai_usage_logs(project_id)` and 035's `CREATE UNIQUE INDEX
  … COALESCE(project_id,'')` STATEMENTS must resolve after their `CREATE TABLE
  IF NOT EXISTS` no-op against the base (Postgres resolves the index
  expression before the IF-NOT-EXISTS name check — verified: without the
  `user_logs_aggregate` ALTER the replay fails at 035, without any ALTER at
  016). With the shell, the old instance migrations that touch these tables or
  columns (004,005,006,007,008,009,016,021,035,041,043,065,066,075,077) replay
  on a fresh DB; no-op on live instances (`CREATE TABLE IF NOT EXISTS` skips
  even FK resolution when the table exists, so an instance behind 065 survives
  000 too).
- `079_products.sql` — DDL identical to the new `_main_database.sql`.
- **`080_consolidate_projects.ts`** — one main transaction. For each
  `main.projects` row with `status = 'ready'` (skip `copying`; skip rows whose
  DB is absent; D11 for `pending_deletion`): assert the source
  `schema_migrations` holds `039_metric_format_as_indicator` else throw
  ("boot the previous release first"); copy the 12 live tables stamping
  `run_id` / `admin_area_2` / `follow_pinned` from the project row; folders
  per D10; dashboard slug joined from `dashboard_slugs` — slugless dashboards
  (the boot backfill skipped globally-taken slugs; WITH-TEMPLATE copies never
  re-slugged) get a minted `slugify(title)` (or `slugify(title)-<id>` if taken);
  `created_by` / `created_at` from `dashboards.created_by_email/created_at`
  for dashboards, NULL for the other three types (no invented provenance);
  `ai_context` concatenated into `instance_config.ai_context` under `##
  <label>` headings (D15); **collision check on EVERY primary key inserted**
  (`products`, `slides`, `dashboard_items`, `dashboard_item_groups`,
  `report_versions`, `deck_versions` — WITH-TEMPLATE copies carry
  byte-identical ids, uuids included) — re-mint on collision and rewrite the
  full reference surface: `slides.slide_deck_id`, `deck_versions.deck_id` +
  `slides[].id` + `slide_editors` keys JSON, `report_versions.report_id`,
  `*.restored_from_version_id`, `dashboard_items.dashboard_id` /
  `replicant_group_id`, `dashboard_item_groups.dashboard_id`; stamp
  `bundle.scope` / `provenance.runId` into every figure block in live AND
  version tables (D4).
- `081_drop_project_layer.sql` — NEVER `DELETE FROM projects` (its `ON DELETE
  CASCADE` children would wipe the logs); `DROP COLUMN IF EXISTS project_id`
  on the three log tables (drops FK + index by dependency), rebuild
  `idx_user_logs_aggregate_unique` byte-identically WITHOUT the COALESCE term
  after a guarded DO-block merges aggregate rows that differ only by
  `project_id` (min id kept, counts summed); then `DROP TABLE IF EXISTS
  dashboard_slugs, project_user_roles, projects` WITHOUT CASCADE (a surviving
  FK must fail loudly — the header states which FKs are expected gone and
  why: the three log FKs die with their columns, `dashboard_slugs` /
  `project_user_roles` are in the same DROP, `run_generation_attempts`' FK
  went with 067/078); `DROP COLUMN IF EXISTS users.default_project_*` ×17 and
  `users.can_create_projects`. Fresh replay: 000 shell → old ALTERs → 079 →
  081 → before == after.

**Executed, not assumed** (Appendix A): a scratch postgres:15 replay with the
exact `validate_migrations` harness converged byte-identically with ZERO
statement errors on (a) the fresh path (new base → 000 → all 81 current
migrations → 079 → 081), (b) the live fleet path (current base + all
migrations + seeded projects/roles/slugs/logs/aggregates → 000 no-op → 079 →
081 = the new base's dump, data preserved, aggregate duplicates merged), and
(c) seven historical base shapes (2026-05-05 … 2026-08-12) — the first draft
of 000/081 converged without iteration.

The product JSON transforms then run once on main as `INSTANCE_DATA_TRANSFORMS`
on the same boot (signature `(tx, countryIso3)` — the existing `instance_config`
transform adopts it; they bump `products.last_updated` through the join;
`dashboard_items` drops its last_updated write; the `metrics_columns` and
`module_definition` transforms are DELETED, not moved; `po_config`'s
`_PO_DETAIL_CACHE.clear` goes with D8). Old project databases are LEFT IN
PLACE (rollback path) and dropped later by an ops script (D12). Rejected: a
TEMPORARY `db_startup` step (all pending SQL runs before any TS, so the drop
could not be a tracked migration on the same boot); dblink-in-SQL (new
pattern, id remap in SQL); guarding the old migrations (rewrites history).

**D10 — Folders on migration: one per project, plus one per legacy
sub-folder.** Products of project P with no sub-folder → folder "P"; products
in P's viz/deck/report sub-folder F → folder "P / F" — same-label sub-folders
across the three families of one project MERGE into one "P / F" folder
(lossless; products keep their membership). Dashboards (folderless today) join
"P". Rejected: dropping the sub-folders (loses organisation); a conditional
"single-project instances get no folder" rule (data-conditional migration
rules are how mistakes hide).

**D11 — `pending_deletion` projects are NOT migrated; central-reporting
projects are migrated as ordinary folders.** Trash was a project feature; the
dry-run (D13) lists both classes per instance, and the runbook step before
rollout is "restore any pending-deletion project that must survive; delete or
empty any central-reporting project that must not become visible to every
approved user" (both exist in the current UI). Products themselves have hard
delete, no trash — same as deleting a deck inside a project today.

**D12 — Delete, don't port.** Backups (the 4 `requiresProject` routes, the
restore body that DROP/CREATEs a database by name, the settings-page backups
panel, `create_backup_form`, `restore_from_file_form`,
`can_create/restore_backups`) — instance backups stay a status-api/volume
concern; `copyProject` (+ `WITH TEMPLATE`), soft-delete + purge cron +
`pending_deletions.tsx`, lock, central reporting + every H_USERS project
branch, `compareProjects` (registry + handler + types) + `compare_projects.tsx`,
`getCacheStatus` + `project_cache.tsx`, `getProjectLogs` + `project_logs.tsx`
(dead today), `routes/project/{results_package,modules,project,cache_status}.ts`,
`attach_run.ts`, per-project disk gates, `getMyProjects` /
`getProjectsForUser` / `getOtherUser.projectUserRoles`, the pg read plane
(`results_value_resolver.ts`, `metric_enricher.ts` minus three survivors,
`get_indicator_metadata.ts`, the pg wrappers, the dead `db/utils.ts` probes
`detectHasPeriodId` / `detectColumnExists` / `getTextColumnNames`),
`backfill_runs.ts`, `validate_results_runs_parity.ts` (does not typecheck
today), `synthesize_run.ts`, `validate_figure_bundle_backfill.ts`,
`rollout_fleet` / `rollout_backfill` / `rollout_nigeria` + their Dockerfile
COPY lines, the ~20 project-page tours, `_project_database.sql` + the 41
project migration files + the runner's project mode + `validate_migrations`'
project half. `./validate_queries` is NOT deleted — it is re-based onto
parquet + manifest fixtures driving the `FromRun` wrappers (the only
SQL-behaviour harness we have). Old project DBs and legacy `sandbox/<uuid>`
dirs are purged by a new ops script after settling.

**D13 — Gate the consolidation with a read-only fleet dry-run** that SHARES the
planning code with 080 (`planConsolidation(...)` → inserts + remaps; boot
executes, dry-run only reports): per instance — projects by status incl.
`pending_deletion` and `is_central_reporting` lists, DB-absent rows, sources
not at 039, per-table row counts, id collisions + remap plan (incl. version
PKs from copies), dashboards without a slug row + minted slugs, FK orphans,
projects with `run_id NULL` (and how many visualizations they hold), folder
counts. Zero FAIL fleet-wide = deploy. The exact
`validate_figure_bundle_backfill.ts` mould that gated the FigureBundle cutover
(36/36 instances, 0 FAILs).

**D14 — Ids.** Keep the nanoid scheme; ONE generator length — **4 chars**
(923k combos; 3 chars = 29,791 was fine per project, not per instance) —
product ids checked against `products`, slide / dashboard_item /
dashboard_item_group ids against their own table; versions and folders stay
`crypto.randomUUID()`; existing 3-char ids are kept unless they collide (ids
are not length-validated anywhere; registry params stay `z.string()`, never
`z.uuid()`). No stored FigureBundle references a product id (verified,
`_figure_bundle.ts:116-133`), so bundles need no rewrite.

**D15 — AI copilot: one instance-level mount, env bound to the open product.**
`AIProjectWrapper` becomes the copilot wrapper around the Products page AND
every editor overlay (panther registers tools once per mount; the
`returnToContext` stack and the tours rely on one controller). The env resolves
the OPEN product's PackageScope while an `editing_*` view is active (carried in
the opaque view CONTEXT half, never in tool params — the "no run id crosses the
seam" ruling holds), else the pinned package at national scope; an open
product with `run_id NULL` ⇒ `AIToolFailure` "this product has no results
package" (never a silent fall-back to the pin). SPA shared tools get the
`withSourceHeader` (package label + scope) that `/mcp` already applies, since
the env's pair can now differ from the pin mid-thread. The authoring context
is reconciled IN PLACE (tool-aliasing invariant, SYSTEM_13). Views collapse to
`viewing_products` + the four `editing_*`; `PROJECT_TAB_TO_VIEW` and
`switch_tab` are deleted. ONE conversation scope (`"copilot"`). Proxies:
`/ai` guarded `requireApprovedUser()`, `/ai-instance` (HFA indicator manager,
`can_configure_data`) kept — two mounts, one handler. `ai_usage_logs.project_id`
dropped. `projects.ai_context` → ONE instance-level `ai_context` in
`instance_config` (settings textarea, `can_configure_settings`). The
interactions producer consumes `products_upserted` rows (type + label) and
`last_updated(slides)`. List tools carry folder / package label / scope /
`compatible`. Every "project" in model-visible text (`lib/types/ai_input.ts`,
tool descriptions, view instructions, `client_info_topics.ts`,
`client/public/info/*.md` served to `get_info`) is swept.

**D16 — Products page, create flow, deep link.** One Drive-like page under
`client/src/components/products/`: folder sidebar (with the "General"
pseudo-group), type filter chips, search, one sort pref, mixed product cards
(type icon, label, package label from T1 `readyPackages` + scope badge, last
updated), `${kind}:${id}` multi-select with per-kind batch dispatch. "Create a
product" → 4-type chooser → per-type details modal (name, folder, package
Select prefilled with the pin + follow toggle, scope picker default national,
dashboard slug) → the editor opens immediately via `getEditorWrapper`; the
visualization path feeds `AddVisualization` from that run's authoring context
(package REQUIRED for a viz; a deck/report/dashboard may be created with
`run_id NULL` and shows the no-package empty state on figure insert). Empty
instance = one big "Create a product" card; zero ready packages = the
create-viz path is disabled with the "an admin must generate a results
package" line (link to Results for `can_configure_data`). ONE shared
`product_settings.tsx` (label, folder, package + follow + compatibility modal
moved from `PackageSettings`, scope) reachable from the card menu and every
editor's header. Editors read the product's PackageScope LIVE from the T1
products row (tracked), not from a snapshot, so a repoint mid-edit re-fetches.
Deep link: `?product=<id>` opens that product's editor (replaces `?p=`; the
`?d=` writer in `create_slide_from_visualization_modal.tsx:221` becomes
`?product=<deckId>` — which now actually opens the deck); editors stay
signal-driven overlays. Owned by SYSTEM_12 (retitled "Products, Folders &
Sharing"); no new SYSTEM file.

**D17 — Metrics tab, results-package tab, settings tab: dissolved.** Metrics
browsing lives on the shared package view (`_shared/results_package/
package_view.tsx`, run-keyed) and inside the create-viz flow; the package
picker/follow toggle/compat modal live in product settings; project settings
die (users/lock/central/backups/copy/delete have no product analogue; AI
context moves to instance settings).

**D18 — Everything ships in the same push, docs included.** SYSTEM_00/01/02/
03/05/06/08/09/10/11/12/13/14/15/16/17 prose + lint-enforced globs
(lint:systems runs inside `deno task typecheck`, which ./deploy gates on),
SYSTEMS.md §4.1 custody rows, PROTOCOL_APP_{ROUTES,STATE,MIGRATIONS,QUERY_RIG,
DEVELOPMENT,UI_CONVENTIONS,WORKER_ROUTINES,AI_TOOLS}, CLAUDE.md,
USER_GUIDE_MCP; the pre-existing doc drift the sweep found is fixed in passing
(§7). PLAN files: PLAN_RESULTS_RUNS (Phase 4 subsumed; the sandbox→runs rename
and the backups follow-up survive as two lines), PLAN_3_GEOJSON
(project-scoped read → run-keyed route), PLAN_COMMON_INDICATOR_TYPES (file
paths). VISION_RESTRUCTURED_APP.md is deleted when this plan is accepted.

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
  type text NOT NULL CHECK (type IN ('visualization','slide_deck','report','dashboard')),
  label text NOT NULL,
  folder_id text REFERENCES folders(id) ON DELETE SET NULL,
  run_id text REFERENCES runs(id),     -- no cascade: the delete-run guard
  admin_area_2 text,                   -- NULL = national
  follow_pinned boolean NOT NULL DEFAULT TRUE,   -- the app default (D5)
  created_by text,                     -- email; NULL = pre-restructure product
  created_at text,                     -- NULL = pre-restructure product
  last_updated text NOT NULL           -- THE product version (content or metadata)
);
CREATE INDEX idx_products_folder_id ON products(folder_id);
CREATE INDEX idx_products_run_id ON products(run_id);
CREATE INDEX idx_products_type ON products(type);

CREATE TABLE presentation_objects (   -- detail: type = 'visualization'
  id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  metric_id text NOT NULL,
  config text NOT NULL,
  created_by_ai boolean NOT NULL DEFAULT FALSE,
  crdt_state text,
  crdt_state_last_updated text
);
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
CREATE TABLE dashboards (             -- detail: type = 'dashboard'
  id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,           -- dashboard_slugs folded in
  is_public boolean NOT NULL DEFAULT FALSE,
  layout text NOT NULL,
  config text NOT NULL DEFAULT '…'
);
CREATE TABLE dashboard_item_groups ( id, dashboard_id → dashboards CASCADE, label,
  replicate_by, default_replicant_value, replicants, geo_data );
CREATE TABLE dashboard_items ( id, dashboard_id → dashboards CASCADE, label,
  sort_order, figure_block, geo_data, replicant_group_id → groups CASCADE,
  replicant_value );
CREATE TABLE report_versions ( … report_id → reports CASCADE … );  -- unchanged shape
CREATE TABLE deck_versions   ( … deck_id → slide_decks CASCADE … ); -- unchanged shape
```

Rules of the shape:

- `last_updated` lives on `products` (Drive: modified time on the file) and on
  `slides` (child rows with their own optimistic lock). Every content mutation
  bumps `products.last_updated` in the same transaction (the deck-touch rule,
  generalised; every slide write and every dashboard item/group write already
  bumps its parent today). `dashboard_items` / `dashboard_item_groups` lose
  their unread `last_updated`. Optimistic-concurrency round-trips
  (`updateReportBody`, `updatePresentationObjectConfig`, `updateSlide`) compare
  against `products.last_updated` / `slides.last_updated`. Collab checkpoints
  stamp `products.last_updated` and the detail row's `crdt_state_last_updated`
  equal in one write; a non-collab write bumps `products.last_updated` alone,
  which is what invalidates stored CRDT state (SYSTEM_16 rule, unchanged in
  spirit). Metadata writes (label, folder) already bump entity `last_updated`
  today, so conflating content + metadata is not a regression.
- Dropped columns with no live writer: `presentation_objects.is_default_visualization`
  (always FALSE since project migration 038), `presentation_objects.sort_order`
  with `reorderPresentationObjects` (route exists, zero client callers),
  `*_folders.sort_order` + `reorderVisualizationFolders` (zero callers),
  `*_folders.description` (no UI writer), `dashboards.created_by_email` /
  `created_at` / `updated_at` (→ `products`), `global_last_updated` (dead).
- Table name `presentation_objects` is KEPT (renaming the PO vocabulary is a
  separate refactor, not this restructure).
- Users: `users` loses the 17 `default_project_can_*` columns and
  `can_create_projects`; `instance_config` gains an `ai_context` row.
- Logs: `user_logs`, `ai_usage_logs`, `user_logs_aggregate` lose `project_id`
  (mechanics in D9: column drops, never a row delete on `projects`).

### 2.2 Access control

- `requireApprovedUser()` — new, beside `requireGlobalPermission` in
  `server/middleware/userPermission.ts`: `getGlobalUser` → 401 if
  unauthenticated → 403 unless `globalUser.approved` (server `approved` is
  `_OPEN_ACCESS || !!usersRow` from `buildGlobalUserFromDb`, never roster
  presence) → `c.var.globalUser` / `c.var.mainDb`. It replaces
  `requireProjectPermission` on the relocated product routes and guards the
  new ones. `requireGlobalPermission()` is NOT changed: the 31 existing
  zero-perm sites (instance SSE, `getCurrentUser`, `getInstanceDetail`,
  whats-new, tours, `renameUserEmailEverywhere`, `sendHelpEmail`, uploads,
  assets, geojson, structure lookups, custom prompts, PATs, AI usage, the
  static mount …) keep today's behaviour, including their hand-rolled
  `approved` branches where they have them.

- `server/project_auth.ts` is deleted; `getGlobalUser` / `buildGlobalUserFromDb`
  move to `server/auth/global_user.ts` (imported by `userPermission.ts`,
  `static.ts`, `mcp/context_cache.ts`); `createDevGlobalUser` stays in
  `lib/types/instance.ts`; `createDevProjectUser` and `ProjectUser` die.
- Guard map for every former project route: reads + writes of products/folders,
  the run-keyed data reads, the authoring context, `listAttachableResultsPackages`
  → `requireApprovedUser()`; package internals → `can_view_data`
  (`can_view_logs` for logs); catalogue/generation/pin → `can_configure_data`;
  users → unchanged; `/mcp` door → `can_view_data` (D2).
- Collab WS admission = origin + Clerk + approved. `RoomConn.canEdit` plumbing is
  kept (set TRUE) so a later product permission slots in per subscribe; the
  six per-family flags and the lock are deleted.
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
  folders,presentation-objects,slide-decks,slides,reports,dashboards}.ts`;
  server `server/routes/products/*.ts`; `emails` moves to `instance/`;
  `combined.ts` re-spread. New shared product routes: `updateProductLabel`,
  `moveProductsToFolder` (batch), `deleteProducts` (batch, any type — pre-read
  slide ids of any deck in the batch, close slide/report/po rooms + version
  accumulators, then one `DELETE FROM products WHERE id = ANY($1)`, emit
  `products_deleted`), `setProductPackage(:id, {runId})`,
  `setProductFollowPinned(:id, {follow})`, `setProductScope(:id, {adminArea2})`,
  `getProductPackageCompatibility(:id/:run_id)`,
  `listAttachableResultsPackages` (instance, approved). Folder routes:
  `createFolder` / `updateFolder` / `deleteFolder` (= `UPDATE products SET
  folder_id = NULL WHERE folder_id = $1 RETURNING id` → `products_upserted`
  for those ids, then delete the folder). Per-type CRUD keeps its names minus
  `requiresProject`; per-type `delete*`, `move*ToFolder`, `update*Label` are
  removed in favour of the shared ones; duplicate stays per type; `createX`
  inserts the `products` row + detail row in one transaction taking `{ label,
  folderId, runId, adminArea2, followPinned }` with the D5 server-side pin
  resolution.
- Run-keyed instance reads (D7): `getRunPresentationObjectItems(run_id, {…,
  adminArea2})`, `getRunResultsValueInfo(run_id, {…, adminArea2})`,
  `getRunReplicantOptions`, `getRunResultsObjectItems`, `getRunAuthoringContext`.
  PO detail = `getPresentationObjectDetail(:id)` returning the pure row.
- Run generation: `launchRunGeneration` loses `attachTargetProjectIds`;
  `listFollowPinnedProjects` → `listFollowPinnedProducts`; `RunCatalogItem.attachedProjects`
  → `attachedProducts { type, id, label }`; `deleteRun` refuses while any
  product points at it. Compatibility report: `projectAdminArea2Coverage` →
  `adminArea2Coverage`.
- AI: `/ai/v1/messages` + `/ai/files*` → `requireApprovedUser()`; SDK client
  loses the default header; `AddAiUsageLog` loses `projectId`.
- Public: `GET /api/d/:slug` → resolve slug on `dashboards` → detail (main DB).
- `renameUserEmail`: the per-project sweep becomes a main-DB sweep over
  `products.created_by`, `report_versions.editors`, `deck_versions.editors`,
  `body_authors`; `RenameEmailResult` loses `projectsUpdated/projectsFailed`;
  `change_email_modal.tsx` retry UI follows; the fleet orchestrator consumes
  the new shape (§6).

### 2.4 Realtime

Instance channel additions: `products_upserted { products: ProductSummary[] }`
(the only product-list message; every product mutation route — and every
collab checkpoint, which holds the content in memory and needs at most one
indexed row read — emits the summary for that id; the pin-move emits one for
every repointed row), `products_deleted { ids }`, `folders_updated {
folders }`, `last_updated { tableName: 'slides', ids, lastUpdated }`;
`starting` carries the full `products` + `folders` + `readyPackages` +
`lastUpdated` map. `readyPackages` follows the `runsCatalog` idiom exactly —
a `starting` fill plus the EXISTING `runs_catalog_updated` nonce triggering a
`listAttachableResultsPackages` refetch on every approved client (no new
message type). The client `lastUpdated` map (`{ products, slides }`) is the
cache-version INDEX: `products[id]` is patched from each upserted row's
`lastUpdated`, `slides[id]` from the `last_updated` event — so
`LastUpdateTableName` (file renamed `lib/types/last_updated_tables.ts`) stays
the union `products | slides` as the map's key type while only `slides` ever
rides a `last_updated` event. `notifyLastUpdated(tableName, ids, ts)` (no
projectId). `buildInstanceState` is split so the `/mcp` context builder does
not embed product lists or report bodies.

`ProductSummary` = `{ id, type, label, folderId, runId, adminArea2,
followPinned, createdBy, createdAt, lastUpdated }` ∪ a per-type slice
(`visualization`: `metricId, replicateBy, isFiltered, presentation, disaggregateBy,
filterBy, createdByAI`; `slide_deck`: `firstSlideId, config`; `report`:
`config, preview`; `dashboard`: `slug, isPublic, itemCount`). Every per-type
summary query today is `WHERE id = $1` away (`presentation_objects.ts:141-157`,
`slide_decks.ts:20-42`, `reports.ts:46-66`, `dashboards.ts:105`).

### 2.5 Client state

`client/src/state/project/**` is deleted. Inventory after:

| Tier | What | Home |
| --- | --- | --- |
| T1 | `products`, `folders`, `readyPackages`, `lastUpdated.{products,slides}`, `pinnedRunId` (exists), `hfaTimePoints` (exists) | `state/instance/t1_store.ts` |
| T2 | `run_authoring_context` keyed `[runId]`, immutable (the `t2_runs.ts` idiom) | `state/instance/t2_run_authoring_context.ts` |
| T2 | `po_items` / `metric_info` / `replicant_options` keyed `(runId, scopeToken, …)`, version constant | `state/products/t2_presentation_objects.ts`, `t2_replicant_options.ts` |
| T2 | `po_detail` keyed `[id]` versioned by `lastUpdated.products[id]` (pure row); `slide` by `lastUpdated.slides[id]`; `slide_deck_detail` / `dashboard_detail` by `lastUpdated.products[id]`; `images` (moves, no change) | `state/products/t2_*.ts` |
| T4 | `productsSortMode`, `productsTypeFilter`, `productsSelectedFolder`, `pendingEditorOpen`, `showAi`… (the four per-family sort/grouping prefs collapse) | `t4_ui.ts` |
| T4 | AI documents keyed `ai-documents/copilot` | `state/products/t4_ai_documents.ts` |
| T1-adjacent | collab store, connected by the instance boundary when approved | `state/instance/collab.ts` |

`createReactiveCache` loses its `getSnapshotProjectState` import; version keys
are `(params, instanceState)` only. `clear_caches.ts` keeps only the AI
prefixes. `PackageScope` replaces `ProjectState` in every editor prop;
`snapshotForVizEditor` / `snapshotForSlideEditor` snapshot ONLY what must not
move under the editor (the deck config, the per-viz config/resultsValue at
open); the PackageScope is read live from T1 (D16) and the authoring context
from the immutable T2 cache keyed by that LIVE `runId` — so a repoint mid-edit
moves items AND metrics/presets together. `hfaTaxonomy` for the copilot is
composed client-side from the authoring context + T1 `hfaTimePoints`.

### 2.6 Client UI

- Instance shell tabs: **Products** (first, default) | Data | Results | Assets |
  Users. `?product=<id>` opens an editor; `?p=` and `?d=` are gone.
- `components/products/`: `index.tsx` (page — built from `project_decks.tsx`'s
  skeleton: HeadingBar + search + SortControl + Create, `FrameLeftResizable`
  folder sidebar with right-click rename/delete, card grid,
  `createSelectionController`), `product_card.tsx`, `create_product_modal.tsx`
  (type chooser + per-type details, merging `add_deck` / `add_report` /
  `create_dashboard_modal`), `product_settings.tsx`, `edit_folder_modal.tsx`,
  `move_to_folder_modal.tsx`, `duplicate_products_modal.tsx`,
  `create_visualization/**` (= moved `add_visualization/` + `preset_preview.tsx`,
  fed by an authoring context). `_shared/scope_picker.tsx` (renamed from
  `project_scope_picker.tsx`; copy says "Scope").
- Editors (`visualization/`, `slide_deck/`, `report/`, `dashboards/`) take
  `{ productId }` and read the PackageScope live from T1 (+ the authoring
  context via T2) instead of `projectId` + `projectState[Snapshot]`; every
  `can_configure_* && !isLocked` gate becomes one shared `canEditProducts()`
  (= approved) so a later permission model replaces one function; header
  shows the scope badge and a Settings entry. `select_visualization_for_slide.tsx`
  / `PresentationObjectPanelDisplay` take `{ scope, authoringContext }`, list
  visualization products + the scope run's presets, grey out incompatible
  vizzes (D3), thumbnails render under the container scope.
  `create_slide_from_visualization_modal.tsx` passes the TARGET deck's scope +
  context; a newly created deck inherits the source viz's pair.
- Copilot: `components/copilot/` (renamed from `project_ai/`; 49 files, 19
  touch `projectId` — `ai_tools/` 28 files, 14 touch it), one mount at the
  Products page; env resolves the open product's scope; view registry
  `viewing_products` + 4 `editing_*`.
- Onboarding: the ~20 list-page project tours collapse into one products tour
  set; results-package / settings / instance-projects tours are deleted; the
  editor tours survive; the instance tour catalogue stops fanning out
  `getProjectDetail`; tour ids renamed (Clerk seen-flags re-fire once,
  accepted); telemetry loses `projectId`.
- Copy sweep: every en/fr/pt literal saying project/projet/projeto (30 FR
  files, 27 PT files, `TC.goBackToProject`, `client/public/info/*.md`) is
  rewritten to products/folders/scope.

### 2.7 Results packages: pointer, pin, follow, compatibility, presets

- `db/instance/run_generation.ts` pointer functions rewrite against
  `products`: `setProductRun(id, runId)` (ready gate IN the UPDATE, as today),
  `clearFollowPinnedIfNotPin`, `setProductFollowPinnedAndAlign`, the pin-move
  UPDATE (D5), `listFollowPinnedProducts`, delete guard, catalogue
  `attached_products` json_agg.
- `package_compatibility.ts`: per product — a visualization → its one row's
  config; a container → the `metricId`s + configs of its embedded figure
  blocks (walk slides / report figures / dashboard items); `adminArea2Coverage`
  from the product's scope; `issueFor` moves to `lib/` (manifest-only) and is
  reused by the pickers and the AI refusal. Shown in product settings before a
  repoint and as the persistent warning on the package card. Never blocks.
- The wizard client (`instance_results_packages/_wizard/{index,_step_data,
  _step_confirm}.tsx`) loses the attach-target multi-select and confirm
  copy; `detail.tsx` "in use by" lists products by type; the pin confirm lists
  follower products.
- Presets: `virtual_defaults.ts` keeps `deriveVirtualDefaults(manifest)`
  (memo by runId) and serves them inside `getRunAuthoringContext.presets`; a
  preset is not a product, has no detail read (the `findVirtualDefault` detail
  branch at `run_read.ts:750-771` is deleted), and renders through the
  run-keyed ITEMS read with its own config under the invoking PackageScope.

### 2.8 FigureBundle

`figureBundleSchema` (strict, shared by slides/dashboards/reports): add
required `scope: { adminArea2: string | null }` and `provenance.runId: string |
null`. Capture-on-write from the container's PackageScope in every assembly
site (`resolve_figure_from_visualization.ts:44-96, 121-146` — collapsed onto
the metric-keyed resolver per D3, `resolve_figure_from_metric.ts:29-113`,
`t2_presentation_objects.ts:218-242`). 080 stamps them into live AND version
tables from the owning project row (D4); the skip-gate for anything it misses
is the normal missing-key parse failure (new required keys). `buildFigureInputs`
reads `bundle.scope` for the roll-up label. Bundles are stored, not cached, so
no Valkey prefix moves.

### 2.9 Migration mechanism — file list (mechanism in D9)

- `server/db/migrations/runner.ts` — `.ts` migrations via a literal-keyed
  static import map; project mode deleted.
- `server/db/migrations/instance/000_legacy_project_shell.sql`,
  `079_products.sql`, `080_consolidate_projects.ts`, `081_drop_project_layer.sql`.
- `server/db/migrations/consolidation/plan.ts` — the shared planning core
  (reads a project DB, produces the insert set + id remap + folder plan +
  slug plan + bundle stamps + ai_context concatenation); `080` executes it, the
  dry-run reports it.
- `validate_consolidation.ts` (repo root) — the read-only fleet
  dry-run (env `PG_HOST/PG_PORT/PG_PASSWORD` per instance through the
  PROTOCOL_ACCESS_DBS tunnel), exit 1 on any FAIL.
- `db_startup.ts` — the per-project loop, `backfillDashboardSlugsToMain`, both
  TEMPORARY sweeps, `PROJECT_DATA_TRANSFORMS` (become instance transforms on
  main, signature `(tx, countryIso3)`), and the `runs.summary` transform block
  are the edits.
- `_main_database.sql` — final state (2.1); `_project_database.sql` and
  `server/db/migrations/project/**` deleted; `validate_migrations` loses the
  project call.
- Ops (repo root, ops tooling): `rollout_products` (deploy + health poll +
  post-check product/folder counts vs the dry-run plan), `restore_main` (stop
  container → `docker exec psql -d postgres` DROP DATABASE main WITH (FORCE) /
  CREATE → pipe the named status-api dump → start the previous image; verified
  once on testing-tim before the fleet), `purge_legacy_dbs` (ssh +
  `docker exec psql -d postgres`: `DROP DATABASE … WITH (FORCE)` for every
  UUID-named datname ∉ {main, postgres, template*}; rm `sandbox/<uuid>` dirs
  whose name ∉ `runs.id` — never `.tmp-*`, `.duckdb-spill`, `restore_*`).

### 2.10 What survives from `server/db/project/**` (relocation list)

`prepare_inputs.ts:13-22` imports `calculatedIndicatorToSnapshotRow`,
`computeDataset{Hfa,Hmis,Iceh}RunCapture`, `dbRowToHfaIndicator`,
`PROJECT_FACILITY_COLUMN_NAMES`, `ProjectFacilityRow`, `DatasetCsvTarget` (from
`datasets_in_project_*.ts`, `calculated_indicators_snapshot.ts`,
`_project_database_types.ts`); `pipeline.ts:13` imports
`prepareModuleDefinitionForStorage` (`modules.ts`); `run_read.ts:49-50`,
`package_internals.ts:9`, `disaggregation_availability.ts:3-5` import
`inferMostGranularTimePeriodColumn`, `getEnabledFacilityDisaggregationOptions`,
`PHYSICAL_DISAGGREGATION_COLUMNS` (`metric_enricher.ts`) and
`parseModuleConfigSelections` (`modules.ts`); `db/utils.ts` keeps
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

Phases are ordered so the branch reaches a runnable prototype at the end of
Phase 2 (server + client typecheck green, dev DB consolidated). Commits on the
branch may be WIP; the MERGE is what must be greenfield-equivalent.

### Phase 1 — Server (typecheck target: `deno check main.ts server/tests/*.ts` green)

1. **Schema + migrations** (§2.1, §2.9): base schema, runner `.ts` support,
   000/079/080/081, planning core, `db_startup` rewrite, `runs.summary`
   transform block, `validate_migrations` project half removed. Gate:
   `./validate_migrations` green; a boot against an EMPTY postgres (fresh
   path: 000→081 + transforms complete); 080 executed against the dev DB
   (`pg_run`, port 7001) and the dry-run reports zero FAIL there; version
   restore (report + deck) works on a migrated product.
2. **DB layer**: `server/db/products/{folders,products,presentation_objects,
   slide_decks,slides,move_slides,reports,versions,dashboards}.ts` (moved +
   rekeyed: `mainDb` first param, `products` join for summaries, shared
   label/folder/delete functions, product-row bump in every content
   transaction, dashboards slug in-row); `db/project/**` deleted after the
   §2.10 relocation; `id_generation.ts` → 4 chars (D14); `dashboard_slugs.ts`
   deleted; `_main_database_types.ts` updated; `rename_user_email.ts` sweep.
3. **Access control**: `server/auth/global_user.ts`, `requireApprovedUser`
   (new guard, §2.2; `requireGlobalPermission` untouched), `project_auth.ts` deleted,
   `lib/types/permissions.ts` trimmed to 6 instance flags, `permission_labels`,
   `lib/types/instance.ts` (`ProjectUser`, `createDevProjectUser`, RenameEmail
   shape), `users.ts` (db + routes: default-project functions, `getProjectsForUser`,
   `getOtherUser` shape, notify calls, `deleteUser` closes collab connections),
   `instance.ts` (`getMyProjects`), `h_users` branches.
4. **Routes**: `lib/api-routes/products/*` + `server/routes/products/*`
   (guard swap at every handler, `c.var.mainDb`, notify rewrite);
   `emails` → instance; run-keyed reads + `getRunAuthoringContext`
   (`run_generation.ts` registry + handler, `run_data_reads.ts` bodies take
   `adminArea2`); `run_read.ts` project lens deleted, PO detail as pure row;
   `virtual_defaults.ts` trimmed; `caches/visualizations.ts` (`_PO_DETAIL_CACHE`
   deleted, `cache_status` deleted); `route-utils` / `server-action-types` /
   `create_server_action` / `route-tracker` / `cors` / `logging` transport
   cleanup; `main.ts` mounts; `combined.ts`; `headless_allowlist` unchanged
   (its "never allowlist backups" comment goes with backups); `health.ts`
   trims; `backups.ts` restore body + 4 routes deleted; `disk_space.ts`
   project gates deleted; purge cron deleted; `onboarding.ts` `projectId`
   field; `compareProjects` registry/handler/types deleted.
5. **Packages**: `db/instance/run_generation.ts` pointer functions,
   `pin_run.ts` (one UPDATE), `attach_run.ts` deleted, `package_compatibility.ts`
   per product + `issueFor` to lib, `generate_run/{launch,pipeline,types}.ts`
   attach targets + guard deleted, `lib/types/run_generation.ts` renames,
   `delete_run.ts` comments.
6. **Realtime + collab**: `instance_sse.ts` types, `notify_instance_updated.ts`
   (products/folders/last_updated wrappers), `build_instance_state.ts` (split
   builder, readyPackages), `instance-sse.ts` forwardable filter for unapproved,
   `notify_last_updated.ts` signature; project channel files deleted;
   `routes/instance/collab.ts` (was `project-collab.ts`), 9 `server/collab/*`
   files (projectId removed from room/ledger/accumulator keys, product-keyed
   presence registry, `AddLog` without projectId, checkpoints emit product
   upserts), `lib/types/collab.ts` protocol (drop `project_awareness_update`),
   `lib/collab/**` unchanged.
7. **AI + MCP**: `routes/instance/ai_proxy.ts` (copilot mount, approved) +
   `ai_files.ts` moved, `anthropic_messages_proxy.ts` / `ai_usage_logs.ts`
   without projectId, `mcp/context_cache.ts` (imports, door comment rewritten
   as load-bearing, `RunDataset*`), `server/tests/*` updated, instance-config
   `ai_context` (schema + route; the concatenation runs in 080).

### Phase 2 — Client (typecheck target: `npm run typecheck` green; prototype)

1. **State**: `state/instance/t1_store.ts` + `t1_sse.tsx` (products, folders,
   readyPackages, lastUpdated, `reconnectForApproval`, listeners never cleared
   on reconnect), `state/instance/collab.ts` (mounted when approved,
   `reconnectCollab`), `state/instance/t2_run_authoring_context.ts`,
   `state/products/t2_*.ts` (rekeyed), `_infra/reactive_cache.ts`,
   `clear_caches.ts`, `t4_ui.ts` (products prefs, `pendingEditorOpen`,
   `?product=`), `state/project/**` deleted, `server_actions` regenerate (no
   `projectId` args — the ~300 call sites in ~120 files go through the
   compiler).
2. **Products page + create flow + settings + folders** (§2.6);
   `components/project/**` gone (33 files: ≈24 deleted, ≈9 relocated —
   `add_visualization/`, `preset_preview.tsx`, the compat modal); `instance/index.tsx` tabs;
   `instance_projects.tsx` / `add_project.tsx` / `pending_deletions.tsx` /
   `compare_projects.tsx` / permission forms deleted.
3. **Editors + pickers + resolvers**: live PackageScope reads; `_editor_snapshot.ts`;
   `generate_visualization/**` (`get_data_config_from_po.ts` reads bundle
   scope; resolvers collapse onto the metric-keyed one taking a scope;
   `assert_replicant_valid.ts`); `generate_slide_deck/convert_slide_to_page_inputs.ts`
   drops the unused `projectId` param + 10 call sites; `exports/**`;
   `PresentationObject*Display`, `ReplicateByOptions`, `slide_presenter`,
   `slide_card`, `resolve_replicant_structure`, `view_results_object.tsx`
   (run-keyed raw preview), `_shared/{connection_banner,live_cursors,
   presence_toasts}`, `cursors/` (page cursors off the list), version_history
   (no projectId, `diff_segments` editor names from the instance roster),
   `share_slide_deck`, `download_*`.
4. **Copilot** (`components/copilot/**`): wrapper mount, `client_env.ts` env
   resolver (+ source header, NULL-run failure), `build_tools.ts`, every tool
   file touching projectId, view registry, system prompt (instance
   `ai_context`), interactions SSE producer on `products_upserted` /
   `last_updated(slides)`, drafts/previews (re-resolve on AddToDeck),
   documents (`useAIDocuments`, `AIDocumentSelectorModal` headers),
   `sdk_client` default headers, `slide_ai/*` helpers (`convertAiInputToSlide`
   etc. take scope + context), `ai_input.ts` descriptions sweep.
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
   `validate_figure_bundle_backfill.ts`, `synthesize_run.ts` (+ `pg_export.ts`
   if orphaned), `rollout_fleet/backfill/nigeria`, Dockerfile COPY lines 34-35;
   add `validate_consolidation.ts`, `rollout_products`, `restore_main`,
   `purge_legacy_dbs`; `.github/scripts/sync-docs.sh` terminology line
   141 ("Product", "Folder"; drop "Project"/"Data window") + the example image
   path at :180, `generate-changelog.sh:168` example text; `validate_protocols
   --update-baseline` after the `project_ai` → `copilot` move.
3. Docs (§7) + SYSTEM globs (13 SYSTEM files, 98 glob lines — incl.
   SYSTEM_06's five relocated files) + SYSTEMS.md §4.1 rows; PLAN edits (D18);
   `PROTOCOL_ACCESS_DBS.md` (gitignored) rewritten locally; USER_GUIDE_MCP.md
   "per-project" lines.

### Phase 4 — Rollout (runbook, §5)

---

## 4. Gates (all must be green before merge; the last four before deploy)

- `deno task typecheck` (server + client + `lint:systems`); `deno task test`.
- `./validate_migrations` (main only).
- `./validate_queries` (re-based rig).
- Fresh-postgres boot (000→081 + transforms) completes.
- `grep -rn "projectId\|requiresProject\|state/project/\|Project-Id" client/src lib server main.ts` → 0 (excluding `server/db/migrations/**`).
- `grep -rli "projet\|projeto" client/src lib client/public/info` → 0 (excluding "projection").
- `grep -rni "project" client/src lib server main.ts client/public/info | grep -vi "projection"` reviewed to zero outside `server/db/migrations/**` (the old SQL files that mention projects are history and are not rewritten; 000/080/081 and `consolidation/plan.ts` necessarily say it). Known residue excluded from the gate: `lib/help/help_targets.generated.ts` until the docs-site rewrite.
- `git ls-files | grep -i project` → 0 excluding `server/db/migrations/**` (four old `*_project_*.sql` files + the new three), `panther/**` (map projections), `_archive_*/**`.
- 080 executed against the dev DB; the app opens every migrated product; version restore works.
- `validate_consolidation.ts` — zero FAIL fleet-wide (read-only), `pending_deletion` + central-reporting lists reviewed (D11).
- `restore_main` rehearsed once on testing-tim.
- `./deploy_testing` to testing-tim (1 project) BEFORE the fleet; then one multi-project instance before the rest.

---

## 5. Rollout runbook + rollback

1. Ship §0 (sweep deletion) as its own patch on `main` first.
2. Fleet dry-run (D13); fix and repeat until zero FAIL; act on the
   `pending_deletion` and central-reporting lists (D11).
3. Server-cli: path-agnostic nginx WS-upgrade template, re-emit fleet sites
   (harmless to the old `/project_collab` path — no window).
4. Take a NAMED status-api backup of every instance immediately before rollout
   (`main` dump + previous image = rollback; the previous image cannot boot
   after 081 without that dump). Rehearse `restore_main` on testing-tim.
5. `./deploy_testing` → testing-tim; verify products/folders/counts vs the
   dry-run plan; then `rollout_products` across the fleet with the per-instance
   post-check.
6. Settle (days); then `purge_legacy_dbs` per instance — also retires
   the long-standing orphaned-UUID-DB open item and the legacy sandbox dirs.
7. External follow-ups (§6) — before or right after step 5 as marked.

Rollback = `restore_main` from step 4 + previous image; project DBs are still
on disk (untouched by 080).

---

## 6. External couplings (named, not fetched — separate repos/services)

- **status-api / Status Central Portal**: `/health_check` loses `projects`;
  `/projects` and `/project_activity` are gone; `/user_logs*` and `/ai_usage`
  rows lose `project_id`; per-project backup files stop appearing (main dump
  only); rename-email fan-out result shape. Coordinate BEFORE the fleet deploy
  (their pollers must tolerate the missing fields).
- **server-cli**: path-agnostic nginx WS-upgrade template (before deploy);
  (later, separate) sandbox→runs sites.
- **wb-fastr-site (docs)**: 15 EN + 15 FR pages mention projects; two
  wholly-project pages; 4 images; help tags `aproj-*` / `uproj-*` /
  `users-project-permissions`. After the site rewrite: `deno task
  build:help-buttons`. Not blocking (one help button consumed).
- **panther**: no code coupling; example snippets in `PROTOCOL_DENO_API.md`
  (`Project-Id`) and `PROTOCOL_UI_AI_CHAT.md:294` (`getSharedToolsForMetrics(env,
  projectId, …)`) — edit in panther, re-sync.
- **wb-fastr-modules**: no coupling (`PROJECT_DATA_HMIS` is an opaque token;
  `DOC_MODULES.md:36` prose stale).
- **Clerk**: `unsafeMetadata.onboarding` tour keys re-fire once after the
  rename; nothing else.

---

## 7. Docs to rewrite in the same push (and drift to fix in passing)

SYSTEM_00 (`ProjectUser` kernel row), SYSTEM_01 (Project-Id pipeline, guards,
the `requireApprovedUser` guard, path-id doctrine, counts 265→286 / 29→32, phantom project
streaming route, `export_central`), SYSTEM_02 (multi-DB model → single main +
runs volume, `.ts` migrations, per-project boot pass, restore mechanics, id
generation), SYSTEM_03 (channel catalog, per-row product upserts, Q-B
revision, `notifyProject*` wrappers, the `po_detail` row removed and
`PO_CACHE_VERSION` 16 — the doc still says v7/13), SYSTEM_05
(prose crossing into project DBs), SYSTEM_06 (globs → `server/runs/capture_inputs/**`,
`lib/types/run_datasets.ts`; the "project attach/snapshot seam" section),
SYSTEM_08 (attach/pin/followers/AA2 → per product; "start unsubscribed"
overruled; two classes of package reads; wizard attach targets; MCP door as
the narrower gate), SYSTEM_09 (project lens → run mount with scope; pure-row
PO detail; cache table), SYSTEM_10 (bundle `scope`/`provenance.runId`;
roll-up label rule; identity claim restated), SYSTEM_11 (library page →
Products; `ai_tools.ts` phantom), SYSTEM_12 (retitled; products registry,
folders, slug in-row, notify catalog), SYSTEM_13 (mount, env, source header,
views become 5 (the doc says 13; code has 12 today), `ai_tools.ts` phantom),
SYSTEM_14 (routing `?product=`,
tabs), SYSTEM_15 (project lifecycle/roles/backups gone; production topology
"live vs orphaned DBs" → purge script), SYSTEM_16 (one socket, `/collab`,
product-keyed presence, room keys), SYSTEM_17 (`project_id` gone), SYSTEMS.md
(§4.1 rows for `db/project/projects.ts`, `routes/project/project.ts`, the
stale `results_objects.ts` row; SYSTEM_12 title; §6 vocabulary line
"product / folder / scope"), CLAUDE.md (multi-database section, Project
Routes, worker list), PROTOCOL_APP_ROUTES (single guard recipe),
PROTOCOL_APP_STATE (tier inventories), PROTOCOL_APP_MIGRATIONS (`.ts`
migrations, no project dir, transform signature),
PROTOCOL_APP_QUERY_RIG (re-based rig), PROTOCOL_APP_DEVELOPMENT (chain links
6–7), PROTOCOL_APP_UI_CONVENTIONS (`project_data.tsx`, darkMode API),
PROTOCOL_APP_WORKER_ROUTINES (dead worker names), PROTOCOL_APP_AI_TOOLS,
USER_GUIDE_MCP.

---

## 8. Explicitly out of scope (later plans, one line each)

Product-level permissions / sharing (join key `products.created_by` exists);
a products trash; `presentation_objects` → `visualizations` vocabulary rename;
sandbox→runs directory rename (PLAN_RESULTS_RUNS residue); an in-app main-DB
backup UI; per-entity report `preview` column (only matters if `starting`
payloads grow large); presence avatars / live cursors on the Products list;
folder nesting; a `dashboards` editing view for the copilot; a dead-glob check
in `lint_systems.ts`.

---

## 9. Size

Roughly: ~125 files deleted (client `components/project/**` 33,
`state/project/**` 10, server `db/project/**` 21 after relocation, project
routes/registries 30, 41 project migrations + base, ops scripts 6, tours),
~230 files edited (mostly mechanical: `projectId` → scope, guard swaps, notify
signatures, T2 keys, translations), ~38 new files (products DB/routes/UI,
migrations, planning core, dry-run + rollout + restore + purge scripts, run
authoring context). Net around −10k LOC. The genuinely new logic is small: the
products registry + folders, the consolidation planner (id remap incl. version
PKs, folders, slugs, bundle stamps), the run-keyed reads with scope + the
pure-row PO detail, the products page + create modal, and the copilot env
resolver. Everything else is deletion or rekeying.

---

## Appendix A — The executed migration replay (D9), reproducible

Run 2026-08-19 in a throwaway `postgres:15` container (`wbf-plan-verify-54331`,
removed afterwards; the dev `pg` container untouched). The harness mirrors
`validate_migrations` exactly: `psql -v ON_ERROR_STOP=1 -q` per file, then
`pg_dump --schema-only --no-owner --no-privileges | grep -v '^--' | grep -v
'^$' | grep -v '\restrict' | sort`, diff before/after.

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

Results:

1. Today's harness check: current base + the 81 current migrations → all ok,
   before == after (reproduces `validate_migrations` green).
2. Fresh path: `new_base` → 000 → the 81 current migrations → 079 → 081 → 84
   ok, ZERO statement errors, before == after (918 sorted lines, zero
   occurrences of "project").
3. Live path: current base + 81 migrations + seed (2 users with
   `default_project_*` flags, 1 run, 2 projects, a role row, a slug, 3
   `user_logs`, 2 `ai_usage_logs`, 5 aggregate rows of which 3 differ only by
   `project_id`) → 000 (no-op) → 079 → 081 → all ok; the dump is byte-identical
   to `new_base`'s; `user_logs` 3 / `ai_usage_logs` 2 / `users` 2 preserved;
   aggregate rows merged (3+4+5 → 12, min id kept).
4. Historical fleet shapes: bases from commits 42516bec (05-05), fd1a259e
   (05-18), 68160f6e (05-25), d3c3b18d (06-29), 4791f190 (07-16), 04dfd51f
   (08-06), 3d320bb4 (08-12) + the migrations added after each + seed + 000/
   079/081 → zero errors everywhere; 3d320bb4 identical to `new_base`; the
   others differ only by pre-existing legacy `admin_areas_1..4` / iceh drift
   that is identical before and after this plan's migrations
   (PLAN_REMOVE_OLD_STRUCTURE_TABLES territory).
5. Edge tests: `CREATE TABLE IF NOT EXISTS projects (… REFERENCES runs)` with
   `projects` present but `runs` absent → skipped without error (an instance
   behind 065 survives 000); `DROP COLUMN project_id` drops the COALESCE
   expression index by dependency.
6. Negative controls: 000 without the `user_logs_aggregate` ALTER fails at 035;
   without any log ALTER fails at 016 — the shell columns are load-bearing.
7. Runner: pending migrations sort by filename (`localeCompare`), so on a live
   instance 000 applies first (no-op), then 079 / 080 / 081; a fresh
   `db_startup` = base + all migrations (the same path `validate_migrations`
   exercises); the initial user seed inserts only `(email, is_admin)`.
