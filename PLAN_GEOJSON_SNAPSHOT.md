# PLAN: GeoJSON as a Project Snapshot (S2) — the durable architecture

Status: DRAFT for review. No implementation yet. Report-only until per-step go-ahead.

This is now the **only** geojson plan. Its former companion (the near-term
layer-1 plan) shipped and was retired 2026-07-06: the import-freeze fix,
save-side coverage counts, export resilience, and upload hardening are live
(commits `805f6b15`, `e3cac93d`, `14790e39`, earlier `a36121e2`/`d3743456`);
its two remainders were absorbed here (WS-COVERAGE below) and into
SYSTEM_04/SYSTEM_05 Open items (upload-cap policy items).

It builds on the existing project-snapshot docs — [VISION_PROJECT_SNAPSHOT.md](VISION_PROJECT_SNAPSHOT.md) (the why/end-state) and [PLAN_PROJECT_SNAPSHOT.md](PLAN_PROJECT_SNAPSHOT.md) (the how, where geojson is item **S2**, in **Step B**). This plan restates the principles a reviewer needs and stays scoped to geojson; read those two docs for the broader vision (facility-config S1, countryIso3 S4, structure self-containment, etc., which are out of scope here).

---

## 0. The vision a reviewer needs (condensed from VISION_PROJECT_SNAPSHOT.md)

A project should be a **fully self-contained, transportable unit** — a frozen snapshot that can be detached from the instance that produced it and attached elsewhere. **The one hard rule:** artifacts (layer 3 — visualizations, slide-decks, reports, dashboards) read **only** from the project snapshot (layer 2); the snapshot depends on **nothing** in instance data (layer 1) at read time. *No viz / report / deck / dashboard reads instance data, period.*

The codebase already does this for **datasets** (snapshotted into the project DB with a project-local `last_updated` that every project cache versions off) and for **stored artifacts** via **FigureBundle** (localization + map `geo.data` baked in at capture). The remaining work is to bring the **stragglers** under the same pattern — and the snapshot plan's own diagnosis is blunt: *"the remaining artifact-render leak is essentially just geojson (S2)."* **GeoJSON is the headline straggler.**

---

## 1. Why geojson is the leak (grounded in code)

- **Already self-contained:** FigureBundle bakes `geo.data` into stored bundles; dashboards snapshot `geo_data` per item/group. Stored dashboards are at parity.
- **The leak:** non-dashboard **viz / deck / report** figures resolve geometry **live** at figure build — `build_figure_inputs.ts` reads `geo.kind:'level'` from client `instanceState` `t2_geojson` (the instance-level store). And a stored bundle can be frozen as `kind:'level'` (a live pointer, not a snapshot) when capture outran the geojson preload. Consequence: an admin re-importing or editing the instance boundary file **silently changes or breaks** existing project figures, with no version bump and no cache invalidation.
- **The match key is the root correctness bug:** geojson is stored instance-wide as one TEXT row per admin level ([geojson_maps](server/db/migrations/instance/010_add_geojson_maps.sql)); each feature is rewritten to `{ geometry, properties: { area_id, source_name } }` where **`area_id` is a bare leaf admin-area NAME** ([process_geojson.ts](server/geojson/process_geojson.ts)). But `admin_areas_3/4` keys include the **parent**. So:
  - Duplicate leaf names under different parents **collapse to one key** (the likely cause of the reported **Haiti "only one department"** and **Cameroun** errors).
  - The render join is exact-string on that name, while the import auto-map is case-insensitive — any accent/whitespace/casing/language drift ("Cameroun" vs "Cameroon") yields no match → **silent grey**, no error.
  - There is **no foreign key or existence check**, so a typo or later structure rename leaves features pointing at nothing.
  - The name is instance-derived, so the snapshot is **not identity-independent** → not portable.

This single design choice (bare-name `area_id`) is simultaneously the **correctness** problem and the **portability** blocker. Fixing it is the heart of this plan.

---

## 2. Target architecture

