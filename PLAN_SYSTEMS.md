# Plan — A Systems Topology for wb-fastr

> **Status: DECISIONS LOCKED (2026-06-12).** The map below (§3) is settled — 15
> systems. Produced from a full review of `server/`, `lib/`, `client/src/`
> (~666 TS files): 13 empirical area maps, an import-graph analysis (2,216
> file-pair edges), a DOC_*/PLAN_* audit, four independently-proposed
> decompositions, and two adversarial stress-tests per scheme. Purpose: (1)
> "review system X in detail" is a well-scoped delegable task, and (2) coupling
> between systems can be reasoned about and reduced. Next: this gets promoted to
> a `SYSTEM_NN_*.md` file set (one per system) — see `PLAN_DOC_CONSOLIDATION.md`
> and §8. §2 (the four candidate schemes) is kept as the exploration record.

---

## 1. What the codebase dictates (constraints on any scheme)

These are empirical facts that survived adversarial verification. Any topology
must respect them; the four candidate schemes differ mainly in how they do.

1. **Zero client↔server import edges.** All cross-tier traffic flows through
   the `lib/api-routes` registry → generated `serverActions` (161 client
   importers). This is the cleanest seam in the codebase and the
   registry-as-contract pattern verifiably works. Every scheme makes it a
   first-class system.

2. **`lib/` is kernel, not a system.** 445 files import the `lib/mod.ts`
   barrel (492 of 493 lib imports use the bare `"lib"` specifier); 155 symbols
   are consumed by *both* tiers (server skews to the APIResponse envelope,
   client to `t3` — 237 import sites — and config types). Semantic ownership of
   lib files can be assigned per system, but compile-time coupling is
   all-to-all. "Review lib" is not a meaningful task; reviewing a system's lib
   slice is.

3. **Client features are decoupled from each other** — almost all coupling
   routes through the kernel trio (`server_actions`, `state/`, `lib`). The one
   real feature↔feature fusion is `project_ai` ↔ `slide_deck` (24/8
   bidirectional edges, via `slide_deck/slide_ai/`).

4. **Directories lie in at least six load-bearing places.** Any
   directory-shaped scheme inherits these lies:

   | What the directory says | What the code does |
   |---|---|
   | `server/db/instance/dataset_{hmis,hfa}.ts` are DB access | They are import-wizard orchestrators that spawn and manage Web Workers (7 db→worker_routines edges — a layering inversion) |
   | `server/db/project/modules.ts` is DB access | Lines ~81–525 are the module system's semantic heart (install/update transactions); ~540–1179 are the module/metrics read API used by viz and AI |
   | `server/routes/caches/` is routes | It defines the Valkey `TimCacheC` instances + `PO_CACHE_VERSION` (and migrations' data_transforms import it — a second inversion) |
   | `server/task_management/` is the task machine | Half of it is the app-wide notify/SSE hub (28 importers, mostly non-task) |
   | `client/src/components/{instance,project}/index.tsx` are feature dirs' index files | They ARE the app shell: the page maps, tab nav, SSE boundary and AI wrapper mounts |
   | `slide_deck/slide_ai/` is deck code | It is the AI figure/slide construction toolkit — and 3 of its 8 files double as plain figure resolvers used by dashboards, reports, and the viz modal |

5. **The heaviest couplings carry no import edges.** Modules feed
   visualization entirely through DB rows (`ro_*` tables, `metrics`,
   `last_run_at`); ingestion feeds modules through sandbox CSVs plus one
   route-mediated `setModulesDirtyForDataset` call. An import-graph-only
   analysis would falsely report these as independent. The
   `last_updated → SSE → version-hash-cache` invalidation triangle is a
   hand-enforced convention across ~26 route/db files owned by other systems.

6. **~10 load-bearing files are multi-system by nature** (custody table in
   §4.1). Whatever map is adopted, these files sit on the seams; reviews fail
   silently here unless custody is explicit.

7. **The doc corpus covers server mechanisms well and client features not at
   all.** The 29 DOC_* files map to ~12 mechanisms (almost all server-side).
   Slide decks, reports, dashboards/public viewer, exports, file upload/TUS,
   ICEH, indicator managers, and geojson have zero doc coverage — exactly
   where a systems map must supply boundaries the docs don't.

---

## 2. Four candidate schemes (exploration record)

All four were generated independently from the same area maps, then
adversarially stress-tested (coverage, boundary interrogation with real files,
size sanity, simulated "review system X" tasks). The locked map (§3) is Scheme
D amended per the §8 decisions.

### Scheme A — Domain-vertical (14 systems)

Systems are user-meaningful capabilities cut vertically through client + routes
+ server logic + lib types: two platform systems (API/access/shell;
persistence/realtime/cache) plus Ingestion, Structure & Geography, DHIS2,
Dictionaries, Modules, Visualization Engine, Decks, Reports, Dashboards, AI,
Admin, Ops.

- **Strengths:** 9 of 14 systems scored 4–5/5 for delegability. Matches how
  change actually arrives ("add a dataset family", "fix HFA weights").
  Structure & Geography and Reports were the two cleanest systems in any
  scheme.
- **Weaknesses:** the Visualization Engine becomes one ~110-file / 25k-LOC
  monster (scored 2/5 — "a three-review program masquerading as one system"),
  and the persistence/realtime/cache platform bundles four mechanisms (2/5).
  ~20 unclaimed files (the `components/project/` modal tail, the two shell
  index.tsx files).

### Scheme B — Mechanism-horizontal (15 systems)

Systems are runtime mechanisms regardless of domain: RPC transport, auth,
Postgres persistence, realtime/cache sync, background execution, module plugin
platform, ingestion ELT + connectors, query pipeline, rendering/export engine,
authoring editors, forms/wizards/admin UI, AI platform, i18n/calendar
singletons, ops/boot, client shell.

- **Strengths:** best server-side map; names the real mechanisms (the notify
  triangle, the dirty machine, the worker harness) precisely. The
  query-pipeline and rendering-engine cuts are sharp and reviewable.
- **Weaknesses:** systematically hides *domain* coupling, which is the dominant
  change driver here (adding ICEH touched five of its systems with no visible
  edge between them). Produces three systems over 20k LOC (authoring editors,
  forms/wizards) and the worst sub-file custody in the set (`dataset_hmis.ts`
  split three ways by line range). "Review the persistence layer" turns out to
  mean "read 60% of files owned by other systems".

### Scheme C — Data-lifecycle (14 systems)

Systems are stages in the life of the data, with boundaries at durable handoff
artifacts: reference registries → versioned fact tables → provisioned project
DB → installed module definitions → `ro_*` results → version-hashed query
payloads → PO configs/FigureInputs → authored documents → published artifacts
(PDF/PPTX/public bundles). Plus three "carriers" (API contract/access,
freshness mesh, persistence platform) and two "riders" (AI, client shell).

- **Strengths:** the handoff-artifact framing is the best *teaching* model of
  the app — each boundary names the thing that crosses it (step_3_result JSON,
  sandbox CSVs, metrics rows, ItemsHolder, stripped FigureBlocks,
  PublicDashboardBundle). Best-verified claims of the four.
- **Weaknesses:** four of its systems aren't lifecycle stages at all (the
  carriers/riders), which concedes the lens. Splitting Module Catalog from
  Analysis Execution orphaned the 640-line read-API half of
  `db/project/modules.ts` (the single biggest coverage hole found in any
  scheme). The "Freshness Mesh" is a convention audit wearing a system costume
  (2/5 as a review unit).

