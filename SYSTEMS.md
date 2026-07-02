# Systems map — wb-fastr

> Canonical topology: 15 systems (+ a read-but-don't-own kernel). This is the
> canonical index: the map, the per-system scope/contract (System details
> below), the custody table, the kernel rule, the cross-cutting audits, and the
> execution model. Each `SYSTEM_NN_*.md` file's `globs:` frontmatter is the
> machine-checked manifest (`lint_systems.ts` asserts every tracked file is
> claimed by exactly one system). Migration of the old `DOC_*` set into the
> SYSTEM files: [PLAN_DOC_CONSOLIDATION.md](PLAN_DOC_CONSOLIDATION.md).
>
> **State:** the manifest + lint are live and the per-system scope/contract is
> below. Each system's *DOC_\* prose* is still inlined into its `SYSTEM_NN`
> file during that system's first review cycle (Phase 2).

## The map

Platform machinery (1–3), data in (4–7), compute (8), visualization (9–11),
artifacts (12), assist (13), frame (14–15).

| #                                        | System                                   | One line                                                                                   |
|------------------------------------------|------------------------------------------|--------------------------------------------------------------------------------------------|
| [S1](SYSTEM_01_api_contract.md)          | API Contract, Transport & Access Control | typed RPC registry both tiers generate from + the two permission guards                    |
| [S2](SYSTEM_02_persistence.md)           | Persistence Core & Schema Lifecycle      | multi-DB Postgres, migrations + data transforms, fail-stop boot, backup/restore            |
| [S3](SYSTEM_03_realtime_cache.md)        | Realtime Sync & Cache Invalidation       | the last_updated → SSE → version-hash triangle (notify hub, Valkey, client stores)         |
| [S4](SYSTEM_04_assets_upload.md)         | Assets & Upload                          | the TUS file-upload front door + asset storage/metadata                                    |
| [S5](SYSTEM_05_structure_reference.md)   | Structure & Reference Data               | facilities, admin areas, weights, geojson, indicator dictionaries, instance config         |
| [S6](SYSTEM_06_ingestion.md)             | Dataset Ingestion                        | stage→integrate for HMIS/HFA/ICEH: wizards, staging workers, attach/snapshot               |
| [S7](SYSTEM_07_dhis2.md)                 | DHIS2 Connector                          | self-contained typed adapter for external DHIS2 (retry, paging, analytics, geojson)        |
| [S8](SYSTEM_08_module_system.md)         | Module System                            | versioned R modules: fetch → validate → install → dirty-state → Docker run → ro_*          |
| [S9](SYSTEM_09_viz_query_cache.md)       | Visualization Query & Cache Service      | PO config → fetch-config → SQL over ro_* → version-hashed cached payloads                  |
| [S10](SYSTEM_10_figure_render_export.md) | Figure Rendering & Export Engine         | stored FigureBundle → `buildFigureInputs` → panther, slide→page render, PDF/PPTX/XLSX/DOCX |
| [S11](SYSTEM_11_viz_authoring.md)        | Visualization Authoring UI               | the live PO editor (edit/create/ephemeral) + library + PO CRUD                             |
| [S12](SYSTEM_12_documents_sharing.md)    | Documents & Sharing                      | slide decks + reports + dashboards + public viewer + exports                               |
| [S13](SYSTEM_13_ai_assistant.md)         | AI Copilot & Usage Governance            | Anthropic proxy + governance + ~40 browser tools via the AIContext contract                |
| [S14](SYSTEM_14_client_shell.md)         | Client Shell & Session                   | SPA boot, page maps, language/calendar singletons, UI prefs, help chrome                   |
| [S15](SYSTEM_15_admin_ops.md)            | Instance Administration & Ops            | users/roles, project lifecycle, health, backups, disk autonomics, deploy                   |
| [S00](SYSTEM_00_kernel.md)               | Kernel (read but don't own)              | lib mega-barrel, multi-domain grab-bags, the env nexus — everyone's dependency             |

Cross-cutting docs (conventions, not code ownership):
[CROSS_UI_CONVENTIONS.md](CROSS_UI_CONVENTIONS.md),
[CROSS_CLIENT_STATE.md](CROSS_CLIENT_STATE.md).

## System details

The scope / contract / size for each system. The `globs:` frontmatter in each
`SYSTEM_NN_*.md` is the machine-checked manifest; this is the prose. Sub-file
custody exceptions are in §4.1.

### S1. API Contract, Transport & Access Control

- **One line:** the typed RPC registry both tiers are generated from, plus the
  two permission guards that scope every request.
- **Scope:** `lib/api-routes/**`; `server/routes/{route-helpers,route-tracker,streaming}.ts`;
  `server/middleware/**`; `server/project_auth.ts`; `main.ts` (composition
  root: mounting, onError envelope); `client/src/server_actions/**`;
  `lib/types/{permissions,permission_labels,streaming}.ts`; `lib/h_users.ts`;
  the APIResponse envelope symbols in `lib/types/instance.ts`;
  `server/db/instance/users.ts` + `routes/instance/users.ts` (the rows the
  guards evaluate); client session: `LoggedInWrapper.tsx` (Clerk singleton).
- **Contract:** ~255 registry routes, zero direct client↔server imports;
  errors as HTTP 200 + `{success:false}` (only guards emit real 4xx/5xx);
  `Project-Id` header mints the per-project DB handle. Owns the inventory of
  ~30 off-registry endpoints (health, TUS, SSE, AI proxy, public dashboard,
  export_central, CSV exports) — each owned by its home system.
- **Size:** ~85 files. **Docs:** DOC_API_ROUTES, DOC_ACCESS_CONTROL.

### S2. Persistence Core & Schema Lifecycle

- **One line:** Postgres connection machinery for the multi-DB model,
  migrations + JSON data transforms, fail-stop boot, backup/restore mechanics.
- **Scope:** `server/db/postgres/**`, `db/utils.ts`, `db/error_classifier.ts`,
  db barrels, `db/migrations/**` (runner + SQL + transforms — transform
  *mechanics* owned here, each transform's *schema knowledge* co-reviewed by
  its domain system), base schemas + `_main_database_types.ts` /
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
  t2 caches), `state/*/t1_store.ts` + `t1_sse.tsx`, `clear_caches.ts`, the
  version flush in LoggedInWrapper;
  `lib/types/{project_sse,instance_sse,project_dirty_states}.ts`;
  `components/project/project_cache.tsx`.
- **Contract:** every mutation must stamp `last_updated` and notify — but that
  obligation lives in ~26 files owned by other systems. This system's
  *machinery* is reviewed here; its *convention* is a standing audit (§4.3.1).
- **Size:** ~40 files. **Docs:** DOC_SSE_REALTIME, DOC_VALKEY_CACHE,
  DOC_STATE_RULES + DOC_STATE_MGT_*.

### S4. Assets & Upload

- **One line:** the file-upload front door — the hand-rolled TUS resumable
  upload protocol, asset storage and metadata.
- **Scope:** server: `routes/instance/upload.ts` (TUS protocol, in-memory
  upload map, the deliberately-unauthenticated HEAD-via-GET quirk),
  `routes/instance/assets.ts`, `db/instance/assets.ts`; client:
  `_uppy_file_upload.ts`, `_file_upload_selector.tsx`,
  `components/instance/instance_assets.tsx`; lib: `types/assets.ts`.
- **Contract:** files land in `ASSETS_DIR` via resumable TUS and are referenced
  by metadata rows; the upload HEAD is intentionally unauthenticated (protocol
  resume). Consumed by S6, S12, S13.
- **Size:** ~12 files. **Docs:** none.

### S5. Structure & Reference Data

- **One line:** the instance-wide reference world everything joins against:
  facilities, admin areas, weights, geojson boundaries, indicator dictionaries
  (HMIS/HFA/calculated/ICEH), time points, instance config.
- **Scope:** `server_only_funcs_importing/**` (structure ELT, 6 integrate
  strategies); `db/instance/{structure,hfa_facility_weights,indicators,calculated_indicators,hfa_indicators,hfa_time_points,geojson_maps,config,instance}.ts`;
  `server/geojson/process_geojson.ts`; `routes/instance/{structure,indicators,calculated_indicators,hfa_indicators,hfa_time_points,geojson_maps}.ts`
  + config-mutation routes in `routes/instance/instance.ts`; lib types; client:
  `structure/`, `structure_import/`, `instance_geojson/`,
  `indicator_manager_{hmis,hfa}/`, `instance_hfa_time_points/`,
  `instance_settings.tsx`, `forms_editors/{edit_hfa_indicator,dhis2_credentials_form}.tsx`,
  `state/instance/{t2_structure,t2_indicators,t2_geojson}`.
- **Contract:** authoritative registries (facility FK backbone with named
  DEFERRABLE constraints; indicator mappings drive staging validation; HFA R
  code is EXECUTED by S8's module runs; instance config parameterizes S6's ELT
  and S9's SQL). Snapshots frozen into project DBs at attach time.
- **Size:** ~90 files. **Docs:** DOC_DISAGGREGATION_OPTIONS_HANDLING. The
  structure-ELT mechanics (synchronous streamed model, 100 MB cap, per-family
  staging tables, atomic claim, integrate strategies, 4-level admin-area
  model) were part of the retired DOC_IMPORT_PIPELINE — document them fresh
  in S5's first review cycle.

### S6. Dataset Ingestion

- **One line:** the stage→integrate machinery for the HMIS/HFA/ICEH dataset
  families: wizards, staging workers, upload-attempt state machines, and
  per-project dataset attach/snapshot.
- **Scope:** `db/instance/dataset_{hmis,hfa,iceh}.ts` (orchestrators incl.
  their worker-lifecycle blocks); `worker_routines/{stage_*,integrate_*}/**` +
  `worker_store.ts`; `server_only_funcs_csvs/**`; `routes/instance/{datasets,iceh}.ts`;
  `db/project/datasets_in_project_*.ts` + `calculated_indicators_snapshot.ts`
  (the seam to S8); lib dataset/import types + `table_structures/**`; client:
  `instance_dataset_*` + `*_import` wizards, `_import_wizard/`,
  `PeriodSelector` / `TimeIndexSelector` / `WindowingSelector`,
  `project_data.tsx` + `settings_for_project_dataset_*.tsx` + `staleness_checks.ts`,
  `instance_data.tsx` (switchboard, shared with S5), `state/instance/t2_datasets`.
- **Contract:** one concurrent import per family (single-row attempt rows,
  race-free conditional-UPDATE claims, fixed UNLOGGED staging tables); three
  execution models behind similar UIs (HMIS/HFA workers, ICEH in-process);
  progress by POLLING, not SSE; module dirtying is pull-model (project
  attach/refresh calls `setModulesDirtyForDataset`, not integration).
- **Size:** ~110 files — delegate per family. **Docs:** SYSTEM_06 (prose
  ported + reviewed 2026-07-02), DOC_WORKER_ROUTINES;
  PLAN_IMPORTER_CONSOLIDATION is the active reform.

### S7. DHIS2 Connector

- **One line:** the self-contained typed HTTP adapter for external DHIS2
  instances: auth, retry, paging, analytics, geojson, credentials UX.
- **Scope:** `server/dhis2/**`; `routes/instance/indicators_dhis2.ts`; client
  `Dhis2CredentialsEditor.tsx` + `state/instance/t4_dhis2_session.ts`. Known
  wart: `stage_structure_from_dhis2.ts` re-implements org-unit paging inline.
- **Contract:** every call funnels through `fetchFromDHIS2 → withRetry`
  (5 attempts, backoff+jitter); never-throw boundary; two-phase connection
  validation; no DB writes. Consumed by S6, S5.
- **Size:** ~20 files. The cleanest system. **Docs:** DOC_DHIS2_INTEGRATION.

### S8. Module System

- **One line:** versioned R modules end-to-end: GitHub fetch → validate →
  install/update → dirty-state propagation → Docker/R execution → `ro_*` ingest.
- **Scope:** `server/module_loader/**`; `server/github/**`; ALL of
  `db/project/modules.ts` (install heart *and* the read API) +
  `db/project/results_objects.ts`; `task_management/{mod,set_module_dirty,get_dependents,trigger_runnable_tasks,running_tasks_map,set_module_clean}.ts`;
  `worker_routines/run_module/**` + `instantiate_worker_generic.ts`;
  `server_only_funcs/**` (R-script templating); `server_only_types/mod.ts`;
  `routes/{instance,project}/modules.ts`; lib module types + `module_registry.ts`;
  client: `project_modules.tsx`, `update_module*.tsx`, `view_{files,logs,script}.tsx`,
  `project_module_settings/`, `DirtyStatus.tsx`, `compare_projects.tsx`,
  `metric_details_modal.tsx`. External: wb-fastr-modules repo, Docker images.
- **Contract:** definitions zod-validated at every fetch; compute/presentation
  git-ref split; dirty closure recomputed per event (no stored edges);
  self-draining `task_ended` loop with NO boot-time recovery (known gap);
  outputs `ro_*` + `metrics` + `last_run_at` — the data spine S9 queries.
- **Size:** ~50 files. **Docs:** DOC_MODULE_EXECUTION, DOC_MODULE_UPDATES,
  DOC_TASK_EXECUTION_DIRTY_STATE, DOC_WORKER_ROUTINES, DOC_POPULATION_CSV.

### S9. Visualization Query & Cache Service

- **One line:** PO config → fetch-config contract → SQL over `ro_*` tables →
  version-hashed cached payloads, on both tiers.
- **Scope:** lib contract: `get_fetch_config_from_po.ts`, `validate_fetch_config.ts`,
  `admin_area_rollup.ts`, ItemsHolder types; server:
  `server_only_funcs_presentation_objects/**`, the query endpoints + cache
  choreography + `getDatasetsVersion` in `routes/project/presentation_objects.ts`,
  `routes/caches/{visualizations,dataset}.ts` (instances + PO_CACHE_VERSION),
  `routes/project/cache_status.ts`, `db/project/{metric_enricher,results_value_resolver}.ts`;
  client: the cache/query halves of `state/project/{t2_presentation_objects,t2_replicant_options}.ts`.
- **Contract:** `GenericLongFormFetchConfig` is THE client→server query
  contract; `hashFetchConfig` is cache identity on both tiers; roll-up gates
  single-sourced in lib; Ethiopian calendar alters both bounds and generated SQL.
- **Size:** ~40 files, logic-dense. **Docs:**
  DOC_PRESENTATION_OBJECT_QUERY_PIPELINE, DOC_period_column_handling,
  DOC_DISAGGREGATION_OPTIONS_HANDLING, DOC_ROLLUP_ROWS, DOC_VALKEY_CACHE.

### S10. Figure Rendering & Export Engine

- **One line:** pure transforms from data+config to pixels and files:
  FigureInputs assembly, strip/hydrate snapshots, slide→page rendering,
  PDF/PPTX/XLSX/DOCX export.
- **Scope:** `client/src/generate_visualization/**` (incl. strip/hydrate,
  special chart modes, GLOBAL_STYLE_OPTIONS); `generate_slide_deck/**`
  (`convertSlideToPageInputs`); `client/src/exports/**` (incl.
  `get_table_export_aoa.ts`); the plain figure resolvers to extract from
  `slide_deck/slide_ai/`; lib render contracts (`json_slide_serialize.ts`,
  `brand_presets.ts`, `key_colors.ts`, slide-font types); `font-map.json` +
  `/fonts`; `state/project/t2_images.ts`.
- **Contract:** one renderer per artifact class shared by screen and export;
  stored snapshots are stripped FigureInputs re-hydrated at render; panther
  `zFigureInputs` binds stored figures to panther schema versions (repair arm
  is S2's `_figure_block.ts` transform — co-reviewed).
- **Size:** ~55 files. **Docs:** DOC_SPECIAL_CHART_MODES, DOC_DESIGN_SYSTEM.

### S11. Visualization Authoring UI

- **One line:** the live PO editor (edit/create/ephemeral modes), the
  visualization library, and PO CRUD with conflict resolution.
- **Scope:** `components/visualization/**`; `PresentationObjectPanelDisplay` /
  `MiniDisplay` / `ReplicateByOptions` / `NotAvailableBox` /
  `_editor_snapshot.ts`; `components/project/add_visualization/**` +
  `preset_preview.tsx` + `project_visualizations.tsx` + `project_metrics.tsx`
  + `edit_folder_modal.tsx` + `move_to_folder_modal.tsx`; forms_editors viz
  modals; the FigureInputs assembly half of `t2_presentation_objects.ts`;
  server PO/folder CRUD (`db/project/{presentation_objects,visualization_folders}.ts`
  + both route files); lib: `normalize_po_config.ts`, `convert_visualization_type.ts`,
  PO config type families, `lib/utils.ts` (withReplicant).
- **Contract:** the three-mode editor (notably *ephemeral* mode) is the
  authoring surface dashboards/slides/reports/AI plug into; save path
  normalizes + enforces `expectedLastUpdated` conflict protocol; registers live
  mutators into AIContext. Known fragility: the manually-enumerated reactive
  reads in the refetch effect.
- **Size:** ~40 files. **Docs:** DOC_DESIGN_SYSTEM, DOC_STATE_RULES.

### S12. Documents & Sharing

- **One line:** the three figure-snapshot-embedding artifact types — slide
  decks, markdown reports, and dashboards — plus the public slug-addressed
  viewer and all PDF/PPTX/XLSX/DOCX/email exports.
- **Scope:** client: `components/slide_deck/**` minus `slide_ai/`,
  `layout_editor/`, `components/report/**`, `components/dashboards/**`,
  `components/public_viewer/**`; the deck/report/dashboard list pages + modals
  in `components/project/`; `state/project/{t2_slides,t2_dashboards}.ts`;
  server CRUD (`db/project/{slides,slide_decks,move_slides,slide_deck_folders,reports,report_folders,dashboards}.ts`
  + routes), `db/instance/dashboard_slugs.ts`, `routes/public/dashboard.ts` +
  the `/d/:slug` SPA-HTML in `main.ts`, `routes/project/emails.ts`,
  `server/utils/id_generation.ts` (hardcodes 7 tables — flagged); lib slide/
  report/dashboard types incl. `buildPublicDashboardBundle`.
- **Contract:** all three persist CLIENT-built stripped FigureBlock snapshots
  (server never recomputes figures); shared figure-snapshot lifecycle owned
  upstream by S10; three concurrency philosophies; the public viewer is the
  app's only unauthenticated product surface (reviewed as cross-cutting audit
  §4.3.9).
- **Size:** ~115 files; the largest undocumented system. **Docs:** none.

### S13. AI Copilot & Usage Governance

- **One line:** the Anthropic proxy with token-limit governance, plus the
  browser-side copilot: ~40 client-executed tools mutating app state only
  through the AIContext contract.
- **Scope:** server: `routes/project/{ai_proxy,ai_files,ai_tools}.ts`,
  `db/instance/{ai_usage_logs,custom_prompts}.ts`,
  `routes/instance/custom_prompts.ts`; client: `components/project_ai/**`,
  the AI-specific half of `slide_deck/slide_ai/`, `state/project/t4_ai_documents.ts`;
  lib: `types/{ai_input,custom_prompts}.ts`.
- **Contract:** tools execute IN THE BROWSER through the same serverActions/
  caches as the human UI (AI inherits user permissions for free); editors
  expose live mutators via the AIContext discriminated union; only model calls
  traverse the proxy (limits enforced server-side; usage parsed from Anthropic
  SSE events).
- **Size:** ~60 files. **Docs:** DOC_AI_PROXY_AND_USAGE_GOVERNANCE,
  DOC_AI_TOOL_SCHEMAS.

### S14. Client Shell & Session

- **One line:** SPA boot, the signal-based page maps (almost no URL routing),
  language/calendar singleton lifecycle, UI preferences, connection and help
  chrome.
- **Scope:** `client/src/{index.tsx,app.tsx,app.css}`, `routes/index.tsx`,
  `components/instance/index.tsx` + `components/project/index.tsx` (the page
  maps), `state/{t4_ui,t4_connection_monitor}.ts`, `ConnectionStatus.tsx`,
  `HelpButton.tsx` + `lib/help/**` + `build_help_buttons.ts`, onboarding modals,
  `components/_shared/**`, `lib/translate/**` (the singletons), `FRONTEND_STYLE_GUIDE.md`.
- **Contract:** deterministic boot order (panther globals + language/calendar
  BEFORE first render; GLOBAL_STYLE_OPTIONS deep-imported from S10 is
  load-bearing); only two URL-addressable surfaces (`/d/:slug`, `?p=`); UI
  prefs persist via localStorage and never enter fetch configs or cache hashes.
- **Size:** ~30 files + the 237-file `t3` call-site surface. **Docs:**
  DOC_TRANSLATION, DOC_HELP_BUTTONS, DOC_BUILD_INSTRUCTIONS, DOC_DESIGN_SYSTEM,
  DOC_STATE_RULES.

### S15. Instance Administration & Ops

- **One line:** user/role management, project lifecycle, instance settings UI,
  plus the operational side-channel: health endpoints, backups, disk
  autonomics, emails, central export, scheduled jobs, deploy.
- **Scope:** client: `components/instance/**` minus index.tsx and
  instance_assets.tsx, `project_settings.tsx` + `copy_project.tsx` +
  `create_backup_form.tsx` + `restore_from_file_form.tsx`, role/permission
  forms_editors; server: `routes/project/project.ts` (lifecycle + roles),
  `routes/instance/{instance,health,backups,export_central}.ts` (backups
  *proxy* here, restore *mechanics* S2), `db/project/projects.ts` (registry +
  roles halves), `db/instance/user_logs.ts`, `server/utils/disk_space.ts`,
  `exposed_env_vars.ts`, cron jobs in `main.ts`; repo: `./run`, `./deploy`,
  Dockerfile. External: status-api, SendGrid, the ~40-instance production topology.
- **Contract:** writes the permission rows S1 evaluates; sole creator/destroyer
  of project DBs; health is deliberately unauthenticated (exposure inventory
  must stay deliberate — PLAN_HARDEN_SECURITY); out-of-band side effects
  invisible to the route registry.
- **Size:** ~50 files; small server surface, highest privilege.
  **Docs:** DOC_ACCESS_DBS, DOC_ACCESS_CONTROL.

## §4.1 Shared-custody files

Files where systems genuinely meet inside one file. Rule: ONE owner reviews the
whole file; the others are mandatory readers of their slice. (The Seam column
gives the reason each file is shared; this table is the authoritative custody
list.)

| File                                                                    | Owner | Mandatory readers | Seam                                                  |
|-------------------------------------------------------------------------|-------|-------------------|-------------------------------------------------------|
| `server/db/project/projects.ts`                                         | S15   | S2, S1, S8        | four systems in 1,108 lines                           |
| `server/routes/project/project.ts`                                      | S15   | S6, S8            | 18 routes, three systems                              |
| `server/routes/project/presentation_objects.ts`                         | S9    | S11, S3           | queries / CRUD / cache interleaved                    |
| `server/routes/caches/visualizations.ts`                                | S9    | S3, S2            | cache instances + PO_CACHE_VERSION                    |
| `client/src/state/project/t2_presentation_objects.ts`                   | S9    | S10, S3           | hottest client file (20 importers)                    |
| `server/db/instance/dataset_hmis.ts` / `dataset_hfa.ts`                 | S6    | S2, S8            | orchestrator + worker lifecycle + CRUD                |
| `server/db/project/modules.ts`                                          | S8    | S2, S9, S13       | install heart + read API (~540+)                      |
| `main.ts`                                                               | S1    | S2, S15, S12      | composition root (boot / cron / `/d/:slug`)           |
| `client/src/components/LoggedInWrapper.tsx`                             | S1    | S3, S14           | Clerk singleton + version flush + shell               |
| `server/routes/instance/backups.ts`                                     | S15   | S2                | restore body (DROP/CREATE + re-migrate)               |
| `lib/translate/t-func.ts`                                               | S14   | S9                | calendar semantics (17 lines, two systems)            |
| `server/task_management/mod.ts`                                         | S8    | S3                | barrel re-exports the notify hub                      |
| `server/routes/instance/users.ts` · `server/db/instance/users.ts`       | S1    | S15, S13          | guard rows + admin handlers + token governance        |
| `server/server_only_types/mod.ts`                                       | S8    | S1, S3, S9        | 20 lines, three systems — physical-split candidate    |
| `server/routes/instance/instance.ts` · `server/db/instance/instance.ts` | S5    | S15, S6           | config routes + meta/projects/disk + dataset versions |
| `_file_upload_selector.tsx` · `_uppy_file_upload.ts`                    | S4    | S6, S5, S12, S15  | shared upload primitives                              |
| `server/db/project/results_objects.ts`                                  | S8    | S9                | `ro_*` read = the S8→S9 data spine                    |
| `client/src/components/project/staleness_checks.ts`                     | S6    | S8                | also exports `checkModulesNeedUpdate`                 |
| `client/src/components/instance/instance_data.tsx`                      | S6    | S5                | data-tab switchboard mounting S5 managers             |
| `server/db/instance/config.ts`                                          | S5    | S6, S9            | instance config parameterizes ELT + generated SQL     |
| `lib/types/project_dirty_states.ts`                                     | S3    | S8                | `DirtyOrRunStatus` drives the dirty machine           |

## §4.2 Kernel — read but don't own

`SYSTEM_00_kernel.md` claims these six. They are everyone's dependency and no
one's system; review them only alongside the consuming system, and any change
needs a cross-system check.

`lib/mod.ts`, `lib/types/mod.ts`, `lib/types/instance.ts`, `lib/consts.ts`,
`lib/utils.ts`, `server/exposed_env_vars.ts`.

## §4.3 Cross-cutting audits (tasks, not systems)

Audits that by construction read many systems' files; they need their own briefs
with license to read everything.

1. Notify/stamp coverage · 2. Guard-per-route sweep · 3. Runtime-validation
posture · 4. Version-hash ingredient completeness · 5. Calendar semantics ·
2. t3 literal correctness · 7. Migration data-transform pairing · 8. Cross-repo
lockstep discipline · 9. Public / unauthenticated surface.

## §5 Execution model

Two streams interleave: **define/document** (this map → SYSTEM files) and
**change code** (fixes driven by findings + refactors toward the map). The
engine is the per-system cycle **review → triage → fix → document** — a SYSTEM
file's prose is the artifact of that cycle. Genuinely horizontal work
(hardening, ZOD) gets standalone plans instead.

Every triaged finding either gets fixed in the cycle, gets a one-line entry in
that SYSTEM file's **Open items** section, or — if big enough — gets its own
`PLAN_*` file. The Open items sections are the permanent, scoped successor to
ad-hoc `PLAN_*_FIXES` files.

## Running the lint

```
deno run --allow-read --allow-run lint_systems.ts
```

Green = every tracked `.ts`/`.tsx` under `server/`, `lib/`, `client/src/`
(+ `main.ts`) is claimed by exactly one system. Add a new file → it shows as an
ORPHAN until a SYSTEM file's `globs:` claims it.
