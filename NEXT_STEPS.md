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
- **N1 lives here** — do NOT fix N1 standalone (the S9 review's Tier-0 ruling;
  see [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) Open items)
  or you re-cement the instance coupling the snapshot work removes.

### 2. Geojson near-term fixes — DONE 2026-07-06, plan retired

Shipped (`805f6b15`, `e3cac93d`, `14790e39`): metadata-only analyze, heavy
fetch at save with guards, save-side coverage counts, 100 MB parse cap — all
live-verified against Cameroon/DRC. The plan doc is deleted; its remainders
moved to their homes: **WS2 render-side coverage + typed sentinel + Half B →
[PLAN_GEOJSON_SNAPSHOT.md](PLAN_GEOJSON_SNAPSHOT.md) WS-COVERAGE** (item 7's
backfill gate); **WS7 policy items → SYSTEM_04/SYSTEM_05 Open items**
(upload caps need a per-file-type ruling; sessionStorage password store;
temp sweep). Comms to Angelica after deploy: AA3 fixed, AA4 follows in
item 7, and the import runs one level per run.

---

## Track B — shovel-ready cleanups (independent, slot in anytime)

### 3. S9 query/cache fixes — DONE 2026-07-06

Landed as focused commits (`ce33e3f7…381f6698`): F1, F5, F6, F7, N2–N5, plus
the month-filter type fix, replicant relative-period-filter resolution, and
error-status alignment (PO_CACHE_VERSION → "4"). The plan doc is deleted;
remaining items live in [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md)
Open items: **F8a still held** pending Ethiopian fiscal-quarter confirmation;
N1 → item 1; F8c deferred.

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

**Before item 7 (GEOJSON_SNAPSHOT — the largest cost decision in the set):**
- The typed-sentinel shape (WS-COVERAGE — the DHIS2 API gates, coverage policy,
  and AA4 deferral were all settled 2026-07-06; facts recorded in the plan's
  "Verified DHIS2 API facts" section).
- Match-key migration appetite: full snapshot-local-id model (migration + backfill +
  transform every stored snapshot) vs cheaper interim parent-qualified name.
- Geojson storage shape: per-figure embed vs project-level `geojson_by_level` table.
- Versioning cost: keep N prior multi-MB blobs, single rollback slot, or
  audit-metadata-only.