### Scheme D — Unconstrained hybrid (15 systems) — ADOPTED

Ignores stylistic purity; mixes vertical pipelines with horizontal kernels by
following the verified seams. Both stress-testers' verdict: **"adopt with
amendments"** — ~97% coverage, claims survived adversarial checking at the
highest rate, and its boundaries track real narrow interfaces rather than
directories.

- **Strengths:** repairs the directory lies explicitly (ingestion owns the
  worker-spawning orchestrators *and* the workers; the module system owns its
  heart inside `db/project/modules.ts`; the shell owns the two index.tsx page
  maps). Documents the two zero-import-edge data couplings as written
  contracts.
- **Amendments applied (per §8):** the visualization middle split in three
  along the fetch-config contract; the three document verticals (decks,
  reports, dashboards) merged into one system; file-upload/assets carved into a
  standalone system; all orphan files assigned; filename errors fixed; the
  realtime mesh kept as a (small) system with its convention demoted to a
  cross-cutting audit.

---

## 3. The canonical map — 15 systems

Logical order: platform machinery (1–3), data in (4–7), compute (8),
visualization (9–11), artifacts (12), assist (13), frame (14–15). Sizes are
approximate. "Scope" names the honest designation — cross-directory where the
code demands it; sub-file exceptions are in §4.1.

### S1. API Contract, Transport & Access Control

- **One line:** the typed RPC registry both tiers are generated from, plus the
  two permission guards that scope every request.
- **Scope:** `lib/api-routes/**`; `server/routes/{route-helpers,route-tracker,streaming}.ts`;
  `server/middleware/**`; `server/project_auth.ts`; `main.ts` (composition
  root: mounting, onError envelope — cron jobs belong to S15, `/d/:slug` HTML
  to S12); `client/src/server_actions/**`; `lib/types/{permissions,permission_labels,streaming}.ts`;
  `lib/h_users.ts`; the APIResponse envelope symbols in `lib/types/instance.ts`;
  `server/db/instance/users.ts` + `routes/instance/users.ts` (the rows the
  guards evaluate); client session: `LoggedInWrapper.tsx` (Clerk singleton).
- **Contract:** ~255 registry routes, zero direct client↔server imports;
  errors as HTTP 200 + `{success:false}` (only guards emit real 4xx/5xx);
  `Project-Id` header mints the per-project DB handle. Owns the inventory of
  ~30 off-registry endpoints (health, TUS, SSE, AI proxy, public dashboard,
  export_central, CSV exports) — each owned by its home system. Known posture
  it must own honestly: no runtime body validation (see PLAN_API_ZOD), warn-only
  route tracker (see PLAN_API_ROUTES_HARDENING).
- **Size:** ~85 files. **Docs:** DOC_API_ROUTES, DOC_ACCESS_CONTROL.

### S2. Persistence Core & Schema Lifecycle

- **One line:** Postgres connection machinery for the multi-DB model,
  migrations + JSON data transforms, fail-stop boot, backup/restore mechanics.
- **Scope:** `server/db/postgres/**`, `db/utils.ts`, `db/error_classifier.ts`,
  db barrels, `db/migrations/**` (runner + 86 SQL + 10 transforms — transform
  *mechanics* owned here, each transform's *schema knowledge* co-reviewed by
  its domain system per §4.3.7), base schemas + `_main_database_types.ts` /
  `_project_database_types.ts`, `db_startup.ts`, root `validate_migrations`,
  the restore body of `routes/instance/backups.ts`, project-DB create/drop in
  `db/project/projects.ts`, `lib/types/errors.ts`.
- **Contract:** project DBs named by bare UUID; pooled cached connections
  (READ_ONLY flag is *nominal* — never enforced); one error funnel; boot is
  fail-stop; stored-JSON evolution via transforms with skip-gates. Trap: boot
  success is bound to panther schema versions via `_figure_block.ts`.
- **Size:** ~115 files (mostly SQL). **Docs:** DOC_DB_ACCESS_LAYER,
  DOC_MIGRATIONS, DOC_ACCESS_DBS.

### S3. Realtime Sync & Cache Invalidation

- **One line:** the `last_updated → BroadcastChannel/SSE → version-hash`
  triangle: notify hub, SSE bridges, Valkey machinery, client store/cache
  infrastructure.
- **Scope:** `server/task_management/{notify_*,build_project_state,get_project_dirty_states}.ts`;
  the two SSE endpoints; `server/valkey/**` (generic machinery);
  `server/utils/request_queue.ts`; client `state/_infra/**` (serves all eight
  t2 caches — shared substrate, owned here), `state/*/t1_store.ts` +
  `t1_sse.tsx`, `clear_caches.ts`, the version flush in LoggedInWrapper;
  `lib/types/{project_sse,instance_sse,project_dirty_states}.ts`;
  `components/project/project_cache.tsx`.
- **Contract:** every mutation must stamp `last_updated` and notify — but that
  obligation lives in ~26 files owned by other systems. So: this system's
  *machinery* is reviewed here; its *convention* is a standing audit (§4.3.1),
  not part of "review S3".
- **Size:** ~40 files. **Docs:** DOC_SSE_REALTIME, DOC_VALKEY_CACHE,
  DOC_STATE_RULES + DOC_STATE_MGT_*.

