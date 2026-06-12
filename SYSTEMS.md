# Systems map — wb-fastr

> Canonical topology: 15 systems (+ a read-but-don't-own kernel). This is the
> index; each system's scope/contract/manifest lives in its `SYSTEM_NN_*.md`
> file, whose `globs:` frontmatter is the machine-checked manifest
> (`lint_systems.ts` asserts every tracked file is claimed by exactly one
> system). Full rationale and the four candidate schemes considered:
> [PLAN_SYSTEMS.md](PLAN_SYSTEMS.md). Migration of the old `DOC_*` set into the
> SYSTEM files: [PLAN_DOC_CONSOLIDATION.md](PLAN_DOC_CONSOLIDATION.md).
>
> **Phase 1 (current):** the manifest + lint are live; SYSTEM files are stubs.
> **Phase 2:** each system's prose is ported into its file during that system's
> first review cycle.

## The map

Platform machinery (1–3), data in (4–7), compute (8), visualization (9–11),
artifacts (12), assist (13), frame (14–15).

| # | System | One line |
|---|---|---|
| [S1](SYSTEM_01_api_contract.md) | API Contract, Transport & Access Control | typed RPC registry both tiers generate from + the two permission guards |
| [S2](SYSTEM_02_persistence.md) | Persistence Core & Schema Lifecycle | multi-DB Postgres, migrations + data transforms, fail-stop boot, backup/restore |
| [S3](SYSTEM_03_realtime_cache.md) | Realtime Sync & Cache Invalidation | the last_updated → SSE → version-hash triangle (notify hub, Valkey, client stores) |
| [S4](SYSTEM_04_assets_upload.md) | Assets & Upload | the TUS file-upload front door + asset storage/metadata |
| [S5](SYSTEM_05_ingestion.md) | Dataset Ingestion | stage→integrate for HMIS/HFA/ICEH: wizards, staging workers, attach/snapshot |
| [S6](SYSTEM_06_structure_reference.md) | Structure & Reference Data | facilities, admin areas, weights, geojson, indicator dictionaries, instance config |
| [S7](SYSTEM_07_dhis2.md) | DHIS2 Connector | self-contained typed adapter for external DHIS2 (retry, paging, analytics, geojson) |
| [S8](SYSTEM_08_module_system.md) | Module System | versioned R modules: fetch → validate → install → dirty-state → Docker run → ro_* |
| [S9](SYSTEM_09_viz_query_cache.md) | Visualization Query & Cache Service | PO config → fetch-config → SQL over ro_* → version-hashed cached payloads |
| [S10](SYSTEM_10_figure_render_export.md) | Figure Rendering & Export Engine | FigureInputs assembly, strip/hydrate, slide→page render, PDF/PPTX/XLSX/DOCX |
| [S11](SYSTEM_11_viz_authoring.md) | Visualization Authoring UI | the live PO editor (edit/create/ephemeral) + library + PO CRUD |
| [S12](SYSTEM_12_documents_sharing.md) | Documents & Sharing | slide decks + reports + dashboards + public viewer + exports |
| [S13](SYSTEM_13_ai_copilot.md) | AI Copilot & Usage Governance | Anthropic proxy + governance + ~40 browser tools via the AIContext contract |
| [S14](SYSTEM_14_client_shell.md) | Client Shell & Session | SPA boot, page maps, language/calendar singletons, UI prefs, help chrome |
| [S15](SYSTEM_15_admin_ops.md) | Instance Administration & Ops | users/roles, project lifecycle, health, backups, disk autonomics, deploy |
| [S00](SYSTEM_00_kernel.md) | Kernel (read but don't own) | lib mega-barrel, multi-domain grab-bags, the env nexus — everyone's dependency |

Cross-cutting docs (conventions, not code ownership):
[CROSS_UI_CONVENTIONS.md](CROSS_UI_CONVENTIONS.md),
[CROSS_CLIENT_STATE.md](CROSS_CLIENT_STATE.md).

## §4.1 Shared-custody files

Files where systems genuinely meet inside one file. Rule: ONE owner reviews the
whole file; the others are mandatory readers of their slice. (Source:
PLAN_SYSTEMS §4.1, enriched by the manifest verification pass — see that file
for the seam descriptions. This table is the authoritative custody list.)

| File | Owner | Mandatory readers | Seam |
|---|---|---|---|
| `server/db/project/projects.ts` | S15 | S2, S1, S8 | four systems in 1,108 lines |
| `server/routes/project/project.ts` | S15 | S5, S8 | 18 routes, three systems |
| `server/routes/project/presentation_objects.ts` | S9 | S11, S3 | queries / CRUD / cache interleaved |
| `server/routes/caches/visualizations.ts` | S9 | S3, S2 | cache instances + PO_CACHE_VERSION |
| `client/src/state/project/t2_presentation_objects.ts` | S9 | S10, S3 | hottest client file (20 importers) |
| `server/db/instance/dataset_hmis.ts` / `dataset_hfa.ts` | S5 | S2, S8 | orchestrator + worker lifecycle + CRUD |
| `server/db/project/modules.ts` | S8 | S2, S9, S13 | install heart + read API (~540+) |
| `main.ts` | S1 | S2, S15, S12 | composition root (boot / cron / `/d/:slug`) |
| `client/src/components/LoggedInWrapper.tsx` | S1 | S3, S14 | Clerk singleton + version flush + shell |
| `server/routes/instance/backups.ts` | S15 | S2 | restore body (DROP/CREATE + re-migrate) |
| `lib/translate/t-func.ts` | S14 | S9 | calendar semantics (17 lines, two systems) |
| `server/task_management/mod.ts` | S8 | S3 | barrel re-exports the notify hub |
| `server/routes/instance/users.ts` · `server/db/instance/users.ts` | S1 | S15, S13 | guard rows + admin handlers + token governance |
| `server/server_only_types/mod.ts` | S8 | S1, S3, S9 | 20 lines, three systems — physical-split candidate |
| `server/routes/instance/instance.ts` · `server/db/instance/instance.ts` | S6 | S15, S5 | config routes + meta/projects/disk + dataset versions |
| `_file_upload_selector.tsx` · `_uppy_file_upload.ts` | S4 | S5, S6, S12, S15 | shared upload primitives |
| `server/db/project/results_objects.ts` | S8 | S9 | `ro_*` read = the S8→S9 data spine |
| `client/src/components/project/staleness_checks.ts` | S5 | S8 | also exports `checkModulesNeedUpdate` |
| `client/src/components/instance/instance_data.tsx` | S5 | S6 | data-tab switchboard mounting S6 managers |
| `server/db/instance/config.ts` | S6 | S5, S9 | instance config parameterizes ELT + generated SQL |
| `lib/types/project_dirty_states.ts` | S3 | S8 | `DirtyOrRunStatus` drives the dirty machine |

## §4.2 Kernel — read but don't own

`SYSTEM_00_kernel.md` claims these six. They are everyone's dependency and no
one's system; review them only alongside the consuming system, and any change
needs a cross-system check.

`lib/mod.ts`, `lib/types/mod.ts`, `lib/types/instance.ts`, `lib/consts.ts`,
`lib/utils.ts`, `server/exposed_env_vars.ts`.

## §4.3 Cross-cutting audits (tasks, not systems)

Audits that by construction read many systems' files; they need their own briefs
with license to read everything. (Full descriptions: PLAN_SYSTEMS §4.3.)

1. Notify/stamp coverage · 2. Guard-per-route sweep · 3. Runtime-validation
posture · 4. Version-hash ingredient completeness · 5. Calendar semantics ·
6. t3 literal correctness · 7. Migration data-transform pairing · 8. Cross-repo
lockstep discipline · 9. Public / unauthenticated surface.

## §5 Execution model

Two streams interleave: **define/document** (this map → SYSTEM files) and
**change code** (fixes driven by findings + refactors toward the map). The
engine is the per-system cycle **review → triage → fix → document** — a SYSTEM
file's prose is the artifact of that cycle. Genuinely horizontal work
(hardening, ZOD) gets standalone plans instead. Full model: PLAN_SYSTEMS §5.

## Running the lint

```
deno run --allow-read --allow-run lint_systems.ts
```

Green = every tracked `.ts`/`.tsx` under `server/`, `lib/`, `client/src/`
(+ `main.ts`) is claimed by exactly one system. Add a new file → it shows as an
ORPHAN until a SYSTEM file's `globs:` claims it.
