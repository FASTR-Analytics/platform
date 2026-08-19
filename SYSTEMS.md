# Systems map — wb-fastr

> Canonical topology: 17 systems (+ a read-but-don't-own kernel). This is the
> canonical index: the map, the custody table, the kernel rule, the
> cross-cutting audits, the execution model, and the documentation model.
> Each system's description — scope, contract, prose — lives in its own
> `SYSTEM_NN_*.md` file, whose `globs:` frontmatter is the machine-checked
> manifest (`lint_systems.ts` asserts every tracked file is claimed by
> exactly one system). The old `DOC_*` set is fully absorbed into these
> files (completed 2026-07-17); every SYSTEM file holds verified prose.

## The map

Platform machinery (1–3), data in (4–7), compute (8), visualization (9–11),
artifacts (12), assist (13), frame (14–15), realtime collaboration (16),
observability (17).

| #                                        | System                                   | One line                                                                                   |
|------------------------------------------|------------------------------------------|--------------------------------------------------------------------------------------------|
| [S1](SYSTEM_01_api_contract.md)          | API Contract, Transport & Access Control | typed RPC registry both tiers generate from + the two permission guards                    |
| [S2](SYSTEM_02_persistence.md)           | Persistence Core & Schema Lifecycle      | one Postgres DB, SQL + `.ts` migrations, data transforms, fail-stop boot                   |
| [S3](SYSTEM_03_realtime_cache.md)        | Realtime Sync & Cache Invalidation       | the last_updated → SSE → version-hash triangle (notify hub, Valkey, client stores)         |
| [S4](SYSTEM_04_assets_upload.md)         | Assets & Upload                          | the TUS file-upload front door + asset storage/metadata                                    |
| [S5](SYSTEM_05_facilities_indicators.md) | Facilities & Indicators                  | facilities, admin areas, weights, geojson, indicator dictionaries, instance config         |
| [S6](SYSTEM_06_ingestion.md)             | Dataset Ingestion                        | stage→integrate for HMIS/HFA/ICEH: wizards, staging workers, the run capture               |
| [S7](SYSTEM_07_dhis2.md)                 | DHIS2 Connector                          | self-contained typed adapter for external DHIS2 (retry, paging, analytics, geojson)        |
| [S8](SYSTEM_08_results_packages.md)      | Results Packages & Module Execution      | versioned R modules → whole-DAG generation into an immutable package (parquet + manifest)  |
| [S9](SYSTEM_09_viz_query_cache.md)       | Visualization Query & Cache Service      | figure config → fetch-config → DuckDB over a package → (runId, scope)-keyed payloads       |
| [S10](SYSTEM_10_figure_render_export.md) | Figure Rendering & Export Engine         | stored FigureBundle → `buildFigureInputs` → panther, slide→page render, PDF/PPTX/XLSX/DOCX |
| [S11](SYSTEM_11_viz_authoring.md)        | Visualization Authoring UI               | the embedded figure editor + the metric/preset wizard + the Explore tab                    |
| [S12](SYSTEM_12_documents_sharing.md)    | Products & Folders                       | the products registry: slide decks + reports, folders, versions, exports                   |
| [S13](SYSTEM_13_ai_assistant.md)         | AI Copilot & Usage Governance            | Anthropic proxy + governance + browser tools via the AIContext contract                    |
| [S14](SYSTEM_14_client_shell.md)         | Client Shell & Session                   | SPA boot, page maps, language/calendar singletons, UI prefs, help chrome                   |
| [S15](SYSTEM_15_admin_ops.md)            | Instance Administration & Ops            | users + instance settings, health, disk autonomics, deploy                                 |
| [S16](SYSTEM_16_collaboration.md)        | Realtime Collaboration & Version History | live Yjs co-editing over one instance WS; rooms checkpoint into S12 tables + S3 notifies   |
| [S17](SYSTEM_17_logging.md)              | Activity Logging & Audit Trail           | `log()` middleware → user_logs raw + weekly aggregate → Users tab, health, Admin-Website   |
| [S00](SYSTEM_00_kernel.md)               | Kernel (read but don't own)              | lib mega-barrel, multi-domain grab-bags, the env nexus — everyone's dependency             |

App-wide conventions that span systems live as `PROTOCOL_APP_*` files (§6),
e.g. [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md) — they own no files in
the manifest.

## §4.1 Shared-custody files

Files where systems genuinely meet inside one file. Rule: ONE owner reviews the
whole file; the others are mandatory readers of their slice. (The Seam column
gives the reason each file is shared; this table is the authoritative custody
list.)

| File                                                                    | Owner | Mandatory readers | Seam                                                                                    |
| ----------------------------------------------------------------------- | ----- | ----------------- | --------------------------------------------------------------------------------------- |
| `server/db/products/**`                                                 | S12   | S2, S16, S3       | registry + per-type detail + versions; collab checkpoints; every write notifies         |
| `server/routes/products/**`                                             | S12   | S16, S3           | room chokepoints, version-history routes, `products_upserted` emits                     |
| `server/routes/instance/run_generation.ts`                              | S8    | S9, S1            | one file, three guard tiers: catalogue/generation, package internals, figure-data reads |
| `server/routes/caches/visualizations.ts`                                | S9    | S3, S2            | cache instances + `PO_CACHE_VERSION`                                                    |
| `client/src/state/products/t2_figure_data.ts`                           | S9    | S11, S10, S3      | the hottest client file: fetch, cache, replicant resolution, figure build               |
| `server/runs/capture_inputs/**`                                         | S6    | S8, S5            | ingestion code inside the generation pipeline: reads main, writes the run workspace     |
| `server/db/instance/dataset_hmis.ts` / `dataset_hfa.ts`                 | S6    | S2, S8            | orchestrator + worker lifecycle + CRUD                                                  |
| `server/db/instance/run_generation.ts`                                  | S8    | S9, S3, S12       | catalogue, the pin, `attachedProducts`, the delete guard                                |
| `main.ts`                                                               | S1    | S2, S15, S12      | composition root (boot / cron / mounts)                                                 |
| `client/src/components/LoggedInWrapper.tsx`                             | S1    | S3, S14           | Clerk singleton + version flush + shell                                                 |
| `lib/translate/t-func.ts`                                               | S14   | S9                | calendar semantics (two systems in one small file)                                      |
| `server/task_management/mod.ts`                                         | S8    | S3                | barrel re-exports the notify hub                                                        |
| `server/routes/instance/users.ts` · `server/db/instance/users.ts`       | S1    | S15, S13          | guard rows + admin handlers + token governance                                          |
| `server/routes/instance/instance.ts` · `server/db/instance/instance.ts` | S5    | S15, S6           | config routes + meta/disk + dataset versions                                            |
| `server/utils/id_generation.ts`                                         | S12   | S2                | the one short-id generator; S2 owns the id-scheme rules                                 |
| `_file_upload_selector.tsx` · `_uppy_file_upload.ts`                    | S4    | S6, S5, S12, S15  | shared upload primitives                                                                |
| `client/src/components/_shared/results_package/**`                      | S8    | S12               | S8 content under S12's `_shared/**` glob                                                |
| `client/src/components/instance/instance_data.tsx`                      | S6    | S5                | data-tab switchboard mounting S5 managers                                               |
| `server/db/instance/config.ts`                                          | S5    | S6, S9, S13       | instance config parameterizes ELT, generated SQL and the copilot's `ai_context`         |
| `server/routes/instance/health.ts`                                      | S15   | S17               | unauthenticated endpoints dump the user_logs tables                                     |
| `server/collab/version_capture.ts`                                      | S16   | S17               | onSessionEnd writes edit-session user_logs rows                                         |

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

## §6 Documentation model

Every doc has one home along two axes — construction (HOW) vs architecture
(WHAT), cross-project vs app-specific:

- `panther/protocols/PROTOCOL_*` — cross-project HOW. Synced from the panther
  repo; never edited here; kept fresh by the sync.
- `PROTOCOL_APP_*` (repo root) — app-specific authoring recipes (e.g.
  PROTOCOL_APP_MIGRATIONS), updated in lockstep with the mechanics they
  describe.
- `SYSTEM_NN_*` — app-specific WHAT. **Prose describes verified current
  behavior and the contract — never aspirations, never history. Deliberate
  limitations are stated as facts in the prose, once. Open items hold only
  real pending work: fixes, decisions-to-be-made, and pointers into reform
  plans. A resolved item is deleted, not annotated — a decision log is
  cruft.** The boundary half (`globs:`) is lint-enforced continuously; the
  prose half is re-verified against code in each review cycle.
- `PLAN_*` — the transient "what's changing" layer. A plan mutates a SYSTEM
  (or a PROTOCOL_APP) and is deleted when its work lands.
- `CLAUDE.md` — the index pointing at all of it.

**Vocabulary.** The nouns every doc, every UI string and every new identifier
uses: **product** (a slide deck or a report — one row in `products`, one id
namespace), **folder** (the flat grouping products sit in), **scope** (a
product's `(package, admin area 2)` pair), **figure** (`{ metricId, config }`
resolved under a scope and stored as a `FigureBundle` inside a product), and
**preset** (a default visualization a package's manifest projects — not a
stored thing). "Project", "dashboard", "data window" and standalone
"visualization" name nothing in this app; do not reintroduce them.
`PresentationObjectConfig` remains the figure-config TYPE name — renaming the
PO vocabulary in code is a separate refactor.

## Running the lint

```
deno task lint:systems
```

Green = every tracked `.ts`/`.tsx` under `server/`, `lib/`, `client/src/`
(+ `main.ts`) is claimed by exactly one system. Add a new file → it shows as an
ORPHAN until a SYSTEM file's `globs:` claims it. The lint is chained into
`deno task typecheck` (which the deploy script gates on), so an unclaimed
file blocks deploy rather than accumulating silently.