### S4. Assets & Upload

- **One line:** the file-upload front door — the hand-rolled TUS resumable
  upload protocol, asset storage and metadata — shared by every feature that
  ingests a file.
- **Scope:** server: `routes/instance/upload.ts` (TUS protocol, in-memory
  upload map, the deliberately-unauthenticated HEAD-via-GET quirk),
  `routes/instance/assets.ts` (asset list/delete/serve), `db/instance/assets.ts`
  (asset_metadata); client: `_uppy_file_upload.ts`, `_file_upload_selector.tsx`,
  `components/instance/instance_assets.tsx`; lib: `types/assets.ts`. (Static
  serving of `client_dist`/public images lives in S1's `middleware/static.ts`,
  flagged.)
- **Contract:** files land in `ASSETS_DIR` via resumable TUS and are referenced
  by metadata rows; the upload HEAD is intentionally unauthenticated (protocol
  resume). Consumed by S5 (dataset files), S12 (slide logos / report images),
  S13 (AI document uploads). Small but a genuine shared boundary with three
  consumers — isolating it stops "file upload" leaking into a dataset-named
  system.
- **Size:** ~12 files. **Docs:** none (TUS currently appears only as a
  raw-route exception in DOC_API_ROUTES).

### S5. Dataset Ingestion

- **One line:** the stage→integrate machinery for the HMIS/HFA/ICEH dataset
  families: wizards, staging workers, upload-attempt state machines, and
  per-project dataset attach/snapshot.
- **Scope:** `db/instance/dataset_{hmis,hfa,iceh}.ts` (orchestrators including
  their worker-lifecycle blocks); `worker_routines/{stage_*,integrate_*}/**` +
  `worker_store.ts`; `server_only_funcs_csvs/**`; `routes/instance/{datasets,iceh}.ts`;
  `db/project/datasets_in_project_*.ts` + `calculated_indicators_snapshot.ts`
  (snapshot + sandbox CSV export — the seam to S8); lib dataset/import types +
  `table_structures/**`; client: `instance_dataset_*` + `*_import` wizards,
  `_import_wizard/`, `PeriodSelector` / `TimeIndexSelector` / `WindowingSelector`,
  `project_data.tsx` + `settings_for_project_dataset_*.tsx` + `staleness_checks.ts`,
  `instance_data.tsx` (switchboard, shared with S6), `state/instance/t2_datasets`.
  File upload itself is S4 (Assets & Upload); this system consumes uploaded
  files.
- **Contract:** one concurrent import per family (single-row attempt rows +
  fixed UNLOGGED staging tables + locks); three different execution models
  behind identical UIs (workers / in-process / streaming); progress by
  POLLING, not SSE; completion hands off via `setModulesDirtyForDataset`.
- **Size:** ~110 files — delegate as sub-briefs per family (HMIS / HFA / ICEH
  / shared machinery). **Docs:** DOC_IMPORT_PIPELINE (stale — see §7),
  DOC_WORKER_ROUTINES; PLAN_IMPORTER_CONSOLIDATION is the active reform plan.

### S6. Structure & Reference Data

- **One line:** the instance-wide reference world everything joins against:
  facilities, admin areas, weights, geojson boundaries, indicator dictionaries
  (HMIS/HFA/calculated/ICEH), time points, instance config.
- **Scope:** `server_only_funcs_importing/**` (structure ELT, 6 integrate
  strategies); `db/instance/{structure,hfa_facility_weights,indicators,calculated_indicators,hfa_indicators,hfa_time_points,geojson_maps,config,instance}.ts`;
  `server/geojson/process_geojson.ts`; `routes/instance/{structure,indicators,calculated_indicators,hfa_indicators,hfa_time_points,geojson_maps}.ts`
  + the config-mutation routes in `routes/instance/instance.ts`; lib types
  (structure, indicators, calculated_indicator_id, hfa_types, iceh_strats,
  geojson_maps; instance-config schemas in `types/instance.ts`); client:
  `structure/`, `structure_import/`, `instance_geojson/`,
  `indicator_manager_{hmis,hfa}/` (incl. the client-side R validator),
  `instance_hfa_time_points/`, `instance_settings.tsx`,
  `forms_editors/{edit_hfa_indicator,dhis2_credentials_form}.tsx`,
  `state/instance/{t2_structure,t2_indicators,t2_geojson}`.
