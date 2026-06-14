# Plan: Project Self-Containment — Snapshot Instance Inputs into the Project

## Status: DRAFT (review/thinking) — grounded in a verified enumeration sweep; no implementation

> Vision / end-state: [VISION_PROJECT_SNAPSHOT.md](VISION_PROJECT_SNAPSHOT.md). This plan is
> Step A toward it.

**North star (Tim):** the project becomes a fully self-contained, self-describing,
transportable unit. *No viz / slide-deck / report / dashboard / AI artifact reads
instance-level (main-DB) data or client `instanceState` at query/render/export time.*

**The right mental model (Tim):** the project snapshot is a frozen
**`(results inputs, results outputs)` pair** — the whole module-execution closure at one
version. "inputs" spans **module-execution inputs** (datasets, params) *and*
**presentation-time inputs** (structure, config, labels) that the viz/query layer reads.
Layer 3 reads **outputs for data, inputs for labels/structure/filters** — both halves from
the snapshot, never from live instance.

**Three layers:** (1) instance data — raw uploads, instance config, structure master;
(2) **project snapshot** — `(inputs, outputs)`, transportable; (3) viz/decks/reports/
dashboards — read only (2).

This is **Step A** of that vision. Steps B/C (structure self-containment with
snapshot-local ids; serialization / attach-detach) are scoped at the end as the path to
the portable unit. N1 (from PLAN_S9_QUERY_CACHE_FIXES.md) is folded in here.

> Inventory below is from a 5-agent read-only enumeration sweep (server query path,
> structure/indicators, reports/decks/dashboards/AI, client `instanceState`, DB-schema
> baseline), harness/grep-cited. It is single-pass (not adversarially verified like the S9
> findings); items needing confirmation are marked.

---

## The pattern that already exists — reuse it, don't reinvent

The codebase already implements "snapshot instance data into the project," for **datasets**:

- `addDatasetHmis/Hfa/IcehToProject` ([datasets_in_project_hmis.ts](server/db/project/datasets_in_project_hmis.ts) etc.) run **one atomic txn** that: writes a sandbox CSV, **UPSERTs a project `datasets` row** carrying an `info` JSON blob + a fresh `last_updated`, and **repopulates mirror tables** (project `indicators`, `facilities_hmis/hfa`, `calculated_indicators_snapshot`, the 5 `hfa_*_snapshot` tables, `iceh_indicators_snapshot`).
- The **project-local version stamp** is `datasets.last_updated`; `getDatasetsVersion` ([presentation_objects.ts:61-71](server/routes/project/presentation_objects.ts#L61-L71)) folds it into the PO Valkey cache keys.
- `datasets.info` is already a home for **small config flags** — `facilityColumnsConfig` and `maxAdminArea` **already live there**.
- **FigureBundle** ([_figure_bundle.ts](lib/types/_figure_bundle.ts)) is the same pattern for *layer-3 stored artifacts*: localization (language/calendar/countryIso3) and map `geo.data` are **baked into the stored bundle at capture**; `buildFigureInputs` reads only `bundle.localization` ("no ambient singletons"). Stored slides/dashboards/reports are **already self-contained** for these.
- **Dashboards** already snapshot geojson: `geo_data` per `dashboard_item` / `dashboard_item_group` in the project DB.

**Two reusable homes for a snapshot:** (a) `datasets.info` blob + `datasets.last_updated`
stamp (for small config consumed at export *or* query time); (b) a mirror table
repopulated in the export txn (for row sets). **One reusable cache rule:** fold the
project-local stamp into the cache version key.

---

## The core diagnosis

Existing coverage is **strong for export-time-consumed inputs** (indicators, taxonomy,
facilities, weights, mappings — all snapshotted + folded via `datasets.last_updated`) and
**for stored layer-3 artifacts** (FigureBundle). Two gaps remain:

1. **Render/query-time inputs that are snapshotted but bypassed, or not folded into the cache key.** The datasets precedent only guarantees coherence for things consumed *at export*; inputs read *at query/render time* (facility config, geojson, admin labels) aren't in the PO cache version, so an instance change doesn't invalidate.
2. **The geojson capture race** — non-dashboard map figures read instance geojson *live* at render, and stored bundles can be frozen as `geo.kind:'level'` (a live pointer) when capture outran the preload.

---

## Inventory — ranked

### Covered (no action — documents the target pattern)
Datasets, calculated/HFA/ICEH indicators, project `indicators`, facilities, HFA weights,
indicator-mappings (build-time transform), `maxAdminArea` (frozen into exported columns +
immutable while populated) — all snapshotted + folded via `datasets.last_updated`.
FigureBundle localization + `geo.data` for **stored** artifacts. Dashboard `geo_data`.

### Stragglers — drift, in scope
| # | Item | Instance source | Read at | Fix shape | Cost |
|---|------|-----------------|---------|-----------|------|
| S1 | **Facility-columns config** (= N1) | `instance_config` `facility_columns`; **already mirrored in `datasets.info.facilityColumnsConfig`** | PO query/detail/results-value (server, **live mainDb**) | **Consume the existing `datasets.info` snapshot, not live config** + fold a facility-flags version into the 4 PO cache keys (server+client) | small (no new storage) |
| S2 | **GeoJSON maps (viz/deck/report figures)** | `geojson_maps` (main DB) → client `instanceState` `t2_geojson` | `build_figure_inputs.ts:175` at figure build (live) | force `geo.kind:'data'` capture (await preload) + project-geojson snapshot for the non-dashboard path + drift-repair sweep for stored `kind:'level'` bundles | **large** |
| S3 | **admin_area_labels config** | `instance_config` `admin_area_labels`; **no snapshot anywhere** | module load + AI metric list; **render-path usage UNCONFIRMED** | confirm render usage first; if used, add to `datasets.info` (or tiny project config) + cache-fold | small |
| S4 | **countryIso3** (public dashboard label cleaning) | `getCountryIso3Config(mainDb)` per public request | `routes/public/dashboard.ts:57` | read from the bundle's own `localization.countryIso3` (already captured) — eliminates the live read | tiny |
| S5 | **Image-asset binaries** (slide/dashboard/report images & logos) | shared instance assets dir; only `imgFile` *name* stored project-side | export/render (live URL fetch) | per-project asset snapshot + re-point URL builder; or defer | **large (binaries)** |
| S6 | **projects.ai_context** | main DB `projects.ai_context` | AI prompt build | borderline — only matters if AI artifacts become *stored*; AI is ephemeral today | small |

### Out of scope (confirmed n/a)
- **Calendar** — env-fixed (`INSTANCE_CALENDAR`), identical for all projects, can't drift under a running project. (Only relevant if a snapshot is ever opened by a different-calendar instance — a Step-C portability concern.)
- **AI token governance** (daily/weekly limits, usage logs) — instance-wide by definition.
- **Dashboard slugs** — intentionally global (cross-project uniqueness for `/d/:slug` routing); the entry *key* into the project, not data it renders.
- **AI chat context** — ephemeral conversational; reading live `instanceState` is correct (no stored artifact to drift; verified no stored AI interpretation exists).

---

## The key refinements the sweep produced

1. **N1/S1 is "consume the snapshot," not "build one."** The facility-columns config is *already* in `datasets.info.facilityColumnsConfig` (frozen at export, matching the physically-exported facility columns). The PO query pipeline ([get_query_context.ts:34](server/server_only_funcs_presentation_objects/get_query_context.ts#L34), [get_results_value_info.ts:32](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L32), [presentation_objects.ts:186](server/db/project/presentation_objects.ts#L186)) instead re-reads **live mainDb** config. Reading the snapshot is **more correct** (it matches the frozen data; live config can reference columns the snapshot doesn't have) *and* makes the cache coherent.

2. **The pinning question is forced and has a clean answer.** A facility-columns config change today does **not** re-export datasets, so the snapshot pins to last integration. Treat facility config as a **results-input**: a config change should trigger re-export/re-integration (refreshing columns + `datasets.info` + `last_updated`), which auto-invalidates the cache. Reading the snapshot (not live) keeps query-vs-data coherence in the interim.

3. **Layer 3 is mostly done already** via FigureBundle — the remaining artifact-render leak is essentially just geojson (S2). Localization/countryIso3 are baked in; the public-dashboard `countryIso3` read (S4) is the one server-side artifact leak and is cheap to remove.

4. **The general cache rule (CLAUDE.md):** every input newly *consumed at render/query time* must be folded into the project cache version key, **server + client byte-identical**. Export-time-only inputs are already covered by `datasets.last_updated`.

---

## Sequencing

### Step A — close render/query-time drift (near-term, cheap, this is where N1 lands)
- **S1/N1:** repoint the PO pipeline to read `datasets.info.facilityColumnsConfig`; fold a facility-flags version stamp into the 4 PO cache keys (server `caches/visualizations.ts` + client `moduleDataVersionKey`); decide the propagation trigger (a facility-config change → re-export). Closes the confirmed HIGH drift.
- **S4:** public-dashboard label cleaning reads `bundle.localization.countryIso3` instead of `getCountryIso3Config(mainDb)`.
- **S3:** confirm admin_area_labels render-path usage; snapshot + cache-fold only if used at render.
- **Constraint:** do not bake instance FKs into any new project-side field (Step B/C need snapshot-local ids).

### Step B — structure self-containment + the large snapshots (portability enabler)
- **S2 geojson:** force `geo.kind:'data'` capture for stored bundles; add a project-geojson snapshot (per-level table or per-figure embed, see open question) for the viz/deck/report path to reach dashboard parity; drift-repair sweep for stored `kind:'level'` bundles.
- **Structure with snapshot-local stable ids** — the broader portability move (today facilities denormalize admin-area *names* but the unit must not depend on instance id space).
- **S5 image binaries:** per-project asset snapshot (if in scope).

### Step C — serialization / attach-detach
- Self-describing schema/version + provenance metadata; export/import (zip / `pg_dump` / logical); identity independence so a snapshot attaches to any project/instance. Meaningful only because Steps A/B make the project DB the complete source.

---

## Open questions / decisions for Tim
1. **Geojson storage (S2):** per-figure embed (`geo.data`, the dashboard pattern — heavy duplication) **vs** a single project-level `geojson_by_level` snapshot table + stamp (DRY, but new structure). Recommend the project-level table.
2. **Image binaries (S5):** in scope for Step B, or deferred? Large, and most are static FASTR logos (no drift); only user-uploaded images genuinely drift.
3. **ai_context (S6):** in scope? Only matters if AI interpretations become stored artifacts (none today).
4. **S1 propagation:** should a facility-columns config change auto-trigger re-export for all projects (live propagation), or is "pinned to last integration" acceptable (the pinning model the datasets pattern already implies)?
5. **admin_area_labels (S3):** needs a render-path-usage confirmation pass before deciding.

## Hard rules
- **Reuse the datasets pattern** (export-txn + `datasets.info`/mirror table + `last_updated` stamp + cache fold). Don't invent parallel machinery.
- **Render/query-time inputs must be folded into the project cache version key** (server+client identical) — snapshotting alone doesn't fix caching.
- **No instance FKs in layer-2 fields** — Step B/C portability needs snapshot-local stable ids; don't bake them in during Step A.
- **No payload-SHAPE change without a cache-prefix bump** (CLAUDE.md); the S1 facility-flags fold is a version-KEY change (one-time invalidation), not a shape change.
- **Verify by executing**, and **report-only until per-step go-ahead** — this is a plan.
