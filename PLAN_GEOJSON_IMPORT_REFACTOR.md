# PLAN: GeoJSON Direct-Import Refactor (fix the AA3 freeze)

Status: proposed, not started. Authored 2026-06-16.
Owner: Tim. Related: [PLAN_TODO_TRACKER.md](PLAN_TODO_TRACKER.md) §1 (GeoJSON direct-import freeze).

## 1. Problem (measured, not guessed)

Importing admin-area boundaries from DHIS2 ("direct import") freezes at the **admin-3 level** for large countries (Cameroon, DRC). Measured against the live Cameroon DHIS2 (`dhis-minsante-cm.org`, dhis2 level 3):

- **200** district features (not thousands) — so it is **not** a feature-count or client-render problem.
- **20.4 MB** payload for those 200 polygons (~100 KB each — full-resolution boundaries).
- **~43 seconds** just to fetch from DHIS2.

The server fetches that 20 MB inside a **60 s** budget ([`fetch_geojson.ts:5`](server/dhis2/goal4_geojson/fetch_geojson.ts#L5)) and then, *in the same request*, parses it and runs `buildDhis2Context` (extra DHIS2 calls). Total time exceeds the budget → timeout/freeze. AA4 (more units) is worse, and DHIS2 latency is variable. This is a **geometry-payload cliff in the analyze step.**

### The key insight

The interactive **analyze / matching** step needs only feature **properties** (names) to let the user map DHIS2 areas → admin areas. **It never needs the polygon geometry.** Geometry is only needed at **save**, when we store the processed boundaries. So we should stop pulling 20 MB of geometry during the interactive step.

## 2. Goal / non-goals

**Goal:** the analyze step is fast for any level/country; the heavy geometry fetch happens only at save, in a context that can tolerate it (long timeout + progress), so AA3/AA4 imports complete instead of freezing.

**Non-goals (this plan):** changing the matching UX, the file-upload import path (already fast — local disk), or the rendered-map sizing. Polygon simplification is included as an *optional* later phase, not required for the fix.

## 3. Current architecture (accurate)

DHIS2 direct-import is a 5-step wizard ([client/src/components/instance_geojson/geojson_upload_wizard/](client/src/components/instance_geojson/geojson_upload_wizard/)):

- **Step 1** ([step_1_dhis2.tsx](client/src/components/instance_geojson/geojson_upload_wizard/step_1_dhis2.tsx)): connect, list dhis2 levels + org-unit counts.
- **Step 2** ([step_2.tsx](client/src/components/instance_geojson/geojson_upload_wizard/step_2.tsx)): pick admin level + dhis2 level → **"Fetch & analyze"** calls `dhis2AnalyzeGeoJson`. **← the freeze.**
- **Step 3** ([step_3.tsx](client/src/components/instance_geojson/geojson_upload_wizard/step_3.tsx)): map each property value → admin area.
- **Step 4** ([step_4.tsx](client/src/components/instance_geojson/geojson_upload_wizard/step_4.tsx)): **"Save"** calls `dhis2SaveGeoJsonMap`.

Server ([server/routes/instance/geojson_maps.ts](server/routes/instance/geojson_maps.ts)):

- **`dhis2AnalyzeGeoJson`** (`:262`): `fetchOrgUnitsGeoJsonForLevel` (the 20 MB geojson) → `buildDhis2Context` (parent-name lookups) → cache the whole `featureCollection` → derive `properties`/`sampleValues` from `feature.properties` → return `{ properties, sampleValues, featureCount, nullGeometryCount, dhis2Features }`.
- **`dhis2SaveGeoJsonMap`** (`:351`): reuse the cached `featureCollection` (or re-fetch if the 15-min cache expired) → `processGeoJsonFromDhis2` (strip to `{ area_id, source_name }` + geometry) → `saveGeoJsonMap` to the `geojson_maps` table.

Supporting facts that shape the fix:

- [`build_dhis2_context.ts`](server/dhis2/goal4_geojson/build_dhis2_context.ts): reads only `uid/name/code/parent` from `feature.properties` and **skips null-geometry features** — it never touches coordinates. So context can be built from a geometry-less fetch.
- [`process_geojson.ts:93`](server/geojson/process_geojson.ts#L93) `processGeoJsonFromDhis2`: needs `feature.geometry` + `feature.properties[areaMatchProp]`. So **save** genuinely needs geometry.
- [`session_cache.ts`](server/dhis2/goal4_geojson/session_cache.ts): in-memory, keyed `url|user|pass|level`, 15-min TTL, **max 10 entries**. Today each entry holds a full ~20 MB `featureCollection` → up to ~200 MB resident.
- Timeouts: client allows **5 min** by default ([try_catch_server.ts:35](client/src/server_actions/try_catch_server.ts#L35), per-route `timeoutMs` override); `base_fetcher` default **120 s** ([base_fetcher.ts:68](server/dhis2/common/base_fetcher.ts#L68)); but `fetch_geojson.ts` **overrides to 60 s**.

## 4. Proposed design

Split the two fetches by what each step actually needs.

### Analyze = metadata only (fast)

Replace the geojson fetch in `dhis2AnalyzeGeoJson` with a **geometry-less** org-unit fetch:

```
GET /api/organisationUnits.json?level=N&fields=id,name,code,parent[id],featureType&paging=false
```

- Tiny payload (ids + names + parent + a geometry-type enum) — no coordinates.
- `featureType` ∈ {NONE, POINT, POLYGON, MULTI_POLYGON, …}: non-`NONE` ⇒ has geometry. Use it for `featureCount` / `nullGeometryCount`.
- `name`/`code` become the matchable properties; build `properties`/`sampleValues` from them.
- Feed the same `id/name/code/parentUid` into `buildDhis2Context` (refactored to accept the meta list instead of a `featureCollection`) → unchanged `dhis2Features` output.
- **Response shape is unchanged** → step 2/3/4 need no changes to consume it.

Cache the **light** result (small) for re-runs.

### Save = geometry, with room to breathe

`dhis2SaveGeoJsonMap` fetches the full geojson **at save time**:

```
GET /api/organisationUnits.geojson?level=N        // the ~20 MB, ~43 s fetch
```

- Give this its own generous timeout (see §6).
- `processGeoJsonFromDhis2` → `saveGeoJsonMap` (unchanged).
- This is a deliberate, one-time button press, so a ~minute with a progress indicator is acceptable — versus freezing the interactive step.

### Why this fixes it

The slow 20 MB fetch moves out of the interactive analyze step (which previously timed out before the user ever reached the matching UI) into the explicit Save action, where a long timeout is appropriate. The matching UI becomes instant regardless of level/country.

## 5. Detailed changes

**Server — DHIS2 fetch layer** ([server/dhis2/goal4_geojson/](server/dhis2/goal4_geojson/)):

- `fetch_geojson.ts`: add `fetchOrgUnitsMetaForLevel(creds, level)` returning `{ id, name, code, parentUid, hasGeometry }[]` via the `.json?fields=…featureType` call. Keep `fetchOrgUnitsGeoJsonForLevel` for save; raise its timeout (§6).
- `build_dhis2_context.ts`: refactor `buildDhis2Context` to take the meta list (it already only uses `uid/name/code/parent`). Parent-name batching unchanged.
- `session_cache.ts` + `types.ts`: change the cached payload from the heavy `featureCollection` to the light analyze result (`{ properties, sampleValues, featureCount, nullGeometryCount, dhis2Features }`). Drop the 20 MB from cache entirely. (Optionally cache the heavy geojson separately with a **small** limit, e.g. 1–2 entries, only to make a retried Save fast — but default to no heavy cache.)

**Server — routes** ([server/routes/instance/geojson_maps.ts](server/routes/instance/geojson_maps.ts)):

- `dhis2AnalyzeGeoJson` (`:262`): call the new meta fetch; build `properties`/`sampleValues`/counts from meta; cache light.
- `dhis2SaveGeoJsonMap` (`:351`): fetch the heavy geojson here (not from the analyze cache); `processGeoJsonFromDhis2` → save. (Optional: simplify before save — Phase 2.)

**Contract** ([lib/api-routes/instance/geojson_maps.ts](lib/api-routes/instance/geojson_maps.ts)): response/body shapes are unchanged. If we set an explicit longer `timeoutMs` for `dhis2SaveGeoJsonMap`, add it on that route entry.

**Client** ([step_2.tsx](client/src/components/instance_geojson/geojson_upload_wizard/step_2.tsx), [step_4.tsx](client/src/components/instance_geojson/geojson_upload_wizard/step_4.tsx)):

- Step 2: no logic change (response shape identical). It's just fast now.
- Step 4: Save now takes ~tens of seconds. The button already shows a loading state via `createFormAction`; add a sub-message like *"Fetching boundaries from DHIS2 — this can take a minute for district level."* Confirm the route's client `timeoutMs` is ≥ the server save budget (default 5 min already covers it).

## 6. Timeouts

- Raise `fetch_geojson.ts` `FETCH_TIMEOUT` from **60 s → 180 s** (or drop the override and pass an explicit 180 s) so the heavy save fetch can complete (43 s measured, with headroom for slow days / AA4).
- Keep analyze on a short timeout (it's tiny now) so a bad connection fails fast.
- Client: default 5-min request timeout already covers save; set an explicit `timeoutMs` on `dhis2SaveGeoJsonMap` only if we want it tighter.

## 7. Phasing

- **Phase 0 — interim unblock (optional, ship first):** raise `fetch_geojson.ts` timeout to 180 s with no other change. The 43 s Cameroon AA3 fetch then likely *completes* during analyze. Cheap; buys time. Fragile for AA4 and slow days — not the real fix.
- **Phase 1 — the split (this plan):** metadata-only analyze + geometry-only save. Fixes the freeze structurally.
- **Phase 2 — polygon simplification (optional perf):** simplify boundaries before storing (e.g. Douglas–Peucker, implemented inline per the no-new-dependency rule; tolerance tunable). Cuts the stored 20 MB several-fold → smaller DB rows, faster map render, faster `getGeoJsonForLevel`. Lossy (less precise borders) → make it tunable/optional. Also check whether DHIS2 supports a precision/`coordinatesOnly` knob to shrink the fetch itself.
- **Phase 3 — worker routine + SSE progress (optional, for the largest levels):** if AA4 in big countries still strains a single request, move the save fetch+process into a background worker routine with SSE progress (the pattern already used for imports), so the HTTP request returns immediately and the client watches progress.

## 8. Risks & edge cases

- **Matchable-property set changes.** Analyze currently exposes *whatever keys appear in the geojson properties*; the meta fetch exposes a fixed set (`name`, `code`). DHIS2 org units have a fixed schema and matching is realistically on `name`, so this is acceptable — but **default to `name`** and only offer `code` if it's present in *both* the meta fetch and the heavy geojson `feature.properties` (verify; some DHIS2 versions omit `code` from geojson properties). Mismatched keys would make `areaMatchProp` resolve to nothing at save.
- **`featureType` vs actual geometry.** We treat non-`NONE` as "has geometry." Verify against a sample that `featureType` reliably reflects stored boundaries for these instances; if not, fall back to the heavy fetch's null-geometry count at save.
- **Parent key shape.** Geojson nests `parent` as a uid string in `feature.properties`; the `.json` fetch returns `parent[id]`. Normalize both to `parentUid` so `buildDhis2Context` is consistent.
- **Save is now the slow step.** Previously "instant" (reused analyze's cache); now ~tens of seconds. Mitigated by the progress message + long timeout; Phase 3 removes it from the request path entirely.
- **Cache memory.** Dropping the 20 MB from the analyze cache is a strict improvement (was up to ~200 MB resident).
- **AA4 scale.** A facility-level geojson could be far larger than 20 MB. Phase 1 + a 180 s timeout may still not be enough → Phase 3. Note this limit explicitly to the user; don't claim AA4 is solved by Phase 1 alone.

## 9. Verification (fix + measure, no guessing)

- Re-measure with the provided Cameroon/DRC creds: the new **meta** fetch size + time for AA3/AA4 (expect KBs / sub-second), confirming analyze is fast.
- End-to-end against Cameroon AA3: analyze (fast) → map → save (heavy fetch completes within the raised timeout) → boundaries stored → map renders.
- Confirm `name`-based matching still maps correctly (the heavy geojson `feature.properties.name` matches the meta `name`).
- Typecheck server + client; no DB migration required (table shape unchanged).

## 10. Rollout

- No migration. Server + client change, then deploy. The interim timeout bump (Phase 0) could ship immediately if Cameroon/DRC maps are wanted before the full refactor lands (Angelica flagged the issue **not urgent**).

## 11. Open questions for Tim

1. Phase 0 interim timeout bump now, or go straight to Phase 1?
2. Include Phase 2 (simplification) in the first pass, or defer? (Affects map render perf + DB size, not the freeze.)
3. Is AA4 (facility boundaries) actually a target for these countries, or is AA2/AA3 enough? (Determines whether Phase 3 is needed.)