- **Contract:** authoritative registries (facility FK backbone with named
  DEFERRABLE constraints; indicator mappings drive staging validation; HFA R
  code is EXECUTED by S8's module runs; instance config parameterizes S5's ELT
  and S9's SQL). Snapshots frozen into project DBs at attach time.
- **Size:** ~90 files (client dictionary managers are the bulk).
  **Docs:** DOC_DISAGGREGATION_OPTIONS_HANDLING, parts of DOC_IMPORT_PIPELINE.

### S7. DHIS2 Connector

- **One line:** the self-contained typed HTTP adapter for external DHIS2
  instances: auth, retry, paging, analytics, geojson, credentials UX.
- **Scope:** `server/dhis2/**`; `routes/instance/indicators_dhis2.ts`; client
  `Dhis2CredentialsEditor.tsx` + `state/instance/t4_dhis2_session.ts`. Known
  wart owned as a review item: `stage_structure_from_dhis2.ts` (in S5/S6
  territory) re-implements org-unit paging inline.
- **Contract:** every call funnels through `fetchFromDHIS2 → withRetry`
  (5 attempts, backoff+jitter); never-throw boundary; two-phase connection
  validation; no DB writes. Consumed by S5 (analytics), S6 (org units,
  geojson, indicator search).
- **Size:** ~20 files. The cleanest system — scored 5/5 in every stress test.
  **Docs:** DOC_DHIS2_INTEGRATION.

### S8. Module System

- **One line:** versioned R modules end-to-end: GitHub fetch → validate →
  install/update → dirty-state propagation → Docker/R execution → `ro_*`
  ingest.
- **Scope:** `server/module_loader/**`; `server/github/**`; ALL of
  `db/project/modules.ts` (install heart *and* the read API at lines ~540+) +
  `db/project/results_objects.ts`; `task_management/{mod,set_module_dirty,get_dependents,trigger_runnable_tasks,running_tasks_map,set_module_clean}.ts`;
  `worker_routines/run_module/**` + `instantiate_worker_generic.ts`;
  `server_only_funcs/**` (R-script templating); `server_only_types/mod.ts`
  task types; `routes/{instance,project}/modules.ts`; lib module types +
  `module_registry.ts`; client: `project_modules.tsx`, `update_module*.tsx`,
  `view_{files,logs,script}.tsx`, `project_module_settings/`, `DirtyStatus.tsx`,
  `compare_projects.tsx`, `metric_details_modal.tsx`. External contract
  surfaces: wb-fastr-modules repo (vendored `.validation` schema copy), Docker
  images.
- **Contract:** definitions zod-validated at every fetch (the runtime
  enforcement point); compute/presentation git-ref split; dirty closure
  recomputed per event (no stored edges); self-draining `task_ended` loop with
  NO boot-time recovery (known gap); outputs `ro_*` + `metrics` +
  `last_run_at` — the data spine S9 queries and caches on.
- **Size:** ~50 files. **Docs:** DOC_MODULE_EXECUTION, DOC_MODULE_UPDATES,
  DOC_TASK_EXECUTION_DIRTY_STATE, DOC_WORKER_ROUTINES, DOC_POPULATION_CSV.

### S9. Visualization Query & Cache Service

- **One line:** PO config → fetch-config contract → SQL over `ro_*` tables →
  version-hashed cached payloads, on both tiers.
- **Scope:** lib contract: `get_fetch_config_from_po.ts` (hashFetchConfig,
  period bounds, roll-up gates), `validate_fetch_config.ts`,
  `admin_area_rollup.ts`, ItemsHolder types; server:
  `server_only_funcs_presentation_objects/**`, the query endpoints + cache
  choreography + `getDatasetsVersion` in `routes/project/presentation_objects.ts`,
  `routes/caches/{visualizations,dataset}.ts` (instances + PO_CACHE_VERSION),
  `routes/project/cache_status.ts`, `db/project/{metric_enricher,results_value_resolver}.ts`;
  client: the cache/query halves of `state/project/{t2_presentation_objects,t2_replicant_options}.ts`.
- **Contract:** `GenericLongFormFetchConfig` is THE client→server query
  contract; `hashFetchConfig` is cache identity on both tiers (field additions
  silently rekey everything); roll-up gates single-sourced in lib; Ethiopian
  calendar alters both bounds and generated SQL. **Carried the app's top
  security defect** (§7.1 — fetch-config SQL injection; membership classes
  fixed 2026-06-12, PAE residual closed 2026-06-14 — fetch-config boundary now
  fully validated).
- **Size:** ~40 files, logic-dense. **Docs:**
  DOC_PRESENTATION_OBJECT_QUERY_PIPELINE, DOC_period_column_handling,
  DOC_DISAGGREGATION_OPTIONS_HANDLING, DOC_ROLLUP_ROWS, DOC_VALKEY_CACHE.

### S10. Figure Rendering & Export Engine

- **One line:** pure transforms from data+config to pixels and files:
  FigureInputs assembly, strip/hydrate snapshots, slide→page rendering,
  PDF/PPTX/XLSX/DOCX export.
- **Scope:** `client/src/generate_visualization/**` (incl. strip/hydrate — the
  app-wide figure-snapshot contract — special chart modes,
  GLOBAL_STYLE_OPTIONS consumed at boot); `generate_slide_deck/**`
  (`convertSlideToPageInputs` — the single screen/export chokepoint);
  `client/src/exports/**` (incl. `get_table_export_aoa.ts`); the plain figure
  resolvers to be extracted from `slide_deck/slide_ai/` (`resolve_figure_from_*`
  — see §6.2); lib render contracts (`json_slide_serialize.ts`,
  `brand_presets.ts`, `key_colors.ts`, slide-font types); `font-map.json` +
  `/fonts`; `state/project/t2_images.ts`.
- **Contract:** one renderer per artifact class shared by screen and export;
  stored snapshots are stripped FigureInputs re-hydrated at render; panther
  `zFigureInputs` binds stored figures to panther schema versions (the
  figure-storage-drift problem; repair arm is S2's `_figure_block.ts`
  transform — co-reviewed).
- **Size:** ~55 files, mostly pure functions, undocumented territory.
  **Docs:** DOC_SPECIAL_CHART_MODES, DOC_DESIGN_SYSTEM.

### S11. Visualization Authoring UI

- **One line:** the live PO editor (edit/create/ephemeral modes), the
  visualization library, and PO CRUD with conflict resolution.
- **Scope:** `components/visualization/**`; `PresentationObjectPanelDisplay` /
  `MiniDisplay` / `ReplicateByOptions` / `NotAvailableBox` /
  `_editor_snapshot.ts`; `components/project/add_visualization/**` +
  `preset_preview.tsx` + `project_visualizations.tsx` + `project_metrics.tsx`
  + `edit_folder_modal.tsx` + `move_to_folder_modal.tsx`; forms_editors viz
  modals (conflict_resolution, custom_series_styles,
  download_presentation_object, view_results_object); the FigureInputs
  assembly half of `t2_presentation_objects.ts`; server PO/folder CRUD
  (`db/project/{presentation_objects,visualization_folders}.ts` + both route
  files); lib: `normalize_po_config.ts`, `convert_visualization_type.ts`,
  PO config type families, `lib/utils.ts` (withReplicant).
- **Contract:** the three-mode editor — notably *ephemeral* mode — is the
  authoring surface dashboards/slides/reports/AI all plug into; save path
  normalizes + enforces `expectedLastUpdated` conflict protocol; registers
  live mutators into AIContext. Known fragility: the manually-enumerated
  reactive reads in the refetch effect.
- **Size:** ~40 files. **Docs:** DOC_DESIGN_SYSTEM, DOC_STATE_RULES.

### S12. Documents & Sharing

- **One line:** the three figure-snapshot-embedding artifact types — slide
  decks, markdown reports, and dashboards — plus the public slug-addressed
  viewer and all PDF/PPTX/XLSX/DOCX/email exports.
- **Scope:** client: `components/slide_deck/**` minus `slide_ai/` (but see
  §6.2), `layout_editor/`, `components/report/**`, `components/dashboards/**`,
  `components/public_viewer/**`; the deck/report/dashboard list pages + modals
  in `components/project/` (`project_decks.tsx`, `project_reports.tsx`,
  `project_dashboards.tsx`, `add_deck.tsx`, `add_report.tsx`, `duplicate_*`,
  `*_folder_modal.tsx`, `move_*_to_folder_modal.tsx`); `state/project/{t2_slides,t2_dashboards}.ts`;
  server CRUD (`db/project/{slides,slide_decks,move_slides,slide_deck_folders,reports,report_folders,dashboards}.ts`
  + routes), `db/instance/dashboard_slugs.ts`, `routes/public/dashboard.ts` +
  the `/d/:slug` SPA-HTML in `main.ts`, `routes/project/emails.ts`,
  `server/utils/id_generation.ts` (hardcodes 7 tables — flagged); lib slide/
  report/dashboard types incl. `buildPublicDashboardBundle` (shared verbatim
  with the public route — the non-divergence invariant).
- **Contract:** all three persist CLIENT-built stripped FigureBlock snapshots
  (server never recomputes figures — public freshness depends on editor
  resaves); shared figure-snapshot lifecycle owned upstream by S10; three
  concurrency philosophies (slides: true conflict resolution; reports:
  last-write-wins + banner; dashboards: replicant-group reconcile); the public
  viewer is the app's only unauthenticated product surface (isPublic gate on a
  real Clerk session). The public/unauthenticated surface is reviewed as a
  cross-cutting security audit (§4.3.9), not only here.