1. **Project-level geojson snapshot.** A `geojson_by_level` snapshot table in the **project DB** with a project-local `last_updated` stamp. (PLAN_PROJECT_SNAPSHOT.md open-question 1 recommends the project-level table over per-figure `geo.data` embedding — DRY, no heavy duplication.)
2. **Capture.** Snapshot the resolved geojson into the project in the dataset-add / integration transaction (or a dedicated capture step), reusing the **datasets pattern** (mirror table + `last_updated`). Always capture as **`geo.kind:'data'`** (await preload); never freeze a live `kind:'level'` pointer.
3. **Read path.** Artifacts resolve geometry from the **project snapshot**, not `instanceState` / main DB. `build_figure_inputs` reads project geo.
4. **Cache coherence.** Fold the snapshot's `last_updated` into the PO cache version key — **server + client byte-identical** (the vision's hard rule: snapshotting alone doesn't fix caching).
5. **Snapshot-local stable-id match key.** `area_id` and the render join key become **snapshot-local stable structure ids** — *not* instance FKs, *not* bare names. This fixes the name-collision correctness cluster **and** satisfies the portability constraint in one move. **Hold the no-instance-FK line from the first commit** (the vision: "never bake instance foreign keys into a project-side field; that constraint must hold from the first change").
6. **Drift-repair sweep.** One-time: (a) re-capture stored `kind:'level'` bundles as `kind:'data'`; (b) re-key existing geojson `area_id`s to the snapshot-local model; (c) transform stored `kind:'data'` snapshots (slides / reports / `dashboards.geo_data` / the public `/api/d/:slug` bundle) to the new key.

---

## 3. Workstreams

### WS-DEDUP — collapse the duplicated logic  ·  P1  ·  effort S  ·  PREREQUISITE
**Goal:** make every later correctness fix land in one place, not four. Today there are 2–4 unsynced copies of the load-bearing logic: `processGeoJson` vs `processGeoJsonFromDhis2` (near-identical — both now delegate to a shared `processFeatures`, so this pair is largely collapsed as of `805f6b15`), the lowercase auto-matcher twice in `step_2` (file vs DHIS2 branch), and `GeoJsonFeature`/`FeatureCollection` redeclared in 3+ places. **Do this first** — WS-KEY's normalization must live in one shared function.

### WS-COVERAGE — render-side coverage + typed sentinel  ·  P1  ·  effort M  ·  PREREQUISITE for WS-KEY's backfill

Inherited from the retired near-term plan (its save side shipped 2026-07-06:
save routes return featureCount/matched/unmatched — `805f6b15` — and the
wizard shows them — `e3cac93d`). Remaining:

- **Render-side coverage:** surface "N of M data areas have a boundary; K
  boundaries have no data" wherever a map figure renders. panther's
  `getMapDataTransformed` builds the value maps but exposes **no** coverage
  tally — compute the counts app-side after the transform (or add a small
  count to panther `_010_maps`). This is the measurement WS-KEY's backfill
  uses to prove no rows were lost.
- **Policy (as ruled in the near-term review):** error only on 0 matched
  (nothing would render); warn-but-allow otherwise, showing the number
  (prominent below ~70%) — mid-rollout partial coverage is legitimate.
- **Typed sentinel:** replace the `"[INFO] "`-string `Error` control flow
  with a typed result. Verified consumers: the throw in
  `build_figure_inputs.ts`, the `startsWith` checks in
  `t2_presentation_objects.ts` and `PresentationObjectMiniDisplay.tsx`; the
  dashboard export's `prepareFigures` currently swallows the throw to `null`
  (any failure becomes a placeholder, masking regressions) — re-key the
  export degrade off the typed sentinel. Note `t2_presentation_objects` also
  *produces* `[INFO]` strings (too-many-items / no-data / no-replicant-values),
  so the type must cover those states, not just missing-geometry.
- **Half B — `area_id` validity join:** validate each chosen `area_id`
  resolves to a real admin area by joining `admin_areas_N`. Name-based in the
  interim (that table is name-keyed); WS-KEY re-points the join to the
  snapshot-local id — build the interface (matched/unmatched lists) so only
  the join key changes.

### WS-SNAPSHOT — project-level snapshot + capture + cache-fold  ·  P1  ·  effort L
**Goal:** non-dashboard viz/deck/report figures read geometry from a project snapshot, reaching the parity dashboards already have. Implements target-architecture items 1–4: the `geojson_by_level` project table, capture in the integration txn (datasets pattern), force `kind:'data'` capture, fold the stamp into the PO cache key (server+client). Repoint `build_figure_inputs` to the snapshot.

