# Plan: Direct GeoJSON import from DHIS2

## Status: DRAFT (review carefully — several design decisions below need sign-off before implementing)

## Goal

Add a second import path for admin-area maps — "Direct from DHIS2" — alongside the existing manual "upload + map" flow. The user enters DHIS2 credentials (same shape as other DHIS2 pathways), the server pulls the org-unit GeoJSON in one call, the user maps DHIS2 org-unit levels to AA2/AA3/AA4, and the server splits and stores three per-level GeoJSON documents into the existing `geojson_maps` table. The existing manual wizard stays as-is.

## Why this is cheap to build

- DHIS2 exposes a single endpoint that returns org-unit geometries as GeoJSON (see below).
- We already import the admin-area **backbone** from DHIS2 via [structure_import](client/src/components/structure_import/), so the org-unit names the user has in the system almost certainly match the `properties.name` values DHIS2 returns for the same org units.
- The existing storage model (`geojson_maps` keyed by `admin_area_level ∈ {2,3,4}`) accepts a stringified GeoJSON per level — we just fill three rows from one DHIS2 call. No schema change.
- The existing manual mapping UI (string-to-string mapping of a GeoJSON property value → admin-area name) works unchanged; the DHIS2 flow just pre-populates it from `properties.name`.

## DHIS2 API reference (what we'll call)

### Endpoint

```
GET {dhis2BaseUrl}/api/organisationUnits.geojson
Authorization: Basic base64(username:password)
Accept: application/json+geojson      # or .geojson extension (equivalent)
```

### Query parameters

- `level` — org-unit hierarchy level. Defaults to 1 (country). **Repeatable.** We will pass three (`level=<aa2Level>&level=<aa3Level>&level=<aa4Level>`) in a single call.
- `parent` — limit to descendants of a given org-unit uid. Defaults to root. Repeatable. We probably don't need this (backbone import already scoped the instance to one country); leave it unset unless the user has configured a non-default root.