- **Size:** ~115 files; the largest undocumented system — delegate as
  sub-briefs (decks / reports / dashboards+public). **Docs:** none (PLAN/memory
  files are the interim baseline).

### S13. AI Copilot & Usage Governance

- **One line:** the Anthropic proxy with token-limit governance, plus the
  browser-side copilot: ~40 client-executed tools mutating app state only
  through the AIContext contract.
- **Scope:** server: `routes/project/{ai_proxy,ai_files,ai_tools}.ts`,
  `db/instance/{ai_usage_logs,custom_prompts}.ts`,
  `routes/instance/custom_prompts.ts`; client: `components/project_ai/**`,
  the AI-specific half of `slide_deck/slide_ai/` (the plain resolvers move to
  S10 — §6.2), `state/project/t4_ai_documents.ts`; lib:
  `types/{ai_input,custom_prompts}.ts`.
- **Contract:** tools execute IN THE BROWSER through the same serverActions/
  caches as the human UI, so AI inherits user permissions for free; editors
  expose live mutators via the AIContext discriminated union — the cleanest
  seam in the client; only model calls traverse the proxy (limits enforced
  server-side; usage parsed from Anthropic SSE events — wire-format changes
  silently zero accounting).
- **Size:** ~60 files. **Docs:** DOC_AI_PROXY_AND_USAGE_GOVERNANCE,
  DOC_AI_TOOL_SCHEMAS.

### S14. Client Shell & Session

- **One line:** SPA boot, the signal-based page maps (almost no URL routing),
  language/calendar singleton lifecycle, UI preferences, connection and help
  chrome.
