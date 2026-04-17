# Plan: Consolidate legacy adapters

## Status: READY TO REVIEW

## Goal

Pull every legacy/adaptation mechanism into one location (`lib/legacy/`) and wire adaptation at a single boundary per read flow — the service-layer function — so DB and cache paths share one adapter call.

## Background

Current state:

- Pattern 1 adapters live in `server/db/project/`:
  - `legacy_report_adapter.ts` (report item configs)
  - `legacy_po_config_adapter.ts` (PO configs + vizPresets)
- Pattern 2 inline adapters scattered:
  - `lib/get_fetch_config_from_po.ts:88` — `last_12_months` → `last_n_months`
  - `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx:26` — periodOption realignment
- Pattern 3 adapters (diffAreas flag) scattered across five files with `// Legacy adapter` comments. Out of scope — handled when we later pay down that debt.

Two architectural questions settled:

1. **Client adapters not needed.** Client busts IndexedDB on server-version change ([LoggedInWrapper.tsx:99-114](client/src/components/LoggedInWrapper.tsx#L99)). Every deploy → every client clean. Only server-side adaptation needed.
2. **Adapter at service-layer boundary, not inside cache or DB-read.** Cache class stays generic. DB-read functions return raw. Service-layer function unions cache + DB and adapts once on exit. Covers both cache hits (pre-deploy stale shape) and DB reads (DB-stored stale shape) uniformly. Relies on adapter idempotence, which our adapters have by construction.

## Design

### New folder structure

```
lib/
  legacy/
    po_config.ts          # adaptLegacyPresentationObjectConfig, adaptLegacyVizPresets
    report_item.ts        # adaptLegacyReportItemConfigShape (pure parts only)
    mod.ts                # barrel export

server/db/project/
  legacy_report_adapter.ts  # remains — wraps the pure lib adapter + adds DB lookup
                            # rename to legacy_report_db_lookups.ts to clarify role
```

### Split rule for adapters that need DB access

[legacy_report_adapter.ts](server/db/project/legacy_report_adapter.ts) has two kinds of work:

1. **Pure shape transforms** — 2D array → LayoutNode tree; placeholder → text. Move to `lib/legacy/report_item.ts`.
2. **DB-dependent transforms** — moduleId → metricId lookup via `projectDb`. Stays in `server/db/project/`, now called from the outer service layer instead of inside the adapter.

This also makes `lib/legacy/*` pure functions — callable from client if ever needed, and test-friendly in isolation.

### Pattern 2 consolidation

Move the two inline adapters into `lib/legacy/`:

- `lib/legacy/period_filter.ts` — `adaptLegacyPeriodFilter` (absorbs `last_12_months` rewrite + periodOption-realignment logic). Called from inside `adaptLegacyPresentationObjectConfig` so PO configs get normalized in one pass at read time; removes the need for the existing inline shims in `get_fetch_config_from_po.ts` and `_2_filters.tsx`.

After consolidation, those two inline shim sites are deleted and the adapter covers their cases via the PO config read path.

### Service-layer wiring

Adapter moves out of DB-read functions, into the service functions that return entities to the outside world.

Audit all read flows for entities with legacy-adapted shapes:

- `getPresentationObjectDetail` — cache + DB → single adapter call on return.
- `getPresentationObjectsForModule` — loop adapts per row; acceptable since no per-PO Valkey cache here (list is cached at a coarser level).
- `getAllPresentationObjectsForProject` — same.
- `getPresentationObjectsWithDependencies` (the line 493 site) — same.
- `batchUpdatePresentationObjectsPeriodFilter` internal read + write — adapter on read before merging new filter.
- Metric reads (`vizPresets`) — adapter inside the metrics-list service function.
- Report reads — adapter at service-layer return (after cache + DB).

DB-read helpers return raw. Service functions adapt on exit. `parseJsonOrThrow<T>` keeps the type assertion but doesn't claim normalization anymore.

## Changes

### Part A — Create `lib/legacy/` and move pure transforms

**A1.** Create `lib/legacy/po_config.ts`. Move the contents of [server/db/project/legacy_po_config_adapter.ts](server/db/project/legacy_po_config_adapter.ts) verbatim.

**A2.** Create `lib/legacy/report_item.ts`. Move the pure parts of [legacy_report_adapter.ts](server/db/project/legacy_report_adapter.ts):
- Layout 2D → tree transform
- Placeholder → text transform
- **Export** a function that does just those: `adaptLegacyReportItemConfigShape(raw: unknown): ReportItemConfig`.

**A3.** Keep the DB-lookup piece (moduleId → metricId) on the server. Rename the remaining file to `server/db/project/resolve_legacy_report_fks.ts` with a narrower signature: `resolveLegacyReportMetricIds(config: ReportItemConfig, projectDb: Sql): Promise<ReportItemConfig>`. Call sites use both functions in sequence.

**A4.** Create `lib/legacy/period_filter.ts` with `adaptLegacyPeriodFilter(raw: unknown): PeriodFilter` — absorbs:
- `last_12_months` → `last_n_months` rewrite (currently in [get_fetch_config_from_po.ts:88](lib/get_fetch_config_from_po.ts#L88))
- Ensures `filterType` is defined (defaults to `"custom"` if missing on a bounded-looking filter)

Call it from inside `adaptLegacyPresentationObjectConfig` when normalizing `periodFilter`.

**A5.** Create `lib/legacy/mod.ts` barrel: `export * from "./po_config.ts"; export * from "./report_item.ts"; export * from "./period_filter.ts";`

**A6.** Update `lib/mod.ts` (or `lib/types/mod.ts` if that's the public surface) to export the legacy namespace.

### Part B — Rewire adapters at service-layer

**B1.** [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts) — remove `adaptLegacyPresentationObjectConfig` calls from the DB-read mapping code. Instead, wrap each service function so the adapter runs after either cache-hit or DB-read resolution.

Example pattern:
```ts
// service layer (in presentation_objects.ts OR a calling route handler)
async function getPresentationObjectDetailService(id, ...) {
  const cached = await _PO_DETAIL_CACHE.get(...);
  if (cached) return normalize(cached);
  const raw = await getPresentationObjectDetailFromDB(id);
  // cache.setPromise wraps fresh fetch internally; adapt on return
  await _PO_DETAIL_CACHE.setPromise(Promise.resolve(raw), ...);
  return normalize(raw);
}

function normalize(po: PresentationObjectDetail): PresentationObjectDetail {
  return { ...po, config: adaptLegacyPresentationObjectConfig(po.config) };
}
```

Repeat for all PO read flows (4 sites today).

**B2.** [server/db/project/modules.ts](server/db/project/modules.ts) — same pattern for `vizPresets`. Currently `adaptLegacyVizPresets` runs at `parseJsonOrThrow` site. Move to the service-function return point.

**B3.** [server/db/project/reports.ts](server/db/project/reports.ts) — replace `adaptLegacyReportItemConfig(config, projectDb)` with:
```ts
const shapeAdapted = adaptLegacyReportItemConfigShape(rawConfig);
const resolved = await resolveLegacyReportMetricIds(shapeAdapted, projectDb);
```
Call at the service-layer return points (not buried in DB helpers).

### Part C — Kill Pattern 2 inline shims

**C1.** [lib/get_fetch_config_from_po.ts:88-95](lib/get_fetch_config_from_po.ts#L88) — the inline `last_12_months` rewrite is now dead code because `adaptLegacyPeriodFilter` normalizes it upstream in the PO config adapter. Delete.

**C2.** [client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx:26-44](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L26) — the `reconcilePeriodFilterWithBounds` function handles periodOption/data-column mismatch. This is a DIFFERENT concern from legacy adaptation — it's runtime alignment between the stored filter and the actual data bounds (which can legitimately differ; e.g., user set a quarter filter then the data refreshed). Keep as-is, but document clearly that it's runtime alignment, NOT legacy migration.

### Part D — Update DOC

**D1.** Update [DOC_legacy_handling.md](DOC_legacy_handling.md):
- Point Pattern 1 section at `lib/legacy/` as the canonical location.
- Remove the "Planned adapter" note (now done).
- Add a section: "Where to wire adapters" — service-layer, not DB-read, not cache-internal. Explain why (cache+DB uniformity; cache class genericity; idempotence assumption).
- Update Pattern 2 section to note: `last_12_months` has been folded into Pattern 1. `resolvePeriodFilter` in `_2_filters.tsx` is NOT a legacy adapter — it's a runtime data/filter alignment concern.

## Testing

1. `deno task typecheck` passes after each part.
2. Smoke: open existing project with old-shape stored data, verify POs render; reinstall a module and verify new shape in DB.
3. Deploy test (if possible in staging): deploy with some Valkey entries still containing pre-deploy shape, verify reads adapt them.

## Out of scope

- Pattern 3 `diffAreas` cleanup — tracked separately in the debt table.
- Client-side adapter infrastructure — not needed (client busts on server version).

## Risks

- Missing a service-layer wiring site → DB returns unadapted → old shape leaks through. Mitigation: grep for every PO/report/metric DB-read helper and ensure each is either (a) called only through a service function that adapts, or (b) removed.
- Accidentally double-adapting in a service that calls another service. Idempotence means this is safe but wasteful. Mitigation: run adapter at the outermost service-layer boundary only; internal helpers leave shape raw.