### Response shape

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "O6uvpzGd5pu",          // org-unit uid
      "geometry": { "type": "MultiPolygon", "coordinates": [...] },
      "properties": {
        "name": "Bo",
        "code": "OU_197385",
        "level": 2,                  // ← this is the hook we use to split by level
        "parent": "ImspTQPwCqd"      // parent org-unit uid
        // may also include: id, groups, shortName, etc.
      }
    },
    ...
  ]
}
```

CRS is always EPSG:4326 (longitude, latitude — east/west first). Only org units that have stored geometry in DHIS2 will appear. Auth is HTTP Basic (same as the rest of our DHIS2 flows — see [server/dhis2/common/base_fetcher.ts](server/dhis2/common/base_fetcher.ts) `createAuthHeader`).

### Things to verify on a real DHIS2 instance before cutting code

1. That `properties.level` is present on every feature (some older DHIS2 builds name it differently). If not, we split by doing a second call per level.
2. That `properties.name` is present and matches the `name` field the structure-import backbone writes into `admin_areas_{level}`. Historical risk: DHIS2 sometimes returns `shortName` instead; worth logging both.
3. That the endpoint returns features for every org unit the instance cares about — some DHIS2 orgs have geometry only on leaf facilities, not on area polygons. If mid-level polygons are missing, the import is useless for those levels; we need a user-facing warning ("level 3: 0 features have geometry").
4. Coordinate-winding / size: the raw DHIS2 response for a country can be tens of MB at level-4. Confirm we can stream/parse within our current request size limits.

## Current state of the GeoJSON subsystem (what we're integrating with)

### DB

[server/db/instance/_main_database.sql:401-405](server/db/instance/_main_database.sql#L401)

```sql
CREATE TABLE geojson_maps (
  admin_area_level integer PRIMARY KEY CHECK (admin_area_level IN (2,3,4)),
  geojson text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
```

One row per AA level. Stored as stringified GeoJSON whose features have a single `area_id` property (the mapped admin-area name). DB access: [server/db/instance/geojson_maps.ts](server/db/instance/geojson_maps.ts).

### Server routes

[server/routes/instance/geojson_maps.ts](server/routes/instance/geojson_maps.ts):
- `analyzeGeoJsonUpload` — pulls an asset file, returns `{properties, sampleValues, featureCount}`.
- `saveGeoJsonMap` — reads asset, calls `processGeoJson` (filter + rewrite to `area_id`-only properties), saves.
- `getAdminAreaNamesForLevel`, `getGeoJsonForLevel`, `deleteGeoJsonMap`, `getGeoJsonMaps`.

Core processing: [server/geojson/process_geojson.ts](server/geojson/process_geojson.ts) — `analyzeGeoJson` / `processGeoJson`.

### Client wizard (manual)

[client/src/components/instance_geojson/geojson_upload_wizard.tsx](client/src/components/instance_geojson/geojson_upload_wizard.tsx) — 4-step wizard: file → configure (level, match-prop) → map (GeoJSON value ↔ AA name) → confirm.

Manager: [client/src/components/instance_geojson/geojson_manager.tsx](client/src/components/instance_geojson/geojson_manager.tsx).

### Existing DHIS2 infrastructure we will reuse

- `Dhis2Credentials` — `{url, username, password}` — [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts).
- `fetchFromDHIS2`, `createAuthHeader`, `buildUrl` — [server/dhis2/common/base_fetcher.ts](server/dhis2/common/base_fetcher.ts).
- `testDHIS2Connection` — reuse for the credentials step.
- Credentials UI: [client/src/components/structure_import/step_1_dhis2.tsx](client/src/components/structure_import/step_1_dhis2.tsx) — pattern to copy (session-persistence optional).
- Org-unit levels metadata fetch: `structureStep2Dhis2_GetOrgUnitsMetadata` in [server/routes/instance/structure.ts](server/routes/instance/structure.ts) (lines 296-336) — we'll want the same list of `{level, name}` pairs so the user can pick which DHIS2 level is AA2/AA3/AA4.

## Design

### Overall flow (3-step wizard)

**Step 1 — Credentials.** Reuse the existing `step_1_dhis2.tsx` component (or lift it into a shared location). Validate via `testDHIS2Connection`. Allow optional session-storage persistence (same as structure import).

**Step 2 — Level mapping.** Fetch DHIS2 org-unit levels metadata (reuse existing route). Show three `Select` inputs: "DHIS2 level for AA2", "... AA3", "... AA4". Pre-fill defaults if the structure import has been run (we can look up what levels structure-import mapped — see open question below).

**Step 3 — Fetch + auto-map + confirm.** Server fetches the GeoJSON in one call (all three DHIS2 levels), splits by `properties.level` into three FeatureCollections, and for each level:
- runs the same `analyzeGeoJson` to surface sample property values,
- auto-maps `properties.name` → AA name by case-insensitive exact match (same algorithm as the manual wizard),
- returns three per-level summaries: `{level, featureCount, matched, unmatched[], ambiguous[]}`.

Client shows all three at once. If everything is 100% auto-matched, the user clicks "Save" and we're done. If anything is unmatched, either (a) let them manually correct each level with the same mapping UI as the manual wizard, or (b) show the unmatched names and abort with an error telling them to fix names at source. **Decision needed** — see open questions.

On save, the server writes three rows to `geojson_maps` (one per level) using the existing `saveGeoJsonMap` logic (feature filtering + rewrite to `area_id`-only properties).

### Alternative: merge into the existing wizard

Instead of a new wizard, add a "Source" choice as a new Step 0 in the existing wizard ("Upload file" vs "From DHIS2"). This mirrors how structure-import handles CSV-vs-DHIS2. **Leaning toward a separate `GeoJsonDhis2Wizard` component** because the steps are quite different (one multi-level fetch vs per-level upload), and wedging both into one `createSignal<1|2|3|4>()` makes the component hard to read. But both are defensible.

### New API routes (in [lib/api-routes/instance/geojson_maps.ts](lib/api-routes/instance/geojson_maps.ts))

```ts
dhis2TestConnectionForGeoJson: route({
  path: "/geojson-maps/dhis2/test",
  method: "POST",
  body: {} as Dhis2Credentials,
  response: {} as { ok: boolean; version?: string },
});

dhis2GetOrgUnitLevels: route({
  path: "/geojson-maps/dhis2/levels",
  method: "POST",                                 // POST because body carries credentials
  body: {} as Dhis2Credentials,
  response: {} as { levels: { level: number; name: string; count: number }[] },
});

dhis2FetchAndAnalyzeGeoJson: route({
  path: "/geojson-maps/dhis2/analyze",
  method: "POST",
  body: {} as Dhis2Credentials & {
    dhis2LevelForAa2: number;
    dhis2LevelForAa3: number;
    dhis2LevelForAa4: number;
  },
  response: {} as {
    perLevel: Array<{
      adminAreaLevel: 2 | 3 | 4;
      dhis2Level: number;
      featureCount: number;
      // prefilled mapping: AA name → DHIS2 feature.properties.name that matched it
      autoMapping: Record<string, string>;
      unmappedGeoNames: string[];
      unmappedAdminNames: string[];
    }>;
    // Server stashes the fetched+split GeoJSONs under a short-lived token
    // so Save doesn't have to re-fetch from DHIS2.
    stagingToken: string;
  },
});

dhis2SaveGeoJsonFromStaging: route({
  path: "/geojson-maps/dhis2/save",
  method: "POST",
  body: {} as {
    stagingToken: string;
    overrides: Array<{ adminAreaLevel: 2|3|4; areaMapping: Record<string,string> }>;
  },
});
```

**Why a staging token** — the DHIS2 fetch can be big and slow, and we don't want the browser to shuttle tens of MB of GeoJSON through the user's machine just to send it back for save. The server holds the fetched-and-split GeoJSON in memory (or in the `assets/` sandbox dir) between "analyze" and "save". 15-minute TTL is plenty.

**Alternative, simpler**: always auto-map on the server, bail if any AA is unmapped, and save in one shot. Re-fetch from DHIS2 on retry. This removes the staging-token complexity at the cost of re-downloading the GeoJSON if the user re-clicks. Defensible for MVP.

### Server-side split logic

```ts
// server/geojson/split_geojson_by_level.ts  (new file)
function splitFeaturesByLevel(
  fc: FeatureCollection,
  levelMap: { aa2: number; aa3: number; aa4: number },
): { 2: FeatureCollection; 3: FeatureCollection; 4: FeatureCollection };
```

Reads `feature.properties.level` (verify this field exists — see "things to verify" above). If it's missing or unreliable, fall back to three separate DHIS2 calls (one per level).

### Auto-mapping

Same algorithm as [geojson_upload_wizard.tsx:100-112](client/src/components/instance_geojson/geojson_upload_wizard.tsx#L100): case-insensitive exact match of `properties.name` against `admin_areas_{level}.admin_area_{level}` names. If there's strong demand for fuzzy matching (levenshtein, token-based), do that separately — not in v1.

One subtlety: multiple DHIS2 features can share the same `name` under different parents (e.g. two "Central" districts in different regions). At AA3/AA4 our primary key is composite `(admin_area_level, ..., admin_area_1)`, so names alone can be non-unique. **Design decision needed**: do we

- (a) match by name only and accept that ambiguous pairs produce wrong geometry for one of them (bad), or
- (b) match by the path `parent_name / name` using DHIS2's `parent` uid to walk back up the org-unit tree (correct but more code), or
- (c) match by DHIS2 org-unit uid against a new column on `admin_areas_{2,3,4}` storing the DHIS2 uid (best — but requires the structure import to persist DHIS2 uids, which it may not currently do).

I lean toward **(b) for v1** — it's server-side, doesn't require a schema change, and it's robust. Do (c) later if we want perfect fidelity.

### UI location

Add a second button to [geojson_manager.tsx](client/src/components/instance_geojson/geojson_manager.tsx) next to "Upload GeoJSON": "Import from DHIS2". Opens the new wizard.

## Changes (file-by-file)

### Part A — DHIS2 fetcher module

**A1.** [server/dhis2/goal4_geojson/fetch_geojson.ts](server/dhis2/goal4_geojson/fetch_geojson.ts) — new. Single function `fetchOrgUnitsGeoJson(credentials, levels: number[]): Promise<FeatureCollection>`. Uses `fetchFromDHIS2`, passes repeated `level=` params, accepts `application/json+geojson`.

**A2.** [server/dhis2/goal4_geojson/split_by_level.ts](server/dhis2/goal4_geojson/split_by_level.ts) — new. Splits a FeatureCollection into per-level buckets using `feature.properties.level`.

**A3.** Optional: `fetchOrgUnitLevels(credentials)` wrapper — but the existing `structureStep2Dhis2_GetOrgUnitsMetadata` route may already return what we need. Audit before duplicating.

### Part B — New routes

**B1.** [lib/api-routes/instance/geojson_maps.ts](lib/api-routes/instance/geojson_maps.ts) — add the four routes listed in "New API routes" above.

**B2.** [server/routes/instance/geojson_maps.ts](server/routes/instance/geojson_maps.ts) — implement the four handlers. Handler for `dhis2FetchAndAnalyzeGeoJson` does: fetch → split → auto-map per level → stash → return summaries. Handler for `dhis2SaveGeoJsonFromStaging` does: read stash → apply overrides → run `processGeoJson` per level → write three `geojson_maps` rows → invalidate cache.

**B3.** Staging store. Two options:
- In-memory `Map<token, {level2, level3, level4}>` with 15-min TTL and size cap. Simple; lost on restart.
- Write three files to `ASSETS_DIR_PATH/_dhis2_geojson_staging/<token>/level_{2,3,4}.geojson`. Durable across restart; needs cleanup. Match the pattern we use elsewhere for large DHIS2 staging.

### Part C — Client wizard

**C1.** [client/src/components/instance_geojson/geojson_dhis2_wizard.tsx](client/src/components/instance_geojson/geojson_dhis2_wizard.tsx) — new component. Three steps (credentials, level selection, review-and-save). Reuse `step_1_dhis2.tsx` for the credentials UI or lift to a shared component if that fits.

**C2.** [client/src/components/instance_geojson/geojson_manager.tsx](client/src/components/instance_geojson/geojson_manager.tsx) — add a second "Import from DHIS2" button alongside "Upload GeoJSON".

**C3.** Reuse the per-level mapping UI from [geojson_upload_wizard.tsx](client/src/components/instance_geojson/geojson_upload_wizard.tsx) Step 3 for the "review auto-mapping" step — extract it into `geojson_level_mapping_table.tsx` if that makes it shareable.

### Part D — Types

**D1.** [lib/types/](lib/types/) — no new shapes needed for stored data (still `geojson_maps` rows). Wizard intermediate types can live in the wizard file.

### Part E — Docs / tests

**E1.** No user-facing docs to update unless there's an admin guide.

**E2.** Test plan: see "Testing" below.

## Things to verify before implementing

1. **Does the structure-import flow persist DHIS2 org-unit uids?** Check [server/server_only_funcs_importing/stage_structure_from_dhis2.ts](server/server_only_funcs_importing/stage_structure_from_dhis2.ts). If yes, the cleanest matching is uid↔uid and we can skip option (b) above. If no, we match by name-path. If adding a DHIS2-uid column is cheap, it unlocks much cleaner joins across structure/dataset/map pipelines — worth a separate conversation.

2. **Does DHIS2 always put `level` on `properties`?** Hit a real instance and look. If not, fall back to one call per level and assign the level from the request.

3. **Does `name` in DHIS2 always match `admin_area_{n}` in our DB?** Structure import is the mechanism that populates both, so in principle yes — but if structure import has normalization (trim, case-fold, dedupe), we need to apply the same to incoming GeoJSON names before matching.

4. **Ambiguous names across parents at AA3/AA4.** Decide between (a/b/c) above — don't skip this. A wrong-geometry bug here is very user-visible.

5. **Response size.** If a level-4 export for a real country is >50 MB, confirm our Deno/Hono request body handling can cope, and confirm the client doesn't need to see the raw blob (staging-token design avoids this).

6. **Features with null geometry.** DHIS2 may return a feature with `geometry: null` for org units where geometry isn't recorded. Drop these during split, but surface the count in the analyze response so the user knows.

7. **AA1 (country).** Do we ever want a country polygon? Current table allows only {2,3,4}. If yes, widens a check constraint. Not in scope for v1 unless needed.

8. **Existing session-stored DHIS2 credentials.** The HMIS/structure flows store credentials in a session table; do we share that session with the map importer, or require the user to re-enter? Share if possible — better UX and less credential handling.

9. **Permissions.** `can_configure_data` gates the existing routes. Same for the new DHIS2 ones.

10. **Cache invalidation.** `notifyInstanceGeoJsonMapsUpdated` is already called by `saveGeoJsonMap`. Make sure the DHIS2 save path also invalidates.

11. **i18n.** All user-visible strings need EN/FR via `t3({en,fr})`. Match the tone of the existing wizard.

12. **Is the DHIS2 GeoJSON endpoint available on all DHIS2 versions the instances use?** `.geojson` and `application/json+geojson` are in the mainline web-api docs for current versions. If we support DHIS2 ≤ 2.31 we need to verify.

## Testing

1. `deno task typecheck` passes.
2. Against a public DHIS2 demo (`https://play.dhis2.org/...`), end-to-end: credentials → level selection → analyze → save. Verify three `geojson_maps` rows are written and the existing map renderer displays them.
3. A DHIS2 instance where some level-3 org units have no geometry: verify analyze reports the count and save still works for the ones that do.
4. Ambiguous-name case (two AA3 with same name under different AA2): verify the chosen matching strategy produces correct geometry for both — not swapped.
5. Mismatched names case (user-entered backbone has extra spaces vs DHIS2): verify the unmapped list is shown and the user can either fix at source or manually correct.
6. Existing manual upload still works unchanged. Deleting a DHIS2-imported level behaves the same as deleting a manually imported one.
7. Staging token TTL: after 15 min, save request with stale token errors cleanly.
8. Big-country stress test (level-4 polygons for a country with ~15k org units at that level, if we can get one): confirm fetch + split + save complete in reasonable time and memory.

## Rollout ordering

1. Part A (DHIS2 fetcher + split) — self-contained, unit-testable with a sample response fixture.
2. Part B (routes + staging) — depends on A.
3. Part C (client wizard) — depends on B.
4. Part E (tests) — continuous.

Each part is mergeable independently as long as the UI doesn't expose the new flow until C3 lands.

## Open questions for review

- **Separate wizard component or merge into the existing one?** Leaning separate (simpler code); both defensible.
- **Staging token vs re-fetch on save?** Leaning staging token (faster UX, less DHIS2 load); re-fetch is simpler.
- **Name-path match vs add a `dhis2_uid` column to `admin_areas_{2,3,4}`?** Name-path is v1. Adding the column is cleaner but broader — worth a separate plan.
- **What to do when some AAs remain unmapped after auto-matching?** Options: (a) error and block save, (b) save with partial coverage and surface a warning, (c) allow manual mapping in the wizard (more work). I lean (c) to mirror the manual wizard's flexibility.
- **Do we want to store "source: dhis2 | upload" on `geojson_maps` for display?** Adds one nullable column; useful for admins to tell imports apart. Small change, but a schema change.
- **Credentials reuse across DHIS2 flows.** Worth unifying if not already — covered under structure-import work or a future shared plan.

## Sources (DHIS2 docs used to write this)

- [Geospatial features (2.32)](https://docs.dhis2.org/archive/en/2.32/developer/html/webapi_geospatial_features.html) — `.geojson` endpoint, `level` and `parent` params, response shape.
- [Geospatial features (master)](https://docs.dhis2.org/master/en/developer/html/webapi_geospatial_features.html) — same, current version.
- [GeoJSON import docs (dhis2-docs, master)](https://raw.githubusercontent.com/dhis2/dhis2-docs/master/src/developer/web-api/geo-json.md) — import side, useful for understanding the feature-id/properties-code/properties-name matching semantics DHIS2 uses.
- [Maps app docs (2.40)](https://docs.dhis2.org/en/use/user-guides/dhis-core-version-240/configuring-the-system/maps.html) — user-facing view of how DHIS2 itself uses org-unit geometries.