- **Scope:** `client/src/{index.tsx,app.tsx,app.css}`, `routes/index.tsx`,
  `components/instance/index.tsx` + `components/project/index.tsx` (the actual
  page maps), `state/{t4_ui,t4_connection_monitor}.ts`,
  `ConnectionStatus.tsx`, `HelpButton.tsx` + `lib/help/**` +
  `build_help_buttons.ts`, onboarding modals, `components/_shared/**` (generic
  primitives), `lib/translate/**` (the singletons — calendar *semantics* are
  S9's; see §4.3.5), `FRONTEND_STYLE_GUIDE.md`.
- **Contract:** deterministic boot order (panther globals + language/calendar
  BEFORE first render; GLOBAL_STYLE_OPTIONS deep-imported from S10 is
  load-bearing); only two URL-addressable surfaces (`/d/:slug`, `?p=`); UI
  prefs persist via localStorage and never enter fetch configs or cache
  hashes.
- **Size:** ~30 files + the 237-file `t3` call-site surface (spot-check only).
  **Docs:** DOC_TRANSLATION, DOC_HELP_BUTTONS, DOC_BUILD_INSTRUCTIONS,
  DOC_DESIGN_SYSTEM, DOC_STATE_RULES.

### S15. Instance Administration & Ops

- **One line:** user/role management, project lifecycle, instance settings UI,
  plus the operational side-channel: health endpoints, backups, disk
  autonomics, emails, central export, scheduled jobs, deploy.
- **Scope:** client: `components/instance/**` minus index.tsx and
  instance_assets.tsx (users, projects, settings forms, profile, feedback),
  `project_settings.tsx` + `copy_project.tsx` + `create_backup_form.tsx` +
  `restore_from_file_form.tsx`, role/permission forms_editors; server:
  `routes/project/project.ts` (lifecycle + roles; dataset-attach handlers are
  S5's — flagged), `routes/instance/{instance,health,backups,export_central}.ts`
  (backups *proxy* here, restore *mechanics* S2), `db/project/projects.ts`
  (registry + roles halves), `db/instance/user_logs.ts`,
  `server/utils/disk_space.ts`, `exposed_env_vars.ts` (see §4.2), cron jobs in
  `main.ts`; repo: `./run`, `./deploy`, Dockerfile. External: status-api,
  SendGrid, the ~40-instance production topology.
- **Contract:** writes the permission rows S1 evaluates; sole creator/
  destroyer of project DBs; health is deliberately unauthenticated (exposure
  inventory must stay deliberate — PLAN_HARDEN_SECURITY); out-of-band side
  effects (volume resize, alert emails) invisible to the route registry.
- **Size:** ~50 files; small server surface, highest privilege.
  **Docs:** DOC_ACCESS_DBS, DOC_ACCESS_CONTROL.

---

## 4. Operating rules that make the map usable

The stress tests were unanimous: the map fails silently without these three
artifacts attached to every delegated review.

### 4.1 Shared-custody files

Files where systems genuinely meet inside one file. Ruling: ONE owner reviews
the whole file; the others are mandatory readers of their slice. (Several of
these are split-physically candidates — see §6.3.)

| File | Owner | Mandatory readers | Seam |
|---|---|---|---|
| `server/db/project/projects.ts` | S15 | S2 (DB create/drop), S1 (role CRUD), S8 (auto-install) | four systems in 1,108 lines |
| `server/routes/project/project.ts` | S15 | S5 (dataset attach), S8 (dirty handoff) | 18 routes, three systems |
| `server/routes/project/presentation_objects.ts` | S9 | S11 (CRUD routes), S3 (cache choreography) | queries vs CRUD vs caching interleaved |
| `server/routes/caches/visualizations.ts` | S9 | S3 (machinery), S2 (transforms import it) | cache instances + PO_CACHE_VERSION |
| `client/src/state/project/t2_presentation_objects.ts` | S9 | S10 (FigureInputs assembly), S3 (cache mechanics) | hottest client file, 20 importers |
| `server/db/instance/dataset_hmis.ts` / `dataset_hfa.ts` | S5 | S2 (conventions), S8 (worker machinery) | orchestrator + worker lifecycle + CRUD |
| `server/db/project/modules.ts` | S8 | S2 (conventions), S9 (metrics reads), S13 (AI list fns) | whole file owned by S8 |
| `main.ts` | S1 | S2 (boot), S15 (cron), S12 (`/d/:slug`) | composition root |
| `client/src/components/LoggedInWrapper.tsx` | S1 | S3 (version flush), S14 (boot/sign-in) | Clerk singleton + flush + shell |
| `server/routes/instance/backups.ts` | S15 | S2 (restore body: DROP/CREATE + re-migrate) | most destructive code path in the app |
| `lib/translate/t-func.ts` | S14 | S9 (calendar semantics) | 17 lines, two systems |
| `server/task_management/mod.ts` | S8 | S3 (re-exports notify hub; side-effect listener import) | one barrel, two systems' API |

### 4.2 Kernel — read but don't own

Attached to every review brief: these files are everyone's dependency and no
one's system. Review them only alongside the system consuming them; proposals
to change them need a cross-system check.

- `lib/mod.ts`, `lib/types/mod.ts` (the mega-barrel — 445 importers)
- `lib/types/instance.ts` (envelope + config schemas + user types + ItemsHolder
  — split by symbol across S1/S6/S9/S15)
- `lib/consts.ts` (multi-domain constants, split by symbol)
- `lib/utils.ts`
- `server/exposed_env_vars.ts` (42 importers; carries import-time
  `setLanguage`/`setCalendar` side effects and parked domain constants for
  S5/S8/S13)

### 4.3 Cross-cutting audits (tasks, not systems)

Recurring audits that by construction read many systems' files. Delegating
"review system X" never covers these; they need their own briefs with explicit
license to read everything.

1. **Notify/stamp coverage** — every mutating route/db fn stamps
   `last_updated` and calls the right `notify_*` (hand convention, ~26 files;
   a miss = permanently stale UI/caches with no error).
2. **Guard-per-route sweep** — every endpoint (registry + the ~30 off-registry)
   has the right guard or a documented absence. (Partly covered by
   PLAN_API_ROUTES_HARDENING B-items.)
3. **Runtime-validation posture** — which handlers validate cast bodies and
   which trust phantom types. (PLAN_API_ZOD is the structural fix.)
4. **Version-hash ingredient completeness** — for each cached payload, every
   input that changes its meaning bumps an ingredient hash; payload-shape
   changes get a key-prefix bump.
5. **Calendar semantics** — Ethiopian branches agree across lib bounds-builder
   (S9), server SQL CASE (S9), import-side Gregorian→Ethiopian conversion
   (S5), and display (S10/S14). Four custodians, no single owner — the
   likeliest both-reviewers-skip-it invariant in the app.
6. **t3 literal correctness** — the {en,fr} literals at 2,508 call sites; no
   system reviews the actual French.
7. **Migration data-transform pairing** — S2 owns each transform's mechanics
   (gating, transactionality); the domain system owns its schema correctness.
   Both named per transform, neither assumes the other.
8. **Cross-repo lockstep discipline** — panther `./sync` ordering,
   wb-fastr-modules `.validation` byte-sync, wb-fastr-site help ids. The
   dominant historical failure mode per project memory; owned by no system.
9. **Public / unauthenticated surface** — the `/d/:slug` public dashboard
   route, its `buildPublicDashboardBundle` payload (leakage), slug enumeration,
   the isPublic gate, and the BYPASS_AUTH dev nuance — spans S1 (auth),
   `main.ts`, and S12. The reason Dashboards needn't be its own system.

### 4.4 Review-brief protocol

When delegating "review system X": ship (a) the verbatim scope text from §3,
(b) the custody table (§4.1), (c) the kernel rule (§4.2), and (d) which
cross-cutting audits are explicitly OUT of scope. For S5, S6, S12: delegate
per sub-brief (by dataset family / dictionary / artifact type).

---

## 5. Execution model — how the two workstreams actually run

This map drives two distinct streams of work. They interleave; neither blocks
on the map being "finished."

**#1 — define & document the systems.** Lock the map (done), build the manifest
+ lint, and write one `SYSTEM_NN_*.md` per system (see PLAN_DOC_CONSOLIDATION).
The SYSTEM doc for a system is produced *as the artifact* of the deep review
that understands it — docs and reviews are the same motion, not two passes.

**#2 — change the code.** Two kinds, driven by different things:

- **(a) Fixes** — things that are *wrong* (bugs, security, dead code). Driven
  by findings, NOT by the map. The three in-flight
  plans, §7.2 dead code, the PLAN_HARDEN_SECURITY urgent items. The map only
  *batches and prioritizes* these. They run in parallel to everything.
- **(b) Refactors toward the map** — making the systems real at the file level
  (extract the slide_ai resolvers, split the §4.1 custody files, relocate the
  cache instances, move `h_users` server-side, split `exposed_env_vars`). The
  §6 decoupling ideas. Driven by the map.

And two moments when code changes:

- **(i) Standalone horizontal plans** — what's running now. The hardening plans
  are standalone *because they're horizontal* (the contract everywhere, ZOD
  every route). Genuinely cross-cutting work doesn't fit one system; it gets a
  plan. This is correct and already underway.
- **(ii) Inside a per-system cycle** — the engine. A system review is NOT
  read-only; it is:

  > **review → triage → fix → document**

  Delegate "review S9 in detail" → it produces findings → triage each into
  bug / decoupling-toward-map / doc-correction → fix the bugs and apply that
  system's share of the refactor work (its §4.1 custody-file splits are best
  done here, by whoever's deep in it) → the `SYSTEM_09.md` doc is the artifact.
  Repeated per system in priority order, this cycle is where the bulk of #2
  lives.

**Interleave:**

| Phase | #1 (define/document) | #2 (change code) |
|---|---|---|
| Now | — | Horizontal fix plans (hardening → state-mgt → zod). Map-independent. |
| Lock | Map locked (this doc) | — |
| Bridge | PLAN_DOC_CONSOLIDATION + manifest/lint | Cheap boundary cleanup: extract slide_ai resolvers → S10, relocate cache instances, `h_users` server-side. Low-risk; makes every later review cleaner. |
| Loop (per system) | each cycle *produces* its SYSTEM_NN.md | review → triage → fix → document; heavy custody-file splits done in-cycle |

**Two timing rules:**

- Split the heavy §4.1 custody files *per-system, as the opening move of that
  system's cycle* — not upfront in one batch. Cutting `projects.ts` (1,108
  lines, four systems) is itself design work, best done by the review that
  understands it. Only the trivially-correct moves go in the bridge pass.