### WS-KEY — snapshot-local-id, normalized matching  ·  P1  ·  effort L  ·  the headline fix
**Goal:** eliminate the name-collision + casing/accent-drift class of silent wrong maps at the root, and make the snapshot portable. Implements target-architecture item 5:
- Stop storing `area_id` as a bare leaf name; store a **parent-qualified / snapshot-local stable id**.
- **Persist the DHIS2 UID/parent the disambiguation UI already collects.** Today `step_3` shows UID/parent to disambiguate duplicate names, but the UID is **never sent on save** — the picker is *illusory*, both duplicates get the same `area_id`. Persist the chosen UID; drop the other duplicate.
- Add unicode-normalize + trim + diacritic-fold to the auto-matcher, in the **one** shared place WS-DEDUP created, so "Cameroun"/trailing-space/casing variants match.
- Make the render join key use the same qualified key.
- Requires a **migration + backfill** of `geojson_maps` rows and a transform of stored `kind:'data'` snapshots. **Depends on WS-COVERAGE** (render-side coverage counting) to measure backfill correctness. After backfill, **re-point WS-COVERAGE Half B's validation join** from the name column to the new snapshot-local id.

### WS-LIFECYCLE — versioning, audit, drift-repair, safe delete  ·  P1  ·  effort L
**Goal:** make boundary changes recoverable and stop stored figures silently drifting. Today every write is a destructive in-place UPSERT with no history/audit, and delete is a hard `DELETE` with no cascade — a bad remap or accidental delete is unrecoverable.
- Add history/versioning (keep prior blob on UPSERT, or a versions table) + an **audit-log row** (who/when) for save/remap/delete (currently unlogged).
- **Safe delete:** check for and report dependent `kind:'level'` figures before hard-deleting; consider soft-delete.
- **Reconciliation sweep** (target-architecture item 6): a remap/delete updates or flags stored `kind:'data'` snapshots (slides, reports, `dashboards.geo_data`, public bundle) instead of leaving them stale — same drift class as the documented FigureInputs sweep.
- A **re-import/boundary-change flow** that diffs against the prior mapping instead of forcing a full manual re-map.

### WS-EFFICIENCY — storage/serving + optional simplification  ·  P2  ·  effort M
**Goal:** stop shipping ~10× more bytes than necessary and make large levels tractable. Invest in the **snapshot store** (where artifacts now read), not the instance serving path.
- **Compression:** GeoJSON gzips ~8–12×. Add compression on the snapshot store/serving.
- **Fix the double-serialize:** the serving path returns already-stringified JSON re-escaped as a string field (double-serialize / double-parse). Return parsed JSON or a raw pre-serialized `Response`.
- **Caching headers / ETag / Valkey** for the served geojson (today `/geojson-maps/level/:level` is *not* under `/api/`, so it gets no `Cache-Control`).
- **Off-main-thread parse** (worker) for large levels.
- **Optional polygon simplification** (inline Douglas–Peucker per the no-new-dependency rule; tolerance tunable). **Risk to flag:** naive per-polygon simplification breaks **shared borders** (Region edge ≠ District edge after simplification) — may need a topology-preserving approach, or accept the tolerance trade-off. Lossy; keep the raw upload if fidelity is ever needed.
- This is also the home for the **AA4 background-worker + SSE progress** path that the shipped near-term WS1 (`805f6b15`) explicitly defers, plus the `step_3` row **virtualization** AA4 needs (live-measured 2026-07-06: DRC has **10,325** level-4 aires; Cameroon 2,219).

---

## 4. Decisions already made (do not re-litigate)

- **One-country-per-instance is a guaranteed invariant** (confirmed by Tim). → the match key needs **no geography dimension within an instance**. But snapshot-local ids are still required for **detach/attach** portability (Step C of the vision).
- **The public-dashboard frozen geometry is intentional, not a bug.** "Nothing a project renders should depend on live instance state." The fix for staleness is the **drift-repair / reconciliation** sweep (WS-LIFECYCLE), *not* making the public bundle read live.
- **Storage shape = project-level `geojson_by_level` table** (recommended), not per-figure embed.

---

## 5. Implementation order (within this plan)

