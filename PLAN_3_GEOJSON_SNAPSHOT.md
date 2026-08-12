# PLAN_3: GeoJSON into the Run Package — the last artifact-render leak

Status: DRAFT for review. No implementation yet. Report-only until per-step
go-ahead.

**Updated 2026-08-13 — the PLAN_2 gate is SATISFIED.** The structure family
split landed (`3d320bb4`, plus review fixes in `90d444da`): `geojson_maps` is
keyed `(facility_family, admin_area_level)`, every server read/write takes a
family, and the client cache is keyed `geojson:{family}:{level}`. WS-CAPTURE
is therefore unblocked, and part of its repoint work is already done (see the
workstream). **Not yet deployed** — migration 076 has run on dev only. That
matters for WS-KEY: see its new bullet on the duplicated rows 076 creates.

**Sequencing (ruled 2026-08-12): plan 3 of 3** — after PLAN_1 (AA2 project
scope) and PLAN_2 (structure family split). The PLAN_2 gate is hard for
WS-CAPTURE: packages are immutable, so `geojson_maps` must already be keyed
`(facility_family, admin_area_level)` before geometry is frozen into
packages — capture is per-family from day one (file naming + manifest stamp
carry the family dimension). Treat PLAN_2's geojson section and this plan as
one continuous workstream (same five `getGeoJsonSync` sites, same
`t2_geojson` cache, same `geojson_maps` rows). WS-DEDUP and WS-COVERAGE have
no such gate — they can run anytime, including in parallel with PLAN_1/2.

**Rewritten 2026-08-06** around the landed results-runs model
([PLAN_RESULTS_RUNS.md](PLAN_RESULTS_RUNS.md), built 2026-07-30; format spec =
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md)). The pre-runs
version of this plan — project-DB `geojson_by_level` table, cache-fold
workstream, full WS-LIFECYCLE — is in git history (pre-2026-08-06). What
changed: the snapshot home is now the run package's `inputs/geojson/` files;
cache coherence and portability come free from runId keying and package
immutability; versioning/propagation dissolve into "generate a new run"; and
the implementation order flips (key fix BEFORE capture, because packages are
immutable and must be born with the correct key).

---

## 1. Why (the leak, grounded in code — re-verified 2026-08-06)

The runs build captured every generation input into the package (datasets,
facilities, indicators, assets, calendar, countryIso3) **except geojson**.
Geojson is now the only remaining live instance read in the artifact render
path (plus the named SNAP-5 image hole, parked in PLAN_RESULTS_RUNS).

- **The leak:** non-dashboard viz / deck / report figures resolve geometry
  live at figure build — `resolveGeoJson` in
  `client/src/generate_visualization/build_figure_inputs.ts` reads
  `kind:'level'` from the instance-level `t2_geojson` store. And capture can
  freeze a live pointer: `resolve_figure_from_metric.ts` /
  `resolve_figure_from_visualization.ts` fall back to
  `{ kind:'level', level }` when capture outruns the geojson preload.
  Consequence: an admin re-importing or editing the instance boundary file
  silently changes or breaks existing project figures — no version bump, no
  cache invalidation.
- **The match key is the root correctness bug:** geojson is stored
  instance-wide as one TEXT row per admin level (`geojson_maps`); each feature
  is rewritten to `{ geometry, properties: { area_id, source_name } }` where
  **`area_id` is a bare leaf admin-area NAME**
  (`server/geojson/process_geojson.ts`). But `admin_areas_3/4` keys include
  the parent. So:
  - Duplicate leaf names under different parents collapse to one key (the
    likely cause of the reported Haiti "only one department" and Cameroun
    errors).
  - The render join is exact-string on that name while the import auto-map is
    case-insensitive — accent/whitespace/casing/language drift ("Cameroun" vs
    "Cameroon") yields silent grey, no error.
  - No FK or existence check — a typo or later structure rename leaves
    features pointing at nothing.
  - The name is instance-derived → the geometry is not identity-independent →
    not portable.

The bare-name `area_id` is simultaneously the correctness problem and the
portability blocker. Fixing it is the heart of this plan.

---

## 2. Target architecture (runs model)

1. **Home: the run package.** `inputs/geojson/{family}_level_{2,3,4}.geojson`
   (gzipped — see open decision Q-GZIP; family-keyed, which `geojson_maps`
   now is), captured in
   the generation `prepare` stage beside the dataset extracts, from the
   instance `geojson_maps` rows as they exist at generation time. Manifest
   stamps: families+levels present, feature counts, source `uploaded_at`.
   **Additive-optional** — no `manifestSchemaVersion` bump; readers tolerate
   absence.