- Order the system cycles to dovetail with the horizontal plans, not fight
  them. Don't run the S1 cycle while hardening is mid-flight (the contract's
  moving); S9 is the natural first pilot (highest value, and is mostly stable).

**The one risk:** findings scatter. A review surfaces ~15 things; some fixed
in-cycle, some deferred. Rule: every triaged finding either gets fixed in the
cycle, gets a one-line entry in that SYSTEM doc's "open items" section, or gets
its own PLAN_ if big enough (like FigureBundle already is). The SYSTEM doc's
open-items section is the permanent, scoped successor to ad-hoc PLAN_*_FIXES
files.

---

## 6. Coupling observations and decoupling ideas

Ideas, not plans (most land via the §5 cycles). Roughly ordered by leverage.

1. **The registry seam is the decoupling story — protect it.** Zero
   client↔server import edges is an unusual and valuable property. The ~30
   off-registry endpoints are the erosion surface; keeping that inventory
   deliberate (and small) preserves the property. PLAN_API_ROUTES_HARDENING +
   PLAN_API_ZOD strengthen this seam from both directions.

2. **Extract the plain figure resolvers from `slide_deck/slide_ai/`.**
   `resolve_figure_from_visualization` / `_from_metric` are generic
   snapshot-a-viz-into-FigureBlock machinery consumed by dashboards, reports,
   and the viz modal — non-AI flows depending on AI-labelled files. Moving
   them to `generate_visualization/` (S10) dissolves the only feature↔feature
   fusion in the client import graph. Cheap, high clarity — a bridge-pass move.

3. **Physically split ~5 of the custody files.** The §4.1 table exists because
   systems meet inside files. A few are cheap, mechanical splits that would
   make the topology real at file level: `projects.ts` (mainDb registry/roles
   vs project-DB lifecycle), `presentation_objects.ts` route (query endpoints
   vs CRUD), `server_only_types/mod.ts` (20 lines, three systems),
   `task_management/` (notify hub vs dirty machine — directory split),
   `backups.ts` (proxy vs restore mechanics). No behavior change, large
   reduction in review ambiguity. Do the heavy ones in-cycle (§5).

4. **Make the notify/stamp convention structural.** The triangle is the app's
   most invariant-dense mechanism and is enforced by hand in ~26 files. Idea:
   a write-helper that performs mutate + stamp + notify together (or a dev
   assertion that flags mutations without notifies), so the audit (§4.3.1)
   becomes mechanical.

5. **`lib/h_users.ts` ships access-policy emails in the client bundle.**
   Semantically server-side access-control data. Idea: move server-side
   (client gets a boolean from the server where needed). A bridge-pass move.

6. **Split `exposed_env_vars.ts`.** A 42-importer nexus carrying five systems'
   constants plus import-time i18n side effects. Idea: per-domain constant
   modules + an explicit init call for the side effects, so importing a
   staging-table name doesn't silently configure the calendar.

7. **Relocate the cache instances out of `routes/caches/`.** They're not
   routes, and migrations' data_transforms importing from `routes/` is the
   layering inversion both reviewers flagged. A `server/caches/` home (or
   beside valkey/) makes the dependency direction honest. A bridge-pass move.

8. **Heal the db→worker inversion semantically or physically.** The dataset
   orchestrators in `server/db/instance/` spawning workers is the biggest
   directory lie. The map heals it semantically (S5 owns both halves);
   PLAN_IMPORTER_CONSOLIDATION is the natural vehicle if a physical move is
   ever wanted.

9. **Separate display-language from data-calendar.** The calendar singleton is
   data semantics (changes generated SQL and stored period_ids) living in an
   i18n file with four part-owners. Even without code movement, a single
   authoritative doc comment + the §4.3.5 audit reduces the risk; longer-term,
   a `lib/calendar.ts` distinct from translate would name the truth.

10. **The data-spine couplings deserve written contracts more than code
    changes.** S8→S9 (ro_*/metrics/last_run_at) and S5→S8 (sandbox CSVs +
    dirty call) have zero import edges by design — that's good decoupling.
    The risk is that nothing *states* the contracts; §3's contract lines are a
    start, and keeping them current is cheaper than any mechanism.

11. **Misc small reliefs:** `try_catch_server.ts` importing the Clerk singleton
    from a UI component (session accessor belongs in `state/`);
    `id_generation.ts` hardcoding 7 tables across S11/S12; the two deep
    panther imports bypassing the barrel; the dual CSV parsers (papaparse vs
    panther parseCSV); the split-brained DHIS2 wire types.

---

## 7. Findings to act on regardless of topology

### 7.1 Fetch-config SQL interpolation (security — verified by three independent agents)

`groupBys`, `filter.disOpt`, `value.prop`, `postAggregationExpression`, and the
replicant route's `replicateBy` from client-supplied fetch configs are
interpolated into SQL executed via `projectDb.unsafe`. The original finding:
`validateFetchConfig` was called only on the items endpoint
(`routes/project/presentation_objects.ts:351`) and checked type-shape but NOT
membership in `ALL_DISAGGREGATION_OPTIONS`; the replicant-options endpoint never
validated at all. An authenticated SQL-injection surface against the caller's
own project DB.

**Membership classes FIXED 2026-06-12** (committed independently of the three
plans): `validateFetchConfig` now enforces `groupBys` and `filters[].disOpt`
membership via `isValidDisaggregationOption`, `value.prop` as a bare SQL
identifier, and `postAggregationExpression` against a safe charset; the
`getReplicantOptions` route now calls `validateFetchConfig` and validates
`replicateBy`. Verified by execution harness (real configs pass, injection
attempts rejected) + typecheck. PLAN_API_ZOD batch 5 formalizes these at the
Zod boundary (note added there).

