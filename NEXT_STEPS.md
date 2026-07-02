# Next Steps — Plan Sequencing

Recommended execution order across the open plan docs, with dependencies, effort,
risk, and the decisions required before each top item can finish. Derived from a
code-verified review of all eight planning docs (2026-06-23).

## Not "do next" items

Two of the eight docs are not work to queue:

- **[VISION_PROJECT_SNAPSHOT.md](VISION_PROJECT_SNAPSHOT.md)** — a charter, not a
  deliverable. It governs items 1 and 7 (the hard rule: *no instance FKs in
  project-side fields; snapshot-local stable ids from commit one*). Keep it open as
  the constraint source; do not queue it as work.
- **[PLAN_SNAPSHOT_NAMING.md](PLAN_SNAPSHOT_NAMING.md)** — unrelated to the snapshot
  *architecture*. It is a pure client state-getter rename (`getX` → `getSnapshotX`).
  Lowest urgency (it is item 5 below, on the cleanup track).

## Status correction (verified against code)

- **S9 F3 already shipped** — `excludeReplicantFilter: true` is live at
  [t2_presentation_objects.ts:328](client/src/state/project/t2_presentation_objects.ts#L328).
  The plan's own "no implementation yet" header is stale. The remaining ready S9
  slice is **F1, F5, F6, F7**.

## Order at a glance

```
[1 ∥ 2]  +  [3, 4, 5]  +  [6]   →   7   (gate: requires 2; prefer-after 1)
```

Track A (1, 2) and the cleanups (3, 4, 5) and the figure feature (6) all proceed in
parallel. Item 7 is gated on item 2 alone; doing item 1 first is a strong preference,
not a hard block (the two share no code dependency — different tables, different read
paths).

---

## Track A — keystone + live bug (start here, in parallel)

### 1. PLAN_PROJECT_SNAPSHOT — Step A · KEYSTONE · being re-planned
[PLAN_PROJECT_SNAPSHOT.md](PLAN_PROJECT_SNAPSHOT.md)

The single highest-leverage item: stop the PO query/render pipeline reading instance-level
config live, closing N1 (the confirmed HIGH silent-wrong-data bug) and unblocking the
snapshot cluster.

**Status (2026-06-23):** the first attempt — a per-dataset facility-config capture
(change-set 1) — was built, runtime-verified, then **reverted**. Capturing config on every
dataset integration means importing one dataset re-snapshots the config governing *all* the
project's data: incoherent. Step A is being **re-planned around one canonical whole-project
snapshot** (capture all inputs — structure, admin areas, facilities, all datasets, all
config — locked and hashed at one point in time). **Nothing is in the tree.**

The repoint + cache-fold analysis below stays valid for the re-plan; only the storage
mechanism changes:
- **Repoint the 4 live reads** `getFacilityColumnsConfig(mainDb)` →
  [get_query_context.ts:34](server/server_only_funcs_presentation_objects/get_query_context.ts#L34),
  [get_results_value_info.ts:32](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L32),
  [presentation_objects.ts:186](server/db/project/presentation_objects.ts#L186),
  [modules.ts:724](server/db/project/modules.ts#L724).
- **Cache fold:** `datasetsVersion` into `_PO_DETAIL` only (the other 3 PO caches already fold it).
- **SNAP-4 — independent, pending:** countryIso3 from bundle localization.
- SNAP-3 — out of scope (verified not render-path).

- Effort remaining: **S–M** · Risk: **low** · Deps: **none**
- **N1 lives here** — do NOT fix N1 standalone (per
  [PLAN_S9_QUERY_CACHE_FIXES.md](PLAN_S9_QUERY_CACHE_FIXES.md) Tier 0) or you
  re-cement the instance coupling the snapshot work removes.

### 2. PLAN_GEOJSON_NEAR_TERM · highest user urgency
[PLAN_GEOJSON_NEAR_TERM.md](PLAN_GEOJSON_NEAR_TERM.md)

Closes the reported Cameroon/DRC import freeze (R4D / Angelica) and a security hole.

- **WS7 path-traversal one-liner first** (P1 security) —
  [upload.ts:267](server/routes/instance/upload.ts#L267) renames to the unsanitized
  client filename.
- **WS1** — metadata/geometry split fixes the AA3 import freeze.
- **WS2 Half A** — coverage counting; key-model-agnostic; **a hard prerequisite for
  item 7's backfill measurement**.
- Then WS2 Half B / WS3.
- Effort: **L** · Risk: **medium** · Deps: **none** · Unblocks: **item 7**
- **Hard gate:** verify the 5 DHIS2 API assumptions against the live instances
  *before* writing WS1 code (see §9 of the plan).
- Comms to Angelica must say "AA3 fixed now, AA4 follows in PLAN_GEOJSON_SNAPSHOT."

---

## Track B — shovel-ready cleanups (independent, slot in anytime)

### 3. PLAN_S9_QUERY_CACHE_FIXES — F1, F5, F6, F7
[PLAN_S9_QUERY_CACHE_FIXES.md](PLAN_S9_QUERY_CACHE_FIXES.md)

Fully analyzed, two adversarial rounds, harness-verified. Remaining ready slice
(F3 shipped; N1 → item 1; F8a blocked):

- **F5** — `=`-count `!= 1` guard in `isSafePostAggregationExpression`. One line.
- **F6** — MiniDisplay in-loop version guard (do NOT bundle with the dropped F2).
- **F7** — delete dead `TimCacheB` (3 deletions + the S9 manifest line).
- **F1** — `getPeriodBounds` quarter_id CTE via the extracted `buildPeriodCTE`
  helper. **Not a casual quick win** — it feeds cached `dateRange` baked into stored
  figure snapshots, so it needs a value-equivalence harness on the working paths.
  Treat as its own focused commit.
- **Hold F8a** (Ethiopian fiscal-quarter ternary) until a domain owner confirms the
  quarter boundaries + month-13/pagume.
- N2/N3 are contained low-priority follow-ons.
- Effort: **M** · Risk: **low** (F1 medium) · Deps: **none**

### 4. PLAN_SLIDE_BODY_SCHEMA · quick win
[PLAN_SLIDE_BODY_SCHEMA.md](PLAN_SLIDE_BODY_SCHEMA.md)

Add `"none"` to the patternType enum, narrow-cast the `SlideFromSchema`/`Slide`
bridge (option a — no panther change), replace the two `z.unknown()` bodies at
[slides.ts:43,57](lib/api-routes/project/slides.ts#L43). Closes the last route-body
validation gap. Not a security hole (DB layer already validates).

- Effort: **M** (mostly the type bridge) · Risk: **low** · Deps: **none**

### 5. PLAN_SNAPSHOT_NAMING · pure mechanical rename
[PLAN_SNAPSHOT_NAMING.md](PLAN_SNAPSHOT_NAMING.md)

Rename ~17 T1 getters to `getSnapshot*` (~27 call sites, not the plan's 80–150).
No behavior change. Do it in a quiet window — merge-conflict sensitive. The
`getProjectStateSnapshot` behavior fix (PLAN_STATE_MGT_FIXES F12) is orthogonal; do
the rename mechanically regardless.

- Effort: **S–M** · Risk: **low** · Deps: **none**

---

## Track C — feature work (independent track, on capacity)

### 6. PLAN_FIGURE_BUNDLE_FOLLOWUPS
[PLAN_FIGURE_BUNDLE_FOLLOWUPS.md](PLAN_FIGURE_BUNDLE_FOLLOWUPS.md)

- **Phase 4** (provenance wiring + stale-badge + "Update data" action) — the real
  user feature.
- **Phase 5** (PO → Visualization rename, ~222 files) — isolated mechanical
  housekeeping; do last.
- Quick check: Phase 4's `instanceDataImportedAt`/`projectDataAddedAt` timestamps
  don't duplicate the snapshot plan's SNAP-5/SNAP-6 work.
- Effort: **L** · Risk: **low** (additive) · Deps: soft on item 4 for Phase 5 only.

---

## Gated — large foundational effort (last)

### 7. PLAN_GEOJSON_SNAPSHOT
[PLAN_GEOJSON_SNAPSHOT.md](PLAN_GEOJSON_SNAPSHOT.md)

The architectural cure for silent-wrong-maps (Haiti/Cameroun name collisions) via
snapshot-local stable ids. WS-DEDUP (prereq) → WS-SNAPSHOT → WS-KEY (headline) →
WS-LIFECYCLE → WS-EFFICIENCY.

- Effort: **XL** · Risk: **high** · No partial ship.
- **Hard gate:** requires item 2 (WS2 coverage counts measure the backfill).
- **Strongly prefer after item 1** (proves the consume + cache-fold pattern cheaply
  before betting the XL migration on it) — but a *soft* preference, not a hard block.
- Verify the migration/backfill by executing against a real blob (Cameroon AA3 —
  200 features / 20 MB), not by reading.

---

## Decisions required before the top items can finish

**Before item 1 (PROJECT_SNAPSHOT Step A):**
- Facility-config propagation: does a config change auto re-export all projects, or
  stay "pinned to last integration"?
- Confirm `admin_area_labels` (SNAP-3) is actually used on the render path.

**Before item 2 (GEOJSON_NEAR_TERM):**
- The 5 DHIS2 verification gates against live Cameroon/DRC: featureType↔geometry
  reliability, `name` present in both `.json`/`.geojson`, `parent[id]` shape.
- WS2 coverage policy (error at 0%, warn <70%) and the typed-sentinel shape.
- Confirm AA4 defers to item 7.

**Before item 7 (GEOJSON_SNAPSHOT — the largest cost decision in the set):**
- Match-key migration appetite: full snapshot-local-id model (migration + backfill +
  transform every stored snapshot) vs cheaper interim parent-qualified name.
- Geojson storage shape: per-figure embed vs project-level `geojson_by_level` table.
- Versioning cost: keep N prior multi-MB blobs, single rollback slot, or
  audit-metadata-only.