2. **Read path.** A project-scoped route resolves `projects.run_id` and serves
   the attached run's geojson. Packages are immutable → serve with
   `Cache-Control: immutable`, client cache keyed by runId. `build_figure_inputs`
   (and both capture sites) repoint to the run-scoped store. Fallback for
   geojson-less packages (pre-capture wizard runs, backfills without capture):
   the current live instance read — the status quo, not a regression; the next
   regeneration heals it.
3. **Cache coherence: free.** Every project cache already keys on the attached
   runId; new run = new geometry version. No cache-fold work.
4. **Snapshot-local stable-id match key.** `area_id` and the render join key
   become parent-qualified snapshot-local ids — not instance FKs, not bare
   names. Fixes the name-collision class and portability in one move. **Must
   land before capture starts** — packages are immutable, so a key model
   cannot be backfilled into published packages; they must be born correct.
5. **Kill the `kind:'level'` freeze.** Capture always awaits/uses resolved
   data; never store a live pointer. Note the variant now carries an optional
   `family` (PLAN_2, additive; absent → hmis), so any bundle frozen between
   that change and this one is family-tagged — the deletion still applies, but
   the fallback is no longer ambiguous in the meantime.
6. **Drift-repair sweep** (one-time, part of WS-KEY): re-key existing
   `geojson_maps` rows; transform stored `kind:'data'` snapshots (slides /
   reports / `dashboards.geo_data` / the public `/api/d/:slug` bundle);
   re-capture stored `kind:'level'` bundles as `kind:'data'`.

**What the runs model dissolved** (do not rebuild): the project-DB
`geojson_by_level` table; the PO-cache-key fold; instance-side blob
versioning/history (old runs keep their captured copies — runs ARE the
history; a bad remap is recoverable by re-attaching an older run);
remap-propagation machinery (propagation = generate a new run); the
reconciliation sweep as standalone machinery (a stale-geometry badge comes
free from Phase 4's capturedRunId ≠ attachedRunId provenance re-key once
geometry is run-scoped).

---

## 3. Workstreams

### WS-DEDUP — collapse the duplicated logic  ·  P1  ·  effort S  ·  PREREQUISITE

Make every later correctness fix land in one place. Remaining copies:
the lowercase auto-matcher twice in `step_2` (file vs DHIS2 branch), and
`GeoJsonFeature`/`FeatureCollection` redeclared in 3+ places
(`processGeoJson` vs `processGeoJsonFromDhis2` already share
`processFeatures` since `805f6b15`). WS-KEY's normalization must live in one
shared function.

### WS-COVERAGE — render-side coverage + typed sentinel  ·  P1  ·  effort M  ·  PREREQUISITE for WS-KEY's backfill

Save side shipped 2026-07-06 (`805f6b15` featureCount/matched/unmatched,
`e3cac93d` wizard display). Remaining:

- **Render-side coverage:** surface "N of M data areas have a boundary; K
  boundaries have no data" wherever a map figure renders. panther's
  `getMapDataTransformed` builds the value maps but exposes no coverage tally
  — compute app-side after the transform (or add a small count to panther
  `_010_maps`). This is the measurement WS-KEY's backfill uses to prove no
  rows were lost.
- **Policy (ruled):** error only on 0 matched; warn-but-allow otherwise,
  showing the number (prominent below ~70%) — mid-rollout partial coverage is
  legitimate.
- **Typed sentinel:** replace the `"[INFO] "`-string `Error` control flow with
  a typed result. Verified consumers: the throw in `build_figure_inputs.ts`
  (whose text changed in `90d444da` — it now names the registry as well as the
  level, since level alone stopped identifying a map once geojson went
  per-family; still a `[INFO]` string, so the consumer list is unchanged),
  the `startsWith` checks in `t2_presentation_objects.ts` and
  `PresentationObjectMiniDisplay.tsx`; the dashboard export's `prepareFigures`
  swallows the throw to `null` (masking regressions) — re-key the export
  degrade off the typed sentinel. `t2_presentation_objects` also *produces*
  `[INFO]` strings (too-many-items / no-data / no-replicant-values), so the
  type must cover those states too.