**Residual — `postAggregationExpression` CLOSED 2026-06-14.** It is a freeform
arithmetic string (e.g. `value = COALESCE(sum_val, avg_num / avg_weight)`)
interpolated raw, wrapped as `SELECT (${expr}) ... FROM (${query}) AS subq`. The
charset guard alone blocked quotes/semicolons/comments but a scalar subquery
built from word-chars + parens (`(SELECT pg_sleep(5))`) — and bare function calls
like `pg_sleep(60)` (an authenticated DB-connection-exhaustion DoS) — still
passed the charset. Now closed with a structural validator
(`isSafePostAggregationExpression` in `lib/validate_fetch_config.ts`) layered on
top of the charset: (1) no two adjacent value tokens — kills `select col`/`from
t` and every subquery shape, since arithmetic always has an operator between
operands; (2) any identifier directly before `(` must be a whitelisted function
(`abs`/`coalesce`/`nullif`). Wired into both the imperative `validateFetchConfig`
and the Zod boundary (`presentation-objects.ts` `.refine`), single source of
truth. Verified by execution harness (all real authored PAEs pass; subquery,
`pg_sleep`, `current_setting`, `t.col`, adjacent-identifier rejected) + typecheck.
The server-authoritative direction (compare against the metric's stored
`postAggregationExpression.expression`, or rebuild fetchConfig server-side per
the FigureBundle plan) remains the eventual end-state but is no longer needed for
security.

### 7.2 Dead code (verified zero importers — deletion candidates)

`client/src/components/PasswordGate.tsx`; `client/src/components/Conflicts.tsx`;
`client/src/components/forms_editors/confirm_update.tsx`;
`client/src/components/project/project_logs.tsx`;
`lib/cache_class_B_in_memory_map.ts`; `lib/types/dimension_definitions.ts`;
`lib/translate/language_map_content.ts` (dead twin of the live
module_loader copy) and `translateIndicatorId` in `lib/translate/common.ts`;
`fetchRawScript` in `server/github/fetch_module.ts`;
`server/routes/caches/structure.ts`; `_IMAGE_DIMENSIONS` in `lib/consts.ts`;
`server/scripts/` (empty dir).

### 7.3 Doc staleness (highest-value corrections)

Most of these dissolve when DOC_* is consolidated into SYSTEM_* files
(PLAN_DOC_CONSOLIDATION); listed here so the consolidation catches them.

- **CLAUDE.md:** `server/ai/` and `server/visualization_definitions/` don't
  exist (AI proxy lives in `routes/project/ai_*.ts`; viz query code is
  `server_only_funcs_presentation_objects/`); `client/src/export_report` is
  now `client/src/exports/`; dataset-import progress is POLLED, not SSE;
  "i18n built from XLSX" is wrong per DOC_TRANSLATION; `state/ui.ts` and
  `components/project_runner/provider.tsx` are phantoms (real:
  `state/t4_ui.ts`, `components/project/index.tsx` area).
- **DOC_IMPORT_PIPELINE:** pre-facilities-split; no ICEH; no wizard shell.
- **DOC_MIGRATIONS:** lists 5 of 10 transforms; "reports are deprecated" is
  wrong; links nonexistent DOC_AI_TOOL_VALIDATION.md; cites
  `lib/types/instance_config.ts` (real home: `lib/types/instance.ts`).
- **DOC_VALKEY_CACHE:** prefix `po_detail` → code is `po_detail_v2`.
- **DOC_API_ROUTES:** raw-route exception list cites the deleted share.ts
  routes (PLAN_API_ROUTES_HARDENING C1 fixes this).
- Minor: DOC_STATE_MGT_PROJECT cites `notify_project_updated.ts` (real:
  `notify_project_v2.ts`); DOC_BUILD_INSTRUCTIONS/DOC_DESIGN_SYSTEM cite
  `panther/FRONTEND_STYLE_GUIDE.md` (real: `client/src/FRONTEND_STYLE_GUIDE.md`);
  DOC_MODULE_UPDATES uses spec-style `:projectId` paths; DOC_ACCESS_DBS cites
  a deleted diagnostic script.

---

## 8. Resolved decisions & roadmap

The six open questions, resolved with Tim (2026-06-12):

1. **Realtime mesh: system or audit?** → **System (S3)** owning the machinery,
   with the write→stamp→notify convention demoted to cross-cutting audit
   §4.3.1.
2. **Decks + Reports + Dashboards: one or three?** → **One** (S12 Documents &
   Sharing), with three sub-briefs. They are the same kind of artifact
   (client-built FigureBlock snapshots); their shared contract is owned
   upstream by S10, so merging is cohesive. The only reason to isolate
   Dashboards — the public surface — is handled by audit §4.3.9.
3. **File-upload/TUS infra?** → **Standalone (S4 Assets & Upload).** Small but
   a clean front door with three consumers (S5/S12/S13).
4. **Manifest format?** → **Frontmatter in each `SYSTEM_NN_*.md`** (file globs +
   sub-file custody pointers) + a lint script asserting every tracked file
   matches exactly one system (flags orphans and double-claims). The docs
   *become* the manifest; the §4.1 custody table stays prose (line-range,
   not glob-expressible).
5. **Promotion path?** → **Archive DOC_* into `SYSTEM_NN_*.md`** (one per
   system) plus a few cross-cutting docs for the §4.3 audits and an index
   `SYSTEMS.md`. NOT "keep DOC_* and tag them" — that was the excess.
   `panther/protocols/PROTOCOL_*` stays separate (cross-project base). See
   PLAN_DOC_CONSOLIDATION.
6. **§7.1 injection?** → **Done** (membership classes shipped 2026-06-12; PAE
   residual closed 2026-06-14 — structural validator on top of the charset).

**Immediate roadmap:**

1. ~~Lock the map~~ (this doc). ✓
2. **PLAN_DOC_CONSOLIDATION.md** — the DOC_* → SYSTEM_* migration + the
   frontmatter/lint manifest. Map-independent of the hardening work; can run in
   parallel.
3. **Bridge pass** — the trivially-correct §6 moves (slide_ai resolver
   extraction, cache-instance relocation, `h_users` server-side).
4. **First system cycle: S9** (review → triage → fix → document) — after
   hardening + zod settle, so the contract it touches is stable.
