# Plan: Project Self-Containment — Snapshot Instance Inputs into the Project

## Status: NOT IMPLEMENTED. Step A change-set 1 was built + runtime-verified, then **reverted** (2026-06-23) — the per-dataset capture mechanism is incoherent; Step A is to be re-planned around a single canonical whole-project snapshot. Steps B/C are draft/thinking

> Vision / end-state: [VISION_PROJECT_SNAPSHOT.md](VISION_PROJECT_SNAPSHOT.md). This plan is
> Step A toward it.

## Handoff (2026-07-07) — proposed path + lessons from the preceding sessions

Written for the next agent picking this up, from the sessions that closed the
S9 review cycle and shipped/retired the geojson near-term plan. This plan is
the agreed next work item.

**Do first, before any of this:** a `./deploy` is pending — the S9 fix batch
and the geojson import-freeze fix are committed but inert until deployed —
followed by the comms note to Angelica (AA3 fixed; AA4 follows in
PLAN_GEOJSON_SNAPSHOT; the import runs one level per run).

**Proposed sequence for this plan:**

1. **Settle the one genuinely unresolved design question (below), with Tim.**
   Everything else in Step A is analyzed and settled: the four read sites, the
   cache fold (change-sets 2+3 stand as written), the snapshot home
   (Q6: recommend the general `project_config` KV), the backfill source (Q6),
   pinned-not-propagated semantics (Q4).
2. **Rewrite change-set 1** around the chosen capture shape, then implement —
   change-sets 2+3 are small once 1 exists. Then SNAP-4 (tiny, independent).
3. **Then Step B** (geojson) via [PLAN_GEOJSON_SNAPSHOT.md](PLAN_GEOJSON_SNAPSHOT.md) —
   note its WS-COVERAGE prerequisite (inherited from the retired near-term
   plan) gates the WS-KEY backfill, and its §6 now records verified live
   DHIS2 API facts your capture/backfill code inherits.

**The unresolved question (why change-set 1 was reverted, restated
precisely):** per-dataset capture failed because importing one dataset
re-snapshots the config governing ALL the project's data. But note the
tension with Q4's "applies on next integration": even with a single
project-level config row, a one-family import (say HMIS) would flip the
config that queries apply to the OTHER family's mirrors (facilities_hfa was
exported under the OLD flags — [datasets_in_project_hfa.ts:90](server/db/project/datasets_in_project_hfa.ts#L90)
writes enabled columns at export time), recreating query-vs-data divergence
within the project. Two coherent shapes to put to Tim:
(a) **any integration atomically re-captures the whole input set** — config +
re-export of every attached family's mirrors in one txn (a true
whole-project snapshot; makes attach heavier, possibly worker-shaped);
(b) **config captured at project creation, changed only by an explicit
whole-project refresh action** (per-family attach stays light; config
changes become a deliberate project-level act). NEXT_STEPS' phrasing
("capture all inputs… locked and hashed at one point in time") leans (a).
Do not write storage code before this ruling.

**Transferable lessons from the S9 + geojson sessions (hard-won, all
verified):**

- **Reverify plans before implementing them.** The geojson plan's central API
  assumption (`featureType`) was dead on the live DHIS2 2.40 instances; the
  S9 fixes plan had two fixes that were backwards until adversarial
  re-verification. Tim's "don't trust it, it was hastily written" applies to
  every plan here, including this one.
- **Verify by executing:** `deno run --allow-all --env-file=.env -c deno.json
  /tmp/harness.ts` runs lib/server functions directly; a throwaway
  `docker run postgres:16-alpine` settles SQL-semantics questions; live
  API creds (when provided for testing) settle API questions. Byte/value
  equivalence harnesses before/after refactors caught real regressions.