1. **WS-DEDUP** — prerequisite; makes WS-KEY's normalization land once.
2. **WS-SNAPSHOT** — stand up the project snapshot + capture + cache-fold (kind:'data' parity for the non-dashboard path). Can proceed in parallel with WS-EFFICIENCY's serving work, which touches a different path.
3. **WS-KEY** — the snapshot-local-id match key + backfill. **Gated on WS-COVERAGE** existing (to measure the backfill). The headline correctness + portability fix.
4. **WS-LIFECYCLE** — versioning/audit/drift-repair/safe-delete; best once the WS-KEY key model is stable (the audit-log + safe-delete slice can be pulled forward independently).
5. **WS-EFFICIENCY** — P2; the serving/compression slice is independent and can run in parallel from the start; simplification + the AA4 worker land opportunistically.

**Relative to the broader snapshot effort:** PLAN_PROJECT_SNAPSHOT.md Step A (facility-config drift, S1/N1) is separate and precedes this; **geojson is Step B**. The portability end-state (serialization, attach/detach — Step C) is meaningful only once geojson and the other stragglers are snapshot-local.

---

## 6. Migration / backfill

- Existing instance `geojson_maps` → project snapshots (per project, in the capture txn).
- Re-key `area_id`s to snapshot-local ids; transform stored `kind:'data'` snapshots; re-capture `kind:'level'` bundles.
- **Verify each step by executing** a small harness against a real stored blob (Cameroon AA3 — the measured 200-feature / 20 MB case), not by reading. Use WS-COVERAGE's counts to confirm no rows were lost.

### Verified DHIS2 API facts (live Cameroon + DRC, both 2.40.11.1, 2026-07-06)

Established for the shipped near-term WS1; any backfill/re-capture code here
inherits them:

- `featureType` is **absent** from `.json` fields projections — the
  geometry-presence signal is `filter=geometry:!null` (exact counts;
  **`level=` must be a filter** — a bare `level=` param is silently ignored
  when `filter=` is present).
- The `.geojson` endpoint **omits** boundary-less units (never returns null
  geometry): Cameroon L3 = 224 units in `.json`, 200 features in `.geojson`.
- Per-uid `name` AND `code` are byte-identical between `.json` and `.geojson`
  (zero mismatches across Cameroon L2/L3 + DRC L3) — name-keyed mappings
  transfer cleanly. Cameroon L3 has **no codes at all**; `name` is the only
  match key there.
- `parent` is an object in `.json` (`parent[id,name]` projection works) and a
  bare uid string in `.geojson` — normalize at every seam.
- Payloads/timing: Cameroon L3 geojson 19.5 MB in 13–43 s (variable); DRC L3
  5.4 MB / ~4 s; the metadata equivalents are 17–51 KB in 1–2 s.

---

## 7. Open decisions for the reviewer / Tim

1. **Match-key migration appetite (the central fork).** The **full snapshot-local-id model** (WS-KEY: migration + backfill + transform of every stored `kind:'data'` snapshot) vs an **interim "normalize + parent-qualify within the existing name string"** that fixes Haiti/Cameroun cheaply but is *not* snapshot-local → would have to be redone for portability. *Recommendation: do the full model once — it is the entire point of S2 — accepting it is the larger effort.*
2. **Capture trigger / propagation.** Capture geojson at dataset-add (like other inputs, "pinned to last integration") vs a dedicated geojson-capture action; and how an instance remap propagates to existing projects (live re-export vs pinned). Mirrors PLAN_PROJECT_SNAPSHOT.md's S1 propagation question.
3. **Efficiency scope.** Compression + double-serialize fix now (cheap, high-ratio) vs deferred; simplification in or out (lossy/topology risk).
4. **Versioning cost.** Keep N prior multi-MB blobs per level, a single rollback slot, or audit-metadata-only (who/when, no full prior geometry)?

---

## 8. Hard rules (from the vision)

- **No instance FKs in project-side fields; snapshot-local stable ids from commit one.**
- Render/query-time inputs **folded into the project cache version key** (server + client identical).
- **Reuse the datasets pattern** (capture txn + mirror/stamp + cache-fold). Don't invent parallel machinery.
- **No payload-shape change without a cache-prefix bump** (CLAUDE.md).
- **Report-only until per-step go-ahead;** verify by executing; stage app changes before any panther resync (the render join lives in panther `_010_maps`).