- **Half B — `area_id` validity join:** validate each chosen `area_id`
  resolves to a real admin area. **Partly shipped by PLAN_2:**
  `countOrphanedGeoJsonAreaIds` already performs exactly this join, per
  family, against `admin_areas_{family}_N` (never the other family's tree),
  and its count is surfaced on the structure-import summary scoped to the
  imported family. What remains is the wizard/editor-side interface
  (matched/unmatched lists) rather than the join itself. Still name-based;
  WS-KEY re-points it to the snapshot-local id — build the interface so only
  the join key changes.

### WS-KEY — snapshot-local-id, normalized matching  ·  P1  ·  effort L  ·  the headline fix

Eliminate the name-collision + casing/accent-drift class of silent wrong maps
at the root, and make the captured geometry portable. **Lands BEFORE
WS-CAPTURE** (immutability — see §2 item 4).

- Stop storing `area_id` as a bare leaf name; store a parent-qualified /
  snapshot-local stable id. The data side of the render join (figure build)
  must emit the same qualified key — both sides move in lockstep (join lives
  in panther `_010_maps`: stage app changes before any resync).
- **Persist the DHIS2 UID/parent the disambiguation UI already collects.**
  `step_3` shows UID/parent to disambiguate duplicate names, but the UID is
  never sent on save — the picker is illusory; both duplicates get the same
  `area_id`. Persist the chosen UID; drop the other duplicate.
- Unicode-normalize + trim + diacritic-fold in the auto-matcher, in the one
  shared place WS-DEDUP created.
- **Migration + backfill:** re-key `geojson_maps` rows; transform stored
  `kind:'data'` snapshots (slides / reports / `dashboards.geo_data` / public
  bundle — stored-JSON move = transform + FORCED skip-gate per
  PROTOCOL_APP_MIGRATIONS); re-capture `kind:'level'` bundles as
  `kind:'data'`. **Depends on WS-COVERAGE** to measure backfill correctness.
  After backfill, re-point Half B's validation join to the new id.
- **Migration 076 duplicated the pre-split maps across families — expect rows
  that cannot be re-keyed at all.** When both registries had facilities, 076
  copied each existing map into BOTH `hmis` and `hfa` (faithful: the single
  shared map served both registries before the split). On any instance whose
  two registries use different admin naming — the premise of the split — one
  copy therefore matches nothing in its own family's tree. Measured on dev:
  `hfa` level 2 = 8 of 8 area_ids orphaned, level 3 = 16 of 16. The re-key
  backfill must decide per row rather than assume a name resolves, and
  WS-COVERAGE's "no rows lost" measurement must not read these as losses.
  Dropping a fully-orphaned duplicate is the better outcome than re-keying
  it — it restores the missing-map path, which is what surfaces the gap.
  **Which instances hold such rows is not knowable until 076 is deployed
  fleet-wide** (its assignment branches on each instance's facilities at
  migration time), so this backfill should be designed against the observed
  fleet, not a predicted row set.
- Published run packages are NOT migrated (immutable). Pre-WS-KEY packages
  contain no geojson anyway (capture doesn't exist yet), so no dual-key join
  is ever needed.

### WS-CAPTURE — geojson into the run package  ·  P1  ·  effort M  (was WS-SNAPSHOT, effort L)

Implements §2 items 1–3 and 5:

- Capture in `generate_run/` `prepare_inputs` (alongside dataset extracts):
  read `geojson_maps` (family-keyed after PLAN_2), write
  `inputs/geojson/{family}_level_N.geojson[.gz]`, stamp the manifest
  (additive-optional field carrying family + level + counts).
- Backfill: `backfill_runs.ts` captures from live instance `geojson_maps` — a
  **documented exception** to "backfill from frozen project data": the live
  blob is exactly what those projects render today, so capturing it is
  render-equivalent by definition.
- Project-scoped serving route (resolve `projects.run_id` → run file), gzip +
  `Cache-Control: immutable`; client run-geo store keyed by runId.
- Repoint `resolveGeoJson` in `build_figure_inputs.ts` and both capture sites;
  delete the `kind:'level'` freeze fallback. **PLAN_2 already threaded the
  family dimension through this surface:** all five `getGeoJsonSync` call
  sites take `(family, level)` and all four `{kind:"level"}` producers stamp
  the family, so this repoint changes the SOURCE (run package vs instance
  store), not the key shape. Instance-plane surfaces (geojson manager, wizard
  previews) keep reading `t2_geojson` — different plane, and now per-family
  pages, which makes the split cleaner than when this plan was written.
- Typed fallback for geojson-less packages → live instance read (status quo).

### WS-LIFECYCLE-RESIDUAL — audit + delete warning  ·  P3  ·  effort S  (was P1/L; mostly dissolved)

What survives of the old WS-LIFECYCLE: an audit-log row (who/when) on
instance geojson save/remap/delete, and a delete warning listing dependent
figures. Optional; everything else (versioning, propagation, reconciliation)
is dissolved by the runs model — see §2.

### WS-EFFICIENCY — storage/serving  ·  P2  ·  effort M

- **Compression:** GeoJSON gzips ~8–12×. Instance serving path + the
  in-package copy (Q-GZIP).
- **Fix the double-serialize** on the instance serving path (stringified JSON
  re-escaped as a string field).
- **Caching headers** for instance-plane serving (`/geojson-maps/level/:level`
  is not under `/api/`, so no `Cache-Control` today). The run-scoped route is
  new code — immutable-cached from day one, not part of this workstream.
- **Off-main-thread parse** (worker) for large levels.
- **Optional polygon simplification** (inline Douglas–Peucker, no new deps;
  lossy; naive per-polygon simplification breaks shared borders — flag the
  topology trade-off; keep the raw upload).
- Also the home for the deferred AA4 background-worker + SSE progress path and
  `step_3` row virtualization (measured 2026-07-06: DRC 10,325 level-4 aires;
  Cameroon 2,219).

---

## 4. Decisions already made (do not re-litigate)

- **One-country-per-instance is a guaranteed invariant** (Tim). → the match
  key needs no geography dimension within an instance; snapshot-local ids are
  still required for detach/attach portability.
- **The public-dashboard frozen geometry is intentional, not a bug.** The fix
  for staleness is regeneration + the Phase 4 provenance badge, not a live
  read.
- **Storage home = run `inputs/geojson/`** (this rewrite). The project-DB
  table is dead.
- **Capture trigger / propagation** (was open Q2): captured at run
  generation; propagation = generate a new run.
- **Versioning cost** (was open Q4): dissolved — runs are the history.
- **Runs hard rules apply verbatim:** no links in a run dir ever (the per-run
  geojson copy is an accepted duplicate-bytes cost); no instance FKs inside
  run files; the package rule (attached users can see package contents).

---

## 5. Implementation order + timing

1. **WS-DEDUP** — prerequisite.
2. **WS-COVERAGE** — the backfill measurement + typed sentinel.
3. **WS-KEY** — migration + backfill + stored-snapshot transform. The
   headline. Must precede WS-CAPTURE.
4. **WS-CAPTURE** — capture + serving + repoint. PLAN_2's family keying has
   landed, so this is unblocked (and partly pre-done — see the workstream).
5. **WS-EFFICIENCY** (P2, parallel-safe) · **WS-LIFECYCLE-RESIDUAL** (P3,
   anytime).

**Relative to the PLAN_2 deploy (2026-08-13).** 1–2 (WS-DEDUP, WS-COVERAGE)
have no gate and no migration, stored-shape change or panther edit — they are
safe to do while PLAN_2 sits undeployed, and they are WS-KEY's prerequisites
anyway. **WS-KEY should wait for the 076 deploy**: it re-keys `geojson_maps`
rows whose existence and family assignment 076 decides per instance, so
before the deploy the row set it operates on is predicted rather than
observed, and the backfill is one-way. Stacking a second undeployed
structural change also means the first prod deploy carries both, which makes
attribution hard if either misbehaves.

**Relative to the runs rollout: resolved 2026-08-12.** The fleet rollout
completed first (28 of 29 instances on 1.66.7; Nigeria pending its window),
so the backfilled fleet packages carry no geojson — the typed fallback (live
instance read, the status quo) covers them, and each project's next
regeneration heals it. The old "capture before rollout" sweetener is moot.

---

## 6. Migration / backfill verification

- Verify each step by executing a small harness against a real stored blob
  (Cameroon AA3 — the measured 200-feature / ~20 MB case), not by reading.
  Use WS-COVERAGE's counts to confirm no rows were lost in the WS-KEY re-key.

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

## 7. Open decisions for Tim

1. **Match-key appetite (the central fork).** Full snapshot-local-id model
   (WS-KEY as written: migration + backfill + transform of every stored
   `kind:'data'` snapshot) vs an interim "normalize + parent-qualify within
   the existing name string" that fixes Haiti/Cameroun cheaply but would be
   redone for portability. *Recommendation: the full model once — it is the
   entire point of this plan.*
2. **Q-GZIP.** Store the in-package copy as `level_N.geojson.gz` (~8–12×
   smaller; Cameroon L3 is ~20 MB plain and copied into EVERY package under
   the no-links rule, with no parquet payoff coming) vs plain for
   package-explorer transparency. *Recommendation: gzip.*
3. **Backfill capture exception.** Confirm `backfill_runs.ts` may capture from
   live instance `geojson_maps` (render-equivalent; documented exception) vs
   backfilled packages simply lacking geojson. *Recommendation: capture.*
4. **Efficiency scope.** Double-serialize fix + instance-path compression now
   (cheap) vs deferred; simplification in or out.

---

## 8. Hard rules (carried)

- **No instance FKs in project-side or run-side fields; snapshot-local stable
  ids from commit one.**
- **Packages are immutable** — the key model lands before capture; no
  in-place migration of published packages, ever.
- **No payload-shape change without a cache-prefix bump** (CLAUDE.md); stored
  JSON moves = transform + FORCED skip-gate (PROTOCOL_APP_MIGRATIONS).
- **Report-only until per-step go-ahead;** verify by executing; stage app
  changes before any panther resync (the render join lives in panther
  `_010_maps`).