- **Cache discipline (this plan's core mechanism):** version-KEY changes are
  cheap (one-time miss); payload-SHAPE changes need a key-prefix bump;
  meaning changes need a `PO_CACHE_VERSION` bump (currently "4");
  `versionHashFromParams`/`parseData`/client `versionKey` must stay
  byte-identical; display-only values never go in hashes. See
  SYSTEM_09_viz_query_cache.md "Caching".
- **N1 is fixed HERE, not standalone** (the S9 Tier-0 ruling) — a standalone
  facility-flags cache fold would re-cement the live-read coupling this plan
  removes.
- **After changing behavior, grep the SYSTEM_* docs for the files you
  touched.** The lint only enforces the glob manifests; prose staleness is
  manual (S5's geojson prose went silently stale within four days of its
  review cycle).
- **Working-tree hygiene:** Tim commits in parallel (HFA work interleaved
  mid-batch twice); check `git status` before staging, expect
  rebase-then-push (a CI changelog bot commits to origin/main after
  deploys). Commit per verified unit; never create branches.
- **Dev traps:** the server has no `--watch` (restart to pick up server/lib
  changes); client IndexedDB caches flush on deploy only, so dev needs
  manual site-data clears to see server-side fixes.

Parked items waiting on Tim, tracked elsewhere: F8a (Ethiopian
fiscal-quarter confirmation) and F8c in SYSTEM_09 Open items; upload-cap
policy + sessionStorage password store in SYSTEM_04/05 Open items;
NEXT_STEPS.md is the queue index.

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
the portable unit. N1 (from the S9 review; see SYSTEM_09 Open items) is folded in here.

> Inventory below is from a 5-agent read-only enumeration sweep (server query path,
> structure/indicators, reports/decks/dashboards/AI, client `instanceState`, DB-schema
> baseline), harness/grep-cited. It is single-pass (not adversarially verified like the S9
> findings); items needing confirmation are marked. **Step A (SNAP-1/SNAP-3/SNAP-4) was code-verified
> 2026-06-23** — the SNAP-1 row and refinement 1 below carry the corrected premise (the config
> is *not* a pure "consume the existing snapshot"; HFA/ICEH lack it → project-level capture).

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
| SNAP-1 | **Facility-columns config** (= N1) | `instance_config` `facility_columns`; mirrored in `datasets.info.facilityColumnsConfig` **only for HMIS** — **HFA stores just a hash, ICEH nothing** (verified 2026-06-23) | PO query/detail/results-value **+ AI metric list** (4 sites, server, **live mainDb**) | **Capture a project-level config snapshot** (one per project, at integration) → repoint the 4 reads to it → fold `datasetsVersion` into `_PO_DETAIL` (the other 3 PO caches already fold it) | small (one project-level snapshot) |
| SNAP-2 | **GeoJSON maps (viz/deck/report figures)** | `geojson_maps` (main DB) → client `instanceState` `t2_geojson` | `build_figure_inputs.ts:175` at figure build (live) | force `geo.kind:'data'` capture (await preload) + project-geojson snapshot for the non-dashboard path + drift-repair sweep for stored `kind:'level'` bundles | **large** |
| SNAP-3 | **admin_area_labels config** | `instance_config` `admin_area_labels`; no snapshot | **module load + AI metric list + client editor display labels ONLY — NOT the query/render path (verified 2026-06-23)** | **none for Step A** — display-only label, not in any cache key | n/a |
| SNAP-4 | **countryIso3** (public dashboard label cleaning) | `getCountryIso3Config(mainDb)` per public request | `routes/public/dashboard.ts:57` | read from the bundle's own `localization.countryIso3` (already captured) — eliminates the live read | tiny |
| SNAP-5 | **Image-asset binaries** (slide/dashboard/report images & logos) | shared instance assets dir; only `imgFile` *name* stored project-side | export/render (live URL fetch) | per-project asset snapshot + re-point URL builder; or defer | **large (binaries)** |
| SNAP-6 | **projects.ai_context** | main DB `projects.ai_context` | AI prompt build | borderline — only matters if AI artifacts become *stored*; AI is ephemeral today | small |

### Out of scope (confirmed n/a)
- **Calendar** — env-fixed (`INSTANCE_CALENDAR`), identical for all projects, can't drift under a running project. (Only relevant if a snapshot is ever opened by a different-calendar instance — a Step-C portability concern.)
- **AI token governance** (daily/weekly limits, usage logs) — instance-wide by definition.
- **Dashboard slugs** — intentionally global (cross-project uniqueness for `/d/:slug` routing); the entry *key* into the project, not data it renders.
- **AI chat context** — ephemeral conversational; reading live `instanceState` is correct (no stored artifact to drift; verified no stored AI interpretation exists).

---

## The key refinements the sweep produced

1. **N1/SNAP-1 is "capture once at the project level," not the pure "consume the existing snapshot" the original sweep assumed (corrected 2026-06-23).** The config is mirrored in `datasets.info.facilityColumnsConfig` **only for HMIS datasets**; **HFA stores just a `facilityColumnsHash`** (can't reconstruct the config) and **ICEH stores nothing** — yet HFA *does* use the optional facility columns ([datasets_in_project_hfa.ts:90](server/db/project/datasets_in_project_hfa.ts#L90) exports them; [metric_enricher.ts:121-148](server/db/project/metric_enricher.ts#L121-L148) gates disagg options on them). So an HFA/ICEH-only project has nothing to read back, and a multi-dataset project's per-row blobs can disagree (a coherence regression the single live read never had). **Decision (Tim): capture a single project-level facility-config snapshot** — one row per project, written in the integration txn (the datasets pattern, but project-scoped, not per-dataset-row) — read by **all four** live sites: [get_query_context.ts:34](server/server_only_funcs_presentation_objects/get_query_context.ts#L34), [get_results_value_info.ts:32](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L32), [presentation_objects.ts:186](server/db/project/presentation_objects.ts#L186), and the AI path [modules.ts:724](server/db/project/modules.ts#L724) `getMetricsListForAI`. This is more correct (matches frozen data) and dissolves the HFA/ICEH gap **and** multi-dataset divergence in one move. `projectDb` is already in scope at every site.

2. **The pinning question is forced and has a clean answer.** A facility-columns config change today does **not** re-export datasets, so the snapshot pins to last integration. Treat facility config as a **results-input**: a config change should trigger re-export/re-integration (refreshing columns + `datasets.info` + `last_updated`), which auto-invalidates the cache. Reading the snapshot (not live) keeps query-vs-data coherence in the interim.

3. **Layer 3 is mostly done already** via FigureBundle — the remaining artifact-render leak is essentially just geojson (SNAP-2). Localization/countryIso3 are baked in; the public-dashboard `countryIso3` read (SNAP-4) is the one server-side artifact leak and is cheap to remove.

4. **The general cache rule (CLAUDE.md), and why SNAP-1's cache work is tiny (corrected 2026-06-23):** every input newly *consumed at render/query time* must be folded into the project cache version key, **server + client byte-identical**. **But the project-level config snapshot changes only at integration**, so `datasetsVersion` *is* its version stamp — and `_PO_ITEMS`/`_METRIC_INFO`/`_REPLICANT_OPTIONS` **already fold `datasetsVersion`**, so they go coherent the instant the reads repoint. The **only** cache to touch is **`_PO_DETAIL`** ([visualizations.ts:39](server/routes/caches/visualizations.ts#L39)), which versions on PO `last_updated` alone yet carries a facility-config-derived payload — fold `datasetsVersion` into it (server + client; already byte-identical on both sides → **no separate facility-flags token, no `instanceState` cross-read**). The earlier S9-N1 "fold a facility-flags hash into all 4 keys, byte-identical" was for the *keep-live-reads* patch and is unnecessary once reads point at the project snapshot.

---

## Sequencing

### Step A — close render/query-time drift (near-term, this is where N1 lands)

**SNAP-1/N1** was approached as three change-sets (storage+capture+backfill → repoint reads →
cache fold). **⚠️ Change-set 1 is REVERTED and its per-dataset capture mechanism is
superseded** (see Status). The change-sets below are kept **only as a record**: the
read-repoint (2) and cache-fold (3) analysis stays valid for the canonical re-plan, but the
change-set-1 storage shape does not. **Nothing is in the tree.**

- **Change-set 1 — storage + capture + backfill — ⛔ REVERTED (2026-06-23).** Built and
  runtime-verified, then reverted: capturing config on *every* dataset integration means
  importing one dataset re-snapshots the config governing *all* the project's data —
  incoherent. To be replaced by one canonical whole-project snapshot. What was built and
  reverted (recoverable from git history if needed): the `project_config` table (migration
  `029` + base schema), capture inside each `addDataset{Hmis,Hfa,Iceh}ToProject` txn, a
  startup backfill from each project's frozen HMIS config, and a
  `getFacilityColumnsConfigSnapshot` reader.
- **Change-set 2 — repoint the reads — PENDING.** Repoint the **4** live `getFacilityColumnsConfig(mainDb)` reads to `getFacilityColumnsConfigSnapshot(projectDb)`: [get_query_context.ts:34](server/server_only_funcs_presentation_objects/get_query_context.ts#L34) (thread `projectDb` into `buildQueryContext`), [get_results_value_info.ts:32](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L32), [presentation_objects.ts:186](server/db/project/presentation_objects.ts#L186), [modules.ts:724](server/db/project/modules.ts#L724) (`getMetricsListForAI`). Decide the snapshot-absent behaviour (loud error vs empty) — should not happen post-backfill.
- **Change-set 3 — cache fold — PENDING (lands with 2).** Fold `datasetsVersion` into `_PO_DETAIL` only ([visualizations.ts:39](server/routes/caches/visualizations.ts#L39) server + [t2_presentation_objects.ts:51](client/src/state/project/t2_presentation_objects.ts#L51) client); the other 3 PO caches already fold `datasetsVersion`, so they go coherent once the reads repoint. Version-KEY change only — one-time invalidation, no payload-shape change, no migration, no stored-FigureInputs sweep.
- **SNAP-4 — PENDING (independent of SNAP-1):** public-dashboard label cleaning reads `bundle.localization.countryIso3` (first non-null item bundle, `""` fallback) instead of `getCountryIso3Config(mainDb)`.
- **SNAP-3 — out of scope:** verified module-load/AI/editor-display only, not on the query/render path or in any cache key.
- **Constraint:** the `project_config` field holds plain config values — **no instance FK** (Step B/C need snapshot-local ids; holds trivially, no id is baked).

### Step B — structure self-containment + the large snapshots (portability enabler)
- **SNAP-2 geojson:** force `geo.kind:'data'` capture for stored bundles; add a project-geojson snapshot (per-level table or per-figure embed, see open question) for the viz/deck/report path to reach dashboard parity; drift-repair sweep for stored `kind:'level'` bundles.
- **Structure with snapshot-local stable ids** — the broader portability move (today facilities denormalize admin-area *names* but the unit must not depend on instance id space).
- **SNAP-5 image binaries:** per-project asset snapshot (if in scope).

### Step C — serialization / attach-detach
- Self-describing schema/version + provenance metadata; export/import (zip / `pg_dump` / logical); identity independence so a snapshot attaches to any project/instance. Meaningful only because Steps A/B make the project DB the complete source.

---

## Open questions / decisions for Tim
1. **Geojson storage (SNAP-2):** per-figure embed (`geo.data`, the dashboard pattern — heavy duplication) **vs** a single project-level `geojson_by_level` snapshot table + stamp (DRY, but new structure). Recommend the project-level table.
2. **Image binaries (SNAP-5):** in scope for Step B, or deferred? Large, and most are static FASTR logos (no drift); only user-uploaded images genuinely drift.
3. **ai_context (SNAP-6):** in scope? Only matters if AI interpretations become stored artifacts (none today).
4. **SNAP-1 propagation — RESOLVED (pinned):** a facility-config change does **not** auto-trigger re-export; it applies on the next integration (mirrors the dataset model). Once the project-level snapshot is read and `_PO_DETAIL` folds `datasetsVersion`, pinned has **no correctness gap** — only a freshness lag identical to datasets. Live-propagation (auto re-export all projects) is deferred (worker queueing, not Step-A-shaped).
5. **admin_area_labels (SNAP-3) — RESOLVED (out of scope):** verified not on the query/render path (module-load + AI + client editor display labels only). No Step A work.
6. **SNAP-1 snapshot home:** a dedicated project-level config table vs a general `project_config(config_key, config_json_value, last_updated)` key/value row. Recommend the general one (reusable; matches the project-snapshot framing). **Backfill source:** each project's own frozen `datasets.info.facilityColumnsConfig` (HMIS), falling back to live instance config only for HFA/ICEH-only projects that never stored a full config — **not** blanket-live (config drifts over time; live ≠ the frozen data, and seeding from live re-creates the drift this removes).

## Hard rules
- **Reuse the datasets pattern** (export-txn + `datasets.info`/mirror table + `last_updated` stamp + cache fold). Don't invent parallel machinery.
- **Render/query-time inputs must be folded into the project cache version key** (server+client identical) — snapshotting alone doesn't fix caching.
- **No instance FKs in layer-2 fields** — Step B/C portability needs snapshot-local stable ids; don't bake them in during Step A.
- **No payload-SHAPE change without a cache-prefix bump** (CLAUDE.md); the SNAP-1 change (fold `datasetsVersion` into `_PO_DETAIL`) is a version-KEY change (one-time invalidation), not a shape change.
- **Verify by executing**, and **report-only until per-step go-ahead** — this is a plan.
